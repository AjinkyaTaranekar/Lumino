"""
LiteLLM-based structured extraction service.

Uses LiteLLM's acompletion with JSON mode to enforce structured output.
The full Pydantic JSON schema is embedded in the system prompt and
response_format={"type": "json_object"} is used to guarantee valid JSON.

Model is configured via LLM_MODEL env var in LiteLLM format "provider/model".
Default: groq/llama-3.3-70b-versatile
"""

import asyncio
import json
import logging
import os
from typing import Optional

from litellm import acompletion

from models.schemas import UserProfileExtraction, JobPostingExtraction, JobImplicitSignals, SkillUsage
from models.taxonomies import SKILL_TAXONOMY, DOMAIN_TAXONOMY

logger = logging.getLogger(__name__)

# Pre-compute JSON schemas once at module load - included in every system prompt
# so the model knows exactly what structure to return.
_USER_SCHEMA = json.dumps(UserProfileExtraction.model_json_schema(), indent=2)
_JOB_SCHEMA = json.dumps(JobPostingExtraction.model_json_schema(), indent=2)
_JOB_IMPLICIT_SCHEMA = json.dumps(JobImplicitSignals.model_json_schema(), indent=2)


def _build_skill_taxonomy_hint() -> str:
    return "\n".join(
        f"  - {family}: {', '.join(skills[:6])}..."
        for family, skills in SKILL_TAXONOMY.items()
    )


def _build_domain_taxonomy_hint() -> str:
    return "\n".join(
        f"  - {family}: {', '.join(domains[:4])}..."
        for family, domains in DOMAIN_TAXONOMY.items()
    )


def _format_skill_match_details(details: list[dict] | None) -> str:
    """
    Format hybrid match details into a prompt section that explains to the LLM
    exactly how each skill was (or was not) matched and why.
    """
    if not details:
        return ""

    matched = [d for d in details if d.get("matched")]
    rejected = [d for d in details if not d.get("matched")]

    lines = ["\n\n═══ SKILL MATCHING TRACE (hybrid semantic + lexical) ═══"]

    if matched:
        lines.append("Confirmed matches:")
        for d in matched:
            method = d.get("match_method", "?")
            sem    = d.get("semantic_score", 0)
            lex    = d.get("lexical_score", 0)
            hyb    = d.get("hybrid_score", 0)
            imp    = d.get("importance", "")
            method_label = {
                "exact":    "exact name match",
                "strong":   "shared keywords in profile context",
                "inferred": "semantic only — no shared keywords, verify carefully",
            }.get(method, method)
            lines.append(
                f"  ✓ [{imp}] job:'{d['job_skill']}' ← user:'{d['user_skill']}'"
                f"  sem={sem:.2f} lex={lex:.2f} hybrid={hyb:.2f}  [{method_label}]"
            )

    if rejected:
        lines.append("Rejected candidates (below threshold):")
        for d in rejected:
            sem = d.get("semantic_score", 0)
            lex = d.get("lexical_score", 0)
            hyb = d.get("hybrid_score", 0)
            imp = d.get("importance", "")
            lines.append(
                f"  ✗ [{imp}] job:'{d['job_skill']}' ↔ user:'{d['user_skill']}'"
                f"  sem={sem:.2f} lex={lex:.2f} hybrid={hyb:.2f}  [rejected — too dissimilar]"
            )

    lines.append(
        "Note: sem=semantic similarity, lex=profile keyword overlap (both 0-1), hybrid=weighted combination. "
        "Levels — Exact: same name; Strong: shared keywords; Inferred: semantic only (treat with caution). "
        "Rejected: hybrid<0.70 (with overlap) or sem<0.88 (without overlap)."
    )
    return "\n".join(lines)


