import {
  AlertTriangle,
  Briefcase,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Job, UserListItem } from '../../lib/types';

// ─── DeleteButton ──────────────────────────────────────────────────────────────

interface DeleteButtonProps {
  onConfirm: () => void;
  disabled: boolean;
}

function DeleteButton({ onConfirm, disabled }: DeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={() => { setConfirming(false); onConfirm(); }}
          disabled={disabled}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          aria-label="Confirm delete"
        >
          Confirm
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          aria-label="Cancel delete"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
      aria-label="Delete"
    >
      <Trash2 size={13} />
      Delete
    </button>
  );
}

// ─── UserRow ───────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: UserListItem;
  onDeleted: (id: string) => void;
}

function UserRow({ user, onDeleted }: UserRowProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteUser(user.id);
      onDeleted(user.id);
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 flex-shrink-0">
          {user.id[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-indigo-950 truncate">{user.id}</p>
          <p className="text-xs text-slate-400">User account</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {error && (
          <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-lg">{error}</span>
        )}
        <DeleteButton onConfirm={handleDelete} disabled={deleting} />
      </div>
    </div>
  );
}

// ─── JobRow ────────────────────────────────────────────────────────────────────

interface JobRowProps {
  job: Job;
  onDeleted: (id: string) => void;
}

function JobRow({ job, onDeleted }: JobRowProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remotePolicyBadge: Record<string, string> = {
    remote: 'badge-green',
    hybrid: 'badge-orange',
    onsite: 'badge-blue',
  };

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteJob(job.id);
      onDeleted(job.id);
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
          <Briefcase size={15} className="text-slate-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-indigo-950 truncate">{job.title || job.id}</p>
          {job.company && (
            <p className="text-xs text-slate-400 truncate">{job.company}</p>
          )}
        </div>
        {job.remote_policy && (
          <span className={`badge ${remotePolicyBadge[job.remote_policy] ?? 'badge-gray'} flex-shrink-0 ml-1`}>
            {job.remote_policy}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        {error && (
          <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-lg">{error}</span>
        )}
        <DeleteButton onConfirm={handleDelete} disabled={deleting} />
      </div>
    </div>
  );
}

// ─── AdminDashboard ────────────────────────────────────────────────────────────

type Tab = 'users' | 'jobs';

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserListItem[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listUsers();
      setUsers(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listJobs();
      setJobs(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'users' && users === null) loadUsers();
    if (tab === 'jobs' && jobs === null) loadJobs();
  }, [tab, users, jobs, loadUsers, loadJobs]);

  function handleUserDeleted(id: string) {
    setUsers(prev => prev?.filter(u => u.id !== id) ?? null);
  }

  function handleJobDeleted(id: string) {
    setJobs(prev => prev?.filter(j => j.id !== id) ?? null);
  }

  const filteredUsers = users?.filter(u =>
    u.id.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const filteredJobs = jobs?.filter(j =>
    (j.title ?? j.id).toLowerCase().includes(search.toLowerCase()) ||
    (j.company ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <>
      <title>Admin Console - Lumino</title>

      <div className="px-6 py-8 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-indigo-950">Platform Control Center</h1>
            <p className="text-sm text-slate-500 mt-1">Govern user and role data with audit-safe operational controls</p>
          </div>
          <button
            onClick={() => tab === 'users' ? loadUsers() : loadJobs()}
            disabled={loading}
            className="btn-secondary btn-sm flex items-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
            aria-label="Refresh list"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="stat-card flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Users size={22} className="text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-950">
                {users !== null ? users.length : '-'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Total Users</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <Briefcase size={22} className="text-indigo-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-950">
                {jobs !== null ? jobs.length : '-'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Total Jobs</p>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-2xl bg-slate-50 border border-slate-100 inline-flex mb-6">
          {(['users', 'jobs'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(''); }}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${tab === t
                ? 'bg-white shadow-sm text-indigo-950'
                : 'text-slate-400 hover:text-slate-600'
                }`}
              aria-pressed={tab === t}
            >
              {t === 'users' ? <Users size={14} /> : <Briefcase size={14} />}
              <span className="capitalize">{t}</span>
              {t === 'users' && users !== null && (
                <span className="badge-blue badge ml-0.5">{users.length}</span>
              )}
              {t === 'jobs' && jobs !== null && (
                <span className="badge-blue badge ml-0.5">{jobs.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Warning banner */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl mb-6 bg-amber-50 border border-amber-100">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Deletion is permanent and cannot be undone. All associated graph data, match edges,
            and cached visualizations will be removed.
          </p>
        </div>

        {/* Error alert */}
        {error && (
          <div className="alert-error mb-4 text-sm">{error}</div>
        )}

        {/* Search input */}
        {(tab === 'users' ? users : jobs) !== null && (
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'users' ? 'Search users…' : 'Search jobs…'}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-100 bg-white text-sm text-indigo-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
              aria-label={`Search ${tab}`}
            />
          </div>
        )}

        {/* Loading state */}
        {loading && !users && !jobs && (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">
            <RefreshCw size={18} className="animate-spin mr-2" />
            Loading…
          </div>
        )}

        {/* Users list */}
        {tab === 'users' && users !== null && (
          <div className="space-y-2">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-16 card-lumino p-8">
                <Users size={40} className="mx-auto mb-3 text-slate-200" />
                <p className="text-sm text-slate-400">
                  {search ? 'No users match your search.' : 'No users are currently registered.'}
                </p>
              </div>
            ) : (
              filteredUsers.map(u => (
                <UserRow key={u.id} user={u} onDeleted={handleUserDeleted} />
              ))
            )}
          </div>
        )}

        {/* Jobs list */}
        {tab === 'jobs' && jobs !== null && (
          <div className="space-y-2">
            {filteredJobs.length === 0 ? (
              <div className="text-center py-16 card-lumino p-8">
                <Briefcase size={40} className="mx-auto mb-3 text-slate-200" />
                <p className="text-sm text-slate-400">
                  {search ? 'No jobs match your search.' : 'No roles are currently indexed.'}
                </p>
              </div>
            ) : (
              filteredJobs.map(j => (
                <JobRow key={j.id} job={j} onDeleted={handleJobDeleted} />
              ))
            )}
          </div>
        )}

      </div>
    </>
  );
}
