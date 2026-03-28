# Interview Practice Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack AI interview practice feature where users simulate a real interview for a specific job, with the AI adopting the company's persona and shifting through 5 structured phases (intro → technical → behavioral → culture → closing), ending with a scored report card.

**Architecture:** New `PracticeInterviewAgent` (modeled after `LLMEditAgent`) uses LiteLLM JSON mode with a company-persona + candidate-context system prompt. `PracticeSessionService` orchestrates SQLite session state. Four new frontend components slot into the existing `Practice.tsx` split-panel layout.

**Tech Stack:** FastAPI + LiteLLM (backend), React 18 + TypeScript + Framer Motion + Tailwind (frontend), SQLite (sessions/messages/scorecards), Neo4j (job+user graph context)

---

## File Map

**New backend files:**
- `backend/models/practice_schemas.py` — Pydantic request/response models
- `backend/services/practice_interview_agent.py` — LLM agent (interview turns + scorecard)
- `backend/services/practice_session_service.py` — session orchestration
- `backend/api/practice_routes.py` — FastAPI router

**Modified backend files:**
- `backend/database/sqlite_client.py` — add 3 new tables to `init_schema`
- `backend/main.py` — mount practice router

**New frontend files:**
- `frontend/src/components/practice/PracticeChat.tsx`
- `frontend/src/components/practice/PhaseTimeline.tsx`
- `frontend/src/components/practice/PracticeScorecard.tsx`
- `frontend/src/components/practice/JobPickerModal.tsx`

**Modified frontend files:**
- `frontend/src/lib/types.ts` — add practice types
- `frontend/src/lib/api.ts` — add `practice` namespace
- `frontend/src/pages/user/Practice.tsx` — full refactor (keep layout)
- `frontend/src/pages/user/Applications.tsx` — add "Practice Interview" button

---

## Task 1: Add Practice Tables to SQLite Schema

**Files:**
- Modify: `backend/database/sqlite_client.py`

- [ ] **Step 1: Open `sqlite_client.py` and add three new tables inside `init_schema`'s `executescript` call, right after the `idx_analytics_job_event` index and before the closing `"""`**

```python
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
```

- [ ] **Step 2: Start the backend and confirm the schema initializes without errors**

```bash
cd backend && python -c "
import asyncio
from database.sqlite_client import init_sqlite
asyncio.run(init_sqlite('.data_storage/lumino.db'))
print('Schema OK')
"
```
Expected output: `Schema OK`

- [ ] **Step 3: Verify the tables exist in the database**

```bash
cd backend && python -c "
import asyncio, aiosqlite
async def check():
    async with aiosqlite.connect('.data_storage/lumino.db') as db:
        async with db.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'practice%'\") as cur:
            rows = await cur.fetchall()
            for r in rows: print(r[0])
asyncio.run(check())
"
```
Expected output:
```
practice_sessions
practice_messages
practice_scorecards
```

- [ ] **Step 4: Commit**

```bash
cd backend && git add database/sqlite_client.py
git commit -m "feat(db): add practice_sessions, practice_messages, practice_scorecards tables"
```

---

## Task 2: Create Pydantic Schemas

**Files:**
- Create: `backend/models/practice_schemas.py`

- [ ] **Step 1: Create the file with all request/response models**

```python
"""Pydantic models for the interview practice feature."""

from typing import Optional
from pydantic import BaseModel


class StartPracticeRequest(BaseModel):
    user_id: str
    job_id: str


class StartPracticeResponse(BaseModel):
    session_id: str
    opening_message: str
    interviewer_persona: str
    phase: str
    core_questions_count: int
    job_title: str
    company: str


class PracticeMessageRequest(BaseModel):
    user_id: str
    content: str


class InterviewTurn(BaseModel):
    ai_response: str
    interviewer_persona: str
    phase: str
    phase_changed: bool
    session_complete: bool
    coaching_hint: Optional[str] = None


class CompletePracticeRequest(BaseModel):
    user_id: str


class ScoreBreakdown(BaseModel):
    communication: float
    technical: float
    behavioral: float
    culture: float
    overall: float


class PracticeScorecard(BaseModel):
    scores: ScoreBreakdown
    strengths: list[str]
    gaps: list[str]
    recommendation: str  # 'strong_yes' | 'yes' | 'maybe' | 'no'


class PracticeMessageHistory(BaseModel):
    role: str
    content: str
    interviewer_persona: Optional[str] = None
    phase: Optional[str] = None


class PracticeHistoryResponse(BaseModel):
    session_id: str
    phase: str
    question_index: int
    core_questions_count: int
    messages: list[PracticeMessageHistory]


class PracticeSessionSummary(BaseModel):
    session_id: str
    job_id: str
    job_title: str
    company: Optional[str] = None
    phase: str
    started_at: str
    last_active: str
    has_scorecard: bool


class UserPracticeSessionsResponse(BaseModel):
    user_id: str
    sessions: list[PracticeSessionSummary]
```

- [ ] **Step 2: Confirm the module imports cleanly**

```bash
cd backend && python -c "from models.practice_schemas import InterviewTurn, PracticeScorecard; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add models/practice_schemas.py
git commit -m "feat(schemas): add practice interview Pydantic models"
```

---

## Task 3: Create PracticeInterviewAgent

**Files:**
- Create: `backend/services/practice_interview_agent.py`

- [ ] **Step 1: Create the agent file**

