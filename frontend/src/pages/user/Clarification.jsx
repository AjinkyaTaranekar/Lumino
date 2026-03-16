import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  Info,
  Loader,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

const C = {
  bg: '#0a1628', card: '#16213e', border: '#0f3460',
  accent: '#e94560', green: '#27ae60', yellow: '#f39c12',
  muted: '#8892a4', text: '#e0e0e0',
}

const IMPACT_META = {
  critical: { color: C.accent, bg: 'rgba(233,69,96,0.12)', label: 'Critical', icon: AlertTriangle },
  important: { color: C.yellow, bg: 'rgba(243,156,18,0.12)', label: 'Important', icon: Info },
  minor: { color: C.muted, bg: 'rgba(136,146,164,0.12)', label: 'Minor', icon: HelpCircle },
}

function ImpactBadge({ impact }) {
  const m = IMPACT_META[impact] || IMPACT_META.minor
  const Icon = m.icon
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: m.bg, color: m.color }}>
      <Icon size={11} />{m.label}
    </span>
  )
}

function ProgressBar({ resolved, total }) {
  const pct = total === 0 ? 100 : Math.round((resolved / total) * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
        <span>{resolved} of {total} resolved</span><span>{pct}%</span>
      </div>
      <div className="rounded-full h-2" style={{ background: C.border }}>
        <div className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: pct === 100 ? C.green : C.accent }} />
      </div>
    </div>
  )
}

// ── States for a single question ──────────────────────────────────────────────
// idle → typing → interpreting → confirming → done

