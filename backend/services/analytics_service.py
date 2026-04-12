"""
Analytics service — event recording and interest profile derivation.

Records user interaction events (views, likes, dislikes, bookmarks, applies)
and derives a per-tag interest profile used for hybrid recommendation scoring.

Interest score per tag:
  raw_score = SUM(event_weight × time_decay) for all events touching a job with that tag
  time_decay = exp(-λ × days_ago),  λ = 0.05 (half-life ≈ 14 days)
  final_score clamped to [-1.0, 1.0] and then normalised to [0.0, 1.0] for display

The interest profile is stored in Neo4j as:
  (User)-[:HAS_INTEREST {score, raw_score, interaction_count, last_updated}]->(JobTag)
"""

import json
import logging
import math
from datetime import datetime, timezone

import aiosqlite

from database.neo4j_client import Neo4jClient
from database.sqlite_client import SQLiteClient
from models.taxonomies import ANALYTICS_EVENT_WEIGHTS, AnalyticsEventType

logger = logging.getLogger(__name__)

# Time-decay lambda: score halves every ~14 days
_DECAY_LAMBDA = 0.05

# Score clamping bounds before normalisation
_RAW_MIN = -10.0
_RAW_MAX =  10.0


def _time_decay(days_ago: float) -> float:
    return math.exp(-_DECAY_LAMBDA * max(days_ago, 0.0))


