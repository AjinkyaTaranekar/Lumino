import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import {
  Briefcase, RefreshCw, AlertCircle, ArrowRight
} from 'lucide-react'

// NOTE: A dedicated /applications status-tracking API does not exist yet.
// We surface job match results as a proxy for "applications". See MISSING_APIS.md.

const STATUS_COLORS: Record<string, string> = {
  'Strong match':   'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Good match':     'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Moderate match': 'bg-orange-50 text-orange-700 border-orange-200',
  'Weak match':     'bg-red-50 text-red-700 border-red-200',
}

function scoreToVerdict(score: number) {
  if (score >= 80) return 'Strong match'
  if (score >= 65) return 'Good match'
  if (score >= 50) return 'Moderate match'
  return 'Weak match'
}

export default function Applications() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getMatches(session!.userId)
      setMatches(data.results || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">My Applications</h1>
          <p className="mt-3 text-lg text-slate-500 leading-relaxed">
            {loading ? 'Loading…' : matches.length > 0
              ? `${matches.length} job match${matches.length !== 1 ? 'es' : ''} in your profile`
              : 'Upload your resume to see your job matches.'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all self-start"
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

      {/* Empty state */}
      {!loading && matches.length === 0 && !error && (
        <div className="text-center py-20 bg-white rounded-3xl shadow-prism border border-slate-100">
          <Briefcase size={48} className="mx-auto mb-4 text-slate-300" />
          <h3 className="text-xl font-bold text-indigo-950 mb-2">No matches yet</h3>
          <p className="text-slate-500 mb-6">Upload your resume first to get job recommendations.</p>
          <button
            onClick={() => navigate('/resume')}
            className="bg-primary-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-600 transition-all"
          >
            Upload Resume
          </button>
        </div>
      )}

      {/* Match list */}
      {!loading && matches.length > 0 && (
        <div className="space-y-6">
          {matches.map((r: any) => {
            const verdict = scoreToVerdict(r.total_score)
            const statusClass = STATUS_COLORS[verdict] || 'bg-slate-50 text-slate-500 border-slate-200'
            return (
              <div key={r.job_id} className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8 hover:border-primary-200 transition-all">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                  <div className="flex items-start gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-950 flex items-center justify-center text-white font-black text-xl flex-shrink-0">
                      {(r.job_title || r.job_id)[0]?.toUpperCase() || 'J'}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-indigo-950">{r.job_title || r.job_id}</h3>
                      {r.company && <p className="text-sm text-slate-500 mt-1">{r.company}</p>}
                      <span className={`inline-block mt-2 text-xs font-bold uppercase px-3 py-1 rounded-full border ${statusClass}`}>
                        {verdict}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-3xl font-black text-primary-500">{r.total_score}%</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black">Match Score</p>
                    </div>
                  </div>
                </div>

                {/* Score breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  {[
                    { label: 'Skill Score', value: r.skill_score },
                    { label: 'Domain Score', value: r.domain_score },
                    { label: 'Overall Score', value: r.total_score },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-bold text-slate-600">{s.label}</span>
                        <span className="text-slate-900 font-black">{s.value ?? 0}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${s.value ?? 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Matched skills */}
                {r.matched_skills?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Matched Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {r.matched_skills.map((s: string) => (
                        <span key={s} className="text-[10px] font-black uppercase px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-50 flex justify-end">
                  <button
                    onClick={() => navigate(`/user/match/${r.job_id}`)}
                    className="flex items-center gap-2 text-sm font-bold text-primary-500 hover:underline"
                  >
                    View Full Analysis <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
