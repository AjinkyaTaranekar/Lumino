import { AlertTriangle, Award, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { PracticeScorecard } from '../../lib/types';

const SCORE_DIMS = [
  { key: 'overall', label: 'Overall', color: '#3B82F6', ring: '#BFDBFE' },
  { key: 'technical', label: 'Technical', color: '#8B5CF6', ring: '#DDD6FE' },
  { key: 'behavioral', label: 'Behavioral', color: '#10B981', ring: '#A7F3D0' },
  { key: 'communication', label: 'Communication', color: '#F59E0B', ring: '#FDE68A' },
  { key: 'culture', label: 'Culture Fit', color: '#EC4899', ring: '#FBCFE8' },
] as const;

const RECOMMENDATION_CONFIG = {
  strong_yes: { label: 'Strong Yes', bg: 'bg-emerald-500', text: 'text-white' },
  yes: { label: 'Yes', bg: 'bg-blue-500', text: 'text-white' },
  maybe: { label: 'Maybe', bg: 'bg-amber-400', text: 'text-white' },
  no: { label: 'Not Yet', bg: 'bg-red-400', text: 'text-white' },
};

interface ScoreRingProps {
  score: number;
  label: string;
  color: string;
  ring: string;
  delay: number;
}

function ScoreRing({ score, label, color, ring, delay }: ScoreRingProps) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progress = score / 10;

  return (
    <motion.div
      className="flex flex-col items-center gap-1"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
    >
      <div className="relative w-14 h-14">
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          {/* Background ring */}
          <circle cx="28" cy="28" r={radius} fill="none" stroke={ring} strokeWidth="5" />
          {/* Progress ring */}
          <motion.circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{ delay: delay + 0.2, duration: 0.8, ease: 'easeOut' }}
            transform="rotate(-90 28 28)"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-extrabold text-indigo-950">{score.toFixed(1)}</span>
        </div>
      </div>
      <span className="text-[10px] font-semibold text-slate-500 text-center leading-tight">
        {label}
      </span>
    </motion.div>
  );
}

interface PracticeScorecardProps {
  scorecard: PracticeScorecard;
  onPracticeAgain: () => void;
  onBackToApplications: () => void;
}

export default function PracticeScorecardOverlay({
  scorecard,
  onPracticeAgain,
  onBackToApplications,
}: PracticeScorecardProps) {
  const recConfig = RECOMMENDATION_CONFIG[scorecard.recommendation];

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col rounded-none overflow-y-auto"
      style={{ background: 'rgba(248, 250, 252, 0.97)', backdropFilter: 'blur(12px)' }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      role="region"
      aria-label="Interview scorecard"
    >
      <div className="flex flex-col items-center px-8 py-8 gap-6 flex-1">

        {/* Recommendation banner */}
        <motion.div
          className={`px-5 py-2 rounded-full font-bold text-sm ${recConfig.bg} ${recConfig.text} shadow-lg`}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 280, damping: 20 }}
          role="status"
          aria-label={`Hiring recommendation: ${recConfig.label}`}
        >
          <Award size={14} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
          {recConfig.label}
        </motion.div>

        {/* Header */}
        <div className="text-center">
          <h2 className="text-xl font-extrabold text-indigo-950 tracking-tight">
            Interview Complete
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Your performance breakdown</p>
        </div>

        {/* Score rings */}
        <div className="flex flex-wrap justify-center gap-4">
          {SCORE_DIMS.map((dim, i) => (
            <ScoreRing
              key={dim.key}
              score={scorecard.scores[dim.key]}
              label={dim.label}
              color={dim.color}
              ring={dim.ring}
              delay={i * 0.08}
            />
          ))}
        </div>

        {/* Strengths */}
        <div className="w-full">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Strengths
          </p>
          <div className="space-y-1.5">
            {scorecard.strengths.map((s, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-2 text-sm text-slate-700"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.07 }}
              >
                <CheckCircle2
                  size={15}
                  className="text-emerald-500 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                {s}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Gaps */}
        <div className="w-full">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Areas to Improve
          </p>
          <div className="space-y-1.5">
            {scorecard.gaps.map((g, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-2 text-sm text-slate-700"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.07 }}
              >
                <AlertTriangle
                  size={15}
                  className="text-amber-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                {g}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 w-full pt-2">
          <button
            onClick={onBackToApplications}
            className="btn-secondary flex-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            Back to Applications
          </button>
          <button
            onClick={onPracticeAgain}
            className="btn-primary flex-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            Practice Again
          </button>
        </div>

      </div>
    </motion.div>
  );
}
