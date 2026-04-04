"""
Vector embedding service for GraphRAG matching.

Stores context-enriched embedding vectors directly on graph nodes at ingestion time.
Replaces semantic_matching.py's MATCHES edge approach with node-level vectors
queried at match time via Neo4j vector index ANN search.

Scaling: O(N) per new entity — only that entity's own nodes are embedded.
No relinking. No cross-entity precomputation.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from database.neo4j_client import Neo4jClient
from models.taxonomies import canonicalize_matching_term, expand_matching_aliases

try:
    from litellm import aembedding
except Exception:
    aembedding = None

logger = logging.getLogger(__name__)


class VectorEmbeddingService:
    def __init__(self, client: Neo4jClient):
        self.client = client
        self._enabled = os.environ.get("SEMANTIC_MATCH_ENABLED", "true").lower() not in {
            "0", "false", "no",
        }
        self._batch_size = max(1, int(os.environ.get("EMBEDDING_BATCH_SIZE", "64")))
        self._embedding_model = self._resolve_embedding_model()
        self._task_type = os.environ.get("EMBEDDING_TASK_TYPE", "SEMANTIC_SIMILARITY")

    # ── Public: user side ───────────────────────────────────────────────────────

    async def embed_user_skills(self, user_id: str) -> int:
        """Embed all Skill nodes for a user in one batch. Returns count embedded."""
        if not self._enabled:
            return 0
        rows = await self.client.run_query(
            """
            MATCH (s:Skill {user_id: $user_id})
            OPTIONAL MATCH (sfam:SkillFamily)-[:HAS_SKILL]->(s)
            WITH s, sfam
            OPTIONAL MATCH (p:Project {user_id: $user_id})-[r:DEMONSTRATES_SKILL]->(s)
            OPTIONAL MATCH (p)-[:IN_DOMAIN]->(pd:Domain {user_id: $user_id})
            RETURN elementId(s) AS node_id,
                   s.name AS name, s.years AS years, s.level AS level,
                   s.evidence_strength AS evidence, s.context AS context,
                   sfam.name AS family,
                   [x IN collect(DISTINCT {
                       project: p.name, description: p.description,
                       what: r.what, how: r.how, why: r.why,
                       scale: r.scale, outcome: r.outcome
                   }) WHERE x.project IS NOT NULL] AS project_usages,
                   [d IN collect(DISTINCT pd.name) WHERE d IS NOT NULL] AS domains
            """,
            {"user_id": user_id},
        )
        return await self._embed_and_store(rows, self._build_skill_text, "Skill", user_id)

    async def embed_user_domains(self, user_id: str) -> int:
        """Embed all Domain nodes for a user in one batch. Returns count embedded."""
        if not self._enabled:
            return 0
        rows = await self.client.run_query(
            """
            MATCH (d:Domain {user_id: $user_id})
            OPTIONAL MATCH (dfam:DomainFamily)-[:HAS_DOMAIN]->(d)
            WITH d, dfam
            OPTIONAL MATCH (p:Project {user_id: $user_id})-[:IN_DOMAIN]->(d)
            RETURN elementId(d) AS node_id,
                   d.name AS name, d.years_experience AS years,
                   d.depth AS depth, d.description AS description,
                   dfam.name AS family,
                   [x IN collect(DISTINCT {name: p.name, description: p.description})
                    WHERE x.name IS NOT NULL] AS projects
            """,
            {"user_id": user_id},
        )
        return await self._embed_and_store(rows, self._build_domain_text, "Domain", user_id)

    # ── Public: job side ────────────────────────────────────────────────────────

    async def embed_job_skill_reqs(self, job_id: str) -> int:
        """Embed all JobSkillRequirement nodes for a job. Returns count embedded."""
        if not self._enabled:
            return 0
        rows = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(jsf:JobSkillFamily)
                  -[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            OPTIONAL MATCH (j)-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
                  -[:HAS_DOMAIN_FAMILY_REQ]->(:JobDomainFamily)
                  -[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
            RETURN elementId(req) AS node_id,
                   req.name AS name, req.importance AS importance,
                   req.min_years AS min_years, req.context AS context,
                   jsf.name AS family,
                   j.title AS job_title, j.company AS company,
                   [d IN collect(DISTINCT dr.name) WHERE d IS NOT NULL] AS job_domains
            """,
            {"job_id": job_id},
        )
        return await self._embed_and_store(rows, self._build_job_skill_text, "JobSkillRequirement", job_id)

    async def embed_job_domain_reqs(self, job_id: str) -> int:
        """Embed all JobDomainRequirement nodes for a job. Returns count embedded."""
        if not self._enabled:
            return 0
        rows = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
                  -[:HAS_DOMAIN_FAMILY_REQ]->(jdf:JobDomainFamily)
                  -[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
            RETURN elementId(dr) AS node_id,
                   dr.name AS name, dr.importance AS importance,
                   dr.depth AS depth, dr.min_years AS min_years,
                   jdf.name AS family,
                   j.title AS job_title, j.company AS company
            """,
            {"job_id": job_id},
        )
        return await self._embed_and_store(rows, self._build_job_domain_text, "JobDomainRequirement", job_id)

    # ── Public: reembed helpers ─────────────────────────────────────────────────

    async def reembed_user(self, user_id: str) -> dict:
        skills = await self.embed_user_skills(user_id)
        domains = await self.embed_user_domains(user_id)
        return {"skills_embedded": skills, "domains_embedded": domains}

    async def reembed_job(self, job_id: str) -> dict:
        skills = await self.embed_job_skill_reqs(job_id)
        domains = await self.embed_job_domain_reqs(job_id)
        return {"skill_reqs_embedded": skills, "domain_reqs_embedded": domains}

    async def reembed_all(self) -> dict:
        """Re-embed all nodes across all users and jobs. Use when changing embedding model."""
        user_rows = await self.client.run_query("MATCH (u:User) RETURN u.id AS id")
        job_rows = await self.client.run_query("MATCH (j:Job) RETURN j.id AS id")

        total_skills = total_domains = total_skill_reqs = total_domain_reqs = 0

        for row in user_rows:
            counts = await self.reembed_user(row["id"])
            total_skills += counts["skills_embedded"]
            total_domains += counts["domains_embedded"]

        for row in job_rows:
            counts = await self.reembed_job(row["id"])
            total_skill_reqs += counts["skill_reqs_embedded"]
            total_domain_reqs += counts["domain_reqs_embedded"]

        result = {
            "users_processed": len(user_rows),
            "jobs_processed": len(job_rows),
            "skills_embedded": total_skills,
            "domains_embedded": total_domains,
            "skill_reqs_embedded": total_skill_reqs,
            "domain_reqs_embedded": total_domain_reqs,
        }
        logger.info("reembed_all complete: %s", result)
        return result

    # ── Embedding text builders ─────────────────────────────────────────────────

    def _build_skill_text(self, row: dict) -> str:
        parts: list[str] = []
        name = (row.get("name") or "").strip()
        family = (row.get("family") or "").strip()

        header = f"skill: {name}"
        if family and family.lower() != "other":
            header += f". family: {family}"
        parts.append(header)

        if row.get("context"):
            parts.append(row["context"].strip())

        meta: list[str] = []
        if row.get("years") is not None:
            meta.append(f"years: {row['years']}")
        if row.get("level"):
            meta.append(f"level: {row['level']}")
        if row.get("evidence"):
            meta.append(f"evidence: {row['evidence']}")
        if meta:
            parts.append(". ".join(meta))

        for usage in (row.get("project_usages") or [])[:4]:
            if not usage or not usage.get("project"):
                continue
            proj_parts = [f"project: {usage['project']}"]
            for key in ("what", "how", "scale", "outcome"):
                if usage.get(key):
                    proj_parts.append(f"{key}: {usage[key]}")
            parts.append(". ".join(proj_parts))

        domains = [d for d in (row.get("domains") or []) if d]
        if domains:
            parts.append(f"domains: {', '.join(domains)}")

        aliases = self._get_aliases(name)
        if aliases:
            parts.append(f"related terms: {', '.join(aliases[:6])}")

        return ". ".join(parts)

    def _build_domain_text(self, row: dict) -> str:
        parts: list[str] = []
        name = (row.get("name") or "").strip()
        family = (row.get("family") or "").strip()

        header = f"domain: {name}"
        if family and family.lower() != "other":
            header += f". family: {family}"
        parts.append(header)

        if row.get("description"):
            parts.append(row["description"].strip())

        meta: list[str] = []
        if row.get("years") is not None:
            meta.append(f"years: {row['years']}")
        if row.get("depth"):
            meta.append(f"depth: {row['depth']}")
        if meta:
            parts.append(". ".join(meta))

        for proj in (row.get("projects") or [])[:3]:
            if not proj or not proj.get("name"):
                continue
            proj_text = f"project: {proj['name']}"
            if proj.get("description"):
                proj_text += f" — {str(proj['description'])[:100]}"
            parts.append(proj_text)

        aliases = self._get_aliases(name)
        if aliases:
            parts.append(f"related terms: {', '.join(aliases[:6])}")

        return ". ".join(parts)

    def _build_job_skill_text(self, row: dict) -> str:
        parts: list[str] = []
        name = (row.get("name") or "").strip()
        family = (row.get("family") or "").strip()

        header = f"skill: {name}"
        if family and family.lower() != "other":
            header += f". family: {family}"
        parts.append(header)

        if row.get("context"):
            parts.append(row["context"].strip())

        meta: list[str] = []
        if row.get("job_title") and row.get("company"):
            meta.append(f"job: {row['job_title']} at {row['company']}")
        elif row.get("job_title"):
            meta.append(f"job: {row['job_title']}")
        if row.get("importance"):
            meta.append(f"importance: {row['importance']}")
        if row.get("min_years") is not None:
            meta.append(f"min_years: {row['min_years']}")
        if meta:
            parts.append(". ".join(meta))

        job_domains = [d for d in (row.get("job_domains") or []) if d]
        if job_domains:
            parts.append(f"domain context: {', '.join(job_domains)}")

        aliases = self._get_aliases(name)
        if aliases:
            parts.append(f"related terms: {', '.join(aliases[:6])}")

        return ". ".join(parts)

    def _build_job_domain_text(self, row: dict) -> str:
        parts: list[str] = []
        name = (row.get("name") or "").strip()
        family = (row.get("family") or "").strip()

        header = f"domain: {name}"
        if family and family.lower() != "other":
            header += f". family: {family}"
        parts.append(header)

        meta: list[str] = []
        if row.get("job_title") and row.get("company"):
            meta.append(f"job: {row['job_title']} at {row['company']}")
        elif row.get("job_title"):
            meta.append(f"job: {row['job_title']}")
        if row.get("importance"):
            meta.append(f"importance: {row['importance']}")
        if row.get("depth"):
            meta.append(f"depth: {row['depth']}")
        if row.get("min_years") is not None:
            meta.append(f"min_years: {row['min_years']}")
        if meta:
            parts.append(". ".join(meta))

        aliases = self._get_aliases(name)
        if aliases:
            parts.append(f"related terms: {', '.join(aliases[:6])}")

        return ". ".join(parts)

    # ── Internal ────────────────────────────────────────────────────────────────

    async def _embed_and_store(
        self,
        rows: list[dict],
        text_builder: Any,
        label: str,
        scope_id: str,
    ) -> int:
        if not rows:
            logger.info("No %s nodes to embed for scope %s", label, scope_id)
            return 0

        self._assert_ready()

        texts = [text_builder(row) for row in rows]
        vectors = await self._embed_texts(texts)

        # Single UNWIND write transaction for all vectors
        updates = [
            {"node_id": row["node_id"], "vector": vector}
            for row, vector in zip(rows, vectors)
        ]
        await self.client.run_write(
            """
            UNWIND $updates AS u
            MATCH (n) WHERE elementId(n) = u.node_id
            SET n.embedding       = u.vector,
                n.embedding_model = $model,
                n.embedded_at     = timestamp()
            """,
            {"updates": updates, "model": self._embedding_model},
        )

        logger.info(
            "Embedded %d %s nodes using %s for scope %s",
            len(rows), label, self._embedding_model, scope_id,
        )
        return len(rows)

    async def _embed_texts(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self._batch_size):
            batch = texts[start: start + self._batch_size]
            try:
                response = await aembedding(
                    model=self._embedding_model,
                    input=batch,
                    task_type=self._task_type,
                )
                raw_data = response.data if hasattr(response, "data") else response["data"]
                for row in raw_data:
                    emb = row["embedding"] if isinstance(row, dict) else row.embedding
                    vectors.append(emb)
            except Exception as exc:
                raise RuntimeError(
                    f"Embedding failed for model {self._embedding_model}: {exc}"
                ) from exc
        return vectors

    def _get_aliases(self, name: str) -> list[str]:
        canonical = canonicalize_matching_term(name)
        aliases = expand_matching_aliases(name)
        return [a for a in aliases if a != canonical]

    def _assert_ready(self) -> None:
        if not self._embedding_model:
            raise RuntimeError(
                "VectorEmbeddingService requires EMBEDDING_MODEL or a supported LLM_MODEL. "
                "Supported prefixes: gemini/, openai/, ollama/"
            )
        if aembedding is None:
            raise RuntimeError("litellm.aembedding is not available.")

    def _resolve_embedding_model(self) -> str | None:
        explicit = os.environ.get("EMBEDDING_MODEL")
        if explicit:
            return explicit
        llm_model = os.environ.get("LLM_MODEL", "")
        if llm_model.startswith("gemini/"):
            return "gemini/gemini-embedding-001"
        if llm_model.startswith("openai/"):
            return "openai/text-embedding-3-small"
        if llm_model.startswith("ollama/"):
            return "ollama/nomic-embed-text"
        return None
