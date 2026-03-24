import {
  Briefcase,
  Building2,
  Edit3,
  Network,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { Job } from '../../lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────

function remoteBadgeClass(policy: Job['remote_policy']): string {
  switch (policy) {
    case 'remote': return 'badge badge-green';
    case 'hybrid': return 'badge badge-orange';
    case 'onsite': return 'badge badge-blue';
    default: return 'badge badge-gray';
  }
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function JobsList() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  async function handleDelete(jobId: string) {
    if (!window.confirm(`Delete job "${jobId}"? This cannot be undone.`)) return;
    setDeleting(jobId);
    try {
      await api.deleteJob(jobId);
      setJobs(prev => prev ? prev.filter(j => j.id !== jobId) : prev);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete job.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <title>My Jobs - Lumino</title>

      <div className="px-6 py-8 max-w-5xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-indigo-950">My Job Openings</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your posted roles and find matching candidates
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              aria-label="Refresh jobs list"
              className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
            <button
              onClick={() => navigate('/recruiter/post')}
              aria-label="Post a new job"
              className="btn-primary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Post New Job
            </button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div role="alert" className="alert-error mb-6">
            {error}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && !jobs && (
          <div
            role="status"
            aria-label="Loading jobs"
            className="flex items-center justify-center py-20 gap-3 text-slate-400"
          >
            <span className="spinner-sm" aria-hidden="true" />
            <span className="text-sm">Loading your jobs…</span>
          </div>
        )}

        {/* ── Empty state ── */}
        {jobs !== null && jobs.length === 0 && (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-slate-300" aria-hidden="true" />
            </div>
            <p className="text-indigo-950 font-semibold mb-1">No jobs posted yet</p>
            <p className="text-sm text-slate-400 mb-6 max-w-xs mx-auto">
              Create your first job posting and Lumino will build a knowledge graph to
              match the best candidates.
            </p>
            <button
              onClick={() => navigate('/recruiter/post')}
              className="btn-primary focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Post Your First Job
            </button>
          </div>
        )}

        {/* ── Jobs list ── */}
        {jobs !== null && jobs.length > 0 && (
          <>
            <p className="text-xs text-slate-400 mb-4">
              {jobs.length} active job{jobs.length !== 1 ? 's' : ''}
            </p>

            <div
              role="list"
              aria-label="My job openings"
              className="space-y-3"
            >
              {jobs.map(job => (
                <motion.div
                  key={job.id}
                  role="listitem"
                  whileHover={{ y: -2 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="card-lumino p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">

                    {/* ── Job identity ── */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-5 h-5 text-primary-500" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-sm font-semibold text-indigo-950 truncate">
                            {job.title ?? job.id}
                          </h2>
                          {job.remote_policy && (
                            <span className={remoteBadgeClass(job.remote_policy)}>
                              {job.remote_policy}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {job.company && (
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <Building2 className="w-3 h-3" aria-hidden="true" />
                              <span>{job.company}</span>
                            </div>
                          )}
                          <code className="text-[10px] font-mono text-slate-300 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                            {job.id}
                          </code>
                        </div>
                      </div>
                    </div>

                    {/* ── Action buttons ── */}
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      <button
                        onClick={() => navigate(`/recruiter/candidates/${job.id}`)}
                        aria-label={`View candidates for ${job.title ?? job.id}`}
                        className="btn-primary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
                      >
                        <Users className="w-3.5 h-3.5" aria-hidden="true" />
                        Candidates
                      </button>

                      <button
                        onClick={() => navigate(`/recruiter/model/${job.id}`)}
                        aria-label={`View knowledge graph for ${job.title ?? job.id}`}
                        className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
                      >
                        <Network className="w-3.5 h-3.5" aria-hidden="true" />
                        Model
                      </button>

                      <button
                        onClick={() => navigate(`/recruiter/edit-job/${job.id}`)}
                        aria-label={`Edit knowledge graph for ${job.title ?? job.id}`}
                        className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        Edit Graph
                      </button>

                      <button
                        onClick={() => handleDelete(job.id)}
                        disabled={deleting === job.id}
                        aria-label={`Delete job ${job.title ?? job.id}`}
                        aria-busy={deleting === job.id}
                        className="btn-ghost btn-sm flex items-center gap-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-300"
                      >
                        {deleting === job.id ? (
                          <span className="spinner-sm" aria-hidden="true" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}

      </div>
    </>
  );
}
