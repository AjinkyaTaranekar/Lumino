import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import LoadingOverlay from '../../components/LoadingOverlay'
import JobCard from '../../components/JobCard'
import { Sparkles, Briefcase, AlertCircle, Building2, MapPin } from 'lucide-react'

const REMOTE_BADGE = {
  remote: 'badge-green',
  hybrid: 'badge-orange',
  onsite: 'badge-blue',
}

function SimpleJobCard({ job }) {
  return (
    <div className="card p-4 hover:shadow-card-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
            <Briefcase size={15} className="text-primary-500" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-content-primary truncate">{job.title || job.id}</h3>
            {job.company && (
              <p className="text-xs text-content-muted flex items-center gap-1 mt-0.5">
                <Building2 size={10} /> {job.company}
              </p>
            )}
          </div>
        </div>
        {job.remote_policy && (
          <span className={`badge ${REMOTE_BADGE[job.remote_policy] || 'badge-gray'} flex-shrink-0`}>
            {job.remote_policy}
          </span>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { session }                           = useAuth()
  const [jobs,       setJobs]                 = useState([])
  const [matches,    setMatches]              = useState(null)
  const [loading,    setLoading]              = useState(false)
  const [loadingMsg, setLoadMsg]              = useState('')
  const [error,      setError]                = useState(null)

  useEffect(() => {
    api.listJobs().then(setJobs).catch(() => {})
  }, [])

  async function handleRecommend() {
    setError(null)
    setLoading(true)
    setLoadMsg('Computing your personalised matches…')
    try {
      const data = await api.getMatches(session.userId)
      setMatches(data.results)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      {loading && <LoadingOverlay message={loadingMsg} />}

      <div className="px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-content-primary">
              Hello, {session.userId} 👋
            </h1>
            <p className="text-sm text-content-muted mt-1">
              {matches
                ? `${matches.length} job${matches.length !== 1 ? 's' : ''} ranked for you`
                : `${jobs.length} available position${jobs.length !== 1 ? 's' : ''} in the database`}
            </p>
          </div>

          <button onClick={handleRecommend} className="btn-primary">
            <Sparkles size={15} /> Get Recommendations
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="alert-error mb-6">
            <AlertCircle size={15} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Ranked matches */}
        {matches && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="section-title">Ranked Recommendations</h2>
              <span className="badge badge-blue">{matches.length}</span>
            </div>
            {matches.length === 0 ? (
              <div className="text-center py-16 card">
                <Briefcase size={36} className="mx-auto mb-3 text-content-subtle" />
                <p className="text-sm text-content-muted">No jobs found in the database yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {matches.map((r, i) => (
                  <JobCard key={r.job_id} result={r} rank={i + 1} userIdOrJobId={session.userId} mode="seeker" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Default listing */}
        {!matches && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="section-title">Available Positions</h2>
              <span className="badge badge-gray">{jobs.length}</span>
            </div>
            {jobs.length === 0 ? (
              <div className="text-center py-20 card">
                <Briefcase size={44} className="mx-auto mb-3 text-content-subtle" />
                <p className="text-sm text-content-muted">No jobs posted yet.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {jobs.map(j => <SimpleJobCard key={j.id} job={j} />)}
                </div>
                <div className="text-center">
                  <p className="text-sm text-content-muted mb-3">
                    Click "Get Recommendations" to see jobs ranked by your skills and domain profile.
                  </p>
                  <button onClick={handleRecommend} className="btn-primary">
                    <Sparkles size={15} /> Get Personalised Recommendations
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
