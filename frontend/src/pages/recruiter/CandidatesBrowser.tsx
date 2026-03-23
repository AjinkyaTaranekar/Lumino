import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import {
  Search, Filter, Briefcase, ArrowUpRight, RefreshCw, Plus, Users
} from 'lucide-react'

const REMOTE_COLORS: Record<string, string> = {
  remote: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  hybrid: 'bg-orange-50 text-orange-700 border-orange-100',
  onsite: 'bg-blue-50 text-blue-700 border-blue-100',
}

export default function CandidatesBrowser() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listJobs(session!.userId)
      setJobs(data)
      setFiltered(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      q
        ? jobs.filter(j => (j.title || j.id).toLowerCase().includes(q) || (j.company || '').toLowerCase().includes(q))
        : jobs
    )
  }, [search, jobs])

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-10 flex justify-between items-end max-w-7xl">
        <div>
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Talent Pool</h1>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl leading-relaxed">
            {loading ? 'Loading jobs…' : `${jobs.length} job posting${jobs.length !== 1 ? 's' : ''} — select one to rank candidates.`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/jobs/create')}
            className="bg-primary-500 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-primary-600 transition-all"
          >
            <Plus size={16} />
            Post Job
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="relative mb-8 max-w-7xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Search by job title or company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-14 pl-12 pr-4 rounded-2xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-300 transition-all font-medium"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{error}</div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-20 bg-white rounded-3xl shadow-prism border border-slate-100">
          <Briefcase size={48} className="mx-auto mb-4 text-slate-300" />
          <h3 className="text-xl font-bold text-indigo-950 mb-2">
            {search ? 'No jobs match your search' : 'No jobs posted yet'}
          </h3>
          <p className="text-slate-500 mb-6">
            {search ? 'Try a different search term.' : 'Post a job to start finding candidates.'}
          </p>
          {!search && (
            <button
              onClick={() => navigate('/jobs/create')}
              className="bg-primary-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-600 transition-all"
            >
              Post First Job
            </button>
          )}
        </div>
      )}

      {/* Job Grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-7xl">
          {filtered.map((job: any) => (
            <div
              key={job.id}
              className="bg-white rounded-3xl shadow-prism border border-slate-100 p-6 flex gap-6 group cursor-pointer hover:border-primary-200 transition-all"
              onClick={() => navigate(`/recruiter/candidates/${job.id}`)}
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-950 flex items-center justify-center text-white font-black text-2xl shadow-lg flex-shrink-0">
                {(job.title || job.id)[0]?.toUpperCase() || 'J'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-lg font-bold text-indigo-950 group-hover:text-primary-500 transition-colors truncate">
                    {job.title || job.id}
                  </h3>
                  {job.remote_policy && (
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ml-2 flex-shrink-0 ${REMOTE_COLORS[job.remote_policy] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                      {job.remote_policy}
                    </span>
                  )}
                </div>
                {job.company && (
                  <p className="text-sm font-medium text-slate-500 mb-4">{job.company}</p>
                )}

                <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-500">Click to rank candidates</span>
                  </div>
                  <span className="text-sm font-bold text-primary-500 flex items-center gap-1 hover:underline">
                    View Candidates <ArrowUpRight size={14} />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Banner */}
      {jobs.length > 0 && (
        <div className="mt-12 bg-indigo-950 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-8 max-w-7xl relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-2">AI-Powered Candidate Ranking</h2>
            <p className="text-indigo-200 max-w-xl">
              Lumino's graph engine scores candidates against your job requirements across skills, domain expertise, and work-style preferences.
            </p>
          </div>
          <button
            onClick={() => navigate('/jobs')}
            className="relative z-10 bg-white text-indigo-950 px-8 py-4 rounded-xl font-bold hover:bg-slate-100 transition-all shadow-xl flex-shrink-0"
          >
            Browse All Jobs
          </button>
        </div>
      )}
    </div>
  )
}