```python
"""
PracticeInterviewAgent - AI interviewer for job practice sessions.

Takes on the persona of the target company, uses the candidate's graph as private
context, and drives a 5-phase structured interview. Returns InterviewTurn on each
message and a PracticeScorecard on session complete.
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone

from litellm import acompletion

from database.neo4j_client import Neo4jClient
from database.sqlite_client import SQLiteClient
from models.practice_schemas import InterviewTurn, PracticeScorecard, ScoreBreakdown

logger = logging.getLogger(__name__)

PHASES = ["intro", "technical", "behavioral", "culture", "closing"]

_TURN_SCHEMA = json.dumps(InterviewTurn.model_json_schema(), indent=2)

_SCORECARD_SCHEMA = json.dumps(
    {
        "type": "object",
        "properties": {
            "scores": {
                "type": "object",
                "properties": {
                    "communication": {"type": "number"},
                    "technical": {"type": "number"},
                    "behavioral": {"type": "number"},
                    "culture": {"type": "number"},
                    "overall": {"type": "number"},
                },
                "required": ["communication", "technical", "behavioral", "culture", "overall"],
            },
            "strengths": {"type": "array", "items": {"type": "string"}},
            "gaps": {"type": "array", "items": {"type": "string"}},
            "recommendation": {
                "type": "string",
                "enum": ["strong_yes", "yes", "maybe", "no"],
            },
        },
        "required": ["scores", "strengths", "gaps", "recommendation"],
    },
    indent=2,
)


class PracticeInterviewAgent:
    def __init__(self, neo4j: Neo4jClient, sqlite: SQLiteClient):
        self._model = os.environ.get(
            "EDIT_AGENT_MODEL", os.environ.get("LLM_MODEL", "groq/llama-3.3-70b-versatile")
        )
        self.neo4j = neo4j
        self.sqlite = sqlite

    # ── Public API ─────────────────────────────────────────────────────────────

    async def get_opening_message(
        self, session_id: str, user_id: str, job_id: str
    ) -> tuple[InterviewTurn, list[str]]:
        """Generate the opening interview message. Returns (turn, core_questions)."""
        job_ctx = await self._fetch_job_context(job_id)
        user_ctx = await self._fetch_user_context(user_id)

        system_msg = self._build_system_prompt(job_ctx, user_ctx, phase="intro")

        opening_prompt = (
            "The candidate has just joined the interview. They have confirmed they are ready. "
            "Start with the intro phase: a warm professional opening, introduce yourself by "
            "your role and company, and ask your first question about the candidate's background "
            "and interest in this specific role. Be concise - this is a real interview, not a "
            "speech. The phase should be 'intro', persona should be 'hiring_manager', "
            "phase_changed should be false, session_complete should be false."
        )

        raw_json = await self._call_with_retry(
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": opening_prompt},
            ]
        )
        turn = InterviewTurn.model_validate_json(raw_json)

        # Generate core questions (separate quick call)
        core_questions = await self._generate_core_questions(job_ctx, user_ctx)

        # Persist opening exchange
        await self._persist_message(
            session_id, "assistant", turn.ai_response, turn.interviewer_persona, turn.phase
        )
        return turn, core_questions

    async def send_message(
        self, session_id: str, user_id: str, job_id: str, content: str, current_phase: str
    ) -> InterviewTurn:
        """Process a candidate message and return the next interview turn."""
        job_ctx = await self._fetch_job_context(job_id)
        user_ctx = await self._fetch_user_context(user_id)

        system_msg = self._build_system_prompt(job_ctx, user_ctx, phase=current_phase)

        # Load full conversation history from SQLite
        history_rows = await self.sqlite.fetchall(
            "SELECT role, content FROM practice_messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        )
        messages = [{"role": "system", "content": system_msg}]
        for row in history_rows:
            if row["role"] in ("user", "assistant"):
                messages.append({"role": row["role"], "content": row["content"]})
        messages.append({"role": "user", "content": content})

        raw_json = await self._call_with_retry(messages=messages)
        turn = InterviewTurn.model_validate_json(raw_json)

        # Persist both sides
        await self._persist_message(session_id, "user", content, None, current_phase)
        await self._persist_message(
            session_id, "assistant", turn.ai_response, turn.interviewer_persona, turn.phase
        )
        return turn

    async def generate_scorecard(self, session_id: str, job_id: str, user_id: str) -> PracticeScorecard:
        """Analyze the full conversation and generate a scored report card."""
        job_ctx = await self._fetch_job_context(job_id)
        user_ctx = await self._fetch_user_context(user_id)

        history_rows = await self.sqlite.fetchall(
            "SELECT role, content FROM practice_messages WHERE session_id = ? AND role = 'user' ORDER BY id ASC",
            (session_id,),
        )
        candidate_answers = "\n\n".join(
            f"Answer {i+1}: {row['content']}" for i, row in enumerate(history_rows)
        )

        job_title = job_ctx.get("meta", {}).get("title", "the role")
        company = job_ctx.get("meta", {}).get("company", "the company")
        skill_reqs = [s["name"] for s in job_ctx.get("skill_requirements", [])[:10]]

        scorecard_prompt = (
            f"You have just completed a practice interview for '{job_title}' at '{company}'. "
            f"Key skill requirements: {skill_reqs}.\n\n"
            f"CANDIDATE ANSWERS:\n{candidate_answers}\n\n"
            "Evaluate the candidate's performance across 5 dimensions (0-10 each):\n"
            "  - communication: clarity, structure, conciseness\n"
            "  - technical: depth, accuracy, specificity of technical claims\n"
            "  - behavioral: quality of STAR stories, ownership signals\n"
            "  - culture: alignment with the company's values and working style\n"
            "  - overall: holistic assessment\n\n"
            "Also identify:\n"
            "  - strengths: top 3 specific things done well (be concrete)\n"
            "  - gaps: top 3 specific areas to improve (be actionable)\n"
            "  - recommendation: 'strong_yes', 'yes', 'maybe', or 'no'\n\n"
            f"Return ONLY valid JSON matching this schema:\n{_SCORECARD_SCHEMA}"
        )

        raw_json = await self._call_with_retry(
            messages=[{"role": "user", "content": scorecard_prompt}]
        )
        data = json.loads(raw_json)
        scores = ScoreBreakdown(**data["scores"])
        return PracticeScorecard(
            scores=scores,
            strengths=data["strengths"],
            gaps=data["gaps"],
            recommendation=data["recommendation"],
        )

    # ── Context fetchers ───────────────────────────────────────────────────────

    async def _fetch_job_context(self, job_id: str) -> dict:
        """Fetch job deep profile from Neo4j for the system prompt."""
        meta = await self.neo4j.run_query(
            "MATCH (j:Job {id: $id}) RETURN j.title AS title, j.company AS company, "
            "j.remote_policy AS remote_policy, j.company_size AS company_size, "
            "j.experience_years_min AS experience_years_min",
            {"id": job_id},
        )
        skill_reqs = await self.neo4j.run_query(
            """
            MATCH (j:Job {id: $id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(:JobSkillFamily)
                  -[:REQUIRES_SKILL]->(r:JobSkillRequirement)
            RETURN r.name AS name, r.importance AS importance,
                   coalesce(r.min_years, 0) AS min_years
            ORDER BY r.importance DESC
            """,
            {"id": job_id},
        )
        soft_skills = await self.neo4j.run_query(
            "MATCH (j:Job {id: $id})-[:REQUIRES_QUALITY]->(s:SoftSkillRequirement) "
            "RETURN s.name AS name, s.expectation AS expectation, s.dealbreaker AS dealbreaker",
            {"id": job_id},
        )
        team_culture = await self.neo4j.run_query(
            "MATCH (j:Job {id: $id})-[:HAS_TEAM_CULTURE]->(c:TeamCultureIdentity) "
            "RETURN c.communication_style AS communication_style, c.pace AS pace, "
            "c.management_style AS management_style, c.team_values AS team_values, "
            "c.anti_patterns AS anti_patterns, c.feedback_culture AS feedback_culture",
            {"id": job_id},
        )
        role_context = await self.neo4j.run_query(
            "MATCH (j:Job {id: $id})-[:HAS_ROLE_CONTEXT]->(r:RoleContext) "
            "RETURN r.owns_what AS owns_what, r.reports_to AS reports_to, "
            "r.growth_trajectory AS growth_trajectory",
            {"id": job_id},
        )
        interview_signals = await self.neo4j.run_query(
            "MATCH (j:Job {id: $id})-[:SCREENS_FOR]->(s:InterviewSignal) "
            "RETURN s.signal_type AS signal_type, s.what_to_watch_for AS what_to_watch_for",
            {"id": job_id},
        )
        return {
            "meta": meta[0] if meta else {},
            "skill_requirements": skill_reqs,
            "soft_skills": soft_skills,
            "team_culture": team_culture[0] if team_culture else None,
            "role_context": role_context[0] if role_context else None,
            "interview_signals": interview_signals,
        }

    async def _fetch_user_context(self, user_id: str) -> dict:
        """Fetch candidate's graph for private context in the system prompt."""
        skills = await self.neo4j.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                  -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(s:Skill)
            RETURN s.name AS name, coalesce(s.years, 0) AS years,
                   coalesce(s.level, 'unknown') AS level,
                   coalesce(s.evidence_strength, 'unknown') AS evidence_strength
            ORDER BY s.evidence_strength ASC, years ASC
            """,
            {"id": user_id},
        )
        experiences = await self.neo4j.run_query(
            """
            MATCH (u:User {id: $id})-[:HAS_EXPERIENCE_CATEGORY]->(:ExperienceCategory)
                  -[:HAS_EXPERIENCE]->(e:Experience)
            RETURN e.title AS title, e.company AS company,
                   coalesce(e.duration_years, 0) AS duration_years,
                   e.description AS description
            ORDER BY e.duration_years DESC
            """,
            {"id": user_id},
        )
        motivations = await self.neo4j.run_query(
            "MATCH (u:User {id: $id})-[:MOTIVATED_BY]->(m:Motivation) "
            "RETURN m.name AS name, m.category AS category, m.strength AS strength",
            {"id": user_id},
        )
        return {
            "user_id": user_id,
            "skills": skills,
            "experiences": experiences,
            "motivations": motivations,
        }

    # ── System prompt ──────────────────────────────────────────────────────────

    def _build_system_prompt(self, job_ctx: dict, user_ctx: dict, phase: str) -> str:
        meta = job_ctx.get("meta", {})
        company = meta.get("company", "our company")
        job_title = meta.get("title", "the role")
        skill_reqs = job_ctx.get("skill_requirements", [])
        soft_skills = job_ctx.get("soft_skills", [])
        team_culture = job_ctx.get("team_culture") or {}
        role_context = job_ctx.get("role_context") or {}
        interview_signals = job_ctx.get("interview_signals", [])

        green_flags = [s["what_to_watch_for"] for s in interview_signals if s.get("signal_type") == "green_flag"]
        red_flags_signals = [s["what_to_watch_for"] for s in interview_signals if s.get("signal_type") == "red_flag"]

        # Company persona derived from team culture
        pace = team_culture.get("pace", "steady")
        comm_style = team_culture.get("communication_style", "professional")
        mgmt_style = team_culture.get("management_style", "collaborative")
        team_values = team_culture.get("team_values", "[]")
        anti_patterns = team_culture.get("anti_patterns", "[]")

        # Candidate context (private — never reveal to candidate)
        user_skills = user_ctx.get("skills", [])
        user_experiences = user_ctx.get("experiences", [])
        weak_skills = [
            s for s in user_skills
            if s.get("evidence_strength") in ("claimed_only", "mentioned_once", "unknown")
        ]
        required_names = {s["name"].lower() for s in skill_reqs}
        candidate_skill_names = {s["name"].lower() for s in user_skills}
        skill_gaps = required_names - candidate_skill_names

        # Phase-specific instructions
        phase_instructions = {
            "intro": (
                "CURRENT PHASE: intro (Hiring Manager)\n"
                "Goal: Warm professional opening. Establish rapport. Learn about the candidate's "
                "background, why they're interested in THIS specific role at THIS company, and "
                "their general fit signals. Ask 2-3 questions before advancing to technical phase.\n"
                "Persona tone: Warm but professional. You represent the company."
            ),
            "technical": (
                "CURRENT PHASE: technical (Tech Lead)\n"
                "Goal: Probe technical depth. Focus on the required skills listed above. "
                "Use 5W+H: WHO owned it, WHAT exactly, WHEN/how long, WHERE (scale/env), "
                "WHY this approach, HOW specifically. Do NOT accept surface answers. "
                "Ask follow-ups until you have a real story.\n"
                "Persona tone: Precise, direct, technically demanding. No fluff."
            ),
            "behavioral": (
                "CURRENT PHASE: behavioral (Hiring Manager)\n"
                "Goal: Collect STAR stories. Every behavioral claim needs a specific story. "
                "'Tell me about a time...' format. Probe for situation → task → action → result. "
                "Pay attention to ownership signals - did they say 'we' or 'I'? Push for specifics.\n"
                "Persona tone: Curious, thorough. Comfortable with silence after asking."
            ),
            "culture": (
                "CURRENT PHASE: culture (Culture Fit Interviewer)\n"
                f"Goal: Assess alignment with the team's values and working style. "
                f"Team values: {team_values}. Anti-patterns to screen for: {anti_patterns}. "
                f"Management style: {mgmt_style}. Communication: {comm_style}. Pace: {pace}.\n"
                "Ask about how they handle feedback, conflict, ambiguity, and team dynamics.\n"
                "Persona tone: Conversational, collegial. This feels more like a coffee chat."
            ),
            "closing": (
                "CURRENT PHASE: closing (Hiring Manager)\n"
                "Goal: Wrap up the interview. Ask if they have any questions about the role or "
                "company. Give them 1-2 questions to ask back. After they respond, signal that "
                "the interview is complete by setting session_complete: true.\n"
                "Persona tone: Warm, forward-looking."
            ),
        }

        phase_instr = phase_instructions.get(phase, phase_instructions["intro"])
        phase_idx = PHASES.index(phase) if phase in PHASES else 0
        next_phase = PHASES[phase_idx + 1] if phase_idx < len(PHASES) - 1 else None

        return (
            f"You are conducting a practice interview for the position of '{job_title}' at '{company}'.\n\n"
            "════════════════════════════════════════════════\n"
            "YOUR ROLE\n"
            "════════════════════════════════════════════════\n"
            "You are a real interviewer at this company. You shift between three personas across "
            "the interview: Hiring Manager (intro, behavioral, closing), Tech Lead (technical), "
            "and Culture Fit Interviewer (culture). Always be in character.\n\n"
            f"COMPANY CULTURE PERSONA:\n"
            f"  Communication style: {comm_style}\n"
            f"  Pace: {pace}\n"
            f"  Management style: {mgmt_style}\n"
            f"  Team values: {team_values}\n"
            f"  Anti-patterns this team screens against: {anti_patterns}\n\n"
            "════════════════════════════════════════════════\n"
            "PRIVATE CANDIDATE INTELLIGENCE (never reveal this to the candidate)\n"
            "════════════════════════════════════════════════\n"
            f"Skills on profile: {[s['name'] + '(' + s['evidence_strength'] + ')' for s in user_skills[:12]]}\n"
            f"Weak-evidence skills to probe: {[s['name'] for s in weak_skills[:5]]}\n"
            f"Skill gaps vs job requirements: {list(skill_gaps)[:5]}\n"
            f"Experiences: {[e['title'] + ' @ ' + (e['company'] or '?') for e in user_experiences[:4]]}\n\n"
            "════════════════════════════════════════════════\n"
            "JOB REQUIREMENTS\n"
            "════════════════════════════════════════════════\n"
            f"Required skills: {[s['name'] + '(' + s.get('importance','must_have') + ')' for s in skill_reqs[:10]]}\n"
            f"Soft skills: {[s['name'] + ': ' + (s.get('expectation') or '') for s in soft_skills[:5]]}\n"
            f"Role owns: {role_context.get('owns_what', '(unknown)')}\n"
            f"Green flags to watch for: {green_flags}\n"
            f"Red flags to watch for: {red_flags_signals}\n\n"
            "════════════════════════════════════════════════\n"
            "INTERVIEW RULES\n"
            "════════════════════════════════════════════════\n"
            "RULE 1 - WHY-LADDER: Never accept the first answer. Go one level deeper.\n"
            "  'I used Kubernetes' → 'What specifically did you own in that setup?'\n"
            "  → 'What broke first and how did you fix it?'\n\n"
            "RULE 2 - STAR COLLECTION: Every behavioral claim needs a story.\n"
            "  'I led a migration' → 'Walk me through that migration specifically.'\n"
            "  Push for situation, their specific task, exact action, measurable result.\n\n"
            "RULE 3 - GAP TARGETING: Spend extra time on the candidate's weak-evidence skills.\n"
            "  If a skill is 'claimed_only', probe it until you have real evidence or confirm it's weak.\n\n"
            "RULE 4 - ONE QUESTION PER TURN. Always. No lists of questions.\n\n"
            "RULE 5 - NO FLATTERY: 'Great answer!' is not in your vocabulary.\n"
            "  Respond with a follow-up question or advance the topic.\n\n"
            "RULE 6 - COACHING HINT: In the coaching_hint field, write a PRIVATE tip for the candidate.\n"
            "  This is shown to them as coaching feedback, not as part of the interview.\n"
            "  Examples: 'Your answer lacked a specific metric - add numbers next time.'\n"
            "  'Good STAR structure, but the result was vague.'\n"
            "  'Strong answer - the specificity here is exactly what interviewers look for.'\n\n"
            "RULE 7 - PHASE ADVANCEMENT: You decide when to advance phases.\n"
            f"  Current phase: {phase}. Next phase: {next_phase or 'none (closing is final)'}.\n"
            "  Advance when you have sufficient coverage of the current phase's goals.\n"
            "  Set phase_changed: true and update phase when advancing.\n\n"
            "════════════════════════════════════════════════\n"
            f"{phase_instr}\n\n"
            "════════════════════════════════════════════════\n"
            "RESPONSE SCHEMA - return ONLY valid JSON\n"
            "════════════════════════════════════════════════\n"
            f"{_TURN_SCHEMA}\n\n"
            "Field rules:\n"
            "  ai_response: What you say as the interviewer. Natural, conversational, one question.\n"
            "  interviewer_persona: 'hiring_manager' | 'tech_lead' | 'culture_fit'\n"
            "  phase: current phase after this turn (may be same or advanced)\n"
            "  phase_changed: true only if you are advancing to a new phase THIS turn\n"
            "  session_complete: true ONLY in closing phase when the interview is fully done\n"
            "  coaching_hint: private tip for the candidate about their last answer (null on opening)\n"
        )

    async def _generate_core_questions(self, job_ctx: dict, user_ctx: dict) -> list[str]:
        """Generate 5-8 core questions tailored to the gap between candidate and job."""
        meta = job_ctx.get("meta", {})
        skill_reqs = [s["name"] for s in job_ctx.get("skill_requirements", [])[:8]]
        user_skills = {s["name"].lower() for s in user_ctx.get("skills", [])}
        gaps = [s for s in skill_reqs if s.lower() not in user_skills]

        prompt = (
            f"Generate 6 specific interview questions for a '{meta.get('title', 'role')}' "
            f"at '{meta.get('company', 'the company')}'.\n"
            f"Required skills: {skill_reqs}\n"
            f"Skill gaps to probe: {gaps[:4]}\n\n"
            "Mix of: 2 technical depth questions, 2 behavioral STAR questions, "
            "1 culture/values question, 1 role-specific scenario question.\n"
            'Return ONLY a JSON object: {"questions": ["q1", "q2", ...]}'
        )
        try:
            raw = await self._call_with_retry(
                messages=[{"role": "user", "content": prompt}]
            )
            data = json.loads(raw)
            return data.get("questions", [])[:8]
        except Exception:
            return []

    # ── Helpers ────────────────────────────────────────────────────────────────

    async def _persist_message(
        self, session_id: str, role: str, content: str,
        persona: str | None, phase: str | None
    ) -> None:
        await self.sqlite.execute(
            """
            INSERT INTO practice_messages (session_id, role, content, interviewer_persona, phase, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session_id, role, content, persona, phase, datetime.now(timezone.utc).isoformat()),
        )

    @staticmethod
    def _unwrap_json(raw: str) -> str:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list) and parsed:
                return json.dumps(parsed[0])
        except (json.JSONDecodeError, IndexError):
            pass
        return raw

    async def _call_with_retry(self, messages: list) -> str:
        max_attempts = 5
        for attempt in range(max_attempts):
            try:
                resp = await acompletion(
                    model=self._model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.7,
                )
                return self._unwrap_json(resp.choices[0].message.content)
            except Exception as e:
                if attempt == max_attempts - 1:
                    raise
                error_str = str(e)
                match_s = re.search(r"try again in (\d+(?:\.\d+)?)s", error_str, re.IGNORECASE)
                match_ms = re.search(r"try again in (\d+(?:\.\d+)?)ms", error_str, re.IGNORECASE)
                if match_s:
                    wait = float(match_s.group(1)) + 2.0
                    logger.warning(f"Rate limit (attempt {attempt+1}/{max_attempts}). Waiting {wait:.1f}s")
                elif match_ms:
                    wait = float(match_ms.group(1)) / 1000.0 + 2.0
                    logger.warning(f"Rate limit (attempt {attempt+1}/{max_attempts}). Waiting {wait:.1f}s")
                else:
                    wait = 2 ** attempt
                    logger.warning(f"LLM error (attempt {attempt+1}/{max_attempts}): {e}. Retrying in {wait}s")
                await asyncio.sleep(wait)
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
cd backend && python -c "from services.practice_interview_agent import PracticeInterviewAgent; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add services/practice_interview_agent.py
git commit -m "feat(agent): add PracticeInterviewAgent with 5-phase interview system prompt"
```

