import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import {
  TrendingUp, Briefcase, Sparkles, AlertCircle, RefreshCw,
  Users, BarChart3, ArrowRight, Upload, Network
} from 'lucide-react'

// ---- Seeker Dashboard ----
function SeekerDashboard() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<any[]>([])
  const [matches, setMatches] = useState<any[] | null>(null)
  const [stats, setStats] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listJobs().then(setJobs).catch(() => {})
    api.getUserStats(session!.userId)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false))
  }, [session])

  async function handleRecommend() {
    setError(null)
    setLoading(true)
    try {
      const data = await api.getMatches(session!.userId)
      setMatches(data.results)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">
          Welcome back, {session?.userId} 👋
        </h1>
        <p className="mt-3 text-lg text-slate-500 leading-relaxed">
          {matches
            ? `${matches.length} jobs ranked for your profile`
            : `${jobs.length} available positions in the database`}
        </p>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Profile Nodes</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-black text-indigo-950">{statsLoading ? '—' : (stats?.nodes ?? 0)}</span>
            <span className="text-slate-400 font-bold text-sm mb-1">in graph</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Skills Mapped</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-black text-indigo-950">{statsLoading ? '—' : (stats?.skills ?? 0)}</span>
            <span className="text-primary-500 font-bold text-sm mb-1">extracted</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Available Jobs</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-black text-indigo-950">{jobs.length}</span>
            <span className="text-slate-400 font-bold text-sm mb-1">open roles</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm mb-6">
          <AlertCircle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Matches / Jobs */}
        <div className="bg-white rounded-2xl shadow-prism border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h2 className="text-xl font-bold text-indigo-950">
              {matches ? 'Ranked Matches' : 'Available Positions'}
            </h2>
            <button
              onClick={handleRecommend}
              disabled={loading}
              className="flex items-center gap-2 text-sm font-bold text-primary-500 hover:underline disabled:opacity-50"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? 'Ranking…' : 'Get Recommendations'}
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {matches ? (
              matches.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">No matches found.</p>
              ) : (
                matches.slice(0, 5).map((r: any, i: number) => (
                  <div
                    key={r.job_id}
                    className="p-6 hover:bg-slate-50 transition-colors cursor-pointer flex justify-between items-center"
                    onClick={() => navigate(`/user/match/${r.job_id}`)}
                  >
                    <div>
                      <h3 className="font-bold text-indigo-950">{r.job_title || r.job_id}</h3>
                      <p className="text-sm text-slate-500">{r.company || 'Position'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-primary-500">{r.total_score}%</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black">Match</p>
                    </div>
                  </div>
                ))
              )
            ) : (
              jobs.length === 0 ? (
                <div className="p-6 text-center">
                  <Briefcase size={36} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-sm text-slate-400">No jobs posted yet.</p>
                </div>
              ) : (
                jobs.slice(0, 5).map((j: any) => (
                  <div key={j.id} className="p-6 hover:bg-slate-50 transition-colors cursor-pointer flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-indigo-950">{j.title || j.id}</h3>
                      <p className="text-sm text-slate-500">{j.company || ''}</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase py-1 px-2 bg-slate-50 text-slate-500 rounded-full border border-slate-200">
                      {j.remote_policy || 'Open'}
                    </span>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* CTA Panel */}
        <div className="bg-indigo-950 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-4">Ready to find your best match?</h2>
            <p className="text-indigo-200 mb-8 max-w-xs">
              Upload your resume so Lumino can build your knowledge graph and rank the best opportunities for you.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                to="/resume"
                className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg"
              >
                <Upload size={18} /> Upload Resume
              </Link>
              <Link
                to="/model"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-bold transition-all border border-white/20"
              >
                <Network size={18} /> View Knowledge Graph
              </Link>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 opacity-10">
            <TrendingUp size={200} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Recruiter Dashboard ----
function RecruiterDashboard() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.listJobs(session!.userId).then(setJobs).catch(() => {}),
      api.listUsers().then(setUsers).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [session])

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Recruiter Portal</h1>
        <p className="mt-3 text-lg text-slate-500 leading-relaxed">
          Managing {jobs.length} active job{jobs.length !== 1 ? 's' : ''} across your pipeline.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Total Candidates</h3>
          <span className="text-4xl font-black text-indigo-950">{loading ? '—' : users.length}</span>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Active Jobs</h3>
          <span className="text-4xl font-black text-primary-500">{loading ? '—' : jobs.length}</span>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Talent Pool</h3>
          <span className="text-4xl font-black text-indigo-950">{loading ? '—' : users.length}</span>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Graph Matches</h3>
          <span className="text-4xl font-black text-indigo-950">AI</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-prism border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-xl font-bold text-indigo-950">Active Openings</h2>
          <Link to="/jobs/create" className="text-sm font-bold text-primary-500 hover:underline">+ Post New Job</Link>
        </div>
        <div className="divide-y divide-slate-50">
          {loading ? (
            <p className="p-6 text-sm text-slate-400">Loading…</p>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center">
              <Briefcase size={36} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-400 mb-4">No jobs posted yet.</p>
              <Link to="/jobs/create" className="inline-flex items-center gap-2 bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-bold">
                Post a Job
              </Link>
            </div>
          ) : (
            jobs.map((job: any) => (
              <div
                key={job.id}
                className="p-6 hover:bg-slate-50 transition-colors cursor-pointer flex justify-between items-center"
                onClick={() => navigate(`/recruiter/candidates/${job.id}`)}
              >
                <div>
                  <h3 className="font-bold text-indigo-950">{job.title || job.id}</h3>
                  <p className="text-sm text-slate-500">{job.company || 'Your Company'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-primary-500 flex items-center gap-1">
                    <Users size={14} /> Find Candidates
                  </span>
                  <ArrowRight size={16} className="text-slate-400" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Admin Dashboard ----
function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.listUsers().then(setUsers).catch(() => {}),
      api.listJobs().then(setJobs).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">System Administration</h1>
        <p className="mt-3 text-lg text-slate-500 leading-relaxed">Global system health and user management.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Registered Users</h3>
          <span className="text-4xl font-black text-indigo-950">{loading ? '—' : users.length}</span>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Active Jobs</h3>
          <span className="text-4xl font-black text-primary-500">{loading ? '—' : jobs.length}</span>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">System Status</h3>
          <span className="text-4xl font-black text-emerald-500">Live</span>
        </div>
      </div>

      <div className="flex gap-4">
        <Link to="/admin" className="bg-primary-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-600 transition-all flex items-center gap-2">
          <Users size={18} /> Manage Users &amp; Jobs
        </Link>
        <Link to="/analytics" className="bg-white text-indigo-950 border border-slate-200 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-2">
          <BarChart3 size={18} /> Workspace Settings
        </Link>
      </div>
    </div>
  )
}

// ---- Main export (role-based) ----
export default function Dashboard() {
  const { session } = useAuth()

  if (session?.role === 'recruiter') return <RecruiterDashboard />
  if (session?.role === 'admin') return <AdminDashboard />
  return <SeekerDashboard />
}
