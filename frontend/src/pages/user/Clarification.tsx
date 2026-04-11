import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileText,
  Heart,
  HelpCircle,
  Info,
  Loader,
  MapPin,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { clearUserMatchCache } from '../../lib/matchCache';
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
      clearUserMatchCache(session!.userId);
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
      clearUserMatchCache(session!.userId);
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
              placeholder="Be specific: what did you own, what changed, and what measurable result did you deliver?"
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

// ─── Profile Booster ──────────────────────────────────────────────────────────

const VALUE_OPTIONS = [
  'Work-life balance', 'Career growth', 'Meaningful impact', 'Compensation',
  'Innovation', 'Stability', 'Autonomy', 'Learning', 'Remote flexibility', 'Strong team',
];

interface BoosterCard {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  color: string;
  bg: string;
}

function ProfileBooster({ userId }: { userId: string }) {
  const [completeness, setCompleteness] = useState<Record<string, boolean> | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  // Form state
  const [goal, setGoal] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [salMin, setSalMin] = useState('');
  const [salMax, setSalMax] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [location, setLocation] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [empTypes, setEmpTypes] = useState<string[]>([]);
  const [workAuth, setWorkAuth] = useState('');

  useEffect(() => {
    api.getCompleteness(userId)
      .then((res: unknown) => setCompleteness(res as Record<string, boolean>))
      .catch(() => { });
  }, [userId]);

  const cards: BoosterCard[] = [
    { id: 'goal', icon: Target, title: 'Career Goal', subtitle: 'Matches you to roles on your growth path', color: 'text-violet-600', bg: 'bg-violet-50' },
    { id: 'values', icon: Heart, title: 'Work Values', subtitle: 'Filters companies that share what you care about', color: 'text-rose-600', bg: 'bg-rose-50' },
    { id: 'salary', icon: DollarSign, title: 'Salary Expectation', subtitle: 'Avoids roles where compensation won\'t match', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'location', icon: MapPin, title: 'Location Preference', subtitle: 'Deprioritizes roles that require unwanted relocation', color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'employment', icon: Briefcase, title: 'Employment Type', subtitle: "Full-time, contract, freelance — we'll filter for it", color: 'text-amber-600', bg: 'bg-amber-50' },
  ].filter(c => {
    if (!completeness) return true;
    if (c.id === 'goal') return !completeness['goal_set'];
    if (c.id === 'values') return !completeness['values_identified'];
    return true; // always show salary/location/employment as they're always improvable
  });

  function toggleValue(v: string) {
    setValues(prev => prev.includes(v) ? prev.filter(x => x !== v) : prev.length < 3 ? [...prev, v] : prev);
  }
  function toggleEmpType(t: string) {
    setEmpTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function handleSave(cardId: string) {
    setSaving(true);
    try {
      const payload: Parameters<typeof api.saveCareerPreferences>[1] = {};
      if (cardId === 'goal' && goal.trim()) payload.career_goal = goal.trim();
      if (cardId === 'values' && values.length) payload.values = values.map(v => v.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      if (cardId === 'salary') {
        if (salMin) payload.salary_min = parseInt(salMin);
        if (salMax) payload.salary_max = parseInt(salMax);
        payload.salary_currency = currency;
      }
      if (cardId === 'location') {
        payload.location = remoteOnly ? 'Remote' : location.trim();
        payload.remote_only = remoteOnly;
      }
      if (cardId === 'employment' && empTypes.length) {
        payload.employment_types = empTypes.map(t => t.toLowerCase().replace('-', '_'));
      }
      if (workAuth) payload.work_authorization = workAuth;
      await api.saveCareerPreferences(userId, payload);
      clearUserMatchCache(userId);
      setSaved(prev => new Set([...prev, cardId]));
      setOpenCard(null);
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  if (cards.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-blue-500" />
        <h2 className="text-base font-bold text-indigo-950">Boost Your Match Score</h2>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        These signals are missing from your graph. Adding them helps the algorithm rank roles that fit your real situation — not just your skills.
      </p>

      <div className="space-y-3">
        {cards.map(card => {
          const Icon = card.icon;
          const isDone = saved.has(card.id);
          const isOpen = openCard === card.id;

          return (
            <div key={card.id} className={`card-lumino overflow-hidden transition-all ${isDone ? 'opacity-60' : ''}`}>
              <button
                onClick={() => setOpenCard(isOpen ? null : card.id)}
                disabled={isDone}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/50 transition-colors disabled:cursor-default"
              >
                <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center flex-shrink-0`}>
                  {isDone ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Icon size={18} className={card.color} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-indigo-950">{card.title}</p>
                  <p className="text-xs text-slate-400 truncate">{isDone ? 'Saved to your graph' : card.subtitle}</p>
                </div>
                {!isDone && <ArrowRight size={15} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
              </button>

              {isOpen && !isDone && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                  {card.id === 'goal' && (
                    <textarea value={goal} onChange={e => setGoal(e.target.value)}
                      placeholder="e.g. Move into a tech lead role at a growth-stage startup within 18 months"
                      rows={3} className="input resize-none text-sm w-full" />
                  )}
                  {card.id === 'values' && (
                    <div className="flex flex-wrap gap-2">
                      {VALUE_OPTIONS.map(v => (
                        <button key={v} onClick={() => toggleValue(v)}
                          disabled={!values.includes(v) && values.length >= 3}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all disabled:opacity-40 ${values.includes(v) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                            }`}>{v}</button>
                      ))}
                      <p className="w-full text-xs text-slate-400">Pick up to 3</p>
                    </div>
                  )}
                  {card.id === 'salary' && (
                    <div className="flex gap-2 items-center">
                      <input type="number" value={salMin} onChange={e => setSalMin(e.target.value)} placeholder="Min" className="input flex-1 text-sm" />
                      <span className="text-slate-400 text-sm">–</span>
                      <input type="number" value={salMax} onChange={e => setSalMax(e.target.value)} placeholder="Max" className="input flex-1 text-sm" />
                      <select value={currency} onChange={e => setCurrency(e.target.value)} className="input w-20 text-sm">
                        {['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  {card.id === 'location' && (
                    <div className="space-y-2">
                      <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. San Francisco, London…"
                        className="input text-sm w-full" disabled={remoteOnly} />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={remoteOnly} onChange={e => { setRemoteOnly(e.target.checked); if (e.target.checked) setLocation(''); }}
                          className="rounded border-slate-300 text-blue-600" />
                        <span className="text-sm text-slate-600">Remote only</span>
                      </label>
                    </div>
                  )}
                  {card.id === 'employment' && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'].map(t => (
                          <button key={t} onClick={() => toggleEmpType(t)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${empTypes.includes(t) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                              }`}>{t}</button>
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-500">Work authorization</p>
                        {[
                          { value: 'authorized', label: 'Authorized (no sponsorship needed)' },
                          { value: 'have_work_permit', label: 'Have a work permit / existing visa' },
                          { value: 'need_sponsorship', label: 'Need visa sponsorship' },
                        ].map(opt => (
                          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="work_auth_booster" value={opt.value} checked={workAuth === opt.value}
                              onChange={() => setWorkAuth(opt.value)} className="text-blue-600" />
                            <span className="text-sm text-slate-600">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => handleSave(card.id)} disabled={saving}
                    className="btn-primary btn-sm w-full flex items-center justify-center gap-1.5 mt-1 disabled:opacity-50">
                    {saving ? <><Loader size={13} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={13} /> Save to my graph</>}
                  </button>
                </div>
              )}
            </div>
          );
        })}
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
      <title>Profile Accuracy - Lumino</title>

      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck
              size={22}
              className={data?.graph_verified ? 'text-emerald-500' : 'text-amber-500'}
            />
            <h1 className="text-2xl font-bold text-indigo-950">Profile Accuracy Center</h1>
          </div>
          <p className="text-sm text-slate-500">
            Lumino found {data?.total_flags ?? 0} interpretation points from your resume.
            Confirming them improves ranking quality and interview relevance.
          </p>
        </div>

        {/* Graph verified banner */}
        {data?.graph_verified && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl mb-5 bg-emerald-50 border border-emerald-100">
            <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-emerald-700">Graph verified</p>
              <p className="text-xs mt-0.5 text-emerald-600">
                All critical interpretations are confirmed. Your match scoring is now fully trusted.
              </p>
            </div>
          </div>
        )}

        {/* Critical warning */}
        {!data?.graph_verified && criticalPending > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-5 bg-amber-50 border border-amber-100 text-amber-700 text-sm">
            <AlertTriangle size={15} className="flex-shrink-0" />
            {criticalPending} high-impact {criticalPending === 1 ? 'item still affects' : 'items still affect'} your ranking accuracy.
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
            <p className="font-medium text-indigo-950">Verification complete</p>
            <p className="text-sm text-slate-400 mt-1">No pending interpretation checks remain.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map(q => (
              <QuestionCard key={q.flag_id} q={q} onResolved={onResolved} />
            ))}
          </div>
        )}

        {/* Profile booster - always visible, nudges users to add missing signals */}
        <ProfileBooster userId={session!.userId} />

        {/* Bottom navigation */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={() => navigate('/user/model')}
            className="btn-secondary flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            <ChevronLeft size={15} /> View Graph
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Browse Jobs <ChevronRight size={15} />
          </button>
        </div>

      </div>
    </>
  );
}
