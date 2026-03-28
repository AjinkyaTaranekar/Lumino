"""
LLM-based semantic tag extractor for job postings.

Extracts human-readable tags describing the nature and context of the role.
Tags are fully dynamic — the LLM decides what fits based on the posting text.
Tags are stored in Neo4j and used for analytics-driven interest profile matching.
"""

import json
import logging
import re

from litellm import acompletion

from database.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a job market analyst. Given a job posting, extract short semantic tags that
describe the nature and context of the role. These tags help candidates understand what
kind of job this is at a glance, beyond just the required skills.

Tag categories to consider (generate your own tags — these are just examples):
  work_style: remote-first, hybrid, on-site, async-culture, fast-paced, startup-pace
  compensation: high-paying, equity, performance-bonus, competitive-salary
  culture: mission-driven, flat-hierarchy, collaborative, diverse-team, growth-driven
  tech: cutting-edge-stack, open-source, ml-heavy, data-driven, cloud-native
  impact: social-impact, scale-product, greenfield, consumer-facing

Rules:
- Only assign tags clearly supported by the job posting text.
- Use lowercase, hyphen-separated slugs (e.g. "remote-first", not "Remote First").
- Keep tags concise — 1 to 3 words max per tag.
- A job can have 0 to 10 tags total.
- Return ONLY a JSON object: {"tags": ["tag1", "tag2", ...]}
"""


class JobTagExtractor:
    """Extracts semantic tags from job posting text and writes them to Neo4j."""

    def __init__(self, client: Neo4jClient, model: str = "groq/llama-3.3-70b-versatile"):
        self.client = client
        self.model = model

    async def retag_job(self, job_id: str) -> list[str]:
        """
        Retag an existing job. Strategy:
          1. Use j.raw_text if stored (full original posting).
          2. Otherwise reconstruct a description from extracted graph data.
        Returns the new tag list, or [] if job not found.
        """
        rows = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})
            OPTIONAL MATCH (j)-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                           -[:HAS_SKILL_FAMILY_REQ]->(:JobSkillFamily)
                           -[:REQUIRES_SKILL]->(sr:JobSkillRequirement)
            OPTIONAL MATCH (j)-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
                           -[:HAS_DOMAIN_FAMILY_REQ]->(:JobDomainFamily)
                           -[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
            RETURN j.raw_text          AS raw_text,
                   j.title             AS title,
                   j.company           AS company,
                   j.remote_policy     AS remote_policy,
                   j.company_size      AS company_size,
                   j.experience_years_min AS exp_years,
                   collect(DISTINCT sr.name) AS skills,
                   collect(DISTINCT dr.name) AS domains
            """,
            {"job_id": job_id},
        )
        if not rows:
            logger.warning(f"retag_job: job {job_id} not found")
            return []

        row = rows[0]
        job_text: str = row.get("raw_text") or self._reconstruct_description(row)
        return await self.extract_and_store_tags(job_id, job_text)

    async def retag_all_untagged(self) -> dict[str, list[str]]:
        """
        Retag every job that has no tags yet (j.tags is null or empty list).
        Returns a mapping of job_id → new tags.
        """
        rows = await self.client.run_query(
            """
            MATCH (j:Job)
            WHERE j.tags IS NULL OR size(j.tags) = 0
            RETURN j.id AS job_id
            """
        )
        results: dict[str, list[str]] = {}
        for row in rows:
            job_id = row["job_id"]
            tags = await self.retag_job(job_id)
            results[job_id] = tags
            logger.info(f"Retagged {job_id}: {tags}")
        return results

    @staticmethod
    def _reconstruct_description(row: dict) -> str:
        """Build a synthetic job description from extracted Neo4j data when raw_text is absent."""
        parts: list[str] = []
        if row.get("title"):
            parts.append(f"Job Title: {row['title']}")
        if row.get("company"):
            parts.append(f"Company: {row['company']}")
        if row.get("remote_policy"):
            parts.append(f"Work arrangement: {row['remote_policy']}")
        if row.get("company_size"):
            parts.append(f"Company size: {row['company_size']}")
        if row.get("exp_years"):
            parts.append(f"Experience required: {row['exp_years']}+ years")
        skills = [s for s in (row.get("skills") or []) if s]
        if skills:
            parts.append(f"Required skills: {', '.join(skills)}")
        domains = [d for d in (row.get("domains") or []) if d]
        if domains:
            parts.append(f"Domain areas: {', '.join(domains)}")
        return "\n".join(parts) if parts else "No description available"

    async def extract_and_store_tags(self, job_id: str, job_text: str) -> list[str]:
        """
        Extract semantic tags from job_text and write them to the Job node in Neo4j.
        Returns the list of extracted tags.
        """
        tags = await self._extract_tags(job_text)
        if tags:
            await self._store_tags(job_id, tags)
        logger.info(f"Job {job_id}: extracted {len(tags)} tags: {tags}")
        return tags

    async def _extract_tags(self, job_text: str) -> list[str]:
        """Call the LLM to extract tags. Returns cleaned, dynamic tags."""
        try:
            response = await acompletion(
                model=self.model,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": f"Job posting:\n\n{job_text[:4000]}"},
                ],
                temperature=0.1,
            )
            raw = response.choices[0].message.content or "{}"
            # Strip markdown fences if present
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            # Extract JSON object boundaries
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start != -1 and end > start:
                raw = raw[start:end]
            data = json.loads(raw)
            raw_tags: list = data.get("tags", [])
            if not isinstance(raw_tags, list):
                raw_tags = []
            # Normalize: lowercase, slugify spaces → hyphens, keep only valid slug chars
            tags = []
            for t in raw_tags:
                if not isinstance(t, str):
                    continue
                slug = re.sub(r"[^a-z0-9-]", "", t.lower().replace(" ", "-").replace("_", "-"))
                slug = re.sub(r"-+", "-", slug).strip("-")
                if slug:
                    tags.append(slug)
            return tags[:10]  # cap at 10 tags
        except Exception as e:
            logger.warning(f"Tag extraction failed, skipping: {e}")
            return []

    async def _store_tags(self, job_id: str, tags: list[str]) -> None:
        """
        Write tags to Neo4j:
        - Set j.tags as a list property on the Job node (fast lookup)
        - Create JobTag nodes + HAS_TAG edges (graph traversal + interest matching)
        """
        await self.client.run_write(
            "MATCH (j:Job {id: $job_id}) SET j.tags = $tags",
            {"job_id": job_id, "tags": tags},
        )

        for tag in tags:
            await self.client.run_write(
                """
                MERGE (t:JobTag {name: $tag})
                WITH t
                MATCH (j:Job {id: $job_id})
                MERGE (j)-[:HAS_TAG]->(t)
                """,
                {"job_id": job_id, "tag": tag},
            )
