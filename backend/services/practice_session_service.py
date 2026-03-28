"""
PracticeSessionService - Orchestrates practice interview sessions.

Session lifecycle:
  start_session    → creates SQLite row, calls agent for opening, returns StartPracticeResponse
  send_message     → appends to history, calls agent for next turn, returns InterviewTurn
  complete_session → calls agent for scorecard, persists to practice_scorecards
  get_history      → returns full message history for a session
  list_user_sessions → returns all sessions for a user with job metadata
"""

import json
import logging
import uuid
from datetime import datetime, timezone

from database.neo4j_client import Neo4jClient
from database.sqlite_client import SQLiteClient
from models.practice_schemas import (
    InterviewTurn,
    PracticeHistoryResponse,
    PracticeMessageHistory,
    PracticeScorecard,
    PracticeSessionSummary,
    StartPracticeResponse,
    UserPracticeSessionsResponse,
)
from services.practice_interview_agent import PracticeInterviewAgent

logger = logging.getLogger(__name__)


class PracticeSessionService:
    def __init__(self, neo4j: Neo4jClient, sqlite: SQLiteClient):
        self.neo4j = neo4j
        self.sqlite = sqlite
        self.agent = PracticeInterviewAgent(neo4j, sqlite)

    async def start_session(self, user_id: str, job_id: str) -> StartPracticeResponse:
        """Create a new practice session and return the AI's opening message."""
        # Fetch job metadata for the response
        job_rows = await self.neo4j.run_query(
            "MATCH (j:Job {id: $id}) RETURN j.title AS title, j.company AS company",
            {"id": job_id},
        )
        if not job_rows:
            raise ValueError(f"Job '{job_id}' not found")

        job_title = job_rows[0].get("title") or "the role"
        company = job_rows[0].get("company") or "the company"

        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Insert session row (core_questions filled after agent call)
        await self.sqlite.execute(
            """
            INSERT INTO practice_sessions
                (session_id, user_id, job_id, phase, question_index, started_at, last_active)
            VALUES (?, ?, ?, 'intro', 0, ?, ?)
            """,
            (session_id, user_id, job_id, now, now),
        )

        # Get opening message + core questions from agent
        turn, core_questions = await self.agent.get_opening_message(session_id, user_id, job_id)

        # Persist core questions
        await self.sqlite.execute(
            "UPDATE practice_sessions SET core_questions = ? WHERE session_id = ?",
            (json.dumps(core_questions), session_id),
        )

        logger.info(f"Practice session started: {session_id} for user={user_id} job={job_id}")
        return StartPracticeResponse(
            session_id=session_id,
            opening_message=turn.ai_response,
            interviewer_persona=turn.interviewer_persona,
            phase=turn.phase,
            core_questions_count=len(core_questions),
            job_title=job_title,
            company=company,
        )

    async def send_message(
        self, session_id: str, user_id: str, content: str
    ) -> InterviewTurn:
        """Process a candidate message and advance the interview."""
        session = await self._get_session(session_id)
        if session["user_id"] != user_id:
            raise PermissionError("Session does not belong to this user")

        current_phase = session["phase"]
        job_id = session["job_id"]

        turn = await self.agent.send_message(session_id, user_id, job_id, content, current_phase)

        # Update session phase if it changed
        updates = {"last_active": datetime.now(timezone.utc).isoformat()}
        if turn.phase_changed and turn.phase != current_phase:
            updates["phase"] = turn.phase
            logger.info(f"Session {session_id} phase advanced: {current_phase} → {turn.phase}")

        # Build SET clause dynamically
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await self.sqlite.execute(
            f"UPDATE practice_sessions SET {set_clause} WHERE session_id = ?",
            (*updates.values(), session_id),
        )
        return turn

    async def complete_session(self, session_id: str, user_id: str) -> PracticeScorecard:
        """Generate and persist the final scorecard for this session."""
        session = await self._get_session(session_id)
        if session["user_id"] != user_id:
            raise PermissionError("Session does not belong to this user")

        scorecard = await self.agent.generate_scorecard(session_id, session["job_id"], user_id)
        now = datetime.now(timezone.utc).isoformat()

        await self.sqlite.execute(
            """
            INSERT OR REPLACE INTO practice_scorecards
                (session_id, scores, strengths, gaps, recommendation, generated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                json.dumps(scorecard.scores.model_dump()),
                json.dumps(scorecard.strengths),
                json.dumps(scorecard.gaps),
                scorecard.recommendation,
                now,
            ),
        )
        await self.sqlite.execute(
            "UPDATE practice_sessions SET last_active = ?, phase = 'closing' WHERE session_id = ?",
            (now, session_id),
        )
        logger.info(f"Scorecard generated for session {session_id}: {scorecard.recommendation}")
        return scorecard

    async def get_history(self, session_id: str) -> PracticeHistoryResponse:
        """Return full message history for a session."""
        session = await self._get_session(session_id)
        rows = await self.sqlite.fetchall(
            "SELECT role, content, interviewer_persona, phase FROM practice_messages "
            "WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        )
        core_questions = json.loads(session.get("core_questions") or "[]")
        return PracticeHistoryResponse(
            session_id=session_id,
            phase=session["phase"],
            question_index=session["question_index"],
            core_questions_count=len(core_questions),
            messages=[
                PracticeMessageHistory(
                    role=row["role"],
                    content=row["content"],
                    interviewer_persona=row.get("interviewer_persona"),
                    phase=row.get("phase"),
                )
                for row in rows
            ],
        )

    async def list_user_sessions(self, user_id: str) -> UserPracticeSessionsResponse:
        """Return all practice sessions for a user, with job metadata."""
        rows = await self.sqlite.fetchall(
            """
            SELECT session_id, job_id, phase, started_at, last_active
            FROM practice_sessions
            WHERE user_id = ?
            ORDER BY last_active DESC
            """,
            (user_id,),
        )
        sessions = []
        for row in rows:
            job_rows = await self.neo4j.run_query(
                "MATCH (j:Job {id: $id}) RETURN j.title AS title, j.company AS company",
                {"id": row["job_id"]},
            )
            job_meta = job_rows[0] if job_rows else {}
            scorecard_row = await self.sqlite.fetchone(
                "SELECT 1 FROM practice_scorecards WHERE session_id = ?",
                (row["session_id"],),
            )
            sessions.append(
                PracticeSessionSummary(
                    session_id=row["session_id"],
                    job_id=row["job_id"],
                    job_title=job_meta.get("title") or "Unknown Role",
                    company=job_meta.get("company"),
                    phase=row["phase"],
                    started_at=row["started_at"],
                    last_active=row["last_active"],
                    has_scorecard=scorecard_row is not None,
                )
            )
        return UserPracticeSessionsResponse(user_id=user_id, sessions=sessions)

    async def _get_session(self, session_id: str) -> dict:
        row = await self.sqlite.fetchone(
            "SELECT * FROM practice_sessions WHERE session_id = ?", (session_id,)
        )
        if not row:
            raise ValueError(f"Practice session '{session_id}' not found")
        return row
