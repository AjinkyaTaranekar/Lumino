# GraphRAG Vector Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace precomputed MATCHES edges + batch relinking with context-enriched embedding vectors stored on nodes and Neo4j native vector index ANN search at match time.

**Architecture:** `VectorEmbeddingService` traverses each node's graph neighborhood at ingestion, assembles enriched text (skill → project 5W+H, domain → projects, job requirement → role context), calls the embedding API in a single batch per ingestion, and stores the vector on the node. At match time, `MatchingEngine` queries `db.index.vector.queryNodes()` instead of traversing MATCHES edges. No precomputed edges. No relinking. Adding a new entity is O(N) where N = that entity's own nodes.

**Tech Stack:** Python 3.12, FastAPI, Neo4j 5.x AuraDB, litellm, pytest + unittest.mock

---

## Important Discoveries (read before implementing)

1. **`_compute_domain_score` does NOT use MATCHES edges.** It uses exact string matching in Python. Domain MATCHES edges were created but never read by the scoring engine. This plan changes domain scoring to use vector index — a real improvement.

2. **`_compute_skill_score` uses 4 separate Cypher queries** (mandatory_matched, mandatory_all, optional_matched, optional_all). The new implementation collapses this to 2 queries that use `CALL {} + db.index.vector.queryNodes`.

3. **No existing test suite.** Create `backend/tests/` directory. All tests use `pytest` with `unittest.mock` to mock `Neo4jClient` and `litellm.aembedding`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `models/schemas.py` | Modify | Add `context` to `ExtractedSkill`/`ExtractedJobSkillRequirement`; `description` to `ExtractedDomain`; `importance`/`depth` to `ExtractedJobDomainRequirement` |
| `services/vector_embedding.py` | **Create** | `VectorEmbeddingService` — neighborhood Cypher queries, embedding text assembly, batch API calls, vector write-back, reembed methods |
| `services/semantic_matching.py` | **Delete** | Replaced entirely by `vector_embedding.py` |
| `services/llm_ingestion.py` | Modify | Fix storage gaps for new fields; replace `SemanticMatchingService` with `VectorEmbeddingService`; call batch embed after all nodes written; delete `link_*` methods |
| `services/ingestion.py` | Modify | Remove `link_*` calls; update result dict to use `skills_embedded`/`domains_embedded` |
| `services/matching_engine.py` | Modify | Replace MATCHES traversal in `_compute_skill_score` + exact-string in `_compute_domain_score` with `CALL {} + db.index.vector.queryNodes`; add `_threshold` |
| `database/neo4j_client.py` | Modify | Add `setup_vector_indexes(dimensions: int)` |
| `main.py` | Modify | Call `setup_vector_indexes` at startup |
| `api/routes.py` | Modify | Remove `POST /admin/relink-matches`; add `POST /admin/reembed` |
| `models/schemas.py` | Modify | Add `ReembedResponse`; remove `RelinkMatchesResponse` |
| `.env` / `.env.example` | Modify | Add `EMBEDDING_DIMENSIONS=768`; remove `SEMANTIC_MATCH_PER_TARGET_ENTITY_LIMIT` |
| `backend/tests/test_vector_embedding.py` | **Create** | Unit tests for `VectorEmbeddingService` |
| `backend/tests/test_matching_engine.py` | **Create** | Unit tests for updated scoring queries |
| `backend/tests/__init__.py` | **Create** | Empty, makes tests a package |

---

## Task 1: Extraction Schema Additions

**Spec ref:** Section 4.1

**Files:**
- Modify: `backend/models/schemas.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_schemas.py`

- [ ] **Step 1: Create test file and write failing tests**

Create `backend/tests/__init__.py` (empty).

Create `backend/tests/test_schemas.py`:

```python
import pytest
from models.schemas import (
    ExtractedSkill, ExtractedDomain,
    ExtractedJobSkillRequirement, ExtractedJobDomainRequirement,
)


def test_extracted_skill_has_context_field():
    skill = ExtractedSkill(name="Python", family="Programming Languages")
    assert skill.context is None  # optional, defaults to None


def test_extracted_skill_context_accepts_string():
    skill = ExtractedSkill(
        name="Python",
        family="Programming Languages",
        context="Used for production ML pipelines serving 1M daily predictions.",
    )
    assert skill.context == "Used for production ML pipelines serving 1M daily predictions."


def test_extracted_domain_has_description_field():
    domain = ExtractedDomain(name="FinTech", family="FinTech")
    assert domain.description is None


def test_extracted_domain_description_accepts_string():
    domain = ExtractedDomain(
        name="FinTech",
        family="FinTech",
        description="Deep expertise in payment systems and PCI-DSS compliance.",
    )
    assert domain.description == "Deep expertise in payment systems and PCI-DSS compliance."


def test_extracted_job_skill_req_has_context_field():
    req = ExtractedJobSkillRequirement(name="Python", family="Programming Languages")
    assert req.context is None


def test_extracted_job_domain_req_has_importance_and_depth():
    req = ExtractedJobDomainRequirement(name="FinTech", family="FinTech")
    assert req.importance == "must_have"  # default
    assert req.depth is None


def test_extracted_job_domain_req_importance_optional():
    req = ExtractedJobDomainRequirement(
        name="FinTech", family="FinTech", importance="optional", depth="deep"
    )
    assert req.importance == "optional"
    assert req.depth == "deep"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_schemas.py -v
```

Expected: 7 failures — fields don't exist yet.

- [ ] **Step 3: Add new fields to `models/schemas.py`**

In `ExtractedSkill` (after `evidence_strength` field, ~line 42):
```python
    context: Optional[str] = Field(
        default=None,
        description=(
            "One sentence capturing WHY this skill stands out for this candidate: "
            "their primary use case, strongest application, or most notable context. "
            "e.g. 'Used Python for production ML pipelines serving 1M daily predictions, "
            "not just scripting.' Leave null if nothing notable beyond the projects."
        ),
    )
```

