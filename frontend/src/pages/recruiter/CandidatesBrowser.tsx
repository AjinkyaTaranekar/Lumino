import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { Job } from '../../lib/types';
import {
  Briefcase,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Zap,
  ArrowRight,
  Plus,
} from 'lucide-react';

function remoteBadgeClass(policy: Job['remote_policy']): string {
  switch (policy) {
    case 'remote':  return 'badge badge-green';
    case 'hybrid':  return 'badge badge-orange';
    case 'onsite':  return 'badge badge-blue';
    default:        return 'badge badge-gray';
  }
}

export default function CandidatesBrowser() {
  const { session } = useAuth();
  const navigate    = useNavigate();

  const [jobs, setJobs]       = useState<Job[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [query, setQuery]     = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listJobs(session?.userId);
      setJobs(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = jobs
    ? jobs.filter(j => {
        const q = query.toLowerCase();
        return (
          !q ||
          (j.title ?? '').toLowerCase().includes(q) ||
          j.id.toLowerCase().includes(q) ||
          (j.company ?? '').toLowerCase().includes(q)
        );
      })
    : null;

  return (
    <>
      <title>Talent Pool — Lumino</title>

      <div className="px-6 py-8 max-w-7xl mx-auto">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-indigo-950">Talent Pool</h1>
            <p className="text-sm text-slate-500 mt-1">
              Select a job to rank matching candidate profiles
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={load}
              disabled={loading}
              aria-label="Refresh job list"
              className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              aria-label="Filter jobs"
              className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filter
            </button>

            <button
              onClick={() => navigate('/recruiter/post')}
              aria-label="Post a new job"
              className="btn-primary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <Plus className="w-3.5 h-3.5" />
              Post a Job
            </button>
          </div>
        </div>

        {/* ── Search bar ───────────────────────────────────────────────── */}
        <div className="relative mb-6">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            role="searchbox"
            aria-label="Search jobs by title or ID"
            placeholder="Search by job title or ID…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input pl-10 focus-visible:ring-2 focus-visible:ring-primary-300"
          />
        </div>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && (
          <div role="alert" className="alert-error mb-6">
            {error}
          </div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────────── */}
        {loading && !jobs && (
          <div
            role="status"
            aria-label="Loading jobs"
            className="flex items-center justify-center py-20 gap-3 text-slate-400"
          >
            <span className="spinner-sm" aria-hidden="true" />
            <span className="text-sm">Loading jobs…</span>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {jobs !== null && jobs.length === 0 && (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-slate-300" aria-hidden="true" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">No jobs posted yet</p>
            <p className="text-sm text-slate-400 mb-6">
              Post a job first, then come back here to find matching candidates.
            </p>
            <button
              onClick={() => navigate('/recruiter/post')}
              className="btn-primary focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              Post a Job
            </button>
          </div>
        )}

        {/* ── No search results ────────────────────────────────────────── */}
        {filtered !== null && jobs !== null && jobs.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 font-medium">No jobs match your search.</p>
            <button
              onClick={() => setQuery('')}
              className="text-sm text-primary-500 mt-2 hover:underline focus-visible:ring-2 focus-visible:ring-primary-300 rounded"
            >
              Clear search
            </button>
          </div>
        )}

        {/* ── Job grid ─────────────────────────────────────────────────── */}
        {filtered !== null && filtered.length > 0 && (
          <>
            <p className="text-xs text-slate-400 mb-4">
              {filtered.length} job{filtered.length !== 1 ? 's' : ''} — click one to rank candidates
            </p>

            <div
              role="list"
              aria-label="Job openings"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filtered.map(job => (
                <motion.button
                  key={job.id}
                  role="listitem"
                  whileHover={{ y: -4 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  onClick={() => navigate(`/recruiter/candidates/${job.id}`)}
                  aria-label={`View candidates for ${job.title ?? job.id}`}
                  className="card-lumino p-5 text-left group focus-visible:ring-2 focus-visible:ring-primary-300 focus:outline-none w-full"
                >
                  {/* Card top row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-5 h-5 text-primary-500" aria-hidden="true" />
                    </div>
                    {job.remote_policy && (
                      <span className={remoteBadgeClass(job.remote_policy)}>
                        {job.remote_policy}
                      </span>
                    )}
                  </div>

                  {/* Title + company */}
                  <p className="text-sm font-semibold text-indigo-950 mb-0.5 truncate">
                    {job.title ?? job.id}
                  </p>
                  {job.company && (
                    <p className="text-xs text-slate-400 truncate mb-3">{job.company}</p>
                  )}
                  {!job.company && (
                    <p className="text-xs text-slate-300 font-mono truncate mb-3">{job.id}</p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>Find candidates</span>
                    <ArrowRight
                      className="w-3 h-3 ml-auto text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-hidden="true"
                    />
                  </div>
                </motion.button>
              ))}
            </div>
          </>
        )}

        {/* ── AI Insight Banner ────────────────────────────────────────── */}
        {jobs !== null && jobs.length > 0 && (
          <div
            role="complementary"
            aria-label="AI trajectory insight"
            className="mt-10 rounded-2xl bg-indigo-950 p-5 flex items-start gap-4"
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-yellow-300" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-0.5">Trajectory Insight</p>
              <p className="text-xs text-indigo-200 leading-relaxed">
                Lumino uses graph-to-graph matching to rank candidates — analysing skills,
                domain knowledge, and cultural trajectory rather than keyword overlap.
                Click any job to see ranked matches.
              </p>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
