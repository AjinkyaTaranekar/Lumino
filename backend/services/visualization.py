"""
Graph visualization service - generates an interactive pyvis HTML file.

Fetches the full subgraph for a user (all nodes up to depth 6) from Neo4j
and renders it as a force-directed graph using pyvis.

Uses apoc.path.subgraphAll for subgraph extraction (requires APOC plugin).
Falls back to pure-Cypher variable-length path if APOC is unavailable.

IMPORTANT: Always use net.write_html(filepath), NOT net.show(filepath).
net.show() calls webbrowser.open() which hangs in server environments.
"""

import logging
import os

import networkx as nx
from pyvis.network import Network

from database.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

# ── Lumino light-theme palette ────────────────────────────────────────────────
# All colours chosen to be readable on a white/slate-50 background.
# Darker hub nodes get white font; lighter leaf nodes get dark (#0f172a) font.
NODE_TYPE_COLORS: dict[str, str] = {
    # ── User technical nodes ───────────────────────────────────────────────────
    "User": "#3B82F6",              # blue-500  - anchor node
    "SkillCategory": "#6366F1",     # indigo-500
    "SkillFamily": "#818CF8",       # indigo-400
    "Skill": "#A5B4FC",             # indigo-300 - leaf, weight-scaled size
    "ProjectCategory": "#059669",   # emerald-600
    "Project": "#34D399",           # emerald-400
    "DomainCategory": "#7C3AED",    # violet-600
    "DomainFamily": "#A78BFA",      # violet-400
    "Domain": "#C4B5FD",            # violet-300
    "ExperienceCategory": "#D97706",# amber-600
    "Experience": "#FBBF24",        # amber-400
    "PreferenceCategory": "#0284C7",# sky-600
    "Preference": "#38BDF8",        # sky-400
    "PatternCategory": "#EA580C",   # orange-600
    "ProblemSolvingPattern": "#FB923C", # orange-400
    # ── User extended profile nodes ────────────────────────────────────────────
    "EducationCategory": "#0369A1", # sky-700
    "Education": "#38BDF8",         # sky-400 - degree/diploma
    "CertificationCategory": "#0F766E", # teal-700
    "Certification": "#2DD4BF",     # teal-400 - cert/license
    "AchievementCategory": "#B45309", # amber-700
    "Achievement": "#FCD34D",       # amber-300 - award/prize
    "PublicationCategory": "#7E22CE", # purple-800
    "Publication": "#C084FC",       # purple-400 - paper/article
    "CourseworkCategory": "#1D4ED8", # blue-700
    "Course": "#60A5FA",            # blue-400 - course
    "LanguageCategory": "#065F46",  # emerald-900
    "Language": "#6EE7B7",          # emerald-300 - spoken language
    "VolunteerCategory": "#9D174D", # pink-800
    "VolunteerWork": "#F9A8D4",     # pink-300 - volunteer/community
    # ── User human-portrait nodes (digital twin) ───────────────────────────────
    "Anecdote": "#E11D48",          # rose-600  - personal story
    "Motivation": "#F97316",        # orange-500 - what drives them
    "Value": "#8B5CF6",             # violet-500 - core beliefs
    "Goal": "#10B981",              # emerald-500 - aspirations
    "CultureIdentity": "#0EA5E9",   # sky-500   - how they work
    "BehavioralInsight": "#F59E0B", # amber-500 - observed patterns
    # ── Job nodes ─────────────────────────────────────────────────────────────
    "Job": "#DC2626",               # red-600
    "JobSkillRequirements": "#1D4ED8",  # blue-700
    "JobSkillFamily": "#3B82F6",    # blue-500
    "JobSkillRequirement": "#93C5FD",   # blue-300
    "JobDomainRequirements": "#6D28D9", # violet-700
    "JobDomainFamily": "#8B5CF6",   # violet-500
    "JobDomainRequirement": "#C4B5FD",  # violet-300
    "JobCultureRequirements": "#047857",# emerald-700
    "WorkStyle": "#34D399",         # emerald-400
    # ── Job deep-profile nodes (recruiter interview) ───────────────────────────
    "TeamComposition": "#334155",   # slate-700
    "RoleContext": "#475569",        # slate-600
    "HiringGoal": "#EA580C",        # orange-600
    "SoftSkillRequirement": "#FBBF24",  # amber-400
    "TeamCultureIdentity": "#10B981",   # emerald-500
    "SuccessMetric": "#22C55E",     # green-500
    "InterviewSignal": "#EAB308",   # yellow-500
    # ── New deep job profile nodes ─────────────────────────────────────────────
    "EducationRequirement": "#0369A1",  # sky-700 - required degrees
    "PreferredQualification": "#0891B2",# cyan-600 - nice-to-haves
    "CompanyProfile": "#9333EA",    # purple-600 - mission/values
    "HiringTeam": "#1E40AF",        # blue-800  - team context
    "CompensationPackage": "#15803D",   # green-700 - salary/equity
    "RoleExpectation": "#B45309",   # amber-700 - responsibilities
    "JobSoftRequirement": "#C2410C",    # orange-700 - personality traits
}

