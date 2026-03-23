import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { MatchResult } from '../lib/types'

interface SkillGapPanelProps {
  userId: string
  jobId: string
  onSkillClick: (skill: string) => void
}

export default function SkillGapPanel({ userId, jobId, onSkillClick }: SkillGapPanelProps) {
  const [match,   setMatch]   = useState<MatchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    api.getMatchDetail(userId, jobId)
      .then((data: MatchResult) => setMatch(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [userId, jobId])

  if (loading) return <div className="px-4 py-3 text-xs text-slate-400">Loading skill gap…</div>
  if (error)   return <div className="px-4 py-3 text-xs text-red-500" role="alert">Failed to load: {error}</div>
  if (!match)  return null

  const matched = match.matched_skills || []
  const missing = match.missing_skills || []

  return (
    <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
      {matched.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold mb-1.5 text-emerald-600">Matched skills</p>
          <div className="flex flex-wrap gap-1" role="list" aria-label="Matched skills">
            {matched.map(s => (
              <span key={s} className="badge-green" role="listitem">{s}</span>
            ))}
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5 text-amber-600">Missing skills — click to discuss</p>
          <div className="flex flex-wrap gap-1" role="list" aria-label="Missing skills">
            {missing.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onSkillClick(s)}
                className="badge-orange hover:bg-amber-100 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-amber-500"
                title="Click to discuss in chat"
                aria-label={`Discuss missing skill: ${s}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {matched.length === 0 && missing.length === 0 && (
        <p className="text-xs text-slate-400">No skill gap data available.</p>
      )}
    </div>
  )
}
