import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import LoadingOverlay from '../../components/LoadingOverlay'
import ScoreBar from '../../components/ScoreBar'
import SkillBadge from '../../components/SkillBadge'
import { ArrowLeft, Users, ArrowRight, Sparkles, Network } from 'lucide-react'

function CultureBadge({ label, value }) {
  const pct = Math.round((value ?? 0) * 100)
  const cls =
    value >= 0.7
      ? 'badge badge-green'
      : value > 0
      ? 'badge badge-orange'
      : 'badge badge-gray'
  return (
    <span className={cls}>
      {label}: {pct}%
    </span>
  )
}

function CandidateCard({ result, rank, jobId }) {
  const navigate = useNavigate()
  const isTopRank = rank <= 3

  return (
    <div className="card p-5 fade-in">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              isTopRank
                ? 'bg-primary-500 text-white'
                : 'bg-surface-raised text-content-secondary border border-surface-border'
            }`}
          >
            {rank}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-content-primary">{result.user_id}</h3>
            <p className="text-xs text-content-muted mt-0.5">Candidate</p>
          </div>
        </div>
        <button
          onClick={() =>
            navigate(`/user/match/${jobId}`, { state: { viewAs: result.user_id } })
          }
          className="btn-primary btn-sm flex items-center gap-1.5 flex-shrink-0"
        >
          Explore <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <ScoreBar label="Overall Match" score={result.total_score} large />
        <div className="grid grid-cols-2 gap-3 mt-2">
          <ScoreBar label="Skills (65%)"  score={result.skill_score} />
          <ScoreBar label="Domain (35%)"  score={result.domain_score} />
        </div>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <CultureBadge label="Culture fit"  value={result.culture_bonus} />
        <CultureBadge label="Preferences"  value={result.preference_bonus} />
      </div>

      {result.matched_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {result.matched_skills.slice(0, 6).map(s => (
            <SkillBadge key={s} label={s} variant="match" />
          ))}
          {result.matched_skills.length > 6 && (
            <SkillBadge label={`+${result.matched_skills.length - 6} more`} variant="neutral" />
          )}
        </div>
      )}

      {result.missing_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.missing_skills.slice(0, 4).map(s => (
            <SkillBadge key={s} label={s} variant="missing" />
          ))}
        </div>
      )}

      {result.explanation && (
        <p className="mt-3 text-xs text-content-muted italic">{result.explanation}</p>
      )}
    </div>
  )
}

export default function Candidates() {
  const { jobId } = useParams()
  const navigate  = useNavigate()

  const [candidates, setCandidates] = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  async function handleFind() {
    setError(null)
    setLoading(true)
    try {
      const data = await api.getCandidates(jobId)
      setCandidates(data.results)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      {loading && <LoadingOverlay message="Finding matching candidates…" />}

      <div className="px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={() => navigate('/recruiter/candidates')}
              className="btn-ghost btn-sm flex items-center gap-1.5 mt-1"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-content-primary">
                Candidates for {jobId}
              </h1>
              <p className="text-sm text-content-secondary mt-1">
                {candidates
                  ? `${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} ranked`
                  : 'Click to find matching candidates'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => navigate(`/recruiter/model/${jobId}`)}
              className="btn-secondary btn-sm"
            >
              View Job Model
            </button>
            <button
              onClick={handleFind}
              className="btn-primary btn-sm flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Find Matching Candidates
            </button>
          </div>
        </div>

        {error && (
          <div className="alert-error mb-6">{error}</div>
        )}

        {/* Results list */}
        {candidates && (
          <div className="space-y-4">
            {candidates.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-surface-border flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-content-subtle" />
                </div>
                <p className="text-content-secondary font-medium mb-1">No candidates found</p>
                <p className="text-sm text-content-muted">
                  No candidate profiles in the system yet.
                </p>
              </div>
            ) : (
              candidates.map((c, i) => (
                <CandidateCard key={c.user_id} result={c} rank={i + 1} jobId={jobId} />
              ))
            )}
          </div>
        )}

        {/* Initial state */}
        {!candidates && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mx-auto mb-4">
              <Network className="w-8 h-8 text-primary-500" />
            </div>
            <p className="text-content-primary font-semibold mb-2">
              Ready to match candidates
            </p>
            <p className="text-sm text-content-secondary mb-1">
              Click "Find Matching Candidates" to rank all profiles against this job.
            </p>
            <p className="text-xs text-content-muted">
              Each candidate is scored using skills (65%) and domain (35%) graph analysis.
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}
