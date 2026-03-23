import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import LoadingOverlay from '../../components/LoadingOverlay'
import ScoreBar from '../../components/ScoreBar'
import SkillBadge from '../../components/SkillBadge'
import { ArrowLeft, Users, ArrowRight, Sparkles, Network, AlertCircle } from 'lucide-react'

function CultureBadge({ label, value }) {
  const pct = Math.round((value ?? 0) * 100)
  const cls =
    value >= 0.7
      ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100'
      : value > 0
      ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-100'
      : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200'
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
    <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              isTopRank
                ? 'bg-primary-500 text-white'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            {rank}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-indigo-950">{result.user_id}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Candidate</p>
          </div>
        </div>
        <button
          onClick={() =>
            navigate(`/user/match/${jobId}`, { state: { viewAs: result.user_id } })
          }
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-bold hover:bg-primary-600 transition-all flex-shrink-0"
        >
          Explore <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <ScoreBar label="Overall Match" score={result.total_score} large />
        <div className="grid grid-cols-2 gap-3 mt-2">
          <ScoreBar label="Skills (65%)" score={result.skill_score} />
          <ScoreBar label="Domain (35%)" score={result.domain_score} />
        </div>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <CultureBadge label="Culture fit" value={result.culture_bonus} />
        <CultureBadge label="Preferences" value={result.preference_bonus} />
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
        <p className="mt-3 text-xs text-slate-400 italic">{result.explanation}</p>
      )}
    </div>
  )
}

export default function Candidates() {
  const { jobId } = useParams()
  const navigate = useNavigate()

  const [candidates, setCandidates] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
    <div className="p-8 max-w-6xl">
      {loading && <LoadingOverlay message="Finding matching candidates…" />}

      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/recruiter/candidates')}
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-950 transition-colors font-bold mt-1"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">
              Candidates for <span className="text-primary-500">{jobId}</span>
            </h1>
            <p className="text-lg text-slate-500 mt-2 leading-relaxed">
              {candidates
                ? `${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} ranked`
                : 'Click to find matching candidates'}
            </p>
          </div>
        </div>

        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={() => navigate(`/recruiter/model/${jobId}`)}
            className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all"
          >
            View Job Model
          </button>
          <button
            onClick={handleFind}
            className="flex items-center gap-2 px-5 py-3 bg-primary-500 text-white rounded-xl font-bold hover:bg-primary-600 transition-all"
          >
            <Sparkles className="w-4 h-4" /> Find Matching Candidates
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm mb-6">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Results list */}
      {candidates && (
        <div className="space-y-4">
          {candidates.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-indigo-950 font-medium mb-1">No candidates found</p>
              <p className="text-sm text-slate-400">
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
          <p className="text-indigo-950 font-semibold mb-2">
            Ready to match candidates
          </p>
          <p className="text-sm text-slate-500 mb-1">
            Click "Find Matching Candidates" to rank all profiles against this job.
          </p>
          <p className="text-xs text-slate-400">
            Each candidate is scored using skills (65%) and domain (35%) graph analysis.
          </p>
        </div>
      )}
    </div>
  )
}