# Nodes whose background is dark enough to warrant white label text
_DARK_FONT_NODES: frozenset[str] = frozenset({
    "User", "SkillCategory", "ProjectCategory", "DomainCategory",
    "ExperienceCategory", "PreferenceCategory", "PatternCategory",
    "Anecdote", "Value", "Goal", "CultureIdentity", "BehavioralInsight",
    "Job", "JobSkillRequirements", "JobDomainRequirements", "JobCultureRequirements",
    "TeamComposition", "RoleContext", "HiringGoal", "TeamCultureIdentity",
    "SuccessMetric", "Motivation",
    # Extended profile category nodes (dark backgrounds)
    "EducationCategory", "CertificationCategory", "AchievementCategory",
    "PublicationCategory", "CourseworkCategory", "LanguageCategory", "VolunteerCategory",
    # New deep job profile nodes (dark backgrounds)
    "EducationRequirement", "CompanyProfile", "HiringTeam",
    "CompensationPackage", "RoleExpectation", "JobSoftRequirement",
})


def _node_font(node_type: str) -> dict:
    """Return vis.js font dict for a node type."""
    color = "white" if node_type in _DARK_FONT_NODES else "#0f172a"
    return {"color": color, "size": 11}


NODE_SIZES: dict[str, int] = {
    "User": 40, "Job": 35,
    "SkillCategory": 25, "DomainCategory": 25,
    "ProjectCategory": 25, "ExperienceCategory": 20,
    "SkillFamily": 18, "DomainFamily": 18,
    "Skill": 14, "Domain": 14, "Project": 16,
    "Experience": 14, "Preference": 12,
    "ProblemSolvingPattern": 12,
    # Extended profile nodes
    "EducationCategory": 22, "Education": 16,
    "CertificationCategory": 22, "Certification": 14,
    "AchievementCategory": 20, "Achievement": 14,
    "PublicationCategory": 20, "Publication": 14,
    "CourseworkCategory": 18, "Course": 12,
    "LanguageCategory": 18, "Language": 12,
    "VolunteerCategory": 18, "VolunteerWork": 13,
    # User human-portrait nodes
    "Anecdote": 16, "Motivation": 16, "Value": 14,
    "Goal": 16, "CultureIdentity": 18, "BehavioralInsight": 12,
    # Job deep-profile nodes (legacy)
    "TeamComposition": 16, "RoleContext": 14, "HiringGoal": 14,
    "SoftSkillRequirement": 14, "TeamCultureIdentity": 16,
    "SuccessMetric": 14, "InterviewSignal": 12,
    # New deep job profile nodes
    "EducationRequirement": 16, "PreferredQualification": 14,
    "CompanyProfile": 22, "HiringTeam": 18,
    "CompensationPackage": 18, "RoleExpectation": 18,
    "JobSoftRequirement": 14,
}

DEFAULT_NODE_COLOR = "#94A3B8"  # slate-400
DEFAULT_NODE_SIZE = 12

# APOC labelFilter strings - blocks traversal INTO these node types
# Used in apoc.path.subgraphAll to prevent cross-user contamination
_USER_LABEL_FILTER = (
    "-Job|-JobSkillRequirements|-JobSkillFamily|-JobSkillRequirement"
    "|-JobDomainRequirements|-JobDomainFamily|-JobDomainRequirement"
    "|-JobCultureRequirements|-WorkStyle"
    "|-TeamComposition|-RoleContext|-HiringGoal"
    "|-SoftSkillRequirement|-TeamCultureIdentity|-SuccessMetric|-InterviewSignal"
    "|-EducationRequirement|-PreferredQualification"
    "|-CompanyProfile|-HiringTeam|-CompensationPackage"
    "|-RoleExpectation|-JobSoftRequirement"
)
_JOB_LABEL_FILTER = (
    "-User|-SkillCategory|-SkillFamily|-Skill"
    "|-DomainCategory|-DomainFamily|-Domain"
    "|-ProjectCategory|-Project"
    "|-ExperienceCategory|-Experience"
    "|-PreferenceCategory|-Preference"
    "|-PatternCategory|-ProblemSolvingPattern"
    "|-Anecdote|-Motivation|-Value|-Goal|-CultureIdentity|-BehavioralInsight"
    "|-EducationCategory|-Education"
    "|-CertificationCategory|-Certification"
    "|-AchievementCategory|-Achievement"
    "|-PublicationCategory|-Publication"
    "|-CourseworkCategory|-Course"
    "|-LanguageCategory|-Language"
    "|-VolunteerCategory|-VolunteerWork"
    # Prevent APOC bidirectional traversal from following shared JobTag nodes
    # into other Job subgraphs. JobTag nodes are global singletons (no job_id),
    # so without this filter Job A → JobTag("remote") ← Job B pulls in Job B's
    # entire subgraph. The root Job itself is never filtered by APOC labelFilter.
    "|-Job|-JobTag"
    # NOTE: New deep job profile nodes are intentionally NOT excluded — they
    # belong to the job subgraph and should appear in job model visualizations.
)