In `ExtractedDomain` (after `depth` field, ~line 124):
```python
    description: Optional[str] = Field(
        default=None,
        description=(
            "One to two sentences describing the candidate's experience in this domain: "
            "what they've built, what they understand deeply, what distinguishes their knowledge. "
            "e.g. 'Deep expertise in FinTech payments — PCI-DSS compliance, idempotent "
            "transaction design, high-throughput settlement flows.'"
        ),
    )
```

In `ExtractedJobSkillRequirement` (after `min_years` field, ~line 478):
```python
    context: Optional[str] = Field(
        default=None,
        description=(
            "Why the job needs this skill specifically — the technical context in which it will be used. "
            "e.g. 'Core to the async payment processing pipeline — candidate must understand "
            "backpressure and retry semantics.' Leave null if the JD gives no context."
        ),
    )
```

In `ExtractedJobDomainRequirement` (after `min_years` field, ~line 489):
```python
    importance: Literal["must_have", "optional"] = Field(
        default="must_have",
        description="must_have for required domain experience, optional for nice-to-have",
    )
    depth: Optional[Literal["shallow", "moderate", "deep"]] = Field(
        default=None,
        description="Required depth of domain knowledge",
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_schemas.py -v
```

Expected: 7 PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/models/schemas.py backend/tests/__init__.py backend/tests/test_schemas.py
git commit -m "feat: add context/description fields to extraction models"
```

---

## Task 2: Fix Storage Gaps in LLMIngestionService

**Spec ref:** Section 4.2 — fields extracted but never stored.

**Files:**
- Modify: `backend/services/llm_ingestion.py`

- [ ] **Step 1: Fix `_ingest_skills` — store `context`**

In `_ingest_skills`, find the SET clause and add `s.context`:

```python
# In the MERGE/SET Cypher string, add to SET block:
                    s.context           = $context
# In the params dict, add:
                    "context": getattr(skill, "context", None),
```

Full updated SET clause in `_ingest_skills`:
```cypher
MERGE (s:Skill {name: $name, user_id: $user_id})
SET s.years             = $years,
    s.level             = $level,
    s.evidence_strength = $evidence_strength,
    s.context           = $context,
    s.source            = 'llm'
```

Full updated params dict in `_ingest_skills`:
```python
{
    "user_id": user_id,
    "family": skill.family or "Other",
    "name": skill.name,
    "years": skill.years,
    "level": skill.level,
    "evidence_strength": getattr(skill, "evidence_strength", None),
    "context": getattr(skill, "context", None),
}
```

- [ ] **Step 2: Fix `_ingest_domains` — store `description`**

In the SET clause for `Domain`:
```cypher
MERGE (d:Domain {name: $name, user_id: $user_id})
SET d.years_experience = $years,
    d.depth            = $depth,
    d.description      = $description,
    d.source           = 'llm'
```

In the params dict:
```python
{
    "user_id": user_id,
    "family": domain.family or "Other",
    "name": domain.name,
    "years": domain.years_experience,
    "depth": domain.depth,
    "description": getattr(domain, "description", None),
}
```

- [ ] **Step 3: Fix `_ingest_job_skills` — store `context`**

In the SET clause for `JobSkillRequirement`:
```cypher
MERGE (r:JobSkillRequirement {name: $name, job_id: $job_id})
SET r.required   = $required,
    r.importance = $importance,
    r.min_years  = $min_years,
    r.context    = $context,
    r.source     = 'llm'
```

In the params dict:
```python
{
    "job_id": job_id,
    "family": req.family or "Other",
    "name": req.name,
    "required": req.required,
    "importance": req.importance,
    "min_years": req.min_years,
    "context": getattr(req, "context", None),
}
```

- [ ] **Step 4: Fix `_ingest_job_domains` — store `importance` and `depth`**

In the SET clause for `JobDomainRequirement`:
```cypher
MERGE (dr:JobDomainRequirement {name: $name, job_id: $job_id})
SET dr.min_years  = $min_years,
    dr.importance = $importance,
    dr.depth      = $depth,
    dr.source     = 'llm'
```

In the params dict:
```python
{
    "job_id": job_id,
    "family": req.family or "Other",
    "name": req.name,
    "min_years": req.min_years,
    "importance": getattr(req, "importance", "must_have"),
    "depth": getattr(req, "depth", None),
}
```

- [ ] **Step 5: Start the backend and verify it starts without errors**

```bash
cd backend && uvicorn main:app --reload
```

Expected: Server starts, no import errors.

- [ ] **Step 6: Commit**

```bash
git add backend/services/llm_ingestion.py
git commit -m "fix: store domain.description, job domain importance/depth, skill/job-skill context"
```

---

## Task 3: Vector Index Setup

**Spec ref:** Section 6

**Files:**
- Modify: `backend/database/neo4j_client.py`
- Modify: `backend/main.py`
- Modify: `backend/.env` and `backend/.env.example`

- [ ] **Step 1: Add `EMBEDDING_DIMENSIONS` to `.env` and `.env.example`**

In `backend/.env`, add after the semantic matching block:
```
EMBEDDING_DIMENSIONS=768
```

In `backend/.env.example`, add after `EMBEDDING_TASK_TYPE` line:
```
# Vector index dimensions — must match your embedding model output size:
#   gemini/gemini-embedding-001 → 768
#   openai/text-embedding-3-small → 1536
#   ollama/nomic-embed-text → 768
EMBEDDING_DIMENSIONS=768
```

Also remove this line from `.env.example` (no longer applicable):
```
SEMANTIC_MATCH_PER_TARGET_ENTITY_LIMIT=1
```

- [ ] **Step 2: Add `setup_vector_indexes` to `neo4j_client.py`**

Add this method to `Neo4jClient` class, after `setup_constraints`:

```python
async def setup_vector_indexes(self, dimensions: int) -> None:
    """
    Create Neo4j vector indexes for semantic similarity search.
    Called once at startup after setup_constraints().

    Each index stores embedding vectors on a node label's `embedding` property.
    `dimensions` must match the embedding model output size (768 for Gemini/nomic,
    1536 for text-embedding-3-small).
    """
    indexes = [
        ("skill_embeddings",       "Skill",                "embedding"),
        ("domain_embeddings",      "Domain",               "embedding"),
        ("job_skill_embeddings",   "JobSkillRequirement",  "embedding"),
        ("job_domain_embeddings",  "JobDomainRequirement", "embedding"),
    ]
    for index_name, label, prop in indexes:
        try:
            await self.run_write(
                f"CREATE VECTOR INDEX {index_name} IF NOT EXISTS "
                f"FOR (n:{label}) ON n.{prop} "
                f"OPTIONS {{indexConfig: {{"
                f"`vector.dimensions`: {dimensions}, "
                f"`vector.similarity_function`: 'cosine'"
                f"}}}}"
            )
            logger.info("Vector index ready: %s (%s.%s, dims=%d)", index_name, label, prop, dimensions)
        except Exception as e:
            logger.warning("Vector index skipped (may already exist with different dims): %s", e)