---

## Task 4: Create PracticeSessionService

**Files:**
- Create: `backend/services/practice_session_service.py`

- [ ] **Step 1: Create the session orchestration service**

```python
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
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
cd backend && python -c "from services.practice_session_service import PracticeSessionService; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add services/practice_session_service.py
git commit -m "feat(service): add PracticeSessionService for interview session orchestration"
```

---

## Task 5: Create FastAPI Routes and Mount Router

**Files:**
- Create: `backend/api/practice_routes.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create the practice routes file**

```python
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
    PracticeHistoryResponse,
    PracticeMessageRequest,
    PracticeScorecard,
    StartPracticeRequest,
    StartPracticeResponse,
    UserPracticeSessionsResponse,
    InterviewTurn,
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
```

- [ ] **Step 2: Mount the router in `main.py` — add these two lines after the existing `from api.routes import router` import and `app.include_router(router, prefix="/api/v1")` call**

Add to the imports section (after line `from api.routes import router`):
```python
from api.practice_routes import practice_router
```

Add after `app.include_router(router, prefix="/api/v1")`:
```python
app.include_router(practice_router, prefix="/api/v1/practice")
```

- [ ] **Step 3: Start the backend and verify the routes appear in Swagger**

```bash
cd backend && uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000/docs` and verify a "practice" section appears with 5 endpoints.

- [ ] **Step 4: Smoke-test the start endpoint with a real user_id and job_id from your database**

```bash
curl -s -X POST http://localhost:8000/api/v1/practice/sessions/start \
  -H "Content-Type: application/json" \
  -d '{"user_id": "YOUR_USER_ID", "job_id": "YOUR_JOB_ID"}' | python -m json.tool
