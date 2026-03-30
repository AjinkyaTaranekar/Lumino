"""
Semantic match edge linker for skills and domains.

This service creates MATCHES edges using embedding-based semantic similarity
while preserving the existing graph scoring model:

  user Skill/Domain --MATCHES--> job requirement

The scoring engine still traverses MATCHES edges deterministically. The only
thing that changes here is how those edges are created.
"""

from __future__ import annotations

import logging
import math
import os
from collections import defaultdict
from typing import Any

from database.neo4j_client import Neo4jClient

try:
    from litellm import aembedding
except Exception:  # pragma: no cover - depends on optional runtime install
    aembedding = None

logger = logging.getLogger(__name__)


class SemanticMatchingService:
    def __init__(self, client: Neo4jClient):
        self.client = client
        self._enabled = os.environ.get("SEMANTIC_MATCH_ENABLED", "true").lower() not in {
            "0",
            "false",
            "no",
        }
        self._threshold = float(os.environ.get("SEMANTIC_MATCH_THRESHOLD", "0.72"))
        self._per_target_entity_limit = max(
            1, int(os.environ.get("SEMANTIC_MATCH_PER_TARGET_ENTITY_LIMIT", "1"))
        )
        self._batch_size = max(1, int(os.environ.get("EMBEDDING_BATCH_SIZE", "64")))
        self._embedding_model = self._resolve_embedding_model()
        self._task_type = os.environ.get("EMBEDDING_TASK_TYPE", "SEMANTIC_SIMILARITY")
        self._embedding_cache: dict[str, list[float]] = {}

    async def link_user_skill_matches(self, user_id: str) -> int:
        return await self._link_matches(
            delete_query="""
                MATCH (:User {id: $user_id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                      -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(:Skill)-[m:MATCHES]->
                      (:JobSkillRequirement)
                DELETE m
            """,
            delete_params={"user_id": user_id},
            source_query="""
                MATCH (u:User {id: $user_id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                      -[:HAS_SKILL_FAMILY]->(fam:SkillFamily)-[:HAS_SKILL]->(s:Skill)
                RETURN elementId(s) AS node_id,
                       s.name AS name,
                       fam.name AS family,
                       u.id AS owner_id
            """,
            source_params={"user_id": user_id},
            target_query="""
                MATCH (j:Job)-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                      -[:HAS_SKILL_FAMILY_REQ]->(fam:JobSkillFamily)
                      -[:REQUIRES_SKILL]->(req:JobSkillRequirement)
                RETURN elementId(req) AS node_id,
                       req.name AS name,
                       fam.name AS family,
                       j.id AS entity_id
            """,
            target_params={},
            edge_write_query="""
                MATCH (source:Skill) WHERE elementId(source) = $source_id
                MATCH (target:JobSkillRequirement) WHERE elementId(target) = $target_id
                MERGE (source)-[m:MATCHES]->(target)
                SET m.match_method = $match_method,
                    m.match_score = $match_score,
                    m.embedding_model = $embedding_model,
                    m.linked_at = timestamp(),
                    m.source_term = $source_term,
                    m.target_term = $target_term
            """,
            label="skill",
            scope_id=user_id,
        )

    async def link_domain_matches(self, user_id: str) -> int:
        return await self._link_matches(
            delete_query="""
                MATCH (:User {id: $user_id})-[:HAS_DOMAIN_CATEGORY]->(:DomainCategory)
                      -[:HAS_DOMAIN_FAMILY]->(:DomainFamily)-[:HAS_DOMAIN]->(:Domain)-[m:MATCHES]->
                      (:JobDomainRequirement)
                DELETE m
            """,
            delete_params={"user_id": user_id},
            source_query="""
                MATCH (u:User {id: $user_id})-[:HAS_DOMAIN_CATEGORY]->(:DomainCategory)
                      -[:HAS_DOMAIN_FAMILY]->(fam:DomainFamily)-[:HAS_DOMAIN]->(d:Domain)
                RETURN elementId(d) AS node_id,
                       d.name AS name,
                       fam.name AS family,
                       u.id AS owner_id
            """,
            source_params={"user_id": user_id},
            target_query="""
                MATCH (j:Job)-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
                      -[:HAS_DOMAIN_FAMILY_REQ]->(fam:JobDomainFamily)
                      -[:REQUIRES_DOMAIN]->(req:JobDomainRequirement)
                RETURN elementId(req) AS node_id,
                       req.name AS name,
                       fam.name AS family,
                       j.id AS entity_id
            """,
            target_params={},
            edge_write_query="""
                MATCH (source:Domain) WHERE elementId(source) = $source_id
                MATCH (target:JobDomainRequirement) WHERE elementId(target) = $target_id
                MERGE (source)-[m:MATCHES]->(target)
                SET m.match_method = $match_method,
                    m.match_score = $match_score,
                    m.embedding_model = $embedding_model,
                    m.linked_at = timestamp(),
                    m.source_term = $source_term,
                    m.target_term = $target_term
            """,
            label="domain",
            scope_id=user_id,
        )

    async def link_job_skill_matches(self, job_id: str) -> int:
        return await self._link_matches(
            delete_query="""
                MATCH (:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                      -[:HAS_SKILL_FAMILY_REQ]->(:JobSkillFamily)-[:REQUIRES_SKILL]->
                      (:JobSkillRequirement)<-[m:MATCHES]-(:Skill)
                DELETE m
            """,
            delete_params={"job_id": job_id},
            source_query="""
                MATCH (u:User)-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                      -[:HAS_SKILL_FAMILY]->(fam:SkillFamily)-[:HAS_SKILL]->(s:Skill)
                RETURN elementId(s) AS node_id,
                       s.name AS name,
                       fam.name AS family,
                       u.id AS owner_id
            """,
            source_params={},
            target_query="""
                MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                      -[:HAS_SKILL_FAMILY_REQ]->(fam:JobSkillFamily)
                      -[:REQUIRES_SKILL]->(req:JobSkillRequirement)
                RETURN elementId(req) AS node_id,
                       req.name AS name,
                       fam.name AS family,
                       j.id AS entity_id
            """,
            target_params={"job_id": job_id},
            edge_write_query="""
                MATCH (source:Skill) WHERE elementId(source) = $source_id
                MATCH (target:JobSkillRequirement) WHERE elementId(target) = $target_id
                MERGE (source)-[m:MATCHES]->(target)
                SET m.match_method = $match_method,
                    m.match_score = $match_score,
                    m.embedding_model = $embedding_model,
                    m.linked_at = timestamp(),
                    m.source_term = $source_term,
                    m.target_term = $target_term
            """,
            label="skill",
            scope_id=job_id,
        )

    async def link_job_domain_matches(self, job_id: str) -> int:
        return await self._link_matches(
            delete_query="""
                MATCH (:Job {id: $job_id})-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
                      -[:HAS_DOMAIN_FAMILY_REQ]->(:JobDomainFamily)-[:REQUIRES_DOMAIN]->
                      (:JobDomainRequirement)<-[m:MATCHES]-(:Domain)
                DELETE m
            """,
            delete_params={"job_id": job_id},
            source_query="""
                MATCH (u:User)-[:HAS_DOMAIN_CATEGORY]->(:DomainCategory)
                      -[:HAS_DOMAIN_FAMILY]->(fam:DomainFamily)-[:HAS_DOMAIN]->(d:Domain)
                RETURN elementId(d) AS node_id,
                       d.name AS name,
                       fam.name AS family,
                       u.id AS owner_id
            """,
            source_params={},
            target_query="""
                MATCH (j:Job {id: $job_id})-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
                      -[:HAS_DOMAIN_FAMILY_REQ]->(fam:JobDomainFamily)
                      -[:REQUIRES_DOMAIN]->(req:JobDomainRequirement)
                RETURN elementId(req) AS node_id,
                       req.name AS name,
                       fam.name AS family,
                       j.id AS entity_id
            """,
            target_params={"job_id": job_id},
            edge_write_query="""
                MATCH (source:Domain) WHERE elementId(source) = $source_id
                MATCH (target:JobDomainRequirement) WHERE elementId(target) = $target_id
                MERGE (source)-[m:MATCHES]->(target)
                SET m.match_method = $match_method,
                    m.match_score = $match_score,
                    m.embedding_model = $embedding_model,
                    m.linked_at = timestamp(),
                    m.source_term = $source_term,
                    m.target_term = $target_term
            """,
            label="domain",
            scope_id=job_id,
        )

    async def _link_matches(
        self,
        *,
        delete_query: str,
        delete_params: dict[str, Any],
        source_query: str,
        source_params: dict[str, Any],
        target_query: str,
        target_params: dict[str, Any],
        edge_write_query: str,
        label: str,
        scope_id: str,
    ) -> int:
        await self.client.run_write(delete_query, delete_params)

        sources = await self.client.run_query(source_query, source_params)
        targets = await self.client.run_query(target_query, target_params)

        if not sources or not targets:
            logger.info("No %s semantic matches to link for scope %s", label, scope_id)
            return 0

        self._assert_semantic_ready()
        candidates = await self._build_candidates(sources, targets, label)
        for candidate in candidates:
            await self.client.run_write(edge_write_query, candidate)

        logger.info(
            "Linked %s %s MATCHES edges using %s for scope %s",
            len(candidates),
            label,
            self._embedding_model,
            scope_id,
        )
        return len(candidates)

    async def _build_candidates(
        self,
        sources: list[dict[str, Any]],
        targets: list[dict[str, Any]],
        label: str,
    ) -> list[dict[str, Any]]:
        semantic_sources: list[dict[str, Any]] = []
        semantic_targets: list[dict[str, Any]] = []

        for source in sources:
            source["embedding_text"] = self._build_embedding_text(
                label, source.get("name"), source.get("family")
            )
            semantic_sources.append(source)

        for target in targets:
            target["embedding_text"] = self._build_embedding_text(
                label, target.get("name"), target.get("family")
            )
            semantic_targets.append(target)

        semantic_candidates: list[dict[str, Any]] = []
        source_embeddings = await self._embed_texts(
            [source["embedding_text"] for source in semantic_sources]
        )
        target_embeddings = await self._embed_texts(
            [target["embedding_text"] for target in semantic_targets]
        )

        for source, source_embedding in zip(semantic_sources, source_embeddings):
            by_entity: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for target, target_embedding in zip(semantic_targets, target_embeddings):
                if not self._families_compatible(source.get("family"), target.get("family")):
                    continue
                score = self._cosine_similarity(source_embedding, target_embedding)
                if score < self._threshold:
                    continue
                by_entity[target["entity_id"]].append(
                    self._make_candidate(
                        source=source,
                        target=target,
                        score=score,
                        method="semantic",
                    )
                )
            for group in by_entity.values():
                group.sort(key=lambda item: item["match_score"], reverse=True)
                semantic_candidates.extend(group[: self._per_target_entity_limit])

        return self._dedupe_candidates(semantic_candidates)

    async def _embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        missing = [text for text in texts if text not in self._embedding_cache]
        for start in range(0, len(missing), self._batch_size):
            batch = missing[start : start + self._batch_size]
            if not batch:
                continue
            try:
                response = await aembedding(
                    model=self._embedding_model,
                    input=batch,
                    task_type=self._task_type,
                )
                raw_data = response.data if hasattr(response, "data") else response["data"]
                for text, row in zip(batch, raw_data):
                    embedding = row["embedding"] if isinstance(row, dict) else row.embedding
                    self._embedding_cache[text] = embedding
            except Exception as exc:
                raise RuntimeError(
                    f"Semantic matching failed for embedding model "
                    f"{self._embedding_model}: {exc}"
                )

        return [self._embedding_cache[text] for text in texts]

    def _dedupe_candidates(
        self, candidates: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        best_by_owner_and_target: dict[tuple[str, str], dict[str, Any]] = {}
        for candidate in candidates:
            key = (candidate["source_owner_id"], candidate["target_id"])
            existing = best_by_owner_and_target.get(key)
            if existing is None or candidate["match_score"] > existing["match_score"]:
                best_by_owner_and_target[key] = candidate
        return list(best_by_owner_and_target.values())

    def _make_candidate(
        self,
        *,
        source: dict[str, Any],
        target: dict[str, Any],
        score: float,
        method: str,
    ) -> dict[str, Any]:
        return {
            "source_id": source["node_id"],
            "target_id": target["node_id"],
            "source_owner_id": source["owner_id"],
            "target_entity_id": target["entity_id"],
            "match_method": method,
            "match_score": round(score, 6),
            "embedding_model": self._embedding_model,
            "source_term": source.get("name"),
            "target_term": target.get("name"),
        }

    def _assert_semantic_ready(self) -> None:
        if not self._enabled:
            raise RuntimeError("Semantic matching is disabled via SEMANTIC_MATCH_ENABLED.")
        if not self._embedding_model:
            raise RuntimeError(
                "Semantic matching requires EMBEDDING_MODEL or a supported LLM_MODEL provider."
            )
        if aembedding is None:
            raise RuntimeError(
                "Semantic matching requires litellm.aembedding, but it is unavailable."
            )

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

    def _build_embedding_text(self, label: str, name: str | None, family: str | None) -> str:
        clean_name = (name or "").strip()
        clean_family = (family or "").strip()
        if clean_family and clean_family.lower() != "other":
            return f"{label}: {clean_name}. family: {clean_family}"
        return f"{label}: {clean_name}"

    def _families_compatible(self, source_family: str | None, target_family: str | None) -> bool:
        left = (source_family or "").strip().lower()
        right = (target_family or "").strip().lower()
        if not left or not right:
            return True
        if left == "other" or right == "other":
            return True
        return left == right

    def _cosine_similarity(self, left: list[float], right: list[float]) -> float:
        numerator = sum(a * b for a, b in zip(left, right))
        left_norm = math.sqrt(sum(a * a for a in left))
        right_norm = math.sqrt(sum(b * b for b in right))
        if left_norm == 0.0 or right_norm == 0.0:
            return 0.0
        return numerator / (left_norm * right_norm)
