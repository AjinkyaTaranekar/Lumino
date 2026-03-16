"""
LLM Edit Agent — First Principles interview loop for graph editing.

Uses Groq (llama-3.3-70b-versatile) with JSON mode to produce structured
GraphMutationProposal responses. Every turn:
  1. Load full conversation history from SQLite session_messages
  2. Build Groq messages array (system + history + new user message)
  3. Call Groq with response_format={"type": "json_object"}
  4. Parse response as GraphMutationProposal
  5. Persist both user message and assistant proposal to session_messages
  6. Return the proposal
"""

import asyncio
import json
import logging
import os

from groq import AsyncGroq

from database.neo4j_client import Neo4jClient
from database.sqlite_client import SQLiteClient
from models.schemas import GraphMutation, GraphMutationProposal

logger = logging.getLogger(__name__)

_PROPOSAL_SCHEMA = json.dumps(GraphMutationProposal.model_json_schema(), indent=2)


class LLMEditAgent:
    def __init__(self, neo4j: Neo4jClient, sqlite: SQLiteClient):
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY environment variable not set")
        self._model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
        self._client = AsyncGroq(api_key=api_key)
        self.neo4j = neo4j
        self.sqlite = sqlite

    async def get_opening_question(
        self, session_id: str, entity_type: str, entity_id: str
    ) -> GraphMutationProposal:
        """
        Generate the opening First Principles question for a new edit session.
        Loads graph summary from Neo4j, builds context, calls Groq, persists to SQLite.
        """
        graph_summary = await self._get_graph_summary(entity_type, entity_id)
        system_msg = self._build_system_prompt(graph_summary)
        opening_user_msg = (
            "I want to build out my professional knowledge graph so it accurately reflects "
            "what I can actually do — not just what looks good on paper. "
            "Please start by asking me a specific, deep question about the area of my profile "
            "that has the weakest evidence or seems most vague. Be direct."
        )

        raw_json = await self._call_with_retry(
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": opening_user_msg},
            ]
        )
        proposal = GraphMutationProposal.model_validate_json(raw_json)

        # Persist the opening exchange
        await self._persist_message(session_id, "user", opening_user_msg, None)
        await self._persist_message(session_id, "assistant", proposal.follow_up_question, raw_json)
        return proposal

    async def get_next_question(
        self, session_id: str, entity_type: str, entity_id: str, user_message: str
    ) -> GraphMutationProposal:
        """
        Process a user reply and return the next proposal.
        Loads full history from SQLite, appends the new user message, calls Groq.
        """
        graph_summary = await self._get_graph_summary(entity_type, entity_id)
        system_msg = self._build_system_prompt(graph_summary)

        # Load conversation history
        history_rows = await self.sqlite.fetchall(
            "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        )
        messages = [{"role": "system", "content": system_msg}]
        for row in history_rows:
            if row["role"] in ("user", "assistant"):
                messages.append({"role": row["role"], "content": row["content"]})
        messages.append({"role": "user", "content": user_message})

        raw_json = await self._call_with_retry(messages=messages)
        proposal = GraphMutationProposal.model_validate_json(raw_json)

        # Persist
        await self._persist_message(session_id, "user", user_message, None)
        await self._persist_message(session_id, "assistant", proposal.follow_up_question, raw_json)
        return proposal

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _get_graph_summary(self, entity_type: str, entity_id: str) -> dict:
        """Fetch a rich 5W+H graph summary for the system prompt."""
        if entity_type == "user":
            skills = await self.neo4j.run_query(
                """
                MATCH (u:User {id: $id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                      -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(s:Skill)
                OPTIONAL MATCH (p:Project {user_id: $id})-[r:DEMONSTRATES_SKILL]->(s)
                RETURN s.name AS name,
                       coalesce(s.years, 0) AS years,
                       coalesce(s.level, 'unknown') AS level,
                       coalesce(s.evidence_strength, 'unknown') AS evidence_strength,
                       count(p) AS project_count,
                       collect(CASE WHEN r.context IS NOT NULL THEN r.context ELSE null END)[0..3] AS usage_contexts
                ORDER BY project_count ASC, years ASC
                """,
                {"id": entity_id},
            )
            domains = await self.neo4j.run_query(
                """
                MATCH (u:User {id: $id})-[:HAS_DOMAIN_CATEGORY]->(:DomainCategory)
                      -[:HAS_DOMAIN_FAMILY]->(:DomainFamily)-[:HAS_DOMAIN]->(d:Domain)
                RETURN d.name AS name,
                       coalesce(d.years_experience, 0) AS years,
                       coalesce(d.depth, 'unknown') AS depth
                ORDER BY years ASC
                """,
                {"id": entity_id},
            )
            projects = await self.neo4j.run_query(
                """
                MATCH (u:User {id: $id})-[:HAS_PROJECT_CATEGORY]->(:ProjectCategory)
                      -[:HAS_PROJECT]->(p:Project)
                OPTIONAL MATCH (p)-[r:DEMONSTRATES_SKILL]->(s:Skill)
                RETURN p.name AS name,
                       p.description AS description,
                       coalesce(p.contribution_type, 'unclear') AS contribution_type,
                       coalesce(p.has_measurable_impact, false) AS has_measurable_impact,
                       collect({skill: s.name, context: r.context, how: r.how, outcome: r.outcome}) AS skill_usages
                """,
                {"id": entity_id},
            )
            experiences = await self.neo4j.run_query(
                """
                MATCH (u:User {id: $id})-[:HAS_EXPERIENCE_CATEGORY]->(:ExperienceCategory)
                      -[:HAS_EXPERIENCE]->(e:Experience)
                RETURN e.title AS title,
                       e.company AS company,
                       coalesce(e.duration_years, 0) AS duration_years,
                       e.description AS description,
                       e.accomplishments AS accomplishments,
                       coalesce(e.contribution_type, 'unclear') AS contribution_type
                ORDER BY e.duration_years DESC
                """,
                {"id": entity_id},
            )
            assessment = await self.neo4j.run_query(
                """
                MATCH (u:User {id: $id})-[:HAS_ASSESSMENT]->(a:CriticalAssessment)
                RETURN a.overall_signal AS overall_signal,
                       a.seniority_assessment AS seniority_assessment,
                       a.candidate_identity AS candidate_identity,
                       a.honest_summary AS honest_summary,
                       a.red_flags AS red_flags,
                       a.inflated_skills AS inflated_skills,
                       a.interview_focus_areas AS interview_focus_areas
                """,
                {"id": entity_id},
            )
            return {
                "entity_type": "user",
                "entity_id": entity_id,
                "skills": skills,
                "domains": domains,
                "projects": projects,
                "experiences": experiences,
                "assessment": assessment[0] if assessment else None,
            }
        else:
            requirements = await self.neo4j.run_query(
                """
                MATCH (j:Job {id: $id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                      -[:HAS_SKILL_FAMILY_REQ]->(:JobSkillFamily)
                      -[:REQUIRES_SKILL]->(r:JobSkillRequirement)
                RETURN r.name AS name, r.importance AS importance, r.min_years AS min_years
                """,
                {"id": entity_id},
            )
            return {
                "entity_type": "job",
                "entity_id": entity_id,
                "requirements": requirements,
            }

    def _build_system_prompt(self, graph_summary: dict) -> str:
        """Build the deep 5W+H interview system prompt."""
        assessment = graph_summary.get("assessment") or {}
        candidate_identity = assessment.get("candidate_identity", "")
        honest_summary = assessment.get("honest_summary", "")
        red_flags = assessment.get("red_flags", "[]")
        inflated_skills = assessment.get("inflated_skills", "[]")
        interview_focus_areas = assessment.get("interview_focus_areas", "[]")

        # Find weakest-evidenced skill to anchor first question
        skills = graph_summary.get("skills", [])
        weakest_note = ""
        probe_targets = []
        if skills:
            weakest = skills[0]
            evidence = weakest.get("evidence_strength", "unknown")
            weakest_note = (
                f"\nWEAKEST SKILL: '{weakest['name']}' "
                f"(claimed {weakest['years']} yrs / {weakest['level']}, "
                f"evidence_strength={evidence}, backed by {weakest.get('project_count', 0)} project(s))."
            )
            # Collect skills where evidence doesn't match claimed level
            probe_targets = [
                s for s in skills
                if s.get("evidence_strength") in ("claimed_only", "mentioned_once", "unknown")
                or (s.get("level") in ("advanced", "expert") and s.get("project_count", 0) < 2)
            ]

        probe_list = "\n".join(
            f"  - {s['name']}: claimed {s['level']}/{s['years']}yrs but evidence_strength={s.get('evidence_strength','?')}"
            for s in probe_targets[:5]
        )

        return (
            "You are a senior engineering manager AND technical recruiter conducting a deep-dive "
            "5W+H profiling interview. Your dual goal:\n"
            "  1. BUILD a rich knowledge graph (mutations) from what the person tells you\n"
            "  2. CRITICALLY ASSESS whether their claims are genuinely backed by evidence\n\n"
            "You already have an initial profile assessment:\n"
            f"CANDIDATE IDENTITY: {candidate_identity or '(not yet assessed)'}\n"
            f"HONEST SUMMARY: {honest_summary or '(not yet assessed)'}\n"
            f"RED FLAGS: {red_flags}\n"
            f"INFLATED/UNSUPPORTED SKILLS: {inflated_skills}\n"
            f"PRIORITY PROBE AREAS: {interview_focus_areas}\n"
            f"{weakest_note}\n"
            + (f"\nSKILLS TO PROBE (low evidence vs claimed level):\n{probe_list}\n" if probe_list else "")
            + "\n"
            "INTERVIEW PHILOSOPHY — 5W+H FOR EVERY ANSWER:\n"
            "  WHO:   Were you the sole owner? part of a team? what was your specific role?\n"
            "  WHAT:  What exactly did you build/design/ship? Be precise.\n"
            "  WHEN:  When did this happen? How long did it take?\n"
            "  WHERE: What company/team/context? What scale/environment?\n"
            "  WHY:   Why did you make this technical choice? What problem did it solve?\n"
            "  HOW:   What specific technique/architecture/pattern did you use?\n\n"
            "INTERVIEW RULES:\n"
            "1. Ask exactly ONE focused, probing question per turn — never multiple questions\n"
            "2. PRIORITIZE probing skills with low evidence vs claimed level — these are the gaps\n"
            "3. When the profile is vague, ask for specifics: exact numbers, architecture, what broke\n"
            "4. Do NOT accept generic answers — if they say 'I used Python', ask 'what specifically "
            "   did you build with Python, at what scale, and what was the hardest part?'\n"
            "5. Look for ownership signals: 'we built' vs 'I built', 'contributed to' vs 'led'\n"
            "6. If a skill claim seems inflated, probe it directly: 'You list Kubernetes as expert — "
            "   walk me through the last production Kubernetes issue you debugged personally'\n"
            "7. After each answer, extract 5W+H mutations — update edge context with HOW/WHAT/WHY/OUTCOME\n"
            "8. Update evidence_strength on skills based on what they tell you\n"
            "9. If answer reveals a skill is lower than claimed, update the level downward\n"
            "10. NEVER accept vague answers — if the user says 'I worked on a payment system', "
            "ask: 'What exactly did YOU build in that system? Walk me through the specific component.'\n"
            "11. Always follow impact: 'What metric improved? What was the before/after?'\n"
            "12. Always probe ownership: 'When you say we/our/the team, what was YOUR specific role?'\n"
            "13. Dig into failures: 'What went wrong with this? What would you do differently?'\n"
            "14. Probe motivation: 'Why this approach and not [alternative]?'\n"
            "15. Do NOT move to a new topic until you have WHO, WHAT, HOW, WHY, and an OUTCOME\n"
            "16. Minimum 3 exchanges on a topic before switching\n"
            "17. ALWAYS respond with ONLY valid JSON — no text before or after\n\n"
            "CURRENT PROFILE STATE:\n"
            f"{json.dumps(graph_summary, indent=2)}\n\n"
            "RESPONSE SCHEMA (return ONLY valid JSON matching this):\n"
            f"{_PROPOSAL_SCHEMA}\n\n"
            "Node formats for add_nodes:\n"
            "  Skill:   {\"label\": \"Skill\", \"name\": \"...\", \"years\": 2, \"level\": \"intermediate\", "
            "\"family\": \"Web Frameworks\", \"evidence_strength\": \"project_backed\"}\n"
            "  Domain:  {\"label\": \"Domain\", \"name\": \"...\", \"years_experience\": 2, "
            "\"depth\": \"moderate\", \"family\": \"FinTech\"}\n"
            "  Project: {\"label\": \"Project\", \"name\": \"...\", \"description\": \"...\", "
            "\"contribution_type\": \"tech_lead\", \"has_measurable_impact\": true}\n"
            "Edge format — ALWAYS include 5W+H context on DEMONSTRATES_SKILL edges:\n"
            "  {\"from\": \"Project:Name\", \"rel\": \"DEMONSTRATES_SKILL\", \"to\": \"Skill:Name\",\n"
            "   \"context\": \"one-sentence summary\",\n"
            "   \"what\": \"what was built\", \"how\": \"specific technique\",\n"
            "   \"why\": \"why this skill was used\", \"scale\": \"10k users/day\",\n"
            "   \"outcome\": \"reduced latency by 40%\"}\n"
            "update_nodes example for correcting inflated skill:\n"
            "  {\"label\": \"Skill\", \"name\": \"Kubernetes\", \"level\": \"intermediate\", "
            "\"evidence_strength\": \"mentioned_once\"}\n"
            "remove_nodes: list of strings like \"Skill:GraphQL\" or just \"GraphQL\""
        )

    async def _persist_message(
        self, session_id: str, role: str, content: str, proposal_json: str | None
    ) -> None:
        from datetime import datetime, timezone
        await self.sqlite.execute(
            """
            INSERT INTO session_messages (session_id, role, content, proposal_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, role, content, proposal_json, datetime.now(timezone.utc).isoformat()),
        )

    async def _call_with_retry(self, messages: list) -> str:
        """Call Groq with exponential backoff (3 attempts)."""
        for attempt in range(3):
            try:
                resp = await self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.7,
                )
                return resp.choices[0].message.content
            except Exception as e:
                if attempt == 2:
                    raise
                wait = 2 ** attempt
                logger.warning(f"Groq error (attempt {attempt + 1}/3): {e}. Retrying in {wait}s")
                await asyncio.sleep(wait)
