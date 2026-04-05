"""
LLM ingestion service - writes the extracted hierarchy into Neo4j.

Every node and relationship created here is tagged source='llm'. This provenance
tag is used later by the graph merger and visualization service to filter views.

Schema created (User side):
  User → SkillCategory → SkillFamily → Skill
  User → ProjectCategory → Project → (DEMONSTRATES_SKILL) → Skill
  User → DomainCategory → DomainFamily → Domain
  User → ExperienceCategory → Experience
  User → PreferenceCategory → Preference
  User → PatternCategory → ProblemSolvingPattern
"""

import logging
from database.neo4j_client import Neo4jClient
from models.schemas import UserProfileExtraction, JobPostingExtraction
from services.vector_embedding import VectorEmbeddingService
from services.weights import recompute_weights

logger = logging.getLogger(__name__)

def _normalize_name(name: str | None) -> str | None:
    """Strip whitespace and return None for empty/null names."""
    if not name:
        return None
    stripped = name.strip()
    return stripped if stripped else None


def _build_lower_map(rows: list[dict], key: str = "name") -> dict[str, str]:
    """
    Build a lowercase → canonical display name lookup from existing DB rows.

    Used to resolve incoming names case-insensitively against what is already
    stored in Neo4j so that re-uploads with different capitalisation or minor
    variants (e.g. 'python' vs 'Python', 'btech' vs 'Bachelor of Technology')
    find the existing node rather than creating a duplicate.
    """
    return {r[key].lower(): r[key] for r in rows if r.get(key)}


