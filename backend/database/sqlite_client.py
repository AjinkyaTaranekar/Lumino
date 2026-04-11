"""SQLite client - persistence for edit sessions, message history, and graph snapshots."""

import json
import logging
import os
from datetime import datetime, timedelta

import aiosqlite

logger = logging.getLogger(__name__)

# Module-level singleton
_sqlite: "SQLiteClient | None" = None


class SQLiteClient:
    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

    async def init_schema(self) -> None:
        """Create all tables if they do not already exist."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.executescript(
                """
                CREATE TABLE IF NOT EXISTS edit_sessions (
                    session_id   TEXT PRIMARY KEY,
                    entity_type  TEXT NOT NULL,
                    entity_id    TEXT NOT NULL,
                    recruiter_id TEXT,
                    started_at   TEXT NOT NULL,
                    last_active  TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS session_messages (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id    TEXT NOT NULL REFERENCES edit_sessions(session_id),
                    role          TEXT NOT NULL,
                    content       TEXT NOT NULL,
                    proposal_json TEXT,
                    created_at    TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS graph_snapshots (
                    version_id    TEXT PRIMARY KEY,
                    entity_type   TEXT NOT NULL,
                    entity_id     TEXT NOT NULL,
                    session_id    TEXT REFERENCES edit_sessions(session_id),
                    label         TEXT NOT NULL,
                    snapshot_json TEXT NOT NULL,
                    created_at    TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS extraction_flags (
                    flag_id               TEXT PRIMARY KEY,
                    user_id               TEXT NOT NULL,
                    field                 TEXT NOT NULL,
                    raw_text              TEXT NOT NULL,
                    interpreted_as        TEXT NOT NULL,
                    confidence            TEXT NOT NULL,
                    ambiguity_reason      TEXT NOT NULL,
                    clarification_question TEXT NOT NULL,
                    resolution_impact     TEXT NOT NULL,
                    suggested_options     TEXT,
                    status                TEXT NOT NULL DEFAULT 'pending',
                    user_answer           TEXT,
                    correction_applied    TEXT,
                    created_at            TEXT NOT NULL,
                    resolved_at           TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_extraction_flags_user
                    ON extraction_flags(user_id, status);

                CREATE TABLE IF NOT EXISTS analytics_events (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id         TEXT    NOT NULL,
                    job_id          TEXT    NOT NULL,
                    event_type      TEXT    NOT NULL,
                    job_tags        TEXT    NOT NULL DEFAULT '[]',
                    duration_ms     INTEGER,
                    created_at      TEXT    NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_analytics_user
                    ON analytics_events(user_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_analytics_job
                    ON analytics_events(job_id);

                CREATE INDEX IF NOT EXISTS idx_analytics_user_event
                    ON analytics_events(user_id, event_type, created_at);

                CREATE INDEX IF NOT EXISTS idx_analytics_job_event
                    ON analytics_events(job_id, event_type, created_at);

                CREATE TABLE IF NOT EXISTS practice_sessions (
                    session_id        TEXT PRIMARY KEY,
                    user_id           TEXT NOT NULL,
                    job_id            TEXT NOT NULL,
                    phase             TEXT NOT NULL DEFAULT 'intro',
                    question_index    INTEGER NOT NULL DEFAULT 0,
                    core_questions    TEXT,
                    started_at        TEXT NOT NULL,
                    last_active       TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS practice_messages (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id           TEXT NOT NULL REFERENCES practice_sessions(session_id),
                    role                 TEXT NOT NULL,
                    content              TEXT NOT NULL,
                    interviewer_persona  TEXT,
                    phase                TEXT,
                    created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS practice_scorecards (
                    session_id    TEXT PRIMARY KEY REFERENCES practice_sessions(session_id),
                    scores        TEXT NOT NULL,
                    strengths     TEXT NOT NULL,
                    gaps          TEXT NOT NULL,
                    recommendation TEXT NOT NULL,
                    generated_at  TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_practice_sessions_user
                    ON practice_sessions(user_id);

                CREATE TABLE IF NOT EXISTS recruiter_twin_sessions (
                    session_id      TEXT PRIMARY KEY,
                    recruiter_id    TEXT NOT NULL,
                    user_id         TEXT NOT NULL,
                    job_id          TEXT NOT NULL,
                    nightmare_mode  INTEGER NOT NULL DEFAULT 0,
                    context_json    TEXT,
                    started_at      TEXT NOT NULL,
                    last_active     TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_recruiter_twin_sessions_lookup
                    ON recruiter_twin_sessions(recruiter_id, job_id, user_id);

                CREATE TABLE IF NOT EXISTS recruiter_twin_messages (
                    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id              TEXT NOT NULL REFERENCES recruiter_twin_sessions(session_id),
                    role                    TEXT NOT NULL,
                    content                 TEXT NOT NULL,
                    confidence              REAL,
                    evidence_json           TEXT,
                    follow_up_question      TEXT,
                    nightmare_questions_json TEXT,
                    created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_recruiter_twin_messages_session
                    ON recruiter_twin_messages(session_id, id);

                CREATE TABLE IF NOT EXISTS user_cache_versions (
                    user_id    TEXT PRIMARY KEY,
                    version    INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT    NOT NULL
                );

                CREATE TABLE IF NOT EXISTS match_cache (
                    user_id      TEXT NOT NULL,
                    cache_key    TEXT NOT NULL,
                    results_json TEXT NOT NULL,
                    cached_at    TEXT NOT NULL,
                    PRIMARY KEY (user_id, cache_key)
                );
                """
            )
            await db.commit()
        logger.info(f"SQLite schema initialized: {self.db_path}")

    async def execute(self, query: str, params: tuple = ()) -> None:
        """Execute a write query and commit."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(query, params)
            await db.commit()

    async def fetchall(self, query: str, params: tuple = ()) -> list[dict]:
        """Execute a SELECT query and return all rows as a list of dicts."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def fetchone(self, query: str, params: tuple = ()) -> dict | None:
        """Execute a SELECT query and return the first row as a dict, or None."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row is not None else None

    # ── Match cache helpers ────────────────────────────────────────────────────

    async def bump_user_version(self, user_id: str) -> int:
        """Increment the user's cache version. Returns the new version number."""
        now = datetime.utcnow().isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """
                INSERT INTO user_cache_versions (user_id, version, updated_at)
                VALUES (?, 1, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    version    = version + 1,
                    updated_at = excluded.updated_at
                """,
                (user_id, now),
            )
            await db.commit()
            async with db.execute(
                "SELECT version FROM user_cache_versions WHERE user_id = ?",
                (user_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row)["version"] if row else 1

    async def get_user_version(self, user_id: str) -> int:
        """Return the user's current cache version (0 if not yet tracked)."""
        row = await self.fetchone(
            "SELECT version FROM user_cache_versions WHERE user_id = ?",
            (user_id,),
        )
        return row["version"] if row else 0

    async def get_match_cache(self, user_id: str, cache_key: str, ttl_seconds: int = 7200) -> list | None:
        """Return cached match results if the entry exists and is within TTL."""
        row = await self.fetchone(
            "SELECT results_json, cached_at FROM match_cache WHERE user_id = ? AND cache_key = ?",
            (user_id, cache_key),
        )
        if row is None:
            return None
        age = datetime.utcnow() - datetime.fromisoformat(row["cached_at"])
        if age > timedelta(seconds=ttl_seconds):
            return None
        return json.loads(row["results_json"])

    async def set_match_cache(self, user_id: str, cache_key: str, results: list) -> None:
        """Upsert match results into cache."""
        now = datetime.utcnow().isoformat()
        await self.execute(
            """
            INSERT INTO match_cache (user_id, cache_key, results_json, cached_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, cache_key) DO UPDATE SET
                results_json = excluded.results_json,
                cached_at    = excluded.cached_at
            """,
            (user_id, cache_key, json.dumps(results), now),
        )


def get_sqlite() -> SQLiteClient:
    """Return the module-level singleton. Raises if init_sqlite() was never called."""
    if _sqlite is None:
        raise RuntimeError(
            "SQLite client not initialized. Call init_sqlite() at app startup."
        )
    return _sqlite


async def init_sqlite(db_path: str) -> SQLiteClient:
    """Create the singleton SQLite client and initialize the schema."""
    global _sqlite
    _sqlite = SQLiteClient(db_path)
    await _sqlite.init_schema()
    logger.info(f"SQLite client initialized: {db_path}")
    return _sqlite
