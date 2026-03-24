import type {
  BatchCandidateResponse,
  BatchMatchResponse,
  ClarificationsResponse,
  EditSessionMessage,
  EditSessionResponse,
  GraphMutation,
  GraphVersion,
  IngestJobResponse,
  IngestUserResponse,
  Job,
  ResolveFlagResponse,
  RollbackResponse,
  UserDescribeResponse,
  UserListItem,
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
};
