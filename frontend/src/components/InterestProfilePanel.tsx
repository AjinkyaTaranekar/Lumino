/**
 * InterestProfilePanel
 *
 * Shows the user's job preference DNA:
 *  - Radar chart across 5 tag categories (work_style, compensation, culture, tech, impact)
 *  - Per-tag bars with confidence indicators
 *  - Explicit controls: slider to adjust score, ✕ to remove
 *
 * Fully scrutable: every score shows how many interactions built it,
 * and whether it was manually overridden.
 */

import { useEffect, useState } from 'react'
import { X, Sliders } from 'lucide-react'
import type { InterestTag, InterestProfileResponse } from '../lib/types'
import { api } from '../lib/api'

// ─── Tag category display config ─────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  work_style:   'Work Style',
  compensation: 'Compensation',
  culture:      'Culture',
  tech:         'Tech',
  impact:       'Impact',
}

const CATEGORY_COLORS: Record<string, string> = {
  work_style:   '#6366f1',
  compensation: '#10b981',
  culture:      '#f59e0b',
  tech:         '#3b82f6',
  impact:       '#ec4899',
}

// ─── SVG Radar Chart ─────────────────────────────────────────────────────────

const CATEGORIES = ['work_style', 'compensation', 'culture', 'tech', 'impact']
const N = CATEGORIES.length
const CX = 80
const CY = 80
const R = 60

