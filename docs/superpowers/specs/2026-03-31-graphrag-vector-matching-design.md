# GraphRAG Vector Matching — Design Spec
**Date:** 2026-03-31
**Status:** Approved for implementation

---

## 1. Problem with Current Architecture

The current matching system precomputes `MATCHES` edges between user `Skill`/`Domain` nodes
and job `JobSkillRequirement`/`JobDomainRequirement` nodes using cosine similarity over flat
embedding text. This has three scaling problems:

1. **O(users × jobs) relinking.** Adding one new job requires re-embedding and re-linking every
   user's skills against every job requirement. The `/admin/relink-matches` endpoint exists purely
   to paper over this.
2. **Flat embedding text.** `"skill: Python. family: Backend."` embeds identically whether the
   candidate used Python for data science or high-throughput payment APIs. Graph context is ignored.
3. **Schema pollution.** `MATCHES` edges are ephemeral match artifacts stored as permanent graph
   relationships, bloating the graph and making ingestion non-idempotent without a delete-first step.

---

## 2. Solution: Context-Enriched Vectors on Nodes + Neo4j Vector Index

**Core idea:** Store one embedding vector per node at ingestion time. Use Neo4j's native vector
index for ANN similarity search at match time. No MATCHES edges. No relinking.

**GraphRAG step:** Before embedding, traverse the graph neighborhood to enrich the embedding text
with context that only the graph has — project 5W+H, domain co-occurrence, job role context. This
makes "Python (data science)" and "Python (payment systems backend)" embed differently and match
accordingly.

**Scaling property:**
- Adding a new job: embed only that job's N requirement nodes. O(N).
- Adding a new user: embed only that user's M skill/domain nodes. O(M).
- Match query: vector index ANN lookup per requirement node — no full table scan.

---

## 3. What Gets Removed

| Removed | Reason |
|---|---|
| `services/semantic_matching.py` (entire file, 432 lines) | Replaced by `services/vector_embedding.py` |
| `MATCHES` relationship type in Neo4j | Replaced by stored `.embedding` vectors |
| `link_user_skill_matches()`, `link_domain_matches()`, `link_job_skill_matches()`, `link_job_domain_matches()` | No longer needed — embed is inline at ingestion |
| `relink_user_matches()`, `relink_job_matches()` | Concept eliminated |
| `POST /admin/relink-matches` API endpoint | Replaced by `POST /admin/reembed` |
| `RelinkMatchesResponse` schema | Replaced by `ReembedResponse` |
| Pairwise cosine similarity loop in Python | Done natively by Neo4j vector index |
| `SEMANTIC_MATCH_PER_TARGET_ENTITY_LIMIT` env var | Vector index returns top-K natively |
| `EMBEDDING_BATCH_SIZE` env var | Retained — still used for batch embedding API calls |

Existing `MATCHES` edges in the live database must be deleted as part of migration
(see Section 10).

---

## 4. Schema Changes: `models/schemas.py`

### 4.1 New fields on extraction models

These fields are LLM-generated during extraction and stored on the node for use in embedding text.

**`ExtractedSkill`** — add:
```python
context: Optional[str] = Field(
    default=None,
    description=(
        "One sentence capturing WHY this skill stands out for this candidate: "
        "their primary use case, strongest application, or most notable context. "
        "e.g. 'Used Python for production ML pipelines serving 1M daily predictions, "
        "not just scripting.' Leave null if nothing notable beyond the projects."
    )
)
```

**`ExtractedDomain`** — add:
```python
description: Optional[str] = Field(
    default=None,
    description=(
        "One to two sentences describing the candidate's experience in this domain: "
        "what they've built, what they understand deeply, what distinguishes their knowledge. "
        "e.g. 'Deep expertise in FinTech payments infrastructure — PCI-DSS compliance, "
        "idempotent transaction design, high-throughput settlement flows.'"
    )
)
```

**`ExtractedJobSkillRequirement`** — add:
```python
context: Optional[str] = Field(
    default=None,
    description=(
        "Why the job needs this skill specifically — the technical context in which it will be used. "
        "e.g. 'Core to the async payment processing pipeline — candidate must understand "
        "backpressure and retry semantics.' Leave null if the JD gives no context."
    )
)
```

