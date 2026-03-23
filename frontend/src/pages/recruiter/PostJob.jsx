import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import { Upload, FileText, CheckCircle } from 'lucide-react'

export default function PostJob() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const fileRef     = useRef(null)

  const [jobId, setJobId]       = useState('')
  const [tab, setTab]           = useState('pdf')
  const [file, setFile]         = useState(null)
  const [text, setText]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [dragging, setDragging] = useState(false)

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
        data = await api.uploadJobPdf(id, file, session.userId)
      } else {
        if (!text.trim()) throw new Error('Please paste the job description.')
        data = await api.ingestJob(id, text.trim(), session.userId)
      }
      setResult({ ...data, resolvedJobId: id })
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
        <h1 className="text-2xl font-bold text-content-primary mb-1">Post a Job</h1>
        <p className="text-sm text-content-secondary mb-8">
          Paste or upload a job description — Lumino will extract skills, domain requirements,
          and work-style preferences to build your job model.
        </p>

        {/* Job ID */}
        <div className="mb-5">
          <label className="label" htmlFor="jobId">Job ID (unique identifier)</label>
          <input
            id="jobId"
            type="text"
            value={jobId}
            onChange={e => { setJobId(e.target.value); setError(null) }}
            placeholder="e.g. job-senior-ml-01"
            className="input mt-1"
          />
        </div>

        {/* Tab toggle */}
        <div className="inline-flex rounded-lg border border-surface-border bg-surface-bg p-1 gap-1 mb-5">
          <button
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'pdf'
                ? 'bg-surface-card text-content-primary shadow-sm border border-surface-border'
                : 'text-content-muted hover:text-content-secondary'
            }`}
            onClick={() => setTab('pdf')}
          >
            Upload PDF
          </button>
          <button
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'text'
                ? 'bg-surface-card text-content-primary shadow-sm border border-surface-border'
                : 'text-content-muted hover:text-content-secondary'
            }`}
            onClick={() => setTab('text')}
          >
            Paste Text
          </button>
        </div>

        {/* PDF drop zone */}
        {tab === 'pdf' && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-xl p-10 text-center cursor-pointer border-2 border-dashed transition-colors ${
              dragging
                ? 'border-primary-500 bg-primary-50'
                : file
                ? 'border-success-500 bg-success-50'
                : 'border-surface-border bg-surface-bg hover:border-primary-500 hover:bg-primary-50'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => setFile(e.target.files[0] || null)}
            />
            {file ? (
              <>
                <FileText className="w-9 h-9 mx-auto mb-3 text-success-500" />
                <p className="text-sm font-medium text-success-600">{file.name}</p>
                <p className="text-xs mt-1 text-content-muted">Click to change</p>
              </>
            ) : (
              <>
                <Upload className="w-9 h-9 mx-auto mb-3 text-content-subtle" />
                <p className="text-sm font-medium text-content-secondary">
                  Drop your PDF here or click to browse
                </p>
                <p className="text-xs mt-1 text-content-muted">PDF files only</p>
              </>
            )}
          </div>
        )}

        {/* Text paste */}
        {tab === 'text' && (
          <div>
            <label className="label" htmlFor="jobText">Job Description</label>
            <textarea
              id="jobText"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste job description here…"
              rows={12}
              className="input mt-1 resize-none"
            />
          </div>
        )}

        {error && (
          <div className="alert-error mt-4">{error}</div>
        )}

        <button
          onClick={handleAnalyse}
          disabled={loading}
          className="btn-primary btn-lg w-full mt-5 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="spinner-sm" />
              Analysing…
            </>
          ) : (
            'Analyse Job Posting'
          )}
        </button>

        {/* Result */}
        {result && (
          <div className="card p-6 mt-8 space-y-5 fade-in">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-success-500 shrink-0" />
              <div>
                <p className="font-semibold text-content-primary">Job posting processed successfully</p>
                <p className="text-sm text-content-secondary">
                  Requirements extracted for <span className="font-mono font-medium">{result.resolvedJobId}</span>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-primary-50 border border-primary-100 p-4 text-center">
                <p className="text-2xl font-bold text-primary-500">
                  {result.skill_requirements_extracted ?? 0}
                </p>
                <p className="text-xs text-content-secondary mt-1">Skills Extracted</p>
              </div>
              <div className="rounded-lg bg-success-50 border border-success-100 p-4 text-center">
                <p className="text-2xl font-bold text-success-600">
                  {result.domain_requirements_extracted ?? 0}
                </p>
                <p className="text-xs text-content-secondary mt-1">Domain Reqs</p>
              </div>
              <div className="rounded-lg bg-warning-50 border border-warning-100 p-4 text-center">
                <p className="text-2xl font-bold text-warning-600">
                  {result.work_styles_extracted ?? 0}
                </p>
                <p className="text-xs text-content-secondary mt-1">Work Styles</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/recruiter/model/${result.resolvedJobId}`)}
                className="btn-secondary flex-1"
              >
                View Job Model
              </button>
              <button
                onClick={() => navigate(`/recruiter/candidates/${result.resolvedJobId}`)}
                className="btn-primary flex-1"
              >
                Find Candidates →
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
