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
    RecordEventRequest,
    RejectMutationsRequest,
    RelinkMatchesResponse,
    ResolveFlagRequest,
    ResolveFlagResponse,
    RollbackResponse,
    SendMessageRequest,
    StartEditRequest,
    UserApplication,
    UserApplicationsResponse,
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
from services.visualization import VisualizationService

logger = logging.getLogger(__name__)
router = APIRouter()


def get_neo4j() -> Neo4jClient:
    return get_client()


def get_sqlite_db() -> SQLiteClient:
    return get_sqlite()


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

    Returns results ranked by total_score (descending).

    Score breakdown:
      - skill_score      (50%): weighted intersection of user skills ∩ job requirements
      - domain_score     (25%): set intersection of domains
      - culture_score    (15%): work-style preference alignment
      - preference_score (10%): remote policy match

    Every score component is traceable via graph paths at /matches/{job_id}/paths.
    """
    analytics = AnalyticsService(sqlite, db)
    engine = MatchingEngine(db, analytics_service=analytics)
    return await engine.rank_all_jobs_for_user(user_id)


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
            missing_skills=result.missing_skills,
            matched_domains=result.matched_domains,
            missing_domains=result.missing_domains,
            paths=path_strings,
            perspective=perspective,
            rich_context=rich_context,
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
        return await svc.apply_mutations(request.session_id, request.mutations)
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
        return await svc.resolve_flag(
            user_id=user_id,
            flag_id=flag_id,
            is_correct=request.is_correct,
            user_answer=request.user_answer,
            correction=request.correction,
        )
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


# ── Admin ──────────────────────────────────────────────────────────────────────

@router.delete("/users/{user_id}", tags=["admin"], summary="Delete a user and all their data")
async def delete_user(user_id: str, db: Neo4jClient = Depends(get_neo4j)):
    """Cascade-delete the User node and every node owned by this user (skills,
    domains, projects, experiences, preferences, patterns) plus all MATCHES edges.
    Also removes any cached visualization HTML files."""
    await db.run_write(
        """
        MATCH (n)
        WHERE (n:User AND n.id = $user_id) OR n.user_id = $user_id
        DETACH DELETE n
        """,
        {"user_id": user_id},
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
    "/admin/relink-matches",
    response_model=RelinkMatchesResponse,
    tags=["admin"],
    summary="Refresh semantic MATCHES edges for one scope or the whole graph",
)
async def relink_matches(
    scope: Literal["all", "user", "job"] = "all",
    entity_id: str | None = None,
    regenerate_visualizations: bool = False,
    db: Neo4jClient = Depends(get_neo4j),
):
    """
    Rebuild semantic MATCHES edges without re-ingesting source documents.

    Scope options:
      - all: relink every user and job currently in Neo4j
      - user: relink one user's skill/domain matches to all jobs
      - job: relink one job's skill/domain matches against all users

    Set regenerate_visualizations=true to also rebuild cached graph HTML files
    for the processed entities after relinking.
    """
    if scope in {"user", "job"} and not entity_id:
        raise HTTPException(
            status_code=400,
            detail="entity_id is required when scope is 'user' or 'job'",
        )

    ingestor = LLMIngestionService(db)
    viz = VisualizationService(db)
    users_processed = 0
    jobs_processed = 0
    skill_matches_linked = 0
    domain_matches_linked = 0
    visualizations_regenerated = 0

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

    async def _relink_user(user_id: str) -> None:
        nonlocal users_processed, skill_matches_linked, domain_matches_linked
        nonlocal visualizations_regenerated

        counts = await ingestor.relink_user_matches(user_id)
        users_processed += 1
        skill_matches_linked += counts["skill_matches_linked"]
        domain_matches_linked += counts["domain_matches_linked"]
        if regenerate_visualizations:
            await viz.generate_user_graph(user_id)
            visualizations_regenerated += 1

    async def _relink_job(job_id: str) -> None:
        nonlocal jobs_processed, skill_matches_linked, domain_matches_linked
        nonlocal visualizations_regenerated

        counts = await ingestor.relink_job_matches(job_id)
        jobs_processed += 1
        skill_matches_linked += counts["skill_matches_linked"]
        domain_matches_linked += counts["domain_matches_linked"]
        if regenerate_visualizations:
            await viz.generate_job_graph(job_id)
            visualizations_regenerated += 1

    try:
        if scope == "user":
            if not await _user_exists(entity_id):
                raise HTTPException(status_code=404, detail=f"User '{entity_id}' not found")
            await _relink_user(entity_id)
        elif scope == "job":
            if not await _job_exists(entity_id):
                raise HTTPException(status_code=404, detail=f"Job '{entity_id}' not found")
            await _relink_job(entity_id)
        else:
            user_rows = await db.run_query("MATCH (u:User) RETURN u.id AS id ORDER BY u.id")
            job_rows = await db.run_query("MATCH (j:Job) RETURN j.id AS id ORDER BY j.id")
            for row in user_rows:
                if row.get("id"):
                    await _relink_user(row["id"])
            for row in job_rows:
                if row.get("id"):
                    await _relink_job(row["id"])
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Semantic relink failed for scope={scope} entity_id={entity_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return RelinkMatchesResponse(
        status="relinked",
        scope=scope,
        entity_id=entity_id,
        users_processed=users_processed,
        jobs_processed=jobs_processed,
        skill_matches_linked=skill_matches_linked,
        domain_matches_linked=domain_matches_linked,
        visualizations_regenerated=visualizations_regenerated,
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