**`ExtractedJobDomainRequirement`** — add:
```python
importance: Literal["must_have", "optional"] = Field(
    default="must_have",
    description="must_have for required domain experience, optional for nice-to-have"
)
depth: Optional[Literal["shallow", "moderate", "deep"]] = Field(
    default=None,
    description="Required depth of domain knowledge"
)
```

### 4.2 Storage fixes (extracted but never written to graph — bug fixes)

| Model | Field | Fix location |
|---|---|---|
| `ExtractedDomain` | `description` | `_ingest_domains` — add `d.description = $description` |
| `ExtractedJobDomainRequirement` | `importance`, `depth` | `_ingest_job_domains` — add both to SET clause |
| `ExtractedSkill` | `context` (new) | `_ingest_skills` — add `s.context = $context` |
| `ExtractedJobSkillRequirement` | `context` (new) | `_ingest_job_skills` — add `r.context = $context` |

---

## 5. New Service: `services/vector_embedding.py`

Replaces `services/semantic_matching.py` entirely. Single responsibility: compute
context-enriched embedding text for a node, call the embedding API, and store the vector on the node.

### 5.1 Configuration

```python
EMBEDDING_MODEL          # explicit override, or auto-resolved from LLM_MODEL
EMBEDDING_DIMENSIONS     # 768 for gemini-embedding-001 / nomic-embed-text,
                         # 1536 for text-embedding-3-small. Must match index creation.
EMBEDDING_TASK_TYPE      # default: SEMANTIC_SIMILARITY
SEMANTIC_MATCH_THRESHOLD # kept — used at query time in scoring engine
EMBEDDING_BATCH_SIZE     # default: 64 — for batch reembed operations
```

Auto-resolution of embedding model (same logic as today):
```
gemini/*  → gemini/gemini-embedding-001  (dims: 768)
openai/*  → openai/text-embedding-3-small (dims: 1536)
ollama/*  → ollama/nomic-embed-text       (dims: 768)
```

If `EMBEDDING_DIMENSIONS` is not set, resolved from model name.

### 5.2 Class: `VectorEmbeddingService`

```python
class VectorEmbeddingService:
    async def embed_skill_node(self, user_id: str, skill_name: str) -> None
    async def embed_domain_node(self, user_id: str, domain_name: str) -> None
    async def embed_job_skill_req(self, job_id: str, req_name: str) -> None
    async def embed_job_domain_req(self, job_id: str, req_name: str) -> None
    async def reembed_user(self, user_id: str) -> dict  # returns counts
    async def reembed_job(self, job_id: str) -> dict    # returns counts
    async def reembed_all(self) -> dict                 # bulk operation
```

### 5.3 Context-enriched embedding text per node type

Each method runs a Cypher query to gather neighborhood context, then assembles the embedding text.

**`Skill` node** — Cypher:
```cypher
MATCH (s:Skill {name: $name, user_id: $user_id})
OPTIONAL MATCH (sfam:SkillFamily)-[:HAS_SKILL]->(s)
OPTIONAL MATCH (p:Project {user_id: $user_id})-[r:DEMONSTRATES_SKILL]->(s)
OPTIONAL MATCH (p)-[:IN_DOMAIN]->(pd:Domain {user_id: $user_id})
RETURN s.name AS name, s.years AS years, s.level AS level,
       s.evidence_strength AS evidence, s.weight AS weight,
       s.context AS context,
       sfam.name AS family,
       collect(DISTINCT {
           project: p.name, description: p.description,
           what: r.what, how: r.how, why: r.why,
           scale: r.scale, outcome: r.outcome
       }) AS project_usages,
       collect(DISTINCT pd.name) AS domains
```

Assembled text:
```
skill: {name}. family: {family}.
{context if set}
years: {years}. level: {level}. evidence: {evidence}.
demonstrated in: {project} — {what}. {how}. outcome: {outcome}. scale: {scale}.
[repeated for each project, max 4]
domains: {domain1}, {domain2}.
related terms: {canonical aliases from taxonomies}.
```

