import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ExternalLink,
  GraduationCap,
  TrendingUp,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { UserApplication } from '../../lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.7) return 'text-emerald-600';
  if (score >= 0.4) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 0.7) return 'bg-emerald-50 border-emerald-100';
  if (score >= 0.4) return 'bg-amber-50 border-amber-100';
  return 'bg-red-50 border-red-100';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── ApplicationCard ──────────────────────────────────────────────────────────

function ApplicationCard({ app }: { app: UserApplication }) {
  const scorePct = app.match_score != null ? Math.round(app.match_score * 100) : null;

  return (
    <motion.div
      className="card-lumino p-5"
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      role="article"
      aria-label={`Application for ${app.job_title}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
            <Briefcase size={18} className="text-primary-500" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-indigo-950 tracking-tight truncate">
              {app.job_title}
            </h3>
            {app.company && (
              <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                <Building2 size={11} aria-hidden="true" />
                {app.company}
              </p>
            )}
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
              <CalendarDays size={11} aria-hidden="true" />
              Applied {formatDate(app.applied_at)}
            </p>
          </div>
        </div>

        {/* Score badge */}
        {scorePct != null && (
          <div
            className={`flex-shrink-0 w-14 h-14 rounded-2xl border flex flex-col items-center justify-center ${scoreBg(app.match_score!)}`}
            aria-label={`Match score: ${scorePct}%`}
          >
            <span className={`text-lg font-bold leading-none ${scoreColor(app.match_score!)}`}>
              {scorePct}
            </span>
            <span className="text-[9px] text-slate-400 mt-0.5">match</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2 justify-end">
        <Link
          to={`/practice?jobId=${app.job_id}`}
          className="btn-secondary btn-sm inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          aria-label={`Practice interview for ${app.job_title}`}
        >
          <GraduationCap size={11} aria-hidden="true" />
          Practice Interview
        </Link>
        <Link
          to={`/user/match/${app.job_id}`}
          className="btn-secondary btn-sm inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          aria-label={`View match details for ${app.job_title}`}
        >
          View Match Details
          <ExternalLink size={11} aria-hidden="true" />
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Next Steps (static guidance) ─────────────────────────────────────────────

const NEXT_STEPS = [
  {
    id: 'n1',
    title: 'System Design Deep Dive',
    description: 'A curated course covering distributed systems, CAP theorem, and real-world architecture patterns.',
    cta: 'Start Learning',
    href: '#',
    icon: BookOpen,
    color: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  {
    id: 'n2',
    title: 'Mock Interview Practice',
    description: 'Book a live mock session with an ex-FAANG engineer to sharpen your interview delivery.',
    cta: 'Book Session',
    href: '/practice',
    icon: Users,
    color: 'bg-purple-50 border-purple-200 text-purple-700',
  },
  {
    id: 'n3',
    title: 'Update Your Knowledge Graph',
    description: 'Re-upload your resume or add new skills to improve your match scores for future applications.',
    cta: 'Update Profile',
    href: '/resume',
    icon: TrendingUp,
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Applications() {
  const { session } = useAuth();
  const [applications, setApplications] = useState<UserApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    api.getApplications(session.userId)
      .then(res => setApplications(res.applications))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load applications.'))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <>
      <title>My Applications - Lumino</title>

      <div className="px-6 py-8 max-w-4xl mx-auto space-y-8">

        {/* ── Page Header ── */}
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-950 tracking-tight">
            My Applications
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm">
            Jobs you have applied to, with your match scores and application history.
          </p>
        </div>

        {/* ── Error ── */}
        {error && (
          <div role="alert" className="alert-error">
            {error}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card-lumino p-5 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-100 rounded w-1/2" />
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Applications list ── */}
        {!loading && !error && (
          <>
            {applications.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-8 h-8 text-slate-300" aria-hidden="true" />
                </div>
                <p className="text-slate-600 font-medium mb-1">No applications yet</p>
                <p className="text-sm text-slate-400 mb-4">
                  Browse your job matches and click "Apply Now" on any job to get started.
                </p>
                <Link to="/dashboard" className="btn-primary btn-sm inline-flex">
                  Browse Matches
                </Link>
              </div>
            ) : (
              <div
                role="list"
                aria-label={`${applications.length} application${applications.length !== 1 ? 's' : ''}`}
                className="space-y-4"
              >
                <p className="text-sm text-slate-500 font-medium">
                  {applications.length} application{applications.length !== 1 ? 's' : ''}
                </p>
                {applications.map(app => (
                  <ApplicationCard key={app.job_id} app={app} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Actionable Next Steps (static guidance) ── */}
        <section aria-labelledby="next-steps-heading">
          <h2
            id="next-steps-heading"
            className="text-lg font-extrabold text-indigo-950 tracking-tight mb-4"
          >
            Actionable Next Steps
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {NEXT_STEPS.map((step) => (
              <motion.div
                key={step.id}
                className={`rounded-2xl p-5 border ${step.color} flex flex-col gap-3`}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              >
                <step.icon size={20} aria-hidden="true" />
                <div>
                  <h3 className="font-bold text-sm text-indigo-950">{step.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{step.description}</p>
                </div>
                <Link
                  to={step.href}
                  className="inline-flex items-center gap-1.5 text-xs font-bold mt-auto focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 rounded"
                  aria-label={`${step.cta} - ${step.title}`}
                >
                  {step.cta}
                  <ExternalLink size={11} aria-hidden="true" />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Footer Links ── */}
        <footer className="flex flex-wrap items-center justify-center gap-6 py-4 text-xs text-slate-400" role="contentinfo">
          {[
            { label: 'Privacy Policy', to: '#' },
            { label: 'Terms of Service', to: '#' },
            { label: 'Help Centre', to: '#' },
            { label: 'Contact Support', to: '#' },
          ].map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className="hover:text-indigo-950 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 rounded"
            >
              {link.label}
            </Link>
          ))}
          <span>© {new Date().getFullYear()} Lumino. All rights reserved.</span>
        </footer>

      </div>
    </>
  );
}
