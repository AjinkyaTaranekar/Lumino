import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { TrendingUp, Sparkles, Briefcase, AlertCircle, Users, Plus, Network } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { MatchResult, Job } from '../lib/types';
import JobCard from '../components/JobCard';
import LoadingOverlay from '../components/LoadingOverlay';

// ─── User Dashboard ───────────────────────────────────────────────────────────
function UserDashboard() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [matches,    setMatches]    = useState<MatchResult[] | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    api.listJobs().then(setJobs).catch(() => {});
  }, []);

  async function handleRecommend() {
    if (!session?.userId) return;
    setError(null);
    setLoading(true);
    setLoadingMsg('Computing your personalised matches…');
    try {
      const data = await api.getMatches(session.userId);
      setMatches(data.results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {loading && <LoadingOverlay message={loadingMsg} />}
      <div className="p-6 sm:p-8 max-w-6xl">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-4xl font-extrabold text-indigo-950 tracking-tight">
            Welcome back, {user?.name} 👋
          </h1>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl leading-relaxed">
            {matches
              ? `${matches.length} job${matches.length !== 1 ? 's' : ''} ranked for you`
              : `${jobs.length} available position${jobs.length !== 1 ? 's' : ''} in the database`}
          </p>
        </header>

        {/* Quick stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {[
            { label: 'Profile Match',        value: '85%',  sub: '+5% this week',    subColor: 'text-emerald-500' },
            { label: 'Active Applications',  value: matches ? String(matches.length) : String(jobs.length), sub: 'positions available', subColor: 'text-slate-400' },
            { label: 'Skill Growth',         value: '14',   sub: 'New traits mapped', subColor: 'text-blue-500' },
          ].map(stat => (
            <motion.div
              key={stat.label}
              whileHover={{ y: -2 }}
              className="stat-card"
            >
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{stat.label}</h3>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-indigo-950">{stat.value}</span>
                <span className={`${stat.subColor} font-bold text-sm mb-1`}>{stat.sub}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="alert-error mb-6" role="alert">
            <AlertCircle size={15} className="flex-shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Ranked matches */}
        {matches && (
          <section aria-label="Ranked job recommendations">
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-xl font-bold text-indigo-950">Ranked Recommendations</h2>
              <span className="badge badge-blue">{matches.length}</span>
            </div>
            {matches.length === 0 ? (
              <div className="card-lumino p-16 text-center">
                <Briefcase size={44} className="mx-auto mb-3 text-slate-300" aria-hidden="true" />
                <p className="text-sm text-slate-500">No matches found yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {matches.map((r, i) => (
                  <JobCard key={r.job_id} result={r} rank={i + 1} userIdOrJobId={session?.userId ?? ''} mode="seeker" />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Available positions listing */}
        {!matches && (
          <section aria-label="Available positions">
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-xl font-bold text-indigo-950">Available Positions</h2>
              <span className="badge badge-gray">{jobs.length}</span>
            </div>

            {jobs.length === 0 ? (
              <div className="card-lumino p-20 text-center">
                <Briefcase size={44} className="mx-auto mb-3 text-slate-300" aria-hidden="true" />
                <p className="text-sm text-slate-500">No jobs posted yet.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {jobs.slice(0, 6).map(j => (
                    <div key={j.id} className="card-lumino p-4 hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                            <Briefcase size={15} className="text-blue-500" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-indigo-950 truncate">{j.title ?? j.id}</h3>
                            {j.company && <p className="text-xs text-slate-500 mt-0.5">{j.company}</p>}
                          </div>
                        </div>
                        {j.remote_policy && (
                          <span className={`badge flex-shrink-0 ${
                            j.remote_policy === 'remote' ? 'badge-green'
                            : j.remote_policy === 'hybrid' ? 'badge-orange'
                            : 'badge-blue'
                          }`}>
                            {j.remote_policy}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-center">
                  <p className="text-sm text-slate-500 mb-4">
                    Click below to see jobs ranked by your skills and domain profile.
                  </p>
                  <button onClick={handleRecommend} className="btn-primary btn-lg">
                    <Sparkles size={16} aria-hidden="true" /> Get Personalised Recommendations
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* Digital Twin */}
        <section aria-label="Digital Twin" className="mt-10">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-xl font-bold text-indigo-950">Your Digital Twin</h2>
          </div>
          <div className="card-lumino p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <Network size={28} className="text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-indigo-950 mb-1">Knowledge Graph Profile</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Your skills, experience and goals are modelled as a semantic graph. Explore and refine your digital twin to improve match accuracy.
              </p>
            </div>
            <Link
              to="/user/model"
              className="btn-primary flex-shrink-0"
            >
              View Digital Twin →
            </Link>
          </div>
        </section>

        {/* Practice CTA */}
        <div className="mt-12 bg-indigo-950 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-4">Ready for your next interview?</h2>
            <p className="text-indigo-200 mb-8 max-w-xs">
              The Digital Curator is ready to analyze your behavioral logic and technical depth.
            </p>
            <Link
              to="/practice"
              className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-300"
            >
              Start Practice Session
            </Link>
          </div>
          <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none" aria-hidden="true">
            <TrendingUp size={240} />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Recruiter Dashboard ──────────────────────────────────────────────────────
function RecruiterDashboard() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listJobs(session?.userId).then(data => { setJobs(data); setLoading(false); }).catch(() => setLoading(false));
  }, [session?.userId]);

  const stats = [
    { label: 'Total Jobs',       value: loading ? '…' : String(jobs.length), color: 'text-indigo-950' },
    { label: 'Interviews Today', value: '8',                                  color: 'text-indigo-950' },
    { label: 'High Match',       value: '42',                                 color: 'text-blue-500'   },
    { label: 'Time to Hire',     value: '14d',                                color: 'text-indigo-950' },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-6xl">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-indigo-950 tracking-tight">Recruiter Portal</h1>
        <p className="mt-3 text-lg text-slate-500">
          Welcome back, {user?.name}. Managing {jobs.length} active job{jobs.length !== 1 ? 's' : ''}.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {stats.map(s => (
          <motion.div key={s.label} whileHover={{ y: -2 }} className="stat-card">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{s.label}</h3>
            <span className={`text-4xl font-black ${s.color}`}>{s.value}</span>
          </motion.div>
        ))}
      </div>

      {/* Active jobs */}
      <div className="card-lumino overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-xl font-bold text-indigo-950">Active Openings</h2>
          <Link to="/jobs/create" className="text-sm font-bold text-blue-500 hover:underline flex items-center gap-1">
            <Plus size={14} aria-hidden="true" /> Create New
          </Link>
        </div>
        {jobs.length === 0 && !loading ? (
          <div className="p-16 text-center">
            <Briefcase size={40} className="mx-auto mb-3 text-slate-300" aria-hidden="true" />
            <p className="text-slate-500 text-sm mb-4">No jobs posted yet.</p>
            <button onClick={() => navigate('/jobs/create')} className="btn-primary">
              Post a Job →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {jobs.map(job => (
              <button
                key={job.id}
                onClick={() => navigate(`/talent-pool/${job.id}`)}
                className="w-full p-6 hover:bg-slate-50 transition-colors cursor-pointer flex justify-between items-center text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
              >
                <div>
                  <h3 className="font-bold text-indigo-950">{job.title ?? job.id}</h3>
                  {job.company && <p className="text-sm text-slate-500">{job.company}</p>}
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  {job.remote_policy && (
                    <span className={`badge ${
                      job.remote_policy === 'remote' ? 'badge-green'
                      : job.remote_policy === 'hybrid' ? 'badge-orange'
                      : 'badge-blue'
                    }`}>
                      {job.remote_policy}
                    </span>
                  )}
                  <p className="text-xs text-slate-400 uppercase font-bold mt-1">Find candidates</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboardWidget() {
  return (
    <div className="p-6 sm:p-8 max-w-6xl">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-indigo-950 tracking-tight">System Administration</h1>
        <p className="mt-3 text-lg text-slate-500">Global system health and user management.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Graph Nodes',     value: '45,201', color: 'text-indigo-950'  },
          { label: 'API Latency',     value: '124ms',  color: 'text-emerald-500' },
          { label: 'Active Sessions', value: '892',    color: 'text-indigo-950'  },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{s.label}</h3>
            <span className={`text-4xl font-black ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <Link to="/admin" className="btn-primary btn-lg">
          Go to Admin Console →
        </Link>
      </div>
    </div>
  );
}

// ─── Role-aware entry point ───────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();

  if (user?.role === 'RECRUITER') return <RecruiterDashboard />;
  if (user?.role === 'ADMIN')     return <AdminDashboardWidget />;
  return <UserDashboard />;
}