class LLMExtractionService:
    """
    Wraps LiteLLM for structured JSON extraction.

    Uses acompletion with response_format={"type": "json_object"} and a
    system prompt that includes the full Pydantic JSON schema. The response
    is parsed with model_validate_json() for strict Pydantic validation.

    The schema is passed in the system message so the model treats it as a
    hard constraint rather than a soft suggestion.
    """

    def __init__(self):
        self._model_name = os.environ.get("LLM_MODEL", "groq/llama-3.3-70b-versatile")
        self._skill_hint = _build_skill_taxonomy_hint()
        self._domain_hint = _build_domain_taxonomy_hint()
        self._temperature = self._resolve_temperature()
        logger.info(
            f"LLM extraction service initialized with model: {self._model_name} "
            f"(temperature={self._temperature})"
        )

    def _resolve_temperature(self) -> float:
        """
        Gemini 3+ models require temperature=1.0 — LiteLLM warns and may behave
        unpredictably at lower values. All other models use 0.1 for maximum
        determinism on structured JSON extraction.
        """
        name = self._model_name.lower()
        # Match gemini-3, gemini-3.x, gemini-3-flash-*, gemini-3-pro-*, etc.
        if "gemini-3" in name or "gemini-exp" in name:
            return 1.0
        return 0.1

    async def _call_with_retry(self, **kwargs) -> str:
        """Call LLM with exponential backoff (3 attempts: immediate, 1s, 2s).
        Automatically handles Anthropic models (no response_format support)."""
        from services.llm_utils import acompletion_json, is_anthropic

        model = kwargs.pop("model", self._model_name)
        messages = kwargs.pop("messages")
        temperature = kwargs.pop("temperature", self._temperature)
        # Drop response_format — acompletion_json handles it per-model
        kwargs.pop("response_format", None)

        for attempt in range(3):
            try:
                return await acompletion_json(model, messages, temperature, **kwargs)
            except Exception as e:
                if attempt == 2:
                    raise
                wait = 2 ** attempt
                logger.warning(f"LLM API error (attempt {attempt + 1}/3): {e}. Retrying in {wait}s")
                await asyncio.sleep(wait)

    async def extract_user_profile(self, profile_text: str) -> UserProfileExtraction:
        """
        Extract structured user profile from raw resume/profile text.

        Returns a validated UserProfileExtraction with skills, projects,
        domains, experiences, preferences, and problem-solving patterns.
        """
        system_msg = (
            "You are a senior engineering manager and technical recruiter conducting a rigorous, "
            "evidence-based analysis of a candidate profile. Your job is NOT to be flattering - "
            "it is to extract EVERY piece of structured data AND produce a brutally honest assessment "
            "of what this person can actually do versus what they merely claim.\n\n"
            "═══ WHAT TO EXTRACT - SCAN THE ENTIRE PROFILE FOR ALL OF THESE ═══\n\n"
            "SKILLS: Every technical skill, tool, framework, library, language, platform mentioned.\n"
            "  - Assess evidence_strength honestly: listed-only vs project-backed.\n"
            "  - context: if the skill appears in at least one project, write one sentence explaining\n"
            "    the candidate's strongest or most notable use of it. E.g. 'Built async ML inference\n"
            "    API in FastAPI serving 1M daily requests.' Leave null only if completely unconstrained.\n"
            "  - 'expert' requires multiple production project evidence.\n\n"
            "EXPERIENCES: Every work experience, internship, freelance, contract role.\n"
            "  - Extract concrete accomplishments with metrics where present.\n"
            "  - If vague, reflect that vagueness - do NOT invent specifics.\n\n"
            "PROJECTS: Every personal, academic, professional, open-source project.\n"
            "  - skills_demonstrated is MANDATORY and must be EXHAUSTIVE — list EVERY skill\n"
            "    from the global skills list that appears anywhere in the project text.\n"
            "  - For EACH skill in skills_demonstrated, you MUST fill in at minimum 'what' and 'how'.\n"
            "    Use the project description text as evidence. Do NOT leave them null unless\n"
            "    the text genuinely provides zero context.\n"
            "  - 5W+H: what=WHAT was built, how=HOW the skill was applied (patterns/techniques),\n"
            "    why=WHY chosen, scale=users/volume/team size, outcome=measurable result.\n"
            "  - context=one-sentence summary of the most important 5W+H signals combined.\n"
            "  - Capture contribution_type honestly.\n\n"
            "DOMAINS: Every industry, domain, or application area the person has worked in.\n"
            "  - description: 1-2 sentences on what the candidate has actually built/done in this domain.\n"
            "    E.g. 'Payment systems and PCI-DSS compliance — designed idempotent transaction flows.'\n\n"
            "EDUCATION: EVERY degree, diploma, certification program, bootcamp attended as a course.\n"
            "  - Include: degree type, field of study, institution, graduation year, GPA if stated,\n"
            "    honors (cum laude, dean's list, scholarships attached to degree), ongoing status.\n"
            "  - Do NOT miss minor degrees, ongoing programs, or exchange programs.\n\n"
            "CERTIFICATIONS: EVERY professional certification, license, credential, badge.\n"
            "  - Examples: AWS, Azure, GCP certs, PMP, CFA, Kubernetes (CKA), Google Analytics, etc.\n"
            "  - Include issuer, date, expiry if stated.\n\n"
            "ACHIEVEMENTS: EVERY award, prize, scholarship (standalone, not degree-linked), grant,\n"
            "  competition win/placement, hackathon result, honor, fellowship, recognition, employee award.\n"
            "  - Include impact/scale (e.g. 'national finalist', '1st out of 300 teams').\n\n"
            "PUBLICATIONS: EVERY research paper, thesis, dissertation, patent, conference talk/poster,\n"
            "  book chapter, published blog post, technical article, preprint.\n"
            "  - Include venue (journal/conference/platform), year, whether first-authored.\n\n"
            "COURSEWORK: Notable individual courses, MOOCs, online programs that strengthen the profile.\n"
            "  - Especially relevant if they list courses directly (e.g. 'Relevant Coursework: ...' section).\n"
            "  - Include provider and completion year if mentioned.\n\n"
            "LANGUAGES: Every spoken/written human language mentioned (NOT programming languages).\n"
            "  - Infer 'native' for the apparent native language if implied by context.\n\n"
            "VOLUNTEER WORK: Open source contributions, mentoring, nonprofit work, community involvement,\n"
            "  teaching assistant roles, organizing tech events, contributing to public repos.\n\n"
            "PREFERENCES: Any signals about preferred work style, remote/hybrid/onsite, company size,\n"
            "  role type, location, salary expectations.\n\n"
            "PATTERNS: Problem-solving or working style patterns observable across the profile\n"
            "  (e.g. 'data-driven', 'systems thinker', 'user-focused', 'performance-oriented').\n\n"
            "═══ CRITICAL ASSESSMENT ═══\n"
            "Think like a skeptical EM reading this before a hiring committee:\n"
            "  - What level is this person REALLY at (not what their title says)?\n"
            "  - Flag inflated skills (15+ technologies with no depth = red flag).\n"
            "  - overall_signal 'misleading' if claims are materially unsupported by evidence.\n\n"
            "═══ INTERPRETATION FLAGS - MANDATORY MINIMUM 5, TARGET 8-12 ═══\n"
            "You MUST generate AT LEAST 5 interpretation flags. For a typical profile, generate 8-12. "
            "These are shown to the user as verification questions to confirm your interpretation.\n\n"
            "MANDATORY CATEGORIES — cover ALL that apply:\n"
            "  A) SKILL LEVEL (at least 1 per top 3 evidenced skills): For each major skill where you\n"
            "     inferred the level from job titles/project context rather than explicit statement, flag it.\n"
            "     Even high-confidence inferences should be flagged — the user confirms, not guesses.\n"
            "  B) YEARS OF EXPERIENCE (at least 1): Flag every inferred duration calculated from date\n"
            "     ranges or overlapping roles. If you calculated '3 years' from dates, flag it.\n"
            "  C) CONTRIBUTION TYPE (1 per project using 'we/our/team/collaborated'): Flag any project\n"
            "     where the candidate's individual vs. team contribution is unclear. Were they the sole\n"
            "     engineer? Team lead? Senior contributor? Individual contributor?\n"
            "  D) CAREER IDENTITY (1 required): State your interpretation of who this person IS\n"
            "     professionally — their primary technical identity (e.g. 'backend engineer who gravitates\n"
            "     toward distributed systems'). Ask if this matches their self-perception.\n"
            "     Use field='Assessment:profile:career_identity', resolution_impact='important'.\n"
            "  E) DOMAIN DEPTH (at least 1): Flag any domain where depth was inferred from the employer's\n"
            "     industry rather than from explicit technical work described in the resume.\n"
            "  F) WORK PREFERENCE (at least 1): Flag any assumption about preferred company size, remote/\n"
            "     onsite preference, or team environment inferred from career history.\n"
            "  G) SENIORITY / LEVEL MISMATCH: If the job title and described responsibilities suggest\n"
            "     different seniority levels, flag it and ask what level they identify with.\n\n"
            "NEVER generate fewer than 5 flags. If the profile is clear and explicit, STILL generate\n"
            "flags for career identity, top skill level confirmation, and work preference — users\n"
            "must confirm your mental model of them, not just correct factual errors.\n\n"
            "The clarification_question MUST quote the actual resume text. Be specific and answerable.\n"
            "Use suggested_options for any question with discrete choices.\n\n"
            "═══ CANONICAL NAMING — MANDATORY ═══\n"
            "Always use the full, unambiguous canonical name for every entity. Never abbreviate.\n"
            "  Skills/Tools: 'JavaScript' not 'JS', 'TypeScript' not 'TS', 'PostgreSQL' not 'Postgres',\n"
            "    'Kubernetes' not 'K8s', 'Machine Learning' not 'ML' (when it's a skill, not a tool name)\n"
            "  Degrees: 'Bachelor of Technology' not 'B.Tech' or 'BTech',\n"
            "    'Master of Science' not 'M.S.' or 'MS', 'Bachelor of Science' not 'B.S.' or 'BS',\n"
            "    'Doctor of Philosophy' not 'PhD' or 'Ph.D'\n"
            "  Certifications: full official name, e.g. 'AWS Certified Solutions Architect' not 'AWS SAA'\n"
            "  Companies: official full name\n"
            "  Domains: full descriptive name, e.g. 'Financial Technology' not 'FinTech' "
            "(unless FinTech is the canonical industry term)\n"
            "  If a person writes 'B.Tech in CS', extract degree='Bachelor of Technology', "
            "field_of_study='Computer Science'\n\n"
            "═══ SCHEMA CONSTRAINTS ═══\n"
            "- skill.family must be one of: Programming Languages, Web Frameworks, "
            "Databases, Cloud & DevOps, ML & AI, Data Engineering, Mobile Development, "
            "Testing & QA, Analytics & Visualization, Other\n"
            "- domain.family must be one of: FinTech, Healthcare, E-commerce, SaaS, "
            "Enterprise, Gaming, Education, Other\n"
            "- Return an empty list [] for any section with no data - NEVER omit keys.\n"
            "- Return ONLY valid JSON matching this exact schema:\n\n"
            f"{_USER_SCHEMA}"
        )

        user_msg = (
            "Analyze this professional profile EXHAUSTIVELY. Extract structured data from EVERY section "
            "including: skills, experiences, projects, domains, education, certifications, achievements, "
            "publications/research, coursework, languages, volunteer work, preferences, and patterns.\n\n"
            "Think beyond the obvious - scan for:\n"
            "  • Education sections (degrees, schools, graduation years, GPA, honors)\n"
            "  • Certifications and licenses (AWS, Google, Microsoft, industry certs)\n"
            "  • Awards, competitions, hackathons, scholarships, fellowships\n"
            "  • Research papers, theses, publications, patents, talks, blog posts\n"
            "  • Individual notable courses or 'Relevant Coursework' sections\n"
            "  • Languages spoken (English, Spanish, Mandarin, etc.)\n"
            "  • Open source, volunteer, mentoring, community work\n"
            "  • Job preferences implied by career choices or stated explicitly\n"
            "  • Working style patterns revealed across projects and roles\n\n"
            "CRITICAL — PROJECT SKILL LINKAGE (most commonly missed):\n"
            "  • After extracting all skills, go back through EVERY project description.\n"
            "  • For each technology/tool/skill name that appears in the project text,\n"
            "    add it to that project's skills_demonstrated list.\n"
            "  • 'We built X using Python, FastAPI, and Redis' → skills_demonstrated must include\n"
            "    Python, FastAPI, Redis — each with what/how/outcome from that project's context.\n"
            "  • A skill may appear in skills_demonstrated of MULTIPLE projects.\n"
            "  • Do NOT leave skills_demonstrated empty if any skills were mentioned in the project.\n\n"
            "For each skill: honestly assess evidence_strength and fill 'context' if project-backed.\n"
            "For each domain: fill 'description' with what was actually built in that domain.\n"
            "For the assessment: be direct about red flags, inflated claims, and genuine strengths.\n"
            "For every inference (not directly stated): create an interpretation_flag.\n\n"
            "Skill family reference:\n"
            f"{self._skill_hint}\n\n"
            "Domain family reference:\n"
            f"{self._domain_hint}\n\n"
            f"PROFILE TEXT:\n{profile_text}"
        )

        raw_json = await self._call_with_retry(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=self._temperature,
        )
        extracted = UserProfileExtraction.model_validate_json(raw_json)
        logger.info(
            f"Extracted: {len(extracted.skills)} skills, "
            f"{len(extracted.projects)} projects, "
            f"{len(extracted.domains)} domains, "
            f"{len(extracted.interpretation_flags)} flags (initial)"
        )

        # Detect resume sections for the keyword pass
        sections = self._detect_sections(profile_text)
        logger.info(f"Detected resume sections: {list(sections.keys())}")

        # Run enrichment + section keyword pass in parallel (independent passes)
        enriched, keyword_additions = await asyncio.gather(
            self._enrich_extraction(profile_text, extracted),
            self._section_keyword_pass(profile_text, sections, extracted),
        )
        extracted = self._merge_section_keywords(enriched, keyword_additions)

        # Profile-level mental model flags (career identity, preferences, trajectory)
        extracted = await self._generate_profile_flags(profile_text, extracted)

        logger.info(
            f"Extraction complete: {len(extracted.skills)} skills, "
            f"{len(extracted.projects)} projects, "
            f"{len(extracted.domains)} domains, "
            f"{len(extracted.interpretation_flags)} total flags"
        )
        return extracted

    async def _enrich_extraction(
        self,
        profile_text: str,
        extraction: UserProfileExtraction,
    ) -> UserProfileExtraction:
        """
        Second-pass enrichment focused on two common failures from the first pass:
        1. Projects with empty or sparse skills_demonstrated (missing edges in graph)
        2. Skills/domains with no context/description despite project evidence

        Only invoked when there are projects worth enriching. Cheap call — small
        focused schema, no re-extraction of existing correct data.
        """
        skill_names = [s.name for s in extraction.skills if s.name and s.name.strip()]
        if not skill_names or not extraction.projects:
            return extraction

        # Only enrich projects that have fewer links than skills mentioned in text
        sparse_projects = [
            p for p in extraction.projects
            if p.name and len(p.skills_demonstrated) < max(2, len(skill_names) // 4)
        ]
        if not sparse_projects:
            return extraction

        enrichment_schema = {
            "type": "object",
            "properties": {
                "enriched_projects": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "project_name": {"type": "string"},
                            "skills_demonstrated": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string",
                                                 "description": "Must exactly match a name from the provided skill list"},
                                        "what": {"type": "string"},
                                        "how": {"type": "string"},
                                        "why": {"type": "string"},
                                        "scale": {"type": "string"},
                                        "outcome": {"type": "string"},
                                        "context": {"type": "string"},
                                    },
                                    "required": ["name"],
                                },
                            },
                        },
                        "required": ["project_name", "skills_demonstrated"],
                    },
                },
                "skill_context_updates": {
                    "type": "array",
                    "description": "Fill missing 'context' on skills that have project evidence",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "context": {"type": "string"},
                        },
                        "required": ["name", "context"],
                    },
                },
                "domain_description_updates": {
                    "type": "array",
                    "description": "Fill missing 'description' on domains that have project evidence",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                        },
                        "required": ["name", "description"],
                    },
                },
            },
            "required": ["enriched_projects"],
        }

        project_summaries = "\n".join(
            f"- {p.name}: {(p.description or 'no description')[:300]}"
            for p in sparse_projects
        )
        skills_missing_context = [s.name for s in extraction.skills if s.name and not s.context]
        domains_missing_desc = [d.name for d in extraction.domains if d.name and not d.description]

        system_msg = (
            "You are a precise data enrichment assistant. Cross-reference a profile text "
            "with an extracted skills list to fill in missing project-skill relationships.\n\n"
            "RULES:\n"
            "1. skill names in output MUST exactly match one of the provided extracted skill names.\n"
            "2. Only link a skill to a project if there is actual textual evidence.\n"
            "3. For each link, extract what/how/outcome from the text — do not invent.\n"
            "4. Return ONLY valid JSON matching this schema:\n\n"
            + json.dumps(enrichment_schema, indent=2)
        )

        user_msg = (
            f"Extracted skill names (use ONLY these exact names): {', '.join(skill_names)}\n\n"
            f"Projects needing skill linkage:\n{project_summaries}\n\n"
        )
        if skills_missing_context:
            user_msg += (
                f"Skills missing context (fill if evidence exists): "
                f"{', '.join(skills_missing_context[:10])}\n\n"
            )
        if domains_missing_desc:
            user_msg += (
                f"Domains missing description (fill if evidence exists): "
                f"{', '.join(domains_missing_desc[:5])}\n\n"
            )
        user_msg += f"Profile text (search for evidence):\n{profile_text[:4000]}"

        try:
            raw_json = await self._call_with_retry(
                model=self._model_name,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                response_format={"type": "json_object"},
                temperature=self._temperature,
            )
            enrichment = json.loads(raw_json)
        except Exception as exc:
            logger.warning("Enrichment pass failed (non-fatal): %s", exc)
            return extraction

        # ── Merge enriched project-skill links ────────────────────────────────
        skill_name_set = set(skill_names)
        enriched_map = {
            ep["project_name"]: ep.get("skills_demonstrated", [])
            for ep in enrichment.get("enriched_projects", [])
        }
        for project in extraction.projects:
            enriched_links = enriched_map.get(project.name, [])
            if not enriched_links:
                continue
            new_links: list[SkillUsage] = []
            existing_skill_names = {su.name for su in project.skills_demonstrated}
            for link in enriched_links:
                name = (link.get("name") or "").strip()
                if not name or name not in skill_name_set or name in existing_skill_names:
                    continue
                new_links.append(SkillUsage(
                    name=name,
                    what=link.get("what") or None,
                    how=link.get("how") or None,
                    why=link.get("why") or None,
                    scale=link.get("scale") or None,
                    outcome=link.get("outcome") or None,
                    context=link.get("context") or None,
                ))
                existing_skill_names.add(name)
            if new_links:
                project.skills_demonstrated = list(project.skills_demonstrated) + new_links
                logger.info(
                    "Enrichment: added %d skill links to project '%s'",
                    len(new_links), project.name,
                )

        # ── Merge skill context updates ────────────────────────────────────────
        skill_map = {s.name: s for s in extraction.skills}
        for update in enrichment.get("skill_context_updates", []):
            name = (update.get("name") or "").strip()
            ctx = (update.get("context") or "").strip()
            if name in skill_map and ctx and not skill_map[name].context:
                skill_map[name].context = ctx

        # ── Merge domain description updates ──────────────────────────────────
        domain_map = {d.name: d for d in extraction.domains}
        for update in enrichment.get("domain_description_updates", []):
            name = (update.get("name") or "").strip()
            desc = (update.get("description") or "").strip()
            if name in domain_map and desc and not domain_map[name].description:
                domain_map[name].description = desc

        logger.info(
            "Enrichment pass complete: %d projects processed, %d skill links added",
            len(enriched_map),
            sum(len(v) for v in enriched_map.values()),
        )
        return extraction

    # ── Section detection ──────────────────────────────────────────────────────

    @staticmethod
    def _detect_sections(text: str) -> dict[str, str]:
        """
        Split resume text into labeled sections by detecting common section headers.
        Returns dict mapping section_label → section_text.
        Headers are detected when a line is short (<70 chars) and matches a known pattern.
        """
        import re

        # (regex_pattern, section_label) — matched case-insensitively against stripped lines
        HEADERS = [
            (r"^(professional\s+)?summary$|^objective$|^profile$|^about(\s+me)?$", "summary"),
            (r"^(work\s+)?experience$|^employment(\s+history)?$|^professional\s+background$|^work\s+history$", "experience"),
            (r"^projects?$|^personal\s+projects?$|^side\s+projects?$|^portfolio$|^open.?source\s+projects?$", "projects"),
            (r"^(technical\s+)?skills?$|^core\s+competencies$|^technologies$|^tech\s+stack$|^tools?\s+&\s+technologies$", "skills"),
            (r"^education$|^academics?$|^academic\s+background$|^educational\s+background$", "education"),
            (r"^certifications?$|^certificates?$|^licenses?\s*(and|&)\s*certifications?$|^credentials?$", "certifications"),
            (r"^awards?$|^achievements?$|^honors?$|^recognition$|^scholarships?$|^fellowships?$", "achievements"),
            (r"^publications?$|^research$|^papers?$|^patents?$|^talks?$", "publications"),
            (r"^languages?$|^spoken\s+languages?$", "languages"),
            (r"^volunteer(\s+work)?$|^community\s+involvement$|^open.?source\s+contributions?$", "volunteer"),
            (r"^(relevant\s+)?course\s*work$|^moocs?$|^training$|^online\s+courses?$", "coursework"),
        ]

        lines = text.split("\n")
        sections: dict[str, list[str]] = {}
        current = "_header"

        for line in lines:
            stripped = line.strip()
            matched_section = None
            # Only try to match headers on short, non-empty lines
            if stripped and len(stripped) < 70:
                # Normalise: strip trailing colon/dash/underscore and common decorators
                normalised = re.sub(r"[-:_=*#\s]+$", "", stripped).strip()
                # Also strip leading decorators (e.g. "── SKILLS ──")
                normalised = re.sub(r"^[-:_=*#\s]+", "", normalised).strip()
                for pattern, label in HEADERS:
                    if re.search(pattern, normalised, re.IGNORECASE):
                        matched_section = label
                        break

            if matched_section:
                current = matched_section
                sections.setdefault(current, [])
                # Include the header line so section text is self-contained
                sections[current].append(line)
            else:
                sections.setdefault(current, [])
                sections[current].append(line)

        return {k: "\n".join(v).strip() for k, v in sections.items() if "\n".join(v).strip()}

    # ── Section keyword pass ───────────────────────────────────────────────────

    async def _section_keyword_pass(
        self,
        profile_text: str,
        sections: dict[str, str],
        extraction: "UserProfileExtraction",
    ) -> dict:
        """
        Single targeted LLM call that scans each resume section for skill/domain keywords
        NOT already captured in the main extraction. Runs in parallel with _enrich_extraction.

        Returns dict with:
          missed_skills: list of new skill objects to add
          missed_domains: list of new domain objects to add
        """
        existing_skill_names = {s.name.lower() for s in extraction.skills if s.name}
        existing_domain_names = {d.name.lower() for d in extraction.domains if d.name}

        # Priority order for sections we want to scan
        section_order = ["skills", "experience", "projects", "summary", "certifications",
                         "achievements", "education", "volunteer", "coursework"]
        section_texts = []
        for label in section_order:
            if label in sections and sections[label].strip():
                section_texts.append(f"=== {label.upper()} ===\n{sections[label][:1500]}")
        # Include any unrecognised sections
        for label, text in sections.items():
            if label not in section_order and label != "_header" and text.strip():
                section_texts.append(f"=== {label.upper()} ===\n{text[:800]}")
        # Fallback: full text if no sections detected
        if not section_texts:
            section_texts = [f"=== FULL PROFILE ===\n{profile_text[:5000]}"]

        schema = {
            "type": "object",
            "properties": {
                "missed_skills": {
                    "type": "array",
                    "description": "Technology/skill names in the resume NOT already in the existing skill list",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Canonical skill name"},
                            "family": {
                                "type": "string",
                                "enum": [
                                    "Programming Languages", "Web Frameworks", "Databases",
                                    "Cloud & DevOps", "ML & AI", "Data Engineering",
                                    "Mobile Development", "Testing & QA",
                                    "Analytics & Visualization", "Other",
                                ],
                            },
                            "evidence_strength": {
                                "type": "string",
                                "enum": ["claimed_only", "mentioned_once", "project_backed", "multiple_productions"],
                            },
                            "level": {"type": ["string", "null"]},
                            "years": {"type": ["number", "null"]},
                            "context": {"type": ["string", "null"]},
                        },
                        "required": ["name", "family", "evidence_strength"],
                    },
                },
                "missed_domains": {
                    "type": "array",
                    "description": "Industry/domain names in the resume NOT already in the existing domain list",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "family": {
                                "type": "string",
                                "enum": ["FinTech", "Healthcare", "E-commerce", "SaaS",
                                         "Enterprise", "Gaming", "Education", "Other"],
                            },
                            "depth": {"type": "string", "enum": ["shallow", "moderate", "deep"]},
                            "description": {"type": ["string", "null"]},
                        },
                        "required": ["name", "family", "depth"],
                    },
                },
            },
            "required": ["missed_skills", "missed_domains"],
        }

        system_msg = (
            "You are a precise keyword extraction assistant scanning a resume section by section. "
            "Your ONLY job: find every technology, skill, framework, tool, library, platform, "
            "cloud service, database, or domain/industry keyword present in the text that is "
            "NOT already in the provided existing extracted list.\n\n"
            "RULES:\n"
            "1. Only list items NOT already in the existing extracted list\n"
            "2. Use canonical names: 'TypeScript' not 'TS', 'PostgreSQL' not 'Postgres', "
            "'Kubernetes' not 'K8s', 'Machine Learning' not 'ML'\n"
            "3. Only include items with clear textual evidence — never hallucinate\n"
            "4. A skill: any programming language, framework, library, tool, platform, "
            "cloud service, database, methodology (Agile/Scrum/TDD), or professional technology\n"
            "5. A domain: an industry or application area the candidate has worked in\n"
            "6. Be EXHAUSTIVE — scan every bullet point, every parenthetical, every section\n"
            "7. Return ONLY valid JSON matching this schema:\n\n"
            + json.dumps(schema, indent=2)
        )

        existing_skills_str = ", ".join(sorted(existing_skill_names)[:60]) or "none"
        existing_domains_str = ", ".join(sorted(existing_domain_names)[:20]) or "none"

        user_msg = (
            f"ALREADY EXTRACTED SKILLS (do NOT repeat these):\n{existing_skills_str}\n\n"
            f"ALREADY EXTRACTED DOMAINS (do NOT repeat these):\n{existing_domains_str}\n\n"
            "RESUME SECTIONS TO SCAN FOR MISSED KEYWORDS:\n\n"
            + "\n\n".join(section_texts)
        )

        try:
            raw_json = await self._call_with_retry(
                model=self._model_name,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                response_format={"type": "json_object"},
                temperature=self._temperature,
            )
            return json.loads(raw_json)
        except Exception as exc:
            logger.warning("Section keyword pass failed (non-fatal): %s", exc)
            return {"missed_skills": [], "missed_domains": []}

    # ── Merge section keyword additions ────────────────────────────────────────

    @staticmethod
    def _merge_section_keywords(
        extraction: "UserProfileExtraction",
        additions: dict,
    ) -> "UserProfileExtraction":
        """Merge missed keywords from the section pass into the extraction."""
        from models.schemas import ExtractedSkill, ExtractedDomain

        existing_skill_names = {s.name.lower() for s in extraction.skills if s.name}
        existing_domain_names = {d.name.lower() for d in extraction.domains if d.name}

        new_skills = 0
        for item in additions.get("missed_skills", []):
            name = (item.get("name") or "").strip()
            if not name or name.lower() in existing_skill_names:
                continue
            try:
                skill = ExtractedSkill(
                    name=name,
                    family=item.get("family", "Other"),
                    level=item.get("level") or None,
                    evidence_strength=item.get("evidence_strength", "mentioned_once"),
                    years=item.get("years"),
                    context=item.get("context"),
                )
                extraction.skills.append(skill)
                existing_skill_names.add(name.lower())
                new_skills += 1
            except Exception as e:
                logger.debug("Skipping invalid skill from section pass: %s (%s)", name, e)

        new_domains = 0
        for item in additions.get("missed_domains", []):
            name = (item.get("name") or "").strip()
            if not name or name.lower() in existing_domain_names:
                continue
            try:
                domain = ExtractedDomain(
                    name=name,
                    family=item.get("family", "Other"),
                    depth=item.get("depth", "shallow"),
                    description=item.get("description"),
                )
                extraction.domains.append(domain)
                existing_domain_names.add(name.lower())
                new_domains += 1
            except Exception as e:
                logger.debug("Skipping invalid domain from section pass: %s (%s)", name, e)

        if new_skills or new_domains:
            logger.info(
                "Section keyword pass merged: +%d skills, +%d domains",
                new_skills, new_domains,
            )
        return extraction

    # ── Profile interpretation flags ──────────────────────────────────────────

    async def _generate_profile_flags(
        self,
        profile_text: str,
        extraction: "UserProfileExtraction",
    ) -> "UserProfileExtraction":
        """
        Generate profile-level mental model confirmation questions.
        These ask the user to confirm the LLM's holistic interpretation of WHO they are:
        career identity, trajectory, work preferences, depth vs. breadth, contribution style.
        Appends 3-6 additional flags to extraction.interpretation_flags.
        """
        from models.schemas import InterpretationFlag

        # Compact profile summary for the prompt
        top_skills = sorted(
            [s for s in extraction.skills if s.evidence_strength in ("project_backed", "multiple_productions")],
            key=lambda s: {"multiple_productions": 3, "project_backed": 2,
                           "mentioned_once": 1, "claimed_only": 0}.get(s.evidence_strength or "", 0),
            reverse=True,
        )[:6]
        skill_summary = ", ".join(
            f"{s.name}({s.level or '?'}yr={s.years or '?'})" for s in top_skills
        ) or ", ".join(s.name for s in extraction.skills[:5])

        domain_summary = ", ".join(d.name for d in extraction.domains[:5]) or "none detected"
        exp_summary = "; ".join(
            f"{e.title or '?'} at {e.company or '?'}"
            for e in extraction.experiences[:3]
        ) if extraction.experiences else "no experience listed"
        project_names = ", ".join(p.name for p in extraction.projects[:5]) if extraction.projects else "none"
        assessment_identity = (
            (extraction.assessment.candidate_identity or "")
            if extraction.assessment else ""
        )
        existing_flag_count = len(extraction.interpretation_flags)

        schema = {
            "type": "object",
            "properties": {
                "flags": {
                    "type": "array",
                    "description": "3-6 mental model confirmation questions about career identity, trajectory, preferences",
                    "items": {
                        "type": "object",
                        "properties": {
                            "field": {
                                "type": "string",
                                "description": "Format: 'Assessment:profile:aspect' e.g. 'Assessment:profile:career_identity'",
                            },
                            "raw_text": {
                                "type": "string",
                                "description": "Quote from the resume that led to this interpretation",
                            },
                            "interpreted_as": {
                                "type": "string",
                                "description": "Your specific interpretation of what this means about the candidate",
                            },
                            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                            "ambiguity_reason": {
                                "type": "string",
                                "description": "Why this interpretation needs confirmation from the user",
                            },
                            "clarification_question": {
                                "type": "string",
                                "description": "The exact question to show the user. Must be affirm/deny your interpretation.",
                            },
                            "resolution_impact": {"type": "string", "enum": ["critical", "important", "minor"]},
                            "suggested_options": {
                                "type": ["array", "null"],
                                "items": {"type": "string"},
                            },
                        },
                        "required": [
                            "field", "raw_text", "interpreted_as", "confidence",
                            "ambiguity_reason", "clarification_question", "resolution_impact",
                        ],
                    },
                }
            },
            "required": ["flags"],
        }

        system_msg = (
            "You are a thoughtful career coach reviewing a professional profile. "
            "Generate 3-6 mental model confirmation questions that verify your holistic "
            "interpretation of WHO this candidate is professionally.\n\n"
            "These are NOT about fixing errors — they confirm your reading of:\n"
            "  1. CAREER IDENTITY: 'Based on your profile, I read you as a backend engineer "
            "     who specialises in distributed data systems. Is this how you'd describe yourself?'\n"
            "  2. TRAJECTORY: 'Your career shows a move from frontend → full-stack → backend. "
            "     Is backend engineering your intended long-term direction?'\n"
            "  3. ENVIRONMENT PREFERENCE: 'You've worked at 2 early-stage startups and 1 scale-up. "
            "     Do you prefer fast-moving, ambiguous startup environments?'\n"
            "  4. PROBLEM-SOLVING IDENTITY: 'Your projects suggest you prefer infrastructure/systems "
            "     work over product features. Is that an accurate characterisation?'\n"
            "  5. DEPTH vs. BREADTH: 'You list 15+ technologies. Would you say you have deep expertise "
            "     in 2-3 core areas, or do you intentionally maintain broad generalist coverage?'\n"
            "  6. CONTRIBUTION STYLE: 'Your experience describes team contributions throughout. "
            "     Do you currently prefer IC depth work, or do you aspire to lead a team?'\n\n"
            "RULES:\n"
            "- Quote the actual resume text that triggered each interpretation\n"
            "- Make questions affirm or deny a SPECIFIC interpretation (not open-ended)\n"
            "- Use suggested_options for questions with discrete answers\n"
            "- resolution_impact='important' for identity/trajectory, 'minor' for minor preferences\n"
            "- Do NOT duplicate questions that are already covered in the standard flags above\n"
            "- Return ONLY valid JSON matching this schema:\n\n"
            + json.dumps(schema, indent=2)
        )

        user_msg = (
            f"CANDIDATE PROFILE SUMMARY:\n"
            f"Top evidenced skills: {skill_summary}\n"
            f"All skills count: {len(extraction.skills)}\n"
            f"Domains: {domain_summary}\n"
            f"Experience: {exp_summary}\n"
            f"Projects: {project_names}\n"
            f"AI identity note: {assessment_identity or 'not available'}\n"
            f"Existing flags already generated: {existing_flag_count} "
            f"(do NOT duplicate those — add complementary mental model questions)\n\n"
            f"PROFILE TEXT (for raw_text quotes — use exact quotes):\n{profile_text[:3500]}\n\n"
            "Generate 3-6 mental model confirmation questions about this candidate's "
            "professional identity, trajectory, and work preferences."
        )

        try:
            raw_json = await self._call_with_retry(
                model=self._model_name,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                response_format={"type": "json_object"},
                temperature=self._temperature,
            )
            result = json.loads(raw_json)
            new_flags_data = result.get("flags", [])
        except Exception as exc:
            logger.warning("Profile flags generation failed (non-fatal): %s", exc)
            return extraction

        existing_fields = {f.field for f in extraction.interpretation_flags}
        added = 0
        for flag_data in new_flags_data:
            field = (flag_data.get("field") or "").strip()
            if not field or field in existing_fields:
                continue
            try:
                flag = InterpretationFlag(
                    field=field,
                    raw_text=flag_data.get("raw_text", ""),
                    interpreted_as=flag_data.get("interpreted_as", ""),
                    confidence=flag_data.get("confidence", "medium"),
                    ambiguity_reason=flag_data.get("ambiguity_reason", ""),
                    clarification_question=flag_data.get("clarification_question", ""),
                    resolution_impact=flag_data.get("resolution_impact", "important"),
                    suggested_options=flag_data.get("suggested_options"),
                )
                extraction.interpretation_flags.append(flag)
                existing_fields.add(field)
                added += 1
            except Exception as e:
                logger.debug("Skipping invalid profile flag: %s (%s)", field, e)

        logger.info("Profile flags pass: added %d mental model flags", added)
        return extraction

    async def generate_match_explanation(
        self,
        user_id: str,
        job_title: str,
        company: str | None,
        total_score: float,
        skill_score: float,
        domain_score: float,
        culture_bonus: float,
        preference_bonus: float,
        matched_skills: list[str],
        inferred_skills: list[str] | None = None,
        missing_skills: list[str] | None = None,
        matched_domains: list[str] | None = None,
        missing_domains: list[str] | None = None,
        paths: list[str] | None = None,
        perspective: str = "recruiter",
        rich_context: dict | None = None,
        skill_match_details: list[dict] | None = None,
    ) -> dict:
        """
        Generate a structured, evidence-based explanation of a user-job match.

        Uses rich_context (skill evidence, 5W+H usage, critical assessment, domain depth)
        to produce a detailed, actionable analysis - not just name-matching.

        Returns a dict with:
          verdict, headline, why_they_fit, critical_gaps, nice_to_have_gaps,
          seniority_fit, honest_take, recommendation, interview_focus
        """
        import json as _j

        company_str = company or "Unknown Company"
        ctx = rich_context or {}

        # ── Format matched skills with evidence context ──────────────────────────
        skill_lines = []
        for s in ctx.get("matched_skills_rich", []):
            name     = s.get("skill", "?")
            level    = s.get("level") or "unknown level"
            years    = s.get("years")
            ev       = s.get("evidence_strength") or "unknown evidence"
            imp      = s.get("importance") or "default"
            min_yr   = s.get("min_years")
            contexts = [c for c in (s.get("usage_contexts") or []) if c]
            whats    = [w for w in (s.get("usage_what") or []) if w]
            outcomes = [o for o in (s.get("outcomes") or []) if o]

            years_str = f"{years}yr" if years else "yrs unknown"
            min_str   = f" (job needs {min_yr}yr min)" if min_yr else ""
            ev_label  = {
                "multiple_productions": "★★★★ production-proven",
                "project_backed":       "★★★ project-evidenced",
                "mentioned_once":       "★★ mentioned briefly",
                "claimed_only":         "★ claimed only",
            }.get(ev, ev)

            how_parts = []
            if whats:
                how_parts.append(f"used to: {'; '.join(whats[:2])}")
            if contexts:
                how_parts.append(f"context: {'; '.join(contexts[:2])}")
            if outcomes:
                how_parts.append(f"outcome: {'; '.join(outcomes[:1])}")

            how_str = " - " + " | ".join(how_parts) if how_parts else ""
            skill_lines.append(
                f"  • {name} [{imp}]: {level}, {years_str}{min_str}, {ev_label}{how_str}"
            )

        # Fall back to flat list if rich context not available
        if not skill_lines and matched_skills:
            skill_lines = [f"  • {s}" for s in matched_skills]

        # ── Inferred skills (semantic-only, shown separately) ────────────────────
        inferred_lines: list[str] = []
        for s in (inferred_skills or []):
            inferred_lines.append(f"  ~ {s}  [inferred — 75% score weight, needs verification]")

        # ── Format gaps ──────────────────────────────────────────────────────────
        _missing = missing_skills or []
        must_gap_lines = []
        for g in ctx.get("missing_must_have", []):
            sk = g.get("skill", "?")
            my = g.get("min_years")
            must_gap_lines.append(f"  • {sk} (must_have{f', {my}yr min' if my else ''})")
        if not must_gap_lines:
            must_gap_lines = [f"  • {s}" for s in _missing if s]

        nice_gaps = ctx.get("missing_nice", [m for m in _missing if m not in
                             [g.get("skill", "") for g in ctx.get("missing_must_have", [])]])
        nice_gap_str = ", ".join(nice_gaps[:6]) if nice_gaps else "None"

        # ── Format assessment ────────────────────────────────────────────────────
        assessment = ctx.get("assessment", {})
        seniority    = assessment.get("seniority_assessment") or "unknown"
        signal       = assessment.get("overall_signal") or "unknown"
        identity     = assessment.get("candidate_identity") or ""
        honest_summ  = assessment.get("honest_summary") or ""
        red_flags    = assessment.get("red_flags") or []
        inflated     = assessment.get("inflated_skills") or []
        genuine      = assessment.get("genuine_strengths") or []
        five_wh      = assessment.get("five_w_h_summary") or {}

        red_flag_str   = "\n".join(f"  ⚠ {f}" for f in red_flags[:4]) if red_flags else "  None noted"
        genuine_str    = "\n".join(f"  ✓ {g}" for g in genuine[:4]) if genuine else "  (none noted)"
        inflated_str   = "\n".join(f"  ! {i}" for i in inflated[:3]) if inflated else "  None"

        # ── Format domains ───────────────────────────────────────────────────────
        domain_lines = []
        for d in ctx.get("matched_domains_rich", []):
            dn   = d.get("domain", "?")
            dep  = d.get("depth") or "unknown"
            dyrs = d.get("years")
            domain_lines.append(f"  • {dn}: {dep} depth" + (f", {dyrs}yr" if dyrs else ""))
        if not domain_lines and matched_domains:
            domain_lines = [f"  • {d}" for d in matched_domains]

        job_meta  = ctx.get("job_meta", {})
        exp_min   = job_meta.get("exp_min")
        co_size   = job_meta.get("company_size") or "unknown"
        remote    = job_meta.get("remote_policy") or "unknown"

        five_wh_str = ""
        if isinstance(five_wh, dict) and five_wh:
            five_wh_str = "\nCandidate 5W+H:\n" + "\n".join(
                f"  {k.upper()}: {v}" for k, v in five_wh.items() if v
            )

        # ── Perspective instruction ──────────────────────────────────────────────
        if perspective == "seeker":
            person_instr = (
                "Write in SECOND PERSON (you/your). "
                "Tone: honest and constructive - help them understand their fit and what to prepare. "
                "E.g. 'Your Python expertise is well-evidenced... however, Kubernetes is a critical gap you'll need to address.'"
            )
            output_guidance = (
                "For 'why_they_fit': use 'Your [skill] experience...' phrasing.\n"
                "For 'honest_take': frame concerns as areas to prepare, not disqualifiers.\n"
                "For 'recommendation': advise them on whether to apply and what to prepare."
            )
        else:
            person_instr = (
                f"Write in THIRD PERSON about candidate '{user_id}'. "
                "Tone: professional recruiter/hiring manager lens - direct, honest, evidence-based. "
                f"E.g. '{user_id} demonstrates production-proven Python skills...'"
            )
            output_guidance = (
                "For 'why_they_fit': reference the candidate by name or 'the candidate'.\n"
                "For 'honest_take': be direct about risks and genuine strengths.\n"
                "For 'recommendation': advise the hiring team on next steps."
            )

        system_msg = (
            "You are a senior engineering manager generating a detailed, evidence-based job match analysis. "
            "You have access to the candidate's actual graph data: how skills were used, at what scale, "
            "with what evidence quality - not just which skill names match. "
            "Your analysis must go beyond surface-level name matching to assess genuine fit.\n\n"
            "STRICT RULE: Only reference information explicitly provided in the data below. "
            "Do NOT invent years of experience, project names, company names, skill levels, or any other details "
            "not present in the prompt. If data is missing or unknown, say so — never guess or extrapolate.\n\n"
            "Return ONLY valid JSON matching this exact schema:\n"
            "{\n"
            '  "verdict": "Strong match" | "Good match" | "Moderate match" | "Weak match" | "Not recommended",\n'
            '  "headline": "1 sentence: who this person is and why they do/do not fit this specific role",\n'
            '  "why_they_fit": ["skill or domain with specific evidence and context - not just names"],\n'
            '  "critical_gaps": ["must-have gaps with explanation of impact on this role"],\n'
            '  "nice_to_have_gaps": ["lower priority gaps"],\n'
            '  "seniority_fit": "1-2 sentences: assessed level vs what the role needs",\n'
            '  "honest_take": "2-3 sentences: evidence-backed assessment of genuine strengths and concerns",\n'
            '  "recommendation": "Hire | Proceed to technical screen | Conditional consider | Pass - with 1 sentence rationale",\n'
            '  "interview_focus": ["specific technical areas to probe if proceeding"]\n'
            "}"
        )

        user_msg = (
            f"Candidate: {user_id}\n"
            f"Role: {job_title} at {company_str}\n"
            f"Company size: {co_size} | Remote: {remote}"
            + (f" | Min experience: {exp_min}yr" if exp_min else "")
            + "\n\n"
            f"Match scores: Overall {round(total_score * 100)}% "
            f"(Skills 65%→{round(skill_score * 100)}%, Domain 35%→{round(domain_score * 100)}%) "
            f"| Culture bonus: {round(culture_bonus * 100)}% | Preference bonus: {round(preference_bonus * 100)}%\n\n"
            "═══ CONFIRMED SKILLS (exact or strong keyword match — high confidence) ═══\n"
            + ("\n".join(skill_lines) or "  None")
            + "\n\n"
            "═══ INFERRED SKILLS (semantic-only — conceptually related, NOT explicitly listed) ═══\n"
            + ("\n".join(inferred_lines) or "  None")
            + "\n"
            "  ↑ These count at 75% score weight. Mention them as 'may be transferable' NOT as confirmed.\n\n"
            "═══ CRITICAL GAPS (must-have skills not in profile) ═══\n"
            + ("\n".join(must_gap_lines) or "  None - all must-haves covered")
            + "\n\n"
            f"Nice-to-have gaps: {nice_gap_str}\n\n"
            "═══ MATCHED DOMAINS ═══\n"
            + ("\n".join(domain_lines) or "  None")
            + "\n\n"
            "═══ CANDIDATE ASSESSMENT (from critical analysis) ═══\n"
            f"Profile signal: {signal} | Seniority: {seniority}\n"
            + (f"Identity: {identity}\n" if identity else "")
            + (f"Honest summary: {honest_summ}\n" if honest_summ else "")
            + f"\nGenuine evidenced strengths:\n{genuine_str}\n"
            + f"\nRed flags / concerns:\n{red_flag_str}\n"
            + f"\nInflated skill claims:\n{inflated_str}\n"
            + five_wh_str
            + _format_skill_match_details(skill_match_details)
            + "\n\n"
            f"{person_instr}\n"
            f"{output_guidance}\n\n"
            "Generate the structured match explanation. Be specific - use actual skill names, "
            "evidence levels, and context from the data above. Do NOT be generic."
        )

        # Always generate in recruiter (third-person) perspective first for factual consistency,
        # then adapt pronouns for seeker view. This prevents two independent LLM calls from
        # producing different factual claims.
        recruiter_msg = user_msg.replace(person_instr, (
            f"Write in THIRD PERSON about candidate '{user_id}'. "
            "Tone: professional recruiter/hiring manager lens - direct, honest, evidence-based."
        )).replace(output_guidance, (
            "For 'why_they_fit': reference the candidate by name or 'the candidate'.\n"
            "For 'honest_take': be direct about risks and genuine strengths.\n"
            "For 'recommendation': advise the hiring team on next steps."
        ))

        raw = await self._call_with_retry(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": recruiter_msg},
            ],
            response_format={"type": "json_object"},
            temperature=self._temperature,
        )

        try:
            result = _j.loads(raw)
        except Exception:
            return {
                "verdict": "Unknown",
                "headline": raw[:200] if raw else "Explanation unavailable",
                "why_they_fit": [],
                "critical_gaps": [],
                "nice_to_have_gaps": [],
                "seniority_fit": "",
                "honest_take": raw if raw else "",
                "recommendation": "",
                "interview_focus": [],
            }

        # If seeker view requested, adapt pronouns via a second lightweight call
        if perspective == "seeker":
            adapt_raw = await self._call_with_retry(
                model=self._model_name,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You rewrite text from third-person to second-person perspective. "
                            "Change ONLY pronouns and addressing style. "
                            "Do NOT change any facts, skill names, evidence levels, scores, gaps, or assessments. "
                            "Return valid JSON with the exact same keys as the input."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Rewrite this match explanation from third-person (about '{user_id}') "
                            f"to second-person (addressing '{user_id}' directly as 'you/your'). "
                            f"Keep every fact identical:\n\n{raw}"
                        ),
                    },
                ],
                response_format={"type": "json_object"},
                temperature=self._temperature,
            )
            try:
                return _j.loads(adapt_raw)
            except Exception:
                return result  # fall back to recruiter version if adaptation fails

        return result

    async def extract_job_posting(self, job_text: str) -> JobPostingExtraction:
        """
        Extract structured job requirements from raw job posting text using a two-pass approach.

        Pass 1: Deep extraction of all explicit AND implied requirements with mandatory context.
        Pass 2: Focused gap-filling — skills implied by responsibilities, scope/seniority signals,
                culture signals buried in narrative, enriched WHY context for existing skills.
        Synthesis: Merges both passes, deduplicates by skill name (richer entry wins).

        Returns a validated JobPostingExtraction with skill requirements,
        domain requirements, work styles, company metadata, deep profile sections,
        plus scope_signals and seniority_signals from the second pass.
        """
        pass1, pass2 = await asyncio.gather(
            self._extract_job_pass1(job_text),
            self._extract_job_pass2_implicit(job_text),
        )
        return self._synthesize_job_extraction(pass1, pass2)

    async def _extract_job_pass1(self, job_text: str) -> JobPostingExtraction:
        """
        First pass: deep exhaustive extraction of the job posting.
        Processes every section including responsibilities, requirements, company/team narrative.
        """
        system_msg = (
            "You are a senior technical recruiter conducting an exhaustive, evidence-based analysis "
            "of a job posting. Your task is NOT just to copy the requirements section — it is to "
            "read EVERY part of the posting and extract ALL signals about what this role truly needs.\n\n"
            "═══ WHAT TO EXTRACT — SCAN THE ENTIRE POSTING FOR ALL OF THESE ═══\n\n"
            "SKILLS — Read EVERY section: requirements, responsibilities, about-the-team, company-tech-stack.\n"
            "  • Extract every skill/tool/framework mentioned ANYWHERE in the posting.\n"
            "  • For each skill, fill 'context': WHY does this role need it? What will the candidate "
            "actually DO with it? e.g. 'Builds the real-time event pipeline ingesting 2M events/sec' "
            "or 'Core to the GraphQL API layer the candidate will own'. Never leave context null "
            "if there is ANY hint in the posting about how the skill is used.\n"
            "  • signal_type: 'explicit' if the skill is directly listed in a requirements/qualifications "
            "section. 'implied_from_responsibility' if you inferred it from a 'What you'll do' or "
            "'Responsibilities' bullet. 'implied_from_context' if inferred from product/tech description.\n"
            "  • source_text: for non-explicit skills, quote the exact sentence that implies it.\n"
            "  • importance: 'must_have' for required/mandatory. 'optional' for nice-to-have/bonus.\n\n"
            "RESPONSIBILITIES → SKILL INFERENCE (critical step — most commonly missed):\n"
            "  • After listing explicit skills, go back through EVERY responsibility bullet.\n"
            "  • For each bullet, ask: what technical skills are REQUIRED to do this task?\n"
            "  • e.g. 'Design and maintain our distributed job scheduler' → even if not in requirements, "
            "this implies distributed systems design, job scheduling patterns, fault tolerance.\n"
            "  • e.g. 'Lead architecture reviews with 3 other teams' → implies system design, "
            "cross-team collaboration, technical leadership.\n"
            "  • Add these as skill_requirements with signal_type='implied_from_responsibility'.\n\n"
            "DOMAINS — Extract every industry/domain area required, including implied ones.\n"
            "  • e.g. 'Our platform processes $2B in annual payment volume' → FinTech / Payment Systems.\n"
            "  • Set depth based on how central the domain is to the role (deep/moderate/shallow).\n\n"
            "WORK STYLES & CULTURE — Extract from ALL sections:\n"
            "  • Look in 'About us', 'Our culture', team descriptions, not just requirements.\n"
            "  • Examples: async-first, high-autonomy, fast-paced, data-driven, customer-obsessed.\n\n"
            "DEEP PROFILE SECTIONS:\n"
            "  • education_requirements: degree + is_required. 'phd'/'master'/'bachelor'/'associate'/'any'.\n"
            "  • preferred_qualifications: ALL nice-to-have items: certifications, domain exp, tools, soft skills.\n"
            "    importance: 'strongly_preferred', 'preferred', 'nice_to_have'.\n"
            "  • company_profile: mission, values, product description, stage, industry, notable_tech.\n"
            "    stage: 'startup'/'growth'/'enterprise'/'nonprofit'.\n"
            "  • hiring_team: team name, what they build, size, tech focus, team_type.\n"
            "    team_type: 'product'/'platform'/'infra'/'ml'/'data'/'design'/'other'.\n"
            "  • compensation: salary as integers (no symbols), equity, benefits list, is_disclosed=true "
            "only if salary was explicitly stated.\n"
            "  • role_expectations: top 5-8 responsibilities as action statements, success metrics, "
            "30/90-day ramp. autonomy_level: 'low'/'moderate'/'high'.\n"
            "  • soft_requirements: personality traits, cultural fit. is_dealbreaker=true for "
            "'must be', 'required to', 'non-negotiable'.\n\n"
            "═══ SCHEMA CONSTRAINTS ═══\n"
            "- skill.family must be one of: Programming Languages, Web Frameworks, "
            "Databases, Cloud & DevOps, ML & AI, Data Engineering, Mobile Development, "
            "Testing & QA, Analytics & Visualization, Other\n"
            "- domain.family must be one of: FinTech, Healthcare, E-commerce, SaaS, "
            "Enterprise, Gaming, Education, Other\n"
            "- remote_policy: 'remote' | 'hybrid' | 'onsite'\n"
            "- company_size: 'startup' | 'mid-size' | 'enterprise'\n"
            "- Return [] for any list with no data; null for optional object fields.\n"
            "- Return ONLY valid JSON matching this exact schema:\n\n"
            f"{_JOB_SCHEMA}"
        )

        user_msg = (
            "Analyze this job posting EXHAUSTIVELY. Extract structured data from EVERY section — "
            "not just the requirements list. Scan responsibilities, about-the-team, about-the-company, "
            "and product descriptions for implied skill requirements, domain signals, and culture cues.\n\n"
            "CRITICAL — RESPONSIBILITY-TO-SKILL INFERENCE (most commonly missed):\n"
            "  • After extracting explicit skills, go back through EVERY responsibility bullet.\n"
            "  • For each responsibility, identify what technical skills are actually required to do that work.\n"
            "  • Add them to skill_requirements with signal_type='implied_from_responsibility' and "
            "source_text=the exact responsibility sentence.\n\n"
            "For each skill: fill 'context' with WHY this role needs it (not just what it is).\n"
            "For each domain: fill depth based on how central it is to the work.\n\n"
            "Skill family reference:\n"
            f"{self._skill_hint}\n\n"
            "Domain family reference:\n"
            f"{self._domain_hint}\n\n"
            f"JOB POSTING:\n{job_text}"
        )

        raw_json = await self._call_with_retry(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=self._temperature,
        )
        return JobPostingExtraction.model_validate_json(raw_json)

    async def _extract_job_pass2_implicit(self, job_text: str) -> JobImplicitSignals:
        """
        Second pass: focused gap-filling on the raw job text.
        Runs in parallel with pass 1 — finds implicit signals independently.
        The synthesis step handles deduplication.
        """
        system_msg = (
            "You are an expert at reading between the lines of job postings. "
            "Your task is to find the signals that a standard extraction MISSES — "
            "the implied requirements, scope indicators, and cultural signals buried in narrative text.\n\n"
            "WHAT TO FIND:\n\n"
            "1. IMPLIED SKILLS FROM RESPONSIBILITIES\n"
            "   • Read every 'What you'll do' or responsibility bullet.\n"
            "   • For each, identify what technical skills are REQUIRED to perform that work — "
            "even if not listed in 'Requirements'.\n"
            "   • signal_type MUST be 'implied_from_responsibility'. source_text MUST be the exact "
            "bullet or sentence that implies the skill.\n"
            "   • Examples:\n"
            "     'Own the reliability of our payments service (99.99% uptime)' "
            "→ implies: SRE practices, incident management, SLA monitoring, alerting\n"
            "     'Partner with product managers to define technical roadmap' "
            "→ implies: technical communication, product thinking, roadmap planning\n"
            "     'Lead code reviews and set engineering standards' "
            "→ implies: code review practices, mentorship, technical documentation\n\n"
            "2. SCOPE AND SCALE SIGNALS\n"
            "   • Look for numbers, volume, scale, complexity indicators ANYWHERE in the posting.\n"
            "   • e.g. 'serves 50M daily active users', 'processes $1B in transactions', "
            "'team of 25 engineers', 'operates in 40 countries', '100ms p99 latency SLA'\n"
            "   • These tell us the complexity level the candidate must be prepared for.\n\n"
            "3. SENIORITY AND LEADERSHIP SIGNALS\n"
            "   • Find phrases that indicate the expected seniority beyond just the title.\n"
            "   • e.g. 'own the technical roadmap', 'mentor junior engineers', "
            "'drive architecture decisions', 'set engineering standards', 'lead cross-team initiatives'\n\n"
            "4. CULTURE AND WORK STYLE SIGNALS (buried in narrative)\n"
            "   • Look in 'About us', 'Our values', 'How we work', company story sections.\n"
            "   • e.g. async-first, high-autonomy, ownership culture, move-fast, data-driven decisions\n\n"
            "5. DOMAIN SIGNALS FROM PRODUCT/COMPANY CONTEXT\n"
            "   • Product description often implies domain requirements not stated explicitly.\n"
            "   • e.g. 'We process medical insurance claims' → Healthcare + Insurance domain experience implied\n\n"
            "Return ONLY valid JSON matching this exact schema:\n\n"
            f"{_JOB_IMPLICIT_SCHEMA}"
        )

        user_msg = (
            "Read this job posting and extract ONLY the implicit signals — "
            "things a keyword-based extraction would miss:\n\n"
            "1. Skills REQUIRED to perform the listed responsibilities (not in requirements section)\n"
            "2. Scale/scope signals (numbers, volume, complexity indicators)\n"
            "3. Seniority signals (ownership, mentorship, roadmap, architecture language)\n"
            "4. Culture/work style signals from narrative text\n"
            "5. Domain signals from product/company description\n\n"
            "Do NOT repeat skills that are already explicitly listed in a requirements/qualifications "
            "section — only capture what a standard extraction would miss.\n\n"
            "Skill family reference:\n"
            f"{self._skill_hint}\n\n"
            "Domain family reference:\n"
            f"{self._domain_hint}\n\n"
            f"JOB POSTING:\n{job_text}"
        )

        raw_json = await self._call_with_retry(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=self._temperature,
        )
        return JobImplicitSignals.model_validate_json(raw_json)

    @staticmethod
    def _synthesize_job_extraction(
        pass1: JobPostingExtraction,
        pass2: JobImplicitSignals,
    ) -> JobPostingExtraction:
        """
        Merge pass1 (explicit + inferred) with pass2 (gap-filling implicit signals).

        Deduplication: if the same skill name appears in both, keep the one with
        richer context (non-null > null, longer > shorter). Implied skills from pass2
        that weren't in pass1 are appended.
        """
        # Index pass1 skills by normalized name for O(1) lookup
        existing_skills: dict[str, int] = {
            s.name.lower(): i for i, s in enumerate(pass1.skill_requirements)
        }

        # Apply context enrichments first (before adding implied skills)
        for enrichment in pass2.enriched_contexts:
            idx = existing_skills.get(enrichment.skill_name.lower())
            if idx is not None:
                skill = pass1.skill_requirements[idx]
                # Only overwrite if enriched context is meaningfully longer
                if not skill.context or len(enrichment.enriched_context) > len(skill.context or ""):
                    pass1.skill_requirements[idx] = skill.model_copy(
                        update={"context": enrichment.enriched_context}
                    )

        # Merge implied skills from pass2 — skip if already present in pass1
        for implied in pass2.implied_skills:
            key = implied.name.lower()
            if key not in existing_skills:
                pass1.skill_requirements.append(implied)
                existing_skills[key] = len(pass1.skill_requirements) - 1
            else:
                # Skill exists — enrich context if pass2 has better context
                idx = existing_skills[key]
                existing = pass1.skill_requirements[idx]
                if implied.context and (not existing.context or len(implied.context) > len(existing.context)):
                    pass1.skill_requirements[idx] = existing.model_copy(
                        update={"context": implied.context}
                    )

        # Merge additional domains (deduplicated by name)
        existing_domains = {d.name.lower() for d in pass1.domain_requirements}
        for domain in pass2.additional_domains:
            if domain.name.lower() not in existing_domains:
                pass1.domain_requirements.append(domain)
                existing_domains.add(domain.name.lower())

        # Merge additional work styles (deduplicated by style name)
        existing_styles = {w.style.lower() for w in pass1.work_styles}
        for ws in pass2.additional_work_styles:
            if ws.style.lower() not in existing_styles:
                pass1.work_styles.append(ws)
                existing_styles.add(ws.style.lower())

        # Merge additional soft requirements (deduplicated by trait)
        existing_traits = {s.trait.lower() for s in pass1.soft_requirements}
        for soft in pass2.additional_soft_requirements:
            if soft.trait.lower() not in existing_traits:
                pass1.soft_requirements.append(soft)
                existing_traits.add(soft.trait.lower())

        # Attach scope and seniority signals
        pass1.scope_signals = pass2.scope_signals
        pass1.seniority_signals = pass2.seniority_signals

        skill_count_explicit = sum(
            1 for s in pass1.skill_requirements if s.signal_type == "explicit"
        )
        skill_count_implied = len(pass1.skill_requirements) - skill_count_explicit
        label = f"{pass1.title} at {pass1.company}" if pass1.company else pass1.title
        logger.info(
            f"Job extraction synthesized: {label} — "
            f"{skill_count_explicit} explicit skills, {skill_count_implied} implied skills, "
            f"{len(pass1.domain_requirements)} domains, "
            f"{len(pass1.scope_signals)} scope signals, "
            f"{len(pass1.seniority_signals)} seniority signals"
        )
        return pass1

    async def describe_job_from_graph(self, job_id: str, neo4j_client) -> dict:
        """
        Query the job's complete graph — including deep profile nodes — and
        generate a rich natural-language job profile description.

        Returns a dict suitable for the GET /jobs/{job_id}/profile endpoint.
        """
        import json as _j

        # ── Query base job node ────────────────────────────────────────────────
        job_rows = await neo4j_client.run_query(
            "MATCH (j:Job {id: $id}) RETURN j",
            {"id": job_id},
        )
        job = job_rows[0]["j"] if job_rows else {}

        # ── Skill requirements ─────────────────────────────────────────────────
        skill_reqs = await neo4j_client.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(:JobSkillFamily)
                  -[:REQUIRES_SKILL]->(s:JobSkillRequirement)
            RETURN s.name AS name, s.required AS required,
                   s.importance AS importance, s.min_years AS min_years
            """,
            {"id": job_id},
        )

        # ── Domain requirements ────────────────────────────────────────────────
        domain_reqs = await neo4j_client.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
                  -[:HAS_DOMAIN_FAMILY_REQ]->(:JobDomainFamily)
                  -[:REQUIRES_DOMAIN]->(d:JobDomainRequirement)
            RETURN d.name AS name, d.min_years AS min_years
            """,
            {"id": job_id},
        )

        # ── Deep profile nodes ─────────────────────────────────────────────────
        edu_reqs = await neo4j_client.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_EDUCATION_REQ]->(e:EducationRequirement)
            RETURN e.degree_level AS degree_level, e.field AS field,
                   e.is_required AS is_required, e.alternatives AS alternatives,
                   e.description AS description
            """,
            {"id": job_id},
        )

        pref_quals = await neo4j_client.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_PREFERRED_QUAL]->(p:PreferredQualification)
            RETURN p.type AS type, p.value AS value,
                   p.description AS description, p.importance AS importance
            ORDER BY CASE p.importance
                WHEN 'strongly_preferred' THEN 0
                WHEN 'preferred' THEN 1
                ELSE 2 END
            """,
            {"id": job_id},
        )

        company_rows = await neo4j_client.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_COMPANY_PROFILE]->(c:CompanyProfile)
            RETURN c.mission AS mission, c.vision AS vision,
                   c.values AS values, c.stage AS stage,
                   c.product_description AS product_description,
                   c.industry AS industry, c.notable_tech AS notable_tech
            """,
            {"id": job_id},
        )

        team_rows = await neo4j_client.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_HIRING_TEAM]->(t:HiringTeam)
            RETURN t.name AS name, t.description AS description,
                   t.product_built AS product_built, t.team_size_est AS team_size_est,
                   t.tech_focus AS tech_focus, t.reports_to AS reports_to,
                   t.team_type AS team_type
            """,
            {"id": job_id},
        )

        comp_rows = await neo4j_client.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_COMPENSATION]->(c:CompensationPackage)
            RETURN c.salary_min AS salary_min, c.salary_max AS salary_max,
                   c.currency AS currency, c.equity AS equity,
                   c.benefits AS benefits, c.bonus_structure AS bonus_structure,
                   c.is_disclosed AS is_disclosed
            """,
            {"id": job_id},
        )

        role_rows = await neo4j_client.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_ROLE_EXPECTATIONS]->(r:RoleExpectation)
            RETURN r.key_responsibilities AS key_responsibilities,
                   r.success_metrics AS success_metrics,
                   r.first_30_days AS first_30_days,
                   r.first_90_days AS first_90_days,
                   r.autonomy_level AS autonomy_level
            """,
            {"id": job_id},
        )

        soft_reqs = await neo4j_client.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_SOFT_REQUIREMENTS]->(s:JobSoftRequirement)
            RETURN s.trait AS trait, s.description AS description,
                   s.is_dealbreaker AS is_dealbreaker
            ORDER BY s.is_dealbreaker DESC
            """,
            {"id": job_id},
        )

        # ── Parse JSON-stored list fields ──────────────────────────────────────
        def _parse_json_list(val) -> list:
            if not val:
                return []
            if isinstance(val, list):
                return val
            try:
                return _j.loads(val)
            except Exception:
                return [val] if val else []

        # Process company profile
        company_profile = None
        if company_rows and company_rows[0].get("mission") is not None:
            cp = company_rows[0]
            company_profile = {
                "mission": cp.get("mission"),
                "vision": cp.get("vision"),
                "values": _parse_json_list(cp.get("values")),
                "stage": cp.get("stage"),
                "product_description": cp.get("product_description"),
                "industry": cp.get("industry"),
                "notable_tech": _parse_json_list(cp.get("notable_tech")),
            }

        # Process hiring team
        hiring_team = None
        if team_rows and team_rows[0].get("name") is not None:
            t = team_rows[0]
            hiring_team = {
                "name": t.get("name"),
                "description": t.get("description"),
                "product_built": t.get("product_built"),
                "team_size_est": t.get("team_size_est"),
                "tech_focus": _parse_json_list(t.get("tech_focus")),
                "reports_to": t.get("reports_to"),
                "team_type": t.get("team_type"),
            }

        # Process compensation
        compensation = None
        if comp_rows:
            c = comp_rows[0]
            compensation = {
                "salary_min": c.get("salary_min"),
                "salary_max": c.get("salary_max"),
                "currency": c.get("currency", "USD"),
                "equity": c.get("equity"),
                "benefits": _parse_json_list(c.get("benefits")),
                "bonus_structure": c.get("bonus_structure"),
                "is_disclosed": c.get("is_disclosed", False),
            }

        # Process role expectations
        role_expectations = None
        if role_rows:
            r = role_rows[0]
            role_expectations = {
                "key_responsibilities": _parse_json_list(r.get("key_responsibilities")),
                "success_metrics": _parse_json_list(r.get("success_metrics")),
                "first_30_days": r.get("first_30_days"),
                "first_90_days": r.get("first_90_days"),
                "autonomy_level": r.get("autonomy_level", "moderate"),
            }

        return {
            "job_id": job_id,
            "title": job.get("title"),
            "company": job.get("company"),
            "remote_policy": job.get("remote_policy"),
            "company_size": job.get("company_size"),
            "experience_years_min": job.get("experience_years_min"),
            "tags": _parse_json_list(job.get("tags")),
            "description_preview": (job.get("raw_text") or "")[:300] or None,
            "skill_requirements": [dict(s) for s in skill_reqs],
            "domain_requirements": [dict(d) for d in domain_reqs],
            "education_requirements": [dict(e) for e in edu_reqs],
            "preferred_qualifications": [dict(p) for p in pref_quals],
            "company_profile": company_profile,
            "hiring_team": hiring_team,
            "compensation": compensation,
            "role_expectations": role_expectations,
            "soft_requirements": [dict(s) for s in soft_reqs],
        }

    async def describe_user_from_graph(self, user_id: str, neo4j_client) -> dict:
        """
        Query the user's complete graph - technical AND human portrait nodes - and
        generate a rich natural-language description alongside a computed completeness score.

        Returns a dict with:
          - LLM-generated profile (identity, career_arc, strengths, assessment, etc.)
          - completeness: DigitalTwinCompleteness (computed, not LLM-generated)
        """
        import json as _j

        # ── Technical nodes ───────────────────────────────────────────────────
        skills = await neo4j_client.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                  -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(s:Skill)
            OPTIONAL MATCH (p:Project {user_id: $id})-[r:DEMONSTRATES_SKILL]->(s)
            OPTIONAL MATCH (s)-[:GROUNDED_IN]->(anec:Anecdote)
            RETURN s.name AS name, s.years AS years, s.level AS level,
                   s.evidence_strength AS evidence_strength,
                   count(DISTINCT p) AS project_count,
                   collect(DISTINCT r.context)[0..2] AS contexts,
                   count(DISTINCT anec) AS anecdote_count
            ORDER BY project_count DESC, years DESC
            """,
            {"id": user_id},
        )
        domains = await neo4j_client.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_DOMAIN_CATEGORY]->(:DomainCategory)
                  -[:HAS_DOMAIN_FAMILY]->(:DomainFamily)-[:HAS_DOMAIN]->(d:Domain)
            RETURN d.name AS name, d.years_experience AS years, d.depth AS depth
            ORDER BY years DESC
            """,
            {"id": user_id},
        )
        projects = await neo4j_client.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_PROJECT_CATEGORY]->(:ProjectCategory)
                  -[:HAS_PROJECT]->(p:Project)
            RETURN p.name AS name, p.description AS description,
                   p.contribution_type AS contribution_type,
                   p.has_measurable_impact AS has_measurable_impact
            """,
            {"id": user_id},
        )
        experiences = await neo4j_client.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_EXPERIENCE_CATEGORY]->(:ExperienceCategory)
                  -[:HAS_EXPERIENCE]->(e:Experience)
            RETURN e.title AS title, e.company AS company,
                   e.duration_years AS duration_years,
                   e.description AS description,
                   e.accomplishments AS accomplishments,
                   e.contribution_type AS contribution_type
            ORDER BY e.duration_years DESC
            """,
            {"id": user_id},
        )
        assessment = await neo4j_client.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_ASSESSMENT]->(a:CriticalAssessment)
            RETURN a.overall_signal AS overall_signal,
                   a.seniority_assessment AS seniority_assessment,
                   a.depth_vs_breadth AS depth_vs_breadth,
                   a.candidate_identity AS candidate_identity,
                   a.honest_summary AS honest_summary,
                   a.genuine_strengths AS genuine_strengths,
                   a.red_flags AS red_flags,
                   a.five_w_h_summary AS five_w_h_summary,
                   a.interview_focus_areas AS interview_focus_areas
            """,
            {"id": user_id},
        )
        patterns = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_PATTERN_CATEGORY]->
                  (:PatternCategory)-[:HAS_PATTERN]->(p:ProblemSolvingPattern)
            RETURN p.pattern AS pattern, p.evidence AS evidence
            """,
            {"id": user_id},
        )

        # ── Extended profile nodes ────────────────────────────────────────────
        education = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_EDUCATION_CATEGORY]->(:EducationCategory)
                  -[:HAS_EDUCATION]->(e:Education)
            RETURN e.degree AS degree, e.field_of_study AS field_of_study,
                   e.institution AS institution, e.graduation_year AS graduation_year,
                   e.gpa AS gpa, e.honors AS honors, e.is_ongoing AS is_ongoing
            ORDER BY e.graduation_year DESC
            """,
            {"id": user_id},
        )
        certifications = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_CERTIFICATION_CATEGORY]->(:CertificationCategory)
                  -[:HAS_CERTIFICATION]->(c:Certification)
            RETURN c.name AS name, c.issuer AS issuer, c.date_obtained AS date_obtained,
                   c.expiry_date AS expiry_date, c.is_active AS is_active
            """,
            {"id": user_id},
        )
        achievements = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_ACHIEVEMENT_CATEGORY]->(:AchievementCategory)
                  -[:HAS_ACHIEVEMENT]->(a:Achievement)
            RETURN a.title AS title, a.type AS type, a.description AS description,
                   a.date AS date, a.impact AS impact
            ORDER BY a.date DESC
            """,
            {"id": user_id},
        )
        publications = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_PUBLICATION_CATEGORY]->(:PublicationCategory)
                  -[:HAS_PUBLICATION]->(p:Publication)
            RETURN p.title AS title, p.type AS type, p.venue AS venue,
                   p.year AS year, p.description AS description,
                   p.is_first_author AS is_first_author
            ORDER BY p.year DESC
            """,
            {"id": user_id},
        )
        coursework = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_COURSEWORK_CATEGORY]->(:CourseworkCategory)
                  -[:HAS_COURSE]->(c:Course)
            RETURN c.name AS name, c.provider AS provider, c.type AS type,
                   c.year_completed AS year_completed, c.relevance_note AS relevance_note
            """,
            {"id": user_id},
        )
        languages = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_LANGUAGE_CATEGORY]->(:LanguageCategory)
                  -[:HAS_LANGUAGE]->(l:Language)
            RETURN l.name AS name, l.proficiency AS proficiency
            """,
            {"id": user_id},
        )
        volunteer_work = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_VOLUNTEER_CATEGORY]->(:VolunteerCategory)
                  -[:HAS_VOLUNTEER]->(v:VolunteerWork)
            RETURN v.role AS role, v.organization AS organization,
                   v.description AS description, v.duration_years AS duration_years
            """,
            {"id": user_id},
        )

        # ── Human portrait nodes ──────────────────────────────────────────────
        anecdotes = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_ANECDOTE]->(a:Anecdote)
            RETURN a.name AS name, a.situation AS situation, a.action AS action,
                   a.result AS result, a.lesson_learned AS lesson_learned,
                   a.confidence_signal AS confidence_signal,
                   a.spontaneous AS spontaneous
            """,
            {"id": user_id},
        )
        motivations = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:MOTIVATED_BY]->(m:Motivation)
            RETURN m.category AS category, m.strength AS strength, m.evidence AS evidence
            ORDER BY m.strength DESC
            """,
            {"id": user_id},
        )
        values = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HOLDS_VALUE]->(v:Value)
            RETURN v.name AS name, v.priority_rank AS priority_rank, v.evidence AS evidence
            ORDER BY v.priority_rank
            """,
            {"id": user_id},
        )
        goals = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:ASPIRES_TO]->(g:Goal)
            RETURN g.type AS type, g.description AS description,
                   g.timeframe_years AS timeframe_years, g.clarity_level AS clarity_level
            """,
            {"id": user_id},
        )
        culture_identity = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_CULTURE_IDENTITY]->(c:CultureIdentity)
            RETURN c.team_size_preference AS team_size_preference,
                   c.leadership_style AS leadership_style,
                   c.feedback_preference AS feedback_preference,
                   c.pace_preference AS pace_preference,
                   c.conflict_style AS conflict_style,
                   c.energy_sources AS energy_sources,
                   c.energy_drains AS energy_drains
            """,
            {"id": user_id},
        )
        behavioral_insights = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_BEHAVIORAL_INSIGHT]->(b:BehavioralInsight)
            RETURN b.insight_type AS insight_type, b.trigger AS trigger,
                   b.implication AS implication
            """,
            {"id": user_id},
        )

        # ── Profile verification status ───────────────────────────────────────
        verification = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})
            RETURN u.id AS id
            """,
            {"id": user_id},
        )

        # ── Compute completeness (deterministic, not LLM) ─────────────────────
        completeness = self._compute_digital_twin_completeness(
            skills=skills,
            projects=projects,
            experiences=experiences,
            has_assessment=bool(assessment),
            patterns=patterns,
            anecdotes=[a for a in anecdotes if a.get("name")],
            motivations=[m for m in motivations if m.get("category")],
            values=[v for v in values if v.get("name")],
            goals=[g for g in goals if g.get("description")],
            culture_identity=culture_identity[0] if culture_identity and culture_identity[0].get("pace_preference") else None,
            behavioral_insights=[b for b in behavioral_insights if b.get("insight_type")],
        )

        # ── Build full graph data for LLM ─────────────────────────────────────
        graph_data = {
            "skills": skills,
            "domains": domains,
            "projects": projects,
            "experiences": experiences,
            "education": [e for e in education if e.get("degree")],
            "certifications": [c for c in certifications if c.get("name")],
            "achievements": [a for a in achievements if a.get("title")],
            "publications": [p for p in publications if p.get("title")],
            "coursework": [c for c in coursework if c.get("name")],
            "languages": [l for l in languages if l.get("name")],
            "volunteer_work": [v for v in volunteer_work if v.get("role")],
            "assessment": assessment[0] if assessment else {},
            "patterns": [p for p in patterns if p.get("pattern")],
            # Human portrait - included only if data exists
            "anecdotes": [a for a in anecdotes if a.get("name")],
            "motivations": [m for m in motivations if m.get("category")],
            "values": [v for v in values if v.get("name")],
            "goals": [g for g in goals if g.get("description")],
            "culture_identity": culture_identity[0] if culture_identity and culture_identity[0].get("pace_preference") else None,
            "behavioral_insights": [b for b in behavioral_insights if b.get("insight_type")],
        }

        system_msg = (
            "You are a senior engineering manager writing an honest, insightful professional profile "
            "of a candidate based on their complete knowledge graph - both technical skills and "
            "the human portrait captured through the deep interview.\n\n"
            "This profile is shown to the candidate themselves so they understand how they are perceived "
            "by recruiters. Be specific, evidence-based, and honest - not flattering.\n\n"
            "If education data exists, summarize their academic background in career_arc.\n"
            "If certifications exist, mention the strongest ones in technical_profile.\n"
            "If achievements/awards exist, reference them in core_strengths.\n"
            "If publications/research exist, note them - they are strong evidence of depth.\n"
            "If motivations, values, goals, or culture identity data exist, incorporate them.\n"
            "If anecdotes exist, reference the stories - they are stronger evidence than skill claims.\n"
            "If behavioral insights exist, note them honestly.\n\n"
            "Return a JSON object with these exact keys:\n"
            "{\n"
            "  \"identity\": \"1-sentence professional identity statement\",\n"
            "  \"career_arc\": \"2-3 sentences describing their career progression and trajectory, "
            "including educational background\",\n"
            "  \"who_they_are\": \"2-3 sentences on what drives them, how they work, and what they care about - "
            "based on motivations/values/culture data if available, otherwise omit or note as unknown\",\n"
            "  \"core_strengths\": [\"strength 1 with evidence - cite anecdotes/achievements where available\"],\n"
            "  \"domain_expertise\": \"paragraph about domain depth and industry context\",\n"
            "  \"technical_profile\": \"paragraph about technical skills, depth vs breadth, "
            "evidence quality, notable certifications\",\n"
            "  \"honest_assessment\": \"paragraph: what they can genuinely do, what level they are at, "
            "what they have not yet demonstrated\",\n"
            "  \"gaps_and_concerns\": [\"specific gap or concern with evidence - be direct\"],\n"
            "  \"best_suited_for\": \"what kind of role, team, company size, culture, and problem type "
            "this person is best matched with - use culture identity data if present\",\n"
            "  \"interview_ready_summary\": \"what a recruiter needs to know before interviewing in 2-3 sentences\"\n"
            "}\n"
            "Return ONLY valid JSON."
        )

        user_msg = (
            f"Generate a professional profile for user: {user_id}\n\n"
            f"COMPLETE GRAPH DATA:\n{_j.dumps(graph_data, indent=2, default=str)}"
        )

        raw = await self._call_with_retry(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=1.0,
        )

        try:
            description = _j.loads(raw)
        except Exception:
            description = {"identity": raw, "error": "parse_failed"}

        # Attach structured data for frontend display
        description["education"] = graph_data["education"]
        description["certifications"] = graph_data["certifications"]
        description["achievements"] = graph_data["achievements"]
        description["publications"] = graph_data["publications"]
        description["coursework"] = graph_data["coursework"]
        description["languages"] = graph_data["languages"]
        description["volunteer_work"] = graph_data["volunteer_work"]
        description["completeness"] = completeness.model_dump()
        return description

    def _compute_digital_twin_completeness(
        self,
        skills: list,
        projects: list,
        experiences: list,
        has_assessment: bool,
        patterns: list,
        anecdotes: list,
        motivations: list,
        values: list,
        goals: list,
        culture_identity: dict | None,
        behavioral_insights: list,
    ):
        """
        Compute the DigitalTwinCompleteness score - deterministic, no LLM.

        Technical depth scoring (contributes 50% of overall):
          Skills evidence quality:  40% of tech score
          Projects with impact:     30% of tech score
          Experiences + accmplshmt: 20% of tech score
          Skills with anecdotes:    10% of tech score

        Human depth scoring (contributes 50% of overall):
          Anecdotes (cap at 5):     30% of human score
          Motivation identified:    20% of human score
          Values identified:        15% of human score
          Goal set:                 15% of human score
          Culture identity built:   15% of human score
          Behavioral insights:       5% of human score
        """
        from models.schemas import (
            DigitalTwinCompleteness, TechnicalDepthBreakdown, HumanDepthBreakdown
        )

        # ── Technical depth ────────────────────────────────────────────────────
        total_skills  = len(skills)
        claimed_only  = sum(1 for s in skills if s.get("evidence_strength") == "claimed_only")
        evidenced     = sum(1 for s in skills if s.get("evidence_strength") in
                           ("mentioned_once", "project_backed", "multiple_productions"))
        with_anecdotes = sum(1 for s in skills if (s.get("anecdote_count") or 0) > 0)

        total_projects = len(projects)
        with_impact    = sum(1 for p in projects if p.get("has_measurable_impact"))

        total_exp    = len(experiences)
        with_accomp  = sum(
            1 for e in experiences
            if e.get("accomplishments") and len(e["accomplishments"]) > 0
        )

        # Sub-scores (0.0–1.0)
        skill_evidence_score = (evidenced / total_skills) if total_skills else 0.0
        project_impact_score = (with_impact / total_projects) if total_projects else 0.0
        exp_accomp_score     = (with_accomp / total_exp) if total_exp else 0.0
        anecdote_skill_score = (with_anecdotes / total_skills) if total_skills else 0.0

        tech_raw = (
            skill_evidence_score * 0.40 +
            project_impact_score * 0.30 +
            exp_accomp_score     * 0.20 +
            anecdote_skill_score * 0.10
        )
        # Assessment bonus: cap the raw score at 0.95 without it, full 1.0 with it
        if not has_assessment:
            tech_raw = min(tech_raw, 0.90)
        tech_pct = round(tech_raw * 100)

        # ── Human depth ────────────────────────────────────────────────────────
        anecdote_target  = 5
        anecdote_count   = len(anecdotes)
        anecdote_score   = min(anecdote_count / anecdote_target, 1.0)
        has_motivation   = len(motivations) > 0
        has_values       = len(values) > 0
        has_goal         = len(goals) > 0
        has_culture      = culture_identity is not None
        has_behavior     = len(behavioral_insights) > 0

        human_raw = (
            anecdote_score       * 0.30 +
            (1.0 if has_motivation else 0.0) * 0.20 +
            (1.0 if has_values    else 0.0) * 0.15 +
            (1.0 if has_goal      else 0.0) * 0.15 +
            (1.0 if has_culture   else 0.0) * 0.15 +
            (1.0 if has_behavior  else 0.0) * 0.05
        )
        human_pct = round(human_raw * 100)

        overall_pct = round((tech_pct + human_pct) / 2)

        # ── Matching capability flags ──────────────────────────────────────────
        evidence_weighted_active = evidenced > 0
        soft_skill_active        = len([p for p in patterns if p.get("pattern")]) > 0
        culture_active           = has_culture

        # ── Profile verification (check critical flags in SQLite via approximation) ─
        # We don't have SQLite here - will be enriched by the route if needed.
        # Approximate: assume verified if assessment exists and evidenced > claimed.
        profile_verified = has_assessment and evidenced >= claimed_only

        # ── Missing dimensions (actionable, honest) ────────────────────────────
        missing: list[str] = []

        if claimed_only > 0:
            missing.append(
                f"{claimed_only} skill(s) have only 'claimed' evidence - "
                f"their matching weight is reduced to 30%. "
                f"Add projects or anecdotes to strengthen them."
            )
        if with_anecdotes == 0 and total_skills > 0:
            missing.append(
                "No anecdotes captured yet. Recruiters can't see the stories behind your skills. "
                "Start the deep profile interview."
            )
        elif with_anecdotes < total_skills and total_skills > 0:
            missing.append(
                f"{total_skills - with_anecdotes} skill(s) have no backing story. "
                f"The more stories we have, the more accurately we can describe your experience."
            )
        if not has_motivation:
            missing.append(
                "Motivation not identified. We can't match you to companies whose mission aligns "
                "with what drives you."
            )
        if not has_values:
            missing.append(
                "Core values not captured. Role culture matching will miss alignment signals."
            )
        if not has_goal:
            missing.append(
                "No career goal set. We can't prioritise growth-oriented or leadership roles for you."
            )
        if not has_culture:
            missing.append(
                "Culture identity incomplete - culture fit scoring is disabled for your matches. "
                "This is 15% of your total match score."
            )
        if not has_assessment:
            missing.append(
                "Critical assessment not generated. Re-ingest your profile to produce it."
            )
        if total_projects == 0:
            missing.append("No projects in your profile - skill evidence cannot be project-backed.")
        elif with_impact == 0:
            missing.append(
                "None of your projects have measurable impact. "
                "Add metrics (users, latency, revenue) to strengthen your evidence."
            )

        # ── Next action ────────────────────────────────────────────────────────
        if human_pct < 20:
            next_action = (
                "Start the deep profile interview - your human portrait is nearly empty. "
                "Culture fit scoring and motivation matching are currently disabled for you."
            )
        elif not has_motivation:
            next_action = (
                "Continue the profile interview to capture what drives you. "
                "This enables motivation-based matching."
            )
        elif not has_goal:
            next_action = (
                "Tell us your 5-year goal. This unlocks role trajectory matching."
            )
        elif not has_culture:
            next_action = (
                "Complete the culture identity section of your interview. "
                "This activates culture fit scoring (15% of your match score)."
            )
        elif claimed_only > 0:
            next_action = (
                f"Add stories or projects for {claimed_only} skill(s) sitting at 'claimed only'. "
                f"Each one currently scores at 30% weight in matching."
            )
        elif with_anecdotes < total_skills:
            next_action = (
                f"Add anecdotes for {total_skills - with_anecdotes} more skill(s). "
                f"Recruiters see the story - not just the skill name."
            )
        else:
            next_action = (
                "Your profile is strong. Keep it updated as you ship new work."
            )

        return DigitalTwinCompleteness(
            overall_pct=overall_pct,
            technical_depth=TechnicalDepthBreakdown(
                score_pct=tech_pct,
                skills_total=total_skills,
                skills_evidenced=evidenced,
                skills_with_anecdotes=with_anecdotes,
                skills_claimed_only=claimed_only,
                projects_total=total_projects,
                projects_with_impact=with_impact,
                experiences_total=total_exp,
                experiences_with_accomplishments=with_accomp,
                has_critical_assessment=has_assessment,
            ),
            human_depth=HumanDepthBreakdown(
                score_pct=human_pct,
                anecdotes_count=anecdote_count,
                anecdotes_target=anecdote_target,
                motivations_identified=has_motivation,
                values_identified=has_values,
                goal_set=has_goal,
                culture_identity_built=has_culture,
                behavioral_insights_count=len(behavioral_insights),
                culture_matching_enabled=has_culture,
            ),
            evidence_weighted_scoring_active=evidence_weighted_active,
            soft_skill_scoring_active=soft_skill_active,
            culture_fit_scoring_active=culture_active,
            profile_verified=profile_verified,
            missing_dimensions=missing,
            next_action=next_action,
        )

    async def compute_completeness(self, user_id: str, neo4j_client) -> "DigitalTwinCompleteness":
        """
        Compute digital twin completeness without calling the LLM.

        Runs only the graph queries needed for the deterministic scoring model.
        Much faster than describe_user_from_graph() - suitable for dashboard polling
        and profile progress UIs that don't need the full LLM-generated description.
        """
        skills = await neo4j_client.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                  -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(s:Skill)
            OPTIONAL MATCH (s)-[:GROUNDED_IN]->(anec:Anecdote)
            RETURN s.evidence_strength AS evidence_strength,
                   count(DISTINCT anec) AS anecdote_count
            """,
            {"id": user_id},
        )
        projects = await neo4j_client.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_PROJECT_CATEGORY]->(:ProjectCategory)
                  -[:HAS_PROJECT]->(p:Project)
            RETURN p.has_measurable_impact AS has_measurable_impact
            """,
            {"id": user_id},
        )
        experiences = await neo4j_client.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_EXPERIENCE_CATEGORY]->(:ExperienceCategory)
                  -[:HAS_EXPERIENCE]->(e:Experience)
            RETURN e.accomplishments AS accomplishments
            """,
            {"id": user_id},
        )
        has_assessment_rows = await neo4j_client.run_query(
            "OPTIONAL MATCH (u:User {id: $id})-[:HAS_ASSESSMENT]->(a:CriticalAssessment) RETURN a.overall_signal AS sig",
            {"id": user_id},
        )
        has_assessment = bool(has_assessment_rows and has_assessment_rows[0].get("sig"))

        patterns = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_PATTERN_CATEGORY]->
                  (:PatternCategory)-[:HAS_PATTERN]->(p:ProblemSolvingPattern)
            RETURN p.pattern AS pattern
            """,
            {"id": user_id},
        )
        anecdotes = await neo4j_client.run_query(
            "OPTIONAL MATCH (u:User {id: $id})-[:HAS_ANECDOTE]->(a:Anecdote) RETURN a.name AS name",
            {"id": user_id},
        )
        motivations = await neo4j_client.run_query(
            "OPTIONAL MATCH (u:User {id: $id})-[:MOTIVATED_BY]->(m:Motivation) RETURN m.category AS category",
            {"id": user_id},
        )
        values = await neo4j_client.run_query(
            "OPTIONAL MATCH (u:User {id: $id})-[:HOLDS_VALUE]->(v:Value) RETURN v.name AS name",
            {"id": user_id},
        )
        goals = await neo4j_client.run_query(
            "OPTIONAL MATCH (u:User {id: $id})-[:ASPIRES_TO]->(g:Goal) RETURN g.description AS description",
            {"id": user_id},
        )
        culture_identity = await neo4j_client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $id})-[:HAS_CULTURE_IDENTITY]->(c:CultureIdentity)
            RETURN c.pace_preference AS pace_preference
            """,
            {"id": user_id},
        )
        behavioral_insights = await neo4j_client.run_query(
            "OPTIONAL MATCH (u:User {id: $id})-[:HAS_BEHAVIORAL_INSIGHT]->(b:BehavioralInsight) RETURN b.insight_type AS insight_type",
            {"id": user_id},
        )

        return self._compute_digital_twin_completeness(
            skills=skills,
            projects=projects,
            experiences=experiences,
            has_assessment=has_assessment,
            patterns=patterns,
            anecdotes=[a for a in anecdotes if a.get("name")],
            motivations=[m for m in motivations if m.get("category")],
            values=[v for v in values if v.get("name")],
            goals=[g for g in goals if g.get("description")],
            culture_identity=culture_identity[0] if culture_identity and culture_identity[0].get("pace_preference") else None,
            behavioral_insights=[b for b in behavioral_insights if b.get("insight_type")],
        )
