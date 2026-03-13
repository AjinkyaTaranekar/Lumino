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
            "I want to review and improve my knowledge graph profile. "
            "Please start by asking me a focused First Principles question about my "
            "weakest or least-evidenced skill or experience area."
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
        """Fetch a compact summary of the entity's current graph state for the system prompt."""
        if entity_type == "user":
            skills = await self.neo4j.run_query(
                """
                MATCH (u:User {id: $id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                      -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(s:Skill)
                OPTIONAL MATCH (p:Project {user_id: $id})-[:DEMONSTRATES_SKILL]->(s)
                RETURN s.name AS name,
                       coalesce(s.years, 0) AS years,
                       coalesce(s.level, 'unknown') AS level,
                       count(p) AS projects
                ORDER BY projects ASC, years ASC
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
                RETURN p.name AS name, p.description AS description
                """,
                {"id": entity_id},
            )
            return {
                "entity_type": "user",
                "entity_id": entity_id,
                "skills": skills,
                "domains": domains,
                "projects": projects,
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
        """Build the system prompt for the First Principles interview."""
        # Find the weakest area (fewest projects + lowest years) for user profiles
        weakest_note = ""
        if graph_summary.get("skills"):
            skills = graph_summary["skills"]
            if skills:
                weakest = skills[0]  # already sorted ASC by projects, years in query
                weakest_note = (
                    f"\nWeakest evidenced skill: '{weakest['name']}' "
                    f"({weakest['years']} yrs, {weakest['projects']} supporting projects). "
                    "Start your interview here."
                )

        return (
            "You are an expert career coach conducting a First Principles interview to deeply "
            "understand a professional's skills and experience. Your goal is to ask one focused, "
            "probing question per turn that uncovers concrete evidence for skills and experiences.\n\n"
            "INTERVIEW RULES:\n"
            "1. Ask exactly ONE focused question per response — never multiple questions\n"
            "2. Start with the weakest/least-evidenced area (fewest supporting projects, lowest years)\n"
            "3. Ask 'walk me through...' or 'explain how you used X in Y context' style questions\n"
            "4. From the user's answer, extract concrete mutations (new skills, updated years, new projects)\n"
            "5. If the answer warrants no graph changes, leave all mutation lists empty\n"
            "6. ALWAYS respond with ONLY valid JSON — no text before or after\n\n"
            "CURRENT PROFILE STATE:\n"
            f"{json.dumps(graph_summary, indent=2)}"
            f"{weakest_note}\n\n"
            "RESPONSE SCHEMA (return ONLY valid JSON matching this):\n"
            f"{_PROPOSAL_SCHEMA}\n\n"
            "Node formats for add_nodes:\n"
            "  Skill:   {\"label\": \"Skill\", \"name\": \"...\", \"years\": 2, \"level\": \"intermediate\", \"family\": \"Web Frameworks\"}\n"
            "  Domain:  {\"label\": \"Domain\", \"name\": \"...\", \"years_experience\": 2, \"depth\": \"moderate\", \"family\": \"FinTech\"}\n"
            "  Project: {\"label\": \"Project\", \"name\": \"...\", \"description\": \"...\"}\n"
            "Edge format for add_edges: {\"from\": \"Project:Name\", \"rel\": \"DEMONSTRATES_SKILL\", \"to\": \"Skill:Name\"}\n"
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
