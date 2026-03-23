import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import {
  Briefcase, Globe, Users, Plus, RefreshCw,
  ArrowRight, BookmarkPlus, AlertCircle
} from 'lucide-react'

const REMOTE_BADGE: Record<string, string> = {
  remote: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  hybrid: 'bg-orange-50 text-orange-700 border border-orange-200',
  onsite: 'bg-blue-50 text-blue-700 border border-blue-200',
}

export default function JobsList() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const isRecruiter = session?.role === 'recruiter'

  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Recruiters see their own jobs; seekers see all jobs
      const data = await api.listJobs(isRecruiter ? session!.userId : undefined)
      setJobs(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">
            {isRecruiter ? 'Your Job Postings' : 'Browse Jobs'}
          </h1>
          <p className="mt-3 text-lg text-slate-500 leading-relaxed">
            {loading ? 'Loading…' : `${jobs.length} position${jobs.length !== 1 ? 's' : ''} available`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {isRecruiter && (
            <Link
              to="/jobs/create"
              className="bg-primary-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-primary-600 transition-all"
            >
              <Plus size={18} /> Post a Job
            </Link>
          )}
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm mb-6">
          <AlertCircle size={15} />
          {error}
          <button onClick={load} className="ml-auto font-bold hover:underline">Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8 animate-pulse">
              <div className="flex gap-6">
                <div className="w-20 h-20 rounded-2xl bg-slate-100" />
                <div className="flex-1 space-y-3">
                  <div className="h-6 bg-slate-100 rounded w-1/3" />
                  <div className="h-4 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && jobs.length === 0 && (
        <div className="text-center py-20 bg-white rounded-3xl shadow-prism border border-slate-100">
          <Briefcase size={48} className="mx-auto mb-4 text-slate-300" />
          <h3 className="text-xl font-bold text-indigo-950 mb-2">No jobs available</h3>
          <p className="text-slate-500 mb-6">
            {isRecruiter ? 'Post your first job opening to get started.' : 'Check back later for new opportunities.'}
          </p>
          {isRecruiter && (
            <Link to="/jobs/create" className="inline-flex items-center gap-2 bg-primary-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-600 transition-all">
              Post a Job
            </Link>
          )}
        </div>
      )}

      {/* Job list */}
      {!loading && jobs.length > 0 && (
        <div className="space-y-6">
          {jobs.map((job: any) => (
            <div
              key={job.id}
              className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8 hover:border-primary-200 transition-all group"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="flex items-start gap-6">
                  <div className="w-20 h-20 rounded-2xl bg-indigo-950 flex items-center justify-center text-white font-black text-3xl shadow-xl flex-shrink-0">
                    {(job.title || job.id)[0]?.toUpperCase() || 'J'}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-indigo-950 group-hover:text-primary-500 transition-colors font-display">
                      {job.title || job.id}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-slate-500 font-medium text-sm">
                      {job.company && (
                        <span className="flex items-center gap-1.5">
                          <Briefcase size={14} /> {job.company}
                        </span>
                      )}
                      {job.remote_policy && (
                        <span className="flex items-center gap-1.5">
                          <Globe size={14} /> {job.remote_policy}
                        </span>
                      )}
                    </div>
                    {job.remote_policy && (
                      <span className={`inline-block mt-3 text-xs font-bold uppercase px-3 py-1 rounded-full ${REMOTE_BADGE[job.remote_policy] || 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                        {job.remote_policy}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 flex-shrink-0">
                  {isRecruiter ? (
                    <>
                      <button
                        onClick={() => navigate(`/recruiter/candidates/${job.id}`)}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-primary-500 text-white shadow-lg hover:bg-primary-600 transition-all"
                      >
                        <Users size={18} /> Find Candidates
                      </button>
                      <button
                        onClick={() => navigate(`/recruiter/model/${job.id}`)}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                      >
                        View Model
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => navigate(`/user/match/${job.id}`)}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-primary-500 text-white shadow-lg hover:bg-primary-600 transition-all"
                    >
                      Check Match <ArrowRight size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
