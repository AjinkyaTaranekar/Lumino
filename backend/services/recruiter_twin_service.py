"""
RecruiterTwinService - recruiter-facing chat with a candidate digital twin.

The twin is evidence-grounded in:
- candidate practice sessions for the selected job
- candidate digital twin graph signals
- target job requirements
"""

import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone

from litellm import acompletion

from database.neo4j_client import Neo4jClient
from database.sqlite_client import SQLiteClient
from models.practice_schemas import (
    RecruiterTwinEvidence,
    RecruiterTwinHistoryMessage,
    RecruiterTwinHistoryResponse,
    RecruiterTwinTurnResponse,
    StartRecruiterTwinResponse,
)

logger = logging.getLogger(__name__)

_ALLOWED_EVIDENCE_SOURCES = {"practice_session", "digital_twin", "job_profile"}

_TWIN_TURN_SCHEMA = json.dumps(
    {
        "type": "object",
        "properties": {
            "twin_response": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "evidence": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "source": {
                            "type": "string",
                            "enum": ["practice_session", "digital_twin", "job_profile"],
                        },
                        "snippet": {"type": "string"},
                        "relevance": {"type": "string"},
                    },
                    "required": ["source", "snippet", "relevance"],
                },
            },
            "follow_up_question": {"type": "string"},
            "culture_follow_up_question": {"type": "string"},
            "next_best_followups": {
                "type": "array",
                "items": {"type": "string"},
            },
            "nightmare_questions": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": [
            "twin_response",
            "confidence",
            "evidence",
            "follow_up_question",
            "culture_follow_up_question",
            "next_best_followups",
            "nightmare_questions",
        ],
    },
    indent=2,
)


