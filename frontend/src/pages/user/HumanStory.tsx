/**
 * HumanStory — "What We Know About You"
 *
 * Full transparency page that surfaces every human-layer node we've stored
 * about the user from their Digital Twin conversations:
 *   Anecdotes · Motivations · Values · Goals · Culture Identity · Behavioral Patterns
 *
 * Surprise feature: Story Fingerprint — an emotional + confidence analysis of
 * every anecdote the user has shared, so they can see their own narrative patterns.
 */

import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  ChevronDown,
  ChevronUp,
  Compass,
  Flame,
  Globe,
  Heart,
  Info,
  Loader,
  MessageSquare,
  Shield,
  Sparkles,
  Star,
  Target,
  Zap,
} from 'lucide-react'
import { type ComponentType, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import type {
  DigitalTwinAnecdote,
  DigitalTwinBehavioralInsight,
  DigitalTwinCultureIdentity,
  DigitalTwinGoal,
  DigitalTwinMotivation,
  DigitalTwinProfileResponse,
  DigitalTwinValue,
} from '../../lib/types'
import { useEffect } from 'react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emotionStyle(v?: string | null): { bg: string; text: string; label: string } {
  if (v === 'positive') return { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Positive' }
  if (v === 'negative') return { bg: 'bg-red-50 border-red-200', text: 'text-red-600', label: 'Challenging' }
  return { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-500', label: 'Neutral' }
}

function strengthColor(s?: string | null): string {
  if (s === 'high') return 'bg-indigo-600'
  if (s === 'medium') return 'bg-blue-400'
  return 'bg-slate-300'
}

function strengthWidth(s?: string | null): string {
  if (s === 'high') return 'w-full'
  if (s === 'medium') return 'w-2/3'
  return 'w-1/3'
}

function clarityStyle(c?: string | null): { color: string; pct: number; label: string } {
  if (c === 'concrete') return { color: 'bg-emerald-500', pct: 100, label: 'Concrete' }
  if (c === 'defined') return { color: 'bg-blue-400', pct: 66, label: 'Defined' }
  return { color: 'bg-amber-400', pct: 33, label: 'Vague' }
}

function motivationIcon(cat?: string | null): ComponentType<{ size?: number; className?: string }> {
  const c = (cat ?? '').toLowerCase()
  if (c.includes('growth') || c.includes('learn')) return BookOpen
  if (c.includes('impact') || c.includes('purpose')) return Globe
  if (c.includes('financial') || c.includes('money')) return Star
  if (c.includes('autonomy') || c.includes('freedom')) return Compass
  if (c.includes('team') || c.includes('people')) return Heart
  return Flame
}

function goalTypeChip(type?: string | null): { bg: string; text: string } {
  const t = (type ?? '').toLowerCase()
  if (t === 'career') return { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' }
  if (t === 'skill') return { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700' }
  if (t === 'financial') return { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' }
  if (t === 'personal') return { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' }
  return { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600' }
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  badge,
  children,
  accent = 'text-blue-500',
  bg = 'bg-blue-50',
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  badge?: number
  children: React.ReactNode
  accent?: string
  bg?: string
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-xl ${bg} border border-white flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <Icon size={16} className={accent} />
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-extrabold text-indigo-950 tracking-tight">{title}</h2>
          {badge !== undefined && (
            <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

// ─── Anecdote card ────────────────────────────────────────────────────────────

function AnecdoteCard({ a }: { a: DigitalTwinAnecdote }) {
  const [open, setOpen] = useState(false)
  const em = emotionStyle(a.emotion_valence)
  const conf = a.confidence_signal ?? null

  return (
    <div className={`rounded-2xl border p-4 ${em.bg} transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-indigo-950 leading-tight">{a.name}</h3>
            {a.spontaneous && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 flex-shrink-0">
                Spontaneous
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-[11px] font-semibold ${em.text}`}>{em.label}</span>
            {conf !== null && (
              <div className="flex items-center gap-1.5" title={`Confidence: ${Math.round(conf * 100)}%`}>
                <div className="w-16 h-1.5 bg-white/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-400"
                    style={{ width: `${Math.round(conf * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400">{Math.round(conf * 100)}% confidence</span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/60 hover:bg-white flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors"
          aria-label={open ? 'Collapse story' : 'Expand full story'}
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* STAR breakdown */}
      {open && (
        <div className="mt-4 space-y-3 border-t border-white/40 pt-4">
          {[
            { label: 'Situation', value: a.situation, color: 'text-blue-600' },
            { label: 'Task', value: a.task, color: 'text-purple-600' },
            { label: 'Action', value: a.action, color: 'text-indigo-600' },
            { label: 'Result', value: a.result, color: 'text-emerald-700' },
          ].map(({ label, value, color }) =>
            value ? (
              <div key={label}>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${color}`}>{label}</p>
                <p className="text-sm text-slate-700 leading-relaxed">{value}</p>
              </div>
            ) : null
          )}
          {a.lesson_learned && (
            <div className="mt-2 p-3 bg-white/60 rounded-xl border border-white">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-0.5">Lesson Learned</p>
              <p className="text-sm text-slate-700 italic">"{a.lesson_learned}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Story Fingerprint ────────────────────────────────────────────────────────

function StoryFingerprint({ anecdotes }: { anecdotes: DigitalTwinAnecdote[] }) {
  if (!anecdotes.length) return null

  const pos = anecdotes.filter(a => a.emotion_valence === 'positive').length
  const neg = anecdotes.filter(a => a.emotion_valence === 'negative').length
  const neu = anecdotes.length - pos - neg
  const spontaneous = anecdotes.filter(a => a.spontaneous).length
  const avgConf = anecdotes.filter(a => a.confidence_signal != null).reduce((s, a) => s + (a.confidence_signal ?? 0), 0)
    / Math.max(1, anecdotes.filter(a => a.confidence_signal != null).length)

  const total = anecdotes.length

  return (
    <div className="card-lumino p-5 bg-gradient-to-br from-indigo-950 to-indigo-800 text-white">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={15} className="text-indigo-300" />
        <p className="text-sm font-bold text-white">Your Story Fingerprint</p>
        <span className="text-[10px] text-indigo-400 ml-auto">{total} stories captured</span>
      </div>

      {/* Emotion bar */}
      <div className="mb-4">
        <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-widest mb-2">Emotional Tone</p>
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
          {pos > 0 && (
            <div
              className="bg-emerald-400 rounded-l-full flex items-center justify-center"
              style={{ flex: pos }}
              title={`${pos} positive`}
            />
          )}
          {neu > 0 && (
            <div
              className="bg-slate-400"
              style={{ flex: neu }}
              title={`${neu} neutral`}
            />
          )}
          {neg > 0 && (
            <div
              className="bg-rose-400 rounded-r-full"
              style={{ flex: neg }}
              title={`${neg} challenging`}
            />
          )}
        </div>
        <div className="flex items-center gap-4 mt-2">
          {pos > 0 && <span className="text-[11px] text-emerald-400">{Math.round(pos / total * 100)}% positive</span>}
          {neu > 0 && <span className="text-[11px] text-slate-400">{Math.round(neu / total * 100)}% neutral</span>}
          {neg > 0 && <span className="text-[11px] text-rose-400">{Math.round(neg / total * 100)}% challenging</span>}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/10 rounded-xl p-3 text-center">
          <p className="text-lg font-extrabold text-white tabular-nums">{spontaneous}</p>
          <p className="text-[10px] text-indigo-300 mt-0.5">Spontaneous</p>
        </div>
        <div className="bg-white/10 rounded-xl p-3 text-center">
          <p className="text-lg font-extrabold text-white tabular-nums">{Math.round(avgConf * 100)}%</p>
          <p className="text-[10px] text-indigo-300 mt-0.5">Avg confidence</p>
        </div>
        <div className="bg-white/10 rounded-xl p-3 text-center">
          <p className="text-lg font-extrabold text-emerald-400 tabular-nums">{pos}</p>
          <p className="text-[10px] text-indigo-300 mt-0.5">Success stories</p>
        </div>
      </div>

      {/* Insight blurb */}
      <div className="mt-4 p-3 bg-white/10 rounded-xl">
        <p className="text-xs text-indigo-200 leading-relaxed">
          {spontaneous > 0
            ? `You've shared ${spontaneous} unprompted ${spontaneous === 1 ? 'story' : 'stories'} — a strong signal of genuine conviction.`
            : 'Share more stories spontaneously to boost your authenticity signal.'}
          {neg > 0
            ? ` Including ${neg} challenging ${neg === 1 ? 'story' : 'stories'} shows self-awareness and growth mindset.`
            : ''}
        </p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HumanStory() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userId = session?.userId

  const [profile, setProfile] = useState<DigitalTwinProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    api.getDigitalTwinProfile(userId)
      .then(setProfile)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader size={28} className="animate-spin text-indigo-500" />
          <p className="text-slate-500 text-sm">Reading your human story…</p>
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

  const empty = profile && (
    !profile.anecdotes.length &&
    !profile.motivations.length &&
    !profile.values.length &&
    !profile.goals.length &&
    !profile.culture_identities.length &&
    !profile.behavioral_insights.length
  )

  return (
    <>
      <title>Your Story - Lumino</title>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">

        {/* ── Header ── */}
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-950 tracking-tight flex items-center gap-3">
            <Brain size={28} className="text-indigo-500" />
            What We Know About You
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm max-w-2xl">
            Every story, value, motivation, and behavioral pattern we've learned from you — surfaced verbatim.
            This is the human layer of your Digital Twin.
          </p>

          {/* Transparency notice */}
          <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl">
            <Info size={14} className="text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-700 leading-relaxed">
              This data shapes how we match you to jobs — culture fit, soft skills, and behavioral signals.
              You can update or correct anything by talking to your{' '}
              <button
                onClick={() => navigate('/user/edit-graph')}
                className="font-semibold underline underline-offset-2"
              >
                Digital Twin editor
              </button>
              .
            </p>
          </div>
        </div>

        {/* ── Empty state ── */}
        {empty ? (
          <div className="card-lumino p-10 text-center">
            <Brain size={40} className="text-slate-200 mx-auto mb-4" />
            <p className="text-slate-600 font-semibold">Your story hasn't been written yet</p>
            <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
              Talk to your Digital Twin editor to share your anecdotes, motivations, and values —
              they're what make you more than a list of skills.
            </p>
            <button
              onClick={() => navigate('/user/edit-graph')}
              className="btn-primary mt-5 flex items-center gap-2 mx-auto"
            >
              <MessageSquare size={14} />
              Start the conversation
            </button>
          </div>
        ) : (
          <>
            {/* ── Anecdotes ── */}
            {profile!.anecdotes.length > 0 && (
              <Section icon={BookOpen} title="Your Stories" badge={profile!.anecdotes.length} accent="text-blue-500" bg="bg-blue-50">
                {/* Story Fingerprint */}
                <StoryFingerprint anecdotes={profile!.anecdotes} />

                {/* Anecdote cards */}
                <div className="mt-4 space-y-3">
                  {profile!.anecdotes.map((a: DigitalTwinAnecdote) => (
                    <AnecdoteCard key={a.name} a={a} />
                  ))}
                </div>
              </Section>
            )}

            {/* ── Motivations ── */}
            {profile!.motivations.length > 0 && (
              <Section icon={Flame} title="What Drives You" badge={profile!.motivations.length} accent="text-orange-500" bg="bg-orange-50">
                <div className="space-y-3">
                  {profile!.motivations.map((m: DigitalTwinMotivation) => {
                    const Icon = motivationIcon(m.category)
                    return (
                      <div key={m.name} className="card-lumino p-4 flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0">
                          <Icon size={15} className="text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-sm font-bold text-indigo-950">{m.name}</p>
                            {m.category && (
                              <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full capitalize">
                                {m.category}
                              </span>
                            )}
                          </div>
                          {/* Strength bar */}
                          <div className="flex items-center gap-2 mt-2">
                            <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${strengthColor(m.strength)} ${strengthWidth(m.strength)}`} />
                            </div>
                            <span className="text-[11px] text-slate-400 capitalize">{m.strength ?? 'unknown'} strength</span>
                          </div>
                          {m.evidence && (
                            <p className="text-xs text-slate-500 mt-2 leading-relaxed">{m.evidence}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* ── Values ── */}
            {profile!.values.length > 0 && (
              <Section icon={Shield} title="What You Stand For" badge={profile!.values.length} accent="text-purple-500" bg="bg-purple-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {profile!.values.map((v: DigitalTwinValue, i: number) => (
                    <div key={v.name} className="card-lumino p-4 flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0 text-xs font-extrabold text-purple-600">
                        #{v.priority_rank ?? i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-indigo-950">{v.name}</p>
                        {v.evidence && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{v.evidence}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Goals ── */}
            {profile!.goals.length > 0 && (
              <Section icon={Target} title="Where You're Headed" badge={profile!.goals.length} accent="text-emerald-500" bg="bg-emerald-50">
                <div className="space-y-3">
                  {profile!.goals.map((g: DigitalTwinGoal) => {
                    const chip = goalTypeChip(g.type)
                    const cl = clarityStyle(g.clarity_level)
                    return (
                      <div key={g.name} className="card-lumino p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-sm font-bold text-indigo-950">{g.name}</p>
                            {g.description && (
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{g.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                            {g.type && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${chip.bg} ${chip.text}`}>
                                {g.type}
                              </span>
                            )}
                            {g.timeframe_years != null && (
                              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                {g.timeframe_years === 0.5 ? '6 months'
                                  : g.timeframe_years < 1 ? `${Math.round(g.timeframe_years * 12)} months`
                                  : g.timeframe_years === 1 ? '1 year'
                                  : `${g.timeframe_years}y`}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Clarity meter */}
                        <div className="flex items-center gap-2 mt-3">
                          <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${cl.color} transition-all duration-700`}
                              style={{ width: `${cl.pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 flex-shrink-0">{cl.label} goal</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* ── Culture Identity ── */}
            {profile!.culture_identities.length > 0 && (
              <Section icon={Compass} title="How You Work" badge={profile!.culture_identities.length} accent="text-teal-500" bg="bg-teal-50">
                {profile!.culture_identities.map((c: DigitalTwinCultureIdentity) => (
                  <div key={c.name} className="card-lumino p-5 space-y-4">
                    <p className="text-sm font-bold text-indigo-950">{c.name}</p>

                    {/* Dimension grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Team Size', value: c.team_size_preference },
                        { label: 'Leadership Style', value: c.leadership_style },
                        { label: 'Conflict Approach', value: c.conflict_style },
                        { label: 'Feedback Preference', value: c.feedback_preference },
                        { label: 'Work Pace', value: c.pace_preference },
                      ].filter(d => d.value).map(d => (
                        <div key={d.label} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{d.label}</p>
                          <p className="text-sm font-semibold text-indigo-950 mt-0.5 capitalize">{d.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Energy sources/drains */}
                    {((c.energy_sources?.length ?? 0) > 0 || (c.energy_drains?.length ?? 0) > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                        {(c.energy_sources?.length ?? 0) > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Zap size={12} className="text-emerald-500" />
                              <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide">Energised by</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {c.energy_sources!.map(s => (
                                <span key={s} className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(c.energy_drains?.length ?? 0) > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Activity size={12} className="text-rose-500" />
                              <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wide">Drained by</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {c.energy_drains!.map(s => (
                                <span key={s} className="text-[11px] bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-full">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {/* ── Behavioral Insights ── */}
            {profile!.behavioral_insights.length > 0 && (
              <Section icon={Brain} title="Your Behavioral Patterns" badge={profile!.behavioral_insights.length} accent="text-violet-500" bg="bg-violet-50">
                <div className="space-y-3">
                  {profile!.behavioral_insights.map((b: DigitalTwinBehavioralInsight) => (
                    <div key={b.name} className="card-lumino p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <p className="text-sm font-bold text-indigo-950">{b.name}</p>
                        {b.insight_type && (
                          <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full capitalize">
                            {b.insight_type.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      {/* Trigger → Response → Implication chain */}
                      <div className="space-y-2">
                        {b.trigger && (
                          <div className="flex items-start gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                            <div>
                              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">When</p>
                              <p className="text-xs text-slate-600 leading-relaxed">{b.trigger}</p>
                            </div>
                          </div>
                        )}
                        {b.response_pattern && (
                          <div className="flex items-start gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0 mt-1.5" />
                            <div>
                              <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">You tend to</p>
                              <p className="text-xs text-slate-600 leading-relaxed">{b.response_pattern}</p>
                            </div>
                          </div>
                        )}
                        {b.implication && (
                          <div className="flex items-start gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-1.5" />
                            <div>
                              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">What this means</p>
                              <p className="text-xs text-slate-600 leading-relaxed">{b.implication}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Footer CTA ── */}
            <div className="card-lumino p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-indigo-950 border-0">
              <div>
                <p className="text-sm font-bold text-white">This is everything we know about you as a person.</p>
                <p className="text-xs text-indigo-300 mt-0.5">
                  Incomplete or inaccurate? The more we know, the better your matches.
                </p>
              </div>
              <button
                onClick={() => navigate('/user/edit-graph')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-indigo-700 text-sm font-bold hover:bg-indigo-50 transition-colors flex-shrink-0 shadow-sm"
              >
                <MessageSquare size={14} />
                Tell us more
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
