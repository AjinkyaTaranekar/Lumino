/**
 * Application-wide TypeScript types
 */

export type UserRole = 'USER' | 'RECRUITER' | 'ADMIN';

/** Legacy role format used in API calls & session storage */
export type LegacyRole = 'seeker' | 'recruiter' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/** Backward-compat session stored in localStorage */
export interface LegacySession {
  userId: string;
  role: LegacyRole;
}

// ─── API Request / Response Types ────────────────────────────────────────────

export interface IngestUserRequest {
  user_id: string;
  profile_text: string;
}

export interface IngestJobRequest {
  job_id: string;
  job_text: string;
  recruiter_id?: string | null;
}

export interface MatchResult {
  job_id: string;
  job_title: string;
  company: string | null;
  total_score: number;
  skill_score: number;
  optional_skill_score?: number;
  domain_score: number;
  soft_skill_score?: number;
  culture_fit_score?: number;
  culture_bonus: number;
  preference_bonus: number;
  matched_skills: string[];
  missing_skills: string[];
  matched_domains: string[];
  missing_domains: string[];
  behavioral_risk_flags?: string[];
  explanation: string;
  // Analytics / hybrid signals
  job_tags?: string[];
  interest_score?: number;
  interest_tags_matched?: string[];
  hybrid_score?: number;
  // Deep job profile bonuses
  education_fit_score?: number;
  preferred_qual_bonus?: number;
  met_education_reqs?: string[];
  gap_education_reqs?: string[];
}

// ─── Analytics Types ──────────────────────────────────────────────────────────

export type AnalyticsEventType =
  | 'job_applied'
  | 'job_liked'
  | 'job_bookmarked'
  | 'job_clicked'
  | 'job_viewed'
  | 'job_disliked'
  | 'job_dismissed';

export interface RecordEventRequest {
  job_id: string;
  event_type: AnalyticsEventType;
  duration_ms?: number;
}

export interface InterestTag {
  tag: string;
  category?: string;
  score: number;
  interaction_count: number;
  confidence: 'low' | 'medium' | 'high';
  last_updated?: string;
}

export interface InterestProfileResponse {
  user_id: string;
  tags: InterestTag[];
  total_interactions: number;
}

export interface BatchMatchResponse {
  user_id: string;
  results: MatchResult[];
  total_jobs_ranked: number;
}

export interface CandidateResult {
  user_id: string;
  total_score: number;
  skill_score: number;
  optional_skill_score?: number;
  domain_score: number;
  soft_skill_score?: number;
  culture_fit_score?: number;
  culture_bonus: number;
  preference_bonus: number;
  matched_skills: string[];
  missing_skills: string[];
  matched_domains: string[];
  missing_domains: string[];
  behavioral_risk_flags?: string[];
  explanation: string;
}

export interface BatchCandidateResponse {
  job_id: string;
  results: CandidateResult[];
  total_users_ranked: number;
}

export interface ClarificationQuestion {
  flag_id: string;
  field: string;
  raw_text: string;
  interpreted_as: string;
  confidence: string;
  ambiguity_reason: string;
  clarification_question: string;
  resolution_impact: string;
  suggested_options?: string[] | null;
  status?: string;
}

export interface ClarificationsResponse {
  user_id: string;
  total_flags: number;
  pending: number;
  resolved: number;
  questions: ClarificationQuestion[];
  graph_verified: boolean;
}

export interface GraphMutation {
  add_nodes?: unknown[];
  update_nodes?: unknown[];
  remove_nodes?: string[];
  add_edges?: unknown[];
}

export interface GraphImpactItem {
  icon: 'skill' | 'anecdote' | 'motivation' | 'value' | 'goal' | 'culture' | 'behavior' | 'domain' | 'project' | 'experience';
  label: string;
  change_type: string;
  detail: string;
}

export interface GraphImpactBanner {
  headline: string;
  items: GraphImpactItem[];
  digital_twin_progress?: string | null;
}

export interface GraphMutationProposal {
  reasoning: string;
  mutations: GraphMutation;
  follow_up_question: string;
  graph_impact_banner?: GraphImpactBanner | null;
}

export interface EditSessionResponse {
  session_id: string;
  opening_question: string;
  graph_summary: unknown;
  interview_banner?: string;
}

export interface EditSessionMessage {
  role: string;
  content: string;
  proposal?: GraphMutationProposal | null;
}

export interface GraphVersion {
  version_id: string;
  entity_type: string;
  entity_id: string;
  session_id?: string | null;
  label: string;
  created_at: string;
}

export interface RollbackResponse {
  version_id: string;
  entity_type: string;
  entity_id: string;
  status?: string;
}

export interface ResolveFlagRequest {
  is_correct: boolean;
  user_answer: string;
  correction?: string | null;
}

export interface ResolveFlagResponse {
  flag_id: string;
  status: string;
  graph_updated: boolean;
  updated_field?: string | null;
  updated_value?: string | null;
  remaining_critical: number;
}

export interface Job {
  id: string;
  title?: string;
  company?: string;
  remote_policy?: 'remote' | 'hybrid' | 'onsite';
  company_size?: string;
  experience_years_min?: number;
  tags?: string[];
  key_skills?: string[];
  domains?: string[];
  description_preview?: string | null;
}

export interface UserListItem {
  id: string;
}

export interface IngestUserResponse {
  skills_extracted: number;
  domains_extracted: number;
  projects_extracted: number;
  experiences_extracted: number;
  education_extracted?: number;
  certifications_extracted?: number;
  achievements_extracted?: number;
  publications_extracted?: number;
  coursework_extracted?: number;
  languages_extracted?: number;
  volunteer_work_extracted?: number;
  interpretation_flags: number;
  clarification_questions?: Array<{ flag_id: string; question: string }>;
}

