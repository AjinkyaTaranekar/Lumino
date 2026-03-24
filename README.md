# Lumino - Graph-Based Job Matching

A transparent, graph-based job matching platform where every match decision is fully explainable. Unlike black-box vector similarity or opaque ML models, every match score traces back to explicit paths in a Neo4j knowledge graph - no magic numbers.

---

## How It Works

**For Job Seekers**
1. Upload a resume (PDF or paste text)
2. An LLM (Gemini, Groq, OpenAI, etc.) extracts skills, domains, projects, experiences, and work preferences as structured JSON
3. The extracted entities are written into a personal knowledge graph in Neo4j (4-level hierarchy: User → Category → Family → Leaf)
4. Browse all job listings ranked by match score, with full breakdowns of what matched and what didn't
5. Refine your profile interactively via the graph editor or the clarification interview

**For Recruiters**
1. Post a job (PDF or paste text) - LLM extracts skill requirements, domain requirements, work styles, and company culture
2. Browse "Find Candidates" to see all job seekers ranked against your specific job
3. Explore the combined graph view for any candidate to see exactly why they matched

**Matching Engine**
- **Skills (65%)** - weighted intersection via `MATCHES` edges; importance-weighted (`must_have=1.0`, `nice_to_have=0.5`); seniority factor applied when years of experience is specified
- **Domain (35%)** - set intersection of domain expertise vs. job domain requirements
- **Culture bonus** - ratio of job work styles that match user preferences
- **Human depth bonus** - motivation, values, behavioural insights, and cultural identity layers
- Every score traces back to explicit graph paths: `User → HAS_SKILL → Python → MATCHES → JobSkillRequirement`

---

## Tech Stack

| Layer | Technology |
|---|---|
| **LLM (extraction)** | LiteLLM wrapper - supports Gemini, Groq, OpenAI, Anthropic, Ollama |
| **Graph DB** | Neo4j AuraDB (cloud) |
| **Backend** | FastAPI + Uvicorn (Python 3.11+) |
| **Frontend** | React 18 + TypeScript + Vite 5 + TailwindCSS + React Router v6 |
| **Graph viz** | pyvis + NetworkX (self-contained inline HTML) |
| **PDF parsing** | pypdf |
| **Data validation** | Pydantic v2 |
| **Supplementary DB** | SQLite (checkpoints, flags, mutations) |
| **Icons** | lucide-react |
| **Charts** | recharts |

---

## Project Structure

```
Lumino/
├── backend/
│   ├── main.py                     # FastAPI entry point (port 8000)
│   ├── requirements.txt
│   ├── .env.example
│   ├── api/
│   │   └── routes.py               # All API endpoints
│   ├── database/
│   │   ├── neo4j_client.py         # Async Neo4j driver singleton
│   │   └── sqlite_client.py        # SQLite for flags, checkpoints, mutations
│   ├── models/
│   │   ├── schemas.py              # Pydantic models
│   │   └── taxonomies.py           # Node labels, relationship types, match weights
│   ├── services/
│   │   ├── ingestion.py            # Orchestrates extraction → Neo4j pipeline
│   │   ├── llm_extraction.py       # LiteLLM structured JSON extraction
│   │   ├── llm_ingestion.py        # Writes extracted entities to Neo4j
│   │   ├── matching_engine.py      # Pure Cypher-based scoring + path tracing
│   │   ├── visualization.py        # pyvis graph generators
│   │   ├── checkpoint_service.py   # Graph version snapshots
│   │   ├── clarification_service.py
│   │   ├── graph_edit_service.py
│   │   └── llm_edit_agent.py       # Sincere interviewer persona
│   └── outputs/                    # Generated pyvis HTML (gitignored)
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── user/               # Job Seeker views
        │   │   ├── Onboarding.tsx
        │   │   ├── ResumeManager.tsx
        │   │   ├── UserModel.tsx   # Personal knowledge graph viewer
        │   │   ├── MatchExplorer.tsx
        │   │   ├── EditGraph.tsx
        │   │   └── Clarification.tsx
        │   ├── recruiter/          # Recruiter views
        │   │   ├── PostJob.tsx
        │   │   ├── JobModel.tsx
        │   │   ├── JobsList.tsx
        │   │   ├── CandidatesBrowser.tsx
        │   │   └── Candidates.tsx
        │   └── admin/
        │       └── AdminDashboard.tsx
        ├── components/
        │   ├── LuminoLayout.tsx
        │   ├── GraphViewer.tsx     # iframe wrapper for pyvis HTML
        │   ├── MutationDiffCard.tsx
        │   └── VersionHistory.tsx
        ├── context/AuthContext.tsx
        └── lib/
            ├── api.ts              # Typed API client
            └── types.ts
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Neo4j AuraDB instance (cloud) - [create one free at neo4j.com/cloud/aura](https://neo4j.com/cloud/aura)
- An API key for your chosen LLM provider (Gemini recommended - free tier at [aistudio.google.com](https://aistudio.google.com))

> **TCD WiFi Note:** Neo4j AuraDB (and self-hosted Neo4j over Bolt) **will not connect on TCD campus WiFi** due to port restrictions. Use a mobile hotspot or a VPN.

---

### 1. Clone and configure

```bash
git clone <repo-url>
cd Lumino

