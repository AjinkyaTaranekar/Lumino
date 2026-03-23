interface ScoreBarProps {
  label: string
  score: number
  large?: boolean
}

interface ScoreColorResult {
  bar: string
  text: string
}

function scoreColor(score: number): ScoreColorResult {
  if (score >= 0.7) return { bar: '#10b981', text: 'text-emerald-600' }
  if (score >= 0.4) return { bar: '#f59e0b', text: 'text-amber-600' }
  return { bar: '#ef4444', text: 'text-red-500' }
}

export default function ScoreBar({ label, score, large = false }: ScoreBarProps) {
  const pct = Math.round(score * 100)
  const { bar, text } = scoreColor(score)

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1.5">
        <span className={`${large ? 'text-sm font-medium' : 'text-xs'} text-slate-400`}>
          {label}
        </span>
        <span className={`font-bold tabular-nums ${large ? 'text-sm' : 'text-xs'} ${text}`}>
          {pct}%
        </span>
      </div>
      <div
        className={`w-full ${large ? 'h-2.5' : 'h-1.5'} rounded-full bg-gray-100 overflow-hidden`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${pct}%`}
      >
        <div
          className="h-full rounded-full score-fill transition-all duration-500 ease-out"
          style={{ '--fill': `${pct}%`, width: `${pct}%`, background: bar } as React.CSSProperties}
        />
      </div>
    </div>
  )
}
