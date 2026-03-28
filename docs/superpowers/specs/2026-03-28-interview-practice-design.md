# Interview Practice Feature — Design Spec
**Date:** 2026-03-28
**Branch:** feat/user-interview-practice
**Status:** Approved — ready for implementation

---

## Overview

A conversational AI interview practice feature that lets users simulate a real interview for a specific job they've applied to (or are interested in). The AI adopts the company's culture persona and shifts between interviewer roles (hiring manager, tech lead, culture fit) across 5 structured phases, using both the job's deep profile and the candidate's graph as private context to generate personalized, probing questions.

---

## Entry Points

1. **Applications page** — each applied job card gets a "Practice Interview" button → navigates to `/practice?jobId=<id>`
2. **Practice page** (`/practice`) — if no `jobId` query param, shows a `JobPickerModal` listing the user's applied jobs with match scores → selecting one starts the session

---

## Session Phases

The AI moves through 5 ordered phases, each mapped to a specific interviewer persona:

| Phase | Persona | Purpose |
|-------|---------|---------|
| `intro` | Hiring Manager | Warm open, role fit, motivations |
| `technical` | Tech Lead | Skills depth, specifics, gap probing |
| `behavioral` | Hiring Manager | STAR stories, judgment, past experiences |
| `culture` | Culture Fit Interviewer | Values, team dynamics, working style |
| `closing` | Hiring Manager | Candidate questions, wrap-up → triggers scorecard |

Phase advancement is AI-driven: the agent decides when enough coverage has been achieved in the current phase before moving forward. The user sees a phase progress stepper in the UI.

---

## Backend

### New SQLite Tables

```sql
practice_sessions (
  session_id       TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  job_id           TEXT NOT NULL,
  phase            TEXT DEFAULT 'intro',
  question_index   INTEGER DEFAULT 0,
  core_questions   TEXT,           -- JSON array of pre-generated question strings
  started_at       TEXT,
  last_active      TEXT
)

practice_messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       TEXT NOT NULL,
  role             TEXT NOT NULL,  -- 'user' | 'assistant'
  content          TEXT NOT NULL,
  interviewer_persona TEXT,        -- 'hiring_manager' | 'tech_lead' | 'culture_fit'
  phase            TEXT,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
)

practice_scorecards (
  session_id       TEXT PRIMARY KEY,
  scores           TEXT,           -- JSON: { communication, technical, behavioral, culture, overall }
  strengths        TEXT,           -- JSON array of strings
  gaps             TEXT,           -- JSON array of strings
  recommendation   TEXT,           -- 'strong_yes' | 'yes' | 'maybe' | 'no'
  generated_at     TEXT
)
```

### New Files

```
backend/
  services/
    practice_interview_agent.py   -- LLM agent (modeled after llm_edit_agent.py)
    practice_session_service.py   -- Session orchestration (modeled after graph_edit_service.py)
  models/
    practice_schemas.py           -- Pydantic request/response models
  api/
    practice_routes.py            -- FastAPI router
```

### API Endpoints

All under `/api/v1/practice/`:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions/start` | Start a new practice session |
| `POST` | `/sessions/{session_id}/message` | Send a user message, get AI response |
| `POST` | `/sessions/{session_id}/complete` | End session and generate scorecard |
| `GET` | `/sessions/{session_id}/history` | Get full message history |
| `GET` | `/users/{user_id}/sessions` | List all past practice sessions |

#### Request/Response Shapes

**Start session:**
```python
class StartPracticeRequest(BaseModel):
    user_id: str
    job_id: str

class StartPracticeResponse(BaseModel):
    session_id: str
    opening_message: str
    interviewer_persona: str        # 'hiring_manager'
    phase: str                      # 'intro'
    core_questions_count: int
    job_title: str
    company: str
```

**Send message:**
```python
class PracticeMessageRequest(BaseModel):
    user_id: str
    content: str

class InterviewTurn(BaseModel):
    ai_response: str
    interviewer_persona: str
    phase: str
    phase_changed: bool
    session_complete: bool          # True when AI is done with closing phase
    coaching_hint: str | None       # live insight for the right panel HUD
```

**Complete session:**
```python
class PracticeScorecard(BaseModel):
    scores: dict                    # { communication, technical, behavioral, culture, overall } 0-10
    strengths: list[str]
    gaps: list[str]
    recommendation: str             # 'strong_yes' | 'yes' | 'maybe' | 'no'
```

### `PracticeInterviewAgent`

**On session start:**
1. Fetch job's deep profile from Neo4j (title, company, culture, required skills, success metrics, team composition)
2. Fetch user's graph from Neo4j (skills with evidence strength, projects, experiences, behavioral insights, motivations, goals)
3. Generate 5–8 core questions targeting the gap between candidate profile and job requirements
4. Build the opening message using the company persona

**System prompt strategy:**
- Company culture persona derived from job's `CultureIdentity` and `TeamComposition` nodes
- Candidate profile loaded as private AI context (not revealed to user)
- Interview rules embedded: Why-Ladder (probe first answers), STAR collection (every behavioral claim needs a story), First Principles (strip labels), Gap Targeting (questions weighted toward profile vs. job mismatches)
- Phase-aware: prompt includes current phase goal and persona
- JSON response schema enforced via `response_format: {"type": "json_object"}`

**On each message:**
- Evaluate answer quality (content, specificity, evidence)
- Decide: follow-up in same phase OR advance to next phase
- Generate `coaching_hint` for the right-panel live insight card
- Return structured `InterviewTurn`

**On session complete:**
- Analyze full conversation history
- Score across 5 dimensions (0–10)
- Identify top 3 strengths and top 3 gaps
- Produce hiring recommendation

**Model config:** Uses existing `EDIT_AGENT_MODEL` env var (LiteLLM, defaults to `groq/llama-3.3-70b-versatile`). No code changes needed to swap models.

**Retry logic:** Mirrors `llm_edit_agent.py` — 5 attempts, exponential backoff, rate-limit-aware waits.

---

## Frontend

### New/Modified Files

```
frontend/src/
  pages/user/
    Practice.tsx                  -- Refactored: orchestrates session state, renders panels
  components/practice/
    PracticeChat.tsx              -- Chat thread: interviewer + user messages
    PracticeScorecard.tsx         -- End-of-session results overlay
    PhaseTimeline.tsx             -- Right panel phase stepper (replaces zoom controls)
    JobPickerModal.tsx            -- Job selection modal when no jobId in URL
  lib/api.ts                      -- Add practice API methods