function QuestionCard({ q, onResolved }) {
  const { session } = useAuth()

  const [phase, setPhase] = useState(q.status !== 'pending' ? 'done' : 'idle')
  const [answer, setAnswer] = useState('')
  const [interpretation, setInterp] = useState(null)   // result from /interpret
  const [followUp, setFollowUp] = useState(null)   // if is_complete=false
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  async function handleInterpret() {
    if (!answer.trim()) return
    setPhase('interpreting')
    setErr(null)
    try {
      const res = await api.interpretFlag(session.userId, q.flag_id, answer.trim())
      setInterp(res)
      if (!res.is_complete) {
        // Answer is still vague — show follow-up question
        setFollowUp(res.needs_clarification)
        setAnswer('')
        setPhase('typing')  // show the follow-up Q in the text area heading
      } else {
        setPhase('confirming')
      }
    } catch (e) {
      setErr(e.message)
      setPhase('idle')
    }
  }

  async function handleConfirm() {
    setSaving(true)
    try {
      await api.resolveFlag(
        session.userId, q.flag_id,
        false,                          // is_correct=false (user is providing correction)
        answer || 'Confirmed via natural language',
        interpretation.interpreted_value,
      )
      setPhase('done')
      onResolved({ ...q, status: 'corrected' })
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmOriginal() {
    // User says the original AI interpretation WAS correct
    setSaving(true)
    try {
      await api.resolveFlag(session.userId, q.flag_id, true, 'Confirmed original interpretation', null)
      setPhase('done')
      onResolved({ ...q, status: 'confirmed' })
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip() {
    await api.skipFlag(session.userId, q.flag_id).catch(() => { })
    setPhase('done')
    onResolved({ ...q, status: 'skipped' })
  }

  // ── Resolved state ───────────────────────────────────────────────────────
  if (phase === 'done') {
    const statusLabel = { confirmed: 'Confirmed ✓', corrected: 'Corrected ✓', skipped: 'Skipped' }
    const statusColor = { confirmed: C.green, corrected: C.yellow, skipped: C.muted }
    return (
      <div className="rounded-xl p-4 flex items-center justify-between"
        style={{ background: C.card, border: `1px solid ${C.border}`, opacity: 0.65 }}>
        <div className="flex items-center gap-3">
          <ImpactBadge impact={q.resolution_impact} />
          <span className="text-sm" style={{ color: C.muted }}>{q.field}</span>
        </div>
        <span className="text-xs font-semibold" style={{ color: statusColor[q.status] || C.muted }}>
          {statusLabel[q.status] || q.status}
        </span>
      </div>
    )
  }

  const impactMeta = IMPACT_META[q.resolution_impact] || IMPACT_META.minor

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${impactMeta.color}` }}>

      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between"
        style={{ background: impactMeta.bg }}>
        <div className="flex items-center gap-2">
          <ImpactBadge impact={q.resolution_impact} />
          <code className="text-xs" style={{ color: C.muted }}>{q.field}</code>
        </div>
        <button onClick={handleSkip} className="text-xs" style={{ color: C.muted }}>
          Skip
        </button>
      </div>

      <div className="px-5 py-5" style={{ background: C.card }}>

        {/* Resume snippet */}
        <div className="rounded-lg px-4 py-3 mb-4"
          style={{ background: '#0a1628', border: `1px solid ${C.border}` }}>
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: C.muted }}>
            <FileText size={11} /> From your resume
          </p>
          <p className="text-sm italic" style={{ color: C.text }}>"{q.raw_text}"</p>
        </div>

        {/* Original AI interpretation */}
        <div className="rounded-lg px-4 py-3 mb-4"
          style={{ background: 'rgba(233,69,96,0.06)', border: '1px solid rgba(233,69,96,0.2)' }}>
          <p className="text-xs font-semibold mb-1 flex items-center gap-1.5" style={{ color: C.accent }}>
            <Sparkles size={11} /> AI initially interpreted this as
          </p>
          <p className="text-sm" style={{ color: C.text }}>{q.interpreted_as}</p>
          <p className="text-xs mt-1" style={{ color: C.muted }}>{q.ambiguity_reason}</p>
        </div>

        {/* Phase: idle — show the question + "confirm original" option */}
        {phase === 'idle' && (
          <>
            <p className="text-sm font-medium mb-2" style={{ color: C.text }}>
              {q.clarification_question}
            </p>
            <p className="text-xs mb-4" style={{ color: C.muted }}>
              Tell me in your own words — be as specific as possible. Or confirm the AI was right.
            </p>
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleConfirmOriginal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(39,174,96,0.15)', color: C.green, border: `1px solid ${C.green}` }}>
                <CheckCircle2 size={13} /> AI was right
              </button>
              <button
                onClick={() => setPhase('typing')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                style={{ background: C.border, color: C.text }}>
                <MessageSquare size={13} /> Let me describe it
              </button>
            </div>
          </>
        )}

        {/* Phase: typing — natural language input */}
        {phase === 'typing' && (
          <>
            {/* Follow-up question if previous answer was vague */}
            {followUp && (
              <div className="rounded-lg px-4 py-3 mb-4"
                style={{ background: 'rgba(243,156,18,0.08)', border: '1px solid rgba(243,156,18,0.3)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: C.yellow }}>
                  Your previous answer was too vague. Please be more specific:
                </p>
                <p className="text-sm" style={{ color: C.text }}>{followUp}</p>
              </div>
            )}

            {!followUp && (
              <p className="text-sm mb-3" style={{ color: C.text }}>
                {q.clarification_question}
              </p>
            )}

            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Describe in your own words — be specific. What exactly? How many? What was your role?"
              rows={4}
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none mb-3"
              style={{
                background: '#0a1628', border: `1px solid ${C.border}`,
                color: C.text, lineHeight: '1.5',
              }}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.border}
            />

            {err && <p className="text-xs mb-3" style={{ color: '#e74c3c' }}>{err}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setPhase('idle'); setFollowUp(null); setAnswer('') }}
                className="px-3 py-2 rounded-xl text-xs"
                style={{ background: C.border, color: C.muted }}>
                ← Back
              </button>
              <button
                onClick={handleInterpret}
                disabled={!answer.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: C.accent, color: '#fff' }}
                onMouseEnter={e => answer.trim() && (e.currentTarget.style.background = '#c73652')}
                onMouseLeave={e => e.currentTarget.style.background = C.accent}>
                See how I interpreted this <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {/* Phase: interpreting — loading */}
        {phase === 'interpreting' && (
          <div className="flex flex-col items-center py-6 gap-3">
            <Loader size={24} className="animate-spin" style={{ color: C.accent }} />
            <p className="text-sm" style={{ color: C.muted }}>Interpreting your answer…</p>
          </div>
        )}

        {/* Phase: confirming — show interpretation for approval */}
        {phase === 'confirming' && interpretation && (
          <>
            {/* What I said */}
            <div className="rounded-lg px-4 py-3 mb-3"
              style={{ background: '#0a1628', border: `1px solid ${C.border}` }}>
              <p className="text-xs font-semibold mb-1" style={{ color: C.muted }}>What you said</p>
              <p className="text-sm italic" style={{ color: C.text }}>"{answer}"</p>
            </div>

            {/* LLM interpretation */}
            <div className="rounded-lg px-4 py-3 mb-4"
              style={{ background: 'rgba(39,174,96,0.08)', border: `1px solid ${C.green}` }}>
              <p className="text-xs font-semibold mb-1 flex items-center gap-1.5" style={{ color: C.green }}>
                <Sparkles size={11} /> I understood this as
              </p>
              <p className="text-sm font-medium mb-1" style={{ color: C.text }}>
                {interpretation.interpreted_value}
              </p>
              <p className="text-xs" style={{ color: C.muted }}>{interpretation.explanation}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs" style={{ color: C.muted }}>Confidence:</span>
                <span className="text-xs font-semibold capitalize" style={{
                  color: interpretation.confidence === 'high' ? C.green
                    : interpretation.confidence === 'medium' ? C.yellow : C.accent
                }}>{interpretation.confidence}</span>
              </div>
            </div>

            <p className="text-sm font-medium mb-4" style={{ color: C.text }}>
              Is this the right interpretation to save to your graph?
            </p>

            {err && <p className="text-xs mb-3" style={{ color: '#e74c3c' }}>{err}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setPhase('typing'); setInterp(null) }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm"
                style={{ background: C.border, color: C.muted }}>
                <RefreshCw size={14} /> Rephrase
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: C.green, color: '#fff' }}
                onMouseEnter={e => !saving && (e.currentTarget.style.background = '#1e8449')}
                onMouseLeave={e => e.currentTarget.style.background = C.green}>
                {saving ? <Loader size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {saving ? 'Saving…' : 'Yes, save this to my graph'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function Clarification() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('pending')

  const load = useCallback(async () => {
    try {
      const res = await api.getClarifications(session.userId)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [session.userId])

  useEffect(() => { load() }, [load])

  function onResolved(updated) {
    setData(prev => {
      const questions = prev.questions.map(q => q.flag_id === updated.flag_id ? { ...q, ...updated } : q)
      const pending = questions.filter(q => q.status === 'pending').length
      const resolved = questions.filter(q => q.status !== 'pending').length
      const criticalPending = questions.filter(q => q.status === 'pending' && q.resolution_impact === 'critical').length
      return { ...prev, questions, pending, resolved, graph_verified: criticalPending === 0 && questions.length > 0 }
    })
  }

  const visible = data?.questions.filter(q => filter === 'all' ? true : q.status === 'pending') ?? []
  const criticalPending = data?.questions.filter(q => q.status === 'pending' && q.resolution_impact === 'critical').length ?? 0

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2"
          style={{ borderColor: C.accent, borderTopColor: 'transparent' }} />
      </div>
    </Layout>
  )

  if (error) return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-sm" style={{ color: '#e74c3c' }}>{error}</p>
      </div>
    </Layout>
  )

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-10">

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck size={22} style={{ color: data?.graph_verified ? C.green : C.accent }} />
            <h1 className="text-2xl font-bold" style={{ color: C.text }}>Verify Your Profile</h1>
          </div>
          <p className="text-sm" style={{ color: C.muted }}>
            The AI made {data?.total_flags ?? 0} interpretations from your resume.
            For each one, tell us in your own words — we'll show you exactly how we understood it before saving.
          </p>
        </div>

        {data?.graph_verified && (
          <div className="rounded-xl px-5 py-4 mb-5 flex items-center gap-3"
            style={{ background: 'rgba(39,174,96,0.1)', border: `1px solid ${C.green}` }}>
            <CheckCircle2 size={20} style={{ color: C.green }} />
            <div>
              <p className="font-semibold text-sm" style={{ color: C.green }}>Graph verified</p>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>All critical interpretations confirmed. You are your graph.</p>
            </div>
          </div>
        )}

        {!data?.graph_verified && criticalPending > 0 && (
          <div className="rounded-xl px-5 py-4 mb-5 flex items-center gap-3"
            style={{ background: 'rgba(233,69,96,0.08)', border: '1px solid rgba(233,69,96,0.3)' }}>
            <AlertTriangle size={18} style={{ color: C.accent }} />
            <p className="text-sm" style={{ color: C.accent }}>
              {criticalPending} critical {criticalPending === 1 ? 'question' : 'questions'} affect your job match scores.
            </p>
          </div>
        )}

        <div className="mb-5"><ProgressBar resolved={data?.resolved ?? 0} total={data?.total_flags ?? 0} /></div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {['critical', 'important', 'minor'].map(impact => {
            const count = data?.questions.filter(q => q.resolution_impact === impact && q.status === 'pending').length ?? 0
            const m = IMPACT_META[impact]
            return (
              <div key={impact} className="rounded-xl p-3 text-center"
                style={{ background: C.card, border: `1px solid ${C.border}` }}>
                <p className="text-xl font-bold" style={{ color: m.color }}>{count}</p>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>{m.label} left</p>
              </div>
            )
          })}
        </div>

        {(data?.resolved ?? 0) > 0 && (
          <div className="flex gap-1 p-1 rounded-xl mb-4 inline-flex"
            style={{ background: C.card, border: `1px solid ${C.border}` }}>
            {['pending', 'all'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium capitalize"
                style={{ background: filter === f ? C.accent : 'transparent', color: filter === f ? '#fff' : C.muted }}>
                {f === 'pending' ? `Pending (${data?.pending ?? 0})` : `All (${data?.total_flags ?? 0})`}
              </button>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: C.green }} />
            <p className="font-medium" style={{ color: C.text }}>All caught up!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {visible.map(q => <QuestionCard key={q.flag_id} q={q} onResolved={onResolved} />)}
          </div>
        )}

        <div className="flex gap-3 mt-8">
          <button onClick={() => navigate('/user/model')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: C.card, color: C.muted, border: `1px solid ${C.border}` }}>
            <ChevronLeft size={15} /> View Graph
          </button>
          <button onClick={() => navigate('/user/dashboard')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: C.accent, color: '#fff' }}>
            Browse Jobs <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </Layout>
  )
}