```

Expected: JSON with `session_id`, `opening_message`, `phase: "intro"`, `job_title`, `company`.

- [ ] **Step 5: Commit**

```bash
git add api/practice_routes.py main.py
git commit -m "feat(api): add practice interview routes and mount at /api/v1/practice"
```

---

## Task 6: Add TypeScript Types

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Append practice types to the end of `types.ts`**

```typescript
// ─── Practice Interview Types ─────────────────────────────────────────────────

export interface StartPracticeResponse {
  session_id: string;
  opening_message: string;
  interviewer_persona: string;
  phase: string;
  core_questions_count: number;
  job_title: string;
  company: string;
}

export interface InterviewTurn {
  ai_response: string;
  interviewer_persona: string;
  phase: string;
  phase_changed: boolean;
  session_complete: boolean;
  coaching_hint: string | null;
}

export interface ScoreBreakdown {
  communication: number;
  technical: number;
  behavioral: number;
  culture: number;
  overall: number;
}

export interface PracticeScorecard {
  scores: ScoreBreakdown;
  strengths: string[];
  gaps: string[];
  recommendation: 'strong_yes' | 'yes' | 'maybe' | 'no';
}

export interface PracticeMessageHistory {
  role: 'user' | 'assistant';
  content: string;
  interviewer_persona?: string;
  phase?: string;
}