# Types that belong exclusively to the user hierarchy
USER_NODE_TYPES: frozenset[str] = frozenset({
    "User",
    "SkillCategory", "SkillFamily", "Skill",
    "ProjectCategory", "Project",
    "DomainCategory", "DomainFamily", "Domain",
    "ExperienceCategory", "Experience",
    "PreferenceCategory", "Preference",
    "PatternCategory", "ProblemSolvingPattern",
    # Extended profile nodes
    "EducationCategory", "Education",
    "CertificationCategory", "Certification",
    "AchievementCategory", "Achievement",
    "PublicationCategory", "Publication",
    "CourseworkCategory", "Course",
    "LanguageCategory", "Language",
    "VolunteerCategory", "VolunteerWork",
    # Digital twin - human portrait nodes
    "Anecdote", "Motivation", "Value", "Goal",
    "CultureIdentity", "BehavioralInsight",
})

# Types that belong exclusively to the job hierarchy
JOB_NODE_TYPES: frozenset[str] = frozenset({
    "Job",
    "JobSkillRequirements", "JobSkillFamily", "JobSkillRequirement",
    "JobDomainRequirements", "JobDomainFamily", "JobDomainRequirement",
    "JobCultureRequirements", "WorkStyle",
    # Deep job profile nodes (recruiter interview)
    "TeamComposition", "RoleContext", "HiringGoal",
    "SoftSkillRequirement", "TeamCultureIdentity",
    "SuccessMetric", "InterviewSignal",
    # New deep job profile nodes
    "EducationRequirement", "PreferredQualification",
    "CompanyProfile", "HiringTeam", "CompensationPackage",
    "RoleExpectation", "JobSoftRequirement",
})


