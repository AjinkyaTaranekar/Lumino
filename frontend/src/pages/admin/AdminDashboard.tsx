import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import {
  Users, Briefcase, Trash2, RefreshCw, AlertTriangle, Shield,
  CheckCircle, AlertCircle
} from 'lucide-react'

function DeleteButton({ onConfirm, disabled }: { onConfirm: () => void; disabled: boolean }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <span className="flex items-center gap-2">
        <button
          onClick={() => { setConfirming(false); onConfirm() }}
          disabled={disabled}
          className="px-3 py-1 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-all"
        >
          Confirm
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-700 transition-all"
        >
          Cancel
        </button>
      </span>
    )
  }
  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 transition-all disabled:opacity-40"
    >
      <Trash2 size={13} /> Delete
    </button>
  )
}

function UserRow({ user, onDeleted }: { user: any; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try { await api.deleteUser(user.id); onDeleted(user.id) }
    catch (e: any) { setError(e.message); setDeleting(false) }
  }
  return (
    <div className="flex items-center justify-between px-5 py-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-all">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700 flex-shrink-0">
          {(user.id as string)[0]?.toUpperCase()}
        </div>
        <span className="text-sm font-semibold text-indigo-950">{user.id}</span>
      </div>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-500">{error}</span>}
        <DeleteButton onConfirm={handleDelete} disabled={deleting} />
      </div>
    </div>
  )
}

const REMOTE_COLORS: Record<string, string> = {
  remote: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  hybrid: 'bg-orange-50 text-orange-700 border-orange-100',
  onsite: 'bg-blue-50 text-blue-700 border-blue-100',
}

function JobRow({ job, onDeleted }: { job: any; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try { await api.deleteJob(job.id); onDeleted(job.id) }
    catch (e: any) { setError(e.message); setDeleting(false) }
  }
  return (
    <div className="flex items-center justify-between px-5 py-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-all">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Briefcase size={15} className="text-slate-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-indigo-950 truncate">{job.title || job.id}</p>
          {job.company && <p className="text-xs text-slate-400 truncate">{job.company}</p>}
        </div>
        {job.remote_policy && (
          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border flex-shrink-0 ${REMOTE_COLORS[job.remote_policy] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
            {job.remote_policy}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 ml-3 flex-shrink-0">
        {error && <span className="text-xs text-red-500">{error}</span>}
        <DeleteButton onConfirm={handleDelete} disabled={deleting} />
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<'users' | 'jobs'>('users')
  const [users, setUsers] = useState<any[] | null>(null)
  const [jobs, setJobs] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true); setError(null)
    try { const data = await api.listUsers(); setUsers(data) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  const loadJobs = useCallback(async () => {
    setLoading(true); setError(null)
    try { const data = await api.listJobs(); setJobs(data) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (tab === 'users' && users === null) loadUsers()
    if (tab === 'jobs' && jobs === null) loadJobs()
  }, [tab, users, jobs, loadUsers, loadJobs])

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-950/10 rounded-lg">
              <Shield size={20} className="text-indigo-950" />
            </div>
            <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Admin Console</h1>
          </div>
          <p className="text-lg text-slate-500 leading-relaxed">
            Manage users and jobs · deletions are permanent.
          </p>
        </div>
        <button
          onClick={() => { tab === 'users' ? loadUsers() : loadJobs() }}
          disabled={loading}
          className="self-start flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 mb-6 inline-flex">
        {(['users', 'jobs'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              tab === t ? 'bg-white text-indigo-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'users' ? <><Users size={15} /> Users {users !== null && `(${users.length})`}</>
              : <><Briefcase size={15} /> Jobs {jobs !== null && `(${jobs.length})`}</>}
          </button>
        ))}
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-50 border border-orange-200 mb-6">
        <AlertTriangle size={16} className="text-orange-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-orange-700">
          Deletion is <strong>permanent and irreversible</strong>. All associated graph data, match edges, and cached visualizations will be removed.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm mb-4">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !users && !jobs && (
        <div className="text-center py-16 text-sm text-slate-400">Loading…</div>
      )}

      {/* Users tab */}
      {tab === 'users' && users !== null && (
        <div className="space-y-2">
          {users.length === 0 ? (
            <div className="text-center py-16">
              <Users size={40} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400">No users in the system.</p>
            </div>
          ) : users.map((u: any) => (
            <UserRow key={u.id} user={u} onDeleted={id => setUsers(prev => prev!.filter(x => x.id !== id))} />
          ))}
        </div>
      )}

      {/* Jobs tab */}
      {tab === 'jobs' && jobs !== null && (
        <div className="space-y-2">
          {jobs.length === 0 ? (
            <div className="text-center py-16">
              <Briefcase size={40} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400">No jobs in the system.</p>
            </div>
          ) : jobs.map((j: any) => (
            <JobRow key={j.id} job={j} onDeleted={id => setJobs(prev => prev!.filter(x => x.id !== id))} />
          ))}
        </div>
      )}
    </div>
  )
}
