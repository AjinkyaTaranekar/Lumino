/**
 * Skills Intelligence page
 *
 * Four interconnected visualizations powered by real graph data:
 *  1. Market Landscape  — scatter: skill match vs culture fit, per matched job
 *  2. Evidence Matrix   — scatter: market demand vs evidence strength, per skill
 *  3. Skill Gap Bridge  — horizontal bars: which missing skills unlock the most jobs
 *  4. Market Footprint  — horizontal bars: avg match score per job domain/tag
 */

import { AlertTriangle, BarChart2, BookOpen, Briefcase, Loader, Map, Zap } from 'lucide-react'
import { type ComponentType, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import type { BatchMatchResponse, SkillIntelligenceResponse } from '../../lib/types'

// ─── Colour helpers ───────────────────────────────────────────────────────────

const TAG_PALETTE = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#22c55e', '#eab308', '#6366f1',
  '#0ea5e9', '#a855f7',
]

function tagColor(tag?: string): string {
  if (!tag) return '#94a3b8'
  const hash = [...tag].reduce((a, c) => a + c.charCodeAt(0), 0)
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

function evidenceQuadrantColor(demandPct: number, evidence: number): string {
  const hiDemand = demandPct > 0.25
  const hiEvidence = evidence > 0.6
  if (hiDemand && hiEvidence) return '#16a34a'   // Superpowers — green
  if (hiDemand && !hiEvidence) return '#dc2626'  // Prove It Better — red
  if (!hiDemand && hiEvidence) return '#7c3aed'  // Hidden Gems — purple
  return '#94a3b8'                                // Drop from Focus — gray
}

function scoreGradient(score: number): string {
  if (score >= 0.75) return '#16a34a'
  if (score >= 0.5) return '#2563eb'
  if (score >= 0.3) return '#ea580c'
  return '#94a3b8'
}

function gapBarColor(count: number, max: number): string {
  const r = count / Math.max(max, 1)
  if (r > 0.7) return '#dc2626'
  if (r > 0.4) return '#ea580c'
  return '#f59e0b'
}

// ─── Tooltip components ───────────────────────────────────────────────────────

interface TooltipProps { active?: boolean; payload?: { payload: Record<string, unknown> }[] }

function MarketTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs max-w-[200px]">
      <p className="font-bold text-indigo-950 truncate">{d.job_title as string}</p>
      {d.company && <p className="text-slate-400 truncate">{d.company as string}</p>}
      <div className="mt-2 space-y-0.5 text-slate-600">
        <p>Skill match: <span className="font-semibold text-indigo-950">{Math.round((d.x as number) * 100)}%</span></p>
        <p>Culture fit: <span className="font-semibold text-indigo-950">{Math.round((d.y as number) * 100)}%</span></p>
        <p>Overall: <span className="font-semibold text-indigo-950">{Math.round((d.total as number) * 100)}%</span></p>
      </div>
      {d.tag && (
        <p className="mt-1.5 text-[10px] text-slate-400 truncate">{d.tag as string}</p>
      )}
    </div>
  )
}

function EvidenceTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const quad =
    (d.x as number) > 0.25 && (d.y as number) > 0.6 ? 'Superpower'
    : (d.x as number) > 0.25 ? 'Prove It Better'
    : (d.y as number) > 0.6 ? 'Hidden Gem'
    : 'Low Priority'
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs max-w-[200px]">
      <p className="font-bold text-indigo-950">{d.name as string}</p>
      {d.family && <p className="text-slate-400 text-[10px]">{d.family as string}</p>}
      <div className="mt-2 space-y-0.5 text-slate-600">
        <p>Evidence: <span className="font-semibold">{Math.round((d.y as number) * 100)}%</span></p>
        <p>In jobs: <span className="font-semibold">{d.demand_count as number}</span></p>
        {(d.years as number) > 0 && <p>Experience: <span className="font-semibold">{d.years as number}y</span></p>}
      </div>
      <p className="mt-1.5 text-[10px] font-semibold" style={{ color: evidenceQuadrantColor(d.x as number, d.y as number) }}>
        {quad}
      </p>
    </div>
  )
}

function GapTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-indigo-950">{d.skill as string}</p>
      <p className="text-slate-600 mt-1">
        Missing in <span className="font-semibold text-red-600">{d.count as number}</span> matched jobs
      </p>
      <p className="text-slate-400 text-[10px] mt-0.5">Adding this skill could unlock these opportunities</p>
    </div>
  )
}

function FootprintTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-indigo-950">{d.tag as string}</p>
      <p className="text-slate-600 mt-1">
        Avg match: <span className="font-semibold">{Math.round((d.avg as number) * 100)}%</span>
      </p>
      <p className="text-slate-400 text-[10px]">{d.count as number} jobs in this category</p>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div className="card-lumino p-4 flex flex-col gap-1">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-extrabold tabular-nums ${accent ?? 'text-indigo-950'}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }: {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-blue-500" />
      </div>
      <div>
        <h2 className="text-sm font-extrabold text-indigo-950">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SkillsIntelligence() {
  const { session } = useAuth()
  const userId = session?.userId

  const [matches, setMatches] = useState<BatchMatchResponse | null>(null)
  const [intel, setIntel] = useState<SkillIntelligenceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    Promise.all([
      api.getMatches(userId),
      api.getSkillIntelligence(userId),
    ])
      .then(([m, i]) => { setMatches(m); setIntel(i) })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [userId])

  // ── Derived chart data ───────────────────────────────────────────────────────

  const scatterData = useMemo(() => {
    if (!matches) return []
    return matches.results.map(r => ({
      x: r.skill_score,
      y: r.culture_fit_score ?? 0,
      total: r.total_score,
      job_id: r.job_id,
      job_title: r.job_title,
      company: r.company,
      tag: r.job_tags?.[0],
    }))
  }, [matches])

  const evidenceData = useMemo(() => {
    if (!intel) return []
    return intel.skills.map(s => ({
      x: s.demand_pct,
      y: s.evidence_strength,
      name: s.name,
      family: s.family,
      years: s.years,
      level: s.level,
      demand_count: s.demand_count,
    }))
  }, [intel])

  const gapData = useMemo(() => {
    if (!matches) return []
    const freq: Record<string, number> = {}
    for (const r of matches.results) {
      for (const s of r.missing_skills) {
        freq[s] = (freq[s] ?? 0) + 1
      }
    }
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([skill, count]) => ({ skill, count }))
  }, [matches])

  const footprintData = useMemo(() => {
    if (!matches) return []
    const byTag: Record<string, { total: number; count: number }> = {}
    for (const r of matches.results) {
      const tags = r.job_tags ?? []
      if (!tags.length) {
        const key = 'Untagged'
        byTag[key] = { total: (byTag[key]?.total ?? 0) + r.total_score, count: (byTag[key]?.count ?? 0) + 1 }
      }
      for (const tag of tags) {
        byTag[tag] = { total: (byTag[tag]?.total ?? 0) + r.total_score, count: (byTag[tag]?.count ?? 0) + 1 }
      }
    }
    return Object.entries(byTag)
      .map(([tag, { total, count }]) => ({ tag, avg: total / count, count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 12)
  }, [matches])

  // ── Summary stats ─────────────────────────────────────────────────────────

  const avgSkillMatch = useMemo(() => {
    if (!matches?.results.length) return 0
    return matches.results.reduce((s, r) => s + r.skill_score, 0) / matches.results.length
  }, [matches])

  const topMissingSkill = gapData[0]?.skill ?? '—'
  const topDomain = footprintData[0]?.tag ?? '—'

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader size={28} className="animate-spin text-blue-500" />
          <p className="text-slate-500 text-sm">Analysing your skills against the market…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="alert-error flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      </div>
    )
  }

  const totalJobs = matches?.total_jobs_ranked ?? 0
  const totalSkills = intel?.skills.length ?? 0
  const gapMax = gapData[0]?.count ?? 1

  return (
    <>
      <title>Skills Intelligence - Lumino</title>

      <div className="px-6 py-8 max-w-7xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-950 tracking-tight flex items-center gap-3">
            <BarChart2 size={28} className="text-blue-500" />
            Skills Intelligence
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm">
            Four views of your market position — where you're strong, where to invest, and where to focus your search.
          </p>
        </div>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Jobs in market" value={totalJobs} sub="ranked by fit" />
          <StatCard
            label="Avg skill match"
            value={`${Math.round(avgSkillMatch * 100)}%`}
            sub="across all jobs"
            accent={avgSkillMatch >= 0.7 ? 'text-emerald-600' : avgSkillMatch >= 0.4 ? 'text-amber-600' : 'text-red-500'}
          />
          <StatCard label="Skills in profile" value={totalSkills} sub="tracked in graph" />
          <StatCard label="Top missing skill" value={topMissingSkill} sub={`needed by ${gapData[0]?.count ?? 0} jobs`} accent="text-red-600" />
        </div>

        {/* ── Row 1: Market Landscape + Evidence Matrix ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* 1. Market Landscape */}
          <div className="card-lumino p-6">
            <SectionHeader
              icon={Map}
              title="Market Landscape"
              description="Every job plotted by skill match (x) vs culture fit (y). Sweet spot is top-right."
            />

            {/* Quadrant labels */}
            <div className="relative">
              <div className="absolute top-2 right-2 text-[10px] font-bold text-emerald-600 opacity-70">Sweet Spot</div>
              <div className="absolute top-2 left-10 text-[10px] font-bold text-blue-500 opacity-70">Stretch Roles</div>
              <div className="absolute bottom-8 right-2 text-[10px] font-bold text-amber-500 opacity-70">Skill Match</div>
              <div className="absolute bottom-8 left-10 text-[10px] font-bold text-slate-400 opacity-70">Not a Fit</div>

              <ResponsiveContainer width="100%" height={360}>
                <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, 1]}
                    tickFormatter={v => `${Math.round(v * 100)}%`}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    label={{ value: 'Skill Match', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0, 1]}
                    tickFormatter={v => `${Math.round(v * 100)}%`}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    label={{ value: 'Culture Fit', angle: -90, position: 'insideLeft', offset: 12, fontSize: 11, fill: '#64748b' }}
                  />
                  <ReferenceLine x={0.5} stroke="#e2e8f0" strokeDasharray="4 2" />
                  <ReferenceLine y={0.5} stroke="#e2e8f0" strokeDasharray="4 2" />
                  <Tooltip content={<MarketTooltip />} />
                  <Scatter data={scatterData} shape="circle">
                    {scatterData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={tagColor(entry.tag)}
                        fillOpacity={0.8}
                        stroke={tagColor(entry.tag)}
                        strokeWidth={1}
                        r={Math.max(5, Math.round(entry.total * 10))}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Tag legend — top 6 unique tags */}
            {(() => {
              const seen = new Set<string>()
              const tags: string[] = []
              for (const d of scatterData) {
                if (d.tag && !seen.has(d.tag)) { seen.add(d.tag); tags.push(d.tag) }
                if (tags.length >= 6) break
              }
              return tags.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-3">
                  {tags.map(t => (
                    <div key={t} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tagColor(t) }} />
                      <span className="text-[11px] text-slate-500">{t}</span>
                    </div>
                  ))}
                </div>
              ) : null
            })()}

            <p className="text-[11px] text-slate-400 mt-3">Dot size scales with overall match score.</p>
          </div>

          {/* 2. Evidence Quality Matrix */}
          <div className="card-lumino p-6">
            <SectionHeader
              icon={Zap}
              title="Evidence Quality Matrix"
              description="Each skill plotted by job demand (x) vs how well you've evidenced it (y)."
            />

            {/* Quadrant legend */}
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {[
                { label: 'Superpower', color: '#16a34a', desc: 'High demand + strong evidence' },
                { label: 'Prove It Better', color: '#dc2626', desc: 'High demand + weak evidence' },
                { label: 'Hidden Gem', color: '#7c3aed', desc: 'Low demand + strong evidence' },
                { label: 'Low Priority', color: '#94a3b8', desc: 'Low demand + weak evidence' },
              ].map(q => (
                <div key={q.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: q.color }} />
                  <div>
                    <p className="text-[10px] font-bold" style={{ color: q.color }}>{q.label}</p>
                    <p className="text-[9px] text-slate-400">{q.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, 1]}
                  tickFormatter={v => `${Math.round(v * 100)}%`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  label={{ value: 'Job Demand', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={[0, 1]}
                  tickFormatter={v => `${Math.round(v * 100)}%`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  label={{ value: 'Evidence', angle: -90, position: 'insideLeft', offset: 12, fontSize: 11, fill: '#64748b' }}
                />
                <ReferenceLine x={0.25} stroke="#e2e8f0" strokeDasharray="4 2" />
                <ReferenceLine y={0.6} stroke="#e2e8f0" strokeDasharray="4 2" />
                <Tooltip content={<EvidenceTooltip />} />
                <Scatter data={evidenceData} shape="circle">
                  {evidenceData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={evidenceQuadrantColor(entry.x, entry.y)}
                      fillOpacity={0.75}
                      r={Math.max(5, Math.min(12, Math.round(entry.years * 1.5 + 4)))}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>

            <p className="text-[11px] text-slate-400 mt-2">
              Dot size scales with years of experience. Thresholds: demand &gt;25%, evidence &gt;60%.
            </p>
          </div>
        </div>

        {/* ── Row 2: Skill Gap Bridge ── */}
        <div className="card-lumino p-6">
          <SectionHeader
            icon={BookOpen}
            title="Skill Gap Bridge"
            description="Skills you're missing, ranked by how many jobs need them. These are your highest-ROI learning investments."
          />

          {gapData.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No skill gaps detected across your matched jobs — impressive!
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, gapData.length * 36)}>
                <BarChart
                  layout="vertical"
                  data={gapData}
                  margin={{ top: 0, right: 60, bottom: 0, left: 140 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={v => `${v} jobs`}
                    domain={[0, gapMax + 1]}
                  />
                  <YAxis
                    type="category"
                    dataKey="skill"
                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
                    width={135}
                  />
                  <Tooltip content={<GapTooltip />} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={20}>
                    {gapData.map((entry, i) => (
                      <Cell key={i} fill={gapBarColor(entry.count, gapMax)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <Zap size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  <strong>Top priority:</strong> Adding <strong>{gapData[0]?.skill}</strong> would
                  remove a gap in <strong>{gapData[0]?.count}</strong> of your matched jobs — the single
                  highest-leverage skill to acquire next.
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Row 3: Market Footprint ── */}
        <div className="card-lumino p-6">
          <SectionHeader
            icon={Briefcase}
            title="Market Footprint"
            description={`Your average match score across job domains. Focus your search where your scores are highest. Top domain: ${topDomain}.`}
          />

          {footprintData.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No tagged jobs in your match pool yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(240, footprintData.length * 38)}>
              <BarChart
                layout="vertical"
                data={footprintData}
                margin={{ top: 0, right: 80, bottom: 0, left: 130 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={v => `${Math.round(v * 100)}%`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <YAxis
                  type="category"
                  dataKey="tag"
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
                  width={125}
                />
                <Tooltip content={<FootprintTooltip />} />
                <Bar dataKey="avg" radius={[0, 6, 6, 0]} maxBarSize={22}>
                  {footprintData.map((entry, i) => (
                    <Cell key={i} fill={scoreGradient(entry.avg)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Domain legend */}
          {footprintData.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {[
                { color: '#16a34a', label: '≥75% — Strong fit' },
                { color: '#2563eb', label: '50–74% — Good fit' },
                { color: '#ea580c', label: '30–49% — Developing' },
                { color: '#94a3b8', label: '<30% — Weak fit' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[11px] text-slate-500">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  )
}
