import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function SkillGapPanel({ userId, jobId, onSkillClick }) {
  const [match, setMatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getMatchDetail(userId, jobId)
      .then(setMatch)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId, jobId])

  if (loading) return (
    <div className="px-4 py-3 text-xs" style={{ color: '#8892a4' }}>Loading skill gap…</div>
  )
  if (error) return (
    <div className="px-4 py-3 text-xs" style={{ color: '#e94560' }}>Failed to load: {error}</div>
  )
  if (!match) return null

  const matched = match.matched_skills || []
  const missing = match.missing_skills || []

  return (
    <div className="px-4 py-3" style={{ background: '#0a1628' }}>
      {matched.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold mb-1" style={{ color: '#27AE60' }}>Matched skills</p>
          <div className="flex flex-wrap gap-1">
            {matched.map(s => (
              <span key={s}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: '#1a3a2a', color: '#27AE60', border: '1px solid #27AE60' }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: '#F39C12' }}>Missing skills</p>
          <div className="flex flex-wrap gap-1">
            {missing.map(s => (
              <button
                key={s}
                onClick={() => onSkillClick(s)}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: '#2a1a00', color: '#F39C12', border: '1px solid #F39C12' }}
                onMouseEnter={e => e.currentTarget.style.background = '#3a2a00'}
                onMouseLeave={e => e.currentTarget.style.background = '#2a1a00'}
                title="Click to discuss in chat">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {matched.length === 0 && missing.length === 0 && (
        <p className="text-xs" style={{ color: '#8892a4' }}>No skill gap data available.</p>
      )}
    </div>
  )
}