class LLMIngestionService:
    def __init__(self, client: Neo4jClient):
        self.client = client
        self._embedder = VectorEmbeddingService(client)

    # ──────────────────────────────────────────────────────────────────────────
    # USER INGESTION
    # ──────────────────────────────────────────────────────────────────────────

    async def ingest_user_profile(
        self, user_id: str, extraction: UserProfileExtraction
    ) -> None:
        """Build the full user hierarchy in Neo4j from LLM extraction output."""
        await self._create_user_node(user_id)
        await self._ingest_skills(user_id, extraction.skills)
        await self._ingest_projects(user_id, extraction.projects)
        await self._ingest_domains(user_id, extraction.domains)
        await self._ingest_experiences(user_id, extraction.experiences)
        await self._ingest_education(user_id, getattr(extraction, "education", []) or [])
        await self._ingest_certifications(user_id, getattr(extraction, "certifications", []) or [])
        await self._ingest_achievements(user_id, getattr(extraction, "achievements", []) or [])
        await self._ingest_publications(user_id, getattr(extraction, "publications", []) or [])
        await self._ingest_coursework(user_id, getattr(extraction, "coursework", []) or [])
        await self._ingest_languages(user_id, getattr(extraction, "languages", []) or [])
        await self._ingest_volunteer_work(user_id, getattr(extraction, "volunteer_work", []) or [])
        await self._ingest_preferences(user_id, extraction.preferences)
        await self._ingest_patterns(user_id, extraction.patterns)
        if extraction.assessment:
            await self._ingest_assessment(user_id, extraction.assessment)
        await recompute_weights(user_id, self.client)
        logger.info(f"LLM hierarchy written for user {user_id}")

    async def _create_user_node(self, user_id: str) -> None:
        await self.client.run_write(
            """
            MERGE (u:User {id: $user_id})
            SET u.updated_at = timestamp()
            """,
            {"user_id": user_id},
        )

    async def _ingest_skills(self, user_id: str, skills: list) -> None:
        # Pre-load existing skill names for case-insensitive dedup on re-upload.
        # 'Python' and 'python' will both resolve to the already-stored form.
        existing_rows = await self.client.run_query(
            "MATCH (s:Skill {user_id: $user_id}) RETURN s.name AS name",
            {"user_id": user_id},
        )
        lower_map = _build_lower_map(existing_rows)

        for skill in skills:
            name = _normalize_name(skill.name)
            if not name:
                continue
            # If an equivalent node already exists, use its stored display name
            name = lower_map.get(name.lower(), name)
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                OPTIONAL MATCH (:SkillFamily {user_id: $user_id})-[old_r:HAS_SKILL]->(:Skill {name: $name, user_id: $user_id})
                DELETE old_r
                WITH u
                MERGE (cat:SkillCategory {name: 'Skills', user_id: $user_id})
                MERGE (u)-[:HAS_SKILL_CATEGORY]->(cat)
                MERGE (fam:SkillFamily {name: $family, user_id: $user_id})
                SET fam.source = 'llm'
                MERGE (cat)-[:HAS_SKILL_FAMILY]->(fam)
                MERGE (s:Skill {name: $name, user_id: $user_id})
                SET s.years             = $years,
                    s.level             = $level,
                    s.evidence_strength = $evidence_strength,
                    s.context           = $context,
                    s.source            = 'llm'
                MERGE (fam)-[:HAS_SKILL]->(s)
                """,
                {
                    "user_id": user_id,
                    "family": skill.family or "Other",
                    "name": name,
                    "years": float(skill.years) if isinstance(skill.years, (int, float)) else None,
                    "level": skill.level,
                    "evidence_strength": getattr(skill, "evidence_strength", None),
                    "context": getattr(skill, "context", None),
                },
            )

    async def _ingest_projects(self, user_id: str, projects: list) -> None:
        # Pre-load skill canonical names so DEMONSTRATES_SKILL edges find the
        # right node even when the project mentions a variant name.
        skill_rows = await self.client.run_query(
            "MATCH (s:Skill {user_id: $user_id}) RETURN s.name AS name",
            {"user_id": user_id},
        )
        skill_lower_map = _build_lower_map(skill_rows)

        for project in projects:
            if not project.name or not project.name.strip():
                continue
            # Create project node
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:ProjectCategory {name: 'Projects', user_id: $user_id})
                MERGE (u)-[:HAS_PROJECT_CATEGORY]->(cat)
                MERGE (p:Project {name: $name, user_id: $user_id})
                SET p.description           = $description,
                    p.domain                = $domain,
                    p.contribution_type     = $contribution_type,
                    p.has_measurable_impact = $has_measurable_impact,
                    p.source                = 'llm'
                MERGE (cat)-[:HAS_PROJECT]->(p)
                """,
                {
                    "user_id": user_id,
                    "name": project.name,
                    "description": project.description,
                    "domain": project.domain,
                    "contribution_type": getattr(project, "contribution_type", None),
                    "has_measurable_impact": getattr(project, "has_measurable_impact", False),
                },
            )

            # Link project → skills (only if skill node exists), storing 5W+H context on edge
            for skill_usage in project.skills_demonstrated:
                # Support both SkillUsage objects and plain strings (backwards compat)
                if isinstance(skill_usage, str):
                    raw_name = _normalize_name(skill_usage)
                    skill_name = skill_lower_map.get(raw_name.lower(), raw_name) if raw_name else None
                    context = what = how = why = scale = outcome = None
                else:
                    raw_name = _normalize_name(skill_usage.name)
                    skill_name = skill_lower_map.get(raw_name.lower(), raw_name) if raw_name else None
                    context = skill_usage.context
                    what = skill_usage.what
                    how = skill_usage.how
                    why = skill_usage.why
                    scale = skill_usage.scale
                    outcome = skill_usage.outcome
                    # Auto-build context summary if not provided
                    if not context:
                        parts = [p for p in [what, how, outcome] if p]
                        context = " | ".join(parts) if parts else None

                if not skill_name:
                    continue

                await self.client.run_write(
                    """
                    MATCH (p:Project {name: $project_name, user_id: $user_id})
                    MATCH (s:Skill {name: $skill_name, user_id: $user_id})
                    MERGE (p)-[r:DEMONSTRATES_SKILL]->(s)
                    SET r.context = $context,
                        r.what    = $what,
                        r.how     = $how,
                        r.why     = $why,
                        r.scale   = $scale,
                        r.outcome = $outcome
                    """,
                    {
                        "user_id": user_id,
                        "project_name": project.name,
                        "skill_name": skill_name,
                        "context": context,
                        "what": what,
                        "how": how,
                        "why": why,
                        "scale": scale,
                        "outcome": outcome,
                    },
                )

            # Link project → domain if specified
            if project.domain:
                await self.client.run_write(
                    """
                    MATCH (p:Project {name: $project_name, user_id: $user_id})
                    MERGE (d:Domain {name: $domain, user_id: $user_id})
                    ON CREATE SET d.source = 'llm'
                    MERGE (p)-[:IN_DOMAIN]->(d)
                    """,
                    {
                        "user_id": user_id,
                        "project_name": project.name,
                        "domain": project.domain,
                    },
                )

    async def _ingest_domains(self, user_id: str, domains: list) -> None:
        existing_rows = await self.client.run_query(
            "MATCH (d:Domain {user_id: $user_id}) RETURN d.name AS name",
            {"user_id": user_id},
        )
        lower_map = _build_lower_map(existing_rows)

        for domain in domains:
            name = _normalize_name(domain.name)
            if not name:
                continue
            name = lower_map.get(name.lower(), name)
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:DomainCategory {name: 'Domains', user_id: $user_id})
                MERGE (u)-[:HAS_DOMAIN_CATEGORY]->(cat)
                MERGE (fam:DomainFamily {name: $family, user_id: $user_id})
                SET fam.source = 'llm'
                MERGE (cat)-[:HAS_DOMAIN_FAMILY]->(fam)
                MERGE (d:Domain {name: $name, user_id: $user_id})
                SET d.years_experience = $years,
                    d.depth            = $depth,
                    d.description      = $description,
                    d.source           = 'llm'
                MERGE (fam)-[:HAS_DOMAIN]->(d)
                """,
                {
                    "user_id": user_id,
                    "family": domain.family or "Other",
                    "name": name,
                    "years": domain.years_experience,
                    "depth": domain.depth,
                    "description": getattr(domain, "description", None),
                },
            )

    async def _ingest_experiences(self, user_id: str, experiences: list) -> None:
        for exp in experiences:
            accomplishments = getattr(exp, "accomplishments", []) or []
            accomplishments_json = __import__("json").dumps(accomplishments) if accomplishments else None
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:ExperienceCategory {name: 'Experience', user_id: $user_id})
                MERGE (u)-[:HAS_EXPERIENCE_CATEGORY]->(cat)
                MERGE (e:Experience {title: $title, user_id: $user_id})
                SET e.company           = $company,
                    e.duration_years    = $duration_years,
                    e.description       = $description,
                    e.accomplishments   = $accomplishments,
                    e.contribution_type = $contribution_type,
                    e.source            = 'llm'
                MERGE (cat)-[:HAS_EXPERIENCE]->(e)
                """,
                {
                    "user_id": user_id,
                    "title": exp.title,
                    "company": exp.company,
                    "duration_years": exp.duration_years,
                    "description": exp.description,
                    "accomplishments": accomplishments_json,
                    "contribution_type": getattr(exp, "contribution_type", None),
                },
            )

    async def _ingest_education(self, user_id: str, education: list) -> None:
        for edu in education:
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:EducationCategory {name: 'Education', user_id: $user_id})
                MERGE (u)-[:HAS_EDUCATION_CATEGORY]->(cat)
                MERGE (e:Education {degree: $degree, institution: $institution, user_id: $user_id})
                SET e.field_of_study    = $field_of_study,
                    e.graduation_year   = $graduation_year,
                    e.gpa               = $gpa,
                    e.honors            = $honors,
                    e.is_ongoing        = $is_ongoing,
                    e.source            = 'llm'
                MERGE (cat)-[:HAS_EDUCATION]->(e)
                """,
                {
                    "user_id": user_id,
                    "degree": edu.degree,
                    "institution": edu.institution or "Unknown",
                    "field_of_study": edu.field_of_study,
                    "graduation_year": edu.graduation_year,
                    "gpa": edu.gpa,
                    "honors": edu.honors,
                    "is_ongoing": getattr(edu, "is_ongoing", False),
                },
            )

    async def _ingest_certifications(self, user_id: str, certifications: list) -> None:
        for cert in certifications:
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:CertificationCategory {name: 'Certifications', user_id: $user_id})
                MERGE (u)-[:HAS_CERTIFICATION_CATEGORY]->(cat)
                MERGE (c:Certification {name: $name, user_id: $user_id})
                SET c.issuer         = $issuer,
                    c.date_obtained  = $date_obtained,
                    c.expiry_date    = $expiry_date,
                    c.is_active      = $is_active,
                    c.source         = 'llm'
                MERGE (cat)-[:HAS_CERTIFICATION]->(c)
                """,
                {
                    "user_id": user_id,
                    "name": cert.name,
                    "issuer": cert.issuer,
                    "date_obtained": cert.date_obtained,
                    "expiry_date": cert.expiry_date,
                    "is_active": getattr(cert, "is_active", True),
                },
            )

    async def _ingest_achievements(self, user_id: str, achievements: list) -> None:
        for ach in achievements:
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:AchievementCategory {name: 'Achievements', user_id: $user_id})
                MERGE (u)-[:HAS_ACHIEVEMENT_CATEGORY]->(cat)
                MERGE (a:Achievement {title: $title, user_id: $user_id})
                SET a.type        = $type,
                    a.description = $description,
                    a.date        = $date,
                    a.impact      = $impact,
                    a.source      = 'llm'
                MERGE (cat)-[:HAS_ACHIEVEMENT]->(a)
                """,
                {
                    "user_id": user_id,
                    "title": ach.title,
                    "type": ach.type,
                    "description": ach.description,
                    "date": ach.date,
                    "impact": ach.impact,
                },
            )

    async def _ingest_publications(self, user_id: str, publications: list) -> None:
        for pub in publications:
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:PublicationCategory {name: 'Publications', user_id: $user_id})
                MERGE (u)-[:HAS_PUBLICATION_CATEGORY]->(cat)
                MERGE (p:Publication {title: $title, user_id: $user_id})
                SET p.type           = $type,
                    p.venue          = $venue,
                    p.year           = $year,
                    p.description    = $description,
                    p.is_first_author = $is_first_author,
                    p.source         = 'llm'
                MERGE (cat)-[:HAS_PUBLICATION]->(p)
                """,
                {
                    "user_id": user_id,
                    "title": pub.title,
                    "type": pub.type,
                    "venue": pub.venue,
                    "year": pub.year,
                    "description": pub.description,
                    "is_first_author": pub.is_first_author,
                },
            )

    async def _ingest_coursework(self, user_id: str, coursework: list) -> None:
        for course in coursework:
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:CourseworkCategory {name: 'Coursework', user_id: $user_id})
                MERGE (u)-[:HAS_COURSEWORK_CATEGORY]->(cat)
                MERGE (c:Course {name: $name, user_id: $user_id})
                SET c.provider        = $provider,
                    c.type            = $type,
                    c.year_completed  = $year_completed,
                    c.relevance_note  = $relevance_note,
                    c.source          = 'llm'
                MERGE (cat)-[:HAS_COURSE]->(c)
                """,
                {
                    "user_id": user_id,
                    "name": course.name,
                    "provider": course.provider,
                    "type": course.type,
                    "year_completed": course.year_completed,
                    "relevance_note": course.relevance_note,
                },
            )

    async def _ingest_languages(self, user_id: str, languages: list) -> None:
        for lang in languages:
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:LanguageCategory {name: 'Languages', user_id: $user_id})
                MERGE (u)-[:HAS_LANGUAGE_CATEGORY]->(cat)
                MERGE (l:Language {name: $name, user_id: $user_id})
                SET l.proficiency = $proficiency,
                    l.source      = 'llm'
                MERGE (cat)-[:HAS_LANGUAGE]->(l)
                """,
                {
                    "user_id": user_id,
                    "name": lang.name,
                    "proficiency": lang.proficiency,
                },
            )

    async def _ingest_volunteer_work(self, user_id: str, volunteer_work: list) -> None:
        import json as _json
        for vol in volunteer_work:
            skills_json = _json.dumps(getattr(vol, "skills_applied", []) or [])
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:VolunteerCategory {name: 'Volunteer', user_id: $user_id})
                MERGE (u)-[:HAS_VOLUNTEER_CATEGORY]->(cat)
                MERGE (v:VolunteerWork {role: $role, organization: $organization, user_id: $user_id})
                SET v.description    = $description,
                    v.skills_applied = $skills_applied,
                    v.duration_years = $duration_years,
                    v.source         = 'llm'
                MERGE (cat)-[:HAS_VOLUNTEER]->(v)
                """,
                {
                    "user_id": user_id,
                    "role": vol.role,
                    "organization": vol.organization or "Unknown",
                    "description": vol.description,
                    "skills_applied": skills_json,
                    "duration_years": vol.duration_years,
                },
            )

    async def _ingest_preferences(self, user_id: str, preferences: list) -> None:
        for pref in preferences:
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:PreferenceCategory {name: 'Preferences', user_id: $user_id})
                MERGE (u)-[:HAS_PREFERENCE_CATEGORY]->(cat)
                MERGE (p:Preference {type: $type, user_id: $user_id})
                SET p.value  = $value,
                    p.source = 'llm'
                MERGE (cat)-[:HAS_PREFERENCE]->(p)
                """,
                {
                    "user_id": user_id,
                    "type": pref.type,
                    "value": pref.value,
                },
            )

    async def _ingest_assessment(self, user_id: str, assessment) -> None:
        """Store the critical assessment as a node attached to the User."""
        import json as _json
        await self.client.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (a:CriticalAssessment {user_id: $user_id})
            SET a.overall_signal         = $overall_signal,
                a.seniority_assessment   = $seniority_assessment,
                a.depth_vs_breadth       = $depth_vs_breadth,
                a.ownership_signals      = $ownership_signals,
                a.red_flags              = $red_flags,
                a.inflated_skills        = $inflated_skills,
                a.genuine_strengths      = $genuine_strengths,
                a.honest_summary         = $honest_summary,
                a.candidate_identity     = $candidate_identity,
                a.five_w_h_summary       = $five_w_h_summary,
                a.interview_focus_areas  = $interview_focus_areas,
                a.source                 = 'llm'
            MERGE (u)-[:HAS_ASSESSMENT]->(a)
            """,
            {
                "user_id": user_id,
                "overall_signal": assessment.overall_signal,
                "seniority_assessment": assessment.seniority_assessment,
                "depth_vs_breadth": assessment.depth_vs_breadth,
                "ownership_signals": _json.dumps(assessment.ownership_signals),
                "red_flags": _json.dumps(assessment.red_flags),
                "inflated_skills": _json.dumps(assessment.inflated_skills),
                "genuine_strengths": _json.dumps(assessment.genuine_strengths),
                "honest_summary": assessment.honest_summary,
                "candidate_identity": getattr(assessment, "candidate_identity", ""),
                "five_w_h_summary": _json.dumps(getattr(assessment, "five_w_h_summary", {})),
                "interview_focus_areas": _json.dumps(assessment.interview_focus_areas),
            },
        )

    async def _ingest_patterns(self, user_id: str, patterns: list) -> None:
        for pattern in patterns:
            await self.client.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (cat:PatternCategory {name: 'Patterns', user_id: $user_id})
                MERGE (u)-[:HAS_PATTERN_CATEGORY]->(cat)
                MERGE (pat:ProblemSolvingPattern {pattern: $pattern, user_id: $user_id})
                SET pat.evidence = $evidence,
                    pat.source   = 'llm'
                MERGE (cat)-[:HAS_PATTERN]->(pat)
                """,
                {
                    "user_id": user_id,
                    "pattern": pattern.pattern,
                    "evidence": pattern.evidence,
                },
            )

    # ──────────────────────────────────────────────────────────────────────────
    # JOB INGESTION
    # ──────────────────────────────────────────────────────────────────────────

    async def ingest_job_posting(
        self, job_id: str, extraction: JobPostingExtraction, recruiter_id: str | None = None,
        raw_text: str | None = None,
    ) -> None:
        """Write the full job hierarchy into Neo4j from LLM extraction output."""
        await self._create_job_node(job_id, extraction, recruiter_id, raw_text=raw_text)
        # Core requirement nodes
        await self._ingest_job_skills(job_id, extraction.skill_requirements)
        await self._ingest_job_domains(job_id, extraction.domain_requirements)
        await self._ingest_job_culture(job_id, extraction.work_styles)
        # Deep profile nodes
        await self._ingest_job_education_requirements(job_id, extraction.education_requirements)
        await self._ingest_job_preferred_qualifications(job_id, extraction.preferred_qualifications)
        if extraction.company_profile:
            await self._ingest_job_company_profile(job_id, extraction.company_profile)
        if extraction.hiring_team:
            await self._ingest_job_hiring_team(job_id, extraction.hiring_team)
        if extraction.compensation:
            await self._ingest_job_compensation(job_id, extraction.compensation)
        if extraction.role_expectations:
            await self._ingest_job_role_expectations(job_id, extraction.role_expectations)
        await self._ingest_job_soft_requirements(job_id, extraction.soft_requirements)
        logger.info(f"LLM hierarchy written for job {job_id}")

    async def _create_job_node(
        self, job_id: str, extraction: JobPostingExtraction,
        recruiter_id: str | None = None, raw_text: str | None = None,
    ) -> None:
        await self.client.run_write(
            """
            MERGE (j:Job {id: $job_id})
            SET j.title                = $title,
                j.company              = $company,
                j.remote_policy        = $remote_policy,
                j.company_size         = $company_size,
                j.experience_years_min = $exp_years_min,
                j.recruiter_id         = $recruiter_id,
                j.source               = 'llm',
                j.updated_at           = timestamp()
            """,
            {
                "job_id": job_id,
                "title": extraction.title,
                "company": extraction.company,
                "remote_policy": extraction.remote_policy,
                "company_size": extraction.company_size,
                "exp_years_min": extraction.experience_years_min,
                "recruiter_id": recruiter_id,
            },
        )
        # Store raw text for future retag operations (truncated to 8k chars)
        if raw_text:
            await self.client.run_write(
                "MATCH (j:Job {id: $job_id}) SET j.raw_text = $raw_text",
                {"job_id": job_id, "raw_text": raw_text[:8000]},
            )

    async def _ingest_job_skills(self, job_id: str, requirements: list) -> None:
        for req in requirements:
            name = _normalize_name(req.name)
            if not name:
                continue
            await self.client.run_write(
                """
                MATCH (j:Job {id: $job_id})
                MERGE (jsr:JobSkillRequirements {job_id: $job_id})
                MERGE (j)-[:HAS_SKILL_REQUIREMENTS]->(jsr)
                MERGE (jsf:JobSkillFamily {name: $family, job_id: $job_id})
                SET jsf.source = 'llm'
                MERGE (jsr)-[:HAS_SKILL_FAMILY_REQ]->(jsf)
                MERGE (r:JobSkillRequirement {name: $name, job_id: $job_id})
                SET r.required   = $required,
                    r.importance = $importance,
                    r.min_years  = $min_years,
                    r.context    = $context,
                    r.source     = 'llm'
                MERGE (jsf)-[:REQUIRES_SKILL]->(r)
                """,
                {
                    "job_id": job_id,
                    "family": req.family or "Other",
                    "name": name,
                    "required": req.required,
                    "importance": req.importance,
                    "min_years": req.min_years,
                    "context": getattr(req, "context", None),
                },
            )

    async def _ingest_job_domains(self, job_id: str, requirements: list) -> None:
        for req in requirements:
            name = _normalize_name(req.name)
            if not name:
                continue
            await self.client.run_write(
                """
                MATCH (j:Job {id: $job_id})
                MERGE (jdr:JobDomainRequirements {job_id: $job_id})
                MERGE (j)-[:HAS_DOMAIN_REQUIREMENTS]->(jdr)
                MERGE (jdf:JobDomainFamily {name: $family, job_id: $job_id})
                SET jdf.source = 'llm'
                MERGE (jdr)-[:HAS_DOMAIN_FAMILY_REQ]->(jdf)
                MERGE (dr:JobDomainRequirement {name: $name, job_id: $job_id})
                SET dr.min_years  = $min_years,
                    dr.importance = $importance,
                    dr.depth      = $depth,
                    dr.source     = 'llm'
                MERGE (jdf)-[:REQUIRES_DOMAIN]->(dr)
                """,
                {
                    "job_id": job_id,
                    "family": req.family or "Other",
                    "name": name,
                    "min_years": req.min_years,
                    "importance": getattr(req, "importance", "must_have"),
                    "depth": getattr(req, "depth", None),
                },
            )

    async def _ingest_job_culture(self, job_id: str, work_styles: list) -> None:
        for ws in work_styles:
            await self.client.run_write(
                """
                MATCH (j:Job {id: $job_id})
                MERGE (jcr:JobCultureRequirements {job_id: $job_id})
                MERGE (j)-[:HAS_CULTURE_REQUIREMENTS]->(jcr)
                MERGE (w:WorkStyle {style: $style, job_id: $job_id})
                SET w.source = 'llm'
                MERGE (jcr)-[:HAS_WORK_STYLE]->(w)
                """,
                {"job_id": job_id, "style": ws.style},
            )

    async def _ingest_job_education_requirements(self, job_id: str, reqs: list) -> None:
        import json as _j
        for req in reqs:
            await self.client.run_write(
                """
                MATCH (j:Job {id: $job_id})
                MERGE (e:EducationRequirement {job_id: $job_id, degree_level: $degree_level, field: $field})
                SET e.is_required   = $is_required,
                    e.alternatives  = $alternatives,
                    e.description   = $description,
                    e.source        = 'llm'
                MERGE (j)-[:HAS_EDUCATION_REQ]->(e)
                """,
                {
                    "job_id": job_id,
                    "degree_level": req.degree_level,
                    "field": req.field or "",
                    "is_required": req.is_required,
                    "alternatives": _j.dumps(req.alternatives),
                    "description": req.description,
                },
            )

    async def _ingest_job_preferred_qualifications(self, job_id: str, quals: list) -> None:
        for qual in quals:
            await self.client.run_write(
                """
                MATCH (j:Job {id: $job_id})
                MERGE (p:PreferredQualification {job_id: $job_id, type: $type, value: $value})
                SET p.description = $description,
                    p.importance  = $importance,
                    p.source      = 'llm'
                MERGE (j)-[:HAS_PREFERRED_QUAL]->(p)
                """,
                {
                    "job_id": job_id,
                    "type": qual.type,
                    "value": qual.value,
                    "description": qual.description,
                    "importance": qual.importance,
                },
            )

    async def _ingest_job_company_profile(self, job_id: str, profile) -> None:
        import json as _j
        await self.client.run_write(
            """
            MATCH (j:Job {id: $job_id})
            MERGE (c:CompanyProfile {job_id: $job_id})
            SET c.mission             = $mission,
                c.vision              = $vision,
                c.values              = $values,
                c.stage               = $stage,
                c.product_description = $product_description,
                c.industry            = $industry,
                c.notable_tech        = $notable_tech,
                c.source              = 'llm'
            MERGE (j)-[:HAS_COMPANY_PROFILE]->(c)
            """,
            {
                "job_id": job_id,
                "mission": profile.mission,
                "vision": profile.vision,
                "values": _j.dumps(profile.values),
                "stage": profile.stage,
                "product_description": profile.product_description,
                "industry": profile.industry,
                "notable_tech": _j.dumps(profile.notable_tech),
            },
        )

    async def _ingest_job_hiring_team(self, job_id: str, team) -> None:
        import json as _j
        await self.client.run_write(
            """
            MATCH (j:Job {id: $job_id})
            MERGE (t:HiringTeam {job_id: $job_id})
            SET t.name          = $name,
                t.description   = $description,
                t.product_built = $product_built,
                t.team_size_est = $team_size_est,
                t.tech_focus    = $tech_focus,
                t.reports_to    = $reports_to,
                t.team_type     = $team_type,
                t.source        = 'llm'
            MERGE (j)-[:HAS_HIRING_TEAM]->(t)
            """,
            {
                "job_id": job_id,
                "name": team.name,
                "description": team.description,
                "product_built": team.product_built,
                "team_size_est": team.team_size_est,
                "tech_focus": _j.dumps(team.tech_focus),
                "reports_to": team.reports_to,
                "team_type": team.team_type,
            },
        )

    async def _ingest_job_compensation(self, job_id: str, comp) -> None:
        import json as _j
        await self.client.run_write(
            """
            MATCH (j:Job {id: $job_id})
            MERGE (c:CompensationPackage {job_id: $job_id})
            SET c.salary_min      = $salary_min,
                c.salary_max      = $salary_max,
                c.currency        = $currency,
                c.equity          = $equity,
                c.benefits        = $benefits,
                c.bonus_structure = $bonus_structure,
                c.is_disclosed    = $is_disclosed,
                c.source          = 'llm'
            MERGE (j)-[:HAS_COMPENSATION]->(c)
            """,
            {
                "job_id": job_id,
                "salary_min": comp.salary_min,
                "salary_max": comp.salary_max,
                "currency": comp.currency,
                "equity": comp.equity,
                "benefits": _j.dumps(comp.benefits),
                "bonus_structure": comp.bonus_structure,
                "is_disclosed": comp.is_disclosed,
            },
        )

    async def _ingest_job_role_expectations(self, job_id: str, role) -> None:
        import json as _j
        await self.client.run_write(
            """
            MATCH (j:Job {id: $job_id})
            MERGE (r:RoleExpectation {job_id: $job_id})
            SET r.key_responsibilities = $key_responsibilities,
                r.success_metrics      = $success_metrics,
                r.first_30_days        = $first_30_days,
                r.first_90_days        = $first_90_days,
                r.autonomy_level       = $autonomy_level,
                r.source               = 'llm'
            MERGE (j)-[:HAS_ROLE_EXPECTATIONS]->(r)
            """,
            {
                "job_id": job_id,
                "key_responsibilities": _j.dumps(role.key_responsibilities),
                "success_metrics": _j.dumps(role.success_metrics),
                "first_30_days": role.first_30_days,
                "first_90_days": role.first_90_days,
                "autonomy_level": role.autonomy_level,
            },
        )

    async def _ingest_job_soft_requirements(self, job_id: str, reqs: list) -> None:
        for req in reqs:
            await self.client.run_write(
                """
                MATCH (j:Job {id: $job_id})
                MERGE (s:JobSoftRequirement {job_id: $job_id, trait: $trait})
                SET s.description   = $description,
                    s.is_dealbreaker = $is_dealbreaker,
                    s.source        = 'llm'
                MERGE (j)-[:HAS_SOFT_REQUIREMENTS]->(s)
                """,
                {
                    "job_id": job_id,
                    "trait": req.trait,
                    "description": req.description,
                    "is_dealbreaker": req.is_dealbreaker,
                },
            )