class VisualizationService:
    def __init__(self, client: Neo4jClient, output_dir: str = "./outputs"):
        self.client = client
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    async def generate_user_graph(self, user_id: str) -> str:
        """
        Generate an interactive pyvis HTML graph for a user.
        Returns the filepath of the generated HTML file.
        """
        nodes_data, edges_data = await self._fetch_graph_data(
            user_id, "User", label_filter=_USER_LABEL_FILTER
        )

        # Safety post-filter: drop any job-hierarchy nodes that slipped through
        allowed_ids = {n["id"] for n in nodes_data if n.get("type", "") in USER_NODE_TYPES}
        nodes_data = [n for n in nodes_data if n["id"] in allowed_ids]
        edges_data = [e for e in edges_data
                      if e["source_id"] in allowed_ids and e["target_id"] in allowed_ids]

        if not nodes_data:
            logger.warning(f"No nodes found for user {user_id}")

        G = nx.DiGraph()

        for node in nodes_data:
            node_id = node.get("id", "")
            label = str(node.get("label", ""))[:30]
            node_type = node.get("type", "default")
            weight = node.get("weight")

            if node_type in ("Skill", "Domain") and weight is not None:
                size = int(10 + weight * 30)  # maps 0.0→10, 1.0→40
                years = node.get("years") or node.get("years_experience")
                level = node.get("level") or node.get("depth") or "n/a"
                years_str = f"{years} yrs" if years is not None else "n/a yrs"
                title = f"{label}  ·  {node_type} | {years_str} | {level} | weight: {weight:.2f}"
            else:
                size = NODE_SIZES.get(node_type, DEFAULT_NODE_SIZE)
                title = f"{label}  ·  {node_type}"

            G.add_node(
                node_id,
                label=label,
                title=title,
                color=NODE_TYPE_COLORS.get(node_type, DEFAULT_NODE_COLOR),
                size=size,
                font=_node_font(node_type),
            )

        for edge in edges_data:
            src = edge.get("source_id", "")
            tgt = edge.get("target_id", "")
            rel = edge.get("rel_type", "")
            if src in G and tgt in G:
                G.add_edge(src, tgt, title=rel, label=rel, color="#94A3B8")

        net = Network(
            height="100vh",
            width="100%",
            directed=True,
            bgcolor="#f8fafc",
            font_color="#0f172a",
            notebook=False,
            cdn_resources="in_line",
        )
        net.from_nx(G)

        net.set_options("""
        {
          "physics": {
            "enabled": true,
            "solver": "forceAtlas2Based",
            "forceAtlas2Based": {
              "springLength": 130,
              "springConstant": 0.05,
              "damping": 0.5,
              "avoidOverlap": 0.2
            },
            "stabilization": {
              "enabled": true,
              "iterations": 250
            }
          },
          "layout": {
            "improvedLayout": true
          },
          "interaction": {
            "hover": true,
            "tooltipDelay": 100,
            "navigationButtons": true,
            "keyboard": true
          },
          "edges": {
            "smooth": {
              "enabled": true,
              "type": "dynamic"
            },
            "arrows": {
              "to": {"enabled": true, "scaleFactor": 0.5}
            },
            "font": {
              "size": 9,
              "color": "#64748B",
              "strokeWidth": 0
            }
          }
        }
        """)

        filepath = os.path.join(self.output_dir, f"graph_{user_id}.html")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(self._post_process_html(net.generate_html()))

        logger.info(
            f"Generated graph for user {user_id}: "
            f"{len(nodes_data)} nodes, {len(edges_data)} edges → {filepath}"
        )
        return filepath

    async def generate_job_graph(self, job_id: str) -> str:
        """
        Generate an interactive pyvis HTML graph for a job.
        Returns the filepath of the generated HTML file.
        """
        nodes_data, edges_data = await self._fetch_graph_data(
            job_id, "Job", label_filter=_JOB_LABEL_FILTER
        )

        # Safety post-filter: drop any user-hierarchy nodes that slipped through
        allowed_ids = {n["id"] for n in nodes_data if n.get("type", "") in JOB_NODE_TYPES}
        nodes_data = [n for n in nodes_data if n["id"] in allowed_ids]
        edges_data = [e for e in edges_data
                      if e["source_id"] in allowed_ids and e["target_id"] in allowed_ids]

        if not nodes_data:
            logger.warning(f"No nodes found for job {job_id}")

        G = nx.DiGraph()

        for node in nodes_data:
            node_id = node.get("id", "")
            label = str(node.get("label", ""))[:30]
            node_type = node.get("type", "default")

            G.add_node(
                node_id,
                label=label,
                title=f"{label}  ·  {node_type}",
                color=NODE_TYPE_COLORS.get(node_type, DEFAULT_NODE_COLOR),
                size=NODE_SIZES.get(node_type, DEFAULT_NODE_SIZE),
                font=_node_font(node_type),
            )

        for edge in edges_data:
            src = edge.get("source_id", "")
            tgt = edge.get("target_id", "")
            rel = edge.get("rel_type", "")
            if src in G and tgt in G:
                G.add_edge(src, tgt, title=rel, label=rel, color="#94A3B8")

        net = Network(
            height="100vh",
            width="100%",
            directed=True,
            bgcolor="#f8fafc",
            font_color="#0f172a",
            notebook=False,
            cdn_resources="in_line",
        )
        net.from_nx(G)

        net.set_options("""
        {
          "physics": {
            "enabled": true,
            "solver": "forceAtlas2Based",
            "forceAtlas2Based": {
              "springLength": 130,
              "springConstant": 0.05,
              "damping": 0.5,
              "avoidOverlap": 0.2
            },
            "stabilization": {
              "enabled": true,
              "iterations": 250
            }
          },
          "layout": {
            "improvedLayout": true
          },
          "interaction": {
            "hover": true,
            "tooltipDelay": 100,
            "navigationButtons": true,
            "keyboard": true
          },
          "edges": {
            "smooth": {
              "enabled": true,
              "type": "dynamic"
            },
            "arrows": {
              "to": {"enabled": true, "scaleFactor": 0.5}
            },
            "font": {
              "size": 9,
              "color": "#64748B",
              "strokeWidth": 0
            }
          }
        }
        """)

        filepath = os.path.join(self.output_dir, f"graph_job_{job_id}.html")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(self._post_process_html(net.generate_html()))

        logger.info(
            f"Generated graph for job {job_id}: "
            f"{len(nodes_data)} nodes, {len(edges_data)} edges → {filepath}"
        )
        return filepath

    async def generate_match_graph(self, user_id: str, job_id: str) -> str:
        """
        Generate a combined user+job pyvis graph with 3-level match confidence.

        Node colours:
          Exact    (#16A34A green)  — same skill name, highest confidence
          Strong   (#0D9488 teal)   — keyword overlap in profile context
          Inferred (#D97706 amber)  — semantic-only, no shared keywords
          Gap      (#DC2626 red)    — required skill absent from profile
          Other    — normal node type colour

        Cross-graph edge styles:
          Exact    — green,  solid, width=4
          Strong   — teal,   solid, width=3
          Inferred — amber,  dashed, width=2
        """
        # ── Match level config ────────────────────────────────────────────────
        LEVEL_NODE_COLOR = {
            "exact":    "#16A34A",   # green-600
            "strong":   "#0D9488",   # teal-600
            "inferred": "#D97706",   # amber-600
        }
        LEVEL_EDGE_COLOR = {
            "exact":    "#22C55E",   # green-500
            "strong":   "#14B8A6",   # teal-500
            "inferred": "#FBBF24",   # amber-400
        }
        LEVEL_EDGE_WIDTH  = {"exact": 4, "strong": 3, "inferred": 2}
        LEVEL_EDGE_DASHES = {"exact": False, "strong": False, "inferred": True}
        LEVEL_LABEL       = {
            "exact":    "Exact",
            "strong":   "Strong",
            "inferred": "Inferred",
        }
        MISSING_COLOR = "#DC2626"    # red-600

        # ── Fetch subgraphs ───────────────────────────────────────────────────
        user_nodes, user_edges = await self._fetch_graph_data(
            user_id, "User", label_filter=_USER_LABEL_FILTER
        )
        job_nodes, job_edges = await self._fetch_graph_data(
            job_id, "Job", label_filter=_JOB_LABEL_FILTER
        )

        # ── Fetch match overlay with confidence levels ────────────────────────
        matched_user_ids, matched_job_ids, missing_ids, matches_edges = (
            await self._fetch_match_overlay(user_id, job_id)
        )
        # matched_user_ids / matched_job_ids are now dicts: {elementId: level}

        G = nx.DiGraph()

        all_nodes = user_nodes + job_nodes
        all_edges = user_edges + job_edges

        for node in all_nodes:
            node_id   = node.get("id", "")
            label     = str(node.get("label", ""))[:30]
            node_type = node.get("type", "default")

            level = matched_user_ids.get(node_id) or matched_job_ids.get(node_id)

            if level:
                color = LEVEL_NODE_COLOR[level]
                level_label = LEVEL_LABEL[level]
                tooltip_suffix = f"  ✓ {level_label} match"
                node_font = {"color": "white", "size": 11}
            elif node_id in missing_ids:
                color = MISSING_COLOR
                tooltip_suffix = "  ✗ Gap — required, not in profile"
                node_font = {"color": "white", "size": 11}
            else:
                color = NODE_TYPE_COLORS.get(node_type, DEFAULT_NODE_COLOR)
                tooltip_suffix = ""
                node_font = _node_font(node_type)

            G.add_node(
                node_id,
                label=label,
                title=f"{label}  ·  {node_type}{tooltip_suffix}",
                color=color,
                size=NODE_SIZES.get(node_type, DEFAULT_NODE_SIZE),
                font=node_font,
            )

        for edge in all_edges:
            src = edge.get("source_id", "")
            tgt = edge.get("target_id", "")
            rel = edge.get("rel_type", "")
            if src in G and tgt in G:
                G.add_edge(src, tgt, title=rel, label=rel, color="#94A3B8")

        # ── Cross-graph edges with level-based style ──────────────────────────
        for me in matches_edges:
            src   = me.get("source_id", "")
            tgt   = me.get("target_id", "")
            level = me.get("level", "inferred")
            if src in G and tgt in G:
                tooltip = (
                    f"{me.get('skill_name','')} → {me.get('req_name','')}  "
                    f"[{LEVEL_LABEL.get(level, level)}]  "
                    f"sem={me.get('sem',0):.2f}  lex={me.get('lex',0):.2f}  "
                    f"hybrid={me.get('hybrid',0):.2f}"
                )
                G.add_edge(
                    src, tgt,
                    title=tooltip,
                    label=LEVEL_LABEL.get(level, "~"),
                    color=LEVEL_EDGE_COLOR[level],
                    width=LEVEL_EDGE_WIDTH[level],
                    dashes=LEVEL_EDGE_DASHES[level],
                )

        net = Network(
            height="100vh",
            width="100%",
            directed=True,
            bgcolor="#f8fafc",
            font_color="#0f172a",
            notebook=False,
            cdn_resources="in_line",
        )
        net.from_nx(G)

        net.set_options("""
        {
          "physics": {
            "enabled": true,
            "solver": "forceAtlas2Based",
            "forceAtlas2Based": {
              "springLength": 150,
              "springConstant": 0.04,
              "damping": 0.5,
              "avoidOverlap": 0.3
            },
            "stabilization": {"enabled": true, "iterations": 300}
          },
          "layout": {"improvedLayout": true},
          "interaction": {
            "hover": true,
            "tooltipDelay": 100,
            "navigationButtons": true,
            "keyboard": true
          },
          "edges": {
            "smooth": {"enabled": true, "type": "dynamic"},
            "arrows": {"to": {"enabled": true, "scaleFactor": 0.5}},
            "font": {"size": 9, "color": "#64748B", "strokeWidth": 0}
          }
        }
        """)

        filepath = os.path.join(
            self.output_dir, f"graph_match_{user_id}_{job_id}.html"
        )

        html = self._post_process_html(net.generate_html())
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)
        self._inject_legend(filepath)

        total_nodes = len(user_nodes) + len(job_nodes)
        total_edges = len(all_edges) + len(matches_edges)
        logger.info(
            f"Generated match graph {user_id}↔{job_id}: "
            f"{total_nodes} nodes, {total_edges} edges, "
            f"{len(matched_job_ids)} matched, {len(missing_ids)} gaps → {filepath}"
        )
        return filepath

    async def _fetch_match_overlay(
        self, user_id: str, job_id: str
    ) -> tuple[dict, dict, set, list]:
        """
        Return match data for coloring the graph with 3 confidence levels.

        Uses the same hybrid semantic+lexical logic as MatchingEngine so the
        graph and the score are always consistent.

        Returns:
          matched_user_ids  - {elementId: match_level} for matched Skill nodes
          matched_job_ids   - {elementId: match_level} for matched JobSkillRequirement nodes
          missing_ids       - set of JobSkillRequirement elementIds with no match
          matches_edges     - list of edge dicts {source_id, target_id, level, sem, lex, hybrid,
                              req_name, skill_name} for drawing cross-graph edges
        """
        from services.matching_engine import MatchingEngine

        sem_floor          = float(os.environ.get("SKILL_SEM_FLOOR",          "0.55"))
        hybrid_threshold   = float(os.environ.get("SKILL_HYBRID_THRESHOLD",   "0.70"))
        sem_only_threshold = float(os.environ.get("SKILL_SEM_ONLY_THRESHOLD", "0.88"))
        sem_weight         = float(os.environ.get("SKILL_SEM_WEIGHT",         "0.65"))

        candidates = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(jsf:JobSkillFamily)-[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            WHERE req.embedding IS NOT NULL
            CALL {
                WITH req
                CALL db.index.vector.queryNodes('skill_embeddings', 50, req.embedding)
                YIELD node AS s, score
                WHERE s.user_id = $user_id AND score >= $sem_floor
                OPTIONAL MATCH (sfam:SkillFamily)-[:HAS_SKILL]->(s)
                RETURN s, score, sfam
                ORDER BY score DESC
                LIMIT 1
            }
            RETURN
                elementId(s)   AS user_node_id,
                elementId(req) AS job_node_id,
                req.name       AS req_name,
                req.context    AS req_context,
                jsf.name       AS req_family,
                s.name         AS skill_name,
                s.context      AS skill_context,
                sfam.name      AS skill_family,
                score          AS semantic_score
            """,
            {"user_id": user_id, "job_id": job_id, "sem_floor": sem_floor},
        )

        matched_user_ids: dict[str, str] = {}
        matched_job_ids:  dict[str, str] = {}
        matches_edges: list[dict] = []

        for r in candidates:
            req_name   = (r.get("req_name")   or "").strip()
            skill_name = (r.get("skill_name") or "").strip()
            sem_score  = float(r.get("semantic_score") or 0.0)

            job_text  = " ".join(filter(None, [req_name,   r.get("req_family"),   r.get("req_context")]))
            user_text = " ".join(filter(None, [skill_name, r.get("skill_family"), r.get("skill_context")]))
            lex_score = MatchingEngine._lexical_score(job_text, user_text)

            matched, method, hybrid = MatchingEngine._decide_match(
                req_name, skill_name, sem_score, lex_score,
                hybrid_threshold, sem_only_threshold, sem_weight,
            )
            if not matched:
                continue

            uid = r["user_node_id"]
            jid = r["job_node_id"]
            matched_user_ids[uid] = method
            matched_job_ids[jid]  = method
            matches_edges.append({
                "source_id":  uid,
                "target_id":  jid,
                "level":      method,           # "exact" | "strong" | "inferred"
                "sem":        round(sem_score, 2),
                "lex":        round(lex_score, 2),
                "hybrid":     round(hybrid, 2),
                "req_name":   req_name,
                "skill_name": skill_name,
            })

        all_req_records = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(:JobSkillFamily)-[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            RETURN elementId(req) AS req_id
            """,
            {"job_id": job_id},
        )
        all_req_ids = {r["req_id"] for r in all_req_records}
        missing_ids = all_req_ids - set(matched_job_ids.keys())

        return matched_user_ids, matched_job_ids, missing_ids, matches_edges

    @staticmethod
    def _post_process_html(html: str) -> str:
        """
        Patch the pyvis-generated HTML to match the Lumino light theme:
        - Make the canvas fill 100 vh with no scrollbar or margin.
        - Remove the hardcoded dark background from #mynetwork.
        """
        html = html.replace(
            "background-color: #1a1a2e",
            "background-color: #f8fafc",
        )
        html = html.replace(
            "border: 1px solid lightgray",
            "border: none",
        )
        # Reset body/html so the canvas truly fills the iframe
        html = html.replace(
            "<body>",
            '<body style="margin:0;padding:0;background:#f8fafc;overflow:hidden;">',
            1,
        )
        return html

    def _inject_legend(self, filepath: str) -> None:
        """Inject a Lumino-styled colour legend into the match graph HTML."""
        legend_html = """
<div style="
    position: fixed; top: 12px; left: 12px; z-index: 9999;
    background: white; border: 1px solid #e2e8f0;
    border-radius: 10px; padding: 12px 16px;
    font-family: Inter, system-ui, sans-serif; font-size: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    pointer-events: none; color: #0f172a; min-width: 230px;">
  <b style="font-size:11px; color:#64748b; letter-spacing:0.08em; text-transform:uppercase;">
    Match Confidence
  </b>
  <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="display:inline-block; width:28px; height:4px; background:#22C55E; border-radius:2px;"></span>
      <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#16A34A;"></span>
      <span><b>Exact</b> &mdash; same skill name</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="display:inline-block; width:28px; height:3px; background:#14B8A6; border-radius:2px;"></span>
      <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#0D9488;"></span>
      <span><b>Strong</b> &mdash; shared keywords in profile</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="display:inline-block; width:28px; height:2px; background:#FBBF24;
                   border-top: 2px dashed #FBBF24; border-radius:0;"></span>
      <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#D97706;"></span>
      <span><b>Inferred</b> &mdash; conceptually similar, verify</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="display:inline-block; width:28px;"></span>
      <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#DC2626;"></span>
      <span><b>Gap</b> &mdash; required, not in profile</span>
    </div>
  </div>
  <div style="margin-top:8px; padding-top:8px; border-top:1px solid #f1f5f9;
              font-size:10px; color:#94a3b8; line-height:1.5;">
    Hover an edge to see<br>semantic &amp; keyword scores
  </div>
</div>
"""
        with open(filepath, "r", encoding="utf-8") as f:
            html = f.read()
        html = html.replace("<body", legend_html + "<body", 1)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

    async def generate_recommendations_page(
        self, user_id: str, limit: int = 10
    ) -> str:
        """
        Generate a self-contained HTML recommendations dashboard for a user.

        Shows top-N ranked jobs as cards with score breakdown bars, matched/missing
        skill badges, and a "View Match Graph" link per job.
        Output: recommendations_{user_id}.html
        """
        from services.matching_engine import MatchingEngine

        engine = MatchingEngine(self.client)
        batch = await engine.rank_all_jobs_for_user(user_id)
        results = batch.results[:limit]

        def score_color(s: float) -> str:
            if s >= 0.7:
                return "#27AE60"
            if s >= 0.4:
                return "#F39C12"
            return "#E74C3C"

        def pct(s: float) -> str:
            return f"{int(round(s * 100))}%"

        def culture_badge(bonus: float) -> str:
            if bonus >= 0.7:
                color, label = "#27AE60", f"Culture fit {pct(bonus)}"
            elif bonus > 0:
                color, label = "#F39C12", f"Culture fit {pct(bonus)}"
            else:
                color, label = "#555", "Culture fit n/a"
            return (
                f'<span style="background:{color};color:#fff;border-radius:12px;'
                f'padding:2px 10px;margin:2px;font-size:12px;display:inline-block;">'
                f'{label}</span>'
            )

        def pref_badge(bonus: float) -> str:
            if bonus == 1.0:
                color, label = "#27AE60", "Prefs matched"
            elif bonus > 0:
                color, label = "#F39C12", f"Prefs {pct(bonus)}"
            else:
                color, label = "#555", "Prefs n/a"
            return (
                f'<span style="background:{color};color:#fff;border-radius:12px;'
                f'padding:2px 10px;margin:2px;font-size:12px;display:inline-block;">'
                f'{label}</span>'
            )

        cards_html = ""
        for rank, r in enumerate(results, 1):
            matched_skill_badges = "".join(
                f'<span style="background:#27AE60;color:#fff;border-radius:12px;'
                f'padding:2px 8px;margin:2px;font-size:12px;display:inline-block;">'
                f'{sk}</span>'
                for sk in r.matched_skills
            )
            missing_skill_badges = "".join(
                f'<span style="background:#E67E22;color:#fff;border-radius:12px;'
                f'padding:2px 8px;margin:2px;font-size:12px;display:inline-block;">'
                f'{sk}</span>'
                for sk in r.missing_skills
            )
            matched_domain_badges = "".join(
                f'<span style="background:#8E44AD;color:#fff;border-radius:12px;'
                f'padding:2px 8px;margin:2px;font-size:12px;display:inline-block;">'
                f'{d}</span>'
                for d in r.matched_domains
            )
            missing_domain_badges = "".join(
                f'<span style="background:#7D3C98;color:#ccc;border-radius:12px;'
                f'padding:2px 8px;margin:2px;font-size:12px;display:inline-block;'
                f'border:1px solid #8E44AD;">'
                f'{d}</span>'
                for d in r.missing_domains
            )

            sub_bars = [
                ("Skills",  r.skill_score,  "#3498DB", "65%"),
                ("Domain",  r.domain_score, "#8E44AD", "35%"),
            ]
            sub_bars_html = "".join(
                f'<div style="display:flex;align-items:center;margin:3px 0;">'
                f'<span style="width:60px;font-size:11px;color:#aaa;">{label} ({weight})</span>'
                f'<div style="flex:1;background:#2c2c4a;border-radius:4px;height:8px;margin:0 8px;">'
                f'<div style="width:{pct(val)};background:{color};height:8px;border-radius:4px;"></div>'
                f'</div>'
                f'<span style="font-size:11px;color:#ccc;width:35px;">{pct(val)}</span>'
                f'</div>'
                for label, val, color, weight in sub_bars
            )

            tc = score_color(r.total_score)
            match_graph_url = f"/api/v1/users/{user_id}/matches/{r.job_id}/visualize"
            company_display = r.company or "-"

            cards_html += f"""
<div style="background:#16213e;border:1px solid #333;border-radius:10px;
            padding:20px;margin:16px 0;position:relative;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <span style="background:#2c2c4a;color:#aaa;border-radius:50%;
                   width:28px;height:28px;display:inline-flex;align-items:center;
                   justify-content:center;font-size:13px;margin-right:10px;">
        {rank}
      </span>
      <span style="font-size:20px;font-weight:bold;color:#fff;">{r.job_title}</span>
      <span style="color:#aaa;font-size:14px;margin-left:10px;">{company_display}</span>
    </div>
    <div style="text-align:right;">
      <div style="font-size:28px;font-weight:bold;color:{tc};">{pct(r.total_score)}</div>
      <div style="font-size:11px;color:#aaa;">base match score</div>
    </div>
  </div>

  <div style="margin:14px 0 8px;">
    <div style="background:#2c2c4a;border-radius:6px;height:12px;">
      <div style="width:{pct(r.total_score)};background:{tc};height:12px;border-radius:6px;"></div>
    </div>
  </div>

  <div style="margin:8px 0 6px;">{sub_bars_html}</div>

  <div style="margin:8px 0;">
    {culture_badge(r.culture_bonus)}
    {pref_badge(r.preference_bonus)}
  </div>

  <div style="font-size:12px;color:#aaa;margin-bottom:10px;font-style:italic;">
    {r.explanation}
  </div>

  {f'<div style="margin:4px 0;"><span style="color:#aaa;font-size:12px;">Skills matched: </span>{matched_skill_badges}</div>' if matched_skill_badges else ''}
  {f'<div style="margin:4px 0;"><span style="color:#aaa;font-size:12px;">Skills missing: </span>{missing_skill_badges}</div>' if missing_skill_badges else ''}
  {f'<div style="margin:4px 0;"><span style="color:#aaa;font-size:12px;">Domains matched: </span>{matched_domain_badges}</div>' if matched_domain_badges else ''}
  {f'<div style="margin:4px 0;"><span style="color:#aaa;font-size:12px;">Domains missing: </span>{missing_domain_badges}</div>' if missing_domain_badges else ''}

  <a href="{match_graph_url}" target="_blank"
     style="display:inline-block;margin-top:12px;padding:7px 16px;
            background:#2980B9;color:#fff;border-radius:6px;
            text-decoration:none;font-size:13px;">
    View Match Graph →
  </a>
</div>
"""

        if not results:
            cards_html = (
                '<p style="color:#aaa;text-align:center;margin-top:60px;">'
                "No jobs found. Ingest some job postings first.</p>"
            )

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Recommendations - {user_id}</title>
</head>
<body style="margin:0;padding:0;background:#1a1a2e;color:#fff;
             font-family:'Segoe UI',Arial,sans-serif;min-height:100vh;">
  <div style="max-width:860px;margin:0 auto;padding:32px 24px;">
    <h1 style="color:#fff;font-size:26px;margin-bottom:4px;">
      Job Recommendations
    </h1>
    <p style="color:#aaa;font-size:14px;margin-bottom:8px;">
      User: <b style="color:#5DADE2;">{user_id}</b> &nbsp;·&nbsp;
      Top {len(results)} of {batch.total_jobs_ranked} job(s) ranked
    </p>
    <hr style="border:none;border-top:1px solid #333;margin:16px 0 24px;">
    {cards_html}
  </div>
