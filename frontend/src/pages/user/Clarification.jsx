import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight,
  FileText, HelpCircle, Info, Loader, MessageSquare, RefreshCw, ShieldCheck, Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

const IMPACT_META = {
  critical:  { badgeCls: 'bg-red-50 text-red-600 border-red-100',    label: 'Critical',  icon: AlertTriangle },
  important: { badgeCls: 'bg-amber-50 text-amber-700 border-amber-100', label: 'Important', icon: Info },
  minor:     { badgeCls: 'bg-slate-100 text-slate-500 border-slate-200', label: 'Minor',  icon: HelpCircle },
}

function ImpactBadge({ impact }) {
  const m = IMPACT_META[impact] || IMPACT_META.minor
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${m.badgeCls}`}>
      <Icon size={10} /> {m.label}
    </span>
  )
}

function ProgressBar({ resolved, total }) {
  const pct = total === 0 ? 100 : Math.round((resolved / total) * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5 text-slate-400">
        <span>{resolved} of {total} resolved</span>
        <span>{pct}%</span>
      </div>
      <div className="rounded-full h-2 bg-slate-100 overflow-hidden">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : '#137fec' }}
        />
      </div>
    </div>
  )
}

function QuestionCard({ q, onResolved }) {
  const { session } = useAuth()

  const [phase,          setPhase]    = useState(q.status !== 'pending' ? 'done' : 'idle')
  const [answer,         setAnswer]   = useState('')
  const [interpretation, setInterp]   = useState(null)
  const [followUp,       setFollowUp] = useState(null)
  const [saving,         setSaving]   = useState(false)
  const [err,            setErr]      = useState(null)

  async function handleInterpret() {
    if (!answer.trim()) return
    setPhase('interpreting')
    setErr(null)
    try {
      const res = await api.interpretFlag(session.userId, q.flag_id, answer.trim())
      setInterp(res)
      if (!res.is_complete) {
        setFollowUp(res.needs_clarification)
        setAnswer('')
        setPhase('typing')
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
      await api.resolveFlag(session.userId, q.flag_id, false,
        answer || 'Confirmed via natural language', interpretation.interpreted_value)
      setPhase('done')
      onResolved({ ...q, status: 'corrected' })
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmOriginal() {
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
    await api.skipFlag(session.userId, q.flag_id).catch(() => {})
    setPhase('done')
    onResolved({ ...q, status: 'skipped' })
  }

  if (phase === 'done') {
    const statusLabel = { confirmed: 'Confirmed ✓', corrected: 'Corrected ✓', skipped: 'Skipped' }
    const statusColor = { confirmed: 'text-emerald-600', corrected: 'text-amber-600', skipped: 'text-slate-400' }
    return (
      <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-4 opacity-60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ImpactBadge impact={q.resolution_impact} />
          <span className="text-sm text-slate-400">{q.field}</span>
        </div>
        <span className={`text-xs font-semibold ${statusColor[q.status] || 'text-slate-400'}`}>
          {statusLabel[q.status] || q.status}
        </span>
      </div>
    )
  }

  const borderColor = q.resolution_impact === 'critical'
    ? 'border-l-red-400'
    : q.resolution_impact === 'important'
    ? 'border-l-amber-400'
    : 'border-l-slate-300'

  const headerBg = q.resolution_impact === 'critical'
    ? 'bg-red-50'
    : q.resolution_impact === 'important'
    ? 'bg-amber-50'
    : 'bg-slate-50'

  return (
    <div className={`bg-white rounded-2xl shadow-prism border border-slate-100 overflow-hidden border-l-4 ${borderColor}`}>
      {/* Header */}
      <div className={`px-5 py-3 flex items-center justify-between ${headerBg}`}>
        <div className="flex items-center gap-2">
          <ImpactBadge impact={q.resolution_impact} />
          <code className="text-xs text-slate-400 bg-white rounded px-1.5 py-0.5 border border-slate-200">{q.field}</code>
        </div>
        <button onClick={handleSkip} className="text-xs text-slate-400 hover:text-indigo-950 transition-colors">
          Skip
        </button>
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* From resume */}
        <div className="rounded-lg px-4 py-3 bg-slate-50 border border-slate-200">
          <p className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <FileText size={11} /> From your resume
          </p>
          <p className="text-sm italic text-indigo-950">"{q.raw_text}"</p>
        </div>

        {/* AI interpretation */}
        <div className="rounded-lg px-4 py-3 bg-primary-50 border border-primary-100">
          <p className="text-xs font-medium text-primary-600 mb-1 flex items-center gap-1.5">
            <Sparkles size={11} /> AI interpreted this as
          </p>
          <p className="text-sm text-indigo-950">{q.interpreted_as}</p>
          <p className="text-xs text-slate-400 mt-1">{q.ambiguity_reason}</p>
        </div>

        {/* Phase: idle */}
        {phase === 'idle' && (
          <>
            <p className="text-sm font-medium text-indigo-950">{q.clarification_question}</p>
            <p className="text-xs text-slate-400">Tell us in your own words, or confirm the AI was right.</p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmOriginal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-all"
              >
                <CheckCircle2 size={13} /> AI was right
              </button>
              <button
                onClick={() => setPhase('typing')}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-all"
              >
                <MessageSquare size={13} /> Let me describe it
              </button>
            </div>
          </>
        )}

        {/* Phase: typing */}
        {phase === 'typing' && (
          <>
            {followUp && (
              <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-sm">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-xs">Your previous answer was too vague:</p>
                  <p className="text-sm mt-0.5">{followUp}</p>
                </div>
              </div>
            )}
            {!followUp && <p className="text-sm text-indigo-950">{q.clarification_question}</p>}
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Be specific — what exactly? How many? What was your role?"
              rows={4}
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-indigo-950 resize-none"
            />
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setPhase('idle'); setFollowUp(null); setAnswer('') }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-all"
              >
                ← Back
              </button>
              <button
                onClick={handleInterpret}
                disabled={!answer.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl font-bold hover:bg-primary-600 transition-all disabled:opacity-40"
              >
                See how I interpreted this <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {/* Phase: interpreting */}
        {phase === 'interpreting' && (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-primary-500" />
            <p className="text-sm text-slate-400">Interpreting your answer…</p>
          </div>
        )}

        {/* Phase: confirming */}
        {phase === 'confirming' && interpretation && (
          <>
            <div className="rounded-lg px-4 py-3 bg-slate-50 border border-slate-200">
              <p className="text-xs font-medium text-slate-400 mb-1">What you said</p>
              <p className="text-sm italic text-indigo-950">"{answer}"</p>
            </div>

            <div className="rounded-lg px-4 py-3 bg-emerald-50 border border-emerald-200">
              <p className="text-xs font-medium text-emerald-600 mb-1 flex items-center gap-1.5">
                <Sparkles size={11} /> I understood this as
              </p>
              <p className="text-sm font-medium text-indigo-950">{interpretation.interpreted_value}</p>
              <p className="text-xs text-slate-400 mt-1">{interpretation.explanation}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs text-slate-400">Confidence:</span>
                <span className={`text-xs font-semibold capitalize ${
                  interpretation.confidence === 'high' ? 'text-emerald-600'
                  : interpretation.confidence === 'medium' ? 'text-amber-600'
                  : 'text-red-500'
                }`}>{interpretation.confidence}</span>
              </div>
            </div>

            <p className="text-sm font-medium text-indigo-950">Is this the right interpretation to save?</p>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setPhase('typing'); setInterp(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-all"
              >
                <RefreshCw size={13} /> Rephrase
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all disabled:opacity-60"
              >
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
  const navigate    = useNavigate()

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [filter,  setFilter]  = useState('pending')

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
      const questions       = prev.questions.map(q => q.flag_id === updated.flag_id ? { ...q, ...updated } : q)
      const pending         = questions.filter(q => q.status === 'pending').length
      const resolved        = questions.filter(q => q.status !== 'pending').length
      const criticalPending = questions.filter(q => q.status === 'pending' && q.resolution_impact === 'critical').length
      return { ...prev, questions, pending, resolved, graph_verified: criticalPending === 0 && questions.length > 0 }
    })
  }

  const visible         = data?.questions.filter(q => filter === 'all' || q.status === 'pending') ?? []
  const criticalPending = data?.questions.filter(q => q.status === 'pending' && q.resolution_impact === 'critical').length ?? 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-primary-500" />
    </div>
  )

  if (error) return (
    <div className="p-8 max-w-2xl">
      <p className="text-sm text-red-500">{error}</p>
    </div>
  )

  return (
    <div className="p-8 max-w-3xl">

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <ShieldCheck size={22} className={data?.graph_verified ? 'text-emerald-500' : 'text-amber-500'} />
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Verify Your Profile</h1>
        </div>
        <p className="text-lg text-slate-500 mt-2 leading-relaxed">
          The AI made {data?.total_flags ?? 0} interpretations from your resume.
          Review each one to ensure your knowledge graph is accurate.
        </p>
      </div>

      {data?.graph_verified && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm mb-5">
          <CheckCircle2 size={18} className="flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">Graph verified</p>
            <p className="text-xs mt-0.5">All critical interpretations confirmed. You are your graph.</p>
          </div>
        </div>
      )}

      {!data?.graph_verified && criticalPending > 0 && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-sm mb-5">
          <AlertTriangle size={15} className="flex-shrink-0" />
          {criticalPending} critical {criticalPending === 1 ? 'question' : 'questions'} affect your match scores.
        </div>
      )}

      <div className="mb-5"><ProgressBar resolved={data?.resolved ?? 0} total={data?.total_flags ?? 0} /></div>

      {/* Impact counts */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {['critical', 'important', 'minor'].map(impact => {
          const count = data?.questions.filter(q => q.resolution_impact === impact && q.status === 'pending').length ?? 0
          const m = IMPACT_META[impact]
          return (
            <div key={impact} className="bg-white rounded-2xl shadow-prism border border-slate-100 p-3 text-center">
              <p className={`text-xl font-bold ${
                impact === 'critical' ? 'text-red-500' : impact === 'important' ? 'text-amber-600' : 'text-slate-400'
              }`}>{count}</p>
              <p className="text-xs text-slate-400 mt-0.5">{m.label} left</p>
            </div>
          )
        })}
      </div>

      {(data?.resolved ?? 0) > 0 && (
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 mb-5">
          {['pending', 'all'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                filter === f ? 'bg-white shadow-sm text-indigo-950' : 'text-slate-400 hover:text-indigo-950'
              }`}>
              {f === 'pending' ? `Pending (${data?.pending ?? 0})` : `All (${data?.total_flags ?? 0})`}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl shadow-prism border border-slate-100">
          <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-400" />
          <p className="font-medium text-indigo-950">All caught up!</p>
          <p className="text-sm text-slate-400 mt-1">No pending questions.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map(q => <QuestionCard key={q.flag_id} q={q} onResolved={onResolved} />)}
        </div>
      )}

      <div className="flex gap-3 mt-8">
        <button
          onClick={() => navigate('/user/model')}
          className="flex items-center gap-1.5 px-5 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
        >
          <ChevronLeft size={15} /> View Graph
        </button>
        <button
          onClick={() => navigate('/user/dashboard')}
          className="flex-1 flex items-center justify-center gap-1.5 px-5 py-3 bg-primary-500 text-white rounded-xl font-bold hover:bg-primary-600 transition-all"
        >
          Browse Jobs <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