**`Domain` node** — Cypher:
```cypher
MATCH (d:Domain {name: $name, user_id: $user_id})
OPTIONAL MATCH (dfam:DomainFamily)-[:HAS_DOMAIN]->(d)
OPTIONAL MATCH (p:Project {user_id: $user_id})-[:IN_DOMAIN]->(d)
RETURN d.name AS name, d.years_experience AS years, d.depth AS depth,
       d.description AS description,
       dfam.name AS family,
       collect(DISTINCT {name: p.name, description: p.description}) AS projects
```

Assembled text:
```
domain: {name}. family: {family}.
{description if set}
years: {years}. depth: {depth}.
projects: {project1} — {description}. {project2} — {description}.
related terms: {canonical aliases}.
```

**`JobSkillRequirement` node** — Cypher:
```cypher
MATCH (req:JobSkillRequirement {name: $name, job_id: $job_id})
OPTIONAL MATCH (jsf:JobSkillFamily)-[:REQUIRES_SKILL]->(req)
MATCH (j:Job {id: $job_id})
OPTIONAL MATCH (j)-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
      -[:HAS_DOMAIN_FAMILY_REQ]->(:JobDomainFamily)-[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
RETURN req.name AS name, req.importance AS importance, req.min_years AS min_years,
       req.context AS context,
       jsf.name AS family,
       j.title AS job_title, j.company AS company,
       collect(DISTINCT dr.name) AS job_domains
```

Assembled text:
```
skill: {name}. family: {family}.
{context if set}
job: {job_title} at {company}.
importance: {importance}. min_years: {min_years}.
domain context: {job_domain1}, {job_domain2}.
related terms: {canonical aliases}.
```

**`JobDomainRequirement` node** — Cypher:
```cypher
MATCH (dr:JobDomainRequirement {name: $name, job_id: $job_id})
OPTIONAL MATCH (jdf:JobDomainFamily)-[:REQUIRES_DOMAIN]->(dr)
MATCH (j:Job {id: $job_id})
RETURN dr.name AS name, dr.importance AS importance, dr.depth AS depth,
       dr.min_years AS min_years,
       jdf.name AS family,
       j.title AS job_title, j.company AS company
```

Assembled text:
```
domain: {name}. family: {family}.
job: {job_title} at {company}.
importance: {importance}. depth: {depth}. min_years: {min_years}.
related terms: {canonical aliases}.
```

### 5.4 Storing the vector

After computing the embedding:
```cypher
MATCH (s:Skill {name: $name, user_id: $user_id})
SET s.embedding       = $vector,
    s.embedding_model = $model,
    s.embedded_at     = timestamp()
```

Same pattern for Domain, JobSkillRequirement, JobDomainRequirement.

### 5.5 Family compatibility

Preserved at query time in the scoring engine (WHERE clause on family name match),
not at embedding time. This keeps the service simple and the constraint explicit in scoring.

---

## 6. Neo4j Client Changes: `database/neo4j_client.py`

Add `setup_vector_indexes()` called once at startup after `setup_constraints()`.

```python
async def setup_vector_indexes(self, dimensions: int) -> None:
    indexes = [
        ("skill_embeddings",       "Skill",               "embedding"),
        ("domain_embeddings",      "Domain",              "embedding"),
        ("job_skill_embeddings",   "JobSkillRequirement", "embedding"),
        ("job_domain_embeddings",  "JobDomainRequirement","embedding"),
    ]
    for index_name, label, property_name in indexes:
        await self.run_write(f"""
            CREATE VECTOR INDEX {index_name} IF NOT EXISTS
            FOR (n:{label}) ON n.{property_name}
            OPTIONS {{indexConfig: {{
                `vector.dimensions`: {dimensions},
                `vector.similarity_function`: 'cosine'
            }}}}
        """)
```

Called from `main.py` lifespan after `init_client()`, passing `EMBEDDING_DIMENSIONS` from env.

---

## 7. Ingestion Pipeline Changes: `services/llm_ingestion.py`

### 7.1 Replace SemanticMatchingService with VectorEmbeddingService

```python
# Before
from services.semantic_matching import SemanticMatchingService
self._semantic_matcher = SemanticMatchingService(client)

# After
from services.vector_embedding import VectorEmbeddingService
self._embedder = VectorEmbeddingService(client)
```

### 7.2 Embed after all nodes are written (batch per ingestion)

