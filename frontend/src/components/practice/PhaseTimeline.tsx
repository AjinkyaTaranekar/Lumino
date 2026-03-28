import { CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

const PHASES = [
  { id: 'intro', label: 'Introduction', persona: 'Hiring Manager' },
  { id: 'technical', label: 'Technical', persona: 'Tech Lead' },
  { id: 'behavioral', label: 'Behavioral', persona: 'Hiring Manager' },
  { id: 'culture', label: 'Culture Fit', persona: 'Culture Fit' },
  { id: 'closing', label: 'Closing', persona: 'Hiring Manager' },
];

interface PhaseTimelineProps {
  currentPhase: string;
  sessionComplete: boolean;
}

export default function PhaseTimeline({ currentPhase, sessionComplete }: PhaseTimelineProps) {
  const currentIdx = PHASES.findIndex((p) => p.id === currentPhase);

  return (
    <div
      className="w-52 rounded-2xl p-4"
      style={{ background: 'rgba(15, 23, 63, 0.92)', backdropFilter: 'blur(8px)' }}
      role="list"
      aria-label="Interview phase progress"
    >
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        Interview Phases
      </p>
      <div className="space-y-2">
        {PHASES.map((phase, idx) => {
          const isCompleted = idx < currentIdx || (sessionComplete && idx <= currentIdx);
          const isActive = phase.id === currentPhase && !sessionComplete;

          return (
            <div
              key={phase.id}
              className="flex items-center gap-2.5"
              role="listitem"
              aria-label={`${phase.label}: ${isCompleted ? 'completed' : isActive ? 'active' : 'upcoming'}`}
            >
              {/* Node */}
              <div className="relative flex-shrink-0">
                {isCompleted ? (
                  <CheckCircle2 size={16} className="text-blue-400" aria-hidden="true" />
                ) : isActive ? (
                  <motion.div
                    className="w-4 h-4 rounded-full bg-blue-500 ring-4 ring-blue-500/30"
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    aria-hidden="true"
                  />
                ) : (
                  <div
                    className="w-4 h-4 rounded-full border-2 border-slate-600"
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Label */}
              <div>
                <p
                  className={`text-xs font-semibold leading-none ${
                    isCompleted
                      ? 'text-blue-400'
                      : isActive
                      ? 'text-white'
                      : 'text-slate-500'
                  }`}
                >
                  {phase.label}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">{phase.persona}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
