"""
Graph-based matching engine.

All scoring is done through Cypher set-intersection queries over explicit
MATCHES edges. Those edges may now be created through semantic embedding
linking, but the score computation itself remains deterministic and fully
traceable through graph paths.

Four-axis scoring model:
  Skills      (45% when all data present): evidence-weighted intersection via MATCHES edges
  Domain      (20% when all data present): depth-weighted intersection
  Soft Skills (20% when job has SoftSkillRequirements + user has patterns): quality alignment
  Culture Fit (15% when both sides have digital twin culture data): identity match

When dimensions lack data they are excluded and remaining weights rescale:
  No soft, no culture → Skills 65% + Domain 35%  (backwards compatible)
  Has culture, no soft → Skills 55% + Domain 25% + Culture 20%
  Has soft, no culture → Skills 55% + Domain 25% + Soft 20%
  All four present     → Skills 45% + Domain 20% + Soft 20% + Culture 15%

Skill scoring details:
  contribution = importance_weight × seniority_factor × evidence_weight
  evidence weights: claimed_only=0.30, mentioned_once=0.50,
                    project_backed=0.80, multiple_productions=1.00

Domain scoring details:
  contribution = depth_weight × (1 / total_domains)
  depth weights: shallow=0.40, moderate=0.70, deep=1.00

Name normalization: toLower(trim(...)) applied in all Cypher comparisons.
"""

import logging
import os
from database.neo4j_client import Neo4jClient
from models.schemas import MatchResult, BatchMatchResponse, CandidateResult, BatchCandidateResponse, SkillMatchDetail
from models.taxonomies import (
    MatchWeight,
    SkillImportanceWeight,
    EvidenceWeight,
    DomainDepthWeight,
    SOFT_SKILL_TO_PATTERN,
    BEHAVIORAL_RISK_TYPES,
    CULTURE_FIELD_MAP,
    HYBRID_ALPHA,
    HYBRID_BETA,
    canonicalize_matching_term,
    normalize_work_style,
    normalize_soft_skill_quality,
    EDUCATION_LEVEL_SCORE,
    QUAL_IMPORTANCE_WEIGHTS,
)

logger = logging.getLogger(__name__)


