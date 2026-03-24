import { useNavigate } from 'react-router-dom'
import ScoreBar from './ScoreBar'
import SkillBadge from './SkillBadge'
import { ArrowRight, Building2 } from 'lucide-react'
import type { MatchResult } from '../lib/types'

const REMOTE_STYLES: Record<string, string> = {
  remote: 'badge-green',
  hybrid: 'badge-orange',
  onsite: 'badge-blue',
}

interface ScoreRingProps {
  score: number
}

function ScoreRing({ score }: ScoreRingProps) {
  const pct = Math.round(score * 100)
  const color = score >= 0.7 ? '#10b981' : score >= 0.4 ? '#f59e0b' : '#ef4444'
  const r = 18
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="relative w-12 h-12 flex-shrink-0">
      <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#f3f4f6" strokeWidth="4" />
        <circle
          cx="22" cy="22" r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold text-content-primary">{pct}%</span>
      </div>
    </div>
  )
}

interface JobCardProps {
  result: MatchResult
  rank: number
  userIdOrJobId: string
  mode?: 'seeker' | 'recruiter'
}

export default function JobCard({ result, rank, userIdOrJobId: _userIdOrJobId, mode = 'seeker' }: JobCardProps) {
  const navigate = useNavigate()

  const handleExplore = () => {
    if (mode === 'seeker') {
      navigate(`/user/match/${result.job_id}`)
    } else {
      navigate(`/user/match/${result.job_id}`, { state: { viewAs: (result as MatchResult & { user_id?: string }).user_id } })
    }
  }

  const title   = mode === 'seeker' ? (result.job_title || result.job_id) : (result as MatchResult & { user_id?: string }).user_id
  const company = mode === 'seeker' ? result.company : null
  const remote  = mode === 'seeker' ? (result as MatchResult & { remote_policy?: string }).remote_policy : null

  return (
    <div className="card-lumino p-5 fade-in hover:shadow-card-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        {/* Rank badge */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          rank <= 3 ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'
        }`}>
          {rank}
        </div>

        {/* Title / company */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-indigo-950 text-sm truncate">{title}</h3>
          {(company || remote) && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {company && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Building2 size={11} /> {company}
                </span>
              )}
              {remote && (
                <span className={`badge ${REMOTE_STYLES[remote] || 'badge-blue'}`}>
                  {remote}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Score ring */}
        <ScoreRing score={result.total_score} />
      </div>

      {/* Score bars */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
        <ScoreBar label="Skills" score={result.skill_score} />
        <ScoreBar label="Domain" score={result.domain_score} />
        {result.culture_fit_score != null && (
          <ScoreBar label="Culture" score={result.culture_fit_score} />
        )}
        {result.soft_skill_score != null && result.soft_skill_score > 0 && (
          <ScoreBar label="Soft Skills" score={result.soft_skill_score} />
        )}
        {result.optional_skill_score != null && result.optional_skill_score > 0 && (
          <ScoreBar label="Optional Skills" score={result.optional_skill_score} />
        )}
      </div>

      {/* Skill badges */}
      <div className="space-y-2">
        {result.matched_skills?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.matched_skills.slice(0, 6).map(s => (
              <SkillBadge key={s} label={s} variant="match" />
            ))}
            {result.matched_skills.length > 6 && (
              <SkillBadge label={`+${result.matched_skills.length - 6}`} variant="neutral" />
            )}
          </div>
        )}
        {result.missing_skills?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.missing_skills.slice(0, 4).map(s => (
              <SkillBadge key={s} label={s} variant="missing" />
            ))}
            {result.missing_skills.length > 4 && (
              <SkillBadge label={`+${result.missing_skills.length - 4} gaps`} variant="neutral" />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
        {result.explanation ? (
          <p className="text-xs text-slate-400 italic line-clamp-1 flex-1 mr-3">
            {result.explanation}
          </p>
        ) : <div />}
        <button
          onClick={handleExplore}
          className="btn-primary flex-shrink-0 flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          aria-label={`View match details for ${title}`}
        >
          Explore <ArrowRight size={12} />
        </button>
      </div>
    </div>
  )
}