function polarToXY(angle: number, r: number) {
  const rad = (angle - 90) * (Math.PI / 180)
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

interface RadarChartProps {
  scores: Record<string, number>  // category → 0-1 average score
}

function RadarChart({ scores }: RadarChartProps) {
  const angles = CATEGORIES.map((_, i) => (360 / N) * i)

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0]

  // Polygon for user scores
  const points = CATEGORIES.map((cat, i) => {
    const score = scores[cat] ?? 0.5
    const p = polarToXY(angles[i], score * R)
    return `${p.x},${p.y}`
  }).join(' ')

  return (
    <svg viewBox="0 0 160 160" className="w-36 h-36 flex-shrink-0">
      {/* Grid rings */}
      {rings.map(r => (
        <polygon
          key={r}
          points={CATEGORIES.map((_, i) => {
            const p = polarToXY(angles[i], r * R)
            return `${p.x},${p.y}`
          }).join(' ')}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="0.8"
        />
      ))}

      {/* Axis lines */}
      {CATEGORIES.map((_, i) => {
        const outer = polarToXY(angles[i], R)
        return (
          <line
            key={i}
            x1={CX} y1={CY}
            x2={outer.x} y2={outer.y}
            stroke="#e2e8f0"
            strokeWidth="0.8"
          />
        )
      })}

      {/* Score polygon */}
      <polygon
        points={points}
        fill="rgba(99,102,241,0.15)"
        stroke="#6366f1"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Score dots */}
      {CATEGORIES.map((cat, i) => {
        const score = scores[cat] ?? 0.5
        const p = polarToXY(angles[i], score * R)
        const color = CATEGORY_COLORS[cat] || '#6366f1'
        return <circle key={cat} cx={p.x} cy={p.y} r={3} fill={color} />
      })}

      {/* Category labels */}
      {CATEGORIES.map((cat, i) => {
        const p = polarToXY(angles[i], R + 14)
        const label = CATEGORY_LABELS[cat] || cat
        return (
          <text
            key={cat}
            x={p.x} y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="6.5"
            fill="#64748b"
            fontWeight="500"
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}

// ─── Tag row ─────────────────────────────────────────────────────────────────

interface TagRowProps {
  tag: InterestTag
  onAdjust: (tag: string, score: number) => void
  onRemove: (tag: string) => void
}

function TagRow({ tag, onAdjust, onRemove }: TagRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tag.score)

  const color = CATEGORY_COLORS[tag.category || ''] || '#6366f1'
  const pct = Math.round(tag.score * 100)

  const confidenceLabel: Record<string, string> = {
    high: '●●●', medium: '●●○', low: '●○○',
  }

  return (
    <div className="group flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-slate-50 transition-colors">
      {/* Bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium text-slate-700 truncate">{tag.tag}</span>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-[10px] text-slate-400" title={`${tag.interaction_count} interactions`}>
              {confidenceLabel[tag.confidence] || '●○○'}
            </span>
            <span className="text-xs font-semibold" style={{ color }}>{pct}%</span>
          </div>
        </div>
        {!editing ? (
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0} max={100} step={5}
              value={Math.round(draft * 100)}
              onChange={e => setDraft(Number(e.target.value) / 100)}
              className="flex-1 h-1.5 accent-indigo-500"
            />
            <span className="text-[11px] w-8 text-right text-indigo-600 font-semibold">
              {Math.round(draft * 100)}%
            </span>
            <button
              onClick={() => { onAdjust(tag.tag, draft); setEditing(false) }}
              className="text-[10px] px-2 py-0.5 bg-indigo-500 text-white rounded font-medium hover:bg-indigo-600"
            >
              Set
            </button>
            <button
              onClick={() => { setDraft(tag.score); setEditing(false) }}
              className="text-[10px] px-1.5 py-0.5 text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Actions — visible on hover */}
      {!editing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => setEditing(true)}
            title="Adjust score"
            className="p-1 text-slate-400 hover:text-indigo-500 rounded"
          >
            <Sliders size={12} />
          </button>
          <button
            onClick={() => onRemove(tag.tag)}
            title="Remove tag"
            className="p-1 text-slate-400 hover:text-red-500 rounded"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface InterestProfilePanelProps {
  userId: string
}

export default function InterestProfilePanel({ userId }: InterestProfilePanelProps) {
  const [profile, setProfile] = useState<InterestProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.getInterestProfile(userId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [userId])

  const handleAdjust = async (tag: string, score: number) => {
    await api.adjustInterest(userId, tag, score)
    load()
  }

  const handleRemove = async (tag: string) => {
    await api.removeInterest(userId, tag)
    load()
  }

  if (loading) {
    return <div className="text-xs text-slate-400 py-4 text-center">Loading preferences…</div>
  }

  if (!profile || profile.tags.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-slate-400">No preference data yet.</p>
        <p className="text-xs text-slate-300 mt-1">
          Like, bookmark, or explore jobs to build your interest profile.
        </p>
      </div>
    )
  }

  // Compute per-category average for radar
  const categoryScores: Record<string, number> = {}
  const categoryCounts: Record<string, number> = {}
  for (const t of profile.tags) {
    const cat = t.category || 'other'
    categoryScores[cat] = (categoryScores[cat] || 0) + t.score
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  }
  const radarScores: Record<string, number> = {}
  for (const cat of CATEGORIES) {
    radarScores[cat] = categoryCounts[cat]
      ? categoryScores[cat] / categoryCounts[cat]
      : 0.5
  }

  const filteredTags = activeCategory
    ? profile.tags.filter(t => t.category === activeCategory)
    : profile.tags

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-indigo-950">Your Job Preference DNA</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Based on {profile.total_interactions} interaction{profile.total_interactions !== 1 ? 's' : ''} · Fully adjustable
          </p>
        </div>
      </div>

      {/* Radar + Category filters */}
      <div className="flex items-center gap-4">
        <RadarChart scores={radarScores} />
        <div className="flex-1 space-y-1.5">
          {CATEGORIES.map(cat => {
            const score = radarScores[cat]
            const pct = Math.round(score * 100)
            const color = CATEGORY_COLORS[cat]
            const isActive = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? null : cat)}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left transition-colors ${
                  isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-slate-600 flex-1">{CATEGORY_LABELS[cat]}</span>
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <span className="text-[10px] text-slate-400 w-7 text-right">{pct}%</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tag list */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            {activeCategory ? CATEGORY_LABELS[activeCategory] : 'All Tags'}
          </span>
          {activeCategory && (
            <button
              onClick={() => setActiveCategory(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Show all
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-50">
          {filteredTags.map(tag => (
            <TagRow
              key={tag.tag}
              tag={tag}
              onAdjust={handleAdjust}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
