import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import {
  TrendingUp, Target, Zap, CheckCircle, Network, ArrowRight, RefreshCw, AlertCircle
} from 'lucide-react'

export default function Trajectory() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<any | null>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [statsData, matchData] = await Promise.allSettled([
        api.getUserStats(session!.userId),
        api.getMatches(session!.userId),
      ])
      if (statsData.status === 'fulfilled') setStats(statsData.value)
      if (matchData.status === 'fulfilled') setMatches(matchData.value.results || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const topMatches = matches.slice(0, 3)
  const hasProfile = stats && (stats.nodes > 0 || stats.skills > 0)

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Career Trajectory Map</h1>
          <p className="mt-3 text-lg text-slate-500 leading-relaxed">
            {hasProfile
              ? `Your graph has ${stats.nodes} nodes — ${stats.skills} skills and ${stats.domains} domains mapped.`
              : 'Upload your resume to visualize your career trajectory.'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="self-start bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm mb-6">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* No profile CTA */}
      {!loading && !hasProfile && (
        <div className="text-center py-20 bg-white rounded-3xl shadow-prism border border-slate-100 mb-8">
          <TrendingUp size={48} className="mx-auto mb-4 text-slate-300" />
          <h3 className="text-xl font-bold text-indigo-950 mb-2">Build Your Trajectory</h3>
          <p className="text-slate-500 mb-6">Upload your resume to start mapping your career path.</p>
          <Link
            to="/resume"
            className="inline-flex items-center gap-2 bg-primary-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-600 transition-all"
          >
            Upload Resume
          </Link>
        </div>
      )}

      {/* The Map Visualization */}
      {hasProfile && (
        <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8 mb-8 relative overflow-hidden min-h-[400px]">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

          <div className="relative z-10 h-full">
            {/* Trajectory Path */}
            <div className="relative flex items-center justify-between px-10 py-16">
              <div className="absolute w-[80%] h-1 bg-slate-100 top-1/2 left-[10%] -translate-y-1/2 z-0">
                <div className="h-full bg-primary-500 w-2/3 shadow-[0_0_15px_rgba(19,127,236,0.5)]" />
              </div>

              {/* Start */}
              <div className="flex flex-col items-center gap-4 relative z-10">
                <div className="w-14 h-14 rounded-full bg-white border-4 border-slate-200 flex items-center justify-center shadow-md">
                  <CheckCircle className="text-slate-300" size={28} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Start</p>
                  <p className="font-bold text-slate-600 text-sm">Profile Built</p>
                </div>
              </div>

              {/* Current */}
              <div className="flex flex-col items-center gap-4 relative z-10">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary-500/20 blur-xl rounded-full scale-150" />
                  <div className="w-20 h-20 rounded-full bg-white border-4 border-primary-500 flex items-center justify-center shadow-xl relative z-10">
                    <Target className="text-primary-500" size={36} />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-primary-500 uppercase tracking-widest">Current</p>
                  <p className="font-bold text-indigo-950 text-sm">{session?.userId}</p>
                </div>
              </div>

              {/* Target */}
              <div className="flex flex-col items-center gap-4 opacity-40 relative z-10">
                <div className="w-14 h-14 rounded-full bg-white border-4 border-dashed border-slate-200 flex items-center justify-center">
                  <TrendingUp className="text-slate-300" size={28} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Target</p>
                  <p className="font-bold text-slate-400 text-sm">Next Level</p>
                </div>
              </div>
            </div>

            {/* AI Tip */}
            <div className="absolute bottom-8 left-8 bg-indigo-950 text-white p-5 rounded-2xl shadow-2xl max-w-xs border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-yellow-400" />
                <span className="text-[10px] font-black uppercase tracking-widest">AI Insight</span>
              </div>
              <p className="text-sm text-indigo-100 leading-relaxed">
                Your graph has <span className="text-white font-bold">{stats?.skills ?? 0} skills</span> and{' '}
                <span className="text-white font-bold">{stats?.domains ?? 0} domains</span> mapped.{' '}
                {matches.length > 0 ? `${matches.length} job matches found.` : 'Complete your profile to find matches.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Graph stats */}
        <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-8">
          <h2 className="text-xl font-bold text-indigo-950 mb-6">Profile Statistics</h2>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : !stats ? (
            <p className="text-slate-400 text-sm">No profile data available. Upload your resume.</p>
          ) : (
            <div className="space-y-5">
              {[
                { label: 'Skills Mapped', value: stats.skills ?? 0, max: 50 },
                { label: 'Domain Coverage', value: stats.domains ?? 0, max: 20 },
                { label: 'Graph Nodes', value: stats.nodes ?? 0, max: 100 },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-700">{item.label}</span>
                    <span className="text-sm font-black text-primary-500">{item.value}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 pt-6 border-t border-slate-100 flex gap-3">
            <button
              onClick={() => navigate('/model')}
              className="flex-1 border border-slate-200 text-indigo-950 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Network size={16} /> View Graph
            </button>
            <button
              onClick={() => navigate('/user/edit-graph')}
              className="flex-1 bg-primary-500 text-white py-3 rounded-xl font-bold hover:bg-primary-600 transition-all flex items-center justify-center gap-2 text-sm"
            >
              Deep Dive
            </button>
          </div>
        </div>

        {/* Recommended roles */}
        <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-8">
          <h2 className="text-xl font-bold text-indigo-950 mb-6">Recommended Roles</h2>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : topMatches.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400 text-sm mb-4">No recommendations yet. Upload your resume first.</p>
              <Link to="/resume" className="text-primary-500 font-bold text-sm hover:underline">Upload Resume →</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {topMatches.map((job: any) => (
                <div
                  key={job.job_id}
                  className="p-4 rounded-xl border border-slate-100 hover:border-primary-200 transition-all cursor-pointer group"
                  onClick={() => navigate(`/user/match/${job.job_id}`)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-indigo-950 group-hover:text-primary-500 transition-colors">
                        {job.job_title || job.job_id}
                      </h3>
                      {job.company && <p className="text-xs text-slate-500">{job.company}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-primary-500">{job.total_score}%</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black">Match</p>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => navigate('/applications')}
                className="w-full text-sm font-bold text-primary-500 hover:underline flex items-center justify-center gap-1 pt-2"
              >
                View all matches <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