```

### `Practice.tsx` (refactored)

Keeps the existing split-panel layout exactly. Replaces all mock/static data with real session state:

```
State:
  sessionId, phase, messages[], isLoading,
  currentPersona, phaseChanged, coachingHint,
  sessionComplete, scorecard, jobInfo

On mount:
  - Read ?jobId from URL params
  - If no jobId → show JobPickerModal
  - If jobId → call api.practice.startSession({ userId, jobId })
  - Populate chat with opening_message

On send:
  - Append user message to thread
  - Call api.practice.sendMessage({ sessionId, userId, content })
  - Append AI response with persona chip
  - Update phase, coachingHint
  - If phase === 'closing' and AI signals done → call api.practice.complete()
  - Show PracticeScorecard overlay
```

### `PracticeChat.tsx`

Chat message thread component:
- Interviewer messages: left-aligned, dark card (matches existing Curator Insight style — `rgba(15,23,63,0.92)` background), persona chip above first message of each phase
- User messages: right-aligned, blue gradient bubble
- Phase transition: animated divider showing new phase name + persona when `phase_changed: true`
- Typing indicator: 3-dot pulse animation while `isLoading`
- Textarea at bottom: Enter to send, Shift+Enter for newlines, disabled while loading

### `PhaseTimeline.tsx`

Replaces the zoom controls in the right panel bottom-right HUD. Vertical stepper with 5 phase nodes:
- Completed: filled blue circle with checkmark
- Active: pulsing ring animation
- Upcoming: hollow grey circle
- Phase label and persona name beside each node

### `PracticeScorecard.tsx`

Slides in as an overlay over the right panel when session completes:
- 5 animated score rings (Framer Motion spring) — communication, technical, behavioral, culture, overall
- Strengths list with green check badges
- Gaps list with amber warning badges
- Recommendation banner: color-coded (`strong_yes` = green, `yes` = blue, `maybe` = amber, `no` = red)
- "Practice Again" and "Back to Applications" buttons

### `JobPickerModal.tsx`

Modal shown when `/practice` has no `jobId`. Lists user's applied jobs:
- Job title + company + match score badge
- Sorted by match score descending
- Click → closes modal, starts session

### `api.ts` additions

```typescript
practice: {
  startSession: (body: { userId: string; jobId: string }) => Promise<StartPracticeResponse>
  sendMessage: (sessionId: string, body: { userId: string; content: string }) => Promise<InterviewTurn>
  completeSession: (sessionId: string, body: { userId: string }) => Promise<PracticeScorecard>
  getHistory: (sessionId: string) => Promise<PracticeHistoryResponse>
  getUserSessions: (userId: string) => Promise<PracticeSessionsResponse>
}
```

---

## Data Flow

```
User selects job (Applications or JobPickerModal)
  → POST /practice/sessions/start
  → Agent fetches job graph + user graph from Neo4j
  → Agent generates core_questions, builds system prompt
  → Returns opening_message (hiring manager persona, intro phase)
  → Practice.tsx renders PracticeChat with first AI message

User types answer → sends
  → POST /practice/sessions/{id}/message
  → Agent evaluates answer, decides follow-up or phase advance
  → Returns InterviewTurn { ai_response, persona, phase, phase_changed, coaching_hint }
  → Chat appends response, PhaseTimeline updates, Insight card updates

... conversation continues through 5 phases ...

AI signals closing phase complete
  → POST /practice/sessions/{id}/complete
  → Agent analyzes full history, scores all dimensions
  → Returns PracticeScorecard
  → PracticeScorecard overlay animates in on right panel
```

---

## Error Handling

- Session start failure → toast error, stay on job picker
- Message send failure → inline error in chat thread with "Retry" button
- Scorecard generation failure → "Unable to generate scorecard" fallback with raw session history link
- All backend errors follow existing pattern: `HTTPException` with `{"detail": "..."}` → frontend reads `error.detail`

---

## What Is NOT in Scope

- Voice/audio input — text only
- Real-time streaming responses — single async call per message (matches existing pattern)
- Recording/playback of sessions
- Sharing sessions with recruiters
- Multi-user/collaborative practice

---

## Files Modified

| File | Change |
|------|--------|
| `backend/database/sqlite_client.py` | Add 3 new table schemas |
| `backend/api/routes.py` | Mount practice router |
| `backend/main.py` | No changes needed |
| `frontend/src/lib/api.ts` | Add `practice` namespace |
| `frontend/src/pages/user/Practice.tsx` | Full refactor (keep layout) |
| `frontend/src/pages/user/Applications.tsx` | Add "Practice Interview" button per job |
