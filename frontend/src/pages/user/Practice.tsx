import {
  ChevronRight,
  Clock,
  Code2,
  Cpu,
  Database,
  Globe,
  Maximize2,
  Send,
  Target,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillNode {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  cx: number;
  cy: number;
  radius: number;
  color: string;
  ring: string;
  connections: string[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const SKILL_NODES: SkillNode[] = [
  {
    id: 'react',
    label: 'React',
    icon: Code2,
    cx: 50,
    cy: 35,
    radius: 32,
    color: 'bg-blue-500',
    ring: 'ring-blue-300',
    connections: ['typescript', 'graphql'],
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    icon: Code2,
    cx: 25,
    cy: 62,
    radius: 26,
    color: 'bg-indigo-500',
    ring: 'ring-indigo-300',
    connections: ['react'],
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    icon: Database,
    cx: 73,
    cy: 60,
    radius: 24,
    color: 'bg-pink-500',
    ring: 'ring-pink-300',
    connections: ['react', 'nodejs'],
  },
  {
    id: 'nodejs',
    label: 'Node.js',
    icon: Cpu,
    cx: 50,
    cy: 80,
    radius: 22,
    color: 'bg-emerald-500',
    ring: 'ring-emerald-300',
    connections: ['graphql'],
  },
  {
    id: 'cloud',
    label: 'Cloud',
    icon: Globe,
    cx: 82,
    cy: 32,
    radius: 20,
    color: 'bg-sky-400',
    ring: 'ring-sky-300',
    connections: ['react'],
  },
];

const QUESTIONS = [
  {
    id: 'q1',
    text: 'Tell me about a time you had to refactor a large codebase. What was your approach and what trade-offs did you consider?',
    context: 'System design & engineering judgment',
  },
  {
    id: 'q2',
    text: "Describe how you'd design a real-time collaborative editing system like Google Docs at scale.",
    context: 'Distributed systems',
  },
];

const CURRENT_Q_IDX = 1;

// ─── Component ────────────────────────────────────────────────────────────────

export default function Practice() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const currentQuestion = QUESTIONS[CURRENT_Q_IDX];
  const prevQuestion = QUESTIONS[CURRENT_Q_IDX - 1];

  function handleSubmit() {
    if (!answer.trim()) return;
    setSubmitted(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  }

  return (
    <>
      <title>Practice Interview - Lumino</title>

      {/* Full-height: fills the space given by LuminoLayout (h-screen - pt-16) */}
      <div className="h-[calc(100vh-4rem)] overflow-hidden flex bg-slate-50">

        {/* ── Left Panel: Interview Interface ── */}
        <div
          className="w-full lg:w-[480px] xl:w-[540px] flex flex-col border-r border-slate-100 bg-white overflow-y-auto"
          role="main"
          aria-label="Practice interview interface"
        >

          {/* Progress bar */}
          <div
            className="h-1 bg-slate-100 flex-shrink-0"
            role="progressbar"
            aria-valuenow={CURRENT_Q_IDX + 1}
            aria-valuemin={1}
            aria-valuemax={QUESTIONS.length}
            aria-label={`Question ${CURRENT_Q_IDX + 1} of ${QUESTIONS.length}`}
          >
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${((CURRENT_Q_IDX + 1) / QUESTIONS.length) * 100}%` }}
            />
          </div>

          <div className="flex flex-col flex-1 px-6 py-6 gap-5">

            {/* Session meta */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
                  <Target size={13} className="text-white" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-bold text-indigo-950">Practice Session</p>
                  <p className="text-[10px] text-slate-400">Senior Full-Stack Engineer</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Clock size={12} aria-hidden="true" />
                <span aria-label="Question 2 of 2">Q {CURRENT_Q_IDX + 1}/{QUESTIONS.length}</span>
              </div>
            </div>

            {/* Previous Q (blurred context) */}
            {prevQuestion && (
              <div
                className="relative rounded-xl p-4 bg-slate-50 border border-slate-100 opacity-50"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background:
                      'linear-gradient(to bottom, transparent 0%, rgba(248,250,252,0.85) 100%)',
                  }}
                />
                <p className="text-xs font-semibold text-slate-400 mb-1">Previous</p>
                <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">
                  {prevQuestion.text}
                </p>
              </div>
            )}

            {/* Active question */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentQuestion.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="rounded-2xl p-5 bg-blue-50 border border-blue-200"
                role="region"
                aria-label="Current interview question"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 uppercase tracking-wider">
                    {currentQuestion.context}
                  </span>
                </div>
                <p className="text-sm font-semibold text-indigo-950 leading-relaxed">
                  {currentQuestion.text}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Answer textarea */}
            <div className="flex flex-col gap-2 flex-1">
              <label htmlFor="answer-input" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Your Answer
              </label>
              <textarea
                id="answer-input"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Start typing your answer… (⌘ + Enter to submit)"
                rows={7}
                aria-describedby="answer-hint"
                disabled={submitted}
                className="input resize-none leading-relaxed flex-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p id="answer-hint" className="sr-only">
                Press Command or Control plus Enter to submit your answer.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-secondary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                aria-label="End practice session and return to dashboard"
              >
                End Session
              </button>
              <button
                onClick={handleSubmit}
                disabled={!answer.trim() || submitted}
                className="btn-primary flex-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                aria-label="Submit your answer and proceed to next question"
              >
                {submitted ? (
                  <>
                    <ChevronRight size={15} aria-hidden="true" />
                    Next Question
                  </>
                ) : (
                  <>
                    <Send size={14} aria-hidden="true" />
                    Submit Answer
                  </>
                )}
              </button>
            </div>

          </div>
        </div>

        {/* ── Right Panel: Knowledge Graph Visualization ── */}
        <div
          className="hidden lg:flex flex-1 relative overflow-hidden bg-white"
          role="complementary"
          aria-label="Knowledge graph visualization"
        >
          {/* Dot grid */}
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
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          >
            {SKILL_NODES.flatMap((node) =>
              node.connections.map((targetId) => {
                const target = SKILL_NODES.find((n) => n.id === targetId);
                if (!target) return null;
                return (
                  <line
                    key={`${node.id}-${targetId}`}
                    x1={`${node.cx}%`}
                    y1={`${node.cy}%`}
                    x2={`${target.cx}%`}
                    y2={`${target.cy}%`}
                    stroke="#3B82F6"
                    strokeWidth="1.5"
                    strokeOpacity="0.2"
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
              style={{
                left: `${node.cx}%`,
                top: `${node.cy}%`,
                transform: 'translate(-50%, -50%)',
              }}
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
                <node.icon
                  size={Math.max(14, node.radius * 0.55)}
                  className="text-white"
                  aria-hidden="true"
                />
              </motion.div>
              <span className="text-[11px] font-bold text-slate-600 bg-white/80 px-1.5 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                {node.label}
              </span>
            </motion.div>
          ))}

          {/* ── HUD: Curator Insight card (bottom-right) ── */}
          <div className="absolute bottom-6 right-6 z-10 space-y-3">

            {/* Curator Insight */}
            <div
              className="w-64 rounded-2xl p-4"
              style={{
                background: 'rgba(15, 23, 63, 0.92)',
                backdropFilter: 'blur(8px)',
              }}
              role="complementary"
              aria-label="Curator insight"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center">
                  <Zap size={12} className="text-white" aria-hidden="true" />
                </div>
                <p className="text-xs font-bold text-white">Curator Insight</p>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Your answer would benefit from a concrete example involving{' '}
                <span className="text-blue-400 font-semibold">GraphQL schema stitching</span>.
                Mentioning specific metrics strengthens credibility.
              </p>
            </div>

            {/* Zoom controls */}
            <div
              className="flex gap-2 justify-end"
              role="group"
              aria-label="Graph zoom controls"
            >
              {[
                { icon: ZoomIn, label: 'Zoom in graph' },
                { icon: ZoomOut, label: 'Zoom out graph' },
                { icon: Maximize2, label: 'Fit graph to screen' },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  aria-label={label}
                  className="w-9 h-9 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-indigo-950 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                >
                  <Icon size={14} aria-hidden="true" />
                </button>
              ))}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
