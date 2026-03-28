import { Code2, Cpu, Database, Globe, Target, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import JobPickerModal from '../../components/practice/JobPickerModal';
import PracticeChat from '../../components/practice/PracticeChat';
import PracticeScorecardOverlay from '../../components/practice/PracticeScorecard';
import PhaseTimeline from '../../components/practice/PhaseTimeline';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { PracticeMessage, PracticeScorecard } from '../../lib/types';

// ─── Knowledge graph nodes (static visualization) ─────────────────────────────

const SKILL_NODES = [
  { id: 'react', label: 'React', icon: Code2, cx: 50, cy: 35, radius: 32, color: 'bg-blue-500', ring: 'ring-blue-300', connections: ['typescript', 'graphql'] },
  { id: 'typescript', label: 'TypeScript', icon: Code2, cx: 25, cy: 62, radius: 26, color: 'bg-indigo-500', ring: 'ring-indigo-300', connections: ['react'] },
  { id: 'graphql', label: 'GraphQL', icon: Database, cx: 73, cy: 60, radius: 24, color: 'bg-pink-500', ring: 'ring-pink-300', connections: ['react', 'nodejs'] },
  { id: 'nodejs', label: 'Node.js', icon: Cpu, cx: 50, cy: 80, radius: 22, color: 'bg-emerald-500', ring: 'ring-emerald-300', connections: ['graphql'] },
  { id: 'cloud', label: 'Cloud', icon: Globe, cx: 82, cy: 32, radius: 20, color: 'bg-sky-400', ring: 'ring-sky-300', connections: ['react'] },
];

const PHASE_ORDER = ['intro', 'technical', 'behavioral', 'culture', 'closing'];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Practice() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [jobInfo, setJobInfo] = useState<{ jobTitle: string; company: string } | null>(null);
  const [phase, setPhase] = useState('intro');
  const [messages, setMessages] = useState<PracticeMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Right panel state
  const [coachingHint, setCoachingHint] = useState<string | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [scorecard, setScorecard] = useState<PracticeScorecard | null>(null);

  // Modal state
  const [showJobPicker, setShowJobPicker] = useState(false);

  const jobIdFromUrl = searchParams.get('jobId');
  const startedRef = useRef(false);

  // ── Session start ────────────────────────────────────────────────────────────

  const startSession = useCallback(
    async (jobId: string) => {
      if (!session || startedRef.current) return;
      startedRef.current = true;
      setIsLoading(true);
      setStartError(null);
      try {
        const res = await api.practice.startSession({ user_id: session.userId, job_id: jobId });
        setSessionId(res.session_id);
        setJobInfo({ jobTitle: res.job_title, company: res.company });
        setPhase(res.phase);
        setMessages([
          {
            role: 'assistant',
            content: res.opening_message,
            persona: res.interviewer_persona,
            phase: res.phase,
            phaseChanged: false,
          },
        ]);
      } catch (e) {
        setStartError(e instanceof Error ? e.message : 'Failed to start session');
        startedRef.current = false;
      } finally {
        setIsLoading(false);
      }
    },
    [session]
  );

  useEffect(() => {
    if (!session) return;
    if (jobIdFromUrl) {
      startSession(jobIdFromUrl);
    } else {
      setShowJobPicker(true);
    }
  }, [session, jobIdFromUrl, startSession]);

  // ── Send message ─────────────────────────────────────────────────────────────

  async function handleSend(content: string) {
    if (!sessionId || !session || isLoading) return;
    setSendError(null);

    // Optimistically append user message
    setMessages((prev) => [...prev, { role: 'user', content, phase }]);
    setIsLoading(true);

    try {
      const turn = await api.practice.sendMessage(sessionId, {
        user_id: session.userId,
        content,
      });

      // Append assistant turn
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: turn.ai_response,
          persona: turn.interviewer_persona,
          phase: turn.phase,
          phaseChanged: turn.phase_changed,
        },
      ]);

      if (turn.phase_changed) setPhase(turn.phase);
      if (turn.coaching_hint) setCoachingHint(turn.coaching_hint);

      // Trigger scorecard when session is complete
      if (turn.session_complete) {
        await handleComplete();
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send message');
      // Remove the optimistic user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }

  // ── Complete session ──────────────────────────────────────────────────────────

  async function handleComplete() {
    if (!sessionId || !session) return;
    try {
      const card = await api.practice.completeSession(sessionId, { user_id: session.userId });
      setScorecard(card);
      setSessionComplete(true);
    } catch {
      // Non-fatal: show inline error but don't crash the page
      setSendError('Could not generate scorecard. Your session has been saved.');
      setSessionComplete(true);
    }
  }

  // ── Phase progress (0–100%) ───────────────────────────────────────────────────

  const phaseIdx = PHASE_ORDER.indexOf(phase);
  const phaseProgress = Math.round(((phaseIdx + 1) / PHASE_ORDER.length) * 100);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <title>Practice Interview{jobInfo ? ` — ${jobInfo.jobTitle}` : ''} - Lumino</title>

      {/* Job picker modal (no jobId in URL) */}
      {showJobPicker && (
        <JobPickerModal
          onSelect={(jobId) => {
            setShowJobPicker(false);
            startSession(jobId);
            // Update URL without navigation
            window.history.replaceState({}, '', `/practice?jobId=${jobId}`);
          }}
        />
      )}

      <div className="h-[calc(100vh-4rem)] overflow-hidden flex bg-slate-50">

        {/* ── Left Panel: Interview Chat ── */}
        <div
          className="w-full lg:w-[480px] xl:w-[540px] flex flex-col border-r border-slate-100 bg-white"
          role="main"
          aria-label="Practice interview interface"
        >
          {/* Phase progress bar */}
          <div
            className="h-1 bg-slate-100 flex-shrink-0"
            role="progressbar"
            aria-valuenow={phaseIdx + 1}
            aria-valuemin={1}
            aria-valuemax={PHASE_ORDER.length}
            aria-label={`Phase ${phaseIdx + 1} of ${PHASE_ORDER.length}`}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
              animate={{ width: `${phaseProgress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          {/* Session header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
                <Target size={14} className="text-white" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-950">
                  {jobInfo?.jobTitle ?? 'Practice Session'}
                </p>
                <p className="text-[10px] text-slate-400">{jobInfo?.company ?? 'Loading…'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {phase !== 'intro' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wide">
                  {phase}
                </span>
              )}
              <button
                onClick={() => navigate('/applications')}
                className="btn-secondary btn-sm"
                aria-label="End session and return to applications"
              >
                End Session
              </button>
            </div>
          </div>

          {/* Errors */}
          {startError && (
            <div role="alert" className="mx-5 mt-3 alert-error text-sm">
              {startError}
            </div>
          )}
          {sendError && (
            <div role="alert" className="mx-5 mt-2 alert-error text-sm flex items-center justify-between">
              <span>{sendError}</span>
              <button
                className="text-red-400 hover:text-red-600 text-xs underline ml-2"
                onClick={() => setSendError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Chat (takes remaining vertical space) */}
          <div className="flex-1 overflow-hidden">
            <PracticeChat
              messages={messages}
              isLoading={isLoading}
              onSend={handleSend}
              sessionComplete={sessionComplete}
            />
          </div>
        </div>

        {/* ── Right Panel: Knowledge Graph + HUD ── */}
        <div
          className="hidden lg:flex flex-1 relative overflow-hidden bg-white"
          role="complementary"
          aria-label="Knowledge graph and session insights"
        >
          {/* Dot grid background */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
            aria-hidden="true"
          />

          {/* Graph title */}
          <div className="absolute top-6 left-6 z-10">
            <h2 className="text-sm font-bold text-indigo-950">Your Knowledge Graph</h2>
            <p className="text-xs text-slate-400 mt-0.5">Skills activated in this session</p>
          </div>

          {/* SVG connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
            {SKILL_NODES.flatMap((node) =>
              node.connections.map((targetId) => {
                const target = SKILL_NODES.find((n) => n.id === targetId);
                if (!target) return null;
                return (
                  <line
                    key={`${node.id}-${targetId}`}
                    x1={`${node.cx}%`} y1={`${node.cy}%`}
                    x2={`${target.cx}%`} y2={`${target.cy}%`}
                    stroke="#3B82F6" strokeWidth="1.5" strokeOpacity="0.2"
                  />
                );
              })
            )}
          </svg>

          {/* Skill nodes */}
          {SKILL_NODES.map((node, i) => (
            <motion.div
              key={node.id}
              className="absolute flex flex-col items-center gap-1.5"
              style={{ left: `${node.cx}%`, top: `${node.cy}%`, transform: 'translate(-50%, -50%)' }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, type: 'spring', stiffness: 260, damping: 20 }}
              role="img"
              aria-label={`Skill: ${node.label}`}
            >
              <motion.div
                className={`rounded-full ${node.color} flex items-center justify-center shadow-lg ring-4 ${node.ring} ring-opacity-30 cursor-pointer`}
                style={{ width: node.radius * 2, height: node.radius * 2 }}
                whileHover={{ scale: 1.15, y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              >
                <node.icon size={Math.max(14, node.radius * 0.55)} className="text-white" aria-hidden="true" />
              </motion.div>
              <span className="text-[11px] font-bold text-slate-600 bg-white/80 px-1.5 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                {node.label}
              </span>
            </motion.div>
          ))}

          {/* HUD: bottom-right */}
          <div className="absolute bottom-6 right-6 z-10 space-y-3">

            {/* Coaching insight card */}
            <AnimatePresence mode="wait">
              {coachingHint && (
                <motion.div
                  key={coachingHint}
                  className="w-64 rounded-2xl p-4"
                  style={{ background: 'rgba(15, 23, 63, 0.92)', backdropFilter: 'blur(8px)' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  role="complementary"
                  aria-label="Coaching insight"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center">
                      <Zap size={12} className="text-white" aria-hidden="true" />
                    </div>
                    <p className="text-xs font-bold text-white">Coaching Insight</p>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{coachingHint}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Phase timeline */}
            <PhaseTimeline currentPhase={phase} sessionComplete={sessionComplete} />
          </div>

          {/* Scorecard overlay */}
          <AnimatePresence>
            {sessionComplete && scorecard && (
              <PracticeScorecardOverlay
                scorecard={scorecard}
                onPracticeAgain={() => {
                  // Reset all state and reload with same job
                  startedRef.current = false;
                  setSessionId(null);
                  setMessages([]);
                  setPhase('intro');
                  setCoachingHint(null);
                  setSessionComplete(false);
                  setScorecard(null);
                  if (jobIdFromUrl) startSession(jobIdFromUrl);
                  else setShowJobPicker(true);
                }}
                onBackToApplications={() => navigate('/applications')}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
