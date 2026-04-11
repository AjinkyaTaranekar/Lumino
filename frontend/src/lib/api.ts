import type {
  AnalyticsEventType,
  BatchCandidateResponse,
  BatchMatchResponse,
  ClarificationsResponse,
  EditSessionMessage,
  EditSessionResponse,
  GraphMutation,
  GraphVersion,
  IngestJobResponse,
  IngestUserResponse,
  InterestProfileResponse,
  InterviewTurn,
  Job,
  JobApplicantsResponse,
  MatchInsightsResponse,
  PracticeHistoryResponse,
  PracticeScorecard,
  ResolveFlagResponse,
  RichJobProfile,
  RollbackResponse,
  StartPracticeResponse,
  UserApplicationsResponse,
  UserDescribeResponse,
  UserListItem,
  UserPracticeSessionsResponse,
} from './types';

const BASE = '/api/v1';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: 'DELETE' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Ingestion - text
  ingestUser: (userId: string, profileText: string) =>
    post<IngestUserResponse>('/users/ingest', { user_id: userId, profile_text: profileText }),

  ingestJob: (jobId: string, jobText: string, recruiterId?: string) =>
    post<IngestJobResponse>('/jobs/ingest', { job_id: jobId, job_text: jobText, recruiter_id: recruiterId }),

  // Ingestion - PDF (multipart)
  uploadUserPdf(userId: string, file: File): Promise<IngestUserResponse> {
    const fd = new FormData();
    fd.append('user_id', userId);
    fd.append('file', file);
    return postForm<IngestUserResponse>('/users/upload', fd);
  },

  uploadJobPdf(jobId: string, file: File, recruiterId?: string): Promise<IngestJobResponse> {
    const fd = new FormData();
    fd.append('job_id', jobId);
    fd.append('file', file);
    if (recruiterId) fd.append('recruiter_id', recruiterId);
    return postForm<IngestJobResponse>('/jobs/upload', fd);
  },

  // Listings
  listJobs: (recruiterId?: string) =>
    get<Job[]>(`/jobs${recruiterId ? `?recruiter_id=${recruiterId}` : ''}`),

  listUsers: () => get<UserListItem[]>('/users'),

  // Matching
  getMatches: (userId: string) => get<BatchMatchResponse>(`/users/${userId}/matches`),
  getCandidates: (jobId: string) => get<BatchCandidateResponse>(`/jobs/${jobId}/matches`),
  getMatchDetail: (userId: string, jobId: string) => get<import('./types').MatchResult>(`/users/${userId}/matches/${jobId}`),
  getMatchInsights: (userId: string, jobId: string, perspective: 'seeker' | 'recruiter' = 'seeker') =>
    get<MatchInsightsResponse>(`/users/${userId}/matches/${jobId}/insights?perspective=${perspective}`),
  getMatchPaths: (userId: string, jobId: string, limit?: number) =>
    get<{ paths: Array<{ path: string }> }>(`/users/${userId}/matches/${jobId}/paths${limit ? `?limit=${limit}` : ''}`),
  explainMatch: (userId: string, jobId: string, perspective?: string) =>
    post<{ explanation: unknown }>(`/users/${userId}/matches/${jobId}/explain?perspective=${perspective || 'recruiter'}`, {}),

  // Visualization
  generateUserViz: (userId: string) => post<unknown>(`/users/${userId}/visualize`, {}),
  generateJobViz: (jobId: string) => post<unknown>(`/jobs/${jobId}/visualize`, {}),
  generateMatchViz: (userId: string, jobId: string) => post<unknown>(`/users/${userId}/matches/${jobId}/visualize`, {}),

  // Iframe src URLs (relative - proxied by Vite)
  userVizUrl: (userId: string) => `${BASE}/users/${userId}/visualize`,
  jobVizUrl: (jobId: string) => `${BASE}/jobs/${jobId}/visualize`,
  matchVizUrl: (userId: string, jobId: string) => `${BASE}/users/${userId}/matches/${jobId}/visualize`,

  // Stats
  getUserStats: (userId: string) => get<unknown>(`/users/${userId}/graph-stats`),

  // Clarification / Digital Twin Verification
  getClarifications: (userId: string) => get<ClarificationsResponse>(`/users/${userId}/clarifications`),
  resolveFlag: (userId: string, flagId: string, isCorrect: boolean, userAnswer: string, correction?: string | null) =>
    post<ResolveFlagResponse>(`/users/${userId}/clarifications/${flagId}/resolve`, {
      is_correct: isCorrect,
      user_answer: userAnswer,
      correction: correction ?? null,
    }),
  skipFlag: (userId: string, flagId: string) =>
    post<unknown>(`/users/${userId}/clarifications/${flagId}/skip`, {}),
  interpretFlag: (userId: string, flagId: string, answer: string) =>
    post<unknown>(`/users/${userId}/clarifications/${flagId}/interpret`, { answer }),
  describeUser: (userId: string) => get<UserDescribeResponse>(`/users/${userId}/describe`),
  getCompleteness: (userId: string) => get<unknown>(`/users/${userId}/completeness`),

  // Analytics
  recordEvent: (userId: string, jobId: string, eventType: AnalyticsEventType, durationMs?: number) =>
    post<{ status: string }>(`/users/${userId}/events`, {
      job_id: jobId,
      event_type: eventType,
      duration_ms: durationMs,
    }),
  getInterestProfile: (userId: string) =>
    get<InterestProfileResponse>(`/users/${userId}/interests`),
  adjustInterest: (userId: string, tag: string, score: number) =>
    patch<{ status: string }>(`/users/${userId}/interests/${encodeURIComponent(tag)}`, { score }),
  removeInterest: (userId: string, tag: string) =>
    del<{ status: string }>(`/users/${userId}/interests/${encodeURIComponent(tag)}`),

  getApplications: (userId: string) =>
    get<UserApplicationsResponse>(`/users/${userId}/applications`),

  getJobInteractions: (userId: string) =>
    get<import('./types').JobInteractionsResponse>(`/users/${userId}/job-interactions`),

  getJobApplicants: (jobId: string) =>
    get<JobApplicantsResponse>(`/jobs/${jobId}/applications`),

  // Career preferences (onboarding + profile enhancement)
  saveCareerPreferences: (userId: string, prefs: {
    employment_types?: string[];
    salary_min?: number | null;
    salary_max?: number | null;
    salary_currency?: string;
    location?: string;
    remote_only?: boolean;
    work_authorization?: string;
    career_goal?: string;
    values?: string[];
  }) => post<{ status: string; saved_fields: string[] }>(`/users/${userId}/career-preferences`, prefs),

  // Job tag management
  retagJob: (jobId: string) =>
    post<{ job_id: string; tags: string[]; count: number }>(`/jobs/${jobId}/retag`, {}),
  retagAllJobs: () =>
    post<{ jobs_processed: number; jobs_tagged: number; results: Record<string, string[]> }>('/jobs/retag-all', {}),

  // Job profile
  getJobProfile: (jobId: string) => get<RichJobProfile>(`/jobs/${jobId}/profile`),

  // Admin - delete
  deleteUser: (userId: string) => del<unknown>(`/users/${userId}`),
  deleteJob: (jobId: string) => del<unknown>(`/jobs/${jobId}`),

  // Graph editing - sessions
  startEditSession: (entityType: 'user' | 'job', entityId: string, recruiterId?: string) => {
    const base = entityType === 'user' ? `/users/${entityId}` : `/jobs/${entityId}`;
    return post<EditSessionResponse>(`${base}/graph/edit/start`, recruiterId ? { recruiter_id: recruiterId } : {});
  },
  sendEditMessage: (entityType: 'user' | 'job', entityId: string, sessionId: string, message: string) => {
    const base = entityType === 'user' ? `/users/${entityId}` : `/jobs/${entityId}`;
    return post<EditSessionMessage>(`${base}/graph/edit/message`, { session_id: sessionId, message });
  },
  applyMutations: (entityType: 'user' | 'job', entityId: string, sessionId: string, mutations: GraphMutation) => {
    const base = entityType === 'user' ? `/users/${entityId}` : `/jobs/${entityId}`;
    return post<unknown>(`${base}/graph/edit/apply`, { session_id: sessionId, mutations });
  },
  rejectMutations: (entityType: 'user' | 'job', entityId: string, sessionId: string) => {
    const base = entityType === 'user' ? `/users/${entityId}` : `/jobs/${entityId}`;
    return post<unknown>(`${base}/graph/edit/reject`, { session_id: sessionId });
  },
  getEditHistory: (entityType: 'user' | 'job', entityId: string, sessionId: string) => {
    const base = entityType === 'user' ? `/users/${entityId}` : `/jobs/${entityId}`;
    return get<EditSessionMessage[]>(`${base}/graph/edit/history?session_id=${sessionId}`);
  },

  // Graph versioning
  listVersions: (entityType: 'user' | 'job', entityId: string) => {
    const base = entityType === 'user' ? `/users/${entityId}` : `/jobs/${entityId}`;
    return get<GraphVersion[]>(`${base}/graph/versions`);
  },
  rollback: (entityType: 'user' | 'job', entityId: string, versionId: string) => {
    const base = entityType === 'user' ? `/users/${entityId}` : `/jobs/${entityId}`;
    return post<RollbackResponse>(`${base}/graph/rollback/${versionId}`, {});
  },
  saveCheckpoint: (entityType: 'user' | 'job', entityId: string, label?: string) => {
    const base = entityType === 'user' ? `/users/${entityId}` : `/jobs/${entityId}`;
    return post<unknown>(`${base}/graph/checkpoint`, { label: label ?? 'manual' });
  },

  // ── Practice Interview ──────────────────────────────────────────────────────
  practice: {
    startSession: (body: { user_id: string; job_id: string }) =>
      post<StartPracticeResponse>('/practice/sessions/start', body),

    sendMessage: (sessionId: string, body: { user_id: string; content: string }) =>
      post<InterviewTurn>(`/practice/sessions/${sessionId}/message`, body),

    completeSession: (sessionId: string, body: { user_id: string }) =>
      post<PracticeScorecard>(`/practice/sessions/${sessionId}/complete`, body),

    getHistory: (sessionId: string) =>
      get<PracticeHistoryResponse>(`/practice/sessions/${sessionId}/history`),

    getUserSessions: (userId: string) =>
      get<UserPracticeSessionsResponse>(`/practice/users/${userId}/sessions`),
  },
};