```

- [ ] **Step 3: Call `setup_vector_indexes` in `main.py` lifespan**

In the `lifespan` function, after `await init_client(...)`:

```python
    # existing line:
    client = await init_client(neo4j_uri, neo4j_user, neo4j_pass)

    # add:
    embedding_dims = int(os.environ.get("EMBEDDING_DIMENSIONS", "768"))
    await client.setup_vector_indexes(embedding_dims)
    logger.info("Vector indexes ready (dims=%d)", embedding_dims)
```

- [ ] **Step 4: Start backend and verify indexes are created**

```bash
cd backend && uvicorn main:app --reload
```

Expected log lines:
```
[INFO] database.neo4j_client: Vector index ready: skill_embeddings (Skill.embedding, dims=768)
[INFO] database.neo4j_client: Vector index ready: domain_embeddings (Domain.embedding, dims=768)
[INFO] database.neo4j_client: Vector index ready: job_skill_embeddings (JobSkillRequirement.embedding, dims=768)
[INFO] database.neo4j_client: Vector index ready: job_domain_embeddings (JobDomainRequirement.embedding, dims=768)
```

- [ ] **Step 5: Commit**

```bash
git add backend/database/neo4j_client.py backend/main.py backend/.env backend/.env.example
git commit -m "feat: create Neo4j vector indexes at startup for GraphRAG matching"
```

---

## Task 4: Create VectorEmbeddingService

**Spec ref:** Section 5

**Files:**
- Create: `backend/services/vector_embedding.py`
- Create: `backend/tests/test_vector_embedding.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_vector_embedding.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def make_client(query_returns=None, write_returns=None):
    client = MagicMock()
    client.run_query = AsyncMock(return_value=query_returns or [])
    client.run_write = AsyncMock(return_value=write_returns)
    return client


@pytest.mark.asyncio
async def test_embed_user_skills_returns_zero_when_no_skills():
    from services.vector_embedding import VectorEmbeddingService
    client = make_client(query_returns=[])
    svc = VectorEmbeddingService(client)
    result = await svc.embed_user_skills("user1")
    assert result == 0


@pytest.mark.asyncio
async def test_embed_user_skills_calls_embedding_api_and_stores_vector():
    from services.vector_embedding import VectorEmbeddingService

    skill_rows = [{
        "node_id": "elem-1",
        "name": "Python",
        "years": 4,
        "level": "advanced",
        "evidence": "project_backed",
        "context": "Used for ML pipelines.",
        "family": "Programming Languages",
        "project_usages": [{"project": "DataPipeline", "what": "ETL", "how": "Airflow",
                             "why": None, "scale": "1M records/day", "outcome": "40% cost cut"}],
        "domains": ["Data Engineering"],
    }]

    client = make_client(query_returns=skill_rows)
    fake_vector = [0.1] * 768

    with patch("services.vector_embedding.aembedding") as mock_embed:
        mock_embed.return_value = MagicMock(data=[MagicMock(embedding=fake_vector)])
        svc = VectorEmbeddingService(client)
        svc._embedding_model = "gemini/gemini-embedding-001"
        result = await svc.embed_user_skills("user1")

    assert result == 1
    mock_embed.assert_called_once()
    client.run_write.assert_called_once()
    write_call_params = client.run_write.call_args[0][1]
    assert write_call_params["vector"] == fake_vector


@pytest.mark.asyncio
async def test_embed_user_skills_disabled_returns_zero():
    from services.vector_embedding import VectorEmbeddingService
    client = make_client()
    with patch.dict("os.environ", {"SEMANTIC_MATCH_ENABLED": "false"}):
        svc = VectorEmbeddingService(client)
        result = await svc.embed_user_skills("user1")
    assert result == 0
    client.run_query.assert_not_called()


@pytest.mark.asyncio
async def test_build_skill_text_includes_project_context():
    from services.vector_embedding import VectorEmbeddingService
    client = make_client()
    svc = VectorEmbeddingService(client)

    row = {
        "name": "Python",
        "family": "Programming Languages",
        "years": 4,
        "level": "advanced",
        "evidence": "project_backed",
        "context": "Core language for all backend services.",
        "project_usages": [
            {"project": "API", "what": "REST endpoints", "how": "FastAPI",
             "why": "speed", "scale": "50k users", "outcome": "99.9% uptime"},
        ],
        "domains": ["Web Development"],
    }
    text = svc._build_skill_text(row)
    assert "Python" in text
    assert "advanced" in text
    assert "REST endpoints" in text
    assert "50k users" in text
    assert "Core language for all backend services." in text
    assert "Web Development" in text


@pytest.mark.asyncio
async def test_embed_job_skill_reqs_skips_reqs_without_embedding_data():
    from services.vector_embedding import VectorEmbeddingService

    req_rows = [{
        "node_id": "elem-2",
        "name": "React",
        "importance": "must_have",
        "min_years": 2,
        "context": None,
        "family": "Web Frameworks",
        "job_title": "Frontend Engineer",
        "company": "Stripe",
        "job_domains": ["FinTech"],
    }]

    client = make_client(query_returns=req_rows)
    fake_vector = [0.2] * 768

    with patch("services.vector_embedding.aembedding") as mock_embed:
        mock_embed.return_value = MagicMock(data=[MagicMock(embedding=fake_vector)])
        svc = VectorEmbeddingService(client)
        svc._embedding_model = "gemini/gemini-embedding-001"
        result = await svc.embed_job_skill_reqs("job1")

    assert result == 1
    client.run_write.assert_called_once()