Do NOT embed one-by-one inside the write loop — that makes N sequential embedding API calls.
Instead, write all nodes first, then embed all in one batch:

```python
# _ingest_skills writes all Skill nodes, then:
await self._embedder.embed_user_skills(user_id)  # one batch API call for all skills

# _ingest_domains writes all Domain nodes, then:
await self._embedder.embed_user_domains(user_id)  # one batch API call for all domains
```

`embed_user_skills(user_id)` fetches all Skill nodes for the user, assembles enriched text
for each (via the neighborhood Cypher query), batches the API call (up to `EMBEDDING_BATCH_SIZE`
texts per call), then writes all vectors back in a single write transaction.

Same pattern for job side:
```python
await self._embedder.embed_job_skill_reqs(job_id)
await self._embedder.embed_job_domain_reqs(job_id)
```

### 7.3 Remove delegating methods

These are no longer needed and are deleted:
- `link_skill_matches()`
- `link_domain_matches()`
- `link_job_skill_matches()`
- `link_job_domain_matches()`
- `relink_user_matches()`
- `relink_job_matches()`

### 7.4 Update `services/ingestion.py`

Remove:
```python
skill_links = await self._llm_ingester.link_skill_matches(user_id)
domain_links = await self._llm_ingester.link_domain_matches(user_id)
```

The ingestion result dict changes:
```python
# Remove these keys:
"skill_matches_linked": skill_links,
"domain_matches_linked": domain_links,

# Add these:
"skills_embedded": <count from _ingest_skills>,
"domains_embedded": <count from _ingest_domains>,
```

---

## 8. Scoring Engine Changes: `services/matching_engine.py`

### 8.1 `_compute_skill_score` — replace MATCHES traversal

**Current approach:**
```cypher
MATCH (...)->(s:Skill)-[:MATCHES]->(req:JobSkillRequirement)<-(...)
```

**New approach** — job-centric vector lookup:
```cypher
MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
      -[:HAS_SKILL_FAMILY_REQ]->(jfam:JobSkillFamily)-[:REQUIRES_SKILL]->(req:JobSkillRequirement)
WHERE req.importance = 'must_have' AND req.embedding IS NOT NULL
CALL db.index.vector.queryNodes('skill_embeddings', 5, req.embedding)
YIELD node AS s, score
WHERE s.user_id = $user_id AND score >= $threshold
MATCH (sfam:SkillFamily {user_id: $user_id})-[:HAS_SKILL]->(s)
WHERE sfam.name = jfam.name OR jfam.name = 'Other' OR sfam.name = 'Other'
RETURN req.name AS req_name, req.importance AS importance, req.min_years AS min_years,
       s.name AS skill_name, s.years AS years, s.level AS level,
       s.evidence_strength AS evidence_strength, s.weight AS weight,
       score AS similarity
ORDER BY req.name, score DESC
```

Python post-processing: group by `req_name`, take the best-scoring user skill per requirement
(same as the current `_per_target_entity_limit=1` logic, but in Python).

The contribution formula is unchanged:
```python
contribution = importance_weight × seniority_factor × evidence_weight
```

Optional: multiply by `similarity` as a confidence weight (0.72–1.0 range), making a perfect
match contribute marginally more than a threshold match. This is additive to the formula.

### 8.2 `_compute_domain_score` — same pattern

Replace:
```cypher
MATCH (...)->(d:Domain)-[:MATCHES]->(req:JobDomainRequirement)<-(...)
```

With:
```cypher
MATCH (j:Job {id: $job_id})-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
      -[:HAS_DOMAIN_FAMILY_REQ]->(jfam:JobDomainFamily)-[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
WHERE dr.embedding IS NOT NULL
CALL db.index.vector.queryNodes('domain_embeddings', 5, dr.embedding)
YIELD node AS d, score
WHERE d.user_id = $user_id AND score >= $threshold
MATCH (dfam:DomainFamily {user_id: $user_id})-[:HAS_DOMAIN]->(d)
WHERE dfam.name = jfam.name OR jfam.name = 'Other' OR dfam.name = 'Other'
RETURN dr.name AS req_name, d.name AS domain_name,
       d.years_experience AS years, d.depth AS depth, d.weight AS weight,
       score AS similarity
ORDER BY dr.name, score DESC
```