export interface PracticeHistoryResponse {
  session_id: string;
  phase: string;
  question_index: number;
  core_questions_count: number;
  messages: PracticeMessageHistory[];
}

export interface PracticeSessionSummary {
  session_id: string;
  job_id: string;
  job_title: string;
  company?: string;
  phase: string;
  started_at: string;
  last_active: string;
  has_scorecard: boolean;
}

export interface UserPracticeSessionsResponse {
  user_id: string;
  sessions: PracticeSessionSummary[];
}

export interface PracticeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  persona?: string;
  phase?: string;
  phaseChanged?: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/lib/types.ts
git commit -m "feat(types): add practice interview TypeScript types"
```

---

## Task 7: Add API Methods

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add import for new types at the top of `api.ts` — update the import from `'./types'`**

Add these to the existing type import:
```typescript
import type {
  // ... existing types ...
  StartPracticeResponse,
  InterviewTurn,
  PracticeScorecard,
  PracticeHistoryResponse,
  UserPracticeSessionsResponse,
} from './types';
```

- [ ] **Step 2: Add the `practice` namespace to the `api` object, just before the closing `};`**

```typescript
  // ── Practice Interview ──────────────────────────────────────────────────────
  practice: {
    startSession: (body: { user_id: string; job_id: string }) =>
      post<StartPracticeResponse>('/practice/sessions/start', body),

    sendMessage: (sessionId: string, body: { user_id: string; content: string }) =>
      post<InterviewTurn>(`/practice/sessions/${sessionId}/message`, body),

    completeSession: (sessionId: string, body: { user_id: string }) =>
      post<PracticeScorecard>(`/practice/sessions/${sessionId}/complete`, body),

    getHistory: (sessionId: string) =>
      get<PracticeHistoryResponse>(`/practice/sessions/${sessionId}/history`),

    getUserSessions: (userId: string) =>
      get<UserPracticeSessionsResponse>(`/practice/users/${userId}/sessions`),
  },
```

- [ ] **Step 3: Verify the frontend builds without TypeScript errors**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts src/lib/types.ts
git commit -m "feat(api-client): add practice interview API methods"
```

---

## Task 8: Create PracticeChat Component

**Files:**
- Create: `frontend/src/components/practice/PracticeChat.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Send } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import type { PracticeMessage } from '../../lib/types';

const PERSONA_LABELS: Record<string, string> = {
  hiring_manager: 'Hiring Manager',
  tech_lead: 'Tech Lead',
  culture_fit: 'Culture Fit',
};

const PHASE_LABELS: Record<string, string> = {
  intro: 'Introduction',
  technical: 'Technical Round',
  behavioral: 'Behavioral Round',
  culture: 'Culture Fit',
  closing: 'Closing',
};

interface PracticeChatProps {
  messages: PracticeMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  sessionComplete: boolean;
}

export default function PracticeChat({
  messages,
  isLoading,
  onSend,
  sessionComplete,
}: PracticeChatProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading || sessionComplete) return;
    onSend(trimmed);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  let lastPhase: string | undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Message thread */}
      <div
        className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
        role="log"
        aria-live="polite"
        aria-label="Interview conversation"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const showPhaseDivider =
              msg.role === 'assistant' &&
              msg.phase &&
              msg.phaseChanged &&
              msg.phase !== lastPhase;

            if (msg.phase) lastPhase = msg.phase;

            return (
              <React.Fragment key={i}>
                {/* Phase transition divider */}
                {showPhaseDivider && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 my-4"
                    aria-label={`Phase: ${PHASE_LABELS[msg.phase!] ?? msg.phase}`}
                  >
                    <div className="flex-1 h-px bg-blue-100" />
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-500 uppercase tracking-wider border border-blue-100">
                      {PHASE_LABELS[msg.phase!] ?? msg.phase}
                    </span>
                    <div className="flex-1 h-px bg-blue-100" />
                  </motion.div>
                )}

                {/* System / info messages */}
                {msg.role === 'system' && (
                  <div className="text-center">
                    <span className="text-xs px-3 py-1 rounded-full bg-slate-50 text-slate-400">
                      {msg.content}
                    </span>
                  </div>
                )}

                {/* Interviewer messages */}
                {msg.role === 'assistant' && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-start gap-1"
                  >
                    {msg.persona && (
                      <span className="text-[10px] font-bold text-slate-400 pl-1">
                        {PERSONA_LABELS[msg.persona] ?? msg.persona}
                      </span>
                    )}
                    <div
                      className="max-w-[88%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-white"
                      style={{ background: 'rgba(15, 23, 63, 0.90)' }}
                    >
                      {msg.content}
                    </div>
                  </motion.div>
                )}

                {/* Candidate messages */}
                {msg.role === 'user' && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[88%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed text-white bg-gradient-to-br from-blue-500 to-indigo-600">
                      {msg.content}
                    </div>
                  </motion.div>
                )}
              </React.Fragment>
            );
          })}
        </AnimatePresence>

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex items-start" aria-label="Interviewer is typing">
            <div
              className="px-4 py-3 rounded-2xl rounded-tl-sm"
              style={{ background: 'rgba(15, 23, 63, 0.90)' }}
            >
              <div className="flex gap-1">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {!sessionComplete && (
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 px-4 py-3 border-t border-slate-100 bg-white flex-shrink-0"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer… (Enter to send, Shift+Enter for new line)"
            rows={3}
            disabled={isLoading}
            aria-label="Your answer"
            className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-100
                       text-indigo-950 placeholder:text-slate-300 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                       transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="Send answer"
            className="flex-shrink-0 p-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-600
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                       focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            <Send size={16} />
          </button>
        </form>
      )}

      {sessionComplete && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-center">
          <p className="text-xs text-slate-400 font-medium">
            Interview complete — your scorecard is generating on the right
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "PracticeChat\|error" | head -10
```
Expected: no errors mentioning `PracticeChat`.

- [ ] **Step 3: Commit**

```bash
git add src/components/practice/PracticeChat.tsx
git commit -m "feat(ui): add PracticeChat conversation thread component"
```

---

## Task 9: Create PhaseTimeline Component

