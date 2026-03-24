"""
LLM ingestion orchestrator.

Three-phase pipeline for users:
  Phase 1: Groq extraction → structured JSON (skills, domains, projects, experiences,
           critical assessment, AND interpretation_flags for every uncertain inference)
  Phase 2: Write hierarchy → Neo4j (source='llm', verified=false on inferred nodes)
  Phase 3: Store interpretation_flags → SQLite for user clarification workflow

The clarification workflow (via ClarificationService) lets users confirm or correct
every LLM inference before their graph is treated as a verified digital twin.
"""

import logging
from database.neo4j_client import Neo4jClient
from database.sqlite_client import SQLiteClient
from services.llm_extraction import LLMExtractionService
from services.llm_ingestion import LLMIngestionService
from services.clarification_service import ClarificationService
from services.job_tag_extractor import JobTagExtractor

logger = logging.getLogger(__name__)


class IngestionService:
    def __init__(self, neo4j_client: Neo4jClient, sqlite_client: SQLiteClient | None = None):
        self._client = neo4j_client
        self._sqlite = sqlite_client
        self._llm_extractor = LLMExtractionService()
        self._llm_ingester = LLMIngestionService(neo4j_client)
        self._tag_extractor = JobTagExtractor(neo4j_client)

    async def ingest_user(self, user_id: str, profile_text: str) -> dict:
        """
        Ingest a user profile via LLM extraction + Neo4j write + flag storage.
        Returns ingestion stats including clarification questions for the API response.
        """
        logger.info(f"Ingesting user: {user_id}")

        extraction = await self._llm_extractor.extract_user_profile(profile_text)
        await self._llm_ingester.ingest_user_profile(user_id, extraction)
        skill_links = await self._llm_ingester.link_skill_matches(user_id)
        domain_links = await self._llm_ingester.link_domain_matches(user_id)

        # Store interpretation flags for the clarification workflow
        flags_count = 0
        clarification_questions = []
        if self._sqlite and extraction.interpretation_flags:
            clarification_svc = ClarificationService(self._client, self._sqlite)
            flags_count = await clarification_svc.store_flags(user_id, extraction.interpretation_flags)
            # Return the critical questions immediately so the API caller can show them
            clarifications = await clarification_svc.get_clarifications(user_id)
            clarification_questions = [
                {
                    "flag_id": q.flag_id,
                    "question": q.clarification_question,
                    "field": q.field,
                    "interpreted_as": q.interpreted_as,
                    "impact": q.resolution_impact,
                    "options": q.suggested_options,
                }
                for q in clarifications.questions
                if q.resolution_impact == "critical"
            ]

        result = {
            "user_id": user_id,
            "entity_type": "user",
            "skills_extracted": len(extraction.skills),
            "domains_extracted": len(extraction.domains),
            "projects_extracted": len(extraction.projects),
            "experiences_extracted": len(extraction.experiences),
            "education_extracted": len(getattr(extraction, "education", []) or []),
            "certifications_extracted": len(getattr(extraction, "certifications", []) or []),
            "achievements_extracted": len(getattr(extraction, "achievements", []) or []),
            "publications_extracted": len(getattr(extraction, "publications", []) or []),
            "coursework_extracted": len(getattr(extraction, "coursework", []) or []),
            "languages_extracted": len(getattr(extraction, "languages", []) or []),
            "volunteer_work_extracted": len(getattr(extraction, "volunteer_work", []) or []),
            "skill_matches_linked": skill_links,
            "domain_matches_linked": domain_links,
            "interpretation_flags": flags_count,
            "graph_verified": flags_count == 0,
            "clarification_questions": clarification_questions,
        }
        logger.info(f"User ingestion complete: {result}")
        return result

    async def ingest_job(self, job_id: str, job_text: str, recruiter_id: str | None = None) -> dict:
        """
        Ingest a job posting via LLM extraction + Neo4j write.
        Returns ingestion stats for the API response.
        """
        logger.info(f"Ingesting job: {job_id}")

        extraction = await self._llm_extractor.extract_job_posting(job_text)
        await self._llm_ingester.ingest_job_posting(job_id, extraction, recruiter_id, raw_text=job_text)
        skill_links = await self._llm_ingester.link_job_skill_matches(job_id)
        domain_links = await self._llm_ingester.link_job_domain_matches(job_id)
        job_tags = await self._tag_extractor.extract_and_store_tags(job_id, job_text)

        result = {
            "job_id": job_id,
            "entity_type": "job",
            "title": extraction.title,
            "company": extraction.company,
            "skill_requirements_extracted": len(extraction.skill_requirements),
            "domain_requirements_extracted": len(extraction.domain_requirements),
            "work_styles_extracted": len(extraction.work_styles),
            "skill_matches_linked": skill_links,
            "domain_matches_linked": domain_links,
            "tags_extracted": job_tags,
        }
        logger.info(f"Job ingestion complete: {result}")
        return result
