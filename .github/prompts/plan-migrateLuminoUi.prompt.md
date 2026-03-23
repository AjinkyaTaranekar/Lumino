# Comprehensive Migration Plan: Lumino UI to Vite Frontend 🚀

**Objective:** Completely overhaul the `frontend` Vite/React app by adopting the `lumino` Next.js design system. We will scrap or significantly upgrade the existing `frontend` UI to match `lumino` *exactly*. Next.js-specific routing will be adapted to React Router (`react-router-dom`), and all components will be rewritten in TypeScript (`.tsx`). Existing API integrations must be preserved and wired into the new designs, and any missing API endpoints for new Lumino features must be documented.

---

## 🏗️ Phase 1: Foundation Setup (Sequential)
*These tasks must be completed strictly in order to establish the base layer and plumbing for all subsequent UI work. No UI pages should be migrated until this phase is complete.*

### 1.1 TypeScript Integration & Tooling
*   **Action:** Upgrade Vite to handle TypeScript robustly.
*   **Files:** `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.js` (rename to `.ts`).
*   **Details:** Add `@types/react`, `@types/react-dom`, and `typescript`. Create a `tsconfig.json` with strict typing, `jsx: "react-jsx"`, and proper path aliases (e.g., `@/*` maps to `./src/*`). 
*   **Conversion:** Rename `src/main.jsx` -> `src/main.tsx` and `src/App.jsx` -> `src/App.tsx`.

### 1.2 Dependency & Design System Port
*   **Action:** Install UI runtime dependencies and port the styling configuration.
*   **Dependencies:** `npm install lucide-react motion recharts clsx tailwind-merge react-router-dom`
*   **Tailwind:** Copy design tokens, color palettes, and font configurations from `lumino/package.json` (or tailwind config) into `frontend/tailwind.config.js`. 
*   **Global CSS:** Overwrite `frontend/src/index.css` with the contents of `lumino/app/globals.css`. Ensure the `.css` imports work correctly with Vite.

### 1.3 Core Application Shell & Routing
*   **Action:** Port the navigation and layout wrappers.
*   **Components:** 
    *   Migrate `lumino/components/side-nav-bar.tsx` -> `frontend/src/components/SideNavBar.tsx`.
    *   Migrate `lumino/components/top-nav-bar.tsx` -> `frontend/src/components/TopNavBar.tsx`.
*   **Next.js Translations:** 
    *   Replace `import { Link } from 'next/link'` with `import { Link, NavLink } from 'react-router-dom'`. Change `href=` to `to=`.
    *   Replace `next/navigation`'s `usePathname` with `useLocation` from React Router.
*   **Layout Wrapper:** Create `frontend/src/components/LuminoLayout.tsx` that incorporates the TopNav, SideNav, and an `<Outlet />` for rendering nested page content.

### 1.4 Authentication Context
*   **Action:** Migrate role-based routing state.
*   **Details:** Bring over `lumino/lib/auth-context.tsx` to `frontend/src/context/AuthContext.tsx`. Meld it with existing logic in `frontend/src/context/AuthContext.jsx`. Ensure roles (`User`, `Recruiter`, `Admin`) align with the existing backend JWT/Session logic.

### 1.5 Shared Types & Mock APIs
*   **Action:** Migrate global TypeScript definitions and the mock API layer so the Lumino prototypes function out-of-the-box before real wiring happens.
*   **Details:** 
    *   Copy `lumino/lib/types.ts` to `frontend/src/lib/types.ts` (or `frontend/src/types.ts`) ensuring all interfaces (Job, Candidate, User, etc.) are globally accessible.
    *   Copy `lumino/lib/api.ts` and the `lumino/app/api/mock/` data. Integrate them into `frontend/src/lib/mockApi.ts` or closely merge them into your existing `frontend/src/lib/api.js` so that imported static components immediately have access to their mock shape.

---

## 🚀 Phase 2: Screen-by-Screen Migration (Parallel Tracks)
*Once Phase 1 is verified, these tracks can proceed concurrently. For each screen, follow the "Component Migration SOP" below.*

**Component Migration SOP (Standard Operating Procedure):**
1. Copy raw UI file from `lumino/app/.../page.tsx` to `frontend/src/pages/.../[Name].tsx`.
2. Remove Next.js directives (e.g., `'use client'`).
3. Swap Next.js routing patterns (`useRouter().push`) with React Router (`useNavigate()`).
4. **Data Wiring:** Investigate existing `frontend` pages for this feature. If there is an existing API call (e.g., `api.getJobs()`), wire that into a `useEffect` to replace the Lumino hardcoded mocks.
5. **Mock Documentation:** If Lumino has UI for data that *does not exist* in our API, leave the mock data in place but add a strict entry to `MISSING_APIS.md` detailing the required schema.

