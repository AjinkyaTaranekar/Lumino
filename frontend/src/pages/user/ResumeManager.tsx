import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import {
  Upload, FileText, CheckCircle, AlertCircle,
  ShieldCheck, ShieldAlert, AlertTriangle, Network, BarChart3, BookOpen, ArrowRight
} from 'lucide-react'

export default function ResumeManager() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

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
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      let data
      if (tab === 'pdf') {
        if (!file) throw new Error('Please select a PDF file.')
        data = await api.uploadUserPdf(session!.userId, file)
      } else {
        if (!text.trim()) throw new Error('Please paste your profile text.')
        data = await api.ingestUser(session!.userId, text.trim())
      }
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <header className="mb-10 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Resume Manager</h1>
          <p className="mt-3 text-lg text-slate-500 leading-relaxed">
            Upload your resume to build your AI-powered knowledge graph.
          </p>
        </div>
        <Link
          to="/user/guidelines"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-all flex-shrink-0"
        >
          <BookOpen size={16} /> Tips
        </Link>
      </header>

      <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
        {/* Tab toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-slate-50 border border-slate-200 mb-8">
          {(['pdf', 'text'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
                tab === t ? 'bg-white text-indigo-950 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'
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
            className={`rounded-2xl p-12 text-center cursor-pointer transition-all border-2 border-dashed ${
              dragging ? 'border-primary-500 bg-primary-50'
              : file ? 'border-emerald-400 bg-emerald-50'
              : 'border-slate-200 bg-slate-50 hover:border-primary-300 hover:bg-primary-50/40'
            }`}
          >
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)} />
            {file ? (
              <>
                <FileText size={48} className="mx-auto mb-4 text-emerald-500" />
                <p className="font-bold text-emerald-600">{file.name}</p>
                <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
              </>
            ) : (
              <>
                <Upload size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="font-bold text-indigo-950">Drop your PDF here or click to browse</p>
                <p className="text-xs text-slate-400 mt-2">PDF resume files only</p>
              </>
            )}
          </div>
        )}

        {/* Text paste */}
        {tab === 'text' && (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste your resume or LinkedIn profile text here..."
            rows={12}
            className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-300 transition-all resize-none"
          />
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm mt-6">
            <AlertCircle size={15} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleAnalyse}
          disabled={loading}
          className="w-full bg-indigo-950 text-white py-4 rounded-xl font-bold hover:bg-indigo-900 transition-all mt-6 flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Analysing Resume…
            </>
          ) : 'Analyse Resume'}
        </button>

        {/* Result */}
        {result && (
          <div className="mt-8 space-y-6 border-t border-slate-100 pt-8">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
              <p className="font-bold text-indigo-950">Profile successfully processed!</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Skills', value: result.skills_extracted ?? 0 },
                { label: 'Domains', value: result.domains_extracted ?? 0 },
                { label: 'Projects', value: result.projects_extracted ?? 0 },
                { label: 'Experiences', value: result.experiences_extracted ?? 0 },
              ].map(s => (
                <div key={s.label} className="text-center p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-3xl font-black text-primary-500">{s.value}</p>
                  <p className="text-xs text-slate-400 uppercase font-black tracking-wider mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Verification */}
            {(result.interpretation_flags ?? 0) > 0 ? (
              <div className="rounded-2xl p-6 bg-orange-50 border border-orange-200">
                <div className="flex items-start gap-3 mb-4">
                  <ShieldAlert size={20} className="text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-orange-700">
                      {result.interpretation_flags} AI interpretation{result.interpretation_flags !== 1 ? 's' : ''} need review
                    </p>
                    <p className="text-sm text-orange-600 mt-1">
                      Review these to make your graph an exact digital twin.
                    </p>
                  </div>
                </div>
                {result.clarification_questions?.slice(0, 3).map((q: any) => (
                  <div key={q.flag_id} className="flex items-start gap-2 text-xs text-orange-700 bg-orange-100 rounded-lg px-3 py-2 mb-2">
                    <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                    {q.question}
                  </div>
                ))}
                <button
                  onClick={() => navigate('/user/clarifications')}
                  className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition-all mt-2 flex items-center justify-center gap-2"
                >
                  <ShieldCheck size={16} /> Verify My Profile
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
                <ShieldCheck size={18} className="flex-shrink-0" />
                <p className="text-sm font-bold">Profile fully verified — no ambiguous interpretations.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => navigate('/model')}
                className="flex-1 border border-slate-200 text-indigo-950 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                <Network size={16} /> Knowledge Graph
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="flex-1 bg-primary-500 text-white py-3 rounded-xl font-bold hover:bg-primary-600 transition-all flex items-center justify-center gap-2"
              >
                <BarChart3 size={16} /> View Jobs <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
