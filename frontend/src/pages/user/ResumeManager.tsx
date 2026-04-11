import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle,
  FileText,
  Network,
  ShieldAlert,
  ShieldCheck,
  Upload as UploadIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { IngestUserResponse } from '../../lib/types';

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <motion.div
      className="stat-card text-center"
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <p className="text-3xl font-extrabold text-indigo-950 tracking-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wide">{label}</p>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type TabType = 'pdf' | 'text';

export default function ResumeManager() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabType>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestUserResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleAnalyse() {
    if (!session?.userId) {
      setError('You must be logged in to analyse a profile.');
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      let data: IngestUserResponse;
      if (tab === 'pdf') {
        if (!file) throw new Error('Please select a PDF file.');
        data = await api.uploadUserPdf(session.userId, file);
      } else {
        if (!text.trim()) throw new Error('Please paste your profile text.');
        data = await api.ingestUser(session.userId, text.trim());
      }
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

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

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError(null);
  }

  return (
    <>
      <title>Upload Resume - Lumino</title>

      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-indigo-950 tracking-tight">
              Build Your Digital Twin
            </h1>
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
              We use LLM interpretation of your resume to build a digital twin for explainable matching and practical next steps.
            </p>
          </div>
          <Link
            to="/user/guidelines"
            className="btn-secondary btn-sm flex-shrink-0 mt-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            aria-label="View resume tips and guidelines"
          >
            <BookOpen size={13} aria-hidden="true" />
            Tips
          </Link>
        </div>

        {/* ── Tab switcher ── */}
        <div
          className="flex gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200 mb-6"
          role="tablist"
          aria-label="Resume upload method"
        >
          {(['pdf', 'text'] as TabType[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              id={`tab-${t}`}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 ${tab === t
                ? 'bg-white text-indigo-950 shadow-prism'
                : 'text-slate-500 hover:text-indigo-950'
                }`}
            >
              {t === 'pdf' ? 'Upload PDF' : 'Paste Text'}
            </button>
          ))}
        </div>

        {/* ── PDF Drop Zone ── */}
        {tab === 'pdf' && (
          <div
            id="panel-pdf"
            role="tabpanel"
            aria-labelledby="tab-pdf"
          >
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={onDragOver}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
              tabIndex={0}
              role="button"
              aria-label={
                file
                  ? `Selected file: ${file.name}. Press Enter to change file.`
                  : 'Drop your PDF here or press Enter to browse files'
              }
              className={`rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 border-2 border-dashed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 outline-none ${dragging
                ? 'border-blue-400 bg-blue-50 scale-[1.01]'
                : file
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40'
                }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={onFileChange}
                aria-hidden="true"
                tabIndex={-1}
              />
              {file ? (
                <>
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-100 flex items-center justify-center">
                    <FileText size={28} className="text-emerald-600" aria-hidden="true" />
                  </div>
                  <p className="font-bold text-emerald-700">{file.name}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {(file.size / 1024).toFixed(0)} KB · Click to change
                  </p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <UploadIcon size={28} className="text-slate-400" aria-hidden="true" />
                  </div>
                  <p className="font-bold text-slate-700">
                    Drop your resume PDF here or click to browse
                  </p>
                  <p className="text-sm text-slate-400 mt-1">Supports text-based PDF files up to 10 MB</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Text Paste ── */}
        {tab === 'text' && (
          <div
            id="panel-text"
            role="tabpanel"
            aria-labelledby="tab-text"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your resume, portfolio summary, or LinkedIn profile text here..."
              rows={14}
              aria-label="Resume or profile text input"
              className="input resize-none leading-relaxed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            />
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="alert-error mt-4" role="alert" aria-live="assertive">
            <AlertCircle size={15} className="flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Analyse Button ── */}
        <button
          onClick={handleAnalyse}
          disabled={loading}
          aria-busy={loading}
          className="btn-primary btn-lg w-full mt-6 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        >
          {loading ? (
            <>
              <span className="spinner-sm" aria-hidden="true" />
              Building your profile graph...
            </>
          ) : (
            'Extract Profile Intelligence'
          )}
        </button>

        {/* ── Result Section ── */}
        {result && (
          <div className="mt-10 fade-in space-y-6" aria-live="polite">

            {/* Success indicator */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={18} className="text-emerald-600" aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-indigo-950 text-sm">Profile successfully processed</p>
                <p className="text-xs text-slate-500">Your graph and explainability signals are now updated</p>
              </div>
            </div>

            {/* Stat cards grid */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Skills Extracted" value={result.skills_extracted ?? 0} />
              <StatCard label="Domains" value={result.domains_extracted ?? 0} />
              <StatCard label="Projects" value={result.projects_extracted ?? 0} />
              <StatCard label="Experiences" value={result.experiences_extracted ?? 0} />
              {(result.education_extracted ?? 0) > 0 && (
                <StatCard label="Education" value={result.education_extracted!} />
              )}
              {(result.certifications_extracted ?? 0) > 0 && (
                <StatCard label="Certifications" value={result.certifications_extracted!} />
              )}
              {(result.achievements_extracted ?? 0) > 0 && (
                <StatCard label="Achievements" value={result.achievements_extracted!} />
              )}
              {(result.publications_extracted ?? 0) > 0 && (
                <StatCard label="Publications" value={result.publications_extracted!} />
              )}
            </div>

            {/* Verification banner */}
            {result.interpretation_flags > 0 ? (
              <div className="rounded-2xl p-5 bg-amber-50 border border-amber-200" role="region" aria-label="Profile verification required">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <ShieldAlert size={18} className="text-amber-600" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-bold text-amber-800 text-sm">
                      {result.interpretation_flags} AI interpretation{result.interpretation_flags !== 1 ? 's' : ''} need review
                    </p>
                    <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                      The AI inferred a few details from your resume. Review them to maximize ranking confidence and profile accuracy.
                    </p>
                  </div>
                </div>

                {(result.clarification_questions?.length ?? 0) > 0 && (
                  <ul className="space-y-2 mb-4" aria-label="Questions needing clarification">
                    {result.clarification_questions!.map((q) => (
                      <li
                        key={q.flag_id}
                        className="flex items-start gap-2 text-xs text-amber-800 bg-amber-100 rounded-xl px-3 py-2.5"
                      >
                        <AlertTriangle size={11} className="flex-shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                        {q.question}
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  onClick={() => navigate('/user/clarifications')}
                  className="btn-primary w-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                  aria-label="Go to profile verification page"
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  Verify My Profile
                </button>
              </div>
            ) : (
              <div className="alert-success" role="status">
                <ShieldCheck size={15} className="flex-shrink-0" aria-hidden="true" />
                <span>Profile fully verified - no ambiguous interpretations detected.</span>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/user/model')}
                className="btn-secondary flex-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                aria-label="View your knowledge graph"
              >
                <Network size={14} aria-hidden="true" />
                Knowledge Graph
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-primary flex-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                aria-label="Browse matching jobs on dashboard"
              >
                <BarChart3 size={14} aria-hidden="true" />
                Browse Jobs →
              </button>
            </div>

          </div>
        )}
      </div>
    </>
  );
}
