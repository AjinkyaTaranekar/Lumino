"""FastAPI routes for the interview practice feature.

All routes are mounted at /api/v1/practice in main.py.

Endpoints:
  POST /sessions/start                      - start a new practice session
  POST /sessions/{session_id}/message       - send a candidate message, get AI turn
  POST /sessions/{session_id}/complete      - generate and return the scorecard
  GET  /sessions/{session_id}/history       - full message history
  GET  /users/{user_id}/sessions            - list all sessions for a user
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from database.neo4j_client import Neo4jClient, get_client
from database.sqlite_client import SQLiteClient, get_sqlite
from models.practice_schemas import (
    CompletePracticeRequest,
    InterviewTurn,
    PracticeHistoryResponse,
    PracticeMessageRequest,
    PracticeScorecard,
    StartPracticeRequest,
    StartPracticeResponse,
    UserPracticeSessionsResponse,
)
from services.practice_session_service import PracticeSessionService

logger = logging.getLogger(__name__)
practice_router = APIRouter()


def get_neo4j() -> Neo4jClient:
    return get_client()


def get_sqlite_db() -> SQLiteClient:
    return get_sqlite()


@practice_router.post(
    "/sessions/start",
    response_model=StartPracticeResponse,
    tags=["practice"],
    summary="Start a new practice interview session",
)
async def start_practice_session(
    request: StartPracticeRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    try:
        service = PracticeSessionService(db, sqlite)
        return await service.start_session(request.user_id, request.job_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to start practice session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@practice_router.post(
    "/sessions/{session_id}/message",
    response_model=InterviewTurn,
    tags=["practice"],
    summary="Send a candidate message and receive the next interview turn",
)
async def send_practice_message(
    session_id: str,
    request: PracticeMessageRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    try:
        service = PracticeSessionService(db, sqlite)
        return await service.send_message(session_id, request.user_id, request.content)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to process practice message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@practice_router.post(
    "/sessions/{session_id}/complete",
    response_model=PracticeScorecard,
    tags=["practice"],
    summary="Complete the session and generate a scored report card",
)
async def complete_practice_session(
    session_id: str,
    request: CompletePracticeRequest,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    try:
        service = PracticeSessionService(db, sqlite)
        return await service.complete_session(session_id, request.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to generate scorecard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@practice_router.get(
    "/sessions/{session_id}/history",
    response_model=PracticeHistoryResponse,
    tags=["practice"],
    summary="Get full message history for a session",
)
async def get_practice_history(
    session_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    try:
        service = PracticeSessionService(db, sqlite)
        return await service.get_history(session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to get practice history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@practice_router.get(
    "/users/{user_id}/sessions",
    response_model=UserPracticeSessionsResponse,
    tags=["practice"],
    summary="List all practice sessions for a user",
)
async def list_user_practice_sessions(
    user_id: str,
    db: Neo4jClient = Depends(get_neo4j),
    sqlite: SQLiteClient = Depends(get_sqlite_db),
):
    try:
        service = PracticeSessionService(db, sqlite)
        return await service.list_user_sessions(user_id)
    except Exception as e:
        logger.exception(f"Failed to list practice sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
