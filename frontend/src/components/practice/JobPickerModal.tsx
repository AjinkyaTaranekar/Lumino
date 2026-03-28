import { Briefcase, Building2, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { UserApplication } from '../../lib/types';

function scoreColor(score: number) {
  if (score >= 0.7) return 'text-emerald-600';
  if (score >= 0.4) return 'text-amber-500';
  return 'text-red-400';
}

interface JobPickerModalProps {
  onSelect: (jobId: string) => void;
}

export default function JobPickerModal({ onSelect }: JobPickerModalProps) {
  const { session } = useAuth();
  const [applications, setApplications] = useState<UserApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api
      .getApplications(session.userId)
      .then((res) => {
        const sorted = [...res.applications].sort(
          (a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)
        );
        setApplications(sorted);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load applications'))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Select a job to practice for"
      >
        <motion.div
          className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
          initial={{ scale: 0.93, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.93, opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-lg font-extrabold text-indigo-950 tracking-tight">
              Select a Job to Practice For
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Choose one of your applications to start a mock interview
            </p>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {loading && (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            )}

            {error && (
              <div className="p-6 text-sm text-red-500" role="alert">
                {error}
              </div>
            )}

            {!loading && !error && applications.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-400">
                No applications yet. Apply to some jobs first.
              </div>
            )}

            {applications.map((app) => {
              const scorePct = app.match_score != null ? Math.round(app.match_score * 100) : null;
              return (
                <button
                  key={app.job_id}
                  onClick={() => onSelect(app.job_id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left group focus-visible:outline-none focus-visible:bg-blue-50"
                  aria-label={`Practice interview for ${app.job_title}${app.company ? ` at ${app.company}` : ''}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                    <Briefcase size={15} className="text-blue-500" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-indigo-950 truncate">{app.job_title}</p>
                    {app.company && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building2 size={10} aria-hidden="true" />
                        {app.company}
                      </p>
                    )}
                  </div>
                  {scorePct != null && (
                    <span className={`text-sm font-bold ${scoreColor(app.match_score!)}`}>
                      {scorePct}%
                    </span>
                  )}
                  <ChevronRight
                    size={15}
                    className="text-slate-300 group-hover:text-slate-500 transition-colors"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
