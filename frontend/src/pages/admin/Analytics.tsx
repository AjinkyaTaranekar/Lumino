import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Database, Shield, Settings, Plus, AlertCircle } from 'lucide-react'

// NOTE: Workspace/analytics-specific APIs do not exist yet. See MISSING_APIS.md.
// Basic user/job counts are wired from existing APIs.

export default function Analytics() {
  const [users, setUsers] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [inferenceDepth, setInferenceDepth] = useState(50)
  const [models, setModels] = useState([
    { name: 'Engineering Tracks v4.2', active: true },
    { name: 'Product Leadership v1.0', active: true },
    { name: 'Marketing Velocity v2.1', active: false },
  ])

  useEffect(() => {
    Promise.all([
      api.listUsers().then(setUsers).catch(() => {}),
      api.listJobs().then(setJobs).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Workspace Setup</h1>
        <p className="mt-3 text-lg text-slate-500 max-w-2xl leading-relaxed">
          Configure graph parameters, team permissions, and integration settings.
        </p>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Registered Users', value: loading ? '—' : users.length },
          { label: 'Active Jobs', value: loading ? '—' : jobs.length },
          { label: 'Graph Engine', value: 'Neo4j' },
          { label: 'Status', value: 'Live' },
        ].map(s => (
          <div key={s.label} className="bg-white p-5 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">{s.label}</h3>
            <p className="text-2xl font-black text-indigo-950">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Graph Config */}
        <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <Database size={22} className="text-primary-500" />
            </div>
            <h2 className="text-xl font-bold text-indigo-950">Knowledge Graph Settings</h2>
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
                Inference Depth: {inferenceDepth}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={inferenceDepth}
                onChange={e => setInferenceDepth(Number(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary-500"
              />
              <div className="flex justify-between mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>Standard</span>
                <span>Deep Neural</span>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100">
              <h4 className="text-sm font-bold text-indigo-950 mb-4">Active Trajectory Models</h4>
              <div className="space-y-3">
                {models.map((model, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-sm font-medium text-slate-700">{model.name}</span>
                    <button
                      onClick={() => setModels(prev => prev.map((m, idx) => idx === i ? { ...m, active: !m.active } : m))}
                      className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${model.active ? 'bg-primary-500' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${model.active ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Team Permissions */}
        <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Shield size={22} className="text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-indigo-950">Team &amp; Permissions</h2>
          </div>
          <div className="space-y-4">
            {users.slice(0, 4).map((userId: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700 flex-shrink-0">
                    {String(userId.id || userId)[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-indigo-950">{userId.id || userId}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-black">Member</p>
                  </div>
                </div>
                <button className="text-slate-400 hover:text-indigo-950 transition-colors">
                  <Settings size={16} />
                </button>
              </div>
            ))}
            {users.length === 0 && !loading && (
              <p className="text-sm text-slate-400 py-4">No users registered yet.</p>
            )}
            <button className="w-full py-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 font-bold text-sm flex items-center justify-center gap-2 hover:border-primary-300 hover:text-primary-500 transition-all">
              <Plus size={16} /> Invite Team Member
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
