# Missing Backend APIs

These APIs are required by the Lumino frontend design (Stitch mockups) but **do not yet exist** in the backend.
Each entry includes the intended endpoint, request/response shape, and which UI screen needs it.

---

## 1. Career Trajectory / Stepping Stone Jobs

**Screen**: Career Trajectory Map (Dashboard v2)

```
GET /api/v1/users/{user_id}/career-trajectory

Response:
{
  user_id: str,
  current_role: str,
  paths: [
    {
      path_id: str,
      path_name: str,           // "Staff Engineer", "Engineering Manager", "Founding Engineer"
      track: str,               // "Technical Leadership", "People Management", "Startup"
      time_estimate: str,       // "3-5 Years"
      affinity_score: float,    // 0-1
      is_high_affinity: bool,
      stepping_stone_jobs: [
        {
          job_id: str,
          title: str,
          company: str,
          location: str,
          remote_policy: str,
          salary_range: str,    // "$160k - $210k"
          equity: str,          // null or "1.5%"
          fit_score: float,     // 0-1
          path_alignment: str,  // "Engineering Manager path"
          insight: str,         // AI insight about why this job is a stepping stone
        }
      ]
    }
  ]
}
```

**Notes**: Requires LLM analysis of user graph + career goals. Currently no career goal nodes exist — would need `GoalNode` in graph.

---

## 2. Post-Interview Growth Feedback

**Screen**: Developer Post-Interview Growth Feedback

```
POST /api/v1/users/{user_id}/interviews
Body: { job_id: str, company: str, role: str, outcome: "passed"|"failed"|"pending", notes: str }

GET /api/v1/users/{user_id}/interviews
Response: [{ interview_id, job_id, company, role, outcome, feedback_generated, date }]

GET /api/v1/users/{user_id}/interviews/{interview_id}/feedback
Response: {
  interview_id: str,
  skill_gaps_revealed: [str],
  growth_areas: [{ area: str, priority: "high"|"medium"|"low", resources: [str] }],
  graph_updates_suggested: [{ node: str, action: "add"|"update", reason: str }],
  encouragement: str,
  next_steps: [str]
}
```

**Notes**: No interview tracking exists at all. Needs new SQLite table + LLM analysis.

---

## 3. Recruiter Workspace / Company Profile

**Screen**: Recruiter Company and Team Setup (Step 2/4 wizard)

```
GET  /api/v1/recruiters/{recruiter_id}/workspace
POST /api/v1/recruiters/{recruiter_id}/workspace
Body: {
  company_name: str,
  industry: str,
  website: str,
  bio: str,
  culture_tags: [str],          // ["Remote-First", "High Autonomy", "Data-Driven", ...]
  team_name: str,
  team_members: [{ name: str, title: str, joined: str }]
}

Response: { recruiter_id, workspace_id, ...body_fields, created_at, updated_at }
```

**Notes**: Currently no recruiter profile model. Only `recruiter_id` is stored as a string on job nodes. Would need new `RecruiterNode` in Neo4j + SQLite table.

---

## 4. Notifications

**Screen**: Top navbar notification bell

```
GET /api/v1/users/{user_id}/notifications?unread_only=true
Response: {
  total: int,
  unread: int,
  items: [
    {
      notification_id: str,
      type: "new_job_match" | "graph_verified" | "interview_feedback" | "profile_incomplete",
      title: str,
      message: str,
      read: bool,
      created_at: str,
      action_url: str
    }
  ]
}

POST /api/v1/users/{user_id}/notifications/{notification_id}/read
```

**Notes**: No notification system exists. Would need event-driven SQLite writes + polling endpoint.

---

## 5. User Completeness Score (EXISTS but unused in frontend)

**Screen**: Profile completeness progress bar

```
GET /api/v1/users/{user_id}/completeness
Response (already implemented):
{
  overall_score: float,
  technical_depth: {
    skill_evidence: float,
    project_impact: float,
    experience_accomplishments: float,
    skills_with_anecdotes: float
  },
  human_depth: {
    anecdotes: float,
    motivation: float,
    values: float,
    goals: float,
    culture_identity: float,
    behavioral_insights: float
  }
}
```

