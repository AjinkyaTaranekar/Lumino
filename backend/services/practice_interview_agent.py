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
from models.practice_schemas import InterviewTurn, PracticeScorecard

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
        return PracticeScorecard.model_validate(data)

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
            f"Skills on profile: {[(s.get('name') or '?') + '(' + (s.get('evidence_strength') or 'unknown') + ')' for s in user_skills[:12]]}\n"
            f"Weak-evidence skills to probe: {[s['name'] for s in weak_skills[:5]]}\n"
            f"Skill gaps vs job requirements: {list(skill_gaps)[:5]}\n"
            f"Experiences: {[(e.get('title') or '?') + ' @ ' + (e.get('company') or '?') for e in user_experiences[:4]]}\n\n"
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
        """Call LLM with retry logic. Rate limit errors wait the suggested time from
        the error message + a 2s buffer. Other errors use exponential backoff.

        Args:
            messages: List of message dicts with 'role' and 'content' keys.

        Returns:
            Raw JSON string from LLM response (potentially unwrapped from list wrapper).

        Raises:
            Exception: On max retry attempts exhausted.
        """
        max_attempts = 5
        for attempt in range(max_attempts):
            try:
                from services.llm_utils import acompletion_json
                return await acompletion_json(self._model, messages, temperature=1.0)
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
