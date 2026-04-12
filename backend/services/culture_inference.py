"""
Culture Inference Service

Analyzes *how* a user communicates in the refine-twin (edit agent) conversation
to infer culture/communication identity signals.

These are distinct from the explicit CultureIdentity fields the user declares
(team_size_preference, feedback_preference, etc.). These are *observed* patterns:
  - Message length and directness  → communication_style
  - I vs we pronoun ratio          → self_reference_pattern
  - How they open their stories    → story_framing
  - Response to open-ended Qs     → uncertainty_response
  - Whether they volunteer depth   → depth_signal

Triggered every 5 user messages in the edit session, runs as a background task.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from litellm import acompletion

from database.neo4j_client import Neo4jClient
from database.sqlite_client import SQLiteClient

logger = logging.getLogger(__name__)

MIN_USER_MESSAGES = 5  # minimum before first inference
INFERENCE_INTERVAL = 5  # re-infer every N user messages

_FIELD_SCHEMA = {
    # ── How they talk (communication patterns) ──
    "communication_style": "direct|elaborate|reserved|expressive",
    "self_reference_pattern": "individual|team_first|balanced",
    "story_framing": "outcome_led|context_led|process_led",
    "uncertainty_response": "seeks_clarity|embraces|deflects",
    "depth_signal": "proactive|responsive|surface",
    "conversation_signals_summary": "1-2 sentences summarizing dominant communication patterns observed",
    # ── What they say (scoring-relevant culture preferences) ──
    "pace_preference": "sprint|steady|deliberate|null",
    "feedback_preference": "frequent_small|milestone_big|self_directed|null",
    "leadership_style": "servant|directive|collaborative|invisible|null",
    "energy_sources": ["list of things that energise them at work, or empty list"],
    "energy_drains": ["list of things that drain them at work, or empty list"],
}


class CultureInferenceService:
    def __init__(self, neo4j: Neo4jClient, sqlite: SQLiteClient):
        self.neo4j = neo4j
        self.sqlite = sqlite
        self._model = os.environ.get(
            "EDIT_AGENT_MODEL",
            os.environ.get("LLM_MODEL", "groq/llama-3.3-70b-versatile"),
        )

    async def infer_from_conversation(self, user_id: str, session_id: str) -> bool:
        """
        Analyze conversation style and merge inferred signals into the user's
        CultureIdentity node. Returns True if inference was performed.
        """
        rows = await self.sqlite.fetchall(
            "SELECT content FROM session_messages WHERE session_id = ? AND role = 'user' ORDER BY id ASC",
            (session_id,),
        )
        user_messages = [r["content"] for r in rows]

        if len(user_messages) < MIN_USER_MESSAGES:
            logger.debug(
                f"Skipping culture inference for user {user_id}: "
                f"only {len(user_messages)} user messages (min {MIN_USER_MESSAGES})"
            )
            return False

        signals = await self._call_llm(user_messages)
        if not signals:
            return False

        await self._merge_into_graph(user_id, signals)
        logger.info(
            f"Culture signals inferred for user {user_id} "
            f"({len(user_messages)} messages analyzed): {signals.get('communication_style')}, "
            f"{signals.get('self_reference_pattern')}, {signals.get('depth_signal')}"
        )
        return True

    async def infer_from_stories(self, user_id: str) -> bool:
        """
        Read the user's anecdotes, motivations, values, and goals from Neo4j
        and infer culture preferences from their *content* (not communication style).
        Fills in scoring-relevant fields: pace_preference, feedback_preference,
        leadership_style, team_size_preference, energy_sources, energy_drains.
        Returns True if inference was performed.
        """
        rows = await self.neo4j.run_query(
            """
            MATCH (u:User {id: $user_id})
            OPTIONAL MATCH (u)-[:HAS_ANECDOTE]->(a:Anecdote)
            OPTIONAL MATCH (u)-[:MOTIVATED_BY]->(m:Motivation)
            OPTIONAL MATCH (u)-[:HOLDS_VALUE]->(v:Value)
            OPTIONAL MATCH (u)-[:ASPIRES_TO]->(g:Goal)
            RETURN
              collect(DISTINCT {
                name: a.name, situation: a.situation, action: a.action,
                result: a.result, lesson: a.lesson_learned,
                emotion: a.emotion_valence
              }) AS anecdotes,
              collect(DISTINCT {name: m.name, category: m.category, evidence: m.evidence}) AS motivations,
              collect(DISTINCT {name: v.name, evidence: v.evidence}) AS values,
              collect(DISTINCT {name: g.name, type: g.type, description: g.description}) AS goals
            """,
            {"user_id": user_id},
        )

        if not rows:
            return False

        row = rows[0]
        anecdotes   = [a for a in (row.get("anecdotes") or []) if a.get("name")]
        motivations = [m for m in (row.get("motivations") or []) if m.get("name")]
        values      = [v for v in (row.get("values") or []) if v.get("name")]
        goals       = [g for g in (row.get("goals") or []) if g.get("name")]

        if not anecdotes and not motivations and not values and not goals:
            logger.debug(f"No story content found for user {user_id}, skipping culture inference")
            return False

        signals = await self._call_llm_stories(anecdotes, motivations, values, goals)
        if not signals:
            return False

        await self._merge_story_signals(user_id, signals)
        logger.info(
            f"Culture signals inferred from stories for user {user_id}: "
            f"pace={signals.get('pace_preference')}, "
            f"feedback={signals.get('feedback_preference')}, "
            f"leadership={signals.get('leadership_style')}"
        )
        return True

    # ── Private ───────────────────────────────────────────────────────────────

    async def _call_llm(self, user_messages: list[str]) -> dict | None:
        transcript = "\n\n".join(
            f"[Message {i + 1}] {m}" for i, m in enumerate(user_messages)
        )
        system_prompt = (
            "You are a behavioral analyst studying how a candidate communicates "
            "in a structured career interview.\n"
            "You are NOT analyzing what they said about their preferences — "
            "you are reading their communication PATTERNS.\n\n"
            "Study the candidate messages and return a JSON object with exactly these keys:\n"
            f"{json.dumps(_FIELD_SCHEMA, indent=2)}\n\n"
            "DEFINITIONS:\n\n"
            "communication_style:\n"
            "  direct     — Short, blunt answers. Gets to the point. Low hedging, few qualifiers.\n"
            "  elaborate  — Long answers. Lots of context and explanation even when not asked.\n"
            "  reserved   — Minimal answers. Reluctant to share details without being pushed.\n"
            "  expressive — Uses emotional language, personal framing, vivid descriptions.\n\n"
            "self_reference_pattern (count pronoun signals):\n"
            "  individual  — Heavy 'I' use. Describes own actions, rarely centers the team.\n"
            "  team_first  — Heavy 'we' use. Centers team effort even when describing own work.\n"
            "  balanced    — Mixes I and we naturally and appropriately.\n\n"
            "story_framing (how do they open narratives?):\n"
            "  outcome_led  — Leads with the result or conclusion, then explains how.\n"
            "  context_led  — Sets up heavy background/situation before getting to action.\n"
            "  process_led  — Focuses on the steps taken; outcome is secondary.\n\n"
            "uncertainty_response (how do they handle open-ended or ambiguous questions?):\n"
            "  seeks_clarity — Asks for clarification or restates the question before answering.\n"
            "  embraces      — Dives in, comfortable making assumptions, handles ambiguity well.\n"
            "  deflects      — Gives a generic or safe answer, avoids committing to specifics.\n\n"
            "depth_signal (do they go deep without being pushed?):\n"
            "  proactive  — Volunteers specifics, examples, and context without being asked.\n"
            "  responsive — Goes deep only when directly probed.\n"
            "  surface    — Stays high-level even when pressed for more detail.\n\n"
            "conversation_signals_summary: 1–2 sentences summarizing the dominant patterns you observed.\n\n"
            "pace_preference (infer from urgency cues, how they describe deadlines or iteration speed):\n"
            "  sprint     — Favours fast cycles, ships often, comfortable with frequent pivots.\n"
            "  steady     — Prefers consistent, predictable rhythm without constant fire-drills.\n"
            "  deliberate — Prefers slow, thorough work; long-horizon projects; dislikes rush.\n"
            "  null       — Not enough signal to infer.\n\n"
            "feedback_preference (how they describe wanting or receiving feedback):\n"
            "  frequent_small  — Wants ongoing, lightweight check-ins.\n"
            "  milestone_big   — Prefers structured feedback at major milestones.\n"
            "  self_directed   — Rarely mentions needing external feedback; evaluates own work.\n"
            "  null            — Not enough signal to infer.\n\n"
            "leadership_style (how they describe their role on teams or leading others):\n"
            "  servant      — Focuses on unblocking and supporting the team.\n"
            "  directive    — Naturally steps up to set direction and make calls.\n"
            "  collaborative — Emphasises consensus and joint decision-making.\n"
            "  invisible    — Avoids leadership role; prefers to contribute individually.\n"
            "  null         — Not enough signal to infer.\n\n"
            "energy_sources: List 0-5 short phrases describing things that clearly energise them (e.g. 'solving hard problems', 'mentoring others'). Empty list if not enough signal.\n\n"
            "energy_drains: List 0-5 short phrases describing things that clearly drain them (e.g. 'context switching', 'unclear requirements'). Empty list if not enough signal.\n\n"
            "Return ONLY valid JSON. No explanation outside the JSON object."
        )

        try:
            from services.llm_utils import acompletion_json
            raw = await acompletion_json(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": f"Candidate messages to analyze:\n\n{transcript}",
                    },
                ],
                temperature=0.2,
            )
            return json.loads(raw)
        except Exception as e:
            logger.warning(f"Culture inference LLM call failed: {e}")
            return None

    async def _merge_into_graph(self, user_id: str, signals: dict) -> None:
        now = datetime.now(timezone.utc).isoformat()

        # energy lists → JSON strings for storage
        import json as _json
        energy_sources = signals.get("energy_sources")
        energy_drains = signals.get("energy_drains")
        energy_sources_str = _json.dumps(energy_sources) if isinstance(energy_sources, list) else None
        energy_drains_str = _json.dumps(energy_drains) if isinstance(energy_drains, list) else None

        await self.neo4j.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (c:CultureIdentity {name: 'culture_profile', user_id: $user_id})
            SET c.communication_style               = coalesce($communication_style, c.communication_style),
                c.self_reference_pattern            = coalesce($self_reference_pattern, c.self_reference_pattern),
                c.story_framing                     = coalesce($story_framing, c.story_framing),
                c.uncertainty_response              = coalesce($uncertainty_response, c.uncertainty_response),
                c.depth_signal                      = coalesce($depth_signal, c.depth_signal),
                c.conversation_signals_summary      = coalesce($summary, c.conversation_signals_summary),
                c.conversation_signals_inferred_at  = $inferred_at,
                c.pace_preference                   = coalesce($pace_preference, c.pace_preference),
                c.feedback_preference               = coalesce($feedback_preference, c.feedback_preference),
                c.leadership_style                  = coalesce($leadership_style, c.leadership_style),
                c.energy_sources                    = coalesce($energy_sources, c.energy_sources),
                c.energy_drains                     = coalesce($energy_drains, c.energy_drains)
            MERGE (u)-[:HAS_CULTURE_IDENTITY]->(c)
            """,
            {
                "user_id": user_id,
                "communication_style": signals.get("communication_style"),
                "self_reference_pattern": signals.get("self_reference_pattern"),
                "story_framing": signals.get("story_framing"),
                "uncertainty_response": signals.get("uncertainty_response"),
                "depth_signal": signals.get("depth_signal"),
                "summary": signals.get("conversation_signals_summary"),
                "inferred_at": now,
                "pace_preference": signals.get("pace_preference") if signals.get("pace_preference") != "null" else None,
                "feedback_preference": signals.get("feedback_preference") if signals.get("feedback_preference") != "null" else None,
                "leadership_style": signals.get("leadership_style") if signals.get("leadership_style") != "null" else None,
                "energy_sources": energy_sources_str,
                "energy_drains": energy_drains_str,
            },
        )

    async def _call_llm_stories(
        self,
        anecdotes: list[dict],
        motivations: list[dict],
        values: list[dict],
        goals: list[dict],
    ) -> dict | None:
        """Infer culture preferences from the *content* of stories, not communication style."""

        def fmt_anecdote(a: dict) -> str:
            parts = [f"Story: {a.get('name', '')}"]
            if a.get("situation"):
                parts.append(f"  Situation: {a['situation']}")
            if a.get("action"):
                parts.append(f"  Action: {a['action']}")
            if a.get("result"):
                parts.append(f"  Result: {a['result']}")
            if a.get("lesson"):
                parts.append(f"  Lesson: {a['lesson']}")
            if a.get("emotion"):
                parts.append(f"  Emotion: {a['emotion']}")
            return "\n".join(parts)

        sections: list[str] = []
        if anecdotes:
            sections.append("=== ANECDOTES / STORIES ===\n" + "\n\n".join(fmt_anecdote(a) for a in anecdotes))
        if motivations:
            lines = [f"- {m['name']}" + (f" ({m['category']})" if m.get("category") else "") +
                     (f": {m['evidence']}" if m.get("evidence") else "") for m in motivations]
            sections.append("=== MOTIVATIONS ===\n" + "\n".join(lines))
        if values:
            lines = [f"- {v['name']}" + (f": {v['evidence']}" if v.get("evidence") else "") for v in values]
            sections.append("=== VALUES ===\n" + "\n".join(lines))
        if goals:
            lines = [f"- {g['name']}" + (f" ({g['type']})" if g.get("type") else "") +
                     (f": {g['description']}" if g.get("description") else "") for g in goals]
            sections.append("=== GOALS ===\n" + "\n".join(lines))

        content = "\n\n".join(sections)

        _STORY_SCHEMA = {
            "pace_preference": "sprint|steady|deliberate|null",
            "feedback_preference": "frequent_small|milestone_big|self_directed|null",
            "leadership_style": "servant|directive|collaborative|invisible|null",
            "team_size_preference": "small|medium|large|null",
            "conflict_style": "direct|diplomatic|avoidant|null",
            "energy_sources": ["list of 0-5 short phrases of what energises them"],
            "energy_drains": ["list of 0-5 short phrases of what drains them"],
            "story_culture_summary": "1-2 sentence summary of the culture fit signals from their stories",
        }

        system_prompt = (
            "You are a culture-fit analyst. You will read a candidate's stories, motivations, values, "
            "and goals and infer what kind of work environment they would thrive in.\n\n"
            "Focus on WHAT they say (their experiences, priorities, outcomes they celebrate or regret), "
            "NOT how they say it.\n\n"
            f"Return a JSON object with exactly these keys:\n{json.dumps(_STORY_SCHEMA, indent=2)}\n\n"
            "DEFINITIONS:\n\n"
            "pace_preference:\n"
            "  sprint     — Stories celebrate speed, shipping fast, pivoting quickly.\n"
            "  steady     — Values consistency, sustained progress, no fire-drills.\n"
            "  deliberate — Values deep work, thoroughness, long-horizon projects.\n"
            "  null       — Not enough signal.\n\n"
            "feedback_preference:\n"
            "  frequent_small  — Values regular check-ins, mentions frequent feedback positively.\n"
            "  milestone_big   — Prefers structured reviews; dislikes constant interruption.\n"
            "  self_directed   — Self-evaluates; rarely mentions needing external validation.\n"
            "  null            — Not enough signal.\n\n"
            "leadership_style:\n"
            "  servant      — Stories focus on helping the team, removing blockers.\n"
            "  directive    — Stories show stepping up, making calls, setting direction.\n"
            "  collaborative — Stories emphasise consensus, collective decisions.\n"
            "  invisible    — Prefers individual contribution; avoids formal leadership.\n"
            "  null         — Not enough signal.\n\n"
            "team_size_preference:\n"
            "  small  — Talks positively about small, tight-knit teams.\n"
            "  medium — Comfortable with mid-size teams (10-50).\n"
            "  large  — Thrives in large orgs; values broad collaboration.\n"
            "  null   — Not enough signal.\n\n"
            "conflict_style:\n"
            "  direct     — Addresses disagreements head-on.\n"
            "  diplomatic — Seeks common ground, softer approach.\n"
            "  avoidant   — Sidesteps conflict; prefers harmony.\n"
            "  null       — Not enough signal.\n\n"
            "energy_sources / energy_drains: infer from emotion signals, lessons learned, "
            "and what outcomes they highlight as wins vs. frustrations.\n\n"
            "Return ONLY valid JSON. No prose outside the JSON object."
        )

        try:
            from services.llm_utils import acompletion_json
            raw = await acompletion_json(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Candidate profile content:\n\n{content}"},
                ],
                temperature=0.2,
            )
            return json.loads(raw)
        except Exception as e:
            logger.warning(f"Story-based culture inference LLM call failed: {e}")
            return None

    async def _merge_story_signals(self, user_id: str, signals: dict) -> None:
        """Write story-inferred culture signals. Uses coalesce — conversation signals take priority."""
        now = datetime.now(timezone.utc).isoformat()
        import json as _json

        energy_sources = signals.get("energy_sources")
        energy_drains = signals.get("energy_drains")
        energy_sources_str = _json.dumps(energy_sources) if isinstance(energy_sources, list) else None
        energy_drains_str = _json.dumps(energy_drains) if isinstance(energy_drains, list) else None

        def _val(key: str):
            v = signals.get(key)
            return None if (v is None or v == "null") else v

        await self.neo4j.run_write(
            """
            MATCH (u:User {id: $user_id})
            MERGE (c:CultureIdentity {name: 'culture_profile', user_id: $user_id})
            SET c.pace_preference         = coalesce(c.pace_preference, $pace),
                c.feedback_preference     = coalesce(c.feedback_preference, $feedback),
                c.leadership_style        = coalesce(c.leadership_style, $leadership),
                c.team_size_preference    = coalesce(c.team_size_preference, $team_size),
                c.conflict_style          = coalesce(c.conflict_style, $conflict),
                c.energy_sources          = coalesce(c.energy_sources, $energy_sources),
                c.energy_drains           = coalesce(c.energy_drains, $energy_drains),
                c.story_culture_summary   = coalesce(c.story_culture_summary, $summary),
                c.story_signals_inferred_at = $inferred_at
            MERGE (u)-[:HAS_CULTURE_IDENTITY]->(c)
            """,
            {
                "user_id": user_id,
                "pace": _val("pace_preference"),
                "feedback": _val("feedback_preference"),
                "leadership": _val("leadership_style"),
                "team_size": _val("team_size_preference"),
                "conflict": _val("conflict_style"),
                "energy_sources": energy_sources_str,
                "energy_drains": energy_drains_str,
                "summary": signals.get("story_culture_summary"),
                "inferred_at": now,
            },
        )
