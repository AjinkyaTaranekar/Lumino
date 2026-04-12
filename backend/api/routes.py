"""
FastAPI route definitions.

All endpoints are prefixed with /api/v1 (applied in main.py).

Endpoints:
  POST /users/ingest                      - extract + write user to Neo4j
  POST /jobs/ingest                       - extract + write job to Neo4j
  GET  /users/{user_id}/matches           - rank ALL jobs for a user (batch)
  GET  /users/{user_id}/matches/{job_id}  - single user-job score detail
  GET  /users/{user_id}/matches/{job_id}/paths - explicit graph paths (scrutability)
  POST /users/{user_id}/visualize         - generate interactive HTML graph
  GET  /users/{user_id}/visualize         - serve the HTML graph in browser
  GET  /users                             - list all users
  GET  /jobs                              - list all jobs
  GET  /health                            - Neo4j connectivity check
  POST   /users/{user_id}/events              - record analytics event (view/like/dislike/bookmark/apply)
  GET    /users/{user_id}/applications        - list jobs user has applied to (with match scores)
  GET    /jobs/{job_id}/applications          - list users who applied to a job (with match scores)
  GET    /users/{user_id}/interests           - get user interest profile (tag scores)
  PATCH  /users/{user_id}/interests/{tag}     - manually override tag interest score
  DELETE /users/{user_id}/interests/{tag}     - remove a tag from interest profile
"""

import asyncio
import io
import logging
import os
from typing import Literal

import pypdf
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from database.neo4j_client import Neo4jClient, get_client
from database.sqlite_client import SQLiteClient, get_sqlite
from models.schemas import (
    AppliedCandidate,
    ApplyMutationsResponse,
    ApplyMutationsRequest,
    BatchCandidateResponse,
    BatchMatchResponse,
    CareerPreferencesRequest,
    CheckpointRequest,
    ClarificationsResponse,
    EditSessionMessage,
    EditSessionResponse,
    GraphMutationProposal,
    GraphVersion,
    IngestJobRequest,
    IngestUserRequest,
    AdjustInterestRequest,
    InterestProfileResponse,
    InterestTag,
    JobApplicantsResponse,
    JobProfileResponse,
    MatchResult,
    MatchInsightsResponse,
    MatchInsightSignal,
    MatchActionItem,
    RecordEventRequest,
    RejectMutationsRequest,
    ReembedResponse,
    ResolveFlagRequest,
    ResolveFlagResponse,
    RollbackResponse,
    SendMessageRequest,
    StartEditRequest,
    UserApplication,
    UserApplicationsResponse,
    SkillIntelligenceItem,
    SkillIntelligenceResponse,
    DigitalTwinAnecdote,
    DigitalTwinMotivation,
    DigitalTwinValue,
    DigitalTwinGoal,
    DigitalTwinCultureIdentity,
    DigitalTwinBehavioralInsight,
    DigitalTwinProfileResponse,
    SemanticSearchRequest,
    SemanticSearchResponse,
)
from services.analytics_service import AnalyticsService
from services.job_tag_extractor import JobTagExtractor
from services.checkpoint_service import CheckpointService
from services.clarification_service import ClarificationService
from services.graph_edit_service import GraphEditService
from services.ingestion import IngestionService
from services.llm_extraction import LLMExtractionService
from services.llm_ingestion import LLMIngestionService
from services.matching_engine import MatchingEngine
from services.vector_embedding import VectorEmbeddingService
from services.visualization import VisualizationService

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Semantic search: LLM-powered query expansion ─────────────────────────────
async def _expand_query_with_llm(query: str) -> str:
    """
    Decompose any natural-language search query into concrete skills, technologies,
    and domain terms that ANN search can match against job skill/domain embeddings.

    Handles abbreviations ("SDE"), intent phrases ("high paying remote job"),
    soft concepts ("collaborative team"), and everything in between — without
    any hardcoded lookup tables.
    """
    try:
        from litellm import acompletion
        model = os.environ.get("LLM_MODEL", "groq/llama-3.3-70b-versatile")
        resp = await acompletion(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a job-search query expander. "
                        "Given any search phrase, output ONLY a comma-separated list of concrete skills, "
                        "technologies, and domain terms that describe what the user is looking for. "
                        "Be specific and technical. Include 10–20 terms. "
                        "No explanations, no numbering, no extra punctuation — just the comma-separated terms."
                    ),
                },
                {
                    "role": "user",
                    "content": f'Search query: "{query}"',
                },
            ],
            max_tokens=200,
            temperature=0.1,
        )
        expanded_terms = resp.choices[0].message.content.strip()
        # Combine original query + LLM expansion for maximum ANN recall
        return f"{query} {expanded_terms}"
    except Exception as exc:
        logger.warning("Query expansion LLM call failed (%s) — using raw query", exc)
        return query


def get_neo4j() -> Neo4jClient:
    return get_client()


def get_sqlite_db() -> SQLiteClient:
    return get_sqlite()


async def _bump_user_cache_version(user_id: str, sqlite: SQLiteClient) -> None:
    """Invalidate cached match results for this user by bumping their version."""
    await sqlite.bump_user_version(user_id)


def _score_summary(score: float) -> str:
    if score >= 0.75:
        return "Strong evidence in this dimension."
    if score >= 0.5:
        return "Solid baseline with room to sharpen."
    if score >= 0.3:
        return "Partial signal; requires targeted improvement."
    return "Weak signal currently limiting match confidence."


def _insight_confidence(result: MatchResult, context: dict) -> Literal["high", "medium", "low"]:
    required_count = len(result.matched_skills) + len(result.missing_skills)
    coverage = (len(result.matched_skills) / required_count) if required_count > 0 else 1.0

    signal_map = {
        "strong": 1.0,
        "moderate": 0.75,
        "weak": 0.5,
        "misleading": 0.25,
    }
    signal_strength = signal_map.get((result.profile_signal or "").lower(), 0.6)
    evidence_density = min(len(context.get("matched_skills_rich", [])) / 5.0, 1.0)
    risk_penalty = min(len(result.behavioral_risk_flags or []), 3) * 0.12

    confidence_score = (0.5 * coverage) + (0.3 * signal_strength) + (0.2 * evidence_density) - risk_penalty
    if confidence_score >= 0.72:
        return "high"
    if confidence_score >= 0.48:
        return "medium"
    return "low"


def _build_match_insights(
    user_id: str,
    job_id: str,
    perspective: Literal["seeker", "recruiter"],
    result: MatchResult,
    rich_context: dict,
) -> MatchInsightsResponse:
    dimensions = [
        ("Core Skills", result.skill_score, 0.55),
        ("Optional Skills", result.optional_skill_score, 0.10),
        ("Domain Fit", result.domain_score, 0.25),
    ]
    if result.soft_skill_score > 0:
        dimensions.append(("Soft Skills", result.soft_skill_score, 0.20))
    if result.culture_fit_score > 0:
        dimensions.append(("Culture Fit", result.culture_fit_score, 0.15))
    if result.interest_score > 0:
        dimensions.append(("Preference Signal", result.interest_score, 0.10))

    total_weight = sum(w for _, _, w in dimensions) or 1.0
    score_breakdown = [
        MatchInsightSignal(
            label=label,
            score=round(max(0.0, min(score, 1.0)), 4),
            weight=round(weight / total_weight, 4),
            summary=_score_summary(score),
        )
        for label, score, weight in dimensions
    ]

    strongest_evidence: list[str] = []
    for item in rich_context.get("matched_skills_rich", [])[:4]:
        skill = item.get("skill")
        strength = (item.get("evidence_strength") or "mentioned_once").replace("_", " ")
        contexts = [c for c in (item.get("usage_contexts") or []) if c]
        outcomes = [o for o in (item.get("outcomes") or []) if o]
        if not skill:
            continue
        if contexts:
            strongest_evidence.append(f"{skill}: {contexts[0]} ({strength})")
        elif outcomes:
            strongest_evidence.append(f"{skill}: outcome noted - {outcomes[0]}")
        else:
            strongest_evidence.append(f"{skill}: demonstrated with {strength} evidence")

    top_gaps: list[str] = []
    for gap in rich_context.get("missing_must_have", [])[:3]:
        min_years = gap.get("min_years")
        if min_years is not None:
            top_gaps.append(f"{gap.get('skill')}: role expects about {min_years}+ years of evidence")
        else:
            top_gaps.append(f"{gap.get('skill')}: required capability not yet evidenced")
    if len(top_gaps) < 4:
        for skill in result.missing_skills:
            if len(top_gaps) >= 4:
                break
            if all(skill not in existing for existing in top_gaps):
                top_gaps.append(f"{skill}: currently missing from your proven skill graph")

    next_steps: list[MatchActionItem] = []
    for gap in rich_context.get("missing_must_have", [])[:2]:
        skill = gap.get("skill") or "critical skill"
        next_steps.append(
            MatchActionItem(
                title=f"Close gap: {skill}",
                detail=(
                    f"Build one project outcome and one interview story that clearly demonstrates {skill}, "
                    "then refresh your profile graph."
                ),
                priority="high",
            )
        )

    if result.missing_skills:
        next_steps.append(
            MatchActionItem(
                title="Prioritise adjacent upskilling",
                detail=(
                    f"Focus on {result.missing_skills[0]} first, then expand to the next missing skill to "
                    "improve short-term interview readiness."
                ),
                priority="medium",
            )
        )

    if result.behavioral_risk_flags:
        next_steps.append(
            MatchActionItem(
                title="Address behavioral risk signals",
                detail="Use concrete STAR examples that show ownership, clarity, and execution quality.",
                priority="medium",
            )
        )

    if not next_steps:
        next_steps.append(
            MatchActionItem(
                title="Maintain momentum",
                detail="Continue refining outcomes and role-specific examples to preserve a high-quality match position.",
                priority="low",
            )
        )

    recruiter_takeaways: list[str] = []
    assessment = rich_context.get("assessment") or {}
    if perspective == "recruiter":
        recruiter_takeaways.append(
            f"Overall fit is {round(result.total_score * 100)}% with strongest signal in skills and domain overlap."
        )
        if result.user_seniority and result.job_seniority:
            recruiter_takeaways.append(
                f"Seniority lens: candidate appears {result.user_seniority}, role expects {result.job_seniority}."
            )
        if assessment.get("genuine_strengths"):
            strengths = ", ".join((assessment.get("genuine_strengths") or [])[:3])
            recruiter_takeaways.append(f"Verified strengths: {strengths}.")
    else:
        recruiter_takeaways.append(
            f"This role currently aligns at {round(result.total_score * 100)}%; closing 1-2 core gaps can materially improve your rank."
        )
        if result.matched_skills:
            recruiter_takeaways.append(
                f"Your strongest fit signals are: {', '.join(result.matched_skills[:3])}."
            )
        if result.missing_skills:
            recruiter_takeaways.append(
                f"Highest-impact improvement area: {result.missing_skills[0]}."
            )

    caveats: list[str] = []
    if result.inferred_skills:
        caveats.append(
            f"{len(result.inferred_skills)} inferred skills rely on semantic similarity and should be verified in interviews."
        )
    if not rich_context.get("job_team_culture"):
        caveats.append("Team culture data is limited for this role, so culture fit confidence is reduced.")
    if result.profile_signal in {"weak", "misleading"}:
        caveats.append("Candidate profile quality signal is below strong; validate ownership and outcomes carefully.")

    return MatchInsightsResponse(
        user_id=user_id,
        job_id=job_id,
        perspective=perspective,
        job_title=result.job_title,
        company=result.company,
        overall_score=round(result.total_score, 4),
        confidence=_insight_confidence(result, rich_context),
        score_breakdown=score_breakdown,
        strongest_evidence=strongest_evidence,
        top_gaps=top_gaps,
        recruiter_takeaways=recruiter_takeaways,
        next_steps=next_steps,
        caveats=caveats,
    )


