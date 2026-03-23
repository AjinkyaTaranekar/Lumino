function scoreColor(score) {
  if (score >= 0.7) return { bar: '#10b981', text: 'text-success-600' }
  if (score >= 0.4) return { bar: '#f59e0b', text: 'text-warning-600' }
  return { bar: '#ef4444', text: 'text-danger-500' }
}

export default function ScoreBar({ label, score, large = false }) {
  const pct = Math.round(score * 100)
  const { bar, text } = scoreColor(score)

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1.5">
        <span className={`${large ? 'text-sm font-medium' : 'text-xs'} text-content-muted`}>
          {label}
        </span>
        <span className={`font-bold tabular-nums ${large ? 'text-sm' : 'text-xs'} ${text}`}>
          {pct}%
        </span>
      </div>
      <div className={`w-full ${large ? 'h-2.5' : 'h-1.5'} rounded-full bg-gray-100 overflow-hidden`}>
        <div
          className={`h-full rounded-full score-fill`}
          style={{ '--fill': `${pct}%`, width: `${pct}%`, background: bar }}
        />
      </div>
    </div>
  )
}
