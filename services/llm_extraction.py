"""
Groq-based structured extraction service.

Uses the Groq Python SDK (AsyncGroq) with JSON mode to enforce structured output.
Groq does not accept a Pydantic response_schema directly, so the full Pydantic
JSON schema is embedded in the system prompt and response_format={"type":
"json_object"} is used to guarantee the response is valid JSON.

Model choice: llama-3.3-70b-versatile
  - Best instruction following on Groq for complex structured extraction
  - 128k context window handles long resumes
  - Near-instant inference on Groq hardware despite being 70B
"""

import asyncio
import json
import logging
import os

from groq import AsyncGroq

from models.schemas import UserProfileExtraction, JobPostingExtraction
from models.taxonomies import SKILL_TAXONOMY, DOMAIN_TAXONOMY

logger = logging.getLogger(__name__)

# Pre-compute JSON schemas once at module load — included in every system prompt
# so the model knows exactly what structure to return.
_USER_SCHEMA = json.dumps(UserProfileExtraction.model_json_schema(), indent=2)
_JOB_SCHEMA = json.dumps(JobPostingExtraction.model_json_schema(), indent=2)


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


class LLMExtractionService:
    """
    Wraps Groq API for structured JSON extraction.

    Uses AsyncGroq with response_format={"type": "json_object"} and a
    system prompt that includes the full Pydantic JSON schema. The response
    is parsed with model_validate_json() for strict Pydantic validation.

    The schema is passed in the system message so the model treats it as a
    hard constraint rather than a soft suggestion.
    """

    def __init__(self):
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY environment variable not set")

        self._model_name = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
        self._client = AsyncGroq(api_key=api_key)
        self._skill_hint = _build_skill_taxonomy_hint()
        self._domain_hint = _build_domain_taxonomy_hint()
        logger.info(f"LLM extraction service initialized with model: {self._model_name}")

    async def _call_with_retry(self, **kwargs) -> str:
        """Call Groq API with exponential backoff (3 attempts: immediate, 1s, 2s)."""
        for attempt in range(3):
            try:
                resp = await self._client.chat.completions.create(**kwargs)
                return resp.choices[0].message.content
            except Exception as e:
                if attempt == 2:
                    raise
                wait = 2 ** attempt
                logger.warning(f"Groq API error (attempt {attempt + 1}/3): {e}. Retrying in {wait}s")
                await asyncio.sleep(wait)

    async def extract_user_profile(self, profile_text: str) -> UserProfileExtraction:
        """
        Extract structured user profile from raw resume/profile text.

        Returns a validated UserProfileExtraction with skills, projects,
        domains, experiences, preferences, and problem-solving patterns.
        """
        system_msg = (
            "You are a senior engineering manager and technical recruiter conducting a rigorous, "
            "evidence-based analysis of a candidate profile. Your job is NOT to be flattering — "
            "it is to extract structured data AND produce a brutally honest assessment of what "
            "this person can actually do versus what they merely claim.\n\n"
            "EXTRACTION RULES:\n"
            "1. For each skill, assess evidence_strength honestly: did they just list it, or do "
            "   they have concrete project evidence? 'expert' level requires multiple production projects.\n"
            "2. For each project, extract HOW each skill was specifically used (not just that it was used). "
            "   Capture contribution_type honestly — 'sole_engineer' only if they clearly built it alone.\n"
            "3. For each experience, extract concrete accomplishments with metrics where present. "
            "   If the profile is vague, reflect that vagueness — do NOT invent specifics.\n"
            "4. For the critical assessment: think like a skeptical EM reading this resume before "
            "   a hiring committee. What would concern you? What is well-evidenced? "
            "   What level is this person REALLY at (not what their title says)?\n"
            "5. Flag inflated skills: if someone claims 'expert' in 15 technologies, that's a red flag.\n"
            "6. overall_signal 'misleading' if claims are materially unsupported by evidence.\n\n"
            "INTERPRETATION FLAGS — THIS IS CRITICAL:\n"
            "For EVERY field where you made an inference (rather than reading it directly), "
            "create an interpretation_flag. A flag must be created when:\n"
            "  - Years of experience was calculated/inferred (not stated explicitly)\n"
            "  - Skill level was inferred from job titles or context (not stated)\n"
            "  - Contribution type is ambiguous ('we built', 'our team' without clarity on their role)\n"
            "  - Domain depth was guessed from industry rather than described\n"
            "  - Any claim seems inconsistent with other evidence\n"
            "  - Accomplishments were vague and you had to guess the impact\n"
            "The clarification_question must quote the actual resume text and ask a specific, "
            "answerable question. Use suggested_options for multiple-choice fields "
            "(e.g. skill levels, contribution types, depths).\n\n"
            "SCHEMA CONSTRAINTS:\n"
            "- skill.family must be one of: Programming Languages, Web Frameworks, "
            "Databases, Cloud & DevOps, ML & AI, Data Engineering, Mobile Development, "
            "Testing & QA, Analytics & Visualization, Other\n"
            "- domain.family must be one of: FinTech, Healthcare, E-commerce, SaaS, "
            "Enterprise, Gaming, Education, Other\n"
            "- Return an empty list [] for any section with no data — never omit keys.\n"
            "- Return ONLY valid JSON matching this exact schema:\n\n"
            f"{_USER_SCHEMA}"
        )

        user_msg = (
            "Analyze this professional profile. Extract all structured data, produce a critical "
            "assessment through the lens of a skeptical engineering manager, AND generate "
            "interpretation_flags for every uncertain inference.\n\n"
            "For each project, describe HOW each skill was used — not just that it was used. "
            "For each skill, honestly assess evidence_strength. "
            "In the assessment, be direct about red flags, inflated claims, and genuine strengths.\n\n"
            "Remember: every inference you make (not directly stated) needs an interpretation_flag "
            "so the user can verify or correct it.\n\n"
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
            temperature=0.1,
        )
        extracted = UserProfileExtraction.model_validate_json(raw_json)
        logger.info(
            f"Extracted: {len(extracted.skills)} skills, "
            f"{len(extracted.projects)} projects, "
            f"{len(extracted.domains)} domains"
        )
        return extracted

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
        missing_skills: list[str],
        matched_domains: list[str],
        missing_domains: list[str],
        paths: list[str],
        perspective: str = "recruiter",
        rich_context: dict | None = None,
    ) -> dict:
        """
        Generate a structured, evidence-based explanation of a user-job match.

        Uses rich_context (skill evidence, 5W+H usage, critical assessment, domain depth)
        to produce a detailed, actionable analysis — not just name-matching.

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

            how_str = " — " + " | ".join(how_parts) if how_parts else ""
            skill_lines.append(
                f"  • {name} [{imp}]: {level}, {years_str}{min_str}, {ev_label}{how_str}"
            )

        # Fall back to flat list if rich context not available
        if not skill_lines and matched_skills:
            skill_lines = [f"  • {s}" for s in matched_skills]

        # ── Format gaps ──────────────────────────────────────────────────────────
        must_gap_lines = []
        for g in ctx.get("missing_must_have", []):
            sk = g.get("skill", "?")
            my = g.get("min_years")
            must_gap_lines.append(f"  • {sk} (must_have{f', {my}yr min' if my else ''})")
        if not must_gap_lines:
            must_gap_lines = [f"  • {s}" for s in missing_skills if s]

        nice_gaps = ctx.get("missing_nice", [m for m in missing_skills if m not in
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
                "Tone: honest and constructive — help them understand their fit and what to prepare. "
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
                "Tone: professional recruiter/hiring manager lens — direct, honest, evidence-based. "
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
            "with what evidence quality — not just which skill names match. "
            "Your analysis must go beyond surface-level name matching to assess genuine fit.\n\n"
            "Return ONLY valid JSON matching this exact schema:\n"
            "{\n"
            '  "verdict": "Strong match" | "Good match" | "Moderate match" | "Weak match" | "Not recommended",\n'
            '  "headline": "1 sentence: who this person is and why they do/do not fit this specific role",\n'
            '  "why_they_fit": ["skill or domain with specific evidence and context — not just names"],\n'
            '  "critical_gaps": ["must-have gaps with explanation of impact on this role"],\n'
            '  "nice_to_have_gaps": ["lower priority gaps"],\n'
            '  "seniority_fit": "1-2 sentences: assessed level vs what the role needs",\n'
            '  "honest_take": "2-3 sentences: evidence-backed assessment of genuine strengths and concerns",\n'
            '  "recommendation": "Hire | Proceed to technical screen | Conditional consider | Pass — with 1 sentence rationale",\n'
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
            "═══ MATCHED SKILLS (with evidence quality + how actually used) ═══\n"
            + ("\n".join(skill_lines) or "  None")
            + "\n\n"
            "═══ CRITICAL GAPS (must-have skills not in profile) ═══\n"
            + ("\n".join(must_gap_lines) or "  None — all must-haves covered")
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
            + "\n\n"
            f"{person_instr}\n"
            f"{output_guidance}\n\n"
            "Generate the structured match explanation. Be specific — use actual skill names, "
            "evidence levels, and context from the data above. Do NOT be generic."
        )

        raw = await self._call_with_retry(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )

        try:
            return _j.loads(raw)
        except Exception:
            # Fallback: wrap raw text so callers always get a dict
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

    async def extract_job_posting(self, job_text: str) -> JobPostingExtraction:
        """
        Extract structured job requirements from raw job posting text.

        Returns a validated JobPostingExtraction with skill requirements,
        domain requirements, work styles, and company metadata.
        """
        system_msg = (
            "You are an expert HR data extractor. Extract structured job requirements "
            "and return ONLY valid JSON matching this exact schema:\n\n"
            f"{_JOB_SCHEMA}\n\n"
            "Constraints:\n"
            "- skill.family must be one of: Programming Languages, Web Frameworks, "
            "Databases, Cloud & DevOps, ML & AI, Data Engineering, Mobile Development, "
            "Testing & QA, Analytics & Visualization, Other\n"
            "- domain.family must be one of: FinTech, Healthcare, E-commerce, SaaS, "
            "Enterprise, Gaming, Education, Other\n"
            "- remote_policy must be one of: 'remote', 'hybrid', 'onsite'\n"
            "- company_size must be one of: 'startup', 'mid-size', 'enterprise'\n"
            "- importance must be one of: 'must_have', 'nice_to_have'\n"
            "- Return an empty list [] for any section with no data — never omit keys."
        )

        user_msg = (
            "Extract all job requirements from the following job posting.\n\n"
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
            temperature=0.1,
        )
        extracted = JobPostingExtraction.model_validate_json(raw_json)
        logger.info(
            f"Extracted job: {extracted.title} at {extracted.company} — "
            f"{len(extracted.skill_requirements)} skill requirements"
        )
        return extracted

    async def describe_user_from_graph(self, user_id: str, neo4j_client) -> dict:
        """
        Query the user's graph and generate a rich natural-language description.
        Returns a dict with identity, summary, strengths, concerns, career_arc, best_suited_for.
        """
        # Fetch all relevant graph data
        skills = await neo4j_client.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                  -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(s:Skill)
            OPTIONAL MATCH (p:Project {user_id: $id})-[r:DEMONSTRATES_SKILL]->(s)
            RETURN s.name AS name, s.years AS years, s.level AS level,
                   s.evidence_strength AS evidence_strength,
                   count(p) AS project_count,
                   collect(r.context)[0..2] AS contexts
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

        graph_data = {
            "skills": skills,
            "domains": domains,
            "projects": projects,
            "experiences": experiences,
            "assessment": assessment[0] if assessment else {},
        }

        system_msg = (
            "You are a senior engineering manager writing an honest, insightful professional profile "
            "of a candidate based on their knowledge graph data. This will be shown to the candidate "
            "themselves so they can see how they are perceived. Be specific, evidence-based, and honest — "
            "not flattering. Include both strengths and gaps.\n\n"
            "Return a JSON object with these exact keys:\n"
            "{\n"
            "  \"identity\": \"1-sentence professional identity statement\",\n"
            "  \"career_arc\": \"2-3 sentences describing their career progression and trajectory\",\n"
            "  \"core_strengths\": [\"strength 1 with evidence\", \"strength 2 with evidence\"],\n"
            "  \"domain_expertise\": \"paragraph about their domain depth and industry context\",\n"
            "  \"technical_profile\": \"paragraph about their technical skills, depth vs breadth\",\n"
            "  \"honest_assessment\": \"paragraph: what they can genuinely do well, what level they're at\",\n"
            "  \"gaps_and_concerns\": [\"specific gap or concern with evidence\"],\n"
            "  \"best_suited_for\": \"what kind of role, team, company size, and problems they are best matched with\",\n"
            "  \"interview_ready_summary\": \"what a recruiter needs to know before interviewing them in 2-3 sentences\"\n"
            "}\n"
            "Return ONLY valid JSON."
        )

        user_msg = (
            f"Generate a professional profile description for user: {user_id}\n\n"
            f"GRAPH DATA:\n{json.dumps(graph_data, indent=2, default=str)}"
        )

        raw = await self._call_with_retry(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )

        import json as _j
        try:
            return _j.loads(raw)
        except Exception:
            return {"identity": raw, "error": "parse_failed"}
