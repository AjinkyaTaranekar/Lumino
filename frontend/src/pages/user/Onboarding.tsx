import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  DollarSign,
  FileText,
  Heart,
  Loader,
  MapPin,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
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

type Step = 'welcome' | 'upload' | 'results' | 'verify' | 'preferences' | 'done'

const STEP_LABELS = ['Upload', 'Analysis', 'Verify', 'Preferences', 'Done']
const STEP_INDEX: Record<Step, number> = {
  welcome: -1, upload: 0, results: 1, verify: 2, preferences: 3, done: 4,
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
        Welcome {name}, let's build your winning profile
      </h1>
      <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto mb-8">
        In the next few steps, Lumino turns your resume into an explainable career graph so you can see why each role fits and what to improve next.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-10 text-left">
        {[
          { icon: FileText, title: 'Upload Resume', desc: 'We extract skills, impact, and domain signals' },
          { icon: Sparkles, title: 'AI Analysis', desc: 'We create an explainable career graph' },
          { icon: ShieldCheck, title: 'Quick Verify', desc: 'You confirm high-impact interpretations' },
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
        Start Profile Setup <ArrowRight size={16} />
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
        <p className="text-sm text-slate-500 mt-2">We will extract evidence-backed skills, domain depth, and experience outcomes.</p>
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
              <p className="font-bold text-slate-700">Drop your resume PDF here or click to browse</p>
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
          placeholder="Paste your resume, project highlights, or LinkedIn profile text here..."
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
        <h2 className="text-2xl font-extrabold text-indigo-950 tracking-tight">Profile intelligence ready</h2>
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

// ─── Career Preferences step ─────────────────────────────────────────────────

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship']
const WORK_AUTH_OPTIONS = [
  { value: 'authorized', label: 'Authorized to work (no sponsorship needed)' },
  { value: 'have_work_permit', label: 'Have a work permit / existing visa' },
  { value: 'need_sponsorship', label: 'Need visa sponsorship' },
]
const VALUE_OPTIONS = [
  'Work-life balance', 'Career growth', 'Meaningful impact', 'Compensation',
  'Innovation', 'Stability', 'Autonomy', 'Learning', 'Remote flexibility',
  'Strong team', 'Diversity & inclusion', 'Fast-paced environment',
]

interface CareerPreferencesStepProps {
  userId: string
  onDone: () => void
}

function CareerPreferencesStep({ userId, onDone }: CareerPreferencesStepProps) {
  const [empTypes, setEmpTypes] = React.useState<string[]>([])
  const [salMin, setSalMin] = React.useState('')
  const [salMax, setSalMax] = React.useState('')
  const [currency, setCurrency] = React.useState('USD')
  const [location, setLocation] = React.useState('')
  const [remoteOnly, setRemoteOnly] = React.useState(false)
  const [workAuth, setWorkAuth] = React.useState('')
  const [careerGoal, setCareerGoal] = React.useState('')
  const [values, setValues] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function toggleEmpType(t: string) {
    setEmpTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }
  function toggleValue(v: string) {
    setValues(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : prev.length < 3 ? [...prev, v] : prev
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.saveCareerPreferences(userId, {
        employment_types: empTypes.map(t => t.toLowerCase().replace('-', '_')),
        salary_min: salMin ? parseInt(salMin) : null,
        salary_max: salMax ? parseInt(salMax) : null,
        salary_currency: currency,
        location: location.trim() || undefined,
        remote_only: remoteOnly,
        work_authorization: workAuth || undefined,
        career_goal: careerGoal.trim() || undefined,
        values: values.map(v => v.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      key="preferences"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="space-y-6"
    >
      <div className="text-center mb-2">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-violet-100 flex items-center justify-center">
          <Target size={22} className="text-violet-600" />
        </div>
        <h2 className="text-2xl font-extrabold text-indigo-950 tracking-tight">What should we optimize for?</h2>
        <p className="text-sm text-slate-500 mt-1.5">This helps us rank jobs by what actually matters to you — not just skill match.</p>
      </div>

      {/* Employment type */}
      <div>
        <label className="block text-sm font-semibold text-indigo-950 mb-2 flex items-center gap-1.5">
          <Briefcase size={14} className="text-slate-400" /> Employment type
        </label>
        <div className="flex flex-wrap gap-2">
          {EMPLOYMENT_TYPES.map(t => (
            <button
              key={t}
              onClick={() => toggleEmpType(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${empTypes.includes(t)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Salary expectation */}
      <div>
        <label className="block text-sm font-semibold text-indigo-950 mb-2 flex items-center gap-1.5">
          <DollarSign size={14} className="text-slate-400" /> Salary expectation (annual)
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={salMin}
            onChange={e => setSalMin(e.target.value)}
            placeholder="Min"
            className="input flex-1 text-sm"
          />
          <span className="text-slate-400 text-sm">–</span>
          <input
            type="number"
            value={salMax}
            onChange={e => setSalMax(e.target.value)}
            placeholder="Max"
            className="input flex-1 text-sm"
          />
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="input w-24 text-sm"
          >
            {['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-semibold text-indigo-950 mb-2 flex items-center gap-1.5">
          <MapPin size={14} className="text-slate-400" /> Location preference
        </label>
        <input
          type="text"
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="e.g. San Francisco, London, or leave blank for remote"
          className="input text-sm"
          disabled={remoteOnly}
        />
        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={e => { setRemoteOnly(e.target.checked); if (e.target.checked) setLocation('') }}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-600">Remote only</span>
        </label>
      </div>

      {/* Work authorization */}
      <div>
        <label className="block text-sm font-semibold text-indigo-950 mb-2">Work authorization</label>
        <div className="space-y-2">
          {WORK_AUTH_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="work_auth"
                value={opt.value}
                checked={workAuth === opt.value}
                onChange={() => setWorkAuth(opt.value)}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600 group-hover:text-indigo-950 transition-colors">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Values */}
      <div>
        <label className="block text-sm font-semibold text-indigo-950 mb-1 flex items-center gap-1.5">
          <Heart size={14} className="text-slate-400" /> What matters most to you? <span className="text-slate-400 font-normal ml-1">(pick up to 3)</span>
        </label>
        <div className="flex flex-wrap gap-2 mt-2">
          {VALUE_OPTIONS.map(v => (
            <button
              key={v}
              onClick={() => toggleValue(v)}
              disabled={!values.includes(v) && values.length >= 3}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all disabled:opacity-40 ${values.includes(v)
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Career goal */}
      <div>
        <label className="block text-sm font-semibold text-indigo-950 mb-2 flex items-center gap-1.5">
          <Target size={14} className="text-slate-400" /> Your next career goal
        </label>
        <textarea
          value={careerGoal}
          onChange={e => setCareerGoal(e.target.value)}
          placeholder="e.g. Move into a tech lead role at a growth-stage startup within 18 months"
          rows={3}
          className="input resize-none text-sm"
        />
        <p className="text-xs text-slate-400 mt-1">Used to match you with roles on your growth path, not just lateral moves.</p>
      </div>

      {error && <div className="alert-error text-sm"><AlertTriangle size={14} /><span>{error}</span></div>}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onDone}
          className="btn-secondary flex-shrink-0 text-sm px-4"
        >
          Skip
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary btn-lg flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <><Loader size={15} className="animate-spin" /> Saving…</> : <>Save & Continue <ArrowRight size={15} /></>}
        </button>
      </div>
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
        Your profile graph is now active. Lumino will rank roles using evidence-based graph matching, not resume keyword stuffing.
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
      setStep('preferences')
    }
  }

  function handleVerifyDone() {
    setStep('preferences')
  }

  function handlePreferencesDone() {
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
              {step === 'preferences' && (
                <CareerPreferencesStep userId={session!.userId} onDone={handlePreferencesDone} />
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