class RecruiterTwinService:
    def __init__(self, neo4j: Neo4jClient, sqlite: SQLiteClient):
        self.neo4j = neo4j
        self.sqlite = sqlite
        self._model = os.environ.get(
            "EDIT_AGENT_MODEL", os.environ.get("LLM_MODEL", "groq/llama-3.3-70b-versatile")
        )

    async def start_session(
        self,
        recruiter_id: str,
        user_id: str,
        job_id: str,
        nightmare_mode: bool,
    ) -> StartRecruiterTwinResponse:
        job_meta = await self._assert_access(recruiter_id, user_id, job_id)
        context = await self._build_context_bundle(user_id, job_id, job_meta)

        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        await self.sqlite.execute(
            """
            INSERT INTO recruiter_twin_sessions
                (session_id, recruiter_id, user_id, job_id, nightmare_mode, context_json, started_at, last_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                recruiter_id,
                user_id,
                job_id,
                1 if nightmare_mode else 0,
                json.dumps(context),
                now,
                now,
            ),
        )

        opening = self._build_opening_handshake(context, nightmare_mode)

        return StartRecruiterTwinResponse(
            session_id=session_id,
            recruiter_id=recruiter_id,
            user_id=user_id,
            job_id=job_id,
            job_title=context["job"]["title"],
            company=context["job"].get("company"),
            candidate_snapshot=context["candidate_snapshot"],
            opening_message=opening["opening_message"],
            confidence=opening["confidence"],
            evidence=opening["evidence"],
            follow_up_question=opening["follow_up_question"],
            culture_follow_up_question=opening["culture_follow_up_question"],
            next_best_followups=opening["next_best_followups"],
            nightmare_questions=opening["nightmare_questions"],
        )

    async def send_message(
        self,
        session_id: str,
        recruiter_id: str,
        content: str,
        nightmare_mode: bool,
    ) -> RecruiterTwinTurnResponse:
        session = await self._get_session(session_id)
        if session["recruiter_id"] != recruiter_id:
            raise PermissionError("Session does not belong to this recruiter")

        context = self._safe_json_loads(session.get("context_json"), {})
        if not context:
            job_meta = await self._assert_access(recruiter_id, session["user_id"], session["job_id"])
            context = await self._build_context_bundle(session["user_id"], session["job_id"], job_meta)
            await self.sqlite.execute(
                "UPDATE recruiter_twin_sessions SET context_json = ? WHERE session_id = ?",
                (json.dumps(context), session_id),
            )

        await self._persist_recruiter_message(session_id, content)

        rows = await self.sqlite.fetchall(
            "SELECT role, content FROM recruiter_twin_messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        )
        prompt_messages = self._build_conversation_messages(context, rows, nightmare_mode)
        turn = await self._generate_turn(prompt_messages, context, nightmare_mode)

        await self._persist_twin_message(session_id, turn)
        await self.sqlite.execute(
            "UPDATE recruiter_twin_sessions SET last_active = ?, nightmare_mode = ? WHERE session_id = ?",
            (datetime.now(timezone.utc).isoformat(), 1 if nightmare_mode else 0, session_id),
        )
        return RecruiterTwinTurnResponse(**turn)

    async def get_history(self, session_id: str, recruiter_id: str) -> RecruiterTwinHistoryResponse:
        session = await self._get_session(session_id)
        if session["recruiter_id"] != recruiter_id:
            raise PermissionError("Session does not belong to this recruiter")

        rows = await self.sqlite.fetchall(
            """
            SELECT role, content, confidence, evidence_json, follow_up_question,
                   nightmare_questions_json, created_at
            FROM recruiter_twin_messages
            WHERE session_id = ?
            ORDER BY id ASC
            """,
            (session_id,),
        )

        messages: list[RecruiterTwinHistoryMessage] = []
        for row in rows:
            evidence_items = self._safe_json_loads(row.get("evidence_json"), [])
            nightmare_questions = self._safe_json_loads(row.get("nightmare_questions_json"), [])
            messages.append(
                RecruiterTwinHistoryMessage(
                    role=row["role"],
                    content=row["content"],
                    confidence=row.get("confidence"),
                    evidence=[RecruiterTwinEvidence(**e) for e in evidence_items if isinstance(e, dict)],
                    follow_up_question=row.get("follow_up_question"),
                    culture_follow_up_question=(
                        row["follow_up_question"]
                        if row.get("follow_up_question") and self._is_culture_question(row["follow_up_question"])
                        else None
                    ),
                    next_best_followups=[row["follow_up_question"]] if row.get("follow_up_question") else [],
                    nightmare_questions=[q for q in nightmare_questions if isinstance(q, str)],
                    created_at=row["created_at"],
                )
            )

        return RecruiterTwinHistoryResponse(
            session_id=session_id,
            recruiter_id=session["recruiter_id"],
            user_id=session["user_id"],
            job_id=session["job_id"],
            nightmare_mode=bool(session.get("nightmare_mode")),
            messages=messages,
        )

    async def _assert_access(self, recruiter_id: str, user_id: str, job_id: str) -> dict:
        recruiter_norm = recruiter_id.strip().lower()
        user_norm = user_id.strip()
        job_norm = job_id.strip()

        job_rows = await self.neo4j.run_query(
            """
            MATCH (j:Job {id: $job_id})
            RETURN j.id AS id, j.title AS title, j.company AS company, j.recruiter_id AS recruiter_id
            """,
            {"job_id": job_norm},
        )
        if not job_rows:
            raise ValueError(f"Job '{job_norm}' not found")

        job_meta = job_rows[0]
        owner_raw = job_meta.get("recruiter_id")
        owner_id = str(owner_raw).strip()
        if owner_id and owner_id.lower() != recruiter_norm:
            raise PermissionError("You do not have access to this job")

        applied = await self.sqlite.fetchone(
            """
            SELECT 1 AS ok
            FROM analytics_events
            WHERE lower(trim(user_id)) = lower(trim(?))
              AND lower(trim(job_id)) = lower(trim(?))
              AND event_type = 'job_applied'
            LIMIT 1
            """,
            (user_norm, job_norm),
        )

        if not applied:
            graph_applied = await self.neo4j.run_query(
                """
                MATCH (u:User {id: $user_id})-[:APPLIED_TO]->(j:Job {id: $job_id})
                RETURN 1 AS ok
                LIMIT 1
                """,
                {"user_id": user_norm, "job_id": job_norm},
            )
            applied = graph_applied[0] if graph_applied else None

        if not applied:
            raise PermissionError(
                "Mirror interview is available only for candidates who have applied to this job"
            )

        return {
            "id": job_meta.get("id") or job_norm,
            "title": job_meta.get("title") or job_norm,
            "company": job_meta.get("company"),
        }

    async def _build_context_bundle(self, user_id: str, job_id: str, job_meta: dict) -> dict:
        practice = await self._fetch_practice_signals(user_id, job_id)
        user_profile = await self._fetch_user_profile(user_id)
        job_profile = await self._fetch_job_profile(job_id)
        snapshot = self._build_candidate_snapshot(practice, user_profile, job_profile)

        return {
            "job": {
                "id": job_id,
                "title": job_meta.get("title") or job_id,
                "company": job_meta.get("company"),
            },
            "candidate": {
                "id": user_id,
                "skills": user_profile["skills"],
                "experiences": user_profile["experiences"],
                "motivations": user_profile["motivations"],
            },
            "practice": practice,
            "job_profile": job_profile,
            "candidate_snapshot": snapshot,
        }

    async def _fetch_practice_signals(self, user_id: str, job_id: str) -> dict:
        answers = await self.sqlite.fetchall(
            """
            SELECT pm.content AS content
            FROM practice_messages pm
            JOIN practice_sessions ps ON ps.session_id = pm.session_id
            WHERE ps.user_id = ? AND ps.job_id = ? AND pm.role = 'user'
            ORDER BY pm.id DESC
            LIMIT 12
            """,
            (user_id, job_id),
        )

        scorecard = await self.sqlite.fetchone(
            """
            SELECT sc.recommendation, sc.strengths, sc.gaps, sc.generated_at
            FROM practice_scorecards sc
            JOIN practice_sessions ps ON ps.session_id = sc.session_id
            WHERE ps.user_id = ? AND ps.job_id = ?
            ORDER BY sc.generated_at DESC
            LIMIT 1
            """,
            (user_id, job_id),
        )

        strengths = self._safe_json_loads(scorecard.get("strengths") if scorecard else None, [])
        gaps = self._safe_json_loads(scorecard.get("gaps") if scorecard else None, [])

        return {
            "answer_count": len(answers),
            "latest_answers": [row["content"] for row in reversed(answers)],
            "latest_recommendation": scorecard.get("recommendation") if scorecard else None,
            "strengths": [s for s in strengths if isinstance(s, str)],
            "gaps": [g for g in gaps if isinstance(g, str)],
        }

    async def _fetch_user_profile(self, user_id: str) -> dict:
        skills = await self.neo4j.run_query(
            """
            MATCH (u:User {id: $user_id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                  -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(s:Skill)
            RETURN s.name AS name, coalesce(s.years, 0) AS years,
                   coalesce(s.evidence_strength, 'unknown') AS evidence_strength
            ORDER BY years DESC
            LIMIT 12
            """,
            {"user_id": user_id},
        )
        experiences = await self.neo4j.run_query(
            """
            MATCH (u:User {id: $user_id})-[:HAS_EXPERIENCE_CATEGORY]->(:ExperienceCategory)
                  -[:HAS_EXPERIENCE]->(e:Experience)
            RETURN e.title AS title, e.company AS company,
                   coalesce(e.duration_years, 0) AS duration_years
            ORDER BY duration_years DESC
            LIMIT 8
            """,
            {"user_id": user_id},
        )
        motivations = await self.neo4j.run_query(
            """
            MATCH (u:User {id: $user_id})-[:MOTIVATED_BY]->(m:Motivation)
            RETURN m.name AS name, m.category AS category, m.strength AS strength
            LIMIT 8
            """,
            {"user_id": user_id},
        )

        return {
            "skills": skills,
            "experiences": experiences,
            "motivations": motivations,
        }

    async def _fetch_job_profile(self, job_id: str) -> dict:
        required_skills = await self.neo4j.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(:JobSkillFamily)
                  -[:REQUIRES_SKILL]->(s:JobSkillRequirement)
            RETURN s.name AS name, s.importance AS importance
            ORDER BY s.importance DESC
            LIMIT 12
            """,
            {"job_id": job_id},
        )

        soft_skills = await self.neo4j.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:REQUIRES_QUALITY]->(s:SoftSkillRequirement)
            RETURN s.name AS name, s.expectation AS expectation, s.dealbreaker AS dealbreaker
            LIMIT 8
            """,
            {"job_id": job_id},
        )

        interview_signals = await self.neo4j.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:SCREENS_FOR]->(s:InterviewSignal)
            RETURN s.signal_type AS signal_type, s.what_to_watch_for AS what_to_watch_for
            LIMIT 8
            """,
            {"job_id": job_id},
        )

        return {
            "required_skills": required_skills,
            "soft_skills": soft_skills,
            "interview_signals": interview_signals,
        }

    def _build_candidate_snapshot(self, practice: dict, user_profile: dict, job_profile: dict) -> str:
        top_skills = [
            f"{item.get('name')} ({item.get('evidence_strength', 'unknown')})"
            for item in user_profile.get("skills", [])[:6]
            if item.get("name")
        ]
        experiences = [
            f"{item.get('title')} at {item.get('company') or 'unknown'}"
            for item in user_profile.get("experiences", [])[:4]
            if item.get("title")
        ]
        required = [item.get("name") for item in job_profile.get("required_skills", [])[:6] if item.get("name")]

        return "\n".join(
            [
                "Candidate mirror briefing:",
                f"- Required skills for this role: {required or ['not available']}.",
                f"- Strongest known candidate skills: {top_skills or ['not enough skill evidence yet']}.",
                f"- Relevant experience signals: {experiences or ['no structured experience evidence']}.",
                f"- Practice answers captured for this role: {practice.get('answer_count', 0)}.",
                f"- Latest practice recommendation: {practice.get('latest_recommendation') or 'not available'}.",
                f"- Practice strengths: {practice.get('strengths') or ['not available']}.",
                f"- Practice gaps: {practice.get('gaps') or ['not available']}.",
            ]
        )

    def _build_opening_handshake(self, context: dict, nightmare_mode: bool) -> dict:
        followups = self._fallback_followups(context)
        culture_question = self._derive_culture_followup(context)
        if culture_question not in followups:
            followups = [*followups[:2], culture_question]
        nightmare_questions = self._fallback_nightmare_questions(context) if nightmare_mode else []

        return {
            "twin_response": "",
            "opening_message": (
                "You ask first. Introduce yourself as the recruiter and ask your opening question. "
                "I will answer as an evidence-grounded mirror of the candidate."
            ),
            "confidence": 0.0,
            "evidence": self._fallback_evidence(context),
            "follow_up_question": followups[0],
            "culture_follow_up_question": culture_question,
            "next_best_followups": followups,
            "nightmare_questions": nightmare_questions,
        }

    def _build_conversation_messages(self, context: dict, rows: list[dict], nightmare_mode: bool) -> list[dict]:
        messages = [{"role": "system", "content": self._build_system_prompt(context, nightmare_mode)}]
        for row in rows:
            if row["role"] == "recruiter":
                messages.append({"role": "user", "content": row["content"]})
            elif row["role"] == "twin":
                messages.append({"role": "assistant", "content": row["content"]})
        return messages

    def _build_system_prompt(self, context: dict, nightmare_mode: bool) -> str:
        candidate = context["candidate"]
        job = context["job"]
        practice = context["practice"]
        job_profile = context["job_profile"]

        nightmare_instruction = (
            "Nightmare mode is ON. Include exactly 3 hard-but-fair probe questions that could expose weak spots "
            "for this role."
            if nightmare_mode
            else "Nightmare mode is OFF. Return an empty nightmare_questions array."
        )

        return (
            f"You are an evidence-grounded digital twin of candidate '{candidate['id']}' for recruiter simulation.\n\n"
            f"Target job: {job['title']} at {job.get('company') or 'Unknown company'}\n"
            f"Candidate snapshot:\n{context['candidate_snapshot']}\n\n"
            f"Practice answer excerpts: {practice.get('latest_answers', [])[:6]}\n"
            f"Motivations: {[m.get('name') for m in candidate.get('motivations', []) if m.get('name')][:6]}\n"
            f"Job signals: {[s.get('what_to_watch_for') for s in job_profile.get('interview_signals', []) if s.get('what_to_watch_for')][:6]}\n\n"
            "Rules:\n"
            "0. The recruiter asks first. Never start by asking a question proactively.\n"
            "1. Speak as the candidate mirror, in first person.\n"
            "2. Never invent facts not supported by provided evidence.\n"
            "3. If evidence is weak, say so explicitly and lower confidence.\n"
            "4. Keep response concise and interview-ready.\n"
            f"5. {nightmare_instruction}\n"
            "6. Use evidence snippets that are concrete and short.\n"
            "7. Return 3 next-best follow-up questions for the recruiter in next_best_followups.\n\n"
            "8. Return one explicit culture-oriented follow-up in culture_follow_up_question.\n\n"
            "Return JSON only matching this schema:\n"
            f"{_TWIN_TURN_SCHEMA}"
        )

    async def _generate_turn(self, messages: list[dict], context: dict, nightmare_mode: bool) -> dict:
        raw_json = await self._call_with_retry(messages)
        data = self._safe_json_loads(self._unwrap_json(raw_json), {})

        twin_response = str(data.get("twin_response") or "I do not have enough evidence to answer that reliably yet.")
        confidence = self._clamp_float(data.get("confidence"), 0.35)

        evidence_raw = data.get("evidence") if isinstance(data.get("evidence"), list) else []
        evidence: list[RecruiterTwinEvidence] = []
        for item in evidence_raw[:4]:
            if not isinstance(item, dict):
                continue
            source = str(item.get("source") or "practice_session")
            if source not in _ALLOWED_EVIDENCE_SOURCES:
                source = "practice_session"
            snippet = str(item.get("snippet") or "").strip()
            relevance = str(item.get("relevance") or "").strip()
            if not snippet:
                continue
            evidence.append(
                RecruiterTwinEvidence(
                    source=source,
                    snippet=snippet[:350],
                    relevance=(relevance or "Supports this answer.")[:220],
                )
            )

        if not evidence:
            evidence = self._fallback_evidence(context)

        follow_up_question = str(
            data.get("follow_up_question")
            or "Can you walk me through one measurable outcome you owned end-to-end?"
        ).strip()

        culture_follow_up_question = str(data.get("culture_follow_up_question") or "").strip()
        if not culture_follow_up_question or not self._is_culture_question(culture_follow_up_question):
            culture_follow_up_question = self._derive_culture_followup(context)

        next_best_followups_raw = (
            data.get("next_best_followups") if isinstance(data.get("next_best_followups"), list) else []
        )
        next_best_followups = [str(q).strip() for q in next_best_followups_raw if str(q).strip()][:3]
        if not next_best_followups:
            next_best_followups = self._fallback_followups(context)
        if follow_up_question and follow_up_question not in next_best_followups:
            next_best_followups = [follow_up_question, *next_best_followups][:3]
        if culture_follow_up_question not in next_best_followups:
            if len(next_best_followups) >= 3:
                next_best_followups = [
                    next_best_followups[0],
                    culture_follow_up_question,
                    next_best_followups[1],
                ]
            else:
                next_best_followups.append(culture_follow_up_question)
        follow_up_question = next_best_followups[0]

        nightmare_questions = []
        if nightmare_mode:
            nightmare_raw = data.get("nightmare_questions") if isinstance(data.get("nightmare_questions"), list) else []
            nightmare_questions = [str(q).strip() for q in nightmare_raw if str(q).strip()][:3]
            if not nightmare_questions:
                nightmare_questions = self._fallback_nightmare_questions(context)

        return {
            "twin_response": twin_response,
            "confidence": confidence,
            "evidence": evidence,
            "follow_up_question": follow_up_question,
            "culture_follow_up_question": culture_follow_up_question,
            "next_best_followups": next_best_followups,
            "nightmare_questions": nightmare_questions,
        }

    def _fallback_evidence(self, context: dict) -> list[RecruiterTwinEvidence]:
        practice_answer = None
        for answer in context.get("practice", {}).get("latest_answers", []):
            if isinstance(answer, str) and answer.strip():
                practice_answer = answer.strip()
                break

        if practice_answer:
            return [
                RecruiterTwinEvidence(
                    source="practice_session",
                    snippet=practice_answer[:280],
                    relevance="Recent practice answer from this candidate for the same job.",
                )
            ]

        skill = None
        for s in context.get("candidate", {}).get("skills", []):
            if isinstance(s, dict) and s.get("name"):
                skill = f"{s['name']} ({s.get('evidence_strength', 'unknown')})"
                break

        return [
            RecruiterTwinEvidence(
                source="digital_twin",
                snippet=skill or "No high-confidence candidate evidence captured yet.",
                relevance="Fallback from structured profile evidence.",
            )
        ]

    def _fallback_nightmare_questions(self, context: dict) -> list[str]:
        required = [
            item.get("name")
            for item in context.get("job_profile", {}).get("required_skills", [])[:3]
            if isinstance(item, dict) and item.get("name")
        ]
        if not required:
            return [
                "Describe the hardest production incident you owned. What was your exact role and what changed after the fix?",
                "Tell me about a project where your first technical approach failed. How did you diagnose and recover?",
                "What is one skill in this role you are currently weakest at, and what evidence shows you can close that gap quickly?",
            ]

        return [
            f"Walk me through a high-stakes production scenario where {required[0]} failed. What would you do in the first 15 minutes?",
            f"Give a concrete example where you used {required[1] if len(required) > 1 else required[0]} under severe ambiguity. What was the measurable result?",
            f"If I ask your former teammate about your {required[2] if len(required) > 2 else required[0]} depth, what specific proof would they cite?",
        ]

    @staticmethod
    def _is_culture_question(question: str) -> bool:
        q = question.strip().lower()
        if not q:
            return False
        culture_keywords = [
            "culture",
            "team",
            "collaboration",
            "feedback",
            "conflict",
            "values",
            "communication",
            "stakeholder",
            "ownership style",
            "working style",
        ]
        return any(token in q for token in culture_keywords)

    def _derive_culture_followup(self, context: dict) -> str:
        soft_skills = context.get("job_profile", {}).get("soft_skills", [])
        for item in soft_skills:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            expectation = item.get("expectation")
            if name and expectation:
                return (
                    f"This team values {name.lower()}. Can you share a specific example of how you demonstrated it "
                    f"in a team setting, especially around {expectation.lower()}?"
                )
            if name:
                return (
                    f"What does {name.lower()} look like in your day-to-day behavior with teammates and stakeholders?"
                )

        return (
            "Describe a time you had to adapt to a team's working culture quickly. "
            "What did you change in your communication or collaboration style?"
        )

    def _fallback_followups(self, context: dict) -> list[str]:
        culture_question = self._derive_culture_followup(context)
        required = [
            item.get("name")
            for item in context.get("job_profile", {}).get("required_skills", [])[:3]
            if isinstance(item, dict) and item.get("name")
        ]

        if not required:
            return [
                "What was the most complex decision you made in your last role, and what tradeoff did you accept?",
                "Can you walk me through one project end-to-end with measurable outcomes?",
                culture_question,
            ]

        return [
            f"Can you share one concrete example where you applied {required[0]} under production pressure?",
            f"How did you measure success when using {required[1] if len(required) > 1 else required[0]}?",
            culture_question,
        ]

    async def _persist_recruiter_message(self, session_id: str, content: str) -> None:
        await self.sqlite.execute(
            """
            INSERT INTO recruiter_twin_messages
                (session_id, role, content, created_at)
            VALUES (?, 'recruiter', ?, ?)
            """,
            (session_id, content, datetime.now(timezone.utc).isoformat()),
        )

    async def _persist_twin_message(self, session_id: str, turn: dict) -> None:
        evidence_payload = [item.model_dump() for item in turn["evidence"]]
        await self.sqlite.execute(
            """
            INSERT INTO recruiter_twin_messages
                (session_id, role, content, confidence, evidence_json, follow_up_question,
                 nightmare_questions_json, created_at)
            VALUES (?, 'twin', ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                turn["twin_response"],
                turn["confidence"],
                json.dumps(evidence_payload),
                turn["follow_up_question"],
                json.dumps(turn["nightmare_questions"]),
                datetime.now(timezone.utc).isoformat(),
            ),
        )

    async def _get_session(self, session_id: str) -> dict:
        row = await self.sqlite.fetchone(
            "SELECT * FROM recruiter_twin_sessions WHERE session_id = ?",
            (session_id,),
        )
        if not row:
            raise ValueError(f"Recruiter twin session '{session_id}' not found")
        return row

    async def _call_with_retry(self, messages: list[dict]) -> str:
        max_attempts = 5
        for attempt in range(max_attempts):
            try:
                resp = await acompletion(
                    model=self._model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.7,
                )
                return resp.choices[0].message.content
            except Exception as exc:
                if attempt == max_attempts - 1:
                    raise

                error_str = str(exc)
                match_s = re.search(r"try again in (\d+(?:\.\d+)?)s", error_str, re.IGNORECASE)
                match_ms = re.search(r"try again in (\d+(?:\.\d+)?)ms", error_str, re.IGNORECASE)
                if match_s:
                    wait = float(match_s.group(1)) + 2.0
                    logger.warning(
                        "Rate limit on recruiter twin call (attempt %s/%s). Waiting %.1fs",
                        attempt + 1,
                        max_attempts,
                        wait,
                    )
                elif match_ms:
                    wait = float(match_ms.group(1)) / 1000.0 + 2.0
                    logger.warning(
                        "Rate limit on recruiter twin call (attempt %s/%s). Waiting %.1fs",
                        attempt + 1,
                        max_attempts,
                        wait,
                    )
                else:
                    wait = 2 ** attempt
                    logger.warning(
                        "Recruiter twin LLM error (attempt %s/%s): %s. Retrying in %ss",
                        attempt + 1,
                        max_attempts,
                        exc,
                        wait,
                    )
                await asyncio.sleep(wait)

    @staticmethod
    def _unwrap_json(raw: str) -> str:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list) and parsed:
                return json.dumps(parsed[0])
        except (json.JSONDecodeError, IndexError, TypeError):
            pass
        return raw

    @staticmethod
    def _safe_json_loads(value, default):
        if value is None:
            return default
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except Exception:
            return default

    @staticmethod
    def _clamp_float(value, default: float) -> float:
        try:
            as_float = float(value)
        except Exception:
            return default
        return max(0.0, min(1.0, as_float))
