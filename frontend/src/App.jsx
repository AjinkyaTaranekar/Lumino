import { Routes, Route, Navigate } from 'react-router-dom'
import LuminoLayout from './components/LuminoLayout'
import ProtectedRoute from './components/ProtectedRoute'

// Auth
import Login from './pages/Login'

// New Lumino pages
import Dashboard from './pages/user/Dashboard'
import Applications from './pages/user/Applications'
import ResumeManager from './pages/user/ResumeManager'
import Trajectory from './pages/user/Trajectory'
import Practice from './pages/user/Practice'
import JobsList from './pages/recruiter/JobsList'
import CandidatesBrowser from './pages/recruiter/CandidatesBrowser'
import PostJob from './pages/recruiter/PostJob'
import AdminDashboard from './pages/admin/AdminDashboard'
import Analytics from './pages/admin/Analytics'

// Existing pages (layout-stripped, still used)
import Guidelines from './pages/user/Guidelines'
import UserModel from './pages/user/UserModel'
import MatchExplorer from './pages/user/MatchExplorer'
import EditGraph from './pages/user/EditGraph'
import Clarification from './pages/user/Clarification'
import UserProfile from './pages/user/UserProfile'
import JobModel from './pages/recruiter/JobModel'
import Candidates from './pages/recruiter/Candidates'
import EditJobGraph from './pages/recruiter/EditJobGraph'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* All authenticated routes share the LuminoLayout shell */}
      <Route element={<LuminoLayout />}>
        {/* ---- Shared ---- */}
        <Route path="/dashboard"
          element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/jobs"
          element={<ProtectedRoute><JobsList /></ProtectedRoute>} />

        {/* ---- Seeker ---- */}
        <Route path="/applications"
          element={<ProtectedRoute role="seeker"><Applications /></ProtectedRoute>} />
        <Route path="/resume"
          element={<ProtectedRoute role="seeker"><ResumeManager /></ProtectedRoute>} />
        <Route path="/trajectory"
          element={<ProtectedRoute role="seeker"><Trajectory /></ProtectedRoute>} />
        <Route path="/practice"
          element={<ProtectedRoute role="seeker"><Practice /></ProtectedRoute>} />
        <Route path="/model"
          element={<ProtectedRoute role="seeker"><UserModel /></ProtectedRoute>} />
        <Route path="/network"
          element={<ProtectedRoute role="seeker"><UserProfile /></ProtectedRoute>} />

        {/* ---- Recruiter ---- */}
        <Route path="/talent-pool"
          element={<ProtectedRoute role="recruiter"><CandidatesBrowser /></ProtectedRoute>} />
        <Route path="/jobs/create"
          element={<ProtectedRoute role="recruiter"><PostJob /></ProtectedRoute>} />

        {/* ---- Admin ---- */}
        <Route path="/admin"
          element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/analytics"
          element={<ProtectedRoute role={['recruiter', 'admin']}><Analytics /></ProtectedRoute>} />

        {/* ---- Preserved deep routes ---- */}
        <Route path="/user/guidelines"
          element={<ProtectedRoute role="seeker"><Guidelines /></ProtectedRoute>} />
        <Route path="/user/match/:jobId"
          element={<ProtectedRoute role={['seeker', 'recruiter']}><MatchExplorer /></ProtectedRoute>} />
        <Route path="/user/edit-graph"
          element={<ProtectedRoute role="seeker"><EditGraph /></ProtectedRoute>} />
        <Route path="/user/clarifications"
          element={<ProtectedRoute role="seeker"><Clarification /></ProtectedRoute>} />
        <Route path="/user/profile"
          element={<ProtectedRoute role="seeker"><UserProfile /></ProtectedRoute>} />
        <Route path="/recruiter/candidates/:jobId"
          element={<ProtectedRoute role="recruiter"><Candidates /></ProtectedRoute>} />
        <Route path="/recruiter/model/:jobId"
          element={<ProtectedRoute role="recruiter"><JobModel /></ProtectedRoute>} />
        <Route path="/recruiter/edit-job/:jobId"
          element={<ProtectedRoute role="recruiter"><EditJobGraph /></ProtectedRoute>} />

        {/* ---- Redirects from old URLs to new ---- */}
        <Route path="/user/upload"          element={<Navigate to="/resume" replace />} />
        <Route path="/user/dashboard"       element={<Navigate to="/dashboard" replace />} />
        <Route path="/user/model"           element={<Navigate to="/model" replace />} />
        <Route path="/recruiter/post"       element={<Navigate to="/jobs/create" replace />} />
        <Route path="/recruiter/candidates" element={<Navigate to="/talent-pool" replace />} />
        <Route path="/admin/analytics"      element={<Navigate to="/analytics" replace />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