@pytest.mark.asyncio
async def test_reembed_user_returns_skill_and_domain_counts():
    from services.vector_embedding import VectorEmbeddingService
    client = make_client()

    svc = VectorEmbeddingService(client)
    svc.embed_user_skills = AsyncMock(return_value=5)
    svc.embed_user_domains = AsyncMock(return_value=3)

    result = await svc.reembed_user("user1")
    assert result == {"skills_embedded": 5, "domains_embedded": 3}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_vector_embedding.py -v
```

Expected: ImportError or AttributeError — `services.vector_embedding` does not exist.

- [ ] **Step 3: Create `backend/services/vector_embedding.py`**

```python
"""
Vector embedding service for GraphRAG matching.

Stores context-enriched embedding vectors directly on graph nodes at ingestion time.
Replaces semantic_matching.py's MATCHES edge approach with node-level vectors
that are queried at match time via Neo4j vector index ANN search.

Scaling: O(N) per new entity (only that entity's nodes are embedded).
No relinking. No cross-entity precomputation.
"""

from __future__ import annotations

import logging
import math
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
        """Embed all Skill nodes for a user. Returns count of nodes embedded."""
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
        """Embed all Domain nodes for a user. Returns count of nodes embedded."""
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

        parts.append(f"skill: {name}")
        if family and family.lower() != "other":
            parts[-1] += f". family: {family}"

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
            if usage.get("what"):
                proj_parts.append(f"what: {usage['what']}")
            if usage.get("how"):
                proj_parts.append(f"how: {usage['how']}")
            if usage.get("scale"):
                proj_parts.append(f"scale: {usage['scale']}")
            if usage.get("outcome"):
                proj_parts.append(f"outcome: {usage['outcome']}")
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

        parts.append(f"domain: {name}")
        if family and family.lower() != "other":
            parts[-1] += f". family: {family}"

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
                proj_text += f" — {proj['description'][:100]}"
            parts.append(proj_text)

        aliases = self._get_aliases(name)
        if aliases:
            parts.append(f"related terms: {', '.join(aliases[:6])}")

        return ". ".join(parts)

    def _build_job_skill_text(self, row: dict) -> str:
        parts: list[str] = []
        name = (row.get("name") or "").strip()
        family = (row.get("family") or "").strip()

        parts.append(f"skill: {name}")
        if family and family.lower() != "other":
            parts[-1] += f". family: {family}"

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

        parts.append(f"domain: {name}")
        if family and family.lower() != "other":
            parts[-1] += f". family: {family}"

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

        # Batch write: one UNWIND transaction for all vectors
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_vector_embedding.py -v
```

Expected: 7 PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/services/vector_embedding.py backend/tests/test_vector_embedding.py
git commit -m "feat: add VectorEmbeddingService with context-enriched node embedding"
```

---

## Task 5: Wire VectorEmbeddingService into Ingestion

**Spec ref:** Section 7

**Files:**
- Modify: `backend/services/llm_ingestion.py`
- Modify: `backend/services/ingestion.py`

- [ ] **Step 1: Replace SemanticMatchingService with VectorEmbeddingService in `llm_ingestion.py`**

Change the import and `__init__`:

```python
# Remove:
from services.semantic_matching import SemanticMatchingService

# Add:
from services.vector_embedding import VectorEmbeddingService
```

In `LLMIngestionService.__init__`:
```python
# Remove:
self._semantic_matcher = SemanticMatchingService(client)

# Add:
self._embedder = VectorEmbeddingService(client)
```

- [ ] **Step 2: Add batch embed calls to `ingest_user_profile`**

At the end of `ingest_user_profile`, after `recompute_weights(...)`:

```python
        await recompute_weights(user_id, self.client)
        # Embed all skill and domain nodes in batch (after weights are set)
        await self._embedder.embed_user_skills(user_id)
        await self._embedder.embed_user_domains(user_id)
        logger.info(f"LLM hierarchy written and embedded for user {user_id}")
```

- [ ] **Step 3: Add batch embed calls to `ingest_job_posting`**

Find the `ingest_job_posting` method. After all node writes complete, add:

```python
        # Embed all job requirement nodes in batch
        await self._embedder.embed_job_skill_reqs(job_id)
        await self._embedder.embed_job_domain_reqs(job_id)
        logger.info(f"Job posting written and embedded for job {job_id}")
```

- [ ] **Step 4: Remove the `link_*` delegating methods from `LLMIngestionService`**

Delete these methods entirely (they are replaced by the embed calls above):

- `link_skill_matches(self, user_id)`
- `link_domain_matches(self, user_id)`
- `link_job_skill_matches(self, job_id)`
- `link_job_domain_matches(self, job_id)`
- `relink_user_matches(self, user_id)`
- `relink_job_matches(self, job_id)`

- [ ] **Step 5: Update `services/ingestion.py` — remove link calls, update result keys**

In `ingest_user`:

```python
# Remove these two lines:
skill_links = await self._llm_ingester.link_skill_matches(user_id)
domain_links = await self._llm_ingester.link_domain_matches(user_id)

# In the result dict, replace:
"skill_matches_linked": skill_links,
"domain_matches_linked": domain_links,
# With: (embedding counts come from the service logs; no count returned at this level)
# Remove those two keys entirely from the result dict.
```

In `ingest_job`:

```python
# Remove:
skill_links = await self._llm_ingester.link_job_skill_matches(job_id)
domain_links = await self._llm_ingester.link_job_domain_matches(job_id)

# In result dict, remove:
"skill_matches_linked": skill_links,
"domain_matches_linked": domain_links,
```

- [ ] **Step 6: Verify backend starts and ingestion works end-to-end**

Start backend:
```bash
cd backend && uvicorn main:app --reload
```