**Action**: Frontend needs to call this and show a completeness ring/progress on the Profile and Upload pages.

---

## 6. Job Team Dynamics

**Screen**: Stepping Stone Job Details — Team Dynamics Radar Chart

```
GET /api/v1/jobs/{job_id}/team-dynamics
Response: {
  job_id: str,
  team_size: int,
  axes: {
    architecture: float,    // 0-1
    leadership: float,
    speed: float,
    sys_design: float,
    collaboration: float
  },
  user_fit_axes: {          // How the viewing user fits on each axis
    architecture: float,
    leadership: float,
    ...
  },
  high_need_areas: [str],
  team_members: [{ name: str, title: str, avatar_initials: str }]
}
```

**Notes**: No team composition data in job model. Would need `TeamMemberNode` in graph + radar chart computation.

---

## 7. Recommended Learning Resources

**Screen**: Skill gap → "How to bridge this gap"

```
GET /api/v1/users/{user_id}/matches/{job_id}/learning-path
Response: {
  missing_skills: [
    {
      skill: str,
      importance: "critical"|"important"|"nice-to-have",
      estimated_hours: int,
      resources: [
        { type: "course"|"book"|"project", title: str, url: str, provider: str }
      ]
    }
  ],
  total_estimated_weeks: int
}
```

**Notes**: Would require integration with a learning resources API or LLM-generated suggestions.

---

## 8. Bulk Match Pre-Computation Cache

**Screen**: Dashboard loads slowly because `/users/{user_id}/matches` recomputes every time

```
POST /api/v1/users/{user_id}/matches/refresh    # Background recompute + cache
GET  /api/v1/users/{user_id}/matches/cached     # Return cached results with timestamp
```

**Notes**: Currently every "Get Recommendations" call does a full graph traversal. Adding a cache layer would dramatically improve UX.

---

---

## 9. Hardcoded UI Stats — User Dashboard

**Screen**: `Dashboard.tsx` → `UserDashboard` stat cards

All three cards are currently static/hardcoded. Need real API data:

```
GET /api/v1/users/{user_id}/dashboard-stats

Response:
{
  profile_match_pct: float,     // hardcoded: 85%
  profile_match_delta: float,   // hardcoded: +5% this week
  skill_traits_mapped: int,     // hardcoded: 14 (new traits mapped)
  // active_applications derived from existing matches/jobs endpoints
}
```

**Notes**: `profile_match_pct` could be derived from existing `/users/{user_id}/completeness`. `skill_traits_mapped` requires counting nodes in the user graph.

---

## 10. Hardcoded UI Stats — Recruiter Dashboard

**Screen**: `Dashboard.tsx` → `RecruiterDashboard` stat cards

```
GET /api/v1/recruiters/{recruiter_id}/dashboard-stats

Response:
{
  total_jobs: int,              // dynamically loaded (OK)
  interviews_today: int,        // hardcoded: 8
  high_match_candidates: int,   // hardcoded: 42
  avg_time_to_hire_days: int,   // hardcoded: 14
}
```

