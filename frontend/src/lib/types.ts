/**
 * Generated types from OpenAPI schema
 */

export type UserRole = 'USER' | 'RECRUITER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
}

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
  add_nodes?: any[];
  update_nodes?: any[];
  remove_nodes?: string[];
  add_edges?: any[];
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
  graph_summary: any;
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

export interface StartEditRequest {
  recruiter_id?: string | null;
}

export interface SendMessageRequest {
  session_id: string;
  message: string;
}

export interface ApplyMutationsRequest {
  session_id: string;
  mutations: GraphMutation;
}

export interface ApplyMutationsResponse {
  auto_checkpoint_version_id: string;
  nodes_added: number;
  nodes_updated: number;
  nodes_removed: number;
  edges_added: number;
}

export interface RejectMutationsRequest {
  session_id: string;
}

export interface CheckpointRequest {
  label?: string | null;
}

// Additional types for UI that might not be in OpenAPI but are used in the app
export interface AdminStatsResponse {
  graph_nodes: number;
  api_latency: string;
  active_sessions: number;
  system_health: string;
}

export interface TrajectoryResponse {
  id: string;
  name: string;
  status: string;
  progress: number;
  last_updated: string;
}