POST a test user ingestion via Swagger at `http://localhost:8000/docs` or curl:
```bash
curl -X POST http://localhost:8000/api/v1/users/ingest \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test_graphrag_01", "profile_text": "Senior Python developer with 5 years experience in FastAPI and PostgreSQL."}'
```

Expected logs:
```
[INFO] services.vector_embedding: Embedded N Skill nodes using gemini/gemini-embedding-001 for scope test_graphrag_01
[INFO] services.vector_embedding: Embedded M Domain nodes using gemini/gemini-embedding-001 for scope test_graphrag_01
```

- [ ] **Step 7: Commit**

```bash
git add backend/services/llm_ingestion.py backend/services/ingestion.py
git commit -m "feat: wire VectorEmbeddingService into ingestion pipeline, remove link_* methods"
```

---

## Task 6: Update Scoring Engine — Skill Score

**Spec ref:** Section 8.1 and 8.4

**Files:**
- Modify: `backend/services/matching_engine.py`
- Create: `backend/tests/test_matching_engine.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_matching_engine.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def make_engine(query_side_effects=None):
    from services.matching_engine import MatchingEngine
    client = MagicMock()
    if query_side_effects:
        client.run_query = AsyncMock(side_effect=query_side_effects)
    else:
        client.run_query = AsyncMock(return_value=[])
    client.run_write = AsyncMock()
    return MatchingEngine(client)


@pytest.mark.asyncio
async def test_compute_skill_score_returns_zero_when_no_job_reqs():
    from services.matching_engine import MatchingEngine
    client = MagicMock()
    # mandatory_reqs returns empty, optional_reqs returns empty
    client.run_query = AsyncMock(side_effect=[[], []])
    engine = MatchingEngine(client)
    result = await engine._compute_skill_score("user1", "job1")
    assert result["mandatory_score"] == 0.0
    assert result["optional_score"] == 0.0
    assert result["matched"] == []
    assert result["missing"] == []


@pytest.mark.asyncio
async def test_compute_skill_score_matched_skill_contributes_to_score():
    from services.matching_engine import MatchingEngine
    from models.taxonomies import EvidenceWeight, SkillImportanceWeight

    # mandatory_reqs: one must_have requirement with embedding
    mandatory_reqs = [{
        "name": "Python",
        "importance": "must_have",
        "min_years": 3,
        "embedding": [0.1] * 768,
        "family": "Programming Languages",
    }]
    # mandatory_all: same requirement for total weight calculation
    mandatory_all = [{
        "name": "Python",
        "importance": "must_have",
        "min_years": 3,
    }]
    # Vector index result: user skill matches with high similarity
    vector_match = [{
        "name": "Python",
        "years": 4,
        "level": "advanced",
        "evidence_strength": "project_backed",
        "similarity": 0.95,
    }]
    # optional reqs: empty
    optional_reqs = []

    client = MagicMock()
    client.run_query = AsyncMock(side_effect=[
        mandatory_reqs,   # fetch mandatory reqs
        mandatory_all,    # fetch all mandatory for total weight
        optional_reqs,    # fetch optional reqs
        [],               # fetch all optional for total weight
        vector_match,     # vector index query for "Python"
    ])
    engine = MatchingEngine(client)
    engine._threshold = 0.72

    result = await engine._compute_skill_score("user1", "job1")

    assert result["mandatory_score"] > 0.0
    assert "python" in result["matched"]
    assert result["missing"] == []


@pytest.mark.asyncio
async def test_compute_skill_score_no_embedding_on_req_counts_as_missing():
    from services.matching_engine import MatchingEngine

    # Req exists but has no embedding — can't vector-match it
    mandatory_reqs = []  # filtered out by WHERE req.embedding IS NOT NULL
    mandatory_all = [{"name": "Go", "importance": "must_have", "min_years": None}]
    client = MagicMock()
    client.run_query = AsyncMock(side_effect=[mandatory_reqs, mandatory_all, [], []])
    engine = MatchingEngine(client)
    engine._threshold = 0.72

    result = await engine._compute_skill_score("user1", "job1")
    assert result["mandatory_score"] == 0.0
    assert "go" in result["missing"]


@pytest.mark.asyncio
async def test_compute_domain_score_uses_vector_index():
    from services.matching_engine import MatchingEngine

    domain_reqs = [{
        "name": "FinTech",
        "family": "FinTech",
        "embedding": [0.3] * 768,
    }]
    vector_match = [{
        "name": "FinTech",
        "depth": "deep",
        "similarity": 0.88,
    }]
    client = MagicMock()
    client.run_query = AsyncMock(side_effect=[domain_reqs, vector_match])
    engine = MatchingEngine(client)
    engine._threshold = 0.72

    result = await engine._compute_domain_score("user1", "job1")
    assert result["score"] > 0.0
    assert "fintech" in [m.lower() for m in result["matched"]]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_matching_engine.py -v
```

Expected: Failures because `_compute_skill_score` still uses MATCHES edge queries.

- [ ] **Step 3: Add `_threshold` to `MatchingEngine.__init__`**

```python
class MatchingEngine:
    def __init__(self, client: Neo4jClient, analytics_service=None):
        self.client = client
        self._analytics = analytics_service
        self._threshold = float(os.environ.get("SEMANTIC_MATCH_THRESHOLD", "0.72"))
```

Add `import os` at the top of `matching_engine.py` if not present.

- [ ] **Step 4: Replace `_compute_skill_score` with vector index version**

Replace the entire `_compute_skill_score` method body with:

