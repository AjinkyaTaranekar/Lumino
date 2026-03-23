# Missing API Endpoints

This document tracks UI features in the Lumino frontend that require new backend API endpoints.

## 1. Application Status Tracking
**Page:** `/applications` (Applications.tsx)  
**Current workaround:** Job match results from `GET /api/v1/users/{userId}/matches` are surfaced as application proxies.  
**Required endpoint:**
- `GET /api/v1/users/{userId}/applications` → `{ applications: [{ job_id, applied_at, status: 'pending'|'reviewing'|'interviewing'|'rejected'|'offer', last_updated }] }`
- `POST /api/v1/users/{userId}/applications` → `{ job_id }` to create an application

## 2. Practice / Interview Sessions
**Page:** `/practice` (Practice.tsx)  
**Current workaround:** Static UI prototype only.  
**Required endpoints:**
- `POST /api/v1/practice/sessions` → `{ user_id, job_id? }` → `{ session_id, first_question, question_number, total_questions }`
- `POST /api/v1/practice/sessions/{session_id}/respond` → `{ answer }` → `{ next_question, analysis, confidence_score }`
- `GET /api/v1/practice/sessions/{session_id}/report` → `{ summary, scores, strengths, weaknesses }`

## 3. Workspace / Analytics Settings
**Page:** `/analytics` (Analytics.tsx)  
**Current workaround:** User and job counts from existing APIs.  
**Required endpoints:**
- `GET /api/v1/workspace/settings` → `{ inference_depth, active_models: [{ name, active }], team_members: [...] }`
- `PUT /api/v1/workspace/settings` → `{ inference_depth?, active_models? }`
- `POST /api/v1/workspace/invite` → `{ email, role }` to invite a team member

## 4. Career Trajectory Path
**Page:** `/trajectory` (Trajectory.tsx)  
**Current workaround:** Graph stats and match results.  
**Required endpoint:**
- `GET /api/v1/users/{userId}/trajectory` → `{ current_level, target_roles: [...], skill_gaps: [...], recommended_actions: [...], estimated_timeline: string }`

## 5. Job Bookmarks / Saved Jobs
**Page:** `/jobs` (JobsList.tsx)  
**Current workaround:** None — bookmark button is decorative.  
**Required endpoint:**
- `POST /api/v1/users/{userId}/bookmarks` → `{ job_id }`
- `GET /api/v1/users/{userId}/bookmarks` → `[{ job_id, bookmarked_at }]`
- `DELETE /api/v1/users/{userId}/bookmarks/{jobId}`