**Notes**: Requires interview scheduling data (see API #2) and historical hiring records — neither exists yet.

---

## 11. Hardcoded UI Stats — Admin Dashboard

**Screen**: `Dashboard.tsx` → `AdminDashboardWidget` and `AdminDashboard.tsx`

```
GET /api/v1/admin/system-stats

Response:
{
  graph_node_count: int,        // hardcoded: 45,201
  api_latency_ms: float,        // hardcoded: 124ms
  active_sessions: int,         // hardcoded: 892
}
```

**Notes**: `graph_node_count` is available via Neo4j `MATCH (n) RETURN count(n)`. `active_sessions` requires session tracking. `api_latency_ms` requires an APM layer.

---

## 12. User Avatar / Profile Photo

**Screen**: `TopNavBar.tsx` — profile avatar

```
GET /api/v1/users/{user_id}/avatar
Response: { avatar_url: str | null }

POST /api/v1/users/{user_id}/avatar
Body: multipart/form-data { file: File }
Response: { avatar_url: str }
```

**Notes**: Currently using `https://picsum.photos/seed/{user_id}/100/100` as a random placeholder. No real user photo upload exists.

---

## 13. Career Trajectory — All Content Hardcoded

**Screen**: `pages/user/Trajectory.tsx`

The entire Trajectory page is mock data:
- Milestones (current role, role history) — **hardcoded**
- Skill gaps (e.g., "System Design", "Leadership") — **hardcoded**
- Recommended next roles — **hardcoded**
- Career path dot-grid visualization — **hardcoded**

Needs API #1 (`/users/{user_id}/career-trajectory`) fully implemented.

---

## 14. Applications / Feedback Page — Entirely Mocked

**Screen**: `pages/user/Applications.tsx`

The entire page uses mock data:
- Application list (company, role, status, date) — **hardcoded**
- Status distribution PieChart (Interviewing / Pending / Rejected) — **hardcoded**
- AI-generated feedback per application — **hardcoded**

```
GET /api/v1/users/{user_id}/applications
Response: [
  {
    application_id: str,
    job_id: str,
    company: str,
    role: str,
    status: "applied" | "interviewing" | "offer" | "rejected" | "withdrawn",
    applied_at: str,
    last_updated: str,
    ai_feedback: str | null
  }
]

POST /api/v1/users/{user_id}/applications
Body: { job_id: str }
```

**Notes**: No application tracking exists in the backend. Jobs are matched but no "apply" action is stored.

---

## 15. Practice / Interview Session — Entirely Mocked

**Screen**: `pages/user/Practice.tsx`

The interview session is fully simulated on the frontend:
- AI interviewer responses — **hardcoded mock turns**
- Question bank — **hardcoded**
- Session scoring — **not implemented**

```
POST /api/v1/users/{user_id}/practice-sessions
Body: { job_id: str | null, focus_area: str | null }
Response: { session_id: str, first_question: str }

POST /api/v1/users/{user_id}/practice-sessions/{session_id}/respond
Body: { answer: str }
Response: { next_question: str | null, feedback: str, score_delta: float, session_complete: bool }

GET /api/v1/users/{user_id}/practice-sessions/{session_id}/summary
Response: { overall_score: float, strengths: [str], improvement_areas: [str], transcript: [...] }
```

---

## 16. CandidatesBrowser AI Insight Banner

**Screen**: `pages/recruiter/CandidatesBrowser.tsx`

The "AI Insight" banner text (e.g., "3 candidates in this pool exceed 85% match threshold for your senior roles") is hardcoded.

```
GET /api/v1/recruiters/{recruiter_id}/talent-insights
Response: {
  top_match_count: int,
  match_threshold: float,
  insight_text: str,          // LLM-generated insight
  last_computed_at: str
}
```

---

## Summary

| API | Priority | Complexity | Frontend Screen |
|-----|----------|------------|-----------------|
| Career Trajectory | High | High (LLM + new graph nodes) | Dashboard v2 |
| Post-Interview Feedback | Medium | Medium | Post-Interview page |
| Recruiter Workspace | High | Medium (new model) | Recruiter setup wizard |
| Notifications | Low | Medium | All pages (navbar) |
| Completeness Score (USE existing) | High | Low (just wire up) | Profile, Upload |
| Team Dynamics | Low | High | Job details |
| Learning Path | Medium | Medium (LLM) | Match Explorer |
| Match Cache | High | Low | Dashboard |
| User Dashboard Stats | High | Low | Dashboard (user) |
| Recruiter Dashboard Stats | Medium | Medium | Dashboard (recruiter) |
| Admin System Stats | Medium | Low | Admin Dashboard |
| User Avatar Upload | Low | Low | TopNavBar |
| Applications Tracking | High | Medium | Applications page |
| Practice Session (AI) | Medium | High (LLM) | Practice page |
| Talent Insights Banner | Low | Medium (LLM) | CandidatesBrowser |
