"""
Pydantic schemas for two purposes:
1. Gemini structured output (response_schema) - controls LLM extraction format
2. FastAPI request/response bodies - controls API interface

Keep these separate to allow them to evolve independently.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


# ──────────────────────────────────────────────────────────────────────────────
# GEMINI EXTRACTION SCHEMAS
# Passed as response_schema to GenerationConfig. Gemini enforces the JSON shape.
# ──────────────────────────────────────────────────────────────────────────────

class ExtractedSkill(BaseModel):
    name: str = Field(description="Canonical skill name, e.g. 'Python', 'React'")
    family: str = Field(
        description=(
            "Skill family grouping. Must be one of: "
            "Programming Languages, Web Frameworks, Databases, Cloud & DevOps, "
            "ML & AI, Data Engineering, Mobile Development, Testing & QA, "
            "Analytics & Visualization, Other"
        )
    )
    years: Optional[float] = Field(default=None, description="Years of experience, null if unknown")
    level: Optional[Literal["beginner", "intermediate", "advanced", "expert"]] = Field(
        default=None, description="Proficiency level inferred from context - be conservative, not generous"
    )
    evidence_strength: Optional[Literal["claimed_only", "mentioned_once", "project_backed", "multiple_productions"]] = Field(
        default=None,
        description=(
            "How well evidenced is this skill? "
            "'claimed_only' = listed as skill but no project evidence; "
            "'mentioned_once' = appears in one project/role but superficially; "
            "'project_backed' = has at least one concrete project with this skill; "
            "'multiple_productions' = demonstrated across multiple real projects/roles"
        )
    )


class SkillUsage(BaseModel):
    """
    Rich 5W+H capture of a skill used in a specific project context.
    This enables graph-to-graph matching beyond simple name matching.
    """
    name: str = Field(description="Canonical skill name used in this project, e.g. 'Python', 'React'")
    what: Optional[str] = Field(
        default=None,
        description="WHAT was built or accomplished using this skill in this project. Be specific."
    )
    how: Optional[str] = Field(
        default=None,
        description=(
            "HOW this skill was applied - specific patterns, techniques, frameworks, or approaches used. "
            "E.g. 'Used async/await patterns with connection pooling to handle concurrent DB queries'"
        )
    )
    why: Optional[str] = Field(
        default=None,
        description="WHY this skill was chosen or what problem it solved in this context."
    )
    scale: Optional[str] = Field(
        default=None,
        description="Scale or scope: users, data volume, requests/sec, team size, revenue - whatever is relevant."
    )
    outcome: Optional[str] = Field(
        default=None,
        description="Measurable outcome or impact from using this skill. Null if not mentioned."
    )
    # Computed summary for backwards-compat and quick display
    context: Optional[str] = Field(
        default=None,
        description=(
            "Single-sentence summary combining the most important 5W+H signals. "
            "Auto-generate from the other fields if not provided. "
            "E.g. 'Built async payment API (FastAPI) handling 10k req/s, reducing latency by 40%'"
        )
    )


class ExtractedProject(BaseModel):
    name: str = Field(description="Project name")
    description: str = Field(
        description=(
            "Rich description covering: (1) what the project does, (2) your specific contribution "
            "vs team contribution, (3) scale or impact (users, data volume, team size, revenue), "
            "(4) key technical challenges solved. Be specific and quantify where possible. "
            "Do NOT embellish - capture only what is stated."
        )
    )
    skills_demonstrated: List[SkillUsage] = Field(
        description="Skills directly used in this project, each with context on HOW it was applied"
    )
    domain: Optional[str] = Field(
        default=None,
        description="Domain this project belongs to, e.g. 'FinTech', 'Healthcare'"
    )
    contribution_type: Optional[Literal["sole_engineer", "tech_lead", "senior_contributor", "team_member", "unclear"]] = Field(
        default=None,
        description="What was the person's actual role/ownership level on this project?"
    )
    has_measurable_impact: bool = Field(
        default=False,
        description="True only if the description contains at least one concrete metric or measurable outcome"
    )


class ExtractedDomain(BaseModel):
    name: str = Field(description="Specific domain area, e.g. 'Payment Systems', 'NLP'")
    family: str = Field(
        description=(
            "Domain family. Must be one of: "
            "FinTech, Healthcare, E-commerce, SaaS, Enterprise, Gaming, Education, Other"
        )
    )
    years_experience: Optional[float] = Field(
        default=None, description="Years of domain experience, null if unknown"
    )
    depth: Optional[Literal["shallow", "moderate", "deep"]] = Field(
        default=None, description="Depth of domain knowledge"
    )


class ExtractedExperience(BaseModel):
    title: str = Field(description="Job title")
    company: Optional[str] = Field(default=None, description="Company name, null if not mentioned")
    duration_years: Optional[float] = Field(
        default=None, description="Duration in years, null if unknown"
    )
    description: Optional[str] = Field(default=None, description="Role description")
    accomplishments: List[str] = Field(
        default_factory=list,
        description=(
            "Concrete, specific accomplishments from this role. Each must name what was done, "
            "how it was done, and ideally a measurable outcome or scale. "
            "E.g. 'Reduced API latency by 40% by migrating from REST polling to WebSocket streaming for 50k daily users'. "
            "If the profile is vague, capture exactly what is stated without embellishing."
        )
    )
    contribution_type: Optional[Literal["sole_engineer", "tech_lead", "senior_contributor", "team_member", "unclear"]] = Field(
        default=None,
        description=(
            "What was their actual role in this experience? "
            "'sole_engineer' = built it alone; 'tech_lead' = led a team; "
            "'senior_contributor' = senior IC on a team; 'team_member' = one of many contributors; "
            "'unclear' = cannot determine from profile"
        )
    )


class ExtractedEducation(BaseModel):
    degree: str = Field(description="Degree type, e.g. 'Bachelor of Science', 'Master of Engineering', 'PhD', 'Associate', 'High School Diploma'")
    field_of_study: Optional[str] = Field(default=None, description="Major or field, e.g. 'Computer Science', 'Electrical Engineering', 'Data Science'")
    institution: Optional[str] = Field(default=None, description="University, college, or school name")
    graduation_year: Optional[int] = Field(default=None, description="Graduation year (YYYY), null if not stated or currently enrolled")
    gpa: Optional[str] = Field(default=None, description="GPA or grade if stated, e.g. '3.8/4.0', 'First Class Honours', '4.0'")
    honors: Optional[str] = Field(default=None, description="Distinctions, honors, magna cum laude, dean's list, valedictorian, scholarships linked to this degree")
    is_ongoing: bool = Field(default=False, description="True if the person is currently enrolled in this program")


class ExtractedCertification(BaseModel):
    name: str = Field(description="Full certification name, e.g. 'AWS Certified Solutions Architect – Professional', 'Google Cloud Professional Data Engineer'")
    issuer: Optional[str] = Field(default=None, description="Issuing organization, e.g. 'Amazon Web Services', 'Google', 'Microsoft', 'Coursera'")
    date_obtained: Optional[str] = Field(default=None, description="Date obtained if mentioned, e.g. '2022', '2023-05'")
    expiry_date: Optional[str] = Field(default=None, description="Expiry date if mentioned, null if not specified")
    is_active: bool = Field(default=True, description="True if this certification appears current/active")


class ExtractedAchievement(BaseModel):
    title: str = Field(description="Achievement title or name, e.g. 'First Place - HackMIT 2023', 'Dean's List', 'Employee of the Year'")
    type: str = Field(
        description=(
            "Achievement category. Use one of: "
            "award, scholarship, grant, competition, recognition, honor, fellowship, prize, other"
        )
    )
    description: Optional[str] = Field(default=None, description="Brief description of what the achievement was for")
    date: Optional[str] = Field(default=None, description="Year or date if mentioned, e.g. '2023', '2022-03'")
    impact: Optional[str] = Field(default=None, description="Scale or significance, e.g. 'national level', '1st out of 500 teams', '$10,000 grant'")


class ExtractedPublication(BaseModel):
    title: str = Field(description="Full title of the publication, paper, article, or research work")
    type: str = Field(
        description=(
            "Publication type. Use one of: "
            "paper, thesis, dissertation, blog, article, patent, conference_talk, preprint, book_chapter, other"
        )
    )
    venue: Optional[str] = Field(default=None, description="Journal, conference, or platform where published, e.g. 'NeurIPS 2023', 'IEEE Transactions', 'Medium', 'arXiv'")
    year: Optional[int] = Field(default=None, description="Publication year (YYYY)")
    description: Optional[str] = Field(default=None, description="Brief summary of the work and its contribution")
    is_first_author: Optional[bool] = Field(default=None, description="True if they were the primary/first author, null if unknown")


class ExtractedCoursework(BaseModel):
    name: str = Field(description="Course or program name, e.g. 'Machine Learning', 'Distributed Systems', 'CS229', 'Full Stack Web Development Bootcamp'")
    provider: Optional[str] = Field(default=None, description="Institution, platform, or provider, e.g. 'Stanford', 'Coursera', 'fast.ai', 'MIT OpenCourseWare'")
    type: str = Field(
        default="university",
        description=(
            "Course type. Use one of: "
            "university, mooc, bootcamp, workshop, online, certification_course, other"
        )
    )
    year_completed: Optional[int] = Field(default=None, description="Year completed if mentioned")
    relevance_note: Optional[str] = Field(default=None, description="Why this course is notable or how it strengthens the profile")


class ExtractedLanguage(BaseModel):
    name: str = Field(description="Spoken/written language name (NOT programming language), e.g. 'English', 'Spanish', 'Mandarin', 'French'")
    proficiency: str = Field(
        description=(
            "Proficiency level. Use one of: "
            "native, fluent, professional, conversational, basic"
        )
    )


class ExtractedVolunteerWork(BaseModel):
    role: str = Field(description="Volunteer role or title, e.g. 'Open Source Contributor', 'Mentor', 'Tech Lead'")
    organization: Optional[str] = Field(default=None, description="Organization, project, or community name")
    description: Optional[str] = Field(default=None, description="What they did and what impact it had")
    skills_applied: List[str] = Field(default_factory=list, description="Technical or leadership skills demonstrated")
    duration_years: Optional[float] = Field(default=None, description="Duration in years if mentioned")


class ExtractedPreference(BaseModel):
    type: str = Field(
        description=(
            "Preference type. Use one of: "
            "remote_work, company_size, work_style, role_type, location, salary_range"
        )
    )
    value: str = Field(description="Preference value, e.g. 'remote', 'startup', 'async-first'")


class ExtractedPattern(BaseModel):
    pattern: str = Field(
        description=(
            "Problem-solving pattern demonstrated, e.g. "
            "'systems thinker', 'data-driven', 'user-focused', 'performance-oriented'"
        )
    )
    evidence: Optional[str] = Field(
        default=None, description="Brief evidence from the profile"
    )


class CriticalAssessment(BaseModel):
    """
    Brutally honest assessment of the candidate from a recruiter/engineering manager lens.
    This is NOT flattery - it is a calibrated, evidence-based evaluation.
    """
    overall_signal: Literal["strong", "moderate", "weak", "misleading"] = Field(
        description=(
            "Overall signal quality of this profile. "
            "'strong' = concrete evidence, real impact, clearly owned work; "
            "'moderate' = some evidence but gaps or vagueness; "
            "'weak' = mostly vague, no quantified impact, buzzword-heavy; "
            "'misleading' = claims inconsistent with or unsupported by evidence"
        )
    )
    seniority_assessment: Literal["junior", "mid", "senior", "staff_plus", "unclear"] = Field(
        description=(
            "Honest seniority level based on evidence, NOT claimed title. "
            "Assess ownership, scope of impact, and technical depth actually demonstrated."
        )
    )
    depth_vs_breadth: Literal["deep_specialist", "strong_generalist", "shallow_generalist", "unclear"] = Field(
        description=(
            "'deep_specialist' = strong depth in 1-2 areas with production evidence; "
            "'strong_generalist' = solid across multiple areas with real projects; "
            "'shallow_generalist' = many skills listed but none well-evidenced; "
            "'unclear' = cannot determine"
        )
    )
    ownership_signals: List[str] = Field(
        default_factory=list,
        description=(
            "Concrete signals of individual ownership and impact. "
            "E.g. 'Led migration of monolith to microservices serving 2M users', "
            "'Solo-built the entire data pipeline from scratch'. "
            "Only include if clearly stated in the profile."
        )
    )
    red_flags: List[str] = Field(
        default_factory=list,
        description=(
            "Specific concerns a recruiter or EM would have. Be specific and blunt. "
            "E.g. 'Claims 5 years Python but all projects are tutorial-level CRUD apps', "
            "'3 jobs in 18 months with no explanation', "
            "'All project descriptions are vague: no metrics, no ownership clarity', "
            "'Skill list reads like a keyword dump - 15+ technologies with no depth evidence'"
        )
    )
    inflated_skills: List[str] = Field(
        default_factory=list,
        description=(
            "Skills where the claimed level is higher than what the evidence supports. "
            "E.g. 'Kubernetes: claims expert but only mentioned in passing once', "
            "'Machine Learning: listed but all projects are simple sklearn tutorials'"
        )
    )
    genuine_strengths: List[str] = Field(
        default_factory=list,
        description=(
            "Skills or areas where the profile shows genuine, evidenced strength. "
            "Only include things actually backed by concrete project/experience evidence."
        )
    )
    honest_summary: str = Field(
        description=(
            "A 2-3 sentence brutally honest summary of who this person actually is, "
            "written as if you're an engineering manager advising a recruiter off the record. "
            "What can this person actually do? What level are they really at? "
            "What would worry you about hiring them for a senior role?"
        )
    )
    candidate_identity: str = Field(
        default="",
        description=(
            "A precise, honest 1-paragraph profile of WHO this person is professionally. "
            "Cover: their primary technical identity (e.g. 'backend Python engineer'), "
            "the domain/industry they are genuinely experienced in, "
            "their actual seniority level, their working style signals, "
            "and what type of role/team they would thrive or struggle in. "
            "This is the 'in and out' picture of the candidate before any interview."
        )
    )
    five_w_h_summary: dict = Field(
        default_factory=dict,
        description=(
            "5W+H summary of the candidate: "
            "{'who': 'who they are professionally', "
            "'what': 'what they build/do', "
            "'when': 'timeline/career progression', "
            "'where': 'domains/companies/contexts they operate in', "
            "'why': 'what drives them / what problems they solve', "
            "'how': 'their technical approach and working style'}"
        )
    )
    interview_focus_areas: List[str] = Field(
        default_factory=list,
        description=(
            "The 2-3 most important areas to probe in a technical interview to validate "
            "or disprove what is claimed. E.g. 'Probe actual Kubernetes production experience - "
            "ask what they specifically configured and what broke', "
            "'Ask for the exact architecture of the payment system - the description is vague'"
        )
    )


class InterpretationFlag(BaseModel):
    """
    A single uncertain interpretation made by the LLM during extraction.
    Each flag = one clarification question to ask the user before finalising the graph.
    The graph node/edge it refers to is identified by `field` in the format Type:name:property.
    """
    field: str = Field(
        description=(
            "Dot-path to the interpreted field. Format: 'Type:Name:property'. "
            "Examples: 'Skill:Python:level', 'Project:PaymentAPI:contribution_type', "
            "'Experience:Senior Engineer at Stripe:accomplishments', 'Domain:FinTech:depth'"
        )
    )
    raw_text: str = Field(
        description="The exact text snippet from the resume that led to this interpretation. Quote it directly."
    )
    interpreted_as: str = Field(
        description="What the LLM decided this means. Be specific: e.g. 'level=advanced, years=3'"
    )
    confidence: Literal["high", "medium", "low"] = Field(
        description=(
            "'high' = clearly stated; 'medium' = inferred from context; "
            "'low' = assumed/guessed with minimal evidence"
        )
    )
    ambiguity_reason: str = Field(
        description=(
            "Why is this uncertain? E.g. 'Years not stated - inferred from job timeline', "
            "'Contribution unclear - resume uses we/our throughout', "
            "'Level inferred from seniority of role, not from technical depth described'"
        )
    )
    clarification_question: str = Field(
        description=(
            "The exact natural-language question to show the user to resolve this. "
            "Be specific and reference their actual resume content. "
            "E.g. 'Your resume says \"built a payment API\" - were you the sole engineer on this, "
            "or part of a larger team? What was your specific contribution?'"
        )
    )
    resolution_impact: Literal["critical", "important", "minor"] = Field(
        description=(
            "'critical' = directly affects job matching (skill level, years, domain depth); "
            "'important' = affects context quality (contribution type, project scale); "
            "'minor' = enrichment only (preferences, patterns)"
        )
    )
    suggested_options: Optional[List[str]] = Field(
        default=None,
        description="If this is a multiple-choice clarification, provide the options. Leave null for open-ended."
    )


class UserProfileExtraction(BaseModel):
    """Top-level schema for Gemini user profile extraction. Passed as response_schema."""
    skills: List[ExtractedSkill] = Field(default_factory=list)
    projects: List[ExtractedProject] = Field(default_factory=list)
    domains: List[ExtractedDomain] = Field(default_factory=list)
    experiences: List[ExtractedExperience] = Field(default_factory=list)
    education: List[ExtractedEducation] = Field(
        default_factory=list,
        description="All education entries: degrees, diplomas, ongoing programs. Extract EVERY educational qualification mentioned."
    )
    certifications: List[ExtractedCertification] = Field(
        default_factory=list,
        description="All professional certifications, licenses, and credentials. Extract EVERY cert mentioned."
    )
    achievements: List[ExtractedAchievement] = Field(
        default_factory=list,
        description="Awards, prizes, scholarships, grants, competitions, honors, recognitions, fellowships."
    )
    publications: List[ExtractedPublication] = Field(
        default_factory=list,
        description="Research papers, theses, dissertations, blogs, articles, patents, conference talks, book chapters."
    )
    coursework: List[ExtractedCoursework] = Field(
        default_factory=list,
        description="Notable courses, MOOCs, bootcamps, workshops - especially those that strengthen technical skills."
    )
    languages: List[ExtractedLanguage] = Field(
        default_factory=list,
        description="Spoken/written languages (NOT programming languages). Extract every human language mentioned."
    )
    volunteer_work: List[ExtractedVolunteerWork] = Field(
        default_factory=list,
        description="Open source contributions, mentoring, nonprofit work, community involvement."
    )
    preferences: List[ExtractedPreference] = Field(default_factory=list)
    patterns: List[ExtractedPattern] = Field(default_factory=list)
    assessment: Optional[CriticalAssessment] = Field(
        default=None,
        description="Critical recruiter/EM lens assessment of the entire profile"
    )
    interpretation_flags: List[InterpretationFlag] = Field(
        default_factory=list,
        description=(
            "All uncertain interpretations made during extraction that require user clarification. "
            "Generate a flag for EVERY field where confidence is medium or low, "
            "and for any inference that materially affects matching (skill levels, years, contribution types). "
            "Order by resolution_impact DESC (critical first)."
        )
    )


class ExtractedJobSkillRequirement(BaseModel):
    name: str = Field(description="Skill name")
    family: str = Field(
        description=(
            "Skill family. Must be one of: "
            "Programming Languages, Web Frameworks, Databases, Cloud & DevOps, "
            "ML & AI, Data Engineering, Mobile Development, Testing & QA, "
            "Analytics & Visualization, Other"
        )
    )
    required: bool = Field(default=True, description="True if required, False if nice-to-have")
    importance: Literal["must_have", "optional"] = Field(
        default="must_have",
        description="must_have for required/mandatory skills, optional for nice-to-have/bonus skills"
    )
    min_years: Optional[int] = Field(
        default=None, description="Minimum years required, null if not specified"
    )


class ExtractedJobDomainRequirement(BaseModel):
    name: str = Field(description="Domain area required, e.g. 'Payment Systems'")
    family: str = Field(
        description=(
            "Domain family. Must be one of: "
            "FinTech, Healthcare, E-commerce, SaaS, Enterprise, Gaming, Education, Other"
        )
    )
    min_years: Optional[int] = Field(default=None)


class ExtractedWorkStyle(BaseModel):
    style: str = Field(
        description=(
            "Work style or culture indicator, e.g. "
            "'async-first', 'fast-paced', 'high-autonomy', 'collaborative', 'remote-first'"
        )
    )


class ExtractedEducationRequirement(BaseModel):
    degree_level: str = Field(
        description="Required degree level: 'phd', 'master', 'bachelor', 'associate', 'any'"
    )
    field: Optional[str] = Field(
        default=None,
        description="Field of study, e.g. 'Computer Science', 'Engineering', 'Mathematics'"
    )
    is_required: bool = Field(
        default=True,
        description="True if this is a hard requirement; False if preferred/nice-to-have"
    )
    alternatives: List[str] = Field(
        default_factory=list,
        description="Alternative qualifications that substitute for this degree, e.g. ['equivalent experience', 'bootcamp']"
    )
    description: Optional[str] = Field(
        default=None,
        description="Free-text note about the education requirement"
    )


class ExtractedPreferredQualification(BaseModel):
    type: str = Field(
        description="Type: 'certification', 'course', 'domain_exp', 'soft_skill', 'tool', 'other'"
    )
    value: str = Field(
        description="Specific qualification, e.g. 'AWS Certified Solutions Architect', 'Kafka experience'"
    )
    description: Optional[str] = Field(
        default=None,
        description="Why this qualification is valued or what problem it addresses"
    )
    importance: str = Field(
        default="nice_to_have",
        description="How important: 'nice_to_have', 'preferred', 'strongly_preferred'"
    )


class ExtractedCompanyProfile(BaseModel):
    mission: Optional[str] = Field(
        default=None,
        description="Company mission statement or core purpose"
    )
    vision: Optional[str] = Field(
        default=None,
        description="Company vision or long-term goal"
    )
    values: List[str] = Field(
        default_factory=list,
        description="Core company values, e.g. ['transparency', 'ownership', 'user-first']"
    )
    stage: Optional[str] = Field(
        default=None,
        description="Company stage: 'startup', 'growth', 'enterprise', 'nonprofit'"
    )
    product_description: Optional[str] = Field(
        default=None,
        description="What the company builds and who it serves"
    )
    industry: Optional[str] = Field(
        default=None,
        description="Industry vertical, e.g. 'FinTech', 'Healthcare', 'SaaS', 'E-commerce'"
    )
    notable_tech: List[str] = Field(
        default_factory=list,
        description="Notable technologies the company is known for or invests in"
    )


class ExtractedHiringTeam(BaseModel):
    name: Optional[str] = Field(
        default=None,
        description="Team or department name, e.g. 'Platform Engineering', 'ML Infrastructure'"
    )
    description: Optional[str] = Field(
        default=None,
        description="What the team does day-to-day"
    )
    product_built: Optional[str] = Field(
        default=None,
        description="The specific product, service, or system the team owns"
    )
    team_size_est: Optional[str] = Field(
        default=None,
        description="Estimated team size, e.g. '5-10', '~20', 'small'"
    )
    tech_focus: List[str] = Field(
        default_factory=list,
        description="Primary technologies or domains the team focuses on"
    )
    reports_to: Optional[str] = Field(
        default=None,
        description="Who this role reports to, e.g. 'VP of Engineering', 'Tech Lead'"
    )
    team_type: Optional[str] = Field(
        default=None,
        description="Team type: 'product', 'platform', 'infra', 'ml', 'data', 'design', 'other'"
    )


class ExtractedCompensationPackage(BaseModel):
    salary_min: Optional[int] = Field(
        default=None,
        description="Minimum annual salary in the stated currency (integer, no symbols)"
    )
    salary_max: Optional[int] = Field(
        default=None,
        description="Maximum annual salary in the stated currency (integer, no symbols)"
    )
    currency: str = Field(
        default="USD",
        description="Currency code, e.g. 'USD', 'EUR', 'GBP', 'INR'"
    )
    equity: Optional[str] = Field(
        default=None,
        description="Equity details, e.g. '0.1-0.5% options', 'RSUs', 'ESOP'"
    )
    benefits: List[str] = Field(
        default_factory=list,
        description="Benefits offered, e.g. ['health insurance', '401k', 'remote stipend', 'unlimited PTO']"
    )
    bonus_structure: Optional[str] = Field(
        default=None,
        description="Bonus structure details, e.g. 'annual 10% target', 'performance-based'"
    )
    is_disclosed: bool = Field(
        default=False,
        description="True if salary information was explicitly stated in the posting"
    )


class ExtractedRoleExpectation(BaseModel):
    key_responsibilities: List[str] = Field(
        default_factory=list,
        description="Primary responsibilities of the role, each as a concise action statement"
    )
    success_metrics: List[str] = Field(
        default_factory=list,
        description="How success in this role is measured, e.g. 'reduce P95 latency by 30%'"
    )
    first_30_days: Optional[str] = Field(
        default=None,
        description="What the candidate is expected to accomplish in the first 30 days"
    )
    first_90_days: Optional[str] = Field(
        default=None,
        description="What the candidate is expected to accomplish in the first 90 days"
    )
    autonomy_level: str = Field(
        default="moderate",
        description="Degree of autonomy: 'low' (highly directed), 'moderate', 'high' (self-directed)"
    )


class ExtractedJobSoftRequirement(BaseModel):
    trait: str = Field(
        description="Soft skill or personality trait, e.g. 'ownership', 'communication', 'empathy'"
    )
    description: Optional[str] = Field(
        default=None,
        description="Context on why this trait matters for the role"
    )
    is_dealbreaker: bool = Field(
        default=False,
        description="True if the absence of this trait is a dealbreaker"
    )


class JobPostingExtraction(BaseModel):
    """Top-level schema for LLM job posting extraction."""
    title: str = Field(description="Job title")
    company: Optional[str] = Field(default=None, description="Company name")
    skill_requirements: List[ExtractedJobSkillRequirement] = Field(default_factory=list)
    domain_requirements: List[ExtractedJobDomainRequirement] = Field(default_factory=list)
    work_styles: List[ExtractedWorkStyle] = Field(default_factory=list)
    remote_policy: Optional[str] = Field(
        default=None,
        description="Remote policy: 'remote', 'hybrid', 'onsite'"
    )
    company_size: Optional[str] = Field(
        default=None,
        description="Company size: 'startup', 'mid-size', 'enterprise'"
    )
    experience_years_min: Optional[int] = Field(
        default=None, description="Minimum years of experience required"
    )
    # Deep profile sections
    education_requirements: List[ExtractedEducationRequirement] = Field(
        default_factory=list,
        description="Formal education requirements (degree, field, required vs. preferred)"
    )
    preferred_qualifications: List[ExtractedPreferredQualification] = Field(
        default_factory=list,
        description="Nice-to-have or preferred qualifications beyond core skill requirements"
    )
    company_profile: Optional[ExtractedCompanyProfile] = Field(
        default=None,
        description="Company mission, values, stage, product and industry context"
    )
    hiring_team: Optional[ExtractedHiringTeam] = Field(
        default=None,
        description="The team hiring for this role: name, what they build, tech focus, size"
    )
    compensation: Optional[ExtractedCompensationPackage] = Field(
        default=None,
        description="Compensation details: salary range, equity, benefits"
    )
    role_expectations: Optional[ExtractedRoleExpectation] = Field(
        default=None,
        description="Role expectations: responsibilities, success metrics, 30/90-day goals"
    )
    soft_requirements: List[ExtractedJobSoftRequirement] = Field(
        default_factory=list,
        description="Soft skills, personality traits, and cultural fit requirements"
    )


# ──────────────────────────────────────────────────────────────────────────────
# FASTAPI REQUEST / RESPONSE SCHEMAS
# ──────────────────────────────────────────────────────────────────────────────

class IngestUserRequest(BaseModel):
    user_id: str = Field(description="Unique identifier for the user")
    profile_text: str = Field(
        description="Raw resume or profile text to process through the hybrid pipeline"
    )


class IngestJobRequest(BaseModel):
    job_id: str = Field(description="Unique identifier for the job posting")
    job_text: str = Field(
        description="Raw job posting text to process through the hybrid pipeline"
    )
    recruiter_id: Optional[str] = Field(default=None, description="ID of the recruiter who posted this job")


class MatchedSkill(BaseModel):
    skill: str
    user_years: Optional[float]
    user_level: Optional[str]
    required_years: Optional[int]
    importance: str
    contribution: float


class MatchResult(BaseModel):
    job_id: str
    job_title: str
    company: Optional[str]
    # Core score (0-1): dynamically weighted across available dimensions
    total_score: float
    # Individual dimension scores (0-1 each)
    skill_score: float              # mandatory (must_have) skills score, evidence-weighted
    optional_skill_score: float = 0.0  # optional skills score (nice-to-have)
    domain_score: float             # depth-weighted: shallow=0.4x, moderate=0.7x, deep=1.0x
    soft_skill_score: float = 0.0   # 0 when job has no SoftSkillRequirements or user has no patterns
    culture_fit_score: float = 0.0  # 0 when either side lacks digital twin culture data
    # Legacy bonus signals (kept for backwards compat, not in total_score)
    culture_bonus: float        # work-style preference match ratio (old lightweight version)
    preference_bonus: float     # remote/company_size match ratio
    # Match detail
    matched_skills: List[str]
    missing_skills: List[str]
    matched_domains: List[str]
    missing_domains: List[str]
    behavioral_risk_flags: List[str] = Field(
        default_factory=list,
        description="Risk signals from BehavioralInsight nodes that conflict with dealbreaker soft skills"
    )
    explanation: str
    # Analytics / hybrid signals
    job_tags: List[str] = Field(
        default_factory=list,
        description="Semantic tags extracted from the job posting (remote-first, high-paying, etc.)"
    )
    interest_score: float = Field(
        default=0.5,
        description="User interest score for this job based on behavioral analytics (0=disinterested, 1=high interest)"
    )
    interest_tags_matched: List[str] = Field(
        default_factory=list,
        description="Job tags that match the user's interest profile"
    )
    hybrid_score: float = Field(
        default=0.0,
        description="Final hybrid score: alpha*graph_score + beta*interest_score"
    )
    # Deep job profile bonus signals
    education_fit_score: float = Field(
        default=0.0,
        description="Education fit bonus (0-1): how well user education meets job requirements"
    )
    preferred_qual_bonus: float = Field(
        default=0.0,
        description="Preferred qualification bonus (0-1): how many nice-to-have qualifications user holds"
    )
    met_education_reqs: List[str] = Field(
        default_factory=list,
        description="Education requirements the user meets"
    )
    gap_education_reqs: List[str] = Field(
        default_factory=list,
        description="Required education requirements the user does not meet"
    )


class JobProfileResponse(BaseModel):
    """Full enriched job profile returned by GET /jobs/{job_id}/profile."""
    job_id: str
    title: Optional[str] = None
    company: Optional[str] = None
    remote_policy: Optional[str] = None
    company_size: Optional[str] = None
    experience_years_min: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    key_skills: List[str] = Field(default_factory=list)
    domains: List[str] = Field(default_factory=list)
    description_preview: Optional[str] = None
    # Deep profile
    education_requirements: List[dict] = Field(default_factory=list)
    preferred_qualifications: List[dict] = Field(default_factory=list)
    company_profile: Optional[dict] = None
    hiring_team: Optional[dict] = None
    compensation: Optional[dict] = None
    role_expectations: Optional[dict] = None
    soft_requirements: List[dict] = Field(default_factory=list)


class BatchMatchResponse(BaseModel):
    user_id: str
    results: List[MatchResult]
    total_jobs_ranked: int


class CandidateResult(BaseModel):
    """Reverse-match result: one user scored against a specific job."""
    user_id: str
    total_score: float
    skill_score: float
    optional_skill_score: float = 0.0
    domain_score: float
    soft_skill_score: float = 0.0
    culture_fit_score: float = 0.0
    culture_bonus: float
    preference_bonus: float
    matched_skills: List[str]
    missing_skills: List[str]
    matched_domains: List[str]
    missing_domains: List[str]
    behavioral_risk_flags: List[str] = Field(default_factory=list)
    explanation: str


class BatchCandidateResponse(BaseModel):
    job_id: str
    results: List[CandidateResult]
    total_users_ranked: int


class IngestionStats(BaseModel):
    entity_id: str
    entity_type: Literal["user", "job"]
    skills_extracted: int = 0
    domains_extracted: int = 0
    projects_extracted: int = 0
    experiences_extracted: int = 0


# ──────────────────────────────────────────────────────────────────────────────
# ANALYTICS SCHEMAS
# ──────────────────────────────────────────────────────────────────────────────

class RecordEventRequest(BaseModel):
    job_id: str = Field(description="Job the event is associated with")
    event_type: str = Field(
        description=(
            "One of: job_applied, job_liked, job_bookmarked, job_clicked, "
            "job_viewed, job_disliked, job_dismissed"
        )
    )
    duration_ms: Optional[int] = Field(
        default=None,
        description="Duration the job was visible/viewed in milliseconds (for job_viewed events)"
    )


class InterestTag(BaseModel):
    tag: str
    category: Optional[str] = None
    score: float = Field(description="Normalised interest score 0.0–1.0")
    interaction_count: int = Field(default=0)
    confidence: Literal["low", "medium", "high"] = "low"
    last_updated: Optional[str] = None


class InterestProfileResponse(BaseModel):
    user_id: str
    tags: List[InterestTag]
    total_interactions: int


class AdjustInterestRequest(BaseModel):
    score: float = Field(
        ge=0.0, le=1.0,
        description="Manually override the interest score for this tag (0.0 = disinterested, 1.0 = highly interested)"
    )


class UserApplication(BaseModel):
    job_id: str
    job_title: str
    company: Optional[str] = None
    applied_at: str  # ISO-8601 UTC
    match_score: Optional[float] = None


class UserApplicationsResponse(BaseModel):
    user_id: str
    applications: List[UserApplication]
    total: int


class AppliedCandidate(BaseModel):
    user_id: str
    applied_at: str
    total_score: Optional[float] = None
    skill_score: Optional[float] = None
    domain_score: Optional[float] = None
    optional_skill_score: float = 0.0
    soft_skill_score: float = 0.0
    culture_fit_score: float = 0.0
    culture_bonus: float = 0.0
    preference_bonus: float = 0.0
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    matched_domains: List[str] = Field(default_factory=list)
    missing_domains: List[str] = Field(default_factory=list)
    behavioral_risk_flags: List[str] = Field(default_factory=list)
    explanation: str = ""


class JobApplicantsResponse(BaseModel):
    job_id: str
    applicants: List[AppliedCandidate]
    total: int


# ──────────────────────────────────────────────────────────────────────────────
# EDIT SESSION SCHEMAS
# ──────────────────────────────────────────────────────────────────────────────

class GraphMutation(BaseModel):
    """Structured set of graph mutations proposed by the LLM."""
    add_nodes: List[dict] = Field(default_factory=list)
    update_nodes: List[dict] = Field(default_factory=list)
    remove_nodes: List[str] = Field(default_factory=list, description="Node names to remove (e.g. 'GraphQL' or 'Skill:GraphQL')")
    add_edges: List[dict] = Field(
        default_factory=list,
        description=(
            "Each dict: {from: 'Type:name', rel: 'REL_TYPE', to: 'Type:name', context: '...'}. "
            "For DEMONSTRATES_SKILL edges, always include a 'context' field describing HOW the skill "
            "was used in that project (approach, tools, outcome)."
        )
    )


class GraphImpactItem(BaseModel):
    """A single node/edge change surfaced in the scrutability banner."""
    icon: Literal[
        "skill", "anecdote", "motivation", "value", "goal",
        "culture", "behavior", "domain", "project", "experience"
    ]
    label: str = Field(description="Human-readable name of the thing being changed, e.g. 'Kubernetes'")
    change_type: str = Field(description="Type of graph change: add|update|infer|flag|initiated")
    detail: str = Field(description="One-sentence explanation of what changed and why it matters to the profile")

    @field_validator("change_type", mode="before")
    @classmethod
    def coerce_change_type(cls, v: str) -> str:
        _VALID = {"add", "update", "infer", "flag", "initiated"}
        return v if v in _VALID else "update"


class GraphImpactBanner(BaseModel):
    """
    Scrutability banner shown to the user after each conversation turn.
    Tells them exactly how their answer is shaping their digital twin in the graph.
    """
    headline: str = Field(description="1-sentence summary, e.g. 'Your answer updated 3 nodes in your digital twin'")
    items: List[GraphImpactItem] = Field(default_factory=list)
    digital_twin_progress: Optional[str] = Field(
        default=None,
        description="Optional progress hint, e.g. 'Technical depth: 72% | Human depth: 31%'"
    )


class GraphMutationProposal(BaseModel):
    """LLM response: reasoning, proposed mutations, next interview question, and scrutability banner."""
    reasoning: str = Field(description="LLM's reasoning visible to the user")
    mutations: GraphMutation
    follow_up_question: str = Field(description="Next interview question to ask")
    graph_impact_banner: Optional[GraphImpactBanner] = Field(
        default=None,
        description="Scrutability banner showing what this conversation turn updates in the graph"
    )


class EditSessionMessage(BaseModel):
    role: str = Field(description="'user' | 'assistant' | 'system'")
    content: str
    proposal: Optional[GraphMutationProposal] = None


class EditSessionResponse(BaseModel):
    session_id: str
    opening_question: str
    graph_summary: dict
    interview_banner: str = Field(
        default=(
            "Everything you share in this conversation shapes your digital twin. "
            "Recruiters won't just see your skills - they'll see your stories, your motivations, "
            "and how you think. The more genuine your answers, the more accurately this profile "
            "will represent who you truly are. Every answer you give can update your graph in real time."
        ),
        description="Scrutability notice shown prominently when the session starts"
    )


class StartEditRequest(BaseModel):
    recruiter_id: Optional[str] = Field(default=None, description="Required for job edit sessions")


class SendMessageRequest(BaseModel):
    session_id: str
    message: str


class ApplyMutationsRequest(BaseModel):
    session_id: str
    mutations: GraphMutation


class RejectMutationsRequest(BaseModel):
    session_id: str


class ApplyMutationsResponse(BaseModel):
    auto_checkpoint_version_id: str
    nodes_added: int
    nodes_updated: int
    nodes_removed: int
    edges_added: int


class GraphVersion(BaseModel):
    version_id: str
    entity_type: str   # 'user' | 'job'
    entity_id: str
    session_id: Optional[str] = None
    label: str
    created_at: str


class CheckpointRequest(BaseModel):
    label: Optional[str] = Field(default=None, description="Human-readable label for this checkpoint")


class RollbackResponse(BaseModel):
    version_id: str
    entity_type: str
    entity_id: str
    status: str = "restored"


# ──────────────────────────────────────────────────────────────────────────────
# CLARIFICATION / DIGITAL TWIN VERIFICATION SCHEMAS
# ──────────────────────────────────────────────────────────────────────────────

class ClarificationQuestion(BaseModel):
    """A single pending clarification question shown to the user."""
    flag_id: str
    field: str                        # e.g. "Skill:Python:level"
    raw_text: str                     # the resume snippet that caused the ambiguity
    interpreted_as: str               # what the LLM assumed
    confidence: str                   # high / medium / low
    ambiguity_reason: str
    clarification_question: str       # question to show the user
    resolution_impact: str            # critical / important / minor
    suggested_options: Optional[List[str]] = None
    status: str = "pending"           # pending / confirmed / corrected / skipped


class ClarificationsResponse(BaseModel):
    user_id: str
    total_flags: int
    pending: int
    resolved: int
    questions: List[ClarificationQuestion]
    graph_verified: bool              # True once all critical flags are resolved


class ResolveFlagRequest(BaseModel):
    is_correct: bool = Field(
        description="True if the LLM's interpretation was correct. False if the user is correcting it."
    )
    user_answer: str = Field(
        description="The user's answer in their own words."
    )
    correction: Optional[str] = Field(
        default=None,
        description=(
            "If is_correct=False, provide the correct value. "
            "For multiple-choice fields use the exact option. "
            "For text fields write the corrected value."
        )
    )


class ResolveFlagResponse(BaseModel):
    flag_id: str
    status: str                        # confirmed / corrected
    graph_updated: bool
    updated_field: Optional[str] = None
    updated_value: Optional[str] = None
    remaining_critical: int            # how many critical flags still pending


# ──────────────────────────────────────────────────────────────────────────────
# DIGITAL TWIN COMPLETENESS
# ──────────────────────────────────────────────────────────────────────────────

class TechnicalDepthBreakdown(BaseModel):
    score_pct: int                          # 0-100
    skills_total: int
    skills_evidenced: int                   # evidence_strength != claimed_only
    skills_with_anecdotes: int              # GROUNDED_IN → Anecdote edges
    skills_claimed_only: int                # full weight penalty in matching
    projects_total: int
    projects_with_impact: int               # has_measurable_impact = true
    experiences_total: int
    experiences_with_accomplishments: int   # non-empty accomplishments list
    has_critical_assessment: bool


class HumanDepthBreakdown(BaseModel):
    score_pct: int                          # 0-100
    anecdotes_count: int                    # total Anecdote nodes
    anecdotes_target: int = 5              # how many we consider "complete"
    motivations_identified: bool            # has >= 1 Motivation node
    values_identified: bool                 # has >= 1 Value node
    goal_set: bool                          # has >= 1 Goal node
    culture_identity_built: bool            # has CultureIdentity node
    behavioral_insights_count: int          # total BehavioralInsight nodes
    # Culture fit scoring is disabled if this is False - surfaced to user
    culture_matching_enabled: bool


class DigitalTwinCompleteness(BaseModel):
    """
    Computed (not LLM-generated) profile completeness score.
    Shows how fully the digital twin represents the person across both
    technical depth and human depth dimensions.

    Both dimensions must be strong for full matching power:
      - Technical depth affects skill/domain scoring accuracy
      - Human depth enables soft skill and culture fit scoring
    """
    overall_pct: int                        # weighted average of both dimensions
    technical_depth: TechnicalDepthBreakdown
    human_depth: HumanDepthBreakdown

    # Matching capability flags - shown to user so they understand impact
    evidence_weighted_scoring_active: bool  # True when skills have evidence beyond claimed_only
    soft_skill_scoring_active: bool         # True when ProblemSolvingPattern nodes exist
    culture_fit_scoring_active: bool        # True when CultureIdentity node exists
    profile_verified: bool                  # True when all critical clarification flags resolved

    # Actionable gaps - specific, honest, with matching impact
    missing_dimensions: List[str]
    # The single most impactful next action
    next_action: str