# ── Ingestion ──────────────────────────────────────────────────────────────────

@router.post("/users/ingest", tags=["ingestion"], summary="Ingest user profile")
async def ingest_user(
    request: IngestUserRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Extract structured entities from raw profile text and write to Neo4j.

    Pipeline:
    1. Groq (llama-3.3-70b) extracts skills, domains, projects, experiences,
       critical assessment, and interpretation_flags for every uncertain inference.
    2. The 4-level hierarchy is written to Neo4j (User → Category → Family → Leaf).
    3. Interpretation flags are stored in SQLite for the clarification workflow.

    The response includes `clarification_questions` - critical questions the user
    should answer to verify their digital twin graph before job matching.
    """
    try:
        service = IngestionService(db, sqlite)
        result = await service.ingest_user(request.user_id, request.profile_text)
        await _bump_user_cache_version(request.user_id, sqlite)
        return {"status": "success", **result}
    except Exception as e:
        logger.exception(f"User ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/ingest", tags=["ingestion"], summary="Ingest job posting")
async def ingest_job(
    request: IngestJobRequest,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Extract structured requirements from a job posting and write to Neo4j.

    Pipeline:
    1. Groq extracts skill requirements, domain requirements, work styles,
       remote policy, company size, and experience requirements.
    2. The job hierarchy is written to Neo4j.
    """
    try:
        service = IngestionService(db)
        result = await service.ingest_job(request.job_id, request.job_text, request.recruiter_id)
        return {"status": "success", **result}
    except Exception as e:
        logger.exception(f"Job ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _extract_pdf_text(file: UploadFile) -> str:
    """Extract plain text from an uploaded PDF file using pypdf."""
    content = await file.read()
    reader = pypdf.PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


@router.post("/users/upload", tags=["ingestion"], summary="Upload PDF resume")
async def upload_user_pdf(
    user_id: str = Form(...),
    file: UploadFile = File(...),
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Accept a PDF resume, extract text server-side via pypdf, then run the
    standard LLM ingestion pipeline (extraction + flags + graph write).
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    try:
        profile_text = await _extract_pdf_text(file)
        if not profile_text.strip():
            raise HTTPException(status_code=422, detail="Could not extract text from PDF")
        service = IngestionService(db, sqlite)
        result = await service.ingest_user(user_id, profile_text)
        await _bump_user_cache_version(user_id, sqlite)
        return {"status": "success", **result}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"PDF user ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/upload", tags=["ingestion"], summary="Upload PDF job posting")
async def upload_job_pdf(
    job_id: str = Form(...),
    file: UploadFile = File(...),
    recruiter_id: str = Form(None),
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Accept a PDF job posting, extract text server-side via pypdf, then run the
    standard LLM ingestion pipeline.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    try:
        job_text = await _extract_pdf_text(file)
        if not job_text.strip():
            raise HTTPException(status_code=422, detail="Could not extract text from PDF")
        service = IngestionService(db)
        result = await service.ingest_job(job_id, job_text, recruiter_id)
        return {"status": "success", **result}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"PDF job ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Matching ───────────────────────────────────────────────────────────────────

@router.get(
    "/users/{user_id}/matches",
    response_model=BatchMatchResponse,
    tags=["matching"],
    summary="Rank all jobs for a user",
)
async def get_all_matches_for_user(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Compute match scores for ALL jobs in the database for the given user.

    Results are cached in SQLite (TTL 2 h) keyed by user graph version + job count.
    Cache is invalidated automatically whenever the user modifies their profile
    (resume upload, career preferences, clarification resolve, graph edits).

    Returns results ranked by total_score (descending).
    """
    # Build a cheap cache key from user graph version + current job count
    user_version = await sqlite.get_user_version(user_id)
    job_count_rows = await db.run_query("MATCH (j:Job) RETURN count(j) AS cnt", {})
    job_count = job_count_rows[0]["cnt"] if job_count_rows else 0
    cache_key = f"v{user_version}_j{job_count}"

    cached = await sqlite.get_match_cache(user_id, cache_key)
    if cached is not None:
        logger.info(f"Match cache hit for user={user_id} key={cache_key}")
        results = [MatchResult(**r) for r in cached]
        return BatchMatchResponse(user_id=user_id, results=results, total_jobs_ranked=len(results))

    # Cache miss — run the full matching engine
    analytics = AnalyticsService(sqlite, db)
    engine = MatchingEngine(db, analytics_service=analytics)
    response = await engine.rank_all_jobs_for_user(user_id)

    await sqlite.set_match_cache(
        user_id, cache_key,
        [r.model_dump() for r in response.results],
    )
    logger.info(f"Match cache stored for user={user_id} key={cache_key} ({len(response.results)} results)")
    return response


@router.get(
    "/users/{user_id}/matches/{job_id}",
    response_model=MatchResult,
    tags=["matching"],
    summary="Get detailed score for one user-job pair",
)
async def get_single_match(
    user_id: str,
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Compute detailed match score between a specific user and job.
    Includes matched/missing skill lists and human-readable explanation.
    """
    analytics = AnalyticsService(sqlite, db)
    engine = MatchingEngine(db, analytics_service=analytics)
    result = await engine._score_user_job_pair(user_id, job_id)
    if result is None:
        raise HTTPException(
            status_code=404, detail=f"User '{user_id}' or job '{job_id}' not found"
        )
    return result


@router.post(
    "/users/{user_id}/search",
    response_model=SemanticSearchResponse,
    tags=["matching"],
    summary="Semantic job search — vector search over job skill requirements, re-ranked by user match",
)
async def semantic_job_search(
    user_id: str,
    request: SemanticSearchRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Two-phase search:
      1. Embed the user's free-text query and ANN-search job_skill_embeddings +
         job_domain_embeddings to find semantically relevant jobs.
      2. Re-rank the candidate jobs by the user's cached match scores so that
         relevance AND personal fit determine final order.

    Returns ranked MatchResult list plus suggested filter tags derived from results.
    Falls back gracefully when the embedding model is unavailable.
    """
    query = request.query.strip()
    if not query:
        return SemanticSearchResponse(results=[], suggested_tags=[], mode="empty")

    # LLM-expand the query into concrete skills/domains before embedding
    # Handles abbreviations ("SDE"), intents ("high paying ML job"), free-text, etc.
    expanded_query = await _expand_query_with_llm(query)

    # ── Phase 1: embed query ─────────────────────────────────────────────────
    from services.vector_embedding import VectorEmbeddingService
    embed_svc = VectorEmbeddingService(db)

    try:
        vectors = await embed_svc._embed_texts([expanded_query])
        q_vec = vectors[0]
    except Exception as exc:
        logger.warning("Semantic search embedding failed: %s — falling back to title match", exc)
        q_vec = None

    # ── Phase 2a: vector ANN over job skill + domain embeddings ──────────────
    job_relevance: dict[str, float] = {}

    if q_vec is not None:
        k = min(90, request.limit * 4)
        skill_rows = await db.run_query(
            """
            CALL db.index.vector.queryNodes('job_skill_embeddings', $k, $vec)
            YIELD node AS jsr, score
            MATCH (j:Job)-[:REQUIRES_SKILL]->(jsr)
            RETURN j.id AS job_id, max(score) AS relevance
            """,
            {"k": k, "vec": q_vec},
        )
        for row in skill_rows:
            jid = row["job_id"]
            rel  = float(row["relevance"] or 0)
            if jid not in job_relevance or rel > job_relevance[jid]:
                job_relevance[jid] = rel

        domain_rows = await db.run_query(
            """
            CALL db.index.vector.queryNodes('job_domain_embeddings', $k, $vec)
            YIELD node AS jdr, score
            MATCH (j:Job)-[:REQUIRES_DOMAIN]->(jdr)
            RETURN j.id AS job_id, max(score) AS relevance
            """,
            {"k": k, "vec": q_vec},
        )
        for row in domain_rows:
            jid = row["job_id"]
            rel  = float(row["relevance"] or 0) * 0.85
            if jid not in job_relevance or rel > job_relevance[jid]:
                job_relevance[jid] = rel

    # ── Phase 2b: text match on title/company (original + expanded terms) ────
    # Collect all individual keywords from the expanded query for broader matching
    search_terms = list({t for t in expanded_query.lower().split() if len(t) > 2})
    # Build a WHERE clause that matches any of the key terms against title
    text_rows = await db.run_query(
        """
        MATCH (j:Job)
        WHERE ANY(term IN $terms WHERE toLower(j.title) CONTAINS term)
           OR toLower(coalesce(j.company,'')) CONTAINS toLower($original)
        RETURN j.id AS job_id
        LIMIT 30
        """,
        {"terms": search_terms, "original": query},
    )
    for row in text_rows:
        jid = row["job_id"]
        if jid not in job_relevance:
            job_relevance[jid] = 0.65   # text match baseline relevance

    if not job_relevance:
        return SemanticSearchResponse(results=[], suggested_tags=[], mode="semantic")

    # ── Phase 3: look up user's cached match scores ───────────────────────────
    user_version = await sqlite.get_user_version(user_id)
    cnt_rows     = await db.run_query("MATCH (j:Job) RETURN count(j) AS cnt", {})
    job_count    = int(cnt_rows[0]["cnt"]) if cnt_rows else 0
    cache_key    = f"v{user_version}_j{job_count}"
    cached       = await sqlite.get_match_cache(user_id, cache_key) or []

    match_by_id: dict[str, dict] = {r["job_id"]: r for r in cached}

    # ── Phase 4: score = 0.4*relevance + 0.6*match_score ─────────────────────
    ranked: list[tuple[float, dict]] = []
    for job_id, relevance in job_relevance.items():
        if job_id in match_by_id:
            m = match_by_id[job_id]
            combined = 0.4 * relevance + 0.6 * float(m.get("total_score", 0))
            ranked.append((combined, m))
        else:
            # Job found by search but no cached score — compute it on the fly
            try:
                analytics = AnalyticsService(sqlite, db)
                engine    = MatchingEngine(db, analytics_service=analytics)
                res       = await engine._score_user_job_pair(user_id, job_id)
                if res:
                    m        = res.model_dump()
                    combined = 0.4 * relevance + 0.6 * float(m.get("total_score", 0))
                    ranked.append((combined, m))
            except Exception:
                pass   # silently skip uncacheable jobs

    ranked.sort(key=lambda x: -x[0])

    # ── Phase 5: build MatchResult list ──────────────────────────────────────
    results: list[MatchResult] = []
    for _, m in ranked[: request.limit]:
        try:
            results.append(MatchResult(**m))
        except Exception:
            pass

    # ── Phase 6: suggested tags from result set ───────────────────────────────
    tag_freq: dict[str, int] = {}
    for r in results:
        for tag in (r.job_tags or []):
            tag_freq[tag] = tag_freq.get(tag, 0) + 1
    suggested_tags = [t for t, _ in sorted(tag_freq.items(), key=lambda x: -x[1])][:12]

    return SemanticSearchResponse(results=results, suggested_tags=suggested_tags, mode="semantic")


@router.get(
    "/users/{user_id}/matches/{job_id}/insights",
    response_model=MatchInsightsResponse,
    tags=["matching"],
    summary="Get production-grade explainability insights for one match",
)
async def get_match_insights(
    user_id: str,
    job_id: str,
    perspective: Literal["seeker", "recruiter"] = "seeker",
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Return a structured explainability payload for UI decision support.

    Includes weighted score decomposition, strongest evidence, top gaps,
    actionable next steps, caveats, and confidence level.
    """
    analytics = AnalyticsService(sqlite, db)
    engine = MatchingEngine(db, analytics_service=analytics)
    result = await engine._score_user_job_pair(user_id, job_id)
    if result is None:
        raise HTTPException(
            status_code=404, detail=f"User '{user_id}' or job '{job_id}' not found"
        )

    rich_context = await engine.gather_match_context(user_id, job_id)
    return _build_match_insights(user_id, job_id, perspective, result, rich_context)


@router.get(
    "/jobs/{job_id}/matches",
    response_model=BatchCandidateResponse,
    tags=["matching"],
    summary="Rank all candidates for a job",
)
async def get_all_candidates_for_job(
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Compute match scores for ALL users in the database for the given job.
    Returns results ranked by total_score (descending) - reverse-match for recruiters.
    """
    engine = MatchingEngine(db)
    return await engine.rank_all_users_for_job(job_id)


@router.get(
    "/users/{user_id}/matches/{job_id}/paths",
    tags=["matching"],
    summary="Trace explicit graph paths (scrutability)",
)
async def trace_match_paths(
    user_id: str,
    job_id: str,
    limit: int = 10,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Find all explicit graph paths connecting a user to a job.

    Returns path chains like:
      "user1 → HAS_SKILL_CATEGORY → Skills → HAS_SKILL_FAMILY → Python → ..."

    Every match reason is a traceable graph edge, not a black-box score.
    """
    engine = MatchingEngine(db)
    paths = await engine.trace_match_paths(user_id, job_id, limit=limit)
    return {"user_id": user_id, "job_id": job_id, "paths": paths}


@router.post(
    "/users/{user_id}/matches/{job_id}/explain",
    tags=["matching"],
    summary="Generate LLM explanation for a user-job match",
)
async def explain_match(
    user_id: str,
    job_id: str,
    perspective: str = "recruiter",
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Generate a structured, evidence-based explanation for a user-job match.

    Uses skill evidence quality (evidence_strength), 5W+H context from how
    skills were actually used in projects (DEMONSTRATES_SKILL edge properties),
    the candidate's CriticalAssessment node (seniority, red flags, genuine
    strengths), domain depth, and seniority fit against job requirements.

    perspective: 'seeker'    → second person, constructive framing
                 'recruiter' → third person, hiring-manager lens
    """
    engine = MatchingEngine(db)
    result = await engine._score_user_job_pair(user_id, job_id)
    if result is None:
        raise HTTPException(
            status_code=404, detail=f"User '{user_id}' or job '{job_id}' not found"
        )

    paths_data   = await engine.trace_match_paths(user_id, job_id, limit=10)
    path_strings = [p["path"] for p in paths_data]
    rich_context = await engine.gather_match_context(user_id, job_id)

    try:
        llm = LLMExtractionService()
        explanation = await llm.generate_match_explanation(
            user_id=user_id,
            job_title=result.job_title,
            company=result.company,
            total_score=result.total_score,
            skill_score=result.skill_score,
            domain_score=result.domain_score,
            culture_bonus=result.culture_bonus,
            preference_bonus=result.preference_bonus,
            matched_skills=result.matched_skills,
            inferred_skills=result.inferred_skills,
            missing_skills=result.missing_skills,
            matched_domains=result.matched_domains,
            missing_domains=result.missing_domains,
            paths=path_strings,
            perspective=perspective,
            rich_context=rich_context,
            skill_match_details=[d.model_dump() for d in result.skill_match_details],
        )
    except Exception as e:
        logger.exception(f"LLM explanation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"user_id": user_id, "job_id": job_id, "explanation": explanation}


# ── Visualization ──────────────────────────────────────────────────────────────

@router.post(
    "/users/{user_id}/recommendations",
    tags=["visualization"],
    summary="Generate job recommendations dashboard",
)
async def generate_recommendations(
    user_id: str,
    limit: int = 10,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Generate a styled HTML recommendations page for a user.

    Shows the top-N ranked jobs as cards with score breakdown bars,
    matched skill badges (green), missing skill badges (orange), and
    a "View Match Graph" link per job.
    """
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    viz = VisualizationService(db, output_dir)
    try:
        filepath = await viz.generate_recommendations_page(user_id, limit=limit)
        return {
            "user_id": user_id,
            "file": filepath,
            "instructions": (
                "Open the HTML file in a browser, or fetch via "
                f"GET /api/v1/users/{user_id}/recommendations"
            ),
        }
    except Exception as e:
        logger.exception(f"Recommendations generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/users/{user_id}/recommendations",
    tags=["visualization"],
    summary="Serve the recommendations dashboard HTML",
)
async def serve_recommendations(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """Serve the recommendations HTML page. Generate it first via POST."""
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    filepath = os.path.join(output_dir, f"recommendations_{user_id}.html")
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=404,
            detail=f"Not found. POST /api/v1/users/{user_id}/recommendations first.",
        )
    return FileResponse(filepath, media_type="text/html")


@router.post(
    "/users/{user_id}/matches/{job_id}/visualize",
    tags=["visualization"],
    summary="Generate combined user+job match comparison graph",
)
async def generate_match_visualization(
    user_id: str,
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Generate a combined pyvis graph showing both user and job subgraphs.

    Colour coding:
      Green  - matched skills/domains (user has it, job requires it)
      Orange - gaps (job requires it, user lacks it)
      Green edges - MATCHES connections between matched nodes
    """
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    viz = VisualizationService(db, output_dir)
    try:
        filepath = await viz.generate_match_graph(user_id, job_id)
        return {
            "user_id": user_id,
            "job_id": job_id,
            "file": filepath,
            "instructions": (
                "Open the HTML file in a browser, or fetch via "
                f"GET /api/v1/users/{user_id}/matches/{job_id}/visualize"
            ),
        }
    except Exception as e:
        logger.exception(f"Match visualization generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/users/{user_id}/matches/{job_id}/visualize",
    tags=["visualization"],
    summary="Serve the match comparison graph HTML",
)
async def serve_match_visualization(
    user_id: str,
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """Serve the match comparison graph HTML. Generate it first via POST."""
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    filepath = os.path.join(
        output_dir, f"graph_match_{user_id}_{job_id}.html"
    )
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=404,
            detail=(
                f"Not found. POST /api/v1/users/{user_id}/matches/{job_id}/visualize first."
            ),
        )
    return FileResponse(filepath, media_type="text/html")


@router.post(
    "/users/{user_id}/visualize",
    tags=["visualization"],
    summary="Generate interactive graph visualization",
)
async def generate_user_visualization(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Generate an interactive pyvis HTML graph of the user's knowledge graph.

    The graph shows the full 4-level hierarchy (User → Category → Family → Leaf)
    with nodes colored by type. Open the HTML file in any browser.

    File is saved to OUTPUT_DIR and served via GET /visualize.
    """
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    viz = VisualizationService(db, output_dir)
    try:
        filepath = await viz.generate_user_graph(user_id)
        return {
            "user_id": user_id,
            "file": filepath,
            "instructions": (
                "Open the HTML file in a browser, or fetch via "
                f"GET /api/v1/users/{user_id}/visualize"
            ),
        }
    except Exception as e:
        logger.exception(f"Visualization generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/users/{user_id}/visualize",
    tags=["visualization"],
    summary="Serve the graph visualization HTML",
)
async def serve_visualization(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Serve the interactive pyvis HTML graph directly in the browser.

    If the file doesn't exist yet, call POST /visualize first to generate it.
    """
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    filepath = os.path.join(output_dir, f"graph_{user_id}.html")
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=404,
            detail=f"Graph not found. POST /api/v1/users/{user_id}/visualize first.",
        )
    return FileResponse(filepath, media_type="text/html")


@router.post(
    "/jobs/{job_id}/visualize",
    tags=["visualization"],
    summary="Generate interactive graph visualization for a job",
)
async def generate_job_visualization(
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Generate an interactive pyvis HTML graph of a job's requirement hierarchy.

    Shows the full hierarchy: Job → JobSkillRequirements → JobSkillFamily →
    JobSkillRequirement, JobDomainRequirements, JobCultureRequirements, etc.
    """
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    viz = VisualizationService(db, output_dir)
    try:
        filepath = await viz.generate_job_graph(job_id)
        return {
            "job_id": job_id,
            "file": filepath,
            "instructions": (
                "Open the HTML file in a browser, or fetch via "
                f"GET /api/v1/jobs/{job_id}/visualize"
            ),
        }
    except Exception as e:
        logger.exception(f"Job visualization generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/jobs/{job_id}/visualize",
    tags=["visualization"],
    summary="Serve the job graph visualization HTML",
)
async def serve_job_visualization(
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Serve the interactive pyvis HTML graph for a job directly in the browser.

    If the file doesn't exist yet, call POST /jobs/{job_id}/visualize first.
    """
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    filepath = os.path.join(output_dir, f"graph_job_{job_id}.html")
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=404,
            detail=f"Graph not found. POST /api/v1/jobs/{job_id}/visualize first.",
        )
    return FileResponse(filepath, media_type="text/html")


# ── Utility ────────────────────────────────────────────────────────────────────

@router.get("/users", tags=["utility"], summary="List all users")
async def list_users(db: Neo4jClient = Depends(get_neo4j)):
    """Return all user IDs in the database."""
    return await db.run_query(
        "MATCH (u:User) RETURN u.id AS id ORDER BY u.id"
    )


_LIST_JOBS_RETURN = """
OPTIONAL MATCH (j)-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
               -[:HAS_SKILL_FAMILY_REQ]->(:JobSkillFamily)
               -[:REQUIRES_SKILL]->(sr:JobSkillRequirement)
WHERE sr.importance = 'must_have'
OPTIONAL MATCH (j)-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
               -[:HAS_DOMAIN_FAMILY_REQ]->(:JobDomainFamily)
               -[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
WITH j,
     collect(DISTINCT sr.name)[0..8] AS key_skills,
     collect(DISTINCT dr.name)[0..4] AS domains
RETURN j.id                   AS id,
       j.title                AS title,
       j.company              AS company,
       j.remote_policy        AS remote_policy,
       j.company_size         AS company_size,
       j.experience_years_min AS experience_years_min,
       coalesce(j.tags, [])   AS tags,
       key_skills,
       domains,
       CASE WHEN j.raw_text IS NOT NULL THEN left(j.raw_text, 300) ELSE null END
                              AS description_preview
ORDER BY j.title
"""


@router.get("/jobs", tags=["utility"], summary="List all jobs")
async def list_jobs(recruiter_id: str | None = None, db: Neo4jClient = Depends(get_neo4j)):
    """
    Return rich job listings: title, company, remote policy, company_size,
    experience level, tags, key required skills, domains, and a 300-char
    description preview (from stored raw_text if available).
    Pass recruiter_id to filter to that recruiter's jobs only.
    """
    if recruiter_id:
        return await db.run_query(
            "MATCH (j:Job) WHERE j.recruiter_id = $recruiter_id " + _LIST_JOBS_RETURN,
            {"recruiter_id": recruiter_id},
        )
    return await db.run_query("MATCH (j:Job) " + _LIST_JOBS_RETURN)


@router.get(
    "/jobs/{job_id}/profile",
    response_model=JobProfileResponse,
    tags=["utility"],
    summary="Get full enriched job profile",
)
async def get_job_profile(
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Return the complete enriched job profile including deep graph nodes:
    company profile, hiring team, compensation, role expectations,
    education requirements, preferred qualifications, and soft requirements.
    """
    llm_svc = LLMExtractionService()
    profile = await llm_svc.describe_job_from_graph(job_id, db)
    if not profile.get("title") and not profile.get("company"):
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return profile


@router.get("/users/{user_id}/graph-stats", tags=["utility"])
async def get_user_graph_stats(
    user_id: str, db: Neo4jClient = Depends(get_neo4j)
):
    """Return node counts at each hierarchy level for a user's graph."""
    stats = await db.count_nodes_for_user(user_id)
    if stats["categories"] == 0:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    return {"user_id": user_id, **stats}


# ── Checkpointing ──────────────────────────────────────────────────────────────

@router.post(
    "/users/{user_id}/graph/checkpoint",
    response_model=GraphVersion,
    tags=["checkpointing"],
    summary="Create a graph checkpoint for a user",
)
async def create_user_checkpoint(
    user_id: str,
    request: CheckpointRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """Serialize the current user subgraph to SQLite as a versioned checkpoint."""
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = CheckpointService(db, sqlite, output_dir)
    try:
        return await svc.create_checkpoint(
            "user", user_id, request.label or f"manual_{user_id}"
        )
    except Exception as e:
        logger.exception(f"User checkpoint creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/users/{user_id}/graph/versions",
    response_model=list[GraphVersion],
    tags=["checkpointing"],
    summary="List graph versions for a user",
)
async def list_user_versions(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """Return the 10 most recent graph checkpoints for a user."""
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = CheckpointService(db, sqlite, output_dir)
    try:
        return await svc.list_versions("user", user_id)
    except Exception as e:
        logger.exception(f"User version listing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/users/{user_id}/graph/rollback/{version_id}",
    response_model=RollbackResponse,
    tags=["checkpointing"],
    summary="Rollback a user graph to a previous version",
)
async def rollback_user_graph(
    user_id: str,
    version_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """Restore the user subgraph in Neo4j from a previously saved checkpoint."""
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = CheckpointService(db, sqlite, output_dir)
    try:
        await svc.rollback("user", user_id, version_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"User rollback failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return RollbackResponse(version_id=version_id, entity_type="user", entity_id=user_id)


@router.post(
    "/jobs/{job_id}/graph/checkpoint",
    response_model=GraphVersion,
    tags=["checkpointing"],
    summary="Create a graph checkpoint for a job",
)
async def create_job_checkpoint(
    job_id: str,
    request: CheckpointRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """Serialize the current job subgraph to SQLite as a versioned checkpoint."""
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = CheckpointService(db, sqlite, output_dir)
    try:
        return await svc.create_checkpoint(
            "job", job_id, request.label or f"manual_{job_id}"
        )
    except Exception as e:
        logger.exception(f"Job checkpoint creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/jobs/{job_id}/graph/versions",
    response_model=list[GraphVersion],
    tags=["checkpointing"],
    summary="List graph versions for a job",
)
async def list_job_versions(
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """Return the 10 most recent graph checkpoints for a job."""
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = CheckpointService(db, sqlite, output_dir)
    try:
        return await svc.list_versions("job", job_id)
    except Exception as e:
        logger.exception(f"Job version listing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/jobs/{job_id}/graph/rollback/{version_id}",
    response_model=RollbackResponse,
    tags=["checkpointing"],
    summary="Rollback a job graph to a previous version",
)
async def rollback_job_graph(
    job_id: str,
    version_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """Restore the job subgraph in Neo4j from a previously saved checkpoint."""
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = CheckpointService(db, sqlite, output_dir)
    try:
        await svc.rollback("job", job_id, version_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Job rollback failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return RollbackResponse(version_id=version_id, entity_type="job", entity_id=job_id)


# ── Graph Editing ──────────────────────────────────────────────────────────────

@router.post(
    "/users/{user_id}/graph/edit/start",
    response_model=EditSessionResponse,
    tags=["editing"],
    summary="Start a new graph edit session for a user",
)
async def start_user_edit_session(
    user_id: str,
    request: StartEditRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = GraphEditService(db, sqlite, output_dir)
    try:
        return await svc.start_session("user", user_id)
    except Exception as e:
        logger.exception(f"Edit session start failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/users/{user_id}/graph/edit/message",
    response_model=GraphMutationProposal,
    tags=["editing"],
    summary="Send a message in the edit session",
)
async def user_edit_message(
    user_id: str,
    request: SendMessageRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = GraphEditService(db, sqlite, output_dir)
    try:
        return await svc.send_message(request.session_id, request.message)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Edit message failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/users/{user_id}/graph/edit/apply",
    response_model=ApplyMutationsResponse,
    tags=["editing"],
    summary="Apply accepted mutations to the user graph",
)
async def apply_user_mutations(
    user_id: str,
    request: ApplyMutationsRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = GraphEditService(db, sqlite, output_dir)
    try:
        result = await svc.apply_mutations(request.session_id, request.mutations)
        await _bump_user_cache_version(user_id, sqlite)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Apply mutations failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/users/{user_id}/graph/edit/reject",
    response_model=GraphMutationProposal,
    tags=["editing"],
    summary="Reject the LLM's proposed mutations and get a follow-up question",
)
async def reject_user_mutations(
    user_id: str,
    request: RejectMutationsRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = GraphEditService(db, sqlite, output_dir)
    try:
        return await svc.reject_mutations(request.session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Reject mutations failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/users/{user_id}/graph/edit/history",
    response_model=list[EditSessionMessage],
    tags=["editing"],
    summary="Get full conversation history for an edit session",
)
async def get_user_edit_history(
    user_id: str,
    session_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = GraphEditService(db, sqlite, output_dir)
    try:
        return await svc.get_history(session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Get history failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/jobs/{job_id}/graph/edit/start",
    response_model=EditSessionResponse,
    tags=["editing"],
    summary="Start a new graph edit session for a job",
)
async def start_job_edit_session(
    job_id: str,
    request: StartEditRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = GraphEditService(db, sqlite, output_dir)
    try:
        return await svc.start_session("job", job_id, request.recruiter_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Job edit session start failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/jobs/{job_id}/graph/edit/message",
    response_model=GraphMutationProposal,
    tags=["editing"],
    summary="Send a message in the job edit session",
)
async def job_edit_message(
    job_id: str,
    request: SendMessageRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = GraphEditService(db, sqlite, output_dir)
    try:
        return await svc.send_message(request.session_id, request.message)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Job edit message failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/jobs/{job_id}/graph/edit/apply",
    response_model=ApplyMutationsResponse,
    tags=["editing"],
    summary="Apply accepted mutations to the job graph",
)
async def apply_job_mutations(
    job_id: str,
    request: ApplyMutationsRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = GraphEditService(db, sqlite, output_dir)
    try:
        return await svc.apply_mutations(request.session_id, request.mutations)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Apply job mutations failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/jobs/{job_id}/graph/edit/reject",
    response_model=GraphMutationProposal,
    tags=["editing"],
    summary="Reject proposed job mutations and get a follow-up question",
)
async def reject_job_mutations(
    job_id: str,
    request: RejectMutationsRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    output_dir = os.getenv("OUTPUT_DIR", "./outputs")
    svc = GraphEditService(db, sqlite, output_dir)
    try:
        return await svc.reject_mutations(request.session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Reject job mutations failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Clarification / Digital Twin Verification ──────────────────────────────────

@router.get(
    "/users/{user_id}/clarifications",
    response_model=ClarificationsResponse,
    tags=["clarification"],
    summary="Get pending clarification questions for a user's profile",
)
async def get_clarifications(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Returns all interpretation flags generated during resume extraction,
    ordered by impact (critical first).

    Each flag includes:
    - The exact text from the resume that was interpreted
    - What the LLM decided it means
    - Why there is uncertainty
    - A specific clarification question to ask the user
    - Suggested answer options where applicable

    `graph_verified` becomes True when all critical flags are resolved.
    Resolve flags via POST /users/{user_id}/clarifications/{flag_id}/resolve
    """
    try:
        svc = ClarificationService(db, sqlite)
        return await svc.get_clarifications(user_id)
    except Exception as e:
        logger.exception(f"Get clarifications failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/users/{user_id}/clarifications/{flag_id}/resolve",
    response_model=ResolveFlagResponse,
    tags=["clarification"],
    summary="Resolve a clarification question - confirm or correct the LLM's interpretation",
)
async def resolve_clarification(
    user_id: str,
    flag_id: str,
    request: ResolveFlagRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Confirm or correct a single interpretation flag.

    If `is_correct=true`: the LLM's interpretation is confirmed and the flag is marked verified.

    If `is_correct=false`: provide a `correction` value and the graph node will be
    patched immediately. For example, if the LLM set skill level='expert' but the
    user corrects it to 'intermediate', the Skill node is updated and weights recomputed.

    `remaining_critical` in the response tells you how many critical flags are still pending.
    When it reaches 0, the graph is a verified digital twin of the user.
    """
    try:
        svc = ClarificationService(db, sqlite)
        result = await svc.resolve_flag(
            user_id=user_id,
            flag_id=flag_id,
            is_correct=request.is_correct,
            user_answer=request.user_answer,
            correction=request.correction,
        )
        await _bump_user_cache_version(user_id, sqlite)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Resolve clarification failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/users/{user_id}/clarifications/{flag_id}/skip",
    tags=["clarification"],
    summary="Skip a clarification question",
)
async def skip_clarification(
    user_id: str,
    flag_id: str,
    sqlite: SQLiteClient = Depends(get_sqlite_db),
    db: Neo4jClient = Depends(get_neo4j),
):
    """Mark a flag as skipped. The LLM's interpretation remains in the graph as-is."""
    try:
        svc = ClarificationService(db, sqlite)
        await svc.skip_flag(user_id, flag_id)
        return {"status": "skipped", "flag_id": flag_id}
    except Exception as e:
        logger.exception(f"Skip clarification failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/users/{user_id}/clarifications/{flag_id}/interpret",
    tags=["clarification"],
    summary="Interpret a natural-language answer without saving - show to user for confirmation",
)
async def interpret_clarification_answer(
    user_id: str,
    flag_id: str,
    request: dict,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Takes the user's natural language answer and returns the LLM's interpretation.
    Does NOT modify the graph. Call /resolve to save once the user confirms.

    Returns: { interpreted_value, is_complete, needs_clarification, explanation, confidence }
    """
    from fastapi import Body
    answer = request.get("answer", "")
    if not answer.strip():
        raise HTTPException(status_code=400, detail="answer is required")
    try:
        svc = ClarificationService(db, sqlite)
        return await svc.interpret_answer(user_id, flag_id, answer)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Interpret answer failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/users/{user_id}/describe",
    tags=["profile"],
    summary="Generate a rich natural-language description of the user from their graph",
)
async def describe_user(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Generates a comprehensive, honest natural-language description of the user
    based on everything in their knowledge graph:
    - Professional identity and career arc
    - Genuine strengths with evidence
    - Domain expertise depth
    - Honest assessment of seniority level
    - What roles/teams they are best suited for
    - What gaps or concerns exist

    Uses the CriticalAssessment node + all skills/projects/domains/experiences.
    """
    try:
        from services.llm_extraction import LLMExtractionService
        extractor = LLMExtractionService()
        description = await extractor.describe_user_from_graph(user_id, db)
        return {"user_id": user_id, **description}
    except Exception as e:
        logger.exception(f"Describe user failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/users/{user_id}/completeness",
    tags=["profile"],
    summary="Get digital twin completeness score (no LLM, fast)",
)
async def get_user_completeness(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Compute the user's digital twin completeness score without calling the LLM.

    Returns a structured breakdown across two dimensions:

    **Technical depth** (50% of overall):
      - Skill evidence quality - how many skills are project-backed vs claimed-only
      - Project impact - how many projects have measurable outcomes
      - Experience accomplishments - how many roles have concrete achievements
      - Skills with anecdotes - story coverage across the skill set

    **Human depth** (50% of overall):
      - Anecdotes captured (target: 5)
      - Motivation identified
      - Core values captured
      - Career goal set
      - Culture identity built
      - Behavioral insights observed

    Also surfaces **matching capability flags** - which scoring axes are currently
    active for this user (evidence-weighted skills, soft skill scoring, culture fit).

    Use this endpoint to drive a profile completeness dashboard without triggering
    an expensive LLM describe call.
    """
    try:
        extractor = LLMExtractionService()
        completeness = await extractor.compute_completeness(user_id, db)
        return {"user_id": user_id, **completeness.model_dump()}
    except Exception as e:
        logger.exception(f"Completeness check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/users/{user_id}/career-preferences",
    tags=["profile"],
    summary="Save career preferences from onboarding or profile page",
)
async def save_career_preferences(
    user_id: str,
    req: CareerPreferencesRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Save career preferences captured during onboarding or from the Verify Profile page.

    Writes/updates the following nodes in the user's graph:
      - Preference nodes: employment_type (per type), salary_range, location,
                          remote_work (if remote_only=True), work_authorization
      - Value nodes: each value in req.values
      - Goal node: career_goal text (type='career', source='user_provided')

    All fields are optional — partial saves are supported.
    Existing nodes with the same key are updated (MERGE + SET).
    """
    import json as _json
    saved: list[str] = []

    # ── Employment types → Preference nodes ───────────────────────────────────
    for emp_type in req.employment_types:
        await db.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (cat:PreferenceCategory {name: 'Preferences', user_id: $user_id})
            MERGE (u)-[:HAS_PREFERENCE_CATEGORY]->(cat)
            MERGE (p:Preference {type: 'employment_type', user_id: $user_id, value: $value})
            SET p.source = 'user_provided'
            MERGE (cat)-[:HAS_PREFERENCE]->(p)
            """,
            {"user_id": user_id, "value": emp_type},
        )
    if req.employment_types:
        saved.append("employment_type")

    # ── Salary range → Preference node ────────────────────────────────────────
    if req.salary_min is not None or req.salary_max is not None:
        currency = (req.salary_currency or "USD").upper()
        sal_min  = req.salary_min or 0
        sal_max  = req.salary_max or 0
        sal_val  = f"{sal_min}-{sal_max} {currency}"
        await db.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (cat:PreferenceCategory {name: 'Preferences', user_id: $user_id})
            MERGE (u)-[:HAS_PREFERENCE_CATEGORY]->(cat)
            MERGE (p:Preference {type: 'salary_range', user_id: $user_id})
            SET p.value          = $value,
                p.salary_min     = $sal_min,
                p.salary_max     = $sal_max,
                p.salary_currency = $currency,
                p.source         = 'user_provided'
            MERGE (cat)-[:HAS_PREFERENCE]->(p)
            """,
            {"user_id": user_id, "value": sal_val, "sal_min": sal_min,
             "sal_max": sal_max, "currency": currency},
        )
        saved.append("salary_range")

    # ── Location → Preference node ────────────────────────────────────────────
    if req.location:
        await db.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (cat:PreferenceCategory {name: 'Preferences', user_id: $user_id})
            MERGE (u)-[:HAS_PREFERENCE_CATEGORY]->(cat)
            MERGE (p:Preference {type: 'location', user_id: $user_id})
            SET p.value = $value, p.source = 'user_provided'
            MERGE (cat)-[:HAS_PREFERENCE]->(p)
            """,
            {"user_id": user_id, "value": req.location},
        )
        saved.append("location")

    # ── Remote only → remote_work Preference ──────────────────────────────────
    if req.remote_only:
        await db.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (cat:PreferenceCategory {name: 'Preferences', user_id: $user_id})
            MERGE (u)-[:HAS_PREFERENCE_CATEGORY]->(cat)
            MERGE (p:Preference {type: 'remote_work', user_id: $user_id})
            SET p.value = 'remote', p.source = 'user_provided'
            MERGE (cat)-[:HAS_PREFERENCE]->(p)
            """,
            {"user_id": user_id},
        )
        saved.append("remote_work")

    # ── Work authorization → Preference node ──────────────────────────────────
    if req.work_authorization:
        await db.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (cat:PreferenceCategory {name: 'Preferences', user_id: $user_id})
            MERGE (u)-[:HAS_PREFERENCE_CATEGORY]->(cat)
            MERGE (p:Preference {type: 'work_authorization', user_id: $user_id})
            SET p.value = $value, p.source = 'user_provided'
            MERGE (cat)-[:HAS_PREFERENCE]->(p)
            """,
            {"user_id": user_id, "value": req.work_authorization},
        )
        saved.append("work_authorization")

    # ── Values → Value nodes ───────────────────────────────────────────────────
    for rank, val_name in enumerate(req.values[:5], start=1):  # cap at 5
        await db.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (v:Value {name: $name, user_id: $user_id})
            SET v.priority_rank = $rank,
                v.source        = 'user_provided',
                v.evidence      = 'Self-reported during onboarding'
            MERGE (u)-[:HOLDS_VALUE]->(v)
            """,
            {"user_id": user_id, "name": val_name, "rank": rank},
        )
    if req.values:
        saved.append("values")

    # ── Career goal → Goal node ────────────────────────────────────────────────
    if req.career_goal and req.career_goal.strip():
        await db.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (g:Goal {type: 'career', user_id: $user_id})
            SET g.description   = $description,
                g.clarity_level = 'explicit',
                g.source        = 'user_provided',
                g.name          = 'Career Goal'
            MERGE (u)-[:ASPIRES_TO]->(g)
            """,
            {"user_id": user_id, "description": req.career_goal.strip()},
        )
        saved.append("career_goal")

    if saved:
        await _bump_user_cache_version(user_id, sqlite)
    return {"status": "saved", "user_id": user_id, "saved_fields": saved}


# ── Admin ──────────────────────────────────────────────────────────────────────

@router.get(
    "/users/{user_id}/export",
    tags=["privacy"],
    summary="Export all user data (GDPR Article 20 — right to data portability)",
)
async def export_user_data(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Returns a complete structured export of all data held about this user.
    Covers: graph nodes (skills, projects, domains, experiences, education,
    certifications, achievements, publications, preferences, patterns),
    clarification flags, and answers stored in SQLite.
    Embeddings are excluded (internal vectors, not personal data).
    """
    from datetime import datetime, timezone

    # ── Graph data from Neo4j ──────────────────────────────────────────────────
    rows = await db.run_query(
        """
        MATCH (n)
        WHERE (n:User AND n.id = $uid) OR n.user_id = $uid
        RETURN labels(n) AS node_labels, properties(n) AS props
        ORDER BY labels(n)[0]
        """,
        {"uid": user_id},
    )

    graph_data: dict[str, list] = {}
    for row in rows:
        node_labels = row["node_labels"] if "node_labels" in row else []
        label = node_labels[0] if node_labels else "Unknown"
        props = dict(row["props"]) if "props" in row else {}
        # Strip internal embedding vectors — not human-readable personal data
        props.pop("embedding", None)
        graph_data.setdefault(label, []).append(props)

    # ── Clarification flags from SQLite ────────────────────────────────────────
    flags: list[dict] = []
    if sqlite:
        flag_rows = await sqlite.fetchall(
            "SELECT flag_id, field, raw_text, interpreted_as, confidence, "
            "ambiguity_reason, clarification_question, resolution_impact, "
            "suggested_options, status, user_answer, correction_applied, "
            "created_at, resolved_at FROM extraction_flags WHERE user_id = ?",
            (user_id,),
        )
        flags = [dict(r) for r in flag_rows]

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id,
        "gdpr_basis": "GDPR Article 20 — Right to Data Portability",
        "data_controller": "Lumino JobRecommender",
        "data_categories": {
            "graph_nodes": "Professional profile extracted from your resume: skills, projects, domains, "
                           "work experiences, education, certifications, achievements, publications, preferences.",
            "clarification_flags": "AI interpretation flags and your answers used to verify the profile graph.",
        },
        "graph_data": graph_data,
        "clarification_flags": flags,
    }


@router.delete("/users/{user_id}", tags=["privacy"], summary="Delete a user and all their data (GDPR Article 17)")
async def delete_user(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    GDPR Article 17 — Right to Erasure.
    Cascade-deletes the User node and every node owned by this user (skills,
    domains, projects, experiences, preferences, patterns) plus all MATCHES edges.
    Also removes clarification flags from SQLite and cached visualization files.
    """
    await db.run_write(
        """
        MATCH (n)
        WHERE (n:User AND n.id = $user_id) OR n.user_id = $user_id
        DETACH DELETE n
        """,
        {"user_id": user_id},
    )

    # Remove clarification flags and preference data from SQLite
    if sqlite:
        await sqlite.execute(
            "DELETE FROM extraction_flags WHERE user_id = ?", (user_id,)
        )

    import glob
    for f in (
        glob.glob(f"./outputs/graph_{user_id}.html")
        + glob.glob(f"./outputs/graph_match_{user_id}_*.html")
        + glob.glob(f"./outputs/recommendations_{user_id}.html")
    ):
        try:
            os.remove(f)
        except OSError:
            pass
    return {"status": "deleted", "user_id": user_id}


@router.delete("/jobs/{job_id}", tags=["admin"], summary="Delete a job and all its data")
async def delete_job(job_id: str, db: Neo4jClient = Depends(get_neo4j)):
    """Cascade-delete the Job node and every node owned by this job (skill/domain
    requirements, work styles) plus all MATCHES edges pointing to those nodes.
    Also removes any cached visualization HTML files."""
    await db.run_write(
        """
        MATCH (n)
        WHERE (n:Job AND n.id = $job_id) OR n.job_id = $job_id
        DETACH DELETE n
        """,
        {"job_id": job_id},
    )
    import glob
    for f in (
        glob.glob(f"./outputs/graph_job_{job_id}.html")
        + glob.glob(f"./outputs/graph_match_*_{job_id}.html")
    ):
        try:
            os.remove(f)
        except OSError:
            pass
    return {"status": "deleted", "job_id": job_id}


@router.post(
    "/admin/reset-vector-indexes",
    tags=["admin"],
    summary="Drop and recreate vector indexes at the configured dimension",
)
async def reset_vector_indexes(db: Neo4jClient = Depends(get_neo4j)):
    """
    Drop all four vector indexes and recreate them at EMBEDDING_DIMENSIONS.

    Use this when switching embedding models that produce a different vector size
    (e.g. 768 → 3072). After calling this endpoint, call POST /admin/reembed?scope=all
    to regenerate all embedding vectors at the new dimension.
    """
    dims = int(os.environ.get("EMBEDDING_DIMENSIONS", "768"))
    await db.drop_vector_indexes()
    await db.setup_vector_indexes(dims)
    return {"status": "recreated", "dimensions": dims}


@router.post(
    "/admin/reembed",
    response_model=ReembedResponse,
    tags=["admin"],
    summary="Re-embed nodes for one scope or the whole graph",
)
async def reembed(
    scope: Literal["all", "user", "job"] = "all",
    entity_id: str | None = None,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Regenerate embedding vectors on graph nodes without re-ingesting source documents.

    Use after changing EMBEDDING_MODEL or EMBEDDING_DIMENSIONS, or to backfill
    nodes ingested before the GraphRAG upgrade.

    Scope options:
      - all:  re-embed every user and job in Neo4j
      - user: re-embed one user's Skill and Domain nodes
      - job:  re-embed one job's JobSkillRequirement and JobDomainRequirement nodes
    """
    if scope in {"user", "job"} and not entity_id:
        raise HTTPException(
            status_code=400,
            detail="entity_id is required when scope is 'user' or 'job'",
        )

    embedder = VectorEmbeddingService(db)
    users_processed = 0
    jobs_processed = 0
    skills_embedded = 0
    domains_embedded = 0
    skill_reqs_embedded = 0
    domain_reqs_embedded = 0

    async def _user_exists(user_id: str) -> bool:
        rows = await db.run_query(
            "MATCH (u:User {id: $user_id}) RETURN count(u) AS count",
            {"user_id": user_id},
        )
        return bool(rows and rows[0].get("count"))

    async def _job_exists(job_id: str) -> bool:
        rows = await db.run_query(
            "MATCH (j:Job {id: $job_id}) RETURN count(j) AS count",
            {"job_id": job_id},
        )
        return bool(rows and rows[0].get("count"))

    try:
        if scope == "user":
            if not await _user_exists(entity_id):
                raise HTTPException(status_code=404, detail=f"User '{entity_id}' not found")
            counts = await embedder.reembed_user(entity_id)
            users_processed += 1
            skills_embedded += counts["skills_embedded"]
            domains_embedded += counts["domains_embedded"]
        elif scope == "job":
            if not await _job_exists(entity_id):
                raise HTTPException(status_code=404, detail=f"Job '{entity_id}' not found")
            counts = await embedder.reembed_job(entity_id)
            jobs_processed += 1
            skill_reqs_embedded += counts["skill_reqs_embedded"]
            domain_reqs_embedded += counts["domain_reqs_embedded"]
        else:
            counts = await embedder.reembed_all()
            users_processed = counts["users_processed"]
            jobs_processed = counts["jobs_processed"]
            skills_embedded = counts["skills_embedded"]
            domains_embedded = counts["domains_embedded"]
            skill_reqs_embedded = counts["skill_reqs_embedded"]
            domain_reqs_embedded = counts["domain_reqs_embedded"]
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Reembed failed for scope={scope} entity_id={entity_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return ReembedResponse(
        status="embedded",
        scope=scope,
        entity_id=entity_id,
        users_processed=users_processed,
        jobs_processed=jobs_processed,
        skills_embedded=skills_embedded,
        domains_embedded=domains_embedded,
        skill_reqs_embedded=skill_reqs_embedded,
        domain_reqs_embedded=domain_reqs_embedded,
    )


@router.get("/health", tags=["utility"], summary="Health check")
async def health_check(db: Neo4jClient = Depends(get_neo4j)):
    """Verify Neo4j connectivity. Returns 503 if database is unreachable."""
    try:
        await db.verify_connectivity()
        return {"status": "healthy", "neo4j": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Neo4j unreachable: {e}")


# ── Analytics ──────────────────────────────────────────────────────────────────

@router.post(
    "/users/{user_id}/events",
    tags=["analytics"],
    summary="Record a user interaction event",
)
async def record_event(
    user_id: str,
    request: RecordEventRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Record a user interaction event (view, click, like, dislike, bookmark, apply).

    Events drive the interest profile:
      job_applied    +3.0  — strongest positive signal
      job_liked      +2.0
      job_bookmarked +1.5
      job_clicked    +1.0  — CTR on the job card
      job_viewed     +0.5  — dwell ≥ 5s
      job_disliked   -2.0  — explicit negative
      job_dismissed  -0.5  — fast scroll-past

    After recording, the user's interest profile is immediately recomputed.
    """
    try:
        analytics = AnalyticsService(sqlite, db)
        await analytics.record_event(
            user_id=user_id,
            job_id=request.job_id,
            event_type=request.event_type,
            duration_ms=request.duration_ms,
        )
        return {"status": "recorded", "user_id": user_id, "event_type": request.event_type}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Event recording failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/users/{user_id}/job-interactions",
    tags=["analytics"],
    summary="Get current like/dislike/bookmark state per job for a user",
)
async def get_job_interactions(
    user_id: str,
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Returns the derived interaction state for every job the user has interacted with.

    Like/dislike state: determined by whichever of job_liked / job_disliked / job_dismissed
    was recorded most recently for that job.
    Bookmark state: toggled by parity — odd number of job_bookmarked events = currently bookmarked.
    """
    rows = await sqlite.fetchall(
        """
        SELECT
            job_id,
            MAX(CASE WHEN event_type = 'job_liked'      THEN created_at END) AS last_liked,
            MAX(CASE WHEN event_type = 'job_disliked'   THEN created_at END) AS last_disliked,
            MAX(CASE WHEN event_type = 'job_dismissed'  THEN created_at END) AS last_dismissed,
            SUM(CASE WHEN event_type = 'job_bookmarked' THEN 1 ELSE 0 END) % 2 AS bookmark_parity
        FROM analytics_events
        WHERE user_id = ?
          AND event_type IN ('job_liked', 'job_disliked', 'job_dismissed', 'job_bookmarked')
        GROUP BY job_id
        """,
        (user_id,),
    )

    interactions = []
    for row in rows:
        last_liked     = row["last_liked"]
        last_disliked  = row["last_disliked"]
        last_dismissed = row["last_dismissed"]

        # A like is active if job_liked was recorded more recently than any dismissal
        liked = bool(
            last_liked and (not last_dismissed or last_liked > last_dismissed)
        )
        # A dislike is active if job_disliked was recorded more recently than any dismissal
        disliked = bool(
            last_disliked and (not last_dismissed or last_disliked > last_dismissed)
        )
        bookmarked = bool(row["bookmark_parity"])

        interactions.append({
            "job_id":     row["job_id"],
            "liked":      liked,
            "disliked":   disliked,
            "bookmarked": bookmarked,
        })

    return {"user_id": user_id, "interactions": interactions}


@router.get(
    "/users/{user_id}/applications",
    response_model=UserApplicationsResponse,
    tags=["analytics"],
    summary="Get all jobs a user has applied to",
)
async def get_user_applications(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Return all jobs the user has applied to, deduplicated to the latest
    application per job, sorted by most recent first.
    Includes job title, company, applied timestamp, and optional match score.
    """
    rows = await sqlite.fetchall(
        """
        SELECT job_id, MAX(created_at) AS applied_at
        FROM analytics_events
        WHERE user_id = ? AND event_type = 'job_applied'
        GROUP BY job_id
        ORDER BY applied_at DESC
        """,
        (user_id,),
    )

    if not rows:
        return UserApplicationsResponse(user_id=user_id, applications=[], total=0)

    engine = MatchingEngine(db)

    async def _enrich_job(row: dict) -> UserApplication:
        job_id = row["job_id"]
        applied_at = row["applied_at"]
        # Fetch job metadata from Neo4j
        job_info = await db.run_query(
            "MATCH (j:Job {id: $job_id}) RETURN j.title AS title, j.company AS company",
            {"job_id": job_id},
        )
        job_title = job_info[0]["title"] if job_info else job_id
        company = job_info[0]["company"] if job_info else None

        # Compute match score (optional – fails gracefully)
        match_score: float | None = None
        try:
            result = await engine._score_user_job_pair(user_id, job_id)
            if result is not None:
                match_score = result.total_score
        except Exception:
            pass

        return UserApplication(
            job_id=job_id,
            job_title=job_title,
            company=company,
            applied_at=applied_at,
            match_score=match_score,
        )

    applications = await asyncio.gather(*[_enrich_job(row) for row in rows])
    return UserApplicationsResponse(
        user_id=user_id,
        applications=list(applications),
        total=len(applications),
    )


@router.get(
    "/jobs/{job_id}/applications",
    response_model=JobApplicantsResponse,
    tags=["analytics"],
    summary="Get all users who applied to a job, with match scores",
)
async def get_job_applicants(
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Return all users who sent a job_applied event for this job, deduplicated
    to the latest application per user. Each applicant is enriched with their
    match score from the graph matching engine where available.
    Sorted by match score descending (unscored applicants appended at end).
    """
    rows = await sqlite.fetchall(
        """
        SELECT user_id, MAX(created_at) AS applied_at
        FROM analytics_events
        WHERE job_id = ? AND event_type = 'job_applied'
        GROUP BY user_id
        ORDER BY applied_at DESC
        """,
        (job_id,),
    )

    if not rows:
        return JobApplicantsResponse(job_id=job_id, applicants=[], total=0)

    engine = MatchingEngine(db)

    async def _score_applicant(row: dict) -> AppliedCandidate:
        uid = row["user_id"]
        applied_at = row["applied_at"]
        try:
            result = await engine._score_user_job_pair(uid, job_id)
        except Exception:
            result = None

        if result is None:
            return AppliedCandidate(user_id=uid, applied_at=applied_at)

        return AppliedCandidate(
            user_id=uid,
            applied_at=applied_at,
            total_score=result.total_score,
            skill_score=result.skill_score,
            domain_score=result.domain_score,
            optional_skill_score=result.optional_skill_score or 0.0,
            soft_skill_score=getattr(result, "soft_skill_score", 0.0) or 0.0,
            culture_fit_score=getattr(result, "culture_fit_score", 0.0) or 0.0,
            culture_bonus=result.culture_bonus or 0.0,
            preference_bonus=result.preference_bonus or 0.0,
            matched_skills=result.matched_skills or [],
            missing_skills=result.missing_skills or [],
            matched_domains=result.matched_domains or [],
            missing_domains=result.missing_domains or [],
            behavioral_risk_flags=result.behavioral_risk_flags or [],
            explanation=result.explanation or "",
        )

    applicants = list(await asyncio.gather(*[_score_applicant(row) for row in rows]))

    # Sort: scored first (descending), unscored appended at end
    scored = sorted(
        [a for a in applicants if a.total_score is not None],
        key=lambda a: a.total_score,  # type: ignore[arg-type]
        reverse=True,
    )
    unscored = [a for a in applicants if a.total_score is None]

    return JobApplicantsResponse(
        job_id=job_id,
        applicants=scored + unscored,
        total=len(applicants),
    )


@router.get(
    "/users/{user_id}/interests",
    response_model=InterestProfileResponse,
    tags=["analytics"],
    summary="Get user interest profile",
)
async def get_interest_profile(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Return the user's derived interest profile: tags they gravitate toward
    based on their job interaction history (views, likes, bookmarks, applies).

    Tags are scored 0.0–1.0 where:
      0.5 = neutral / no data
      >0.5 = interest
      <0.5 = disinterest

    Confidence levels:
      high   = ≥10 interactions contributing to this tag
      medium = 3–9 interactions
      low    = 1–2 interactions
    """
    analytics = AnalyticsService(sqlite, db)
    tags_raw = await analytics.get_interest_profile(user_id)

    # Count total interactions for this user
    total_rows = await sqlite.fetchall(
        "SELECT COUNT(*) AS cnt FROM analytics_events WHERE user_id = ?",
        (user_id,),
    )
    total_interactions = total_rows[0]["cnt"] if total_rows else 0

    tags = [
        InterestTag(
            tag=r["tag"],
            category=r.get("category"),
            score=r["score"],
            interaction_count=r.get("interaction_count") or 0,
            confidence=r.get("confidence") or "low",
            last_updated=r.get("last_updated"),
        )
        for r in tags_raw
    ]

    return InterestProfileResponse(
        user_id=user_id,
        tags=tags,
        total_interactions=total_interactions,
    )


@router.patch(
    "/users/{user_id}/interests/{tag}",
    tags=["analytics"],
    summary="Manually set interest score for a tag",
)
async def adjust_interest(
    user_id: str,
    tag: str,
    request: AdjustInterestRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Explicitly set the interest score for a tag, overriding analytics derivation.

    This is a permanent override — it will survive interest profile recomputations.
    Use score=0.5 to reset to neutral, or DELETE to remove entirely.

    Score semantics:
      0.0 = active disinterest (show fewer jobs with this tag)
      0.5 = neutral (no preference)
      1.0 = high interest (prioritise jobs with this tag)
    """
    analytics = AnalyticsService(sqlite, db)
    await analytics.adjust_interest(user_id, tag, request.score)
    return {"status": "updated", "user_id": user_id, "tag": tag, "score": request.score}


@router.delete(
    "/users/{user_id}/interests/{tag}",
    tags=["analytics"],
    summary="Remove a tag from user interest profile",
)
async def remove_interest(
    user_id: str,
    tag: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    """
    Remove a tag from the user's interest profile entirely.
    Future interactions with jobs carrying this tag will re-add it naturally.
    """
    analytics = AnalyticsService(sqlite, db)
    await analytics.remove_interest(user_id, tag)
    return {"status": "removed", "user_id": user_id, "tag": tag}


# ── Skill Intelligence ─────────────────────────────────────────────────────────

@router.get(
    "/users/{user_id}/skill-intelligence",
    response_model=SkillIntelligenceResponse,
    tags=["analytics"],
    summary="Get skill evidence quality vs market demand",
)
async def get_skill_intelligence(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Returns each skill in the user's graph annotated with:
      - evidence_strength: how well-evidenced the skill is (0–1)
      - demand_count: how many jobs in the graph require this skill (via MATCHES edges)
      - demand_pct: demand_count / total_jobs

    Used to power the Evidence Quality Matrix quadrant chart in the
    Skills Intelligence page.
    """
    # Total job count (denominator for demand_pct)
    count_rows = await db.run_query("MATCH (j:Job) RETURN count(j) AS cnt", {})
    total_jobs = int(count_rows[0]["cnt"]) if count_rows else 0

    # User skills + how many jobs they appear in (via MATCHES edges created at match time)
    rows = await db.run_query(
        """
        MATCH (u:User {id: $user_id})-[:HAS_SKILL]->(s:Skill)
        OPTIONAL MATCH (s)-[:MATCHES]->(jsr:JobSkillRequirement)<-[:REQUIRES_SKILL]-(j:Job)
        RETURN
            s.name                              AS name,
            coalesce(s.family, '')              AS family,
            coalesce(s.years, 0.0)              AS years,
            s.level                             AS level,
            coalesce(s.evidence_strength, 0.5)  AS evidence_strength,
            count(DISTINCT j)                   AS demand_count
        ORDER BY demand_count DESC, s.name ASC
        """,
        {"user_id": user_id},
    )

    skills: list[SkillIntelligenceItem] = []
    for row in rows:
        demand_count = int(row["demand_count"] or 0)
        skills.append(
            SkillIntelligenceItem(
                name=row["name"],
                family=row["family"] or "",
                years=float(row["years"] or 0),
                level=row["level"],
                evidence_strength=float(row["evidence_strength"] or 0.5),
                demand_count=demand_count,
                demand_pct=demand_count / total_jobs if total_jobs > 0 else 0.0,
            )
        )

    return SkillIntelligenceResponse(user_id=user_id, skills=skills, total_jobs=total_jobs)


# ── Digital Twin Profile ────────────────────────────────────────────────────────

@router.get(
    "/users/{user_id}/digital-twin",
    response_model=DigitalTwinProfileResponse,
    tags=["analytics"],
    summary="Get everything stored in the user's Digital Twin (full transparency)",
)
async def get_digital_twin_profile(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Returns all six human-layer node types stored for a user:
    Anecdote, Motivation, Value, Goal, CultureIdentity, BehavioralInsight.

    Designed for the "What We Know About You" transparency page — every field
    the AI has inferred about the user as a person is surfaced here verbatim.
    """
    anecdote_rows = await db.run_query(
        """
        MATCH (u:User {id: $user_id})-[:HAS_ANECDOTE]->(a:Anecdote)
        RETURN
            a.name              AS name,
            a.situation         AS situation,
            a.task              AS task,
            a.action            AS action,
            a.result            AS result,
            a.lesson_learned    AS lesson_learned,
            a.emotion_valence   AS emotion_valence,
            a.confidence_signal AS confidence_signal,
            a.spontaneous       AS spontaneous
        ORDER BY a.name ASC
        """,
        {"user_id": user_id},
    )

    motivation_rows = await db.run_query(
        """
        MATCH (u:User {id: $user_id})-[:MOTIVATED_BY]->(m:Motivation)
        RETURN
            m.name     AS name,
            m.category AS category,
            m.strength AS strength,
            m.evidence AS evidence
        ORDER BY
            CASE m.strength WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
            m.name ASC
        """,
        {"user_id": user_id},
    )

    value_rows = await db.run_query(
        """
        MATCH (u:User {id: $user_id})-[:HOLDS_VALUE]->(v:Value)
        RETURN
            v.name          AS name,
            v.priority_rank AS priority_rank,
            v.evidence      AS evidence
        ORDER BY coalesce(v.priority_rank, 999) ASC, v.name ASC
        """,
        {"user_id": user_id},
    )

    goal_rows = await db.run_query(
        """
        MATCH (u:User {id: $user_id})-[:ASPIRES_TO]->(g:Goal)
        RETURN
            g.name            AS name,
            g.type            AS type,
            g.description     AS description,
            g.timeframe_years AS timeframe_years,
            g.clarity_level   AS clarity_level
        ORDER BY coalesce(g.timeframe_years, 999) ASC, g.name ASC
        """,
        {"user_id": user_id},
    )

    culture_rows = await db.run_query(
        """
        MATCH (u:User {id: $user_id})-[:HAS_CULTURE_IDENTITY]->(c:CultureIdentity)
        RETURN
            c.name                              AS name,
            c.team_size_preference              AS team_size_preference,
            c.leadership_style                  AS leadership_style,
            c.conflict_style                    AS conflict_style,
            c.feedback_preference               AS feedback_preference,
            c.pace_preference                   AS pace_preference,
            c.energy_sources                    AS energy_sources,
            c.energy_drains                     AS energy_drains,
            c.communication_style               AS communication_style,
            c.self_reference_pattern            AS self_reference_pattern,
            c.story_framing                     AS story_framing,
            c.uncertainty_response              AS uncertainty_response,
            c.depth_signal                      AS depth_signal,
            c.conversation_signals_summary      AS conversation_signals_summary,
            c.conversation_signals_inferred_at  AS conversation_signals_inferred_at
        """,
        {"user_id": user_id},
    )

    behavior_rows = await db.run_query(
        """
        MATCH (u:User {id: $user_id})-[:HAS_BEHAVIORAL_INSIGHT]->(b:BehavioralInsight)
        RETURN
            b.name            AS name,
            b.insight_type    AS insight_type,
            b.trigger         AS trigger,
            b.response_pattern AS response_pattern,
            b.implication     AS implication
        ORDER BY b.name ASC
        """,
        {"user_id": user_id},
    )

    def _safe_list(val):
        import json as _json
        if val is None:
            return None
        if isinstance(val, list):
            # Each element might itself be a JSON string — flatten if so
            result = []
            for item in val:
                if isinstance(item, str):
                    try:
                        parsed = _json.loads(item)
                        if isinstance(parsed, list):
                            result.extend(parsed)
                        else:
                            result.append(item)
                    except (ValueError, TypeError):
                        result.append(item)
                else:
                    result.append(item)
            return result or None
        if isinstance(val, str):
            try:
                parsed = _json.loads(val)
                return parsed if isinstance(parsed, list) else [val]
            except (ValueError, TypeError):
                return [val]
        return [val]

    return DigitalTwinProfileResponse(
        user_id=user_id,
        anecdotes=[
            DigitalTwinAnecdote(
                name=r["name"],
                situation=r.get("situation"),
                task=r.get("task"),
                action=r.get("action"),
                result=r.get("result"),
                lesson_learned=r.get("lesson_learned"),
                emotion_valence=r.get("emotion_valence"),
                confidence_signal=r.get("confidence_signal"),
                spontaneous=r.get("spontaneous"),
            )
            for r in anecdote_rows
        ],
        motivations=[
            DigitalTwinMotivation(
                name=r["name"],
                category=r.get("category"),
                strength=r.get("strength"),
                evidence=r.get("evidence"),
            )
            for r in motivation_rows
        ],
        values=[
            DigitalTwinValue(
                name=r["name"],
                priority_rank=r.get("priority_rank"),
                evidence=r.get("evidence"),
            )
            for r in value_rows
        ],
        goals=[
            DigitalTwinGoal(
                name=r["name"],
                type=r.get("type"),
                description=r.get("description"),
                timeframe_years=r.get("timeframe_years"),
                clarity_level=r.get("clarity_level"),
            )
            for r in goal_rows
        ],
        culture_identities=[
            DigitalTwinCultureIdentity(
                name=r["name"],
                team_size_preference=r.get("team_size_preference"),
                leadership_style=r.get("leadership_style"),
                conflict_style=r.get("conflict_style"),
                feedback_preference=r.get("feedback_preference"),
                pace_preference=r.get("pace_preference"),
                energy_sources=_safe_list(r.get("energy_sources")),
                energy_drains=_safe_list(r.get("energy_drains")),
                communication_style=r.get("communication_style"),
                self_reference_pattern=r.get("self_reference_pattern"),
                story_framing=r.get("story_framing"),
                uncertainty_response=r.get("uncertainty_response"),
                depth_signal=r.get("depth_signal"),
                conversation_signals_summary=r.get("conversation_signals_summary"),
                conversation_signals_inferred_at=r.get("conversation_signals_inferred_at"),
            )
            for r in culture_rows
        ],
        behavioral_insights=[
            DigitalTwinBehavioralInsight(
                name=r["name"],
                insight_type=r.get("insight_type"),
                trigger=r.get("trigger"),
                response_pattern=r.get("response_pattern"),
                implication=r.get("implication"),
            )
            for r in behavior_rows
        ],
    )


# ── Job Tag Management ─────────────────────────────────────────────────────────

@router.post(
    "/jobs/{job_id}/retag",
    tags=["tags"],
    summary="Re-extract semantic tags for a job",
)
async def retag_job(
    job_id: str,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Re-run LLM tag extraction for an existing job posting.

    Uses the stored raw_text if available (set during ingest). For jobs ingested
    before tag support was added, reconstructs a description from the extracted
    skill/domain/culture graph data and runs tag extraction on that.

    Useful for:
    - Jobs ingested before the tagging feature was added
    - Refreshing tags after the job graph has been edited
    """
    extractor = JobTagExtractor(db)
    tags = await extractor.retag_job(job_id)
    if not tags and not await db.run_query("MATCH (j:Job {id: $id}) RETURN j.id", {"id": job_id}):
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return {"job_id": job_id, "tags": tags, "count": len(tags)}


@router.post(
    "/jobs/retag-all",
    tags=["tags"],
    summary="Re-tag all untagged jobs (bulk)",
)
async def retag_all_untagged_jobs(
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Re-tag all jobs that currently have no semantic tags.

    Processes every Job node where j.tags is null or empty.
    Use this once after deploying the analytics feature to backfill tags
    for existing job postings.
    """
    extractor = JobTagExtractor(db)
    results = await extractor.retag_all_untagged()
    total_tagged = sum(1 for tags in results.values() if tags)
    return {
        "jobs_processed": len(results),
        "jobs_tagged": total_tagged,
        "results": results,
    }


@router.post(
    "/jobs/backfill-tag-categories",
    tags=["tags"],
    summary="Backfill missing categories on existing JobTag nodes",
)
async def backfill_tag_categories(
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    One-time migration: classify all JobTag nodes that have no category set.
    Uses keyword-based classification. Safe to re-run — uses coalesce so
    already-categorised tags are not overwritten.
    """
    from services.job_tag_extractor import _classify_tag

    rows = await db.run_query(
        "MATCH (t:JobTag) WHERE t.category IS NULL RETURN t.name AS name"
    )
    updated = 0
    for row in rows:
        name = row.get("name") or ""
        if not name:
            continue
        category = _classify_tag(name)
        await db.run_write(
            "MATCH (t:JobTag {name: $name}) SET t.category = $category",
            {"name": name, "category": category},
        )
        updated += 1
    return {"tags_backfilled": updated}


@router.post(
    "/jobs/extract-team-culture",
    tags=["jobs"],
    summary="Backfill TeamCultureIdentity for one job at a time (call repeatedly)",
)
async def extract_team_culture_bulk(
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Processes ONE job per call to stay within LLM output token rate limits.
    Re-run until jobs_remaining reaches 0. Already-processed jobs are skipped.
    """
    rows = await db.run_query(
        """
        MATCH (j:Job)
        WHERE j.raw_text IS NOT NULL AND j.raw_text <> ''
          AND NOT (j)-[:HAS_TEAM_CULTURE]->(:TeamCultureIdentity)
          AND j.team_culture_attempted IS NULL
        RETURN j.id AS job_id, j.raw_text AS raw_text
        LIMIT 50
        """
    )
    if not rows:
        return {"jobs_processed": 0, "jobs_remaining": 0, "message": "All jobs already have TeamCultureIdentity"}

    remaining_count = len(rows)
    row = rows[0]
    job_id = row.get("job_id")
    raw_text = row.get("raw_text") or ""

    if not job_id or not raw_text:
        return {"jobs_processed": 0, "jobs_remaining": remaining_count - 1, "skipped": job_id}

    ingestion = LLMIngestionService(db)
    extraction_svc = LLMExtractionService()

    try:
        extraction = await extraction_svc.extract_job_posting(raw_text)
        if extraction and extraction.team_culture:
            await ingestion._ingest_job_team_culture(job_id, extraction.team_culture)
            return {"jobs_processed": 1, "jobs_remaining": remaining_count - 1, "job_id": job_id}
        else:
            # Mark as attempted so we don't loop on jobs with no culture signal
            await db.run_write(
                "MATCH (j:Job {id: $id}) SET j.team_culture_attempted = true",
                {"id": job_id},
            )
            return {"jobs_processed": 0, "jobs_remaining": remaining_count - 1, "job_id": job_id, "note": "no culture signal extracted"}
    except Exception as e:
        logger.warning(f"extract-team-culture: failed for job {job_id}: {e}")
        return {"jobs_processed": 0, "jobs_remaining": remaining_count - 1, "job_id": job_id, "error": str(e)}


@router.post(
    "/users/{user_id}/infer-culture-from-stories",
    tags=["users"],
    summary="Infer culture identity from user's anecdotes, motivations, values, and goals",
)
async def infer_culture_from_stories(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite),
):
    """
    Reads the user's stored stories (Anecdotes, Motivations, Values, Goals) from the graph
    and infers culture preferences from their content. Fills pace_preference,
    feedback_preference, leadership_style, team_size_preference, energy_sources/drains.
    Uses coalesce — won't overwrite signals already captured via conversation.
    """
    from services.culture_inference import CultureInferenceService
    svc = CultureInferenceService(db, sqlite)
    performed = await svc.infer_from_stories(user_id)
    return {"inferred": performed, "user_id": user_id}


@router.post(
    "/users/backfill-culture-from-stories",
    tags=["users"],
    summary="Bulk backfill culture identity from stories for all users",
)
async def backfill_culture_from_stories(
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite),
):
    """
    Runs story-based culture inference for all users who have anecdotes/stories
    but no culture identity yet (or missing scoring fields).
    Processes one user per call to avoid LLM rate limits — re-run until done.
    """
    from services.culture_inference import CultureInferenceService

    rows = await db.run_query(
        """
        MATCH (u:User)-[:HAS_ANECDOTE|MOTIVATED_BY|HOLDS_VALUE|ASPIRES_TO]->()
        WHERE NOT EXISTS {
          MATCH (u)-[:HAS_CULTURE_IDENTITY]->(c:CultureIdentity)
          WHERE c.pace_preference IS NOT NULL
             OR c.feedback_preference IS NOT NULL
             OR c.leadership_style IS NOT NULL
             OR c.story_signals_inferred_at IS NOT NULL
        }
        RETURN DISTINCT u.id AS user_id
        LIMIT 50
        """
    )

    if not rows:
        return {"users_processed": 0, "users_remaining": 0, "message": "All users already have story-inferred culture signals"}

    remaining = len(rows)
    user_id = rows[0].get("user_id")
    if not user_id:
        return {"users_processed": 0, "users_remaining": remaining - 1}

    svc = CultureInferenceService(db, sqlite)
    try:
        performed = await svc.infer_from_stories(user_id)
        return {"users_processed": 1 if performed else 0, "users_remaining": remaining - 1, "user_id": user_id}
    except Exception as e:
        logger.warning(f"backfill-culture-from-stories: failed for user {user_id}: {e}")
        return {"users_processed": 0, "users_remaining": remaining - 1, "user_id": user_id, "error": str(e)}
