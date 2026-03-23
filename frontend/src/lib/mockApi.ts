import type {
  BatchMatchResponse,
  BatchCandidateResponse,
  ClarificationsResponse,
  AdminStatsResponse,
  TrajectoryResponse,
} from './types'

export const mockApi = {
  getHealth: (): Promise<{ status: string; database: string }> =>
    Promise.resolve({ status: 'ok', database: 'neo4j connected' }),

  listUsers: (): Promise<string[]> =>
    Promise.resolve(['user_1', 'user_2', 'user_3']),

  listJobs: (): Promise<{ job_id: string; job_title: string; company: string }[]> =>
    Promise.resolve([
      { job_id: 'job_1', job_title: 'Senior Backend Engineer', company: 'Lumino Tech' },
      { job_id: 'job_2', job_title: 'Product Marketing Manager', company: 'Growth Labs' },
      { job_id: 'job_3', job_title: 'Lead Frontend Developer', company: 'Creative Solutions' },
    ]),

  getUserMatches: (userId: string): Promise<BatchMatchResponse> =>
    Promise.resolve({
      user_id: userId,
      results: [
        {
          job_id: 'job_1',
          job_title: 'Senior Backend Engineer',
          company: 'Lumino Tech',
          total_score: 92,
          skill_score: 95,
          domain_score: 88,
          culture_bonus: 5,
          preference_bonus: 4,
          matched_skills: ['Python', 'Neo4j', 'FastAPI'],
          missing_skills: ['Kubernetes'],
          matched_domains: ['Fintech', 'SaaS'],
          missing_domains: [],
          explanation: 'Strong match in core backend technologies and domain expertise.',
        },
        {
          job_id: 'job_3',
          job_title: 'Lead Frontend Developer',
          company: 'Creative Solutions',
          total_score: 75,
          skill_score: 70,
          domain_score: 80,
          culture_bonus: 3,
          preference_bonus: 2,
          matched_skills: ['React', 'TypeScript'],
          missing_skills: ['Next.js', 'Tailwind'],
          matched_domains: ['SaaS'],
          missing_domains: ['E-commerce'],
          explanation: 'Good foundational skills but missing key framework experience.',
        },
      ],
      total_jobs_ranked: 42,
    }),

  getSingleMatch: (userId: string, jobId: string) =>
    Promise.resolve({
      job_id: jobId,
      job_title: 'Senior Backend Engineer',
      company: 'Lumino Tech',
      total_score: 92,
      skill_score: 95,
      domain_score: 88,
      culture_bonus: 5,
      preference_bonus: 4,
      matched_skills: ['Python', 'Neo4j', 'FastAPI'],
      missing_skills: ['Kubernetes'],
      matched_domains: ['Fintech', 'SaaS'],
      missing_domains: [],
      explanation: 'Strong match in core backend technologies and domain expertise.',
    }),

  getJobCandidates: (jobId: string): Promise<BatchCandidateResponse> =>
    Promise.resolve({
      job_id: jobId,
      results: [
        {
          user_id: 'user_1',
          total_score: 95,
          skill_score: 98,
          domain_score: 92,
          culture_bonus: 5,
          preference_bonus: 5,
          matched_skills: ['Python', 'Neo4j', 'FastAPI', 'Kubernetes'],
          missing_skills: [],
          matched_domains: ['Fintech', 'SaaS'],
          missing_domains: [],
          explanation: 'Exceptional candidate with perfect skill alignment.',
        },
        {
          user_id: 'user_2',
          total_score: 88,
          skill_score: 85,
          domain_score: 90,
          culture_bonus: 4,
          preference_bonus: 4,
          matched_skills: ['Python', 'FastAPI'],
          missing_skills: ['Neo4j'],
          matched_domains: ['SaaS'],
          missing_domains: ['Fintech'],
          explanation: 'Strong generalist with relevant experience.',
        },
      ],
      total_users_ranked: 1240,
    }),

  getUserClarifications: (userId: string): Promise<ClarificationsResponse> =>
    Promise.resolve({
      user_id: userId,
      total_flags: 5,
      pending: 2,
      resolved: 3,
      questions: [
        {
          flag_id: 'flag_1',
          field: 'skill_level',
          raw_text: 'Worked with Python for 5 years',
          interpreted_as: 'Expert',
          confidence: 'High',
          ambiguity_reason: 'Years of experience is a proxy for skill level',
          clarification_question: 'How would you rate your proficiency in Python?',
          resolution_impact: 'High',
          suggested_options: ['Beginner', 'Intermediate', 'Expert'],
          status: 'pending',
        },
        {
          flag_id: 'flag_2',
          field: 'domain_expertise',
          raw_text: 'Financial systems development',
          interpreted_as: 'Fintech',
          confidence: 'Medium',
          ambiguity_reason: 'Financial systems can be broad',
          clarification_question:
            'Does your experience in financial systems specifically include Fintech?',
          resolution_impact: 'Medium',
          status: 'pending',
        },
      ],
      graph_verified: false,
    }),

  getUserGraphStats: (_userId: string) =>
    Promise.resolve({
      user_nodes: 15,
      skill_nodes: 42,
      project_nodes: 8,
      experience_nodes: 5,
      domain_nodes: 12,
    }),

  getUserCompleteness: (_userId: string) =>
    Promise.resolve({
      overall_score: 72,
      technical_depth: 85,
      human_depth: 59,
      matching_capability_flags: ['evidence_weighted_skills', 'soft_skill_scoring'],
    }),

  getAdminStats: (): Promise<AdminStatsResponse> =>
    Promise.resolve({
      graph_nodes: 15420,
      api_latency: '42ms',
      active_sessions: 128,
      system_health: 'Healthy',
    }),

  getAdminTrajectories: (): Promise<TrajectoryResponse[]> =>
    Promise.resolve([
      { id: '1', name: 'Llama-3-70b-Extraction', status: 'Active', progress: 100, last_updated: '2026-03-23T10:00:00Z' },
      { id: '2', name: 'Neo4j-Graph-Matching', status: 'Active', progress: 100, last_updated: '2026-03-23T10:05:00Z' },
      { id: '3', name: 'User-Twin-Verification', status: 'Running', progress: 72, last_updated: '2026-03-23T16:45:00Z' },
    ]),

  ingestUser: (userId: string, _profileText: string) =>
    Promise.resolve({ status: 'success', user_id: userId, clarification_questions: 5 }),

  ingestJob: (jobId: string) =>
    Promise.resolve({ status: 'success', job_id: jobId }),

  resolveClarification: (flagId: string, _body: { is_correct: boolean; user_answer: string; correction?: string | null }) =>
    Promise.resolve({
      flag_id: flagId,
      status: 'resolved',
      graph_updated: true,
      remaining_critical: 1,
    }),

  startEditSession: (_userId: string) =>
    Promise.resolve({
      session_id: 'session_abc123',
      opening_question: 'How can I help you refine your digital twin today?',
      graph_summary: { nodes: 42, edges: 120 },
    }),

  sendEditMessage: (_userId: string, _sessionId: string, _message: string) =>
    Promise.resolve({
      reasoning: 'Based on your description of the project, I am adding "Next.js" as a core skill.',
      mutations: {
        add_nodes: [{ type: 'Skill', name: 'Next.js' }],
        add_edges: [{ from: 'User:me', rel: 'HAS_SKILL', to: 'Skill:Next.js' }],
      },
      follow_up_question:
        'Did you use any specific state management library like Redux or Zustand in that project?',
      graph_impact_banner: {
        headline: 'Your answer updated 2 nodes in your digital twin',
        items: [
          { icon: 'skill' as const, label: 'Next.js', change_type: 'add', detail: 'Added as a core technical skill' },
        ],
      },
    }),

  applyMutations: (_userId: string, _sessionId: string, _mutations: object) =>
    Promise.resolve({
      auto_checkpoint_version_id: 'v2_checkpoint_456',
      nodes_added: 1,
      nodes_updated: 0,
      nodes_removed: 0,
      edges_added: 1,
    }),
}