```python
    async def _compute_skill_score(self, user_id: str, job_id: str) -> dict:
        """
        Evidence-weighted skill match using Neo4j vector index ANN search.

        For each job skill requirement that has an embedding, queries the
        skill_embeddings vector index to find the best matching user skill.
        Falls back to 'missing' for requirements without embeddings (not yet embedded).

        mandatory_score = matched_must_have_weight / total_must_have_weight
        optional_score  = matched_optional_weight  / total_optional_weight
        contribution    = importance_weight × seniority_factor × evidence_weight
        """
        evidence_weight_map = {
            "multiple_productions": EvidenceWeight.MULTIPLE_PRODUCTIONS,
            "project_backed":       EvidenceWeight.PROJECT_BACKED,
            "mentioned_once":       EvidenceWeight.MENTIONED_ONCE,
            "claimed_only":         EvidenceWeight.CLAIMED_ONLY,
        }

        # ── Fetch job requirements ─────────────────────────────────────────────
        mandatory_reqs = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(jfam:JobSkillFamily)
                  -[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            WHERE req.importance = 'must_have' AND req.embedding IS NOT NULL
            RETURN req.name AS name, req.importance AS importance,
                   req.min_years AS min_years, req.embedding AS embedding,
                   jfam.name AS family
            """,
            {"job_id": job_id},
        )
        mandatory_all = await self.client.run_query(
            """
            OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->
                  (:JobSkillRequirements)-[:HAS_SKILL_FAMILY_REQ]->
                  (:JobSkillFamily)-[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            WHERE req.importance = 'must_have'
            RETURN collect(toLower(trim(req.name))) AS all_names
            """,
            {"job_id": job_id},
        )
        optional_reqs = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(jfam:JobSkillFamily)
                  -[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            WHERE req.importance <> 'must_have' AND req.embedding IS NOT NULL
            RETURN req.name AS name, req.importance AS importance,
                   req.min_years AS min_years, req.embedding AS embedding,
                   jfam.name AS family
            """,
            {"job_id": job_id},
        )
        optional_all = await self.client.run_query(
            """
            OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->
                  (:JobSkillRequirements)-[:HAS_SKILL_FAMILY_REQ]->
                  (:JobSkillFamily)-[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            WHERE req.importance <> 'must_have'
            RETURN collect(toLower(trim(req.name))) AS all_names
            """,
            {"job_id": job_id},
        )

        all_must_have_names  = set(mandatory_all[0]["all_names"] if mandatory_all else [])
        all_optional_names   = set(optional_all[0]["all_names"]  if optional_all  else [])
        total_must_weight    = SkillImportanceWeight.MUST_HAVE * len(all_must_have_names)
        total_optional_weight = SkillImportanceWeight.OPTIONAL * len(all_optional_names)

        matched_names: list[str] = []
        matched_must_weight = 0.0
        matched_optional_weight = 0.0

        # ── Score mandatory requirements ───────────────────────────────────────
        for req in mandatory_reqs:
            match = await self._find_matching_user_skill(
                user_id, req["embedding"], req.get("family", "Other")
            )
            if not match:
                continue
            seniority = self._seniority_factor(match.get("years"), req.get("min_years"))
            evidence  = evidence_weight_map.get(
                match.get("evidence_strength", ""), EvidenceWeight.UNKNOWN
            )
            matched_must_weight += SkillImportanceWeight.MUST_HAVE * seniority * evidence
            matched_names.append(match["name"].lower())

        # ── Score optional requirements ────────────────────────────────────────
        for req in optional_reqs:
            match = await self._find_matching_user_skill(
                user_id, req["embedding"], req.get("family", "Other")
            )
            if not match:
                continue
            seniority = self._seniority_factor(match.get("years"), req.get("min_years"))
            evidence  = evidence_weight_map.get(
                match.get("evidence_strength", ""), EvidenceWeight.UNKNOWN
            )
            matched_optional_weight += SkillImportanceWeight.OPTIONAL * seniority * evidence
            matched_names.append(match["name"].lower())

        matched_set = set(matched_names)
        missing = [n for n in all_must_have_names if n not in matched_set]

        mandatory_score = matched_must_weight / total_must_weight if total_must_weight else 0.0
        optional_score  = matched_optional_weight / total_optional_weight if total_optional_weight else 0.0

        return {
            "mandatory_score": min(mandatory_score, 1.0),
            "optional_score":  min(optional_score, 1.0),
            "matched": matched_names,
            "missing": missing,
        }

    async def _find_matching_user_skill(
        self,
        user_id: str,
        embedding: list[float],
        req_family: str,
    ) -> dict | None:
        """Find best matching Skill for a user via vector index. Returns None if below threshold."""
        rows = await self.client.run_query(
            """
            CALL db.index.vector.queryNodes('skill_embeddings', 5, $embedding)
            YIELD node AS s, score
            WHERE s.user_id = $user_id AND score >= $threshold
            MATCH (sfam:SkillFamily)-[:HAS_SKILL]->(s)
            WHERE sfam.name = $req_family OR $req_family = 'Other' OR sfam.name = 'Other'
            RETURN s.name AS name, s.years AS years, s.level AS level,
                   s.evidence_strength AS evidence_strength, score AS similarity
            ORDER BY score DESC
            LIMIT 1
            """,
            {"embedding": embedding, "user_id": user_id,
             "threshold": self._threshold, "req_family": req_family},
        )
        return rows[0] if rows else None

    @staticmethod
    def _seniority_factor(user_years: float | None, min_years: int | None) -> float:
        if min_years is None or user_years is None:
            return 1.0
        if user_years >= min_years:
            return 1.0
        return user_years / float(min_years)
```

- [ ] **Step 5: Run tests**

```bash
cd backend && python -m pytest tests/test_matching_engine.py::test_compute_skill_score_returns_zero_when_no_job_reqs tests/test_matching_engine.py::test_compute_skill_score_matched_skill_contributes_to_score tests/test_matching_engine.py::test_compute_skill_score_no_embedding_on_req_counts_as_missing -v
```

