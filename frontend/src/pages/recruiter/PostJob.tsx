import {
  AlertCircle,
  Briefcase,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileText,
  Globe,
  Upload,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { IngestJobResponse } from '../../lib/types';

// ── Step indicator ────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Job Details' },
  { id: 2, label: 'Job Content' },
  { id: 3, label: 'Review' },
] as const;

interface StepIndicatorProps {
  current: number;
}

function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <nav aria-label="Post job steps" className="flex items-center gap-0 mb-10">
      {STEPS.map((step, idx) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                aria-current={active ? 'step' : undefined}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${done ? 'bg-primary-500 text-white'
                    : active ? 'bg-primary-500 text-white ring-4 ring-primary-100'
                      : 'bg-slate-100 text-slate-400'}`}
              >
                {done ? <CheckCircle className="w-4 h-4" aria-hidden="true" /> : step.id}
              </div>
              <span
                className={`text-xs font-medium hidden sm:block
                  ${active ? 'text-primary-500' : done ? 'text-slate-500' : 'text-slate-300'}`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-3 ${step.id < current ? 'bg-primary-300' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ── IngestResult type ─────────────────────────────────────────────────────

interface AnalysisResult extends IngestJobResponse {
  resolvedJobId: string;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PostJob() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Multi-step state ──
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Form data ──
  const [jobId, setJobId] = useState('');
  const [department, setDept] = useState('');
  const [location, setLocation] = useState('');
  const [tab, setTab] = useState<'pdf' | 'text'>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');

  // ── Async state ──
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // ── Navigation helpers ────────────────────────────────────────────────

  function validateStep1(): string | null {
    if (!jobId.trim()) return 'Please enter a Job ID.';
    return null;
  }

  function validateStep2(): string | null {
    if (tab === 'pdf' && !file) return 'Please select a PDF file.';
    if (tab === 'text' && !text.trim()) return 'Please paste a job description.';
    return null;
  }

  function goNext() {
    setError(null);
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      setStep(2);
    } else if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
      setStep(3);
    }
  }

  function goBack() {
    setError(null);
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  // ── PDF drag-drop ─────────────────────────────────────────────────────

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') {
      setFile(f);
      setError(null);
    } else {
      setError('Only PDF files are accepted.');
    }
  }

  // ── API call ──────────────────────────────────────────────────────────

  async function handlePublish() {
    const err1 = validateStep1();
    if (err1) { setError(err1); setStep(1); return; }
    const err2 = validateStep2();
    if (err2) { setError(err2); setStep(2); return; }

    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const id = jobId.trim();
      let data: IngestJobResponse;
      if (tab === 'pdf') {
        data = await api.uploadJobPdf(id, file!, session?.userId);
      } else {
        data = await api.ingestJob(id, text.trim(), session?.userId);
      }
      setResult({ ...data, resolvedJobId: id });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      <title>Post a Job - Lumino</title>

      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-indigo-950 mb-1">Post a Job</h1>
          <p className="text-sm text-slate-400">
            Lumino will extract skills, domain requirements, and work-style preferences
            to build a knowledge graph for your job posting.
          </p>
        </div>

        <StepIndicator current={result ? 4 : step} />

        {/* ── Success result card ────────────────────────────────────── */}
        {result ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-lumino p-8 space-y-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-emerald-500" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold text-indigo-950">Job published successfully</p>
                <p className="text-sm text-slate-400">
                  Requirements extracted for{' '}
                  <code className="font-mono text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded text-xs">
                    {result.resolvedJobId}
                  </code>
                </p>
              </div>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-3 gap-4">
              <div className="stat-card text-center">
                <p className="text-3xl font-bold text-primary-500">
                  {result.skill_requirements_extracted ?? 0}
                </p>
                <p className="text-xs text-slate-400 mt-1">Skills Extracted</p>
              </div>
              <div className="stat-card text-center">
                <p className="text-3xl font-bold text-emerald-600">
                  {result.domain_requirements_extracted ?? 0}
                </p>
                <p className="text-xs text-slate-400 mt-1">Domain Reqs</p>
              </div>
              <div className="stat-card text-center">
                <p className="text-3xl font-bold text-amber-500">
                  {result.work_styles_extracted ?? 0}
                </p>
                <p className="text-xs text-slate-400 mt-1">Work Styles</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/recruiter/model/${result.resolvedJobId}`)}
                className="btn-secondary flex-1 focus-visible:ring-2 focus-visible:ring-primary-300"
              >
                View Job Model
              </button>
              <button
                onClick={() => navigate(`/recruiter/candidates/${result.resolvedJobId}`)}
                className="btn-primary flex-1 focus-visible:ring-2 focus-visible:ring-primary-300"
              >
                Find Candidates →
              </button>
            </div>

            {/* Post another */}
            <button
              onClick={() => {
                setResult(null);
                setJobId('');
                setDept('');
                setLocation('');
                setFile(null);
                setText('');
                setStep(1);
              }}
              className="text-xs text-slate-400 hover:text-slate-600 underline w-full text-center focus-visible:ring-2 focus-visible:ring-primary-300 rounded"
            >
              Post another job
            </button>
          </motion.div>
        ) : (
          /* ── Step panels ──────────────────────────────────────────── */
          <div className="card-lumino overflow-hidden">
            <AnimatePresence mode="wait">
              {/* ── Step 1: Job Details ── */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="p-8 space-y-5"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center">
                      <Briefcase className="w-4 h-4 text-primary-500" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-indigo-950">Step 1 of 3 - Job Details</p>
                      <p className="text-xs text-slate-400">Set a unique identifier and metadata for this role</p>
                    </div>
                  </div>

                  {/* Job ID */}
                  <div>
                    <label className="label" htmlFor="jobId">
                      Job ID <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="jobId"
                      type="text"
                      value={jobId}
                      onChange={e => { setJobId(e.target.value); setError(null); }}
                      placeholder="e.g. job-senior-ml-01"
                      className="input focus-visible:ring-2 focus-visible:ring-primary-300"
                      aria-required="true"
                      autoFocus
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      A unique slug used to identify this job in the system.
                    </p>
                  </div>

                  {/* Department (UI-only) */}
                  <div>
                    <label className="label" htmlFor="dept">
                      Department <span className="text-slate-300 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Code2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                      <select
                        id="dept"
                        value={department}
                        onChange={e => setDept(e.target.value)}
                        className="input pl-9 focus-visible:ring-2 focus-visible:ring-primary-300"
                      >
                        <option value="">Select department…</option>
                        <option value="engineering">Engineering</option>
                        <option value="product">Product</option>
                        <option value="design">Design</option>
                        <option value="data">Data & AI</option>
                        <option value="marketing">Marketing</option>
                        <option value="operations">Operations</option>
                        <option value="hr">HR</option>
                        <option value="finance">Finance</option>
                      </select>
                    </div>
                  </div>

                  {/* Location (UI-only) */}
                  <div>
                    <label className="label" htmlFor="location">
                      Location <span className="text-slate-300 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                      <input
                        id="location"
                        type="text"
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        placeholder="e.g. Remote / San Francisco, CA"
                        className="input pl-9 focus-visible:ring-2 focus-visible:ring-primary-300"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: Job Content ── */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="p-8 space-y-5"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-primary-500" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-indigo-950">Step 2 of 3 - Job Content</p>
                      <p className="text-xs text-slate-400">Upload a PDF or paste the job description text</p>
                    </div>
                  </div>

                  {/* Tab toggle */}
                  <div
                    role="tablist"
                    aria-label="Content input method"
                    className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1 mb-2"
                  >
                    <button
                      role="tab"
                      aria-selected={tab === 'pdf'}
                      onClick={() => setTab('pdf')}
                      className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-300
                        ${tab === 'pdf'
                          ? 'bg-white text-indigo-950 shadow-sm border border-slate-200'
                          : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Upload PDF
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === 'text'}
                      onClick={() => setTab('text')}
                      className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-300
                        ${tab === 'text'
                          ? 'bg-white text-indigo-950 shadow-sm border border-slate-200'
                          : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Paste Text
                    </button>
                  </div>

                  {/* PDF drop zone */}
                  {tab === 'pdf' && (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="PDF drop zone - click or drag and drop a PDF file"
                      onClick={() => fileRef.current?.click()}
                      onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={onDrop}
                      className={`rounded-2xl p-12 text-center cursor-pointer border-2 border-dashed transition-colors focus-visible:ring-2 focus-visible:ring-primary-300
                        ${dragging
                          ? 'border-primary-400 bg-primary-50'
                          : file
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-slate-200 bg-slate-50 hover:border-primary-300 hover:bg-primary-50'}`}
                    >
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".pdf"
                        aria-hidden="true"
                        className="hidden"
                        onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null); }}
                      />
                      {file ? (
                        <>
                          <FileText className="w-10 h-10 mx-auto mb-3 text-emerald-500" aria-hidden="true" />
                          <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
                          <p className="text-xs mt-1 text-slate-400">Click to change file</p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-10 h-10 mx-auto mb-3 text-slate-300" aria-hidden="true" />
                          <p className="text-sm font-medium text-slate-500">
                            Drop your PDF here or click to browse
                          </p>
                          <p className="text-xs mt-1 text-slate-400">PDF files only</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Text area */}
                  {tab === 'text' && (
                    <div>
                      <label className="label" htmlFor="jobText">Job Description</label>
                      <textarea
                        id="jobText"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Paste the job description here…"
                        rows={12}
                        className="input resize-none focus-visible:ring-2 focus-visible:ring-primary-300"
                        aria-required="true"
                      />
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Step 3: Review ── */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="p-8 space-y-5"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-indigo-950">Step 3 of 3 - Review & Publish</p>
                      <p className="text-xs text-slate-400">Confirm the details below then publish to Lumino</p>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs text-slate-400 font-medium">Job ID</span>
                      <code className="text-xs font-mono text-primary-500 bg-primary-50 px-2 py-0.5 rounded">
                        {jobId || '-'}
                      </code>
                    </div>
                    {department && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-xs text-slate-400 font-medium">Department</span>
                        <span className="text-xs text-indigo-950 capitalize">{department}</span>
                      </div>
                    )}
                    {location && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-xs text-slate-400 font-medium">Location</span>
                        <span className="text-xs text-indigo-950">{location}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs text-slate-400 font-medium">Input method</span>
                      <span className="text-xs text-indigo-950">
                        {tab === 'pdf' ? `PDF - ${file?.name ?? 'none'}` : 'Pasted text'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs text-slate-400 font-medium">Content ready</span>
                      <span className={`text-xs font-medium ${(tab === 'pdf' && file) || (tab === 'text' && text.trim())
                          ? 'text-emerald-600'
                          : 'text-red-400'
                        }`}>
                        {(tab === 'pdf' && file) || (tab === 'text' && text.trim())
                          ? 'Yes'
                          : 'Missing'}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-indigo-950 p-4 flex items-start gap-3">
                    <Zap className="w-4 h-4 text-yellow-300 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <p className="text-xs text-indigo-200 leading-relaxed">
                      Publishing will extract skills, domain requirements, and work-style preferences
                      into a knowledge graph. This may take a few seconds.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Inline error ── */}
            {error && (
              <div role="alert" className="mx-8 mb-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                {error}
              </div>
            )}

            {/* ── Nav buttons ── */}
            <div className="flex items-center justify-between px-8 py-5 border-t border-slate-100 bg-slate-50">
              <button
                onClick={goBack}
                disabled={step === 1}
                aria-label="Go to previous step"
                className="btn-secondary btn-sm flex items-center gap-1.5 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary-300"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                Back
              </button>

              {step < 3 ? (
                <button
                  onClick={goNext}
                  aria-label="Go to next step"
                  className="btn-primary flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={handlePublish}
                  disabled={loading}
                  aria-busy={loading}
                  className="btn-primary flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary-300"
                >
                  {loading ? (
                    <>
                      <span className="spinner-sm" aria-hidden="true" />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" aria-hidden="true" />
                      Publish Job
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
