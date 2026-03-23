import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import {
  Upload as UploadIcon, FileText, CheckCircle, AlertCircle,
  BookOpen, ShieldCheck, ShieldAlert, AlertTriangle, Network, BarChart3
} from 'lucide-react'

function StatCard({ label, value }) {
  return (
    <div className="text-center p-4 rounded-xl bg-primary-50 border border-primary-100">
      <p className="text-2xl font-bold text-primary-600">{value}</p>
      <p className="text-xs text-content-muted mt-0.5">{label}</p>
    </div>
  )
}

export default function Upload() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const fileRef     = useRef(null)

  const [tab,      setTab]      = useState('pdf')
  const [file,     setFile]     = useState(null)
  const [text,     setText]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState(null)
  const [dragging, setDragging] = useState(false)

  async function handleAnalyse() {
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      let data
      if (tab === 'pdf') {
        if (!file) throw new Error('Please select a PDF file.')
        data = await api.uploadUserPdf(session.userId, file)
      } else {
        if (!text.trim()) throw new Error('Please paste your profile text.')
        data = await api.ingestUser(session.userId, text.trim())
      }
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') setFile(f)
    else setError('Only PDF files are accepted.')
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Upload Your Resume</h1>
            <p className="text-sm text-content-muted mt-1">
              We'll extract your skills, domains, and experience to build your knowledge graph.
            </p>
          </div>
          <Link
            to="/user/guidelines"
            className="btn-secondary btn-sm flex-shrink-0 mt-1">
            <BookOpen size={13} /> Tips
          </Link>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-surface-raised border border-surface-border mb-6 mt-6">
          {['pdf', 'text'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-white text-content-primary shadow-card'
                  : 'text-content-muted hover:text-content-primary'
              }`}>
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
            className={`rounded-xl p-10 text-center cursor-pointer transition-all border-2 border-dashed ${
              dragging
                ? 'border-primary-400 bg-primary-50'
                : file
                  ? 'border-success-400 bg-success-50'
                  : 'border-surface-border bg-white hover:border-primary-300 hover:bg-primary-50/40'
            }`}>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                   onChange={e => setFile(e.target.files[0] || null)} />
            {file ? (
              <>
                <FileText size={40} className="mx-auto mb-3 text-success-500" />
                <p className="font-semibold text-sm text-success-600">{file.name}</p>
                <p className="text-xs text-content-muted mt-1">
                  {(file.size / 1024).toFixed(0)} KB · Click to change
                </p>
              </>
            ) : (
              <>
                <UploadIcon size={40} className="mx-auto mb-3 text-content-subtle" />
                <p className="font-semibold text-sm text-content-primary">
                  Drop your PDF here or click to browse
                </p>
                <p className="text-xs text-content-muted mt-1">Supports PDF resume files</p>
              </>
            )}
          </div>
        )}

        {/* Text paste */}
        {tab === 'text' && (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste your resume or profile text here..."
            rows={12}
            className="input resize-none"
          />
        )}

        {/* Error */}
        {error && (
          <div className="alert-error mt-4">
            <AlertCircle size={15} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleAnalyse}
          disabled={loading}
          className="btn-primary btn-lg w-full mt-5">
          {loading ? (
            <><div className="spinner-sm" /> Analysing…</>
          ) : 'Analyse Profile'}
        </button>

        {/* Result */}
        {result && (
          <div className="mt-8 fade-in space-y-5">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-success-500" />
              <p className="font-semibold text-sm text-success-600">Profile successfully processed</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Skills"       value={result.skills_extracted      || 0} />
              <StatCard label="Domains"      value={result.domains_extracted     || 0} />
              <StatCard label="Projects"     value={result.projects_extracted    || 0} />
              <StatCard label="Experiences"  value={result.experiences_extracted || 0} />
            </div>

            {/* Verification banner */}
            {result.interpretation_flags > 0 ? (
              <div className="rounded-xl p-4 bg-warning-50 border border-warning-200">
                <div className="flex items-start gap-3 mb-3">
                  <ShieldAlert size={18} className="text-warning-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-warning-700">
                      {result.interpretation_flags} AI interpretations need review
                    </p>
                    <p className="text-xs text-warning-600 mt-1">
                      The AI made inferences from your resume. Review them to make your graph an exact digital twin.
                    </p>
                  </div>
                </div>
                {result.clarification_questions?.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {result.clarification_questions.map(q => (
                      <div key={q.flag_id} className="flex items-start gap-2 text-xs text-warning-700 bg-warning-100 rounded-lg px-3 py-2">
                        <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                        {q.question}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => navigate('/user/clarifications')}
                  className="btn-primary w-full">
                  <ShieldCheck size={14} /> Verify My Profile
                </button>
              </div>
            ) : (
              <div className="alert-success">
                <ShieldCheck size={15} className="flex-shrink-0" />
                Profile fully verified — no ambiguous interpretations detected.
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => navigate('/user/model')}
                className="btn-secondary flex-1">
                <Network size={14} /> Knowledge Graph
              </button>
              <button
                onClick={() => navigate('/user/dashboard')}
                className="btn-primary flex-1">
                <BarChart3 size={14} /> Browse Jobs →
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