Expected: 3 PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/services/matching_engine.py backend/tests/test_matching_engine.py
git commit -m "feat: replace MATCHES edge traversal with vector index in skill scoring"
```

---

## Task 7: Update Scoring Engine — Domain Score

**Spec ref:** Section 8.2

**Files:**
- Modify: `backend/services/matching_engine.py`

> **Note:** `_compute_domain_score` currently uses EXACT string matching in Python (not MATCHES edges — those were never used for domains). This task replaces that with vector index for true semantic matching.

- [ ] **Step 1: Run the domain test to verify it fails**

```bash
cd backend && python -m pytest tests/test_matching_engine.py::test_compute_domain_score_uses_vector_index -v
```

Expected: FAIL — current implementation doesn't use vector index.

- [ ] **Step 2: Replace `_compute_domain_score` with vector index version**

Replace the entire `_compute_domain_score` method body:

```python
    async def _compute_domain_score(self, user_id: str, job_id: str) -> dict:
        """
        Depth-weighted domain match using Neo4j vector index ANN search.

        Replaces the previous exact-string-matching approach.
        For each job domain requirement with an embedding, queries the
        domain_embeddings vector index to find the best matching user domain.

        score = sum(depth_weights of matched domains) / total_domain_count
        depth weights: shallow=0.40, moderate=0.70, deep=1.00, unknown=0.55
        """
        domain_reqs = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
                  -[:HAS_DOMAIN_FAMILY_REQ]->(jfam:JobDomainFamily)
                  -[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
            WHERE dr.embedding IS NOT NULL
            RETURN dr.name AS name, dr.embedding AS embedding, jfam.name AS family
            """,
            {"job_id": job_id},
        )

        # Count total domain requirements (including those without embeddings) for denominator
        all_domain_reqs = await self.client.run_query(
            """
            OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_DOMAIN_REQUIREMENTS]->
                  (:JobDomainRequirements)-[:HAS_DOMAIN_FAMILY_REQ]->
                  (:JobDomainFamily)-[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
            RETURN collect(toLower(trim(dr.name))) AS all_names
            """,
            {"job_id": job_id},
        )

        all_req_names = set(all_domain_reqs[0]["all_names"] if all_domain_reqs else [])
        if not all_req_names:
            return {"score": 0.0, "matched": [], "missing": []}

        matched_names: list[str] = []
        total_depth_weight = 0.0

        for req in domain_reqs:
            match = await self._find_matching_user_domain(
                user_id, req["embedding"], req.get("family", "Other")
            )
            if not match:
                continue
            depth = match.get("depth") or "unknown"
            total_depth_weight += DomainDepthWeight.get(depth)
            matched_names.append(match["name"].lower())

        matched_set = set(matched_names)
        missing = [n for n in all_req_names if n not in matched_set]
        score = total_depth_weight / len(all_req_names) if all_req_names else 0.0

        return {"score": min(score, 1.0), "matched": matched_names, "missing": missing}

    async def _find_matching_user_domain(
        self,
        user_id: str,
        embedding: list[float],
        req_family: str,
    ) -> dict | None:
        """Find best matching Domain for a user via vector index. Returns None if below threshold."""
        rows = await self.client.run_query(
            """
            CALL db.index.vector.queryNodes('domain_embeddings', 5, $embedding)
            YIELD node AS d, score
            WHERE d.user_id = $user_id AND score >= $threshold
            MATCH (dfam:DomainFamily)-[:HAS_DOMAIN]->(d)
            WHERE dfam.name = $req_family OR $req_family = 'Other' OR dfam.name = 'Other'
            RETURN d.name AS name, d.depth AS depth, d.weight AS weight,
                   score AS similarity
            ORDER BY score DESC
            LIMIT 1
            """,
            {"embedding": embedding, "user_id": user_id,
             "threshold": self._threshold, "req_family": req_family},
        )
        return rows[0] if rows else None
```

Also remove the `DomainDepthWeight.get` usage that was in the old method — verify `DomainDepthWeight` is already imported. If it has a `.get(depth)` method, keep it. If not, use the dict directly:

```python
_DEPTH_WEIGHTS = {"deep": 1.0, "moderate": 0.70, "shallow": 0.40, "unknown": 0.55}
# Use: _DEPTH_WEIGHTS.get(depth, 0.55)
```

Check how `DomainDepthWeight` is defined in `models/taxonomies.py` and use consistently.

- [ ] **Step 3: Run all engine tests**

```bash
cd backend && python -m pytest tests/test_matching_engine.py -v
```

Expected: 4 PASSED.

- [ ] **Step 4: Commit**

```bash
git add backend/services/matching_engine.py
git commit -m "feat: replace exact-string domain matching with vector index semantic search"
```

---

## Task 8: Update API Routes

**Spec ref:** Section 9

**Files:**
- Modify: `backend/api/routes.py`
- Modify: `backend/models/schemas.py`

- [ ] **Step 1: Add `ReembedResponse` to `schemas.py` and remove `RelinkMatchesResponse`**

In `models/schemas.py`, find `RelinkMatchesResponse` and replace it:

```python
# Remove RelinkMatchesResponse entirely

# Add:
class ReembedResponse(BaseModel):
    status: str
    scope: str
    entity_id: Optional[str] = None
    users_processed: int = 0
    jobs_processed: int = 0
    skills_embedded: int = 0
    domains_embedded: int = 0
    skill_reqs_embedded: int = 0
    domain_reqs_embedded: int = 0
```

- [ ] **Step 2: Replace `/admin/relink-matches` with `/admin/reembed` in `routes.py`**

Find the `relink_matches` endpoint handler and replace it entirely:

```python
@router.post(
    "/admin/reembed",
    response_model=ReembedResponse,
    summary="Re-embed nodes when embedding model changes",
)
async def reembed(
    scope: str = Query(
        "all",
        description="'all' = every user and job, 'user' = one user, 'job' = one job",
    ),
    entity_id: Optional[str] = Query(None, description="Required when scope is 'user' or 'job'"),
    client: Neo4jClient = Depends(get_neo4j_client),
):
    """
    Re-compute and store embedding vectors on all matching nodes.

    Use this when you change EMBEDDING_MODEL — existing vectors become stale
    since they were computed with a different model. Does not affect scoring
    logic or graph structure.

    scope=all processes every user and job currently in Neo4j.
    scope=user/job requires entity_id.
    """
    from services.vector_embedding import VectorEmbeddingService
    embedder = VectorEmbeddingService(client)

    try:
        if scope == "user":
            if not entity_id:
                raise HTTPException(status_code=400, detail="entity_id required for scope=user")
            counts = await embedder.reembed_user(entity_id)
            return ReembedResponse(
                status="reembedded", scope=scope, entity_id=entity_id,
                skills_embedded=counts["skills_embedded"],
                domains_embedded=counts["domains_embedded"],
            )
        elif scope == "job":
            if not entity_id:
                raise HTTPException(status_code=400, detail="entity_id required for scope=job")
            counts = await embedder.reembed_job(entity_id)
            return ReembedResponse(
                status="reembedded", scope=scope, entity_id=entity_id,
                skill_reqs_embedded=counts["skill_reqs_embedded"],
                domain_reqs_embedded=counts["domain_reqs_embedded"],
            )
        elif scope == "all":
            counts = await embedder.reembed_all()
            return ReembedResponse(status="reembedded", scope=scope, **counts)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown scope: {scope}. Use: all, user, job")
    except Exception as e:
        logger.exception(f"Reembed failed for scope={scope} entity_id={entity_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

Update the import in `routes.py`:
```python
# Remove: from models.schemas import RelinkMatchesResponse (or wherever it was imported)
# Add: ReembedResponse to the schemas import
```

- [ ] **Step 3: Start backend and verify the new endpoint appears in Swagger**

```bash
cd backend && uvicorn main:app --reload
```

Open `http://localhost:8000/docs` — verify `POST /admin/reembed` appears and `POST /admin/relink-matches` is gone.

- [ ] **Step 4: Commit**

```bash
git add backend/api/routes.py backend/models/schemas.py
git commit -m "feat: replace relink-matches endpoint with reembed, add ReembedResponse"
```

---

## Task 9: Delete `semantic_matching.py` and Verify No Orphan Imports

**Files:**
- Delete: `backend/services/semantic_matching.py`

- [ ] **Step 1: Search for any remaining imports of semantic_matching**

```bash
cd backend && grep -r "semantic_matching\|SemanticMatchingService\|link_skill_matches\|link_domain_matches\|link_job_skill\|link_job_domain\|relink_user\|relink_job\|RelinkMatchesResponse" --include="*.py" .
```

Expected: No output. If any files appear, fix those imports before proceeding.

- [ ] **Step 2: Delete the file**

```bash
rm backend/services/semantic_matching.py
```

- [ ] **Step 3: Run all tests to confirm nothing breaks**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: All tests pass.

- [ ] **Step 4: Start backend and verify clean startup**

```bash
cd backend && uvicorn main:app --reload
```

Expected: No import errors. Vector indexes logged as ready.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete semantic_matching.py — replaced by vector_embedding.py"
```

---

## Task 10: Database Migration + Smoke Test

**Spec ref:** Section 11, Step 4

- [ ] **Step 1: Delete all existing MATCHES edges via Neo4j Browser or API**

Connect to Neo4j AuraDB browser (URL from your AuraDB console) or run via the backend.

In Neo4j Browser, run:
```cypher
MATCH ()-[m:MATCHES]->()
WITH m LIMIT 10000
DELETE m
RETURN count(*) AS deleted
```

Repeat until the query returns `deleted: 0`. (Batch deletes avoid memory issues on large graphs.)

Verify cleanup:
```cypher
MATCH ()-[m:MATCHES]->() RETURN count(m) AS remaining
```

Expected: `remaining: 0`

- [ ] **Step 2: Verify no `embedding` properties exist yet on nodes**

```cypher
MATCH (s:Skill) WHERE s.embedding IS NOT NULL RETURN count(s) AS embedded_skills
```

Expected: `0` (unless you already tested ingestion in Task 5 Step 6).

- [ ] **Step 3: Re-embed all existing nodes**

```bash
curl -X POST "http://localhost:8000/api/v1/admin/reembed?scope=all"
```

Expected response:
```json
{
  "status": "reembedded",
  "scope": "all",
  "users_processed": N,
  "jobs_processed": M,
  "skills_embedded": X,
  "domains_embedded": Y,
  "skill_reqs_embedded": Z,
  "domain_reqs_embedded": W
}
```

- [ ] **Step 4: Verify vectors are stored on nodes**

In Neo4j Browser:
```cypher
MATCH (s:Skill) WHERE s.embedding IS NOT NULL
RETURN s.name, s.embedding_model, s.embedded_at, size(s.embedding) AS dims
LIMIT 5
```

Expected: rows with `dims = 768` (or your configured dimension) and `embedding_model = gemini/gemini-embedding-001`.

- [ ] **Step 5: Run a full match and verify scores are non-zero**

Pick a user_id and job_id from your database:
```cypher
MATCH (u:User) RETURN u.id LIMIT 1
MATCH (j:Job) RETURN j.id LIMIT 1
```

Then:
```bash
curl http://localhost:8000/api/v1/users/{user_id}/matches/{job_id}
```

Expected: Response with non-zero `skill_score` and `domain_score` (if user and job have matching skills/domains).

- [ ] **Step 6: Run all tests one final time**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: All PASSED.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete GraphRAG vector matching migration — MATCHES edges removed, vector index live"
```

---

## Self-Review Against Spec

| Spec Section | Covered by Task |
|---|---|
| 3. What gets removed | Tasks 9 (delete file), 8 (remove endpoint), 5 (remove link_* methods) |
| 4.1 New extraction fields | Task 1 |
| 4.2 Storage gap fixes | Task 2 |
| 5. VectorEmbeddingService | Task 4 |
| 5.2 embed_user/job methods | Task 4 |
| 5.3 Context-enriched text | Task 4 (all _build_*_text methods) |
| 5.4 Vector write-back | Task 4 (_embed_and_store with UNWIND) |
| 6. Vector index setup | Task 3 |
| 7.1 Replace semantic matcher | Task 5 Step 1 |
| 7.2 Batch embed after write | Task 5 Steps 2-3 |
| 7.3 Remove link_* methods | Task 5 Step 4 |
| 7.4 Update ingestion.py | Task 5 Step 5 |
| 8.1 Skill score vector query | Task 6 |
| 8.2 Domain score vector query | Task 7 |
| 8.4 _threshold on engine | Task 6 Step 3 |
| 9. API route changes | Task 8 |
| 10. Migration | Task 10 |
| EMBEDDING_DIMENSIONS config | Task 3 Step 1 |