class MatchingEngine:
    def __init__(self, client: Neo4jClient, analytics_service=None):
        self.client = client
        self._analytics = analytics_service  # Optional[AnalyticsService]

    # ──────────────────────────────────────────────────────────────────────────
    # BATCH MATCHING
    # ──────────────────────────────────────────────────────────────────────────

    async def rank_all_jobs_for_user(self, user_id: str) -> BatchMatchResponse:
        jobs = await self.client.run_query(
            "MATCH (j:Job) RETURN j.id AS job_id, coalesce(j.tags, []) AS tags"
        )
        results: list[MatchResult] = []
        for job_record in jobs:
            result = await self._score_user_job_pair(
                user_id,
                job_record["job_id"],
                job_tags=list(job_record.get("tags") or []),
            )
            if result is not None:
                results.append(result)
        # Sort by hybrid_score so analytics preference influences ranking
        results.sort(key=lambda r: r.hybrid_score, reverse=True)
        return BatchMatchResponse(
            user_id=user_id,
            results=results,
            total_jobs_ranked=len(results),
        )

    async def rank_all_users_for_job(self, job_id: str) -> BatchCandidateResponse:
        users = await self.client.run_query("MATCH (u:User) RETURN u.id AS id")
        results: list[CandidateResult] = []
        for user_record in users:
            match = await self._score_user_job_pair(user_record["id"], job_id)
            if match is not None:
                results.append(CandidateResult(
                    user_id=user_record["id"],
                    total_score=match.total_score,
                    skill_score=match.skill_score,
                    optional_skill_score=match.optional_skill_score,
                    domain_score=match.domain_score,
                    soft_skill_score=match.soft_skill_score,
                    culture_fit_score=match.culture_fit_score,
                    culture_bonus=match.culture_bonus,
                    preference_bonus=match.preference_bonus,
                    matched_skills=match.matched_skills,
                    missing_skills=match.missing_skills,
                    matched_domains=match.matched_domains,
                    missing_domains=match.missing_domains,
                    behavioral_risk_flags=match.behavioral_risk_flags,
                    explanation=match.explanation,
                ))
        results.sort(key=lambda r: r.total_score, reverse=True)
        return BatchCandidateResponse(
            job_id=job_id,
            results=results,
            total_users_ranked=len(results),
        )

    # ──────────────────────────────────────────────────────────────────────────
    # SINGLE PAIR SCORING
    # ──────────────────────────────────────────────────────────────────────────

    async def _score_user_job_pair(
        self, user_id: str, job_id: str, job_tags: list[str] | None = None
    ) -> MatchResult | None:
        job_info = await self.client.run_query(
            "MATCH (j:Job {id: $job_id}) RETURN j.title AS title, j.company AS company, "
            "coalesce(j.tags, []) AS tags",
            {"job_id": job_id},
        )
        if not job_info:
            return None
        user_check = await self.client.run_query(
            "MATCH (u:User {id: $user_id}) RETURN u.id AS id",
            {"user_id": user_id},
        )
        if not user_check:
            return None

        # Resolve job tags — prefer caller-supplied (avoids extra query in batch)
        resolved_tags: list[str] = job_tags if job_tags is not None else list(job_info[0].get("tags") or [])

        skill_data         = await self._compute_skill_score(user_id, job_id)
        domain_data        = await self._compute_domain_score(user_id, job_id)
        soft_data          = await self._compute_soft_skill_score(user_id, job_id)
        culture_fit_data   = await self._compute_culture_fit_score(user_id, job_id)
        culture_bonus_data = await self._compute_culture_bonus(user_id, job_id)
        pref_data          = await self._compute_preference_bonus(user_id, job_id)
        edu_data           = await self._compute_education_fit(user_id, job_id)
        qual_data          = await self._compute_preferred_qual_bonus(user_id, job_id)
        career_data        = await self._compute_career_level_fit(user_id, job_id)
        quality_data       = await self._compute_profile_quality_multiplier(user_id)

        mandatory_score    = skill_data.get("mandatory_score", 0.0) or 0.0
        optional_score     = skill_data.get("optional_score", 0.0) or 0.0
        domain_score       = domain_data.get("score", 0.0) or 0.0
        soft_skill_score   = soft_data.get("score")    # None = no data
        culture_fit_score  = culture_fit_data.get("score")  # None = no data
        culture_bonus      = culture_bonus_data.get("bonus", 0.0) or 0.0
        preference_bonus   = pref_data.get("bonus", 0.0) or 0.0
        education_fit      = edu_data.get("score", 0.0) or 0.0
        preferred_qual_bonus = qual_data.get("bonus", 0.0) or 0.0
        career_fit         = career_data.get("multiplier", 1.0)
        profile_quality    = quality_data.get("multiplier", 1.0)

        raw_score = self._compute_total_score(
            mandatory_score, optional_score, domain_score, soft_skill_score, culture_fit_score
        )

        # ── Mandatory skill knockout cap ───────────────────────────────────────
        # A candidate who matches zero must_have skills cannot float to the top
        # on domain/soft/culture alone. Hard-cap their score at 0.30 so recruiters
        # never see them above candidates who actually meet the core requirements.
        has_mandatory_reqs = skill_data.get("has_mandatory_reqs", False)
        if mandatory_score == 0.0 and has_mandatory_reqs:
            raw_score = min(raw_score, 0.30)

        # Apply career-level fitness: prevents an intern ranking above a mid-level
        # candidate on a senior role just because tech skills match.
        # Apply profile quality multiplier: weak/misleading profiles rank lower.
        graph_score = raw_score * career_fit * profile_quality

        # ── Analytics interest score ───────────────────────────────────────────
        interest_score = 0.5  # neutral default when no analytics data
        interest_tags_matched: list[str] = []
        if self._analytics and resolved_tags:
            interest_score = await self._analytics.compute_interest_score_for_job(
                user_id, resolved_tags
            )
            interest_tags_matched = await self._get_matched_interest_tags(user_id, resolved_tags)

        hybrid_score = round(HYBRID_ALPHA * graph_score + HYBRID_BETA * interest_score, 4)

        return MatchResult(
            job_id=job_id,
            job_title=job_info[0]["title"] or "Unknown",
            company=job_info[0]["company"],
            total_score=round(graph_score, 4),
            skill_score=round(mandatory_score, 4),
            optional_skill_score=round(optional_score, 4),
            domain_score=round(domain_score, 4),
            soft_skill_score=round(soft_skill_score, 4) if soft_skill_score is not None else 0.0,
            culture_fit_score=round(culture_fit_score, 4) if culture_fit_score is not None else 0.0,
            culture_bonus=round(culture_bonus, 4),
            preference_bonus=round(preference_bonus, 4),
            matched_skills=skill_data.get("matched", []),
            inferred_skills=skill_data.get("inferred", []),
            missing_skills=skill_data.get("missing", []),
            matched_domains=domain_data.get("matched", []),
            missing_domains=domain_data.get("missing", []),
            skill_match_details=[
                SkillMatchDetail(**d) for d in skill_data.get("match_details", [])
            ],
            behavioral_risk_flags=soft_data.get("risk_flags", []),
            explanation=self._build_explanation(
                mandatory_score, domain_score, soft_skill_score,
                culture_fit_score, culture_bonus, preference_bonus
            ),
            job_tags=resolved_tags,
            interest_score=round(interest_score, 4),
            interest_tags_matched=interest_tags_matched,
            hybrid_score=hybrid_score,
            education_fit_score=round(education_fit, 4),
            preferred_qual_bonus=round(preferred_qual_bonus, 4),
            met_education_reqs=edu_data.get("met", []),
            gap_education_reqs=edu_data.get("gaps", []),
            career_level_fit=round(career_fit, 4),
            user_seniority=career_data.get("user_seniority"),
            job_seniority=career_data.get("job_seniority"),
            profile_quality_score=round(profile_quality, 4),
            profile_signal=quality_data.get("signal", "unknown"),
        )

    async def _get_matched_interest_tags(self, user_id: str, job_tags: list[str]) -> list[str]:
        """Return which of the job's tags the user has a positive interest in (score > 0.5)."""
        rows = await self.client.run_query(
            """
            MATCH (u:User {id: $user_id})-[r:HAS_INTEREST]->(t:JobTag)
            WHERE t.name IN $tags AND r.score > 0.5
            RETURN t.name AS tag
            """,
            {"user_id": user_id, "tags": job_tags},
        )
        return [row["tag"] for row in rows]

    async def _compute_education_fit(
        self, user_id: str, job_id: str
    ) -> dict:
        """
        Compare the user's Education nodes against the job's EducationRequirement nodes.

        Scoring (bonus only — never penalizes total_score):
          1.0  — user meets or exceeds the required degree level
          0.5  — user is exactly one level below (close enough)
          0.0  — user is two or more levels below a *required* education req

        Returns: {"score": float, "met": [str], "gaps": [str]}
        """
        # Fetch job's education requirements
        req_rows = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_EDUCATION_REQ]->(e:EducationRequirement)
            RETURN e.degree_level AS degree_level, e.field AS field,
                   e.is_required AS is_required
            """,
            {"job_id": job_id},
        )
        if not req_rows:
            return {"score": 0.0, "met": [], "gaps": []}

        # Fetch user's highest education level
        user_edu = await self.client.run_query(
            """
            MATCH (u:User {id: $user_id})-[:HAS_SKILL_CATEGORY|HAS_PROJECT_CATEGORY|
                  HAS_DOMAIN_CATEGORY|HAS_EXPERIENCE_CATEGORY*0..1]->(cat)
            WITH u
            MATCH (e:Education {user_id: $user_id})
            RETURN e.degree AS degree
            """,
            {"user_id": user_id},
        )

        # Determine user's best education level score
        user_level = 0  # default: no education data
        for edu in user_edu:
            degree = (edu.get("degree") or "").lower()
            for level_key, level_val in EDUCATION_LEVEL_SCORE.items():
                if level_key in degree:
                    user_level = max(user_level, level_val)
                    break

        met: list[str] = []
        gaps: list[str] = []
        total_score = 0.0

        for req in req_rows:
            req_level = EDUCATION_LEVEL_SCORE.get(
                (req.get("degree_level") or "any").lower(), 0
            )
            field = req.get("field") or ""
            is_required = req.get("is_required", True)
            label = f"{req.get('degree_level', 'degree')}{' in ' + field if field else ''}"

            diff = user_level - req_level
            if diff >= 0:
                total_score += 1.0
                met.append(label)
            elif diff == -1:
                total_score += 0.5
                met.append(f"{label} (close)")
            else:
                # Only count as gap if it's a hard requirement
                if is_required:
                    gaps.append(label)
                total_score += 0.0

        score = total_score / len(req_rows) if req_rows else 0.0
        return {"score": score, "met": met, "gaps": gaps}

    async def _compute_preferred_qual_bonus(
        self, user_id: str, job_id: str
    ) -> dict:
        """
        Score how many of the job's PreferredQualification nodes the user satisfies.

        Matches against user's Certification, Coursework, and Domain nodes (case-insensitive).
        Weights by importance: strongly_preferred=0.8, preferred=0.5, nice_to_have=0.2.

        Returns: {"bonus": float, "matched": [str]}
        """
        qual_rows = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_PREFERRED_QUAL]->(p:PreferredQualification)
            RETURN p.value AS value, p.importance AS importance, p.type AS type
            """,
            {"job_id": job_id},
        )
        if not qual_rows:
            return {"bonus": 0.0, "matched": []}

        # Gather all user credential names (certs, courses, domains) — lowercased
        user_creds_rows = await self.client.run_query(
            """
            OPTIONAL MATCH (cert:Certification {user_id: $user_id})
            OPTIONAL MATCH (course:Course {user_id: $user_id})
            OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_SKILL_CATEGORY|HAS_DOMAIN_CATEGORY*0..1]->()
                           -[:HAS_DOMAIN_FAMILY|HAS_DOMAIN*0..1]->(d:Domain)
            WITH collect(DISTINCT toLower(trim(coalesce(cert.name, '')))) +
                 collect(DISTINCT toLower(trim(coalesce(course.name, '')))) +
                 collect(DISTINCT toLower(trim(coalesce(d.name, '')))) AS creds
            RETURN creds
            """,
            {"user_id": user_id},
        )
        user_creds: set[str] = set()
        if user_creds_rows:
            for c in (user_creds_rows[0].get("creds") or []):
                if c:
                    user_creds.add(c)

        matched: list[str] = []
        total_weight = 0.0
        matched_weight = 0.0

        for qual in qual_rows:
            importance = qual.get("importance") or "nice_to_have"
            weight = QUAL_IMPORTANCE_WEIGHTS.get(importance, 0.2)
            total_weight += weight
            val = (qual.get("value") or "").lower().strip()
            # Check partial match: any user credential contains the qual value or vice versa
            hit = any(val in cred or cred in val for cred in user_creds if cred)
            if hit:
                matched_weight += weight
                matched.append(qual.get("value", ""))

        bonus = matched_weight / total_weight if total_weight > 0 else 0.0
        return {"bonus": bonus, "matched": matched}

    def _compute_total_score(
        self,
        skill_score: float,
        optional_skill_score: float,
        domain_score: float,
        soft_skill_score: float | None,
        culture_fit_score: float | None,
    ) -> float:
        """
        Dynamically weight the score based on which dimensions have data.
        Skills are split into mandatory (55%) and optional (10%) axes.
        This prevents penalising users who haven't completed the deep interview
        while rewarding those who have by incorporating richer signals.
        """
        has_soft    = soft_skill_score is not None
        has_culture = culture_fit_score is not None

        if has_soft and has_culture:
            return (
                skill_score          * MatchWeight.MANDATORY_FULL +
                optional_skill_score * MatchWeight.OPTIONAL_FULL +
                domain_score         * MatchWeight.DOMAIN_FULL +
                soft_skill_score     * MatchWeight.SOFT_SKILLS +
                culture_fit_score    * MatchWeight.CULTURE_FIT
            )
        elif has_culture:
            return (
                skill_score          * MatchWeight.MANDATORY_CULTURE +
                optional_skill_score * MatchWeight.OPTIONAL_CULTURE +
                domain_score         * MatchWeight.DOMAIN_CULTURE +
                culture_fit_score    * MatchWeight.CULTURE_ONLY
            )
        elif has_soft:
            return (
                skill_score          * MatchWeight.MANDATORY_SOFT +
                optional_skill_score * MatchWeight.OPTIONAL_SOFT +
                domain_score         * MatchWeight.DOMAIN_SOFT +
                soft_skill_score     * MatchWeight.SOFT_ONLY
            )
        else:
            return (
                skill_score          * MatchWeight.SKILLS_MANDATORY +
                optional_skill_score * MatchWeight.SKILLS_OPTIONAL +
                domain_score         * MatchWeight.DOMAIN
            )

    # ──────────────────────────────────────────────────────────────────────────
    # CAREER LEVEL FITNESS MULTIPLIER
    # ──────────────────────────────────────────────────────────────────────────

    # Numeric seniority scale used for gap calculation
    _SENIORITY_SCALE: dict[str, int] = {
        "intern":     0,
        "junior":     1,
        "mid":        2,
        "senior":     3,
        "staff_plus": 4,
    }

    @classmethod
    def _infer_job_seniority(cls, title: str | None, exp_years_min: int | None) -> tuple[str, int]:
        """
        Derive a job's seniority label and numeric level from title keywords
        and minimum years-of-experience requirement.

        Returns (label, numeric_level) where numeric_level uses _SENIORITY_SCALE.
        """
        title_lower = (title or "").lower()

        # Title-keyword detection (ordered most-specific first)
        title_level: int | None = None
        if any(kw in title_lower for kw in ("intern", "internship", "trainee", "graduate program")):
            title_level = 0
        elif any(kw in title_lower for kw in ("junior", "jr.", "jr ", "entry level", "entry-level", "associate ")):
            title_level = 1
        elif any(kw in title_lower for kw in (" mid ", "mid-level", "mid level")):
            title_level = 2
        elif any(kw in title_lower for kw in ("senior", "sr.", "sr ", " sr")):
            title_level = 3
        elif any(kw in title_lower for kw in (
            " lead", "principal", "staff engineer", "staff dev", "architect",
            "director", "vp of", "head of", "engineering manager", "em ",
        )):
            title_level = 4

        # Years-min → numeric level
        years_level: int | None = None
        if exp_years_min is not None:
            y = int(exp_years_min)
            if y <= 0:
                years_level = 0
            elif y <= 2:
                years_level = 1
            elif y <= 5:
                years_level = 2
            elif y <= 9:
                years_level = 3
            else:
                years_level = 4

        # Combine: take the max signal; fall back to mid(2) if neither is available
        if title_level is not None and years_level is not None:
            level = max(title_level, years_level)
        elif title_level is not None:
            level = title_level
        elif years_level is not None:
            level = years_level
        else:
            level = 2  # default: assume mid-level when no signal

        label_map = {0: "intern", 1: "junior", 2: "mid", 3: "senior", 4: "staff_plus"}
        return label_map[level], level

    @classmethod
    def _infer_user_seniority(
        cls,
        assessment_level: str | None,
        total_career_years: float,
        has_leadership: bool,
    ) -> tuple[str, int]:
        """
        Determine user's effective seniority label and numeric level.

        Priority:
          1. CriticalAssessment.seniority_assessment (LLM-evaluated evidence-based level)
          2. Total career years from Experience nodes (fallback)
          3. Leadership signals bump borderline cases up by 0.5 (rounded)
        """
        # Map direct assessment to level
        assessment_map = {
            "junior":     1,
            "mid":        2,
            "senior":     3,
            "staff_plus": 4,
        }
        if assessment_level and assessment_level in assessment_map:
            level = assessment_map[assessment_level]
            label = assessment_level
        else:
            # Fall back to career years
            if total_career_years <= 1.0:
                level, label = 0, "intern"
            elif total_career_years <= 3.0:
                level, label = 1, "junior"
            elif total_career_years <= 6.0:
                level, label = 2, "mid"
            elif total_career_years <= 10.0:
                level, label = 3, "senior"
            else:
                level, label = 4, "staff_plus"

        # Leadership signals can bump someone at a border (e.g. mid→senior)
        # but never inflate more than one level
        if has_leadership and level < 4:
            level = min(level + 1, 3)  # cap at senior; staff_plus needs explicit assessment
            label_map = {0: "intern", 1: "junior", 2: "mid", 3: "senior", 4: "staff_plus"}
            label = label_map[level]

        return label, level

    @classmethod
    def _career_fit_multiplier(
        cls,
        user_level: int,
        job_level: int,
        job_is_leadership: bool,
        user_has_leadership: bool,
    ) -> float:
        """
        Return a [0, 1] multiplier representing career-level fit.

        diff = user_level - job_level:
          >= 0       : 1.00  (at par or overqualified by 1 — fine)
          == -1      : 0.65  (one step below — stretch role, possible)
          == -2      : 0.35  (two steps below — significant mismatch)
          <= -3      : 0.15  (three+ steps below — very unlikely to be appropriate)
          >= 2       : 0.90  (over-qualified by 2 — may not be interested)
          >= 3       : 0.80  (very over-qualified)

        Leadership penalty: senior/staff_plus roles that demand leadership
        when the user shows no leadership signals → −0.10 additional penalty.
        """
        diff = user_level - job_level

        if diff >= 3:
            base = 0.80
        elif diff == 2:
            base = 0.90
        elif diff >= 0:
            base = 1.00
        elif diff == -1:
            base = 0.65
        elif diff == -2:
            base = 0.35
        else:
            base = 0.15

        # Leadership gap penalty
        if job_is_leadership and not user_has_leadership:
            base = max(0.0, base - 0.10)

        return base

    async def _compute_career_level_fit(self, user_id: str, job_id: str) -> dict:
        """
        Compute a career-level fitness multiplier for a user-job pair.

        Combines:
          - User seniority (CriticalAssessment > career years)
          - Job seniority (title keywords > experience_years_min)
          - Leadership signal gap for senior/staff+ roles

        Returns:
          {
            "multiplier": float,       # applied to total_score
            "user_seniority": str,     # inferred user level label
            "job_seniority":  str,     # inferred job level label
          }
        """
        # ── User data ──────────────────────────────────────────────────────────
        user_rows = await self.client.run_query(
            """
            MATCH (u:User {id: $user_id})
            OPTIONAL MATCH (u)-[:HAS_ASSESSMENT]->(a:CriticalAssessment)
            OPTIONAL MATCH (u)-[:HAS_EXPERIENCE_CATEGORY]->(:ExperienceCategory)
                          -[:HAS_EXPERIENCE]->(e:Experience)
            OPTIONAL MATCH (u)-[:HAS_CULTURE_IDENTITY]->(ci:CultureIdentity)
            WITH a, ci,
                 sum(coalesce(toFloat(e.duration_years), 0.0)) AS total_years
            RETURN
                a.seniority_assessment AS seniority_assessment,
                a.ownership_signals    AS ownership_signals,
                total_years            AS total_years,
                ci.leadership_style    AS leadership_style
            LIMIT 1
            """,
            {"user_id": user_id},
        )
        user_row = user_rows[0] if user_rows else {}

        assessment_level = user_row.get("seniority_assessment")
        total_years      = float(user_row.get("total_years") or 0.0)
        leadership_style = (user_row.get("leadership_style") or "").lower()
        ownership_raw    = user_row.get("ownership_signals") or []
        if isinstance(ownership_raw, str):
            try:
                import json as _j
                ownership_raw = _j.loads(ownership_raw)
            except Exception:
                ownership_raw = [ownership_raw] if ownership_raw else []

        # A user has "leadership" if their style isn't purely IC or they have ownership signals
        user_has_leadership = bool(
            ownership_raw
            or leadership_style in ("manager", "lead", "tech_lead", "mentor", "team_lead")
        )

        # ── Job data ───────────────────────────────────────────────────────────
        job_rows = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})
            RETURN j.title AS title,
                   j.experience_years_min AS experience_years_min
            LIMIT 1
            """,
            {"job_id": job_id},
        )
        job_row = job_rows[0] if job_rows else {}
        job_title    = job_row.get("title")
        exp_years_min = job_row.get("experience_years_min")

        # ── Infer levels ───────────────────────────────────────────────────────
        user_label, user_level = self._infer_user_seniority(
            assessment_level, total_years, user_has_leadership
        )
        job_label, job_level = self._infer_job_seniority(job_title, exp_years_min)

        # A job is "leadership" if it's senior/staff+ and has leadership-related soft skill reqs
        leadership_reqs = await self.client.run_query(
            """
            OPTIONAL MATCH (j:Job {id: $job_id})-[:REQUIRES_QUALITY]->(s:SoftSkillRequirement)
            WHERE toLower(s.quality) IN ['ownership', 'mentorship', 'cross_functional']
               OR toLower(s.name) CONTAINS 'lead'
               OR toLower(s.name) CONTAINS 'manag'
               OR toLower(s.name) CONTAINS 'mentor'
            RETURN count(s) AS cnt
            """,
            {"job_id": job_id},
        )
        leadership_count = (leadership_reqs[0]["cnt"] if leadership_reqs else 0) or 0
        job_is_leadership = (job_level >= 3) and (leadership_count > 0)

        multiplier = self._career_fit_multiplier(
            user_level, job_level, job_is_leadership, user_has_leadership
        )

        return {
            "multiplier":      multiplier,
            "user_seniority":  user_label,
            "job_seniority":   job_label,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # PROFILE QUALITY MULTIPLIER
    # ──────────────────────────────────────────────────────────────────────────

    async def _compute_profile_quality_multiplier(self, user_id: str) -> dict:
        """
        Penalize candidates whose profile signal quality is weak or misleading.

        CriticalAssessment.overall_signal mapping:
          strong     → 1.00  (concrete evidence, real impact)
          moderate   → 0.90  (some evidence but gaps)
          weak       → 0.70  (vague, no quantified impact, buzzword-heavy)
          misleading → 0.50  (claims inconsistent with evidence)
          unknown    → 1.00  (no assessment yet — don't penalize)

        Red flag penalty: −0.05 per flag in CriticalAssessment.red_flags, capped at −0.20.
        Combined multiplier cannot go below 0.10.

        Returns {"multiplier": float, "signal": str}
        """
        rows = await self.client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_ASSESSMENT]->(a:CriticalAssessment)
            RETURN a.overall_signal AS signal, a.red_flags AS red_flags
            LIMIT 1
            """,
            {"user_id": user_id},
        )
        row = rows[0] if rows else {}
        signal = row.get("signal") or "unknown"
        red_flags_raw = row.get("red_flags") or []
        if isinstance(red_flags_raw, str):
            try:
                import json as _j
                red_flags_raw = _j.loads(red_flags_raw)
            except Exception:
                red_flags_raw = [red_flags_raw] if red_flags_raw else []

        signal_map = {
            "strong":     1.00,
            "moderate":   0.90,
            "weak":       0.70,
            "misleading": 0.50,
        }
        base = signal_map.get(signal, 1.0)

        flag_count = len(red_flags_raw) if isinstance(red_flags_raw, list) else 0
        red_flag_penalty = min(flag_count * 0.05, 0.20)

        multiplier = max(0.10, base - red_flag_penalty)
        return {"multiplier": round(multiplier, 4), "signal": signal}

    # ──────────────────────────────────────────────────────────────────────────
    # DIMENSION 1: EVIDENCE-WEIGHTED SKILL SCORE
    # ──────────────────────────────────────────────────────────────────────────

    # ── Hybrid matching helpers ────────────────────────────────────────────────

    # Generic terms that appear in almost every skill's context — not useful
    # for distinguishing specific skills from each other.
    _LEX_STOPWORDS: frozenset[str] = frozenset({
        "skill", "experience", "knowledge", "proficiency", "ability", "using",
        "with", "and", "the", "for", "in", "of", "to", "a", "an", "is", "are",
        "development", "programming", "engineer", "software", "application",
        "system", "service", "services", "tool", "tools", "language", "framework",
        "backend", "frontend", "fullstack", "full", "stack", "web", "mobile",
        "cloud", "data", "api", "code", "coding", "build", "building", "design",
        "implement", "implementation", "work", "working", "used", "use", "years",
        "level", "advanced", "intermediate", "beginner", "expert", "senior",
        "junior", "context", "project", "projects", "team", "teams",
    })

    @classmethod
    def _profile_tokens(cls, *text_parts: str | None) -> set[str]:
        """
        Tokenize and filter skill profile text (name + family + context).
        Strips generic tech stopwords so only distinctive terms remain.
        Preserves C#, C++, .NET-style tokens.
        """
        import re as _re
        combined = " ".join(p for p in text_parts if p)
        raw = _re.sub(r"[^a-z0-9#+.]", " ", combined.lower()).split()
        # Split "react.js" → ["react", "js"] while keeping "c#", "c++"
        tokens: set[str] = set()
        for tok in raw:
            if "#" in tok or "+" in tok:
                tokens.add(tok)
            else:
                for part in tok.split("."):
                    if part:
                        tokens.add(part)
        return tokens - cls._LEX_STOPWORDS - {""}

    @classmethod
    def _lexical_score(cls, job_text: str, user_text: str) -> float:
        """
        Profile-level BM25-inspired lexical overlap.

        Computes the fraction of distinctive job skill terms that appear in the
        user's skill text (name + family + context description).  Using full
        profile text — not just skill names — means the signal scales naturally
        to any tech stack without hardcoding synonyms.

        Returns a [0, 1] precision score: 1.0 = all job terms found in user text.
        """
        job_tokens  = cls._profile_tokens(job_text)
        user_tokens = cls._profile_tokens(user_text)
        if not job_tokens:
            return 0.0
        overlap = job_tokens & user_tokens
        return len(overlap) / len(job_tokens)

    # Confidence multiplier applied to inferred matches in score calculation.
    # Inferred = semantic-only, no shared keywords — we trust it less.
    _INFERRED_CONFIDENCE: float = 0.75

    @classmethod
    def _decide_match(
        cls,
        req_name: str,
        skill_name: str,
        sem_score: float,
        lex_score: float,
        hybrid_threshold: float,
        sem_only_threshold: float,
        sem_weight: float,
        req_family: str | None = None,
        skill_family: str | None = None,
    ) -> tuple[bool, str | None, float]:
        """
        Two-gate hybrid decision:
          • Exact name match           → always match regardless of lex/sem
          • lex >= 0.20 (effective)   → hybrid gate: sem*w + lex*(1-w) >= hybrid_threshold
          • lex <  0.20 (effective)   → semantic-only gate: sem >= effective_threshold
                                        Base threshold: sem_only_threshold (default 0.88)
                                        Cross-family penalty: raised to 0.92 when skill
                                        families differ (prevents short-name false matches)

        lex_score is the full-text lex (name+family+context).
        We also compute a name-only lex and use whichever is higher — this ensures
        that context text can only help matching, never hurt it.

        Returns (matched, method, hybrid_score).
        method: "exact" | "strong" | "inferred" | None
        """
        # ── Name-only lex boost ────────────────────────────────────────────────
        # Context/family text can dilute the lex score for identical skill names.
        # Compute lex on names alone and take the max so context only helps.
        name_only_lex = cls._lexical_score(req_name, skill_name)
        effective_lex = max(lex_score, name_only_lex)

        hybrid = round(sem_weight * sem_score + (1.0 - sem_weight) * effective_lex, 4)

        # ── Exact name shortcut ────────────────────────────────────────────────
        # Identical normalised names always match regardless of context noise.
        req_norm   = req_name.lower().strip()
        skill_norm = skill_name.lower().strip()
        if req_norm == skill_norm and req_norm:
            return True, "exact", 1.0

        if effective_lex >= 0.20:
            matched = hybrid >= hybrid_threshold
            method  = ("exact" if effective_lex >= 0.90 else "strong") if matched else None
        else:
            # Tighten when families are known and differ — but less aggressively
            # than before (0.92 not 0.93) since we already require lex < 0.20
            families_differ = (
                req_family and skill_family and
                req_family.lower().strip() != skill_family.lower().strip()
            )
            effective_threshold = 0.92 if families_differ else sem_only_threshold
            matched = sem_score >= effective_threshold
            method  = "inferred" if matched else None

        return matched, method, hybrid

    async def _score_skill_bucket(
        self,
        user_id: str,
        job_id: str,
        importance_filter: str,
        importance_label: str,
        importance_weight: float,
        sem_floor: float,
        hybrid_threshold: float,
        sem_only_threshold: float,
        sem_weight: float,
    ) -> tuple[list[str], list[str], float, list[dict]]:
        """
        Fetch ANN candidates for one importance bucket, apply hybrid scoring.

        Returns (confirmed_names, inferred_names, matched_weight, match_details).

        confirmed = exact + strong matches (full credit in score)
        inferred  = semantic-only matches  (0.75× credit, shown separately)
        """
        ev_map = {
            "multiple_productions": EvidenceWeight.MULTIPLE_PRODUCTIONS,
            "project_backed":       EvidenceWeight.PROJECT_BACKED,
            "mentioned_once":       EvidenceWeight.MENTIONED_ONCE,
            "claimed_only":         EvidenceWeight.CLAIMED_ONLY,
        }

        candidates = await self.client.run_query(
            f"""
            MATCH (j:Job {{id: $job_id}})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(jsf:JobSkillFamily)-[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            WHERE req.importance {importance_filter} AND req.embedding IS NOT NULL
            CALL {{
                WITH req
                CALL db.index.vector.queryNodes('skill_embeddings', 50, req.embedding)
                YIELD node AS s, score
                WHERE s.user_id = $user_id AND score >= $sem_floor
                OPTIONAL MATCH (sfam:SkillFamily)-[:HAS_SKILL]->(s)
                RETURN s, score, sfam
                ORDER BY score DESC
                LIMIT 1
            }}
            RETURN
                req.name       AS req_name,
                req.context    AS req_context,
                jsf.name       AS req_family,
                req.min_years  AS req_min_years,
                s.name         AS skill_name,
                s.context      AS skill_context,
                sfam.name      AS skill_family,
                toFloat(s.years)                         AS skill_years,
                s.level                                  AS skill_level,
                coalesce(s.evidence_strength, 'unknown') AS evidence_strength,
                score                                    AS semantic_score
            """,
            {"user_id": user_id, "job_id": job_id, "sem_floor": sem_floor},
        )

        confirmed_names: list[str] = []
        inferred_names:  list[str] = []
        matched_weight = 0.0
        details: list[dict] = []
        seen_reqs: set[str] = set()

        for row in candidates:
            req_name    = (row.get("req_name")    or "").strip()
            skill_name  = (row.get("skill_name")  or "").strip()
            req_family  = (row.get("req_family")  or "").strip()
            skill_family = (row.get("skill_family") or "").strip()
            sem_score   = float(row.get("semantic_score") or 0.0)

            job_text  = " ".join(filter(None, [req_name,   req_family,   row.get("req_context")]))
            user_text = " ".join(filter(None, [skill_name, skill_family, row.get("skill_context")]))
            lex_score = self._lexical_score(job_text, user_text)

            matched, method, hybrid = self._decide_match(
                req_name, skill_name, sem_score, lex_score,
                hybrid_threshold, sem_only_threshold, sem_weight,
                req_family=req_family or None,
                skill_family=skill_family or None,
            )

            details.append({
                "job_skill":      req_name.lower(),
                "user_skill":     skill_name.lower(),
                "semantic_score": round(sem_score, 4),
                "lexical_score":  round(lex_score, 4),
                "hybrid_score":   hybrid,
                "matched":        matched,
                "match_method":   method,
                "importance":     importance_label,
            })

            if not matched:
                continue

            req_key = req_name.lower()
            if req_key in seen_reqs:
                continue
            seen_reqs.add(req_key)

            # Inferred matches go to their own list and score at reduced weight
            if method == "inferred":
                inferred_names.append(req_key)
                confidence = self._INFERRED_CONFIDENCE
            else:
                confirmed_names.append(req_key)
                confidence = 1.0

            req_min    = row.get("req_min_years")
            user_years = row.get("skill_years")
            if req_min is None or user_years is None:
                seniority_factor = 1.0
            elif user_years >= float(req_min):
                seniority_factor = 1.0
            else:
                seniority_factor = user_years / float(req_min)

            ev_weight = ev_map.get(
                row.get("evidence_strength", "unknown"),
                EvidenceWeight.UNKNOWN,
            )
            matched_weight += importance_weight * seniority_factor * ev_weight * confidence

        return confirmed_names, inferred_names, matched_weight, details

    async def _compute_skill_score(self, user_id: str, job_id: str) -> dict:
        """
        Hybrid semantic + lexical skill match.

        Two-gate matching:
          1. Lexical overlap present (lex >= 0.20):
               hybrid = sem*0.65 + lex*0.35 >= 0.70   (name-overlap gate)
          2. No lexical overlap (lex < 0.20):
               sem >= 0.88                              (strict semantic gate)

        Gate 1 catches "React" ↔ "React.js" and "Kubernetes" ↔ "k8s" (with alias tokens).
        Gate 2 catches "Machine Learning" ↔ "ML" (very high semantic, no token overlap)
          while rejecting "Java" ↔ "Scala" (lower semantic, no token overlap).

        All thresholds are configurable via env vars.
        """
        sem_floor          = float(os.environ.get("SKILL_SEM_FLOOR",          "0.55"))
        hybrid_threshold   = float(os.environ.get("SKILL_HYBRID_THRESHOLD",   "0.70"))
        sem_only_threshold = float(os.environ.get("SKILL_SEM_ONLY_THRESHOLD", "0.88"))
        sem_weight         = float(os.environ.get("SKILL_SEM_WEIGHT",         "0.65"))

        # ── Mandatory bucket ───────────────────────────────────────────────────
        m_confirmed, m_inferred, m_matched_weight, m_details = await self._score_skill_bucket(
            user_id, job_id,
            importance_filter="= 'must_have'", importance_label="must_have",
            importance_weight=SkillImportanceWeight.MUST_HAVE,
            sem_floor=sem_floor, hybrid_threshold=hybrid_threshold,
            sem_only_threshold=sem_only_threshold, sem_weight=sem_weight,
        )

        mandatory_all = await self.client.run_query(
            """
            OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->
                  (:JobSkillRequirements)-[:HAS_SKILL_FAMILY_REQ]->
                  (:JobSkillFamily)-[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            WHERE req.importance = 'must_have'
            RETURN
                collect(toLower(trim(req.name))) AS all_names,
                reduce(acc = 0.0, x IN collect($w) | acc + x) AS total_weight
            """,
            {"job_id": job_id, "w": SkillImportanceWeight.MUST_HAVE},
        )

        # ── Optional bucket ────────────────────────────────────────────────────
        o_confirmed, o_inferred, o_matched_weight, o_details = await self._score_skill_bucket(
            user_id, job_id,
            importance_filter="<> 'must_have'", importance_label="optional",
            importance_weight=SkillImportanceWeight.OPTIONAL,
            sem_floor=sem_floor, hybrid_threshold=hybrid_threshold,
            sem_only_threshold=sem_only_threshold, sem_weight=sem_weight,
        )

        optional_all = await self.client.run_query(
            """
            OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->
                  (:JobSkillRequirements)-[:HAS_SKILL_FAMILY_REQ]->
                  (:JobSkillFamily)-[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            WHERE req.importance <> 'must_have'
            RETURN
                collect(toLower(trim(req.name))) AS all_names,
                reduce(acc = 0.0, x IN collect($w) | acc + x) AS total_weight
            """,
            {"job_id": job_id, "w": SkillImportanceWeight.OPTIONAL},
        )

        # ── Aggregate ──────────────────────────────────────────────────────────
        m_all_names    = [n for n in (mandatory_all[0]["all_names"] if mandatory_all else [])
                          if isinstance(n, str) and n]
        m_total_weight = mandatory_all[0]["total_weight"] if mandatory_all else 0.0

        o_all_names    = [n for n in (optional_all[0]["all_names"] if optional_all else [])
                          if isinstance(n, str) and n]
        o_total_weight = optional_all[0]["total_weight"] if optional_all else 0.0

        # All matched names (confirmed + inferred) for missing-set subtraction
        m_matched_all = set(m_confirmed) | set(m_inferred)
        o_matched_all = set(o_confirmed) | set(o_inferred)
        missing_mandatory = [n for n in m_all_names if n not in m_matched_all]
        missing_optional  = [n for n in o_all_names if n not in o_matched_all]

        mandatory_score = (m_matched_weight / m_total_weight) if m_total_weight > 0 else 0.0
        optional_score  = (o_matched_weight / o_total_weight) if o_total_weight > 0 else 0.0

        return {
            "mandatory_score":   mandatory_score,
            "optional_score":    optional_score,
            "matched":           m_confirmed,                    # exact + strong only
            "inferred":          m_inferred + o_inferred,        # semantic-only, shown separately
            "missing":           missing_mandatory,
            "optional_matched":  o_confirmed,
            "optional_missing":  missing_optional,
            "match_details":     m_details + o_details,
            "has_mandatory_reqs": m_total_weight > 0,            # job has must_have requirements
        }

    # ──────────────────────────────────────────────────────────────────────────
    # DIMENSION 2: DEPTH-WEIGHTED DOMAIN SCORE
    # ──────────────────────────────────────────────────────────────────────────

    async def _compute_domain_score(self, user_id: str, job_id: str) -> dict:
        """
        Depth-weighted domain match via vector index ANN search.

        Each matched domain contributes: depth_weight / total_job_domains
        depth weights: deep=1.00, moderate=0.70, shallow=0.40

        Replaces exact Python string matching with semantic vector similarity so
        that near-synonyms (e.g. "FinTech" vs "Financial Technology") are matched.
        """
        threshold = float(os.environ.get("SEMANTIC_MATCH_THRESHOLD", "0.72"))

        # ── All job domain requirements (denominator + missing list) ───────────
        all_reqs = await self.client.run_query(
            """
            OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_DOMAIN_REQUIREMENTS]->
                  (:JobDomainRequirements)-[:HAS_DOMAIN_FAMILY_REQ]->
                  (:JobDomainFamily)-[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
            RETURN collect(toLower(trim(dr.name))) AS all_names
            """,
            {"job_id": job_id},
        )
        all_names = [
            n for n in (all_reqs[0]["all_names"] if all_reqs else [])
            if isinstance(n, str) and n
        ]
        if not all_names:
            return {"score": 0.0, "matched": [], "missing": []}

        # ── Vector-matched domains ─────────────────────────────────────────────
        matched_rows = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_DOMAIN_REQUIREMENTS]->(:JobDomainRequirements)
                  -[:HAS_DOMAIN_FAMILY_REQ]->(:JobDomainFamily)-[:REQUIRES_DOMAIN]->(dr:JobDomainRequirement)
            WHERE dr.embedding IS NOT NULL
            CALL {
                WITH dr
                CALL db.index.vector.queryNodes('domain_embeddings', 50, dr.embedding)
                YIELD node AS d, score
                WHERE d.user_id = $user_id AND score >= $threshold
                RETURN d, score
                ORDER BY score DESC
                LIMIT 1
            }
            WITH dr,
                 CASE coalesce(d.depth, 'unknown')
                   WHEN 'deep'     THEN $d_deep
                   WHEN 'moderate' THEN $d_moderate
                   WHEN 'shallow'  THEN $d_shallow
                   ELSE                 $d_unknown
                 END AS depth_weight
            RETURN
                collect(toLower(trim(dr.name))) AS matched_names,
                sum(depth_weight) AS total_depth_weight
            """,
            {
                "user_id": user_id, "job_id": job_id, "threshold": threshold,
                "d_deep":     DomainDepthWeight.DEEP,
                "d_moderate": DomainDepthWeight.MODERATE,
                "d_shallow":  DomainDepthWeight.SHALLOW,
                "d_unknown":  DomainDepthWeight.UNKNOWN,
            },
        )

        matched_names = [
            n for n in (matched_rows[0]["matched_names"] if matched_rows else [])
            if isinstance(n, str) and n
        ]
        total_depth_weight = (matched_rows[0]["total_depth_weight"] if matched_rows else 0.0) or 0.0

        missing = [n for n in all_names if n not in set(matched_names)]
        # Score = sum(depth_weights of matched) / total_domains
        # Max possible = each domain matched at full depth = len(all_names) × 1.0
        score = total_depth_weight / len(all_names) if all_names else 0.0

        return {"score": score, "matched": matched_names, "missing": missing}

    # ──────────────────────────────────────────────────────────────────────────
    # DIMENSION 3: SOFT SKILL ALIGNMENT SCORE
    # ──────────────────────────────────────────────────────────────────────────

    async def _compute_soft_skill_score(self, user_id: str, job_id: str) -> dict:
        """
        Soft skill score based on SoftSkillRequirement nodes (job side) vs
        ProblemSolvingPattern + Experience.contribution_type + BehavioralInsight (user side).

        Returns None score when job has no SoftSkillRequirements or user has no
        behavioral data - allowing graceful weight redistribution.

        Also returns behavioral_risk_flags: risk signals from BehavioralInsight nodes
        that conflict with dealbreaker soft skills.
        """
        # Query job soft skill requirements
        soft_reqs = await self.client.run_query(
            """
            OPTIONAL MATCH (j:Job {id: $job_id})-[:REQUIRES_QUALITY]->(s:SoftSkillRequirement)
            RETURN s.name AS name, s.quality AS quality,
                   coalesce(s.dealbreaker, false) AS dealbreaker
            """,
            {"job_id": job_id},
        )
        soft_reqs = [r for r in soft_reqs if r.get("quality")]
        if not soft_reqs:
            return {"score": None, "risk_flags": []}

        # Query user patterns and behavioral insights
        user_patterns = await self.client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_PATTERN_CATEGORY]->
                  (:PatternCategory)-[:HAS_PATTERN]->(p:ProblemSolvingPattern)
            RETURN toLower(trim(p.pattern)) AS pattern
            """,
            {"user_id": user_id},
        )
        user_pattern_set = {
            canonicalize_matching_term(r["pattern"])
            for r in user_patterns
            if r.get("pattern")
        }

        # Also pull ownership signals from experience contribution_type
        exp_contributions = await self.client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_EXPERIENCE_CATEGORY]->
                  (:ExperienceCategory)-[:HAS_EXPERIENCE]->(e:Experience)
            RETURN coalesce(e.contribution_type, 'unclear') AS contribution_type
            """,
            {"user_id": user_id},
        )
        has_leadership = any(
            r["contribution_type"] in ("sole_engineer", "tech_lead")
            for r in exp_contributions
        )
        if has_leadership:
            # Ownership is evidenced by leading/sole work
            user_pattern_set.add("_has_ownership_evidence")

        # Pull behavioral insights for risk flag detection
        behavior_rows = await self.client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_BEHAVIORAL_INSIGHT]->(b:BehavioralInsight)
            RETURN b.insight_type AS insight_type, b.trigger AS trigger, b.implication AS implication
            """,
            {"user_id": user_id},
        )
        risk_behavior = [
            r for r in behavior_rows
            if r.get("insight_type") in BEHAVIORAL_RISK_TYPES
        ]

        if not user_pattern_set and not has_leadership:
            # No behavioral data at all - cannot score
            return {"score": None, "risk_flags": []}

        total = len(soft_reqs)
        matched_weight = 0.0
        risk_flags: list[str] = []

        for req in soft_reqs:
            quality = normalize_soft_skill_quality(req.get("quality"))
            dealbreaker  = req.get("dealbreaker", False)
            patterns_needed = {
                canonicalize_matching_term(p)
                for p in SOFT_SKILL_TO_PATTERN.get(quality, [])
            }
            if quality:
                patterns_needed.add(quality)

            # Ownership quality: also accept _has_ownership_evidence signal
            if quality == "ownership" and "_has_ownership_evidence" in user_pattern_set:
                patterns_needed.add("_has_ownership_evidence")

            has_evidence = any(p in user_pattern_set for p in patterns_needed)

            # Check if any risk behavior conflicts with this requirement
            if not has_evidence and risk_behavior and dealbreaker:
                risk_flags.append(
                    f"Behavioral signal conflicts with '{quality}' requirement "
                    f"(dealbreaker): {risk_behavior[0].get('implication', 'push-back pattern observed')}"
                )
                matched_weight += 0.0  # no credit for dealbreaker with risk signal
            elif has_evidence:
                matched_weight += 1.0
            else:
                matched_weight += 0.0  # no evidence = no credit; neutral default belongs at weight-redistribution layer

        score = matched_weight / total if total > 0 else None

        return {"score": score, "risk_flags": risk_flags}

    # ──────────────────────────────────────────────────────────────────────────
    # DIMENSION 4: CULTURE FIT SCORE (digital twin alignment)
    # ──────────────────────────────────────────────────────────────────────────

    async def _compute_culture_fit_score(self, user_id: str, job_id: str) -> dict:
        """
        Culture fit score based on CultureIdentity (user) vs TeamCultureIdentity (job).

        Returns None score when either side lacks digital twin culture data,
        allowing graceful weight redistribution to technical dimensions.

        Matching axes:
          1. pace_preference vs TeamCultureIdentity.pace
          2. feedback_preference vs TeamCultureIdentity.feedback_culture
          3. leadership_style vs TeamCultureIdentity.management_style
          4. energy_drains NOT overlapping with TeamCultureIdentity.anti_patterns
          5. team_size_preference vs TeamComposition.team_size (when available)
        """
        import json as _j

        user_culture = await self.client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_CULTURE_IDENTITY]->(c:CultureIdentity)
            RETURN c.team_size_preference AS team_size_preference,
                   c.leadership_style     AS leadership_style,
                   c.feedback_preference  AS feedback_preference,
                   c.pace_preference      AS pace_preference,
                   c.energy_drains        AS energy_drains
            """,
            {"user_id": user_id},
        )
        job_culture = await self.client.run_query(
            """
            OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_TEAM_CULTURE]->(tc:TeamCultureIdentity)
            RETURN tc.management_style    AS management_style,
                   tc.feedback_culture   AS feedback_culture,
                   tc.pace               AS pace,
                   tc.anti_patterns      AS anti_patterns,
                   tc.decision_making    AS decision_making
            """,
            {"job_id": job_id},
        )

        uc = user_culture[0] if user_culture else {}
        jc = job_culture[0] if job_culture else {}

        # Require at least one matchable field on each side — allows partial culture data
        _user_fields = ["pace_preference", "feedback_preference", "leadership_style"]
        _job_fields  = ["pace", "feedback_culture", "management_style"]
        if not any(uc.get(f) for f in _user_fields):
            return {"score": None}
        if not any(jc.get(f) for f in _job_fields):
            return {"score": None}

        checks = 0
        hits   = 0.0

        # 1. Pace
        user_pace = (uc.get("pace_preference") or "").lower()
        job_pace  = (jc.get("pace") or "").lower()
        if user_pace and job_pace:
            checks += 1
            compatible = CULTURE_FIELD_MAP["pace"].get(user_pace, [])
            hits += 1.0 if job_pace in compatible else 0.0

        # 2. Feedback
        user_fb = (uc.get("feedback_preference") or "").lower()
        job_fb  = (jc.get("feedback_culture") or "").lower()
        if user_fb and job_fb:
            checks += 1
            compatible = CULTURE_FIELD_MAP["feedback"].get(user_fb, [])
            hits += 1.0 if job_fb in compatible else 0.0

        # 3. Leadership style vs management style
        user_lead = (uc.get("leadership_style") or "").lower()
        job_mgmt  = (jc.get("management_style") or "").lower()
        if user_lead and job_mgmt:
            checks += 1
            compatible = CULTURE_FIELD_MAP["management"].get(user_lead, [])
            hits += 1.0 if job_mgmt in compatible else 0.0

        # 4. Energy drains vs anti-patterns (overlap = bad = lower score)
        raw_drains       = uc.get("energy_drains") or "[]"
        raw_anti         = jc.get("anti_patterns") or "[]"
        try:
            drains   = _j.loads(raw_drains) if isinstance(raw_drains, str) else raw_drains
            anti     = _j.loads(raw_anti)   if isinstance(raw_anti, str)   else raw_anti
        except Exception:
            drains, anti = [], []

        if drains and anti:
            drains_norm = {d.lower().strip() for d in drains}
            anti_norm   = {a.lower().strip() for a in anti}
            overlap     = drains_norm & anti_norm
            checks += 1
            # No overlap = full hit (user's drains don't match job's anti-patterns)
            hits += 1.0 if not overlap else max(0.0, 1.0 - len(overlap) / max(len(drains_norm), 1))

        score = (hits / checks) if checks > 0 else None
        return {"score": score}

    # ──────────────────────────────────────────────────────────────────────────
    # LEGACY BONUS SIGNALS (kept for backwards compat, not in total_score)
    # ──────────────────────────────────────────────────────────────────────────

    async def _compute_culture_bonus(self, user_id: str, job_id: str) -> dict:
        """
        Legacy culture bonus: ratio of job WorkStyle nodes that match user Preference(work_style).
        Uses synonym normalization. Kept as supplementary signal alongside culture_fit_score.
        """
        records = await self.client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_PREFERENCE_CATEGORY]->
                  (:PreferenceCategory)-[:HAS_PREFERENCE]->(p:Preference)
            WHERE p.type = 'work_style'
            WITH collect(toLower(trim(p.value))) AS user_styles

            OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_CULTURE_REQUIREMENTS]->
                  (:JobCultureRequirements)-[:HAS_WORK_STYLE]->(ws:WorkStyle)
            RETURN user_styles, collect(toLower(trim(ws.style))) AS job_styles
            """,
            {"user_id": user_id, "job_id": job_id},
        )
        if not records:
            return {"bonus": 0.0}
        user_raw = records[0]["user_styles"] or []
        job_raw  = records[0]["job_styles"]  or []
        if not job_raw:
            return {"bonus": 0.0}
        user_canonical = {normalize_work_style(s) for s in user_raw}
        matched = sum(1 for js in job_raw if normalize_work_style(js) in user_canonical)
        return {"bonus": round(matched / len(job_raw), 3)}

    async def _compute_preference_bonus(self, user_id: str, job_id: str) -> dict:
        """
        Preference bonus: remote_work + company_size match ratio.
        """
        records = await self.client.run_query(
            """
            OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_PREFERENCE_CATEGORY]->
                  (:PreferenceCategory)-[:HAS_PREFERENCE]->(p:Preference)
            WHERE p.type IN ['remote_work', 'company_size']
            WITH collect({type: p.type, value: toLower(trim(p.value))}) AS user_prefs

            MATCH (j:Job {id: $job_id})
            RETURN user_prefs,
                   toLower(trim(j.remote_policy)) AS remote_policy,
                   toLower(trim(j.company_size))  AS company_size
            """,
            {"user_id": user_id, "job_id": job_id},
        )
        if not records or not records[0]["user_prefs"]:
            return {"bonus": 0.0}
        row   = records[0]
        prefs = row["user_prefs"]
        matched = 0
        for pref in prefs:
            if pref["type"] == "remote_work":
                if normalize_work_style(pref["value"]) == normalize_work_style(row["remote_policy"] or ""):
                    matched += 1
            elif pref["type"] == "company_size":
                if pref["value"] == (row["company_size"] or ""):
                    matched += 1
        return {"bonus": round(matched / len(prefs), 3)}

    # ──────────────────────────────────────────────────────────────────────────
    # GRAPH PATH TRACING (Scrutability)
    # ──────────────────────────────────────────────────────────────────────────

    async def trace_match_paths(
        self, user_id: str, job_id: str, limit: int = 10
    ) -> list[dict]:
        """
        Find explicit graph paths connecting a user to a job via MATCHES edges.
        Every path represents a concrete, auditable match reason.
        """
        records = await self.client.run_query(
            """
            MATCH path = (u:User {id: $user_id})
                         -[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                         -[:HAS_SKILL_FAMILY]->(:SkillFamily)
                         -[:HAS_SKILL]->(s:Skill)
                         -[:MATCHES]->(r:JobSkillRequirement)
                         <-[:REQUIRES_SKILL]-(:JobSkillFamily)
                         <-[:HAS_SKILL_FAMILY_REQ]-(:JobSkillRequirements)
                         <-[:HAS_SKILL_REQUIREMENTS]-(j:Job {id: $job_id})
            RETURN
                [node IN nodes(path) | coalesce(node.name, node.id, node.title, '')] AS node_names,
                [rel  IN relationships(path) | type(rel)] AS rel_types,
                length(path) AS path_length
            ORDER BY path_length
            LIMIT $limit

            UNION

            MATCH path = (u:User {id: $user_id})
                         -[:HAS_DOMAIN_CATEGORY]->(:DomainCategory)
                         -[:HAS_DOMAIN_FAMILY]->(:DomainFamily)
                         -[:HAS_DOMAIN]->(d:Domain)
                         -[:MATCHES]->(dr:JobDomainRequirement)
                         <-[:REQUIRES_DOMAIN]-(:JobDomainFamily)
                         <-[:HAS_DOMAIN_FAMILY_REQ]-(:JobDomainRequirements)
                         <-[:HAS_DOMAIN_REQUIREMENTS]-(j:Job {id: $job_id})
            RETURN
                [node IN nodes(path) | coalesce(node.name, node.id, node.title, '')] AS node_names,
                [rel  IN relationships(path) | type(rel)] AS rel_types,
                length(path) AS path_length
            ORDER BY path_length
            LIMIT $limit
            """,
            {"user_id": user_id, "job_id": job_id, "limit": limit},
        )
        paths = []
        for record in records:
            names    = record.get("node_names", [])
            rels     = record.get("rel_types", [])
            path_str = " → ".join(
                part for pair in zip(names, rels + [""]) for part in pair if part
            )
            paths.append({"path": path_str, "length": record.get("path_length")})
        return paths

    # ──────────────────────────────────────────────────────────────────────────
    # RICH CONTEXT FOR LLM EXPLANATION
    # ──────────────────────────────────────────────────────────────────────────

    async def gather_match_context(self, user_id: str, job_id: str) -> dict:
        """
        Pull full contextual data for a user-job pair to power a detailed LLM explanation.

        Now includes the complete digital twin portrait on both sides:
          User: skills+evidence, domains+depth, assessment, motivation, goals,
                culture identity, behavioral insights, anecdotes
          Job:  skill reqs, domain reqs, soft skill reqs, team culture,
                role context, hiring goals, success metrics, interview signals
        """
        import json as _j

        # ── User side ──────────────────────────────────────────────────────────

        matched_rich = await self.client.run_query(
            """
            MATCH (u:User {id: $user_id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                  -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(s:Skill)
                  -[:MATCHES]->(req:JobSkillRequirement)
                  <-[:REQUIRES_SKILL]-(:JobSkillFamily)
                  <-[:HAS_SKILL_FAMILY_REQ]-(:JobSkillRequirements)
                  <-[:HAS_SKILL_REQUIREMENTS]-(j:Job {id: $job_id})
            OPTIONAL MATCH (p:Project {user_id: $user_id})-[demo:DEMONSTRATES_SKILL]->(s)
            OPTIONAL MATCH (s)-[:GROUNDED_IN]->(anec:Anecdote)
            RETURN s.name              AS skill,
                   s.level             AS level,
                   s.years             AS years,
                   s.evidence_strength AS evidence_strength,
                   req.importance      AS importance,
                   req.min_years       AS min_years,
                   collect(DISTINCT demo.context)[0..3] AS usage_contexts,
                   collect(DISTINCT demo.what)[0..2]    AS usage_what,
                   collect(DISTINCT demo.outcome)[0..2] AS outcomes,
                   collect(DISTINCT anec.situation)[0..1] AS anecdote_situations,
                   collect(DISTINCT anec.result)[0..1]    AS anecdote_results
            ORDER BY CASE req.importance WHEN 'must_have' THEN 0 ELSE 1 END, s.years DESC
            """,
            {"user_id": user_id, "job_id": job_id},
        )

        all_reqs = await self.client.run_query(
            """
            MATCH (j:Job {id: $job_id})-[:HAS_SKILL_REQUIREMENTS]->(:JobSkillRequirements)
                  -[:HAS_SKILL_FAMILY_REQ]->(:JobSkillFamily)-[:REQUIRES_SKILL]->(req:JobSkillRequirement)
            OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_SKILL_CATEGORY]->(:SkillCategory)
                  -[:HAS_SKILL_FAMILY]->(:SkillFamily)-[:HAS_SKILL]->(s:Skill)
                  -[:MATCHES]->(req)
            RETURN req.name AS skill, req.importance AS importance,
                   req.min_years AS min_years, s IS NOT NULL AS matched
            """,
            {"user_id": user_id, "job_id": job_id},
        )
        missing_must = [
            {"skill": r["skill"], "min_years": r["min_years"]}
            for r in all_reqs
            if not r["matched"] and r["importance"] == "must_have"
        ]
        missing_nice = [r["skill"] for r in all_reqs if not r["matched"] and r["importance"] != "must_have"]

        assessment_rows = await self.client.run_query(
            """
            MATCH (u:User {id: $user_id})-[:HAS_ASSESSMENT]->(a:CriticalAssessment)
            RETURN a.overall_signal AS overall_signal, a.seniority_assessment AS seniority_assessment,
                   a.depth_vs_breadth AS depth_vs_breadth, a.candidate_identity AS candidate_identity,
                   a.honest_summary AS honest_summary, a.genuine_strengths AS genuine_strengths,
                   a.red_flags AS red_flags, a.inflated_skills AS inflated_skills,
                   a.five_w_h_summary AS five_w_h_summary
            """,
            {"user_id": user_id},
        )
        assessment = {}
        if assessment_rows:
            raw = dict(assessment_rows[0])
            for key in ("genuine_strengths", "red_flags", "inflated_skills"):
                val = raw.get(key)
                if isinstance(val, str):
                    try:
                        raw[key] = _j.loads(val)
                    except Exception:
                        raw[key] = [val] if val else []
            if isinstance(raw.get("five_w_h_summary"), str):
                try:
                    raw["five_w_h_summary"] = _j.loads(raw["five_w_h_summary"])
                except Exception:
                    pass
            assessment = raw

        # User digital twin - human portrait
        motivations = await self.client.run_query(
            "OPTIONAL MATCH (u:User {id: $user_id})-[:MOTIVATED_BY]->(m:Motivation) "
            "RETURN m.category AS category, m.strength AS strength, m.evidence AS evidence "
            "ORDER BY m.strength DESC LIMIT 3",
            {"user_id": user_id},
        )
        values = await self.client.run_query(
            "OPTIONAL MATCH (u:User {id: $user_id})-[:HOLDS_VALUE]->(v:Value) "
            "RETURN v.name AS name, v.priority_rank AS priority_rank, v.evidence AS evidence "
            "ORDER BY v.priority_rank LIMIT 5",
            {"user_id": user_id},
        )
        goals = await self.client.run_query(
            "OPTIONAL MATCH (u:User {id: $user_id})-[:ASPIRES_TO]->(g:Goal) "
            "RETURN g.type AS type, g.description AS description, "
            "g.timeframe_years AS timeframe_years, g.clarity_level AS clarity_level",
            {"user_id": user_id},
        )
        user_culture = await self.client.run_query(
            "OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_CULTURE_IDENTITY]->(c:CultureIdentity) "
            "RETURN c.team_size_preference AS team_size_preference, "
            "c.leadership_style AS leadership_style, c.feedback_preference AS feedback_preference, "
            "c.pace_preference AS pace_preference, c.energy_sources AS energy_sources, "
            "c.energy_drains AS energy_drains, c.conflict_style AS conflict_style",
            {"user_id": user_id},
        )
        behavioral_insights = await self.client.run_query(
            "OPTIONAL MATCH (u:User {id: $user_id})-[:HAS_BEHAVIORAL_INSIGHT]->(b:BehavioralInsight) "
            "RETURN b.insight_type AS insight_type, b.trigger AS trigger, b.implication AS implication",
            {"user_id": user_id},
        )
        domains_rich = await self.client.run_query(
            """
            MATCH (u:User {id: $user_id})-[:HAS_DOMAIN_CATEGORY]->(:DomainCategory)
                  -[:HAS_DOMAIN_FAMILY]->(:DomainFamily)-[:HAS_DOMAIN]->(d:Domain)
                  -[:MATCHES]->(dr:JobDomainRequirement)
                  <-[:REQUIRES_DOMAIN]-(:JobDomainFamily)
                  <-[:HAS_DOMAIN_FAMILY_REQ]-(:JobDomainRequirements)
                  <-[:HAS_DOMAIN_REQUIREMENTS]-(j:Job {id: $job_id})
            RETURN d.name AS domain, d.depth AS depth, d.years_experience AS years
            ORDER BY d.years_experience DESC
            """,
            {"user_id": user_id, "job_id": job_id},
        )

        # ── Job side ───────────────────────────────────────────────────────────

        job_meta_rows = await self.client.run_query(
            "MATCH (j:Job {id: $job_id}) RETURN j.experience_years_min AS exp_min, "
            "j.company_size AS company_size, j.remote_policy AS remote_policy, "
            "j.title AS title, j.company AS company",
            {"job_id": job_id},
        )
        job_meta = dict(job_meta_rows[0]) if job_meta_rows else {}

        soft_skill_reqs = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:REQUIRES_QUALITY]->(s:SoftSkillRequirement) "
            "RETURN s.name AS name, s.quality AS quality, s.expectation AS expectation, "
            "s.evidence_indicator AS evidence_indicator, s.dealbreaker AS dealbreaker",
            {"job_id": job_id},
        )
        job_team_culture = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_TEAM_CULTURE]->(tc:TeamCultureIdentity) "
            "RETURN tc.decision_making AS decision_making, tc.communication_style AS communication_style, "
            "tc.feedback_culture AS feedback_culture, tc.pace AS pace, tc.work_life AS work_life, "
            "tc.management_style AS management_style, tc.team_values AS team_values, "
            "tc.anti_patterns AS anti_patterns",
            {"job_id": job_id},
        )
        role_context = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_ROLE_CONTEXT]->(r:RoleContext) "
            "RETURN r.owns_what AS owns_what, r.first_90_days AS first_90_days, "
            "r.growth_trajectory AS growth_trajectory, r.why_role_open AS why_role_open",
            {"job_id": job_id},
        )
        hiring_goals = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:DRIVEN_BY]->(h:HiringGoal) "
            "RETURN h.gap_being_filled AS gap_being_filled, h.urgency AS urgency, "
            "h.dealbreaker_absence AS dealbreaker_absence, h.ideal_background AS ideal_background",
            {"job_id": job_id},
        )
        success_metrics = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:DEFINES_SUCCESS_BY]->(m:SuccessMetric) "
            "RETURN m.at_90_days AS at_90_days, m.at_1_year AS at_1_year, "
            "m.key_deliverables AS key_deliverables",
            {"job_id": job_id},
        )
        team_composition = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_TEAM_COMPOSITION]->(t:TeamComposition) "
            "RETURN t.team_size AS team_size, t.team_makeup AS team_makeup, "
            "t.hiring_for_gap AS hiring_for_gap",
            {"job_id": job_id},
        )

        # ── Deep job profile nodes ─────────────────────────────────────────────
        company_profile_rows = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_COMPANY_PROFILE]->(c:CompanyProfile) "
            "RETURN c.mission AS mission, c.vision AS vision, c.values AS values, "
            "c.stage AS stage, c.product_description AS product_description, c.industry AS industry",
            {"job_id": job_id},
        )
        hiring_team_rows = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_HIRING_TEAM]->(t:HiringTeam) "
            "RETURN t.name AS name, t.description AS description, t.product_built AS product_built, "
            "t.team_size_est AS team_size_est, t.tech_focus AS tech_focus, t.team_type AS team_type",
            {"job_id": job_id},
        )
        role_exp_rows = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_ROLE_EXPECTATIONS]->(r:RoleExpectation) "
            "RETURN r.key_responsibilities AS key_responsibilities, "
            "r.success_metrics AS success_metrics, r.first_30_days AS first_30_days, "
            "r.first_90_days AS first_90_days, r.autonomy_level AS autonomy_level",
            {"job_id": job_id},
        )
        job_soft_req_rows = await self.client.run_query(
            "OPTIONAL MATCH (j:Job {id: $job_id})-[:HAS_SOFT_REQUIREMENTS]->(s:JobSoftRequirement) "
            "RETURN s.trait AS trait, s.description AS description, s.is_dealbreaker AS is_dealbreaker",
            {"job_id": job_id},
        )

        def _safe_parse_json(val):
            if not val:
                return []
            if isinstance(val, list):
                return val
            try:
                import json as _j2
                return _j2.loads(val)
            except Exception:
                return [val] if val else []

        company_profile_ctx = {}
        if company_profile_rows and company_profile_rows[0].get("mission"):
            cp = company_profile_rows[0]
            company_profile_ctx = {
                "mission": cp.get("mission"),
                "vision": cp.get("vision"),
                "values": _safe_parse_json(cp.get("values")),
                "stage": cp.get("stage"),
                "product_description": cp.get("product_description"),
                "industry": cp.get("industry"),
            }

        hiring_team_ctx = {}
        if hiring_team_rows and hiring_team_rows[0].get("name"):
            t = hiring_team_rows[0]
            hiring_team_ctx = {
                "name": t.get("name"),
                "description": t.get("description"),
                "product_built": t.get("product_built"),
                "team_size_est": t.get("team_size_est"),
                "tech_focus": _safe_parse_json(t.get("tech_focus")),
                "team_type": t.get("team_type"),
            }

        role_exp_ctx = {}
        if role_exp_rows and role_exp_rows[0].get("key_responsibilities"):
            r = role_exp_rows[0]
            role_exp_ctx = {
                "key_responsibilities": _safe_parse_json(r.get("key_responsibilities")),
                "success_metrics": _safe_parse_json(r.get("success_metrics")),
                "first_30_days": r.get("first_30_days"),
                "first_90_days": r.get("first_90_days"),
                "autonomy_level": r.get("autonomy_level"),
            }

        return {
            # User technical
            "matched_skills_rich":   [dict(r) for r in matched_rich],
            "missing_must_have":     missing_must,
            "missing_nice":          missing_nice,
            "matched_domains_rich":  [dict(r) for r in domains_rich],
            # User assessment
            "assessment":            assessment,
            # User human portrait
            "motivations":           [dict(r) for r in motivations if r.get("category")],
            "values":                [dict(r) for r in values if r.get("name")],
            "goals":                 [dict(r) for r in goals if r.get("description")],
            "user_culture":          dict(user_culture[0]) if user_culture and user_culture[0].get("pace_preference") else {},
            "behavioral_insights":   [dict(r) for r in behavioral_insights if r.get("insight_type")],
            # Job context (legacy nodes)
            "job_meta":              job_meta,
            "soft_skill_reqs":       [dict(r) for r in soft_skill_reqs if r.get("quality")],
            "job_team_culture":      dict(job_team_culture[0]) if job_team_culture and job_team_culture[0].get("pace") else {},
            "role_context":          dict(role_context[0]) if role_context and role_context[0].get("owns_what") else {},
            "hiring_goals":          dict(hiring_goals[0]) if hiring_goals and hiring_goals[0].get("gap_being_filled") else {},
            "success_metrics":       dict(success_metrics[0]) if success_metrics and success_metrics[0].get("at_90_days") else {},
            "team_composition":      dict(team_composition[0]) if team_composition and team_composition[0].get("team_size") else {},
            # Deep job profile (new nodes)
            "company_profile":       company_profile_ctx,
            "hiring_team":           hiring_team_ctx,
            "role_expectations":     role_exp_ctx,
            "job_soft_requirements": [dict(r) for r in job_soft_req_rows if r.get("trait")],
        }

    # ──────────────────────────────────────────────────────────────────────────
    # HELPERS
    # ──────────────────────────────────────────────────────────────────────────

    def _build_explanation(
        self,
        skill_score: float,
        domain_score: float,
        soft_skill_score: float | None,
        culture_fit_score: float | None,
        culture_bonus: float,
        preference_bonus: float,
    ) -> str:
        parts = []

        if skill_score >= 0.8:
            parts.append("Strong evidence-weighted skill alignment")
        elif skill_score >= 0.5:
            parts.append("Moderate skill overlap")
        elif skill_score > 0:
            parts.append("Limited skill match (check evidence depth)")
        else:
            parts.append("No skill overlap found")

        if domain_score >= 0.7:
            parts.append("deep domain expertise aligns")
        elif domain_score >= 0.4:
            parts.append("partial domain match")

        if soft_skill_score is not None:
            if soft_skill_score >= 0.8:
                parts.append("strong soft skill alignment")
            elif soft_skill_score >= 0.5:
                parts.append("partial soft skill match")
            else:
                parts.append("soft skill gaps detected")

        if culture_fit_score is not None:
            if culture_fit_score >= 0.8:
                parts.append("strong culture fit")
            elif culture_fit_score >= 0.5:
                parts.append("partial culture alignment")
            else:
                parts.append("culture mismatch signals")
        elif culture_bonus >= 0.7:
            parts.append("work style alignment")

        if preference_bonus == 1.0:
            parts.append("preferences fully satisfied")
        elif preference_bonus > 0:
            parts.append("partial preference match")

        return "; ".join(parts) if parts else "Insufficient overlap for match"