cp backend/.env.example backend/.env
# Edit backend/.env - see Environment Variables section below
```

### 2. Start the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

python main.py
# API:          http://localhost:8000
# Swagger docs: http://localhost:8000/docs
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

---

## Environment Variables

Create `backend/.env` from the provided example:

```env
# Neo4j AuraDB - get these from your Aura console (Connection details tab)
NEO4J_URI=neo4j+s://<your-aura-instance-id>.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-aura-password-here

# LLM provider - LiteLLM format: "provider/model"
# Options:
#   gemini/gemini-2.0-flash        (free tier - recommended)
#   gemini/gemini-2.5-pro
#   groq/llama-3.3-70b-versatile   (free tier)
#   openai/gpt-4o
#   anthropic/claude-sonnet-4-6
#   ollama/llama3                  (local)
LLM_MODEL=gemini/gemini-2.0-flash

# Set the key for whichever provider you chose above
GEMINI_API_KEY=your-gemini-api-key-here
# GROQ_API_KEY=your-groq-api-key-here
# OPENAI_API_KEY=your-openai-api-key-here
# ANTHROPIC_API_KEY=your-anthropic-api-key-here

# App
APP_HOST=0.0.0.0
APP_PORT=8000
OUTPUT_DIR=./outputs
```

---

## API Reference

Full interactive docs at `http://localhost:8000/docs`.

### Ingestion

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/users/ingest` | Ingest user profile from text |
| `POST` | `/users/upload` | Ingest user profile from PDF |
| `POST` | `/jobs/ingest` | Ingest job posting from text |
| `POST` | `/jobs/upload` | Ingest job posting from PDF |

### Matching & Scoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users/{user_id}/matches` | Rank all jobs for a user |
| `GET` | `/users/{user_id}/matches/{job_id}` | Detailed score for a specific pair |
| `GET` | `/users/{user_id}/matches/{job_id}/paths` | Explicit graph paths (full scrutability) |
| `GET` | `/jobs/{job_id}/matches` | Rank all candidates for a job |
| `POST` | `/users/{user_id}/matches/{job_id}/explain` | Score breakdown with insights |

### Visualization

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/users/{user_id}/visualize` | Generate user knowledge graph |
| `GET` | `/users/{user_id}/visualize` | Serve user graph HTML |
| `POST` | `/jobs/{job_id}/visualize` | Generate job requirement graph |
| `GET` | `/jobs/{job_id}/visualize` | Serve job graph HTML |
| `POST` | `/users/{user_id}/matches/{job_id}/visualize` | Generate combined match graph |
| `GET` | `/users/{user_id}/matches/{job_id}/visualize` | Serve match graph HTML |

### Graph Editing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/users/{user_id}/start-edit` | Start an interactive edit session |
| `POST` | `/users/{user_id}/edit-session/message` | Chat with the LLM interviewer |
| `POST` | `/users/{user_id}/propose-mutations` | Propose graph mutations |
| `POST` | `/users/{user_id}/apply-mutations` | Apply approved mutations |
| `POST` | `/users/{user_id}/reject-mutations` | Reject proposed mutations |
| `POST` | `/users/{user_id}/save-checkpoint` | Snapshot the current graph state |
| `GET` | `/users/{user_id}/checkpoints` | List saved graph versions |