**Files:**
- Create: `frontend/src/components/practice/PhaseTimeline.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

const PHASES = [
  { id: 'intro', label: 'Introduction', persona: 'Hiring Manager' },
  { id: 'technical', label: 'Technical', persona: 'Tech Lead' },
  { id: 'behavioral', label: 'Behavioral', persona: 'Hiring Manager' },
  { id: 'culture', label: 'Culture Fit', persona: 'Culture Fit' },
  { id: 'closing', label: 'Closing', persona: 'Hiring Manager' },
];

interface PhaseTimelineProps {
  currentPhase: string;
  sessionComplete: boolean;
}

export default function PhaseTimeline({ currentPhase, sessionComplete }: PhaseTimelineProps) {
  const currentIdx = PHASES.findIndex((p) => p.id === currentPhase);

  return (
    <div
      className="w-52 rounded-2xl p-4"
      style={{ background: 'rgba(15, 23, 63, 0.92)', backdropFilter: 'blur(8px)' }}
      role="list"
      aria-label="Interview phase progress"
    >
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        Interview Phases
      </p>
      <div className="space-y-2">
        {PHASES.map((phase, idx) => {
          const isCompleted = idx < currentIdx || (sessionComplete && idx <= currentIdx);
          const isActive = phase.id === currentPhase && !sessionComplete;
          const isUpcoming = idx > currentIdx;

          return (
            <div
              key={phase.id}
              className="flex items-center gap-2.5"
              role="listitem"
              aria-label={`${phase.label}: ${isCompleted ? 'completed' : isActive ? 'active' : 'upcoming'}`}
            >
              {/* Node */}
              <div className="relative flex-shrink-0">
                {isCompleted ? (
                  <CheckCircle2 size={16} className="text-blue-400" aria-hidden="true" />
                ) : isActive ? (
                  <motion.div
                    className="w-4 h-4 rounded-full bg-blue-500 ring-4 ring-blue-500/30"
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    aria-hidden="true"
                  />
                ) : (
                  <div
                    className="w-4 h-4 rounded-full border-2 border-slate-600"
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Label */}
              <div>
                <p
                  className={`text-xs font-semibold leading-none ${
                    isCompleted
                      ? 'text-blue-400'
                      : isActive
                      ? 'text-white'
                      : 'text-slate-500'
                  }`}
                >
                  {phase.label}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">{phase.persona}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "PhaseTimeline\|error" | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/practice/PhaseTimeline.tsx
git commit -m "feat(ui): add PhaseTimeline stepper component for right panel"
```

---

## Task 10: Create PracticeScorecard Component

**Files:**
- Create: `frontend/src/components/practice/PracticeScorecard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { CheckCircle2, AlertTriangle, Award } from 'lucide-react';
import { motion } from 'motion/react';
import type { PracticeScorecard } from '../../lib/types';

const SCORE_DIMS = [
  { key: 'overall', label: 'Overall', color: '#3B82F6', ring: '#BFDBFE' },
  { key: 'technical', label: 'Technical', color: '#8B5CF6', ring: '#DDD6FE' },
  { key: 'behavioral', label: 'Behavioral', color: '#10B981', ring: '#A7F3D0' },
  { key: 'communication', label: 'Communication', color: '#F59E0B', ring: '#FDE68A' },
  { key: 'culture', label: 'Culture Fit', color: '#EC4899', ring: '#FBCFE8' },
] as const;

const RECOMMENDATION_CONFIG = {
  strong_yes: { label: 'Strong Yes', bg: 'bg-emerald-500', text: 'text-white' },
  yes: { label: 'Yes', bg: 'bg-blue-500', text: 'text-white' },
  maybe: { label: 'Maybe', bg: 'bg-amber-400', text: 'text-white' },
  no: { label: 'Not Yet', bg: 'bg-red-400', text: 'text-white' },
};

interface ScoreRingProps {
  score: number;
  label: string;
  color: string;
  ring: string;
  delay: number;
}

function ScoreRing({ score, label, color, ring, delay }: ScoreRingProps) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progress = score / 10;

  return (
    <motion.div
      className="flex flex-col items-center gap-1"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
    >
      <div className="relative w-14 h-14">
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          {/* Background ring */}
          <circle cx="28" cy="28" r={radius} fill="none" stroke={ring} strokeWidth="5" />
          {/* Progress ring */}
          <motion.circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{ delay: delay + 0.2, duration: 0.8, ease: 'easeOut' }}
            transform="rotate(-90 28 28)"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-extrabold text-indigo-950">{score.toFixed(1)}</span>
        </div>
      </div>
      <span className="text-[10px] font-semibold text-slate-500 text-center leading-tight">
        {label}
      </span>
    </motion.div>
  );
}

interface PracticeScorecardProps {
  scorecard: PracticeScorecard;
  onPracticeAgain: () => void;
  onBackToApplications: () => void;
}

export default function PracticeScorecardOverlay({
  scorecard,
  onPracticeAgain,
  onBackToApplications,
}: PracticeScorecardProps) {
  const recConfig = RECOMMENDATION_CONFIG[scorecard.recommendation];

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col rounded-none overflow-y-auto"
      style={{ background: 'rgba(248, 250, 252, 0.97)', backdropFilter: 'blur(12px)' }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      role="region"
      aria-label="Interview scorecard"
    >
      <div className="flex flex-col items-center px-8 py-8 gap-6 flex-1">

        {/* Recommendation banner */}
        <motion.div
          className={`px-5 py-2 rounded-full font-bold text-sm ${recConfig.bg} ${recConfig.text} shadow-lg`}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 280, damping: 20 }}
          role="status"
          aria-label={`Hiring recommendation: ${recConfig.label}`}
        >
          <Award size={14} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
          {recConfig.label}
        </motion.div>

        {/* Header */}
        <div className="text-center">
          <h2 className="text-xl font-extrabold text-indigo-950 tracking-tight">
            Interview Complete
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Your performance breakdown</p>
        </div>

        {/* Score rings */}
        <div className="flex flex-wrap justify-center gap-4">
          {SCORE_DIMS.map((dim, i) => (
            <ScoreRing
              key={dim.key}
              score={scorecard.scores[dim.key]}
              label={dim.label}
              color={dim.color}
              ring={dim.ring}
              delay={i * 0.08}
            />
          ))}
        </div>

        {/* Strengths */}
        <div className="w-full">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Strengths
          </p>
          <div className="space-y-1.5">
            {scorecard.strengths.map((s, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-2 text-sm text-slate-700"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.07 }}
              >
                <CheckCircle2
                  size={15}
                  className="text-emerald-500 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                {s}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Gaps */}
        <div className="w-full">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Areas to Improve
          </p>
          <div className="space-y-1.5">
            {scorecard.gaps.map((g, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-2 text-sm text-slate-700"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.07 }}
              >
                <AlertTriangle
                  size={15}
                  className="text-amber-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                {g}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 w-full pt-2">
          <button
            onClick={onBackToApplications}
            className="btn-secondary flex-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            Back to Applications
          </button>
          <button
            onClick={onPracticeAgain}
            className="btn-primary flex-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            Practice Again
          </button>
        </div>

      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "Scorecard\|error" | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/practice/PracticeScorecard.tsx
git commit -m "feat(ui): add PracticeScorecard overlay with animated score rings"
```

---

## Task 11: Create JobPickerModal Component

**Files:**
- Create: `frontend/src/components/practice/JobPickerModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Briefcase, Building2, ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { UserApplication } from '../../lib/types';

function scoreColor(score: number) {
  if (score >= 0.7) return 'text-emerald-600';
  if (score >= 0.4) return 'text-amber-500';
  return 'text-red-400';
}

interface JobPickerModalProps {
  onSelect: (jobId: string) => void;
}

export default function JobPickerModal({ onSelect }: JobPickerModalProps) {
  const { session } = useAuth();
  const [applications, setApplications] = useState<UserApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api
      .getApplications(session.userId)
      .then((res) => {
        const sorted = [...res.applications].sort(
          (a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)
        );
        setApplications(sorted);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load applications'))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Select a job to practice for"
      >
        <motion.div
          className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
          initial={{ scale: 0.93, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.93, opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-lg font-extrabold text-indigo-950 tracking-tight">
              Select a Job to Practice For
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Choose one of your applications to start a mock interview
            </p>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {loading && (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            )}

            {error && (
              <div className="p-6 text-sm text-red-500" role="alert">
                {error}
              </div>
            )}

            {!loading && !error && applications.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-400">
                No applications yet. Apply to some jobs first.
              </div>
            )}

            {applications.map((app) => {
              const scorePct = app.match_score != null ? Math.round(app.match_score * 100) : null;
              return (
                <button
                  key={app.job_id}
                  onClick={() => onSelect(app.job_id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left group focus-visible:outline-none focus-visible:bg-blue-50"
                  aria-label={`Practice interview for ${app.job_title}${app.company ? ` at ${app.company}` : ''}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                    <Briefcase size={15} className="text-blue-500" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-indigo-950 truncate">{app.job_title}</p>
                    {app.company && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building2 size={10} aria-hidden="true" />
                        {app.company}
                      </p>
                    )}
                  </div>
                  {scorePct != null && (
                    <span className={`text-sm font-bold ${scoreColor(app.match_score!)}`}>
                      {scorePct}%
                    </span>
                  )}
                  <ChevronRight
                    size={15}
                    className="text-slate-300 group-hover:text-slate-500 transition-colors"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "JobPickerModal\|error" | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/practice/JobPickerModal.tsx
