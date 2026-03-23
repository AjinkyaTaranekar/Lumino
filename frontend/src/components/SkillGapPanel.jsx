import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function SkillGapPanel({ userId, jobId, onSkillClick }) {
  const [match,   setMatch]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    api.getMatchDetail(userId, jobId)
      .then(setMatch)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId, jobId])

  if (loading) return <div className="px-4 py-3 text-xs text-content-muted">Loading skill gap…</div>
  if (error)   return <div className="px-4 py-3 text-xs text-danger-500">Failed to load: {error}</div>
  if (!match)  return null

  const matched = match.matched_skills || []
  const missing = match.missing_skills || []

  return (
    <div className="px-4 py-3 bg-surface-raised border-t border-surface-border">
      {matched.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold mb-1.5 text-success-600">Matched skills</p>
          <div className="flex flex-wrap gap-1">
            {matched.map(s => (
              <span key={s} className="badge badge-green">{s}</span>
            ))}
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5 text-warning-600">Missing skills — click to discuss</p>
          <div className="flex flex-wrap gap-1">
            {missing.map(s => (
              <button
                key={s}
                onClick={() => onSkillClick(s)}
                className="badge badge-orange hover:bg-warning-100 transition-colors cursor-pointer"
                title="Click to discuss in chat">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {matched.length === 0 && missing.length === 0 && (
        <p className="text-xs text-content-muted">No skill gap data available.</p>
      )}
    </div>
  )
}