export interface IngestJobResponse {
  skill_requirements_extracted: number;
  domain_requirements_extracted: number;
  work_styles_extracted: number;
}

export interface AdminStatsResponse {
  graph_nodes: number;
  api_latency: string;
  active_sessions: number;
  system_health: string;
}

export interface ExtractedEducationItem {
  degree: string;
  field_of_study?: string | null;
  institution?: string | null;
  graduation_year?: number | null;
  gpa?: string | null;
  honors?: string | null;
  is_ongoing?: boolean;
}

export interface ExtractedCertificationItem {
  name: string;
  issuer?: string | null;
  date_obtained?: string | null;
  expiry_date?: string | null;
  is_active?: boolean;
}

export interface ExtractedAchievementItem {
  title: string;
  type: string;
  description?: string | null;
  date?: string | null;
  impact?: string | null;
}

export interface ExtractedPublicationItem {
  title: string;
  type: string;
  venue?: string | null;
  year?: number | null;
  description?: string | null;
  is_first_author?: boolean | null;
}

export interface ExtractedCourseworkItem {
  name: string;
  provider?: string | null;
  type: string;
  year_completed?: number | null;
  relevance_note?: string | null;
}

export interface ExtractedLanguageItem {
  name: string;
  proficiency: string;
}

export interface ExtractedVolunteerItem {
  role: string;
  organization?: string | null;
  description?: string | null;
  duration_years?: number | null;
}

export interface UserDescribeResponse {
  identity?: string;
  career_arc?: string;
  who_they_are?: string;
  technical_profile?: string;
  domain_expertise?: string;
  core_strengths?: string[];
  gaps_and_concerns?: string[];
  honest_assessment?: string;
  best_suited_for?: string;
  interview_ready_summary?: string;
  // Structured data from the graph
  education?: ExtractedEducationItem[];
  certifications?: ExtractedCertificationItem[];
  achievements?: ExtractedAchievementItem[];
  publications?: ExtractedPublicationItem[];
  coursework?: ExtractedCourseworkItem[];
  languages?: ExtractedLanguageItem[];
  volunteer_work?: ExtractedVolunteerItem[];
}

export interface MatchExplanation {
  verdict?: string;
  headline?: string;
  why_they_fit?: string[];
  critical_gaps?: string[];
  nice_to_have_gaps?: string[];
  seniority_fit?: string;
  honest_take?: string;
  recommendation?: string;
  interview_focus?: string[];
}

// ─── Deep Job Profile ─────────────────────────────────────────────────────────

export interface JobEducationRequirement {
  degree_level: string;
  field?: string | null;
  is_required: boolean;
  alternatives?: string[];
  description?: string | null;
}

export interface JobPreferredQualification {
  type: string;
  value: string;
  description?: string | null;
  importance: 'nice_to_have' | 'preferred' | 'strongly_preferred';
}

export interface JobCompanyProfile {
  mission?: string | null;
  vision?: string | null;
  values?: string[];
  stage?: string | null;
  product_description?: string | null;
  industry?: string | null;
  notable_tech?: string[];
}

export interface JobHiringTeam {
  name?: string | null;
  description?: string | null;
  product_built?: string | null;
  team_size_est?: string | null;
  tech_focus?: string[];
  reports_to?: string | null;
  team_type?: string | null;
}

export interface JobCompensation {
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string;
  equity?: string | null;
  benefits?: string[];
  bonus_structure?: string | null;
  is_disclosed?: boolean;
}

export interface JobRoleExpectation {
  key_responsibilities?: string[];
  success_metrics?: string[];
  first_30_days?: string | null;
  first_90_days?: string | null;
  autonomy_level?: 'low' | 'moderate' | 'high';
}

export interface JobSoftRequirement {
  trait: string;
  description?: string | null;
  is_dealbreaker: boolean;
}

export interface RichJobProfile {
  job_id: string;
  title?: string | null;
  company?: string | null;
  remote_policy?: string | null;
  company_size?: string | null;
  experience_years_min?: number | null;
  tags?: string[];
  description_preview?: string | null;
  skill_requirements?: Array<{ name: string; importance: string; min_years?: number | null }>;
  domain_requirements?: Array<{ name: string; min_years?: number | null }>;
  education_requirements?: JobEducationRequirement[];
  preferred_qualifications?: JobPreferredQualification[];
  company_profile?: JobCompanyProfile | null;
  hiring_team?: JobHiringTeam | null;
  compensation?: JobCompensation | null;
  role_expectations?: JobRoleExpectation | null;
  soft_requirements?: JobSoftRequirement[];
}

// ─── Applications ─────────────────────────────────────────────────────────────

export interface UserApplication {
  job_id: string;
  job_title: string;
  company: string | null;
  applied_at: string;
  match_score: number | null;
}

export interface UserApplicationsResponse {
  user_id: string;
  applications: UserApplication[];
  total: number;
}

export interface AppliedCandidate {
  user_id: string;
  applied_at: string;
  total_score: number | null;
  skill_score: number | null;
  domain_score: number | null;
  optional_skill_score?: number;
  soft_skill_score?: number;
  culture_fit_score?: number;
  culture_bonus: number;
  preference_bonus: number;
  matched_skills: string[];
  missing_skills: string[];
  matched_domains: string[];
  missing_domains: string[];
  behavioral_risk_flags?: string[];
  explanation: string;
}

export interface JobApplicantsResponse {
  job_id: string;
  applicants: AppliedCandidate[];
  total: number;
}
