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
}

export interface UserListItem {
  id: string;
}

export interface IngestUserResponse {
  skills_extracted: number;
  domains_extracted: number;
  projects_extracted: number;
  experiences_extracted: number;
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

export interface UserDescribeResponse {
  identity?: string;
  career_arc?: string;
  technical_profile?: string;
  domain_expertise?: string;
  core_strengths?: string[];
  gaps_and_concerns?: string[];
  honest_assessment?: string;
  best_suited_for?: string;
  interview_ready_summary?: string;
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