### Track A: Onboarding & Dashboards
*   **Login (`/login`):**
    *   *Source:* `lumino/app/login/page.tsx` -> *Target:* `frontend/src/pages/Login.tsx`
    *   *Logic:* Wire into existing `api.login()` from `frontend`. Ensure JWT setting works.
*   **User Dashboard (`/dashboard`):**
    *   *Source:* `lumino/app/dashboard/page.tsx` (User view) -> *Target:* `frontend/src/pages/user/Dashboard.tsx`
    *   *Logic:* Retrieve current user profile graph stats. Hook up "Recent Activity" if available. Document missing metrics.

### Track B: Recruiter Operations
*   **Talent Pool / Candidates (`/talent-pool`):**
    *   *Source:* `lumino/app/talent-pool/page.tsx` -> *Target:* `frontend/src/pages/recruiter/CandidatesBrowser.tsx`
    *   *Logic:* Replace `frontend/src/pages/recruiter/CandidatesBrowser.jsx`. Map existing user listing APIs into the new table/grid design.
*   **Job Listings (`/jobs`):**
    *   *Source:* `lumino/app/jobs/page.tsx` -> *Target:* `frontend/src/pages/recruiter/JobsList.tsx`
    *   *Logic:* Load jobs from backend. 
*   **Create Job (`/jobs/create` or similar):**
    *   *Source:* Lumino's job creation modal/page -> *Target:* `frontend/src/pages/recruiter/PostJob.tsx`.

### Track C: Applicant & User Features
*   **Applications (`/applications`):**
    *   *Source:* `lumino/app/applications/page.tsx` -> *Target:* `frontend/src/pages/user/Applications.tsx`.
    *   *Logic:* Fetch user's applied jobs. Document missing API if status tracking isn't supported yet.
*   **Resume/Upload (`/resume`):**
    *   *Source:* `lumino/app/resume/page.tsx` -> *Target:* `frontend/src/pages/user/ResumeManager.tsx`.
    *   *Logic:* Integrate existing PDF upload / ingestion pipelines from `frontend/src/pages/user/Upload.jsx`. Ensure the UI shows parsing states gracefully.
*   **Career Trajectory (`/trajectory`):**
    *   *Source:* `lumino/app/trajectory/page.tsx` -> *Target:* `frontend/src/pages/user/Trajectory.tsx`.
    *   *Logic:* This might lean heavily into our Neo4j graph data. Integrate existing Graph viewing components neatly within this new layout.
*   **Practice/Interviews (`/practice`):**
    *   *Source:* `lumino/app/practice/page.tsx` -> *Target:* `frontend/src/pages/user/Practice.tsx`. List missing APIs.

### Track D: Admin & Analytics
*   **Admin Console (`/admin`):**
    *   *Source:* `lumino/app/admin/page.tsx` -> *Target:* `frontend/src/pages/admin/AdminDashboard.tsx`.
*   **Analytics (`/analytics`):**
    *   *Source:* `lumino/app/analytics/page.tsx` -> *Target:* `frontend/src/pages/admin/Analytics.tsx`.
    *   *Logic:* Render `recharts`. Detail exact aggregated data queries needed in `MISSING_APIS.md`.

---

## 🧩 Phase 3: Componentization & Architecture Polish (Sequential)
*Perform this phase to reduce code duplication after the raw pages are moved over.*

1. **Extract UI Atoms:** lumino uses massive inline Tailwind blocks. Extract these repeatedly used patterns into `frontend/src/components/ui/`:
   * `StatCard.tsx` (For the quick metric blocks at the top of dashboards)
   * `SectionHeader.tsx` (For standard page titles with action buttons)
   * `Badge.tsx` (For status indicators like "Active", "Pending")
   * `DataTable.tsx` (If tables share identical structural classes)
2. **Refactor the Graph Components:** Our existing graph features (`GraphViewer.jsx`, `EditJobGraph.jsx`, `EditGraph.jsx`) are central to the app. Convert them to TypeScript and ensure their wrapper `div`s match Lumino's rounded, shadowed prism aesthetic.
3. **Compile the API Manifest:** Review all `MISSING_APIS.md` entries created by the developers in Phase 2. Aggregate them into clear JSON schemas (Requests/Responses) so the backend engineering team knows exactly what to build.

---

## 🧹 Phase 4: Legacy Cleanup & Final Validation
1. **Delete Old Code:** Purge all deprecated `.jsx` files in `frontend/src/pages/` that have been successfully superseded by their `.tsx` equivalents.
2. **Strict Type Check:** Run `npx tsc --noEmit` and resolve any missing prop types or implicit `any` definitions.
3. **E2E Flow Test:** 
   * Verify Login redirects to the correct Dashboard.
   * Verify User can upload a resume and transition to the 'Trajectory`/Graph view successfully.
   * Verify Recruiter can parse the Talent pool.
4. **Visual Regression:** Manually walk through the Vite app side-by-side with the Next.js `lumino` running app to assert 100% UI fidelity (fonts, shadows, layout shifts, animations).