### Clarification

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/users/{user_id}/clarifications` | Generate clarification questions |
| `POST` | `/users/{user_id}/resolve-flag` | Resolve an interpretation flag |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users` | List all users |
| `GET` | `/jobs` | List all jobs (filter: `?recruiter_id=`) |
| `GET` | `/users/{user_id}/graph-stats` | Node and relationship counts |
| `GET` | `/users/{user_id}/completeness` | Profile depth score |
| `DELETE` | `/users/{user_id}` | Delete user and all their data |
| `DELETE` | `/jobs/{job_id}` | Delete job and all its data |
| `GET` | `/health` | Neo4j connectivity check |

---

## Graph Schema

```
User
 └─HAS_SKILL_CATEGORY─► SkillCategory
      └─HAS_SKILL_FAMILY─► SkillFamily
           └─HAS_SKILL─► Skill ──MATCHES──► JobSkillRequirement

User
 └─HAS_DOMAIN_CATEGORY─► DomainCategory
      └─HAS_DOMAIN_FAMILY─► DomainFamily
           └─HAS_DOMAIN─► Domain ──MATCHES──► JobDomainRequirement

User └─HAS_PREFERENCE_CATEGORY─► PreferenceCategory └─HAS_PREFERENCE─► Preference
User └─HAS_PROJECT_CATEGORY─► ProjectCategory └─HAS_PROJECT─► Project
User └─HAS_EXPERIENCE_CATEGORY─► ExperienceCategory └─HAS_EXPERIENCE─► Experience

# Human Depth Layer (Layer 2)
User └─HAS_MOTIVATION─► Motivation
User └─HAS_VALUE─► Value
User └─HAS_GOAL─► Goal
User └─HAS_ANECDOTE─► Anecdote
User └─HAS_CULTURE_IDENTITY─► CultureIdentity
User └─HAS_BEHAVIORAL_INSIGHT─► BehavioralInsight

Job
 └─HAS_SKILL_REQUIREMENTS─► JobSkillRequirements
      └─HAS_SKILL_FAMILY_REQ─► JobSkillFamily
           └─REQUIRES_SKILL─► JobSkillRequirement

Job └─HAS_DOMAIN_REQUIREMENTS─► JobDomainRequirements └─...─► JobDomainRequirement
Job └─HAS_CULTURE_REQUIREMENTS─► JobCultureRequirements └─HAS_WORK_STYLE─► WorkStyle
```

---

## Key Design Decisions

**No vectors, no black boxes.** Matching is 100% graph traversal. `MATCHES` edges connect user skill/domain nodes directly to job requirement nodes. Every score component is a Cypher query result, not an embedding similarity.

**LLM as extractor only.** The LLM is used exclusively to parse free-text resumes and job postings into structured JSON. All matching logic is deterministic Cypher - the LLM never touches scoring.

**Two-layer candidate depth.** Layer 1 captures technical profile (skills, domains, projects, experience). Layer 2 captures human depth (motivations, values, goals, anecdotes, cultural identity, behavioural insights) - used for culture-fit and human-layer match bonuses.

**Sincere interviewer persona.** The graph edit agent uses a deeply curious, non-transactional interview style to surface the human depth layer - not a form, but a conversation.

**Self-contained visualizations.** pyvis graphs embed the entire vis.js bundle inline - fully portable HTML with no external dependencies.

**Recruiter scoping.** Each job is tagged with the `recruiter_id` of who posted it. Recruiters only see their own listings.

---

## Roles

| Role | Access |
|------|--------|
| **Job Seeker** | Upload resume, view knowledge graph, browse & explore job matches, edit profile, clarification interview |
| **Recruiter** | Post jobs, browse & rank candidates, explore match graphs, edit job graphs |
| **Admin** | System stats, manage users and jobs |

> Authentication is session-based (localStorage) for demo purposes. No passwords - enter any ID and select a role.
