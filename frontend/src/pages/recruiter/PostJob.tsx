import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import {
  ArrowRight, CheckCircle, Sparkles, Upload, FileText,
  AlertCircle, Briefcase, Users
} from 'lucide-react'

export default function PostJob() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(1)
  const [jobId, setJobId] = useState('')
  const [tab, setTab] = useState<'pdf' | 'text'>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') setFile(f)
    else setError('Only PDF files are accepted.')
  }

  async function handleAnalyse() {
    const id = jobId.trim()
    if (!id) return setError('Please enter a Job ID.')
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      let data
      if (tab === 'pdf') {
        if (!file) throw new Error('Please select a PDF file.')
        data = await api.uploadJobPdf(id, file, session!.userId)
      } else {
        if (!text.trim()) throw new Error('Please paste the job description.')
        data = await api.ingestJob(id, text.trim(), session!.userId)
      }
      setResult({ ...data, resolvedJobId: id })
      setStep(3)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const STEPS = ['Role Basics', 'Job Description', 'Review & Publish']

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <header className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center font-black">
            {step}
          </div>
          <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Step {step} of 3</span>
        </div>
        <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">
          {step === 3 ? 'Review & Publish' : 'Post a Job Opening'}
        </h1>
        <p className="mt-3 text-lg text-slate-500 leading-relaxed">
          {step === 1 ? 'Define the role identifier first.'
          : step === 2 ? 'Provide the job description — Lumino will extract skills, domains, and requirements.'
          : 'Your job posting has been processed.'}
        </p>
      </header>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-10">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
              i + 1 < step ? 'bg-primary-500 border-primary-500 text-white'
              : i + 1 === step ? 'border-primary-500 text-primary-500'
              : 'border-slate-200 text-slate-300'
            }`}>
              {i + 1 < step ? <CheckCircle size={14} /> : i + 1}
            </div>
            <span className={`text-xs font-bold hidden md:block ${i + 1 === step ? 'text-indigo-950' : 'text-slate-400'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px w-12 ${i + 1 < step ? 'bg-primary-500' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-10">
        {/* Step 1 */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-indigo-950 mb-8">Role Identifier</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
                  Job ID (unique identifier)
                </label>
                <input
                  type="text"
                  value={jobId}
                  onChange={e => { setJobId(e.target.value); setError(null) }}
                  placeholder="e.g. senior-backend-eng-01"
                  className="w-full h-14 px-6 rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500 transition-all font-medium"
                />
                <p className="text-xs text-slate-400 mt-2">
                  This will be used as the unique key in the knowledge graph.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold text-indigo-950 mb-8">Job Description</h2>

            <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4 mb-8">
              <Sparkles className="text-primary-500 shrink-0 mt-0.5" size={20} />
              <div>
                <h4 className="font-bold text-blue-900 text-sm mb-1">AI Extraction</h4>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Lumino will automatically extract skill requirements, domain expertise, and work-style preferences from your description.
                </p>
              </div>
            </div>

            {/* Tab toggle */}
            <div className="flex gap-1 p-1 rounded-xl bg-slate-50 border border-slate-200 mb-6 inline-flex">
              {(['pdf', 'text'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === t ? 'bg-white text-indigo-950 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {t === 'pdf' ? 'Upload PDF' : 'Paste Text'}
                </button>
              ))}
            </div>

            {tab === 'pdf' && (
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`rounded-2xl p-10 text-center cursor-pointer transition-all border-2 border-dashed ${
                  dragging ? 'border-primary-500 bg-primary-50'
                  : file ? 'border-emerald-400 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50 hover:border-primary-300 hover:bg-primary-50/40'
                }`}
              >
                <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
                {file ? (
                  <>
                    <FileText size={40} className="mx-auto mb-3 text-emerald-500" />
                    <p className="font-bold text-sm text-emerald-600">{file.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
                  </>
                ) : (
                  <>
                    <Upload size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="font-bold text-sm text-indigo-950">Drop your PDF here or click to browse</p>
                    <p className="text-xs text-slate-400 mt-1">PDF job descriptions only</p>
                  </>
                )}
              </div>
            )}

            {tab === 'text' && (
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste the full job description here…"
                rows={12}
                className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-300 transition-all resize-none font-medium text-sm"
              />
            )}
          </div>
        )}

        {/* Step 3 — Result */}
        {step === 3 && result && (
          <div>
            <h2 className="text-2xl font-bold text-indigo-950 mb-8">Job Successfully Processed</h2>
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 space-y-6 mb-8">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-indigo-950">{result.resolvedJobId}</h3>
                  <p className="text-sm text-slate-500 mt-1">Knowledge graph built successfully</p>
                </div>
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                  Published
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200">
                <div className="text-center">
                  <p className="text-3xl font-black text-primary-500">{result.skill_requirements_extracted ?? 0}</p>
                  <p className="text-xs text-slate-400 uppercase font-black tracking-wider mt-1">Skills</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-black text-emerald-500">{result.domain_requirements_extracted ?? 0}</p>
                  <p className="text-xs text-slate-400 uppercase font-black tracking-wider mt-1">Domains</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-black text-orange-500">{result.work_styles_extracted ?? 0}</p>
                  <p className="text-xs text-slate-400 uppercase font-black tracking-wider mt-1">Work Styles</p>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => navigate(`/recruiter/candidates/${result.resolvedJobId}`)}
                className="flex-1 bg-primary-500 text-white py-4 rounded-xl font-bold hover:bg-primary-600 transition-all flex items-center justify-center gap-2"
              >
                <Users size={18} /> Find Candidates
              </button>
              <button
                onClick={() => navigate(`/recruiter/model/${result.resolvedJobId}`)}
                className="flex-1 border border-slate-200 text-indigo-950 py-4 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                <Briefcase size={18} /> View Job Model
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm mt-6">
            <AlertCircle size={15} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Navigation */}
        {step < 3 && (
          <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center">
            <button
              onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1}
              className="text-slate-400 font-bold hover:text-indigo-950 transition-colors disabled:opacity-30"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (step === 1) {
                  if (!jobId.trim()) return setError('Please enter a Job ID.')
                  setError(null)
                  setStep(2)
                } else {
                  handleAnalyse()
                }
              }}
              disabled={loading}
              className="bg-primary-500 text-white px-10 py-4 rounded-xl font-bold shadow-xl flex items-center gap-3 hover:bg-primary-600 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Analysing…
                </>
              ) : (
                <>
                  {step === 2 ? 'Analyse & Publish' : 'Continue'}
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