Contribution formula unchanged: `depth_weight × (1 / total_domains)`.

### 8.3 Path tracing (`_build_explain_context`) — update queries

The path explain queries in `_build_explain_context` (around line 1076) that traverse MATCHES
edges must be updated to use vector index queries with the same pattern as above.

### 8.4 Add `_threshold` to `MatchingEngine`

```python
self._threshold = float(os.environ.get("SEMANTIC_MATCH_THRESHOLD", "0.72"))
```

This is already in `SemanticMatchingService`; it moves to the scoring engine since that's where
the threshold is now applied (at query time, not edge-creation time).

---

## 9. API Route Changes: `api/routes.py`

### Remove
- `POST /admin/relink-matches` endpoint (entire handler + schema)
- Import of `RelinkMatchesResponse`

### Add
```
POST /admin/reembed
  scope: "all" | "user" | "job"
  entity_id: optional str
```

Calls `VectorEmbeddingService.reembed_user()` / `reembed_job()` / `reembed_all()`.
Use case: re-embed all nodes when the embedding model changes (e.g., upgrading from
gemini-embedding-001 to a future model).

Response: `ReembedResponse` with counts of nodes re-embedded per type.

---

## 10. Configuration: `.env` / `.env.example`

### Add
```
EMBEDDING_DIMENSIONS=768
```

Remove from `.env.example` (no longer applicable):
```
SEMANTIC_MATCH_PER_TARGET_ENTITY_LIMIT=1   # removed — K=5 is hardcoded in vector query
```

All other vars retained:
```
EMBEDDING_MODEL=...           # optional override
EMBEDDING_TASK_TYPE=SEMANTIC_SIMILARITY
SEMANTIC_MATCH_ENABLED=true   # if false, embed_* methods are no-ops
SEMANTIC_MATCH_THRESHOLD=0.72 # applied at query time in scoring engine
EMBEDDING_BATCH_SIZE=64       # used in reembed_all bulk operations
```

---

## 11. Migration Plan

### Step 1: Schema + ingestion (no breaking changes to scoring yet)
- Add new fields to extraction models (`ExtractedSkill.context`, etc.)
- Fix storage gaps (`Domain.description`, `JobDomainRequirement.depth/importance`)
- Create `VectorEmbeddingService`
- Update ingestion to embed inline (new nodes get vectors immediately)
- Create vector indexes at startup

### Step 2: Scoring engine
- Update `_compute_skill_score` to use vector index
- Update `_compute_domain_score` to use vector index
- Update path explain queries
- Move threshold to `MatchingEngine.__init__`

### Step 3: Cleanup
- Delete `services/semantic_matching.py`
- Remove delegating methods from `LLMIngestionService`
- Remove `link_*` calls from `IngestionService`
- Replace `/admin/relink-matches` with `/admin/reembed`
- Delete `RelinkMatchesResponse`, add `ReembedResponse`

### Step 4: Database migration
- Delete all existing `MATCHES` edges:
  ```cypher
  MATCH ()-[m:MATCHES]->() DELETE m
  ```
- Call `POST /admin/reembed?scope=all` to populate vectors on existing nodes
  (only needed for data ingested before this change)

---

## 12. Files Summary

| File | Action |
|---|---|
| `services/semantic_matching.py` | **Delete** |
| `services/vector_embedding.py` | **Create** |
| `models/schemas.py` | **Modify** — new extraction fields |
| `services/llm_ingestion.py` | **Modify** — embed inline, fix storage gaps, remove link_* methods |
| `services/ingestion.py` | **Modify** — remove link_* calls, update result keys |
| `services/matching_engine.py` | **Modify** — vector index queries replace MATCHES traversal |
| `database/neo4j_client.py` | **Modify** — add `setup_vector_indexes()` |
| `api/routes.py` | **Modify** — remove relink endpoint, add reembed endpoint |
| `models/schemas.py` | **Modify** — add `ReembedResponse`, remove `RelinkMatchesResponse` |
| `.env` / `.env.example` | **Modify** — add `EMBEDDING_DIMENSIONS` |
| `main.py` | **Modify** — call `setup_vector_indexes()` at startup |
