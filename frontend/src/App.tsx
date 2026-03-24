import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import LuminoLayout from './components/LuminoLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { isOnboardingComplete } from './lib/onboarding';

/** Redirects to a path with route params interpolated (e.g. "/jobs/:jobId/model") */
function RedirectWithParams({ to }: { to: string }) {
  const params = useParams<Record<string, string>>();
  const target = to.replace(/:(\w+)/g, (_, key) => params[key] ?? key);
  return <Navigate to={target} replace />;
}

/** Redirects to /dashboard if the user has already completed onboarding */
function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'USER' && isOnboardingComplete(user.id)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────
const Login = lazy(() => import('./pages/Login'));

// User pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Onboarding = lazy(() => import('./pages/user/Onboarding'));
const ResumeManager = lazy(() => import('./pages/user/ResumeManager'));
const Trajectory = lazy(() => import('./pages/user/Trajectory'));
const Applications = lazy(() => import('./pages/user/Applications'));
const Practice = lazy(() => import('./pages/user/Practice'));
const UserModel = lazy(() => import('./pages/user/UserModel'));
const EditGraph = lazy(() => import('./pages/user/EditGraph'));
const Clarification = lazy(() => import('./pages/user/Clarification'));
const UserProfile = lazy(() => import('./pages/user/UserProfile'));
const MatchExplorer = lazy(() => import('./pages/user/MatchExplorer'));
const Guidelines = lazy(() => import('./pages/user/Guidelines'));

// Recruiter pages
const CandidatesBrowser = lazy(() => import('./pages/recruiter/CandidatesBrowser'));
const Candidates = lazy(() => import('./pages/recruiter/Candidates'));
const PostJob = lazy(() => import('./pages/recruiter/PostJob'));
const JobModel = lazy(() => import('./pages/recruiter/JobModel'));
const EditJobGraph = lazy(() => import('./pages/recruiter/EditJobGraph'));
const JobsList = lazy(() => import('./pages/recruiter/JobsList'));

// Admin pages
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));

// Loading fallback
function PageLoader() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="spinner" aria-hidden="true" />
        <p className="text-sm text-slate-500 font-medium">Loading…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* User onboarding (no layout, no sidebar) */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute role="USER" skipOnboardingGate>
              <OnboardingRoute>
                <Onboarding />
              </OnboardingRoute>
            </ProtectedRoute>
          }
        />

        {/* Shared dashboard (role-aware) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <LuminoLayout>
                <Dashboard />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />

        {/* ── User (seeker) routes ── */}
        <Route
          path="/resume"
          element={
            <ProtectedRoute role="USER">
              <LuminoLayout>
                <ResumeManager />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trajectory"
          element={
            <ProtectedRoute role="USER">
              <LuminoLayout>
                <Trajectory />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications"
          element={
            <ProtectedRoute role="USER">
              <LuminoLayout>
                <Applications />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/practice"
          element={
            <ProtectedRoute role="USER">
              <LuminoLayout>
                <Practice />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/model"
          element={
            <ProtectedRoute role="USER">
              <LuminoLayout>
                <UserModel />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/edit-graph"
          element={
            <ProtectedRoute role="USER">
              <LuminoLayout>
                <EditGraph />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/clarifications"
          element={
            <ProtectedRoute role="USER">
              <LuminoLayout>
                <Clarification />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/profile"
          element={
            <ProtectedRoute role="USER">
              <LuminoLayout>
                <UserProfile />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/guidelines"
          element={
            <ProtectedRoute role="USER">
              <LuminoLayout>
                <Guidelines />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        {/* Match explorer - accessible by USER and RECRUITER */}
        <Route
          path="/user/match/:jobId"
          element={
            <ProtectedRoute role={['USER', 'RECRUITER']}>
              <LuminoLayout showSidebar={false}>
                <MatchExplorer />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />

        {/* ── Legacy redirects for old user routes ── */}
        <Route path="/user/upload" element={<Navigate to="/resume" replace />} />
        <Route path="/user/dashboard" element={<Navigate to="/dashboard" replace />} />

        {/* ── Recruiter routes ── */}
        <Route
          path="/talent-pool"
          element={
            <ProtectedRoute role="RECRUITER">
              <LuminoLayout>
                <CandidatesBrowser />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/talent-pool/:jobId"
          element={
            <ProtectedRoute role="RECRUITER">
              <LuminoLayout>
                <Candidates />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs"
          element={
            <ProtectedRoute role="RECRUITER">
              <LuminoLayout>
                <JobsList />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/create"
          element={
            <ProtectedRoute role="RECRUITER">
              <LuminoLayout>
                <PostJob />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/:jobId/model"
          element={
            <ProtectedRoute role="RECRUITER">
              <LuminoLayout>
                <JobModel />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/:jobId/edit"
          element={
            <ProtectedRoute role="RECRUITER">
              <LuminoLayout>
                <EditJobGraph />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />

        {/* ── Legacy recruiter redirects ── */}
        <Route path="/recruiter/post" element={<Navigate to="/jobs/create" replace />} />
        <Route path="/recruiter/candidates" element={<Navigate to="/talent-pool" replace />} />
        <Route path="/recruiter/candidates/:jobId" element={<RedirectWithParams to="/talent-pool/:jobId" />} />
        <Route path="/recruiter/model/:jobId" element={<RedirectWithParams to="/jobs/:jobId/model" />} />
        <Route path="/recruiter/edit-job/:jobId" element={<RedirectWithParams to="/jobs/:jobId/edit" />} />

        {/* ── Admin routes ── */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="ADMIN">
              <LuminoLayout>
                <AdminDashboard />
              </LuminoLayout>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