class AnalyticsService:
    """Records events and maintains per-user tag interest profiles."""

    def __init__(self, sqlite: SQLiteClient, neo4j: Neo4jClient):
        self.sqlite = sqlite
        self.neo4j = neo4j

    # ──────────────────────────────────────────────────────────────────────────
    # EVENT RECORDING
    # ──────────────────────────────────────────────────────────────────────────

    async def record_event(
        self,
        user_id: str,
        job_id: str,
        event_type: str,
        duration_ms: int | None = None,
    ) -> None:
        """
        Record a single user interaction event.
        Fetches job tags from Neo4j and stores them with the event for future replay.
        Triggers an async interest profile recomputation.
        """
        if event_type not in ANALYTICS_EVENT_WEIGHTS:
            raise ValueError(f"Unknown event_type: {event_type!r}")

        # Fetch current tags on the job
        rows = await self.neo4j.run_query(
            "MATCH (j:Job {id: $job_id}) RETURN coalesce(j.tags, []) AS tags",
            {"job_id": job_id},
        )
        job_tags: list[str] = rows[0]["tags"] if rows else []

        now_iso = datetime.now(timezone.utc).isoformat()
        await self.sqlite.execute(
            """
            INSERT INTO analytics_events
                (user_id, job_id, event_type, job_tags, duration_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, job_id, event_type, json.dumps(job_tags), duration_ms, now_iso),
        )
        logger.info(f"Event recorded: {user_id} {event_type} {job_id} tags={job_tags}")

        # Recompute interest profile after every event
        await self.recompute_interest_profile(user_id)

    # ──────────────────────────────────────────────────────────────────────────
    # INTEREST PROFILE RECOMPUTATION
    # ──────────────────────────────────────────────────────────────────────────

    async def recompute_interest_profile(self, user_id: str) -> dict[str, float]:
        """
        Recompute and persist the user's tag interest scores from all recorded events.
        Returns a mapping of tag → normalised_score (0.0 – 1.0).
        """
        rows = await self.sqlite.fetchall(
            """
            SELECT event_type, job_tags, created_at
            FROM analytics_events
            WHERE user_id = ?
            ORDER BY created_at ASC
            """,
            (user_id,),
        )

        if not rows:
            return {}

        now = datetime.now(timezone.utc)
        raw_scores: dict[str, float] = {}
        interaction_counts: dict[str, int] = {}

        for row in rows:
            weight = ANALYTICS_EVENT_WEIGHTS.get(row["event_type"], 0.0)
            if weight == 0.0:
                continue

            tags: list[str] = json.loads(row["job_tags"] or "[]")
            if not tags:
                continue

            try:
                event_time = datetime.fromisoformat(row["created_at"])
                if event_time.tzinfo is None:
                    event_time = event_time.replace(tzinfo=timezone.utc)
                days_ago = (now - event_time).total_seconds() / 86400
            except ValueError:
                days_ago = 0.0

            decayed_weight = weight * _time_decay(days_ago)

            for tag in tags:
                raw_scores[tag] = raw_scores.get(tag, 0.0) + decayed_weight
                if weight > 0:  # only count positive interactions
                    interaction_counts[tag] = interaction_counts.get(tag, 0) + 1

        if not raw_scores:
            return {}

        # Clamp and normalise to [0, 1] for storage
        normalised: dict[str, float] = {}
        for tag, raw in raw_scores.items():
            clamped = max(_RAW_MIN, min(_RAW_MAX, raw))
            # Shift from [-10, 10] → [0, 1]
            normalised[tag] = round((clamped - _RAW_MIN) / (_RAW_MAX - _RAW_MIN), 4)

        # Persist to Neo4j
        await self._write_interest_profile(user_id, normalised, interaction_counts)

        return normalised

    async def _write_interest_profile(
        self,
        user_id: str,
        scores: dict[str, float],
        interaction_counts: dict[str, int],
    ) -> None:
        """Write per-tag interest scores as HAS_INTEREST edges in Neo4j."""
        now_iso = datetime.now(timezone.utc).isoformat()

        # Remove stale interests not in the current score set (skip manual overrides)
        await self.neo4j.run_write(
            """
            MATCH (u:User {id: $user_id})-[r:HAS_INTEREST]->(t:JobTag)
            WHERE NOT t.name IN $tag_names AND NOT coalesce(r.manual_override, false)
            DELETE r
            """,
            {"user_id": user_id, "tag_names": list(scores.keys())},
        )

        from services.job_tag_extractor import _classify_tag

        for tag, score in scores.items():
            count = interaction_counts.get(tag, 0)
            confidence = (
                "high"   if count >= 10 else
                "medium" if count >= 3  else
                "low"
            )
            await self.neo4j.run_write(
                """
                MATCH (u:User {id: $user_id})
                MERGE (t:JobTag {name: $tag})
                // Backfill category on existing tags that lack one
                SET t.category = coalesce(t.category, $category)
                WITH t
                MERGE (u)-[r:HAS_INTEREST]->(t)
                // Only update if not a manual override
                WITH r WHERE NOT coalesce(r.manual_override, false)
                SET r.score             = $score,
                    r.interaction_count = $count,
                    r.confidence        = $confidence,
                    r.last_updated      = $now
                """,
                {
                    "user_id":  user_id,
                    "tag":      tag,
                    "category": _classify_tag(tag),
                    "score":    score,
                    "count":    count,
                    "confidence": confidence,
                    "now":      now_iso,
                },
            )

    # ──────────────────────────────────────────────────────────────────────────
    # READ INTEREST PROFILE
    # ──────────────────────────────────────────────────────────────────────────

    async def get_interest_profile(self, user_id: str) -> list[dict]:
        """
        Return the user's interest profile as a list of tag entries,
        sorted by score descending.
        """
        rows = await self.neo4j.run_query(
            """
            MATCH (u:User {id: $user_id})-[r:HAS_INTEREST]->(t:JobTag)
            RETURN t.name       AS tag,
                   t.category   AS category,
                   r.score      AS score,
                   r.interaction_count AS interaction_count,
                   r.confidence AS confidence,
                   r.last_updated AS last_updated
            ORDER BY r.score DESC
            """,
            {"user_id": user_id},
        )
        return [dict(r) for r in rows]

    # ──────────────────────────────────────────────────────────────────────────
    # EXPLICIT USER CONTROLS
    # ──────────────────────────────────────────────────────────────────────────

    async def adjust_interest(self, user_id: str, tag: str, score: float) -> None:
        """
        Manually set the interest score for a tag, overriding analytics derivation.
        Marks the override so it won't be erased by next recomputation.
        """
        from services.job_tag_extractor import _classify_tag
        now_iso = datetime.now(timezone.utc).isoformat()
        await self.neo4j.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (t:JobTag {name: $tag})
            SET t.category = coalesce(t.category, $category)
            WITH t
            MERGE (u)-[r:HAS_INTEREST]->(t)
            SET r.score           = $score,
                r.manual_override = true,
                r.last_updated    = $now,
                r.confidence      = $confidence
            """,
            {
                "user_id":  user_id,
                "tag":      tag,
                "category": _classify_tag(tag),
                "score":    round(score, 4),
                "confidence": "high",
                "now":      now_iso,
            },
        )
        logger.info(f"Manual interest override: {user_id} {tag} → {score}")

    async def remove_interest(self, user_id: str, tag: str) -> None:
        """
        Remove a tag from the user's interest profile entirely.
        Future analytics events can rebuild it from scratch.
        """
        await self.neo4j.run_write(
            """
            MATCH (u:User {id: $user_id})-[r:HAS_INTEREST]->(t:JobTag {name: $tag})
            DELETE r
            """,
            {"user_id": user_id, "tag": tag},
        )
        logger.info(f"Interest removed: {user_id} {tag}")

    async def compute_interest_score_for_job(
        self, user_id: str, job_tags: list[str]
    ) -> float:
        """
        Compute a 0–1 interest score for a specific job given the user's interest profile.
        Uses dot product of job tag presence × user interest scores.
        Returns 0.5 (neutral) when no interest profile exists.
        """
        if not job_tags:
            return 0.5

        rows = await self.neo4j.run_query(
            """
            MATCH (u:User {id: $user_id})-[r:HAS_INTEREST]->(t:JobTag)
            WHERE t.name IN $tags
            RETURN t.name AS tag, r.score AS score
            """,
            {"user_id": user_id, "tags": job_tags},
        )

        if not rows:
            return 0.5  # no history → neutral

        total_possible = len(job_tags)
        matched_score = sum(row["score"] for row in rows)
        # Average over all job tags (missing tags contribute 0.5 neutral)
        unmatched_count = total_possible - len(rows)
        neutral_contribution = unmatched_count * 0.5
        return round((matched_score + neutral_contribution) / total_possible, 4)