</body>
</html>"""

        filepath = os.path.join(
            self.output_dir, f"recommendations_{user_id}.html"
        )
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

        logger.info(
            f"Generated recommendations page for {user_id}: "
            f"{len(results)} jobs → {filepath}"
        )
        return filepath

    async def _fetch_graph_data(
        self, node_id: str, node_label: str, label_filter: str = ""
    ) -> tuple[list[dict], list[dict]]:
        """
        Fetch all nodes and edges reachable from the given root node (depth ≤ 6).
        Tries APOC first, falls back to pure Cypher.

        label_filter: APOC labelFilter string (e.g. "-Job|-JobSkillRequirement")
          that blocks traversal into unwanted node types, preventing cross-entity
          contamination via bidirectional MATCHES edges.
        """
        try:
            return await self._fetch_with_apoc(node_id, node_label, label_filter)
        except Exception as e:
            if "apoc" in str(e).lower() or "procedure" in str(e).lower():
                logger.info("APOC not available, using pure Cypher fallback")
                return await self._fetch_without_apoc(node_id, node_label, label_filter)
            raise

    async def _fetch_with_apoc(
        self, node_id: str, node_label: str, label_filter: str = ""
    ) -> tuple[list[dict], list[dict]]:
        """Subgraph extraction using APOC (preferred)."""
        query_params = {"node_id": node_id}
        # Build APOC config - include labelFilter only when provided
        apoc_config = "maxLevel: 6"
        if label_filter:
            apoc_config += f", labelFilter: '{label_filter}'"

        nodes = await self.client.run_query(
            f"""
            MATCH (root:{node_label} {{id: $node_id}})
            CALL apoc.path.subgraphAll(root, {{{apoc_config}}})
            YIELD nodes, relationships
            UNWIND nodes AS n
            WITH n
            RETURN DISTINCT
                elementId(n) AS id,
                coalesce(n.name, n.title, n.degree, n.role, n.id, n.pattern, n.style, n.type, labels(n)[0], '') AS label,
                labels(n)[0] AS type,
                n.weight AS weight,
                n.years AS years,
                n.level AS level,
                n.depth AS depth
            """,
            query_params,
        )

        edges = await self.client.run_query(
            f"""
            MATCH (root:{node_label} {{id: $node_id}})
            CALL apoc.path.subgraphAll(root, {{{apoc_config}}})
            YIELD nodes, relationships
            UNWIND relationships AS r
            WITH r, startNode(r) AS sn, endNode(r) AS en
            RETURN DISTINCT
                elementId(sn) AS source_id,
                elementId(en) AS target_id,
                type(r) AS rel_type
            """,
            query_params,
        )

        return nodes, edges

    async def _fetch_without_apoc(
        self, node_id: str, node_label: str, label_filter: str = ""
    ) -> tuple[list[dict], list[dict]]:
        """Subgraph extraction using pure Cypher (APOC fallback).
        label_filter is ignored here since the pure-Cypher path uses directional
        traversal (->), which doesn't traverse MATCHES edges bidirectionally.
        """
        query_params = {"node_id": node_id}
        nodes = await self.client.run_query(
            f"""
            MATCH path = (root:{node_label} {{id: $node_id}})-[*0..6]->(n)
            WITH DISTINCT n
            RETURN
                elementId(n) AS id,
                coalesce(n.name, n.title, n.degree, n.role, n.id, n.pattern, n.style, n.type, labels(n)[0], '') AS label,
                labels(n)[0] AS type,
                n.weight AS weight,
                n.years AS years,
                n.level AS level,
                n.depth AS depth
            """,
            query_params,
        )

        edges = await self.client.run_query(
            f"""
            MATCH path = (root:{node_label} {{id: $node_id}})-[*0..6]->(n)
            WITH DISTINCT relationships(path) AS rels
            UNWIND rels AS r
            WITH r, startNode(r) AS sn, endNode(r) AS en
            RETURN DISTINCT
                elementId(sn) AS source_id,
                elementId(en) AS target_id,
                type(r) AS rel_type
            """,
            query_params,
        )

        return nodes, edges
