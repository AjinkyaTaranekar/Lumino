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
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { ClarificationQuestion, ClarificationsResponse } from '../../lib/types';

// ─── Impact meta ───────────────────────────────────────────────────────────────

type Impact = 'critical' | 'important' | 'minor';

const IMPACT_META: Record<Impact, { badge: string; label: string; icon: React.ElementType }> = {
  critical: { badge: 'badge-red', label: 'Critical', icon: AlertTriangle },
  important: { badge: 'badge-orange', label: 'Important', icon: Info },
  minor: { badge: 'badge-gray', label: 'Minor', icon: HelpCircle },
};

// ─── ImpactBadge ──────────────────────────────────────────────────────────────

function ImpactBadge({ impact }: { impact: string }) {
  const m = IMPACT_META[(impact as Impact)] ?? IMPACT_META.minor;
  const Icon = m.icon;
  return (
    <span className={`badge ${m.badge} flex items-center gap-1`}>
      <Icon size={10} />
      {m.label}
    </span>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────

function ProgressBar({ resolved, total }: { resolved: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((resolved / total) * 100);
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
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

// ─── Interpretation response shape (from api.interpretFlag) ───────────────────

interface InterpretResult {
  is_complete: boolean;
  interpreted_value?: string;
  explanation?: string;
  confidence?: string;
  needs_clarification?: string;
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────

type Phase = 'idle' | 'typing' | 'interpreting' | 'confirming' | 'done';

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed ✓',
  corrected: 'Corrected ✓',
  skipped: 'Skipped',
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: 'text-emerald-600',
  corrected: 'text-amber-600',
  skipped: 'text-slate-400',
};

interface QuestionCardProps {
  q: ClarificationQuestion;
  onResolved: (updated: ClarificationQuestion) => void;
}

function QuestionCard({ q, onResolved }: QuestionCardProps) {
  const { session } = useAuth();

  const [phase, setPhase] = useState<Phase>(q.status !== 'pending' ? 'done' : 'idle');
  const [answer, setAnswer] = useState('');
  const [interpretation, setInterp] = useState<InterpretResult | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleInterpret() {
    if (!answer.trim()) return;
    setPhase('interpreting');
    setErr(null);
    try {
      const res = await api.interpretFlag(session!.userId, q.flag_id, answer.trim()) as InterpretResult;
      setInterp(res);
      if (!res.is_complete) {
        setFollowUp(res.needs_clarification ?? null);
        setAnswer('');
        setPhase('typing');
      } else {
        setPhase('confirming');
      }
    } catch (e) {
      setErr((e as Error).message);
      setPhase('idle');
    }
  }

  async function handleSelectOption(opt: string) {
    setSelectedOption(opt);
    setPhase('interpreting');
    setErr(null);
    try {
      const res = await api.interpretFlag(session!.userId, q.flag_id, opt) as InterpretResult;
      setInterp(res);
      if (!res.is_complete) {
        setFollowUp(res.needs_clarification ?? null);
        setAnswer('');
        setPhase('typing');
      } else {
        setAnswer(opt);
        setPhase('confirming');
      }
    } catch (e) {
      setErr((e as Error).message);
      setPhase('idle');
    }
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      await api.resolveFlag(
        session!.userId,
        q.flag_id,
        false,
        answer || 'Confirmed via natural language',
        interpretation?.interpreted_value
      );
      setPhase('done');
      onResolved({ ...q, status: 'corrected' });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmOriginal() {
    setSaving(true);
    try {
      await api.resolveFlag(session!.userId, q.flag_id, true, 'Confirmed original interpretation', null);
      setPhase('done');
      onResolved({ ...q, status: 'confirmed' });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    await api.skipFlag(session!.userId, q.flag_id).catch(() => { });
    setPhase('done');
    onResolved({ ...q, status: 'skipped' });
  }

  // ── Done state (compact) ────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="card-lumino p-4 opacity-60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ImpactBadge impact={q.resolution_impact} />
          <span className="text-sm text-slate-500">{q.field}</span>
        </div>
        <span className={`text-xs font-semibold ${STATUS_COLOR[q.status ?? ''] ?? 'text-slate-400'}`}>
          {STATUS_LABEL[q.status ?? ''] ?? q.status}
        </span>
      </div>
    );
  }

  const borderColor =
    q.resolution_impact === 'critical' ? 'border-l-red-400'
      : q.resolution_impact === 'important' ? 'border-l-amber-400'
        : 'border-l-slate-200';

  const headerBg =
    q.resolution_impact === 'critical' ? 'bg-red-50'
      : q.resolution_impact === 'important' ? 'bg-amber-50'
        : 'bg-slate-50';

  return (
    <div className={`card-lumino overflow-hidden border-l-4 ${borderColor}`}>
      {/* Card header */}
      <div className={`px-5 py-3 flex items-center justify-between ${headerBg}`}>
        <div className="flex items-center gap-2">
          <ImpactBadge impact={q.resolution_impact} />
          <code className="text-xs text-slate-500 bg-white rounded-lg px-1.5 py-0.5 border border-slate-100">
            {q.field}
          </code>
        </div>
        <button
          onClick={handleSkip}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 rounded"
          aria-label="Skip this question"
        >
          Skip
        </button>
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* From resume */}
        <div className="rounded-xl px-4 py-3 bg-slate-50 border border-slate-100">
          <p className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <FileText size={11} /> From your resume
          </p>
          <p className="text-sm italic text-indigo-950">"{q.raw_text}"</p>
        </div>

        {/* AI interpretation */}
        <div className="rounded-xl px-4 py-3 bg-blue-50 border border-blue-100">
          <p className="text-xs font-medium text-blue-600 mb-1 flex items-center gap-1.5">
            <Sparkles size={11} /> AI interpreted this as
          </p>
          <p className="text-sm text-indigo-950">{q.interpreted_as}</p>
          <p className="text-xs text-slate-400 mt-1">{q.ambiguity_reason}</p>
        </div>

        {/* Phase: idle */}
        {phase === 'idle' && (
          <>
            <p className="text-sm font-medium text-indigo-950">{q.clarification_question}</p>
            {q.suggested_options && q.suggested_options.length > 0 ? (
              <>
                <p className="text-xs text-slate-400">Pick one or describe in your own words.</p>
                <div className="flex flex-wrap gap-2">
                  {q.suggested_options.map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleSelectOption(opt)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleConfirmOriginal}
                    disabled={saving}
                    className="btn-primary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <CheckCircle2 size={13} /> AI was right
                  </button>
                  <button
                    onClick={() => setPhase('typing')}
                    className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                  >
                    <MessageSquare size={13} /> Let me describe it
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-400">Tell us in your own words, or confirm the AI was right.</p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleConfirmOriginal}
                    disabled={saving}
                    className="btn-primary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <CheckCircle2 size={13} /> AI was right
                  </button>
                  <button
                    onClick={() => setPhase('typing')}
                    className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                  >
                    <MessageSquare size={13} /> Let me describe it
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* Phase: typing */}
        {phase === 'typing' && (
          <>
            {followUp && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-xs">Your previous answer was too vague:</p>
                  <p className="text-sm mt-0.5">{followUp}</p>
                </div>
              </div>
            )}
            {!followUp && (
              <p className="text-sm text-indigo-950">{q.clarification_question}</p>
            )}
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Be specific - what exactly? How many? What was your role?"
              rows={4}
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-indigo-950 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Your answer"
            />
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setPhase('idle'); setFollowUp(null); setAnswer(''); }}
                className="btn-secondary btn-sm flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              >
                ← Back
              </button>
              <button
                onClick={handleInterpret}
                disabled={!answer.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                See how I interpreted this <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {/* Phase: interpreting */}
        {phase === 'interpreting' && (
          <div className="flex flex-col items-center py-6 gap-3">
            <Loader size={24} className="animate-spin text-blue-500" />
            <p className="text-sm text-slate-400">Interpreting your answer…</p>
          </div>
        )}

        {/* Phase: confirming */}
        {phase === 'confirming' && interpretation && (
          <>
            <div className="rounded-xl px-4 py-3 bg-slate-50 border border-slate-100">
              <p className="text-xs font-medium text-slate-400 mb-1">What you said</p>
              <p className="text-sm italic text-indigo-950">"{answer}"</p>
            </div>

            <div className="rounded-xl px-4 py-3 bg-emerald-50 border border-emerald-100">
              <p className="text-xs font-medium text-emerald-600 mb-1 flex items-center gap-1.5">
                <Sparkles size={11} /> I understood this as
              </p>
              <p className="text-sm font-medium text-indigo-950">{interpretation.interpreted_value}</p>
              <p className="text-xs text-slate-400 mt-1">{interpretation.explanation}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs text-slate-400">Confidence:</span>
                <span className={`text-xs font-semibold capitalize ${interpretation.confidence === 'high' ? 'text-emerald-600'
                    : interpretation.confidence === 'medium' ? 'text-amber-600'
                      : 'text-red-500'
                  }`}>
                  {interpretation.confidence}
                </span>
              </div>
            </div>

            <p className="text-sm font-medium text-indigo-950">
              Is this the right interpretation to save?
            </p>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setPhase('typing'); setInterp(null); }}
                className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              >
                <RefreshCw size={13} /> Rephrase
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {saving
                  ? <><Loader size={14} className="animate-spin" /> Saving…</>
                  : <><CheckCircle2 size={14} /> Yes, save this to my graph</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Clarification (page) ─────────────────────────────────────────────────────

export default function Clarification() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<ClarificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const load = useCallback(async () => {
    try {
      const res = await api.getClarifications(session!.userId);
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { load(); }, [load]);

  function onResolved(updated: ClarificationQuestion) {
    setData(prev => {
      if (!prev) return prev;
      const questions = prev.questions.map(q => q.flag_id === updated.flag_id ? { ...q, ...updated } : q);
      const pending = questions.filter(q => q.status === 'pending').length;
      const resolved = questions.filter(q => q.status !== 'pending').length;
      const criticalPending = questions.filter(q => q.status === 'pending' && q.resolution_impact === 'critical').length;
      return {
        ...prev,
        questions,
        pending,
        resolved,
        graph_verified: criticalPending === 0 && questions.length > 0,
      };
    });
  }

  const visible = data?.questions.filter(q => filter === 'all' || q.status === 'pending') ?? [];
  const criticalPending = data?.questions.filter(q => q.status === 'pending' && q.resolution_impact === 'critical').length ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="alert-error text-sm">{error}</div>
      </div>
    );
  }

  return (
    <>
      <title>Verify Profile - Lumino</title>

      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck
              size={22}
              className={data?.graph_verified ? 'text-emerald-500' : 'text-amber-500'}
            />
            <h1 className="text-2xl font-bold text-indigo-950">Verify Your Profile</h1>
          </div>
          <p className="text-sm text-slate-500">
            The AI made {data?.total_flags ?? 0} interpretations from your resume.
            Review each one to ensure your knowledge graph is accurate.
          </p>
        </div>

        {/* Graph verified banner */}
        {data?.graph_verified && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl mb-5 bg-emerald-50 border border-emerald-100">
            <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-emerald-700">Graph verified</p>
              <p className="text-xs mt-0.5 text-emerald-600">
                All critical interpretations confirmed. You are your graph.
              </p>
            </div>
          </div>
        )}

        {/* Critical warning */}
        {!data?.graph_verified && criticalPending > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-5 bg-amber-50 border border-amber-100 text-amber-700 text-sm">
            <AlertTriangle size={15} className="flex-shrink-0" />
            {criticalPending} critical {criticalPending === 1 ? 'question' : 'questions'} affect your match scores.
          </div>
        )}

        {/* Progress bar */}
        <div className="mb-5">
          <ProgressBar resolved={data?.resolved ?? 0} total={data?.total_flags ?? 0} />
        </div>

        {/* Impact count tiles */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {(['critical', 'important', 'minor'] as Impact[]).map(impact => {
            const count = data?.questions.filter(
              q => q.resolution_impact === impact && q.status === 'pending'
            ).length ?? 0;
            const m = IMPACT_META[impact];
            return (
              <div key={impact} className="card-lumino p-3 text-center">
                <p className={`text-xl font-bold ${impact === 'critical' ? 'text-red-500'
                    : impact === 'important' ? 'text-amber-600'
                      : 'text-slate-400'
                  }`}>
                  {count}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{m.label} left</p>
              </div>
            );
          })}
        </div>

        {/* Filter toggle */}
        {(data?.resolved ?? 0) > 0 && (
          <div className="flex gap-1 p-1 rounded-2xl bg-slate-50 border border-slate-100 mb-5">
            {(['pending', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${filter === f
                    ? 'bg-white shadow-sm text-indigo-950'
                    : 'text-slate-400 hover:text-slate-600'
                  }`}
                aria-pressed={filter === f}
              >
                {f === 'pending'
                  ? `Pending (${data?.pending ?? 0})`
                  : `All (${data?.total_flags ?? 0})`
                }
              </button>
            ))}
          </div>
        )}

        {/* Questions list */}
        {visible.length === 0 ? (
          <div className="text-center py-12 card-lumino p-8">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-400" />
            <p className="font-medium text-indigo-950">All caught up!</p>
            <p className="text-sm text-slate-400 mt-1">No pending questions.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map(q => (
              <QuestionCard key={q.flag_id} q={q} onResolved={onResolved} />
            ))}
          </div>
        )}

        {/* Bottom navigation */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={() => navigate('/user/model')}
            className="btn-secondary flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            <ChevronLeft size={15} /> View Graph
          </button>
          <button
            onClick={() => navigate('/user/dashboard')}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Browse Jobs <ChevronRight size={15} />
          </button>
        </div>

      </div>
    </>
  );
}
