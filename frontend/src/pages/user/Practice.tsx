import { CheckCircle2, Target, Zap } from 'lucide-react';
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

// ─── Graph node types ─────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  type: 'matched' | 'gap' | 'domain';
  cx: number;   // % from left
  cy: number;   // % from top
  radius: number;
  connections: string[];
}

interface GraphData {
  nodes: GraphNode[];
}

/** Lay out N nodes in an ellipse centered on the panel. */
function buildGraphLayout(
  matched: string[],
  missing: string[],
  domains: string[]
): GraphData {
  // Take top items — keep graph readable
  const matchedTop = matched.slice(0, 5);
  const missingTop = missing.slice(0, 3);
  const domainsTop = domains.slice(0, 2);

  type RawNode = { label: string; type: 'matched' | 'gap' | 'domain' };
  const raw: RawNode[] = [
    ...matchedTop.map((l) => ({ label: l, type: 'matched' as const })),
    ...missingTop.map((l) => ({ label: l, type: 'gap' as const })),
    ...domainsTop.map((l) => ({ label: l, type: 'domain' as const })),
  ];

  const n = raw.length;
  const CX = 50;   // panel center x %
  const CY = 50;   // panel center y %
  const RX = 32;   // ellipse horizontal radius %
  const RY = 26;   // ellipse vertical radius %

  const nodes: GraphNode[] = raw.map((item, i) => {
    // Start at top (-π/2) and go clockwise
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const cx = CX + RX * Math.cos(angle);
    const cy = CY + RY * Math.sin(angle);

    const radius =
      item.type === 'matched' ? 24
      : item.type === 'domain' ? 20
      : 18;

    return {
      id: `${item.type}-${i}`,
      label: item.label,
      type: item.type,
      cx,
      cy,
      radius,
      connections: [],
    };
  });

  // Connect matched skills to each other (ring) for a cohesive look
  const matchedNodes = nodes.filter((n) => n.type === 'matched');
  matchedNodes.forEach((node, i) => {
    const next = matchedNodes[(i + 1) % matchedNodes.length];
    if (next && next.id !== node.id) node.connections.push(next.id);
  });

  // Connect each gap node to the nearest matched node
  const gapNodes = nodes.filter((n) => n.type === 'gap');
  gapNodes.forEach((gap) => {
    if (matchedNodes.length > 0) {
      const nearest = matchedNodes.reduce((best, mn) => {
        const d = Math.hypot(mn.cx - gap.cx, mn.cy - gap.cy);
        const bd = Math.hypot(best.cx - gap.cx, best.cy - gap.cy);
        return d < bd ? mn : best;
      });
      gap.connections.push(nearest.id);
    }
  });

  return { nodes };
}

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

  // Right panel graph state
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  // Modal state
  const [showJobPicker, setShowJobPicker] = useState(false);

  const jobIdFromUrl = searchParams.get('jobId');
  // Track the active job ID (URL param or modal selection)
  const [activeJobId, setActiveJobId] = useState<string | null>(jobIdFromUrl);
  const startedRef = useRef(false);

  // ── Session start ────────────────────────────────────────────────────────────

  const startSession = useCallback(
    async (jobId: string) => {
      if (!session || startedRef.current) return;
      startedRef.current = true;
      setActiveJobId(jobId);
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

  // ── Fetch real graph data (match + job profile) ───────────────────────────────

  useEffect(() => {
    if (!session || !activeJobId) return;
    Promise.all([
      api.getMatchDetail(session.userId, activeJobId),
      api.getJobProfile(activeJobId),
    ])
      .then(([match, jobProfile]) => {
        const domains = [
          ...match.matched_domains,
          ...match.missing_domains,
        ].slice(0, 2);
        setGraphData(
          buildGraphLayout(match.matched_skills, match.missing_skills, domains)
        );
      })
      .catch(() => {
        // Non-critical — graph stays empty; session is unaffected
      });
  }, [session, activeJobId]);

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
            setActiveJobId(jobId);
            startSession(jobId);
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

          {/* Graph title + legend */}
          <div className="absolute top-6 left-6 z-10">
            <h2 className="text-sm font-bold text-indigo-950">Your Knowledge Graph</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {graphData
                ? 'Skills matched against this role'
                : 'Loading skill graph…'}
            </p>
            {graphData && (
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600">
                  <CheckCircle2 size={10} aria-hidden="true" /> You have
                </span>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-500">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 inline-block" aria-hidden="true" /> Gap
                </span>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" aria-hidden="true" /> Domain
                </span>
              </div>
            )}
          </div>

          {/* Loading shimmer */}
          {!graphData && (
            <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <div className="w-48 h-48 rounded-full border border-dashed border-slate-200 animate-pulse opacity-50" />
            </div>
          )}

          {graphData && (
            <>
              {/* SVG connection lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                {graphData.nodes.flatMap((node) =>
                  node.connections.map((targetId) => {
                    const target = graphData.nodes.find((n) => n.id === targetId);
                    if (!target) return null;
                    const isGapLink = node.type === 'gap' || target.type === 'gap';
                    return (
                      <line
                        key={`${node.id}-${targetId}`}
                        x1={`${node.cx}%`} y1={`${node.cy}%`}
                        x2={`${target.cx}%`} y2={`${target.cy}%`}
                        stroke={isGapLink ? '#F59E0B' : '#3B82F6'}
                        strokeWidth="1.5"
                        strokeOpacity="0.25"
                        strokeDasharray={isGapLink ? '4 3' : undefined}
                      />
                    );
                  })
                )}
              </svg>

              {/* Skill nodes */}
              {graphData.nodes.map((node, i) => {
                const isMatched = node.type === 'matched';
                const isGap = node.type === 'gap';
                const bgColor = isMatched ? 'bg-blue-500' : isGap ? 'bg-amber-400' : 'bg-emerald-500';
                const ringColor = isMatched ? 'ring-blue-300' : isGap ? 'ring-amber-200' : 'ring-emerald-200';
                const borderStyle = isGap
                  ? { background: 'transparent', border: '2px dashed #F59E0B' }
                  : {};

                return (
                  <motion.div
                    key={node.id}
                    className="absolute flex flex-col items-center gap-1.5"
                    style={{ left: `${node.cx}%`, top: `${node.cy}%`, transform: 'translate(-50%, -50%)' }}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.08, type: 'spring', stiffness: 260, damping: 20 }}
                    role="img"
                    aria-label={`${isMatched ? 'Matched skill' : isGap ? 'Skill gap' : 'Domain'}: ${node.label}`}
                  >
                    <motion.div
                      className={`rounded-full flex items-center justify-center shadow-lg ring-4 ${!isGap ? bgColor : ''} ${ringColor} ring-opacity-30 cursor-default`}
                      style={{ width: node.radius * 2, height: node.radius * 2, ...borderStyle }}
                      whileHover={{ scale: 1.12, y: -4 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    >
                      {isMatched && (
                        <CheckCircle2
                          size={Math.max(12, node.radius * 0.55)}
                          className="text-white"
                          aria-hidden="true"
                        />
                      )}
                      {isGap && (
                        <span
                          className="text-amber-500 font-black leading-none"
                          style={{ fontSize: Math.max(10, node.radius * 0.6) }}
                          aria-hidden="true"
                        >
                          ?
                        </span>
                      )}
                      {node.type === 'domain' && (
                        <span
                          className="text-white font-black leading-none"
                          style={{ fontSize: Math.max(10, node.radius * 0.55) }}
                          aria-hidden="true"
                        >
                          D
                        </span>
                      )}
                    </motion.div>
                    <span className="text-[10px] font-bold text-slate-600 bg-white/90 px-1.5 py-0.5 rounded-md shadow-sm text-center max-w-[80px] leading-tight">
                      {node.label}
                    </span>
                  </motion.div>
                );
              })}
            </>
          )}

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
                  setGraphData(null);
                  const currentJobId = activeJobId ?? jobIdFromUrl;
                  if (currentJobId) startSession(currentJobId);
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