git commit -m "feat(ui): add JobPickerModal for selecting job to practice for"
```

---

## Task 12: Refactor Practice.tsx

**Files:**
- Modify: `frontend/src/pages/user/Practice.tsx`

- [ ] **Step 1: Replace the entire file with the new implementation**

```tsx
import { Code2, Cpu, Database, Globe, Target, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import JobPickerModal from '../../components/practice/JobPickerModal';
import PracticeChat from '../../components/practice/PracticeChat';
import PracticeScorecardOverlay from '../../components/practice/PracticeScorecard';
import PhaseTimeline from '../../components/practice/PhaseTimeline';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { PracticeMessage, PracticeScorecard } from '../../lib/types';

// ─── Knowledge graph nodes (static visualization) ─────────────────────────────

const SKILL_NODES = [
  { id: 'react', label: 'React', icon: Code2, cx: 50, cy: 35, radius: 32, color: 'bg-blue-500', ring: 'ring-blue-300', connections: ['typescript', 'graphql'] },
  { id: 'typescript', label: 'TypeScript', icon: Code2, cx: 25, cy: 62, radius: 26, color: 'bg-indigo-500', ring: 'ring-indigo-300', connections: ['react'] },
  { id: 'graphql', label: 'GraphQL', icon: Database, cx: 73, cy: 60, radius: 24, color: 'bg-pink-500', ring: 'ring-pink-300', connections: ['react', 'nodejs'] },
  { id: 'nodejs', label: 'Node.js', icon: Cpu, cx: 50, cy: 80, radius: 22, color: 'bg-emerald-500', ring: 'ring-emerald-300', connections: ['graphql'] },
  { id: 'cloud', label: 'Cloud', icon: Globe, cx: 82, cy: 32, radius: 20, color: 'bg-sky-400', ring: 'ring-sky-300', connections: ['react'] },
];

const PHASE_ORDER = ['intro', 'technical', 'behavioral', 'culture', 'closing'];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Practice() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [jobInfo, setJobInfo] = useState<{ jobTitle: string; company: string } | null>(null);
  const [phase, setPhase] = useState('intro');
  const [messages, setMessages] = useState<PracticeMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Right panel state
  const [coachingHint, setCoachingHint] = useState<string | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [scorecard, setScorecard] = useState<PracticeScorecard | null>(null);

  // Modal state
  const [showJobPicker, setShowJobPicker] = useState(false);

  const jobIdFromUrl = searchParams.get('jobId');
  const startedRef = useRef(false);

  // ── Session start ────────────────────────────────────────────────────────────

  const startSession = useCallback(
    async (jobId: string) => {
      if (!session || startedRef.current) return;
      startedRef.current = true;
      setIsLoading(true);
      setStartError(null);
      try {
        const res = await api.practice.startSession({ user_id: session.userId, job_id: jobId });
        setSessionId(res.session_id);
        setJobInfo({ jobTitle: res.job_title, company: res.company });
        setPhase(res.phase);
        setMessages([
          {
            role: 'assistant',
            content: res.opening_message,
            persona: res.interviewer_persona,
            phase: res.phase,
            phaseChanged: false,
          },
        ]);
      } catch (e) {
        setStartError(e instanceof Error ? e.message : 'Failed to start session');
        startedRef.current = false;
      } finally {
        setIsLoading(false);
      }
    },
    [session]
  );

  useEffect(() => {
    if (!session) return;
    if (jobIdFromUrl) {
      startSession(jobIdFromUrl);
    } else {
      setShowJobPicker(true);
    }
  }, [session, jobIdFromUrl, startSession]);

  // ── Send message ─────────────────────────────────────────────────────────────

  async function handleSend(content: string) {
    if (!sessionId || !session || isLoading) return;
    setSendError(null);

    // Optimistically append user message
    setMessages((prev) => [...prev, { role: 'user', content, phase }]);
    setIsLoading(true);

    try {
      const turn = await api.practice.sendMessage(sessionId, {
        user_id: session.userId,
        content,
      });

      // Append assistant turn
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: turn.ai_response,
          persona: turn.interviewer_persona,
          phase: turn.phase,
          phaseChanged: turn.phase_changed,
        },
      ]);

      if (turn.phase_changed) setPhase(turn.phase);
      if (turn.coaching_hint) setCoachingHint(turn.coaching_hint);

      // Trigger scorecard when session is complete
      if (turn.session_complete) {
        await handleComplete();
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send message');
      // Remove the optimistic user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }

  // ── Complete session ──────────────────────────────────────────────────────────

  async function handleComplete() {
    if (!sessionId || !session) return;
    try {
      const card = await api.practice.completeSession(sessionId, { user_id: session.userId });
      setScorecard(card);
      setSessionComplete(true);
    } catch (e) {
      // Non-fatal: show inline error but don't crash the page
      setSendError('Could not generate scorecard. Your session has been saved.');
      setSessionComplete(true);
    }
  }

  // ── Phase progress (0–100%) ───────────────────────────────────────────────────

  const phaseIdx = PHASE_ORDER.indexOf(phase);
  const phaseProgress = Math.round(((phaseIdx + 1) / PHASE_ORDER.length) * 100);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <title>Practice Interview{jobInfo ? ` — ${jobInfo.jobTitle}` : ''} - Lumino</title>

      {/* Job picker modal (no jobId in URL) */}
      {showJobPicker && (
        <JobPickerModal
          onSelect={(jobId) => {
            setShowJobPicker(false);
            startSession(jobId);
            // Update URL without navigation
            window.history.replaceState({}, '', `/practice?jobId=${jobId}`);
          }}
        />
      )}

      <div className="h-[calc(100vh-4rem)] overflow-hidden flex bg-slate-50">

        {/* ── Left Panel: Interview Chat ── */}
        <div
          className="w-full lg:w-[480px] xl:w-[540px] flex flex-col border-r border-slate-100 bg-white"
          role="main"
          aria-label="Practice interview interface"
        >
          {/* Phase progress bar */}
          <div
            className="h-1 bg-slate-100 flex-shrink-0"
            role="progressbar"
            aria-valuenow={phaseIdx + 1}
            aria-valuemin={1}
            aria-valuemax={PHASE_ORDER.length}
            aria-label={`Phase ${phaseIdx + 1} of ${PHASE_ORDER.length}`}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
              animate={{ width: `${phaseProgress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          {/* Session header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
                <Target size={14} className="text-white" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-950">
                  {jobInfo?.jobTitle ?? 'Practice Session'}
                </p>
                <p className="text-[10px] text-slate-400">{jobInfo?.company ?? 'Loading…'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {phase !== 'intro' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wide">
                  {phase}
                </span>
              )}
              <button
                onClick={() => navigate('/applications')}
                className="btn-secondary btn-sm"
                aria-label="End session and return to applications"
              >
                End Session
              </button>
            </div>
          </div>

          {/* Errors */}
          {startError && (
            <div role="alert" className="mx-5 mt-3 alert-error text-sm">
              {startError}
            </div>
          )}
          {sendError && (
            <div role="alert" className="mx-5 mt-2 alert-error text-sm flex items-center justify-between">
              <span>{sendError}</span>
              <button
                className="text-red-400 hover:text-red-600 text-xs underline ml-2"
                onClick={() => setSendError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Chat (takes remaining vertical space) */}
          <div className="flex-1 overflow-hidden">
            <PracticeChat
              messages={messages}
              isLoading={isLoading}
              onSend={handleSend}
              sessionComplete={sessionComplete}
            />
          </div>
        </div>

        {/* ── Right Panel: Knowledge Graph + HUD ── */}
        <div
          className="hidden lg:flex flex-1 relative overflow-hidden bg-white"
          role="complementary"
          aria-label="Knowledge graph and session insights"
        >
          {/* Dot grid background */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
            aria-hidden="true"
          />

          {/* Graph title */}
          <div className="absolute top-6 left-6 z-10">
            <h2 className="text-sm font-bold text-indigo-950">Your Knowledge Graph</h2>
            <p className="text-xs text-slate-400 mt-0.5">Skills activated in this session</p>
          </div>

          {/* SVG connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
            {SKILL_NODES.flatMap((node) =>
              node.connections.map((targetId) => {
                const target = SKILL_NODES.find((n) => n.id === targetId);
                if (!target) return null;
                return (
                  <line
                    key={`${node.id}-${targetId}`}
                    x1={`${node.cx}%`} y1={`${node.cy}%`}
                    x2={`${target.cx}%`} y2={`${target.cy}%`}
                    stroke="#3B82F6" strokeWidth="1.5" strokeOpacity="0.2"
                  />
                );
              })
            )}
          </svg>

          {/* Skill nodes */}
          {SKILL_NODES.map((node, i) => (
            <motion.div
              key={node.id}
              className="absolute flex flex-col items-center gap-1.5"
              style={{ left: `${node.cx}%`, top: `${node.cy}%`, transform: 'translate(-50%, -50%)' }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, type: 'spring', stiffness: 260, damping: 20 }}
              role="img"
              aria-label={`Skill: ${node.label}`}
            >
              <motion.div
                className={`rounded-full ${node.color} flex items-center justify-center shadow-lg ring-4 ${node.ring} ring-opacity-30 cursor-pointer`}
                style={{ width: node.radius * 2, height: node.radius * 2 }}
                whileHover={{ scale: 1.15, y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              >
                <node.icon size={Math.max(14, node.radius * 0.55)} className="text-white" aria-hidden="true" />
              </motion.div>
              <span className="text-[11px] font-bold text-slate-600 bg-white/80 px-1.5 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                {node.label}
              </span>
            </motion.div>
          ))}

          {/* HUD: bottom-right */}
          <div className="absolute bottom-6 right-6 z-10 space-y-3">

            {/* Coaching insight card */}
            <AnimatePresence mode="wait">
              {coachingHint && (
                <motion.div
                  key={coachingHint}
                  className="w-64 rounded-2xl p-4"
                  style={{ background: 'rgba(15, 23, 63, 0.92)', backdropFilter: 'blur(8px)' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  role="complementary"
                  aria-label="Coaching insight"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center">
                      <Zap size={12} className="text-white" aria-hidden="true" />
                    </div>
                    <p className="text-xs font-bold text-white">Coaching Insight</p>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{coachingHint}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Phase timeline */}
            <PhaseTimeline currentPhase={phase} sessionComplete={sessionComplete} />
          </div>

          {/* Scorecard overlay */}
          <AnimatePresence>
            {sessionComplete && scorecard && (
              <PracticeScorecardOverlay
                scorecard={scorecard}
                onPracticeAgain={() => {
                  // Reset all state and reload with same job
                  startedRef.current = false;
                  setSessionId(null);
                  setMessages([]);
                  setPhase('intro');
                  setCoachingHint(null);
                  setSessionComplete(false);
                  setScorecard(null);
                  if (jobIdFromUrl) startSession(jobIdFromUrl);
                  else setShowJobPicker(true);
                }}
                onBackToApplications={() => navigate('/applications')}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles with no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "Practice\|error" | head -20
```
Expected: no errors.

- [ ] **Step 3: Start the dev server and manually smoke-test the page**

```bash
cd frontend && npm run dev
```

Navigate to `http://localhost:5173/practice`. Verify:
- JobPickerModal appears if no `?jobId` param
- Selecting a job starts the session and shows the opening AI message
- Knowledge graph renders on the right
- Phase timeline is visible bottom-right

- [ ] **Step 4: Commit**

```bash
git add src/pages/user/Practice.tsx
git commit -m "feat(ui): refactor Practice.tsx with live AI interview session"
```

---

## Task 13: Add "Practice Interview" Button to Applications Page

**Files:**
- Modify: `frontend/src/pages/user/Applications.tsx`

- [ ] **Step 1: Add the `GraduationCap` icon to the existing import and add the "Practice Interview" button in `ApplicationCard`**

Add `GraduationCap` to the lucide-react import:
```typescript
import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ExternalLink,
  GraduationCap,
  TrendingUp,
  Users,
} from 'lucide-react';
```

Replace the action buttons div (the `mt-4 flex justify-end` div at line ~88) with:
```tsx
      <div className="mt-4 flex gap-2 justify-end">
        <Link
          to={`/practice?jobId=${app.job_id}`}
          className="btn-secondary btn-sm inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          aria-label={`Practice interview for ${app.job_title}`}
        >
          <GraduationCap size={11} aria-hidden="true" />
          Practice Interview
        </Link>
        <Link
          to={`/user/match/${app.job_id}`}
          className="btn-secondary btn-sm inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          aria-label={`View match details for ${app.job_title}`}
        >
          View Match Details
          <ExternalLink size={11} aria-hidden="true" />
        </Link>
      </div>
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "Applications\|error" | head -10
```
Expected: no errors.

- [ ] **Step 3: Start dev server and verify the Applications page shows the new button**

Navigate to `http://localhost:5173/applications`. Each application card should now show a "Practice Interview" button alongside "View Match Details". Clicking it should navigate to `/practice?jobId=<id>` and auto-start the session.

- [ ] **Step 4: Commit**

```bash
git add src/pages/user/Applications.tsx
git commit -m "feat(ui): add Practice Interview button to ApplicationCard"
```

---

## Final Verification Checklist

- [ ] Backend starts cleanly: `uvicorn main:app --reload` — no import errors
- [ ] Swagger shows 5 practice endpoints under the "practice" tag
- [ ] `POST /api/v1/practice/sessions/start` returns a valid `StartPracticeResponse`
- [ ] `POST /api/v1/practice/sessions/{id}/message` returns a valid `InterviewTurn` with all fields
- [ ] `POST /api/v1/practice/sessions/{id}/complete` returns a `PracticeScorecard`
- [ ] Frontend builds: `npm run build` — no errors
- [ ] `/practice?jobId=X` auto-starts the session (no modal)
- [ ] `/practice` shows `JobPickerModal`, selecting a job starts the session
- [ ] Chat messages render correctly: interviewer left/dark, user right/blue
- [ ] Phase transitions show animated dividers in the chat
- [ ] Coaching hints animate in/out on the right panel
- [ ] Phase timeline updates as interview progresses
- [ ] Scorecard slides in on the right panel when session completes
- [ ] Applications page shows "Practice Interview" button on each card
- [ ] "Practice Again" resets state and starts a new session
- [ ] "Back to Applications" navigates to `/applications`
