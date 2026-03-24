import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileText,
  Loader,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
  Upload as UploadIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LuminoIcon from '../../components/LuminoIcon'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { markOnboardingComplete } from '../../lib/onboarding'
import type { ClarificationQuestion, IngestUserResponse } from '../../lib/types'

// ─── Step types ───────────────────────────────────────────────────────────────

type Step = 'welcome' | 'upload' | 'results' | 'verify' | 'done'

const STEP_LABELS = ['Upload', 'Analysis', 'Verify', 'Done']
const STEP_INDEX: Record<Step, number> = {
  welcome: -1, upload: 0, results: 1, verify: 2, done: 3,
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const current = STEP_INDEX[step]
  if (current < 0) return null
  return (
    <div className="flex items-center justify-center gap-0 mb-10" role="list" aria-label="Onboarding steps">
      {STEP_LABELS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center" role="listitem">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-200'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span className={`text-[11px] mt-1.5 font-medium ${active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`w-12 h-0.5 mb-5 mx-1 transition-colors ${i < current ? 'bg-emerald-300' : 'bg-slate-200'}`} aria-hidden="true" />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Welcome step ─────────────────────────────────────────────────────────────

function WelcomeStep({ name, onNext }: { name: string; onNext: () => void }) {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col items-center justify-center text-center"
    >
      <div className="mb-6">
        <LuminoIcon size="2xl" shadow />
      </div>

      <h1 className="text-3xl font-extrabold text-indigo-950 tracking-tight mb-3">
        Hi {name}, we want to know you better
      </h1>
      <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto mb-8">
        To match you with the right opportunities, we'll build your personal knowledge graph - a precise digital twin of your skills, experience, and goals.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-10 text-left">
        {[
          { icon: FileText, title: 'Upload Resume', desc: 'We extract your skills, domains, and experiences' },
          { icon: Sparkles, title: 'AI Analysis', desc: 'We build your personal knowledge graph' },
          { icon: ShieldCheck, title: 'Quick Verify', desc: 'Confirm a few AI interpretations in minutes' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="card-lumino p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Icon size={18} className="text-blue-500" />
            </div>
            <p className="text-xs font-semibold text-indigo-950 mb-1">{title}</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="btn-primary btn-lg px-10 flex items-center gap-2 mx-auto focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
      >
        Get Started <ArrowRight size={16} />
      </button>
      <p className="text-xs text-slate-400 mt-3">Takes about 3 minutes</p>
    </motion.div>
  )
}

// ─── Upload step ──────────────────────────────────────────────────────────────

type TabType = 'pdf' | 'text'

interface UploadStepProps {
  userId: string
  onDone: (result: IngestUserResponse) => void
}

function UploadStep({ userId, onDone }: UploadStepProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<TabType>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function handleAnalyse() {
    setError(null)
    setLoading(true)
    try {
      let data: IngestUserResponse
      if (tab === 'pdf') {
        if (!file) throw new Error('Please select a PDF file.')
        data = await api.uploadUserPdf(userId, file)
      } else {
        if (!text.trim()) throw new Error('Please paste your profile text.')
        data = await api.ingestUser(userId, text.trim())
      }
      onDone(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') { setFile(f); setError(null) }
    else setError('Only PDF files are accepted.')
  }

  return (
    <motion.div
      key="upload"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
    >
      <div className="text-center mb-8">
        <h2 className="text-2xl font-extrabold text-indigo-950 tracking-tight">Upload your resume</h2>
        <p className="text-sm text-slate-500 mt-2">We'll turn it into your digital twin - skills, experience, everything.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200 mb-6" role="tablist">
        {(['pdf', 'text'] as TabType[]).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === t ? 'bg-white text-indigo-950 shadow-sm' : 'text-slate-500 hover:text-indigo-950'
              }`}
          >
            {t === 'pdf' ? 'Upload PDF' : 'Paste Text'}
          </button>
        ))}
      </div>

      {/* PDF drop zone */}
      {tab === 'pdf' && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
          tabIndex={0}
          role="button"
          aria-label={file ? `Selected: ${file.name}` : 'Drop PDF or click to browse'}
          className={`rounded-2xl p-10 text-center cursor-pointer border-2 border-dashed transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${dragging ? 'border-blue-400 bg-blue-50'
              : file ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40'
            }`}
        >
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }} />
          {file ? (
            <>
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <FileText size={24} className="text-emerald-600" />
              </div>
              <p className="font-bold text-emerald-700">{file.name}</p>
              <p className="text-sm text-slate-500 mt-1">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
                <UploadIcon size={24} className="text-slate-400" />
              </div>
              <p className="font-bold text-slate-700">Drop your PDF here or click to browse</p>
              <p className="text-sm text-slate-400 mt-1">PDF resume up to 10 MB</p>
            </>
          )}
        </div>
      )}

      {/* Text paste */}
      {tab === 'text' && (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste your resume or LinkedIn profile text here…"
          rows={10}
          className="input resize-none leading-relaxed focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      )}

      {error && (
        <div className="alert-error mt-4" role="alert">
          <AlertTriangle size={14} /><span>{error}</span>
        </div>
      )}

      <button
        onClick={handleAnalyse}
        disabled={loading || (tab === 'pdf' ? !file : !text.trim())}
        className="btn-primary btn-lg w-full mt-6 flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
      >
        {loading ? <><Loader size={16} className="animate-spin" /> Analysing your profile…</> : <>Analyse Profile <ArrowRight size={16} /></>}
      </button>
    </motion.div>
  )
}

// ─── Results step ─────────────────────────────────────────────────────────────

interface ResultsStepProps {
  result: IngestUserResponse
  onNext: () => void
  hasFlags: boolean
}

function ResultsStep({ result, onNext, hasFlags }: ResultsStepProps) {
  const stats = [
    { label: 'Skills', value: result.skills_extracted, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Domains', value: result.domains_extracted, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Projects', value: result.projects_extracted, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Experiences', value: result.experiences_extracted, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    ...(result.education_extracted ? [{ label: 'Education', value: result.education_extracted, color: 'text-sky-600', bg: 'bg-sky-50' }] : []),
    ...(result.certifications_extracted ? [{ label: 'Certifications', value: result.certifications_extracted, color: 'text-teal-600', bg: 'bg-teal-50' }] : []),
    ...(result.achievements_extracted ? [{ label: 'Achievements', value: result.achievements_extracted, color: 'text-amber-600', bg: 'bg-amber-50' }] : []),
    ...(result.publications_extracted ? [{ label: 'Publications', value: result.publications_extracted, color: 'text-purple-600', bg: 'bg-purple-50' }] : []),
  ]

  return (
    <motion.div
      key="results"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
    >
      <div className="text-center mb-8">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={28} className="text-emerald-600" />
        </div>
        <h2 className="text-2xl font-extrabold text-indigo-950 tracking-tight">Profile analysed</h2>
        <p className="text-sm text-slate-500 mt-2">Here's what we extracted from your resume.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {stats.map(({ label, value, color, bg }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="stat-card text-center"
          >
            <div className={`w-10 h-10 mx-auto mb-2 rounded-2xl ${bg} flex items-center justify-center`}>
              <Network size={18} className={color} />
            </div>
            <p className={`text-3xl font-extrabold ${color} tracking-tight`}>{value}</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">{label}</p>
          </motion.div>
        ))}
      </div>

      {hasFlags ? (
        <div className="rounded-2xl p-4 bg-amber-50 border border-amber-200 mb-6 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles size={16} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {result.interpretation_flags} thing{result.interpretation_flags !== 1 ? 's' : ''} to clarify
            </p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              The AI made a few inferences from your resume. We'll ask you to quickly confirm or correct them - it takes under 2 minutes.
            </p>
          </div>
        </div>
      ) : (
        <div className="alert-success mb-6">
          <ShieldCheck size={15} /><span>No ambiguities - your profile is fully verified!</span>
        </div>
      )}

      <button
        onClick={onNext}
        className="btn-primary btn-lg w-full flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
      >
        {hasFlags ? <>Start Verification <ArrowRight size={16} /></> : <>View My Matches <ArrowRight size={16} /></>}
      </button>
    </motion.div>
  )
}

// ─── Verify step ──────────────────────────────────────────────────────────────

interface VerifyStepProps {
  userId: string
  onDone: () => void
}

type QuestionPhase = 'idle' | 'correcting' | 'saving'

function VerifyStep({ userId, onDone }: VerifyStepProps) {
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([])
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<QuestionPhase>('idle')
  const [correction, setCorrection] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api.getClarifications(userId)
      const pending = res.questions.filter(q => q.status === 'pending')
      setQuestions(pending)
      if (pending.length === 0) onDone()
    } catch {
      // If fetch fails, skip verify step
      onDone()
    } finally {
      setLoading(false)
    }
  }, [userId, onDone])

  useEffect(() => { load() }, [load])

  const q = questions[current]
  const total = questions.length
  const pct = total === 0 ? 100 : Math.round((current / total) * 100)

  async function handleConfirm() {
    setSaving(true)
    setErr(null)
    try {
      await api.resolveFlag(userId, q.flag_id, true, 'Confirmed original interpretation', null)
      advance()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveCorrection() {
    if (!correction.trim()) return
    setSaving(true)
    setErr(null)
    try {
      await api.resolveFlag(userId, q.flag_id, false, correction.trim(), correction.trim())
      advance()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip() {
    try { await api.skipFlag(userId, q.flag_id) } catch { /* ignore */ }
    advance()
  }

  function advance() {
    setPhase('idle')
    setCorrection('')
    setErr(null)
    if (current + 1 >= total) {
      onDone()
    } else {
      setCurrent(i => i + 1)
    }
  }

  if (loading) {
    return (
      <motion.div key="verify-loading" className="flex flex-col items-center py-20 gap-4">
        <Loader size={28} className="animate-spin text-blue-500" />
        <p className="text-sm text-slate-400">Loading your questions…</p>
      </motion.div>
    )
  }

  if (!q) return null

  const borderColor = q.resolution_impact === 'critical' ? 'border-l-red-400'
    : q.resolution_impact === 'important' ? 'border-l-amber-400'
      : 'border-l-slate-200'

  return (
    <motion.div
      key="verify"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
    >
      {/* Persona header */}
      <div className="flex items-center gap-3 mb-6 p-4 rounded-2xl bg-blue-50 border border-blue-100">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
          <Sparkles size={18} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-indigo-950">AI Profile Consultant</p>
          <p className="text-xs text-slate-500">I have {total} quick question{total !== 1 ? 's' : ''} to make sure I understood you correctly.</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
          <span>Question {current + 1} of {total}</span>
          <span>{pct}% done</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Question card */}
      <div className={`card-lumino overflow-hidden border-l-4 ${borderColor} mb-4`}>
        <div className="px-5 py-4 space-y-4">

          {/* Excerpt from resume */}
          <div className="rounded-xl px-4 py-3 bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-medium text-slate-400 mb-1">From your resume</p>
            <p className="text-sm italic text-indigo-950">"{q.raw_text}"</p>
          </div>

          {/* AI interpretation */}
          <div className="rounded-xl px-4 py-3 bg-blue-50 border border-blue-100">
            <p className="text-[11px] font-medium text-blue-600 mb-1 flex items-center gap-1.5">
              <Sparkles size={10} /> I interpreted this as
            </p>
            <p className="text-sm text-indigo-950 font-medium">{q.interpreted_as}</p>
            {q.ambiguity_reason && <p className="text-xs text-slate-400 mt-1">{q.ambiguity_reason}</p>}
          </div>

          {/* The question */}
          <p className="text-sm font-semibold text-indigo-950">{q.clarification_question}</p>

          {/* Suggested options */}
          {q.suggested_options && q.suggested_options.length > 0 && phase === 'idle' && (
            <div className="flex flex-wrap gap-2">
              {q.suggested_options.map(opt => (
                <button
                  key={opt}
                  onClick={async () => {
                    setSaving(true)
                    try {
                      await api.resolveFlag(userId, q.flag_id, false, opt, opt)
                      advance()
                    } catch (e) {
                      setErr((e as Error).message)
                    } finally {
                      setSaving(false)
                    }
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* Correction textarea */}
          {phase === 'correcting' && (
            <div className="space-y-3">
              <textarea
                value={correction}
                onChange={e => setCorrection(e.target.value)}
                placeholder="Describe it in your own words…"
                rows={3}
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-indigo-950 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setPhase('idle'); setCorrection('') }}
                  className="btn-secondary btn-sm"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSaveCorrection}
                  disabled={!correction.trim() || saving}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <Loader size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Save & Continue
                </button>
              </div>
            </div>
          )}

          {/* Main action buttons */}
          {phase === 'idle' && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              >
                {saving ? <Loader size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                That's right
              </button>
              <button
                onClick={() => setPhase('correcting')}
                disabled={saving}
                className="btn-secondary flex-1 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <MessageSquare size={13} /> Clarify
              </button>
            </div>
          )}

          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
      </div>

      {/* Skip button */}
      <button
        onClick={handleSkip}
        disabled={saving}
        className="text-xs text-slate-400 hover:text-slate-600 transition-colors w-full text-center mt-1 focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
      >
        Skip this question
      </button>
    </motion.div>
  )
}

// ─── Done step ────────────────────────────────────────────────────────────────

function DoneStep({ name, onFinish }: { name: string; onFinish: () => void }) {
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center"
    >
      <div className="relative w-24 h-24 mx-auto mb-6">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-200">
          <ShieldCheck size={44} className="text-white" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
          <Sparkles size={14} className="text-white" />
        </div>
      </div>

      <h2 className="text-3xl font-extrabold text-indigo-950 tracking-tight mb-2">
        You're all set, {name}!
      </h2>
      <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto mb-8">
        Your digital twin is ready. We'll now match you against every job in our network using graph-to-graph analysis - not keywords.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-10">
        {[
          { icon: Network, label: 'Graph built', color: 'text-blue-500', bg: 'bg-blue-50' },
          { icon: ShieldCheck, label: 'Verified', color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { icon: BarChart3, label: 'Ready to match', color: 'text-violet-500', bg: 'bg-violet-50' },
        ].map(({ icon: Icon, label, color, bg }) => (
          <div key={label} className="card-lumino p-4 text-center">
            <div className={`w-10 h-10 mx-auto mb-2 rounded-2xl ${bg} flex items-center justify-center`}>
              <Icon size={18} className={color} />
            </div>
            <p className="text-xs font-semibold text-indigo-950">{label}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onFinish}
        className="btn-primary btn-lg px-10 flex items-center gap-2 mx-auto focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
      >
        Explore My Matches <ArrowRight size={16} />
      </button>
    </motion.div>
  )
}

// ─── Main Onboarding page ─────────────────────────────────────────────────────

export default function Onboarding() {
  const { user, session } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('welcome')
  const [ingestResult, setIngestResult] = useState<IngestUserResponse | null>(null)

  function handleUploadDone(result: IngestUserResponse) {
    setIngestResult(result)
    setStep('results')
  }

  function handleResultsNext() {
    if (ingestResult && ingestResult.interpretation_flags > 0) {
      setStep('verify')
    } else {
      setStep('done')
    }
  }

  function handleVerifyDone() {
    setStep('done')
  }

  function handleFinish() {
    markOnboardingComplete(user!.id)
    navigate('/dashboard', { replace: true })
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <>
      <title>Get Started - Lumino</title>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30 flex flex-col">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur border-b border-slate-100">
          <div className="flex items-center gap-2">
            <LuminoIcon size="sm" />
            <span className="font-extrabold text-indigo-950 tracking-tight">Lumino</span>
          </div>
          <span className="text-xs text-slate-400">Step {Math.max(STEP_INDEX[step], 0) + 1} of {STEP_LABELS.length}</span>
        </div>

        {/* Main content */}
        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-lg">

            <StepIndicator step={step} />

            <AnimatePresence mode="wait">
              {step === 'welcome' && (
                <WelcomeStep name={firstName} onNext={() => setStep('upload')} />
              )}
              {step === 'upload' && (
                <UploadStep userId={session!.userId} onDone={handleUploadDone} />
              )}
              {step === 'results' && ingestResult && (
                <ResultsStep
                  result={ingestResult}
                  onNext={handleResultsNext}
                  hasFlags={ingestResult.interpretation_flags > 0}
                />
              )}
              {step === 'verify' && (
                <VerifyStep userId={session!.userId} onDone={handleVerifyDone} />
              )}
              {step === 'done' && (
                <DoneStep name={firstName} onFinish={handleFinish} />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  )
}
