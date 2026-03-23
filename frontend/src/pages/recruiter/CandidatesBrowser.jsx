import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import { Users, Briefcase, RefreshCw, ArrowRight } from 'lucide-react'

function remoteBadgeClass(policy) {
  switch (policy) {
    case 'remote': return 'badge badge-green'
    case 'hybrid': return 'badge badge-orange'
    case 'onsite': return 'badge badge-blue'
    default:       return 'badge badge-gray'
  }
}

export default function CandidatesBrowser() {
  const { session } = useAuth()
  const navigate    = useNavigate()

  const [jobs, setJobs]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listJobs(session.userId)
      setJobs(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <Layout>
      <div className="px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Find Candidates</h1>
            <p className="text-sm text-content-secondary mt-1">
              Select a job to rank matching candidate profiles
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary btn-sm flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="alert-error mb-6">{error}</div>
        )}

        {/* Loading */}
        {loading && !jobs && (
          <div className="flex items-center justify-center py-16 gap-3 text-content-muted">
            <span className="spinner-sm" />
            <span className="text-sm">Loading jobs…</span>
          </div>
        )}

        {/* Empty state */}
        {jobs !== null && jobs.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-surface-raised border border-surface-border flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-content-subtle" />
            </div>
            <p className="text-content-secondary font-medium mb-1">No jobs posted yet</p>
            <p className="text-sm text-content-muted mb-6">
              Post a job first, then come back here to find matching candidates.
            </p>
            <button
              onClick={() => navigate('/recruiter/post')}
              className="btn-primary"
            >
              Post a Job →
            </button>
          </div>
        )}

        {/* Job grid */}
        {jobs !== null && jobs.length > 0 && (
          <>
            <p className="text-xs text-content-muted mb-4">
              {jobs.length} job{jobs.length !== 1 ? 's' : ''} available — click one to rank candidates
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map(job => (
                <button
                  key={job.id}
                  onClick={() => navigate(`/recruiter/candidates/${job.id}`)}
                  className="card p-5 text-left hover:border-primary-500 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-4 h-4 text-primary-500" />
                    </div>
                    {job.remote_policy && (
                      <span className={remoteBadgeClass(job.remote_policy)}>
                        {job.remote_policy}
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-semibold text-content-primary mb-0.5 truncate">
                    {job.title || job.id}
                  </p>
                  {job.company && (
                    <p className="text-xs text-content-muted truncate mb-3">{job.company}</p>
                  )}

                  <div className="flex items-center gap-1.5 text-xs text-content-muted">
                    <Users className="w-3.5 h-3.5" />
                    <span>Find candidates</span>
                    <ArrowRight className="w-3 h-3 ml-auto text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

      </div>
    </Layout>
  )
}
