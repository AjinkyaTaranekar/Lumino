import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle,
  ChevronDown, ChevronRight,
  FileText,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import GraphViewer from '../../components/GraphViewer'
import ScoreBar from '../../components/ScoreBar'
import SkillBadge from '../../components/SkillBadge'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import type { MatchExplanation, MatchResult } from '../../lib/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GraphPath {
  path: string
}

interface MatchDetail extends MatchResult {
  remote_policy?: string
  culture_bonus: number
  preference_bonus: number
  matched_domains: string[]
  missing_domains: string[]
  behavioral_risk_flags?: string[]
}

// ─── Verdict badge map ────────────────────────────────────────────────────────

const VERDICT_STYLES: Record<string, string> = {
  'Strong match': 'badge-green',
  'Good match': 'badge-green',
  'Moderate match': 'badge-orange',
  'Weak match': 'badge-red',
  'Not recommended': 'badge-red',
}

// ─── ExplanationPanel ─────────────────────────────────────────────────────────

interface ExplanationPanelProps {
  explanation: string | MatchExplanation
}

function ExplanationPanel({ explanation }: ExplanationPanelProps) {
  if (typeof explanation === 'string') {
    return <p className="text-sm text-slate-600 leading-relaxed">{explanation}</p>
  }

  const {
    verdict = '', headline = '', why_they_fit = [], critical_gaps = [],
    nice_to_have_gaps = [], seniority_fit = '', honest_take = '',
    recommendation = '', interview_focus = [],
  } = explanation

  return (
    <div className="space-y-4">
      {verdict && (
        <span className={`badge ${VERDICT_STYLES[verdict] ?? 'badge-blue'} text-xs`}>
          {verdict}
        </span>
      )}

      {headline && (
        <p className="text-sm font-medium text-indigo-950 leading-relaxed">{headline}</p>
      )}

      {(why_they_fit?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-emerald-600 mb-1.5">Why they fit</p>
          <ul className="space-y-1">
            {why_they_fit!.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(critical_gaps?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-500 mb-1.5">Critical gaps</p>
          <ul className="space-y-1">
            {critical_gaps!.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(nice_to_have_gaps?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 mb-1.5">Nice-to-have gaps</p>
          <ul className="space-y-1">
            {nice_to_have_gaps!.slice(0, 4).map((item, i) => (
              <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                <span className="text-amber-400 flex-shrink-0">~</span>{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {seniority_fit && (
        <div className="alert-info rounded-lg flex items-start gap-2 p-3">
          <TrendingUp size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-xs mb-0.5">Seniority fit</p>
            <p className="text-xs">{seniority_fit}</p>
          </div>
        </div>
      )}

      {honest_take && (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1">Honest assessment</p>
          <p className="text-sm text-slate-600 leading-relaxed">{honest_take}</p>
        </div>
      )}

      {recommendation && (
        <div className="rounded-lg p-3 bg-slate-50 border border-slate-100">
          <p className="text-xs font-semibold text-slate-600 mb-1">Recommendation</p>
          <p className="text-sm text-indigo-950">{recommendation}</p>
        </div>
      )}

      {(interview_focus?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 mb-1.5">Interview focus areas</p>
          <ul className="space-y-1">
            {interview_focus!.map((item, i) => (
              <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                <span className="text-blue-400 flex-shrink-0">→</span>{item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── PathItem ─────────────────────────────────────────────────────────────────

interface PathItemProps {
  path: GraphPath
  index: number
}

function PathItem({ path, index }: PathItemProps) {
  const segments = path.path.split(' → ')
  return (
    <div className="rounded-lg p-3 mb-2 bg-slate-50 border border-slate-100">
      <p className="text-xs font-medium text-slate-400 mb-1.5">Path {index + 1}</p>
      <div className="flex flex-wrap gap-1 items-center">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-mono">{seg}</span>
            {i < segments.length - 1 && <ChevronRight size={10} className="text-slate-400" />}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── MatchExplorer ────────────────────────────────────────────────────────────

export default function MatchExplorer() {
  const { jobId } = useParams<{ jobId: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const viewAs = (location.state as { viewAs?: string } | null)?.viewAs ?? null
  const userId = viewAs ?? session.userId
  const isProxy = !!viewAs

  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [paths, setPaths] = useState<GraphPath[]>([])
  const [pathsOpen, setPathsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | MatchExplanation | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [explainErr, setExplainErr] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [applying, setApplying] = useState(false)

  async function handleApply() {
    if (!jobId || !session || isProxy) return
    setApplying(true)
    try {
      await api.recordEvent(session.userId, jobId, 'job_applied')
      setApplied(true)
    } catch {
      // silent — analytics should not block the user
    } finally {
      setApplying(false)
    }
  }

  async function handleExplain() {
    setExplaining(true)
    setExplainErr(null)
    try {
      const exp = await api.explainMatch(userId, jobId!, isProxy ? 'recruiter' : 'seeker')
      setExplanation(exp.explanation)
    } catch (e: unknown) {
      setExplainErr(e instanceof Error ? e.message : String(e))
    } finally {
      setExplaining(false)
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [d, p] = await Promise.all([
          api.getMatchDetail(userId, jobId!),
          api.getMatchPaths(userId, jobId!, 20),
        ])
        setDetail(d as MatchDetail)
        setPaths((p as { paths?: GraphPath[] }).paths || [])
        setExplaining(true)
        try {
          const exp = await api.explainMatch(userId, jobId!, isProxy ? 'recruiter' : 'seeker')
          setExplanation(exp.explanation)
        } catch (e: unknown) {
          setExplainErr(e instanceof Error ? e.message : String(e))
        } finally {
          setExplaining(false)
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, userId])

  const scoreColorClass = detail
    ? (detail.total_score >= 0.7 ? 'text-emerald-600' : detail.total_score >= 0.4 ? 'text-amber-600' : 'text-red-500')
    : ''

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Topbar */}
      <div className="flex items-center gap-4 px-6 py-3.5 border-b border-slate-100 bg-white flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate(isProxy ? `/recruiter/candidates/${jobId}` : '/user/dashboard')}
          className="btn-ghost flex items-center gap-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          aria-label={isProxy ? 'Back to candidates' : 'Back to dashboard'}
        >
          <ArrowLeft size={15} /> {isProxy ? 'Candidates' : 'Dashboard'}
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-indigo-950 truncate">
            {loading ? 'Loading match…' : detail ? detail.job_title : `Job ${jobId}`}
          </h1>
          {detail?.company && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Building2 size={10} /> {detail.company}
            </p>
          )}
        </div>

        {!isProxy && session && (
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || applied}
            aria-label={applied ? 'Application submitted' : 'Apply to this job'}
            className={`btn-sm flex items-center gap-1.5 flex-shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${
              applied ? 'btn-ghost text-emerald-600' : 'btn-primary'
            }`}
          >
            {applied ? (
              <><CheckCircle size={13} /> Applied!</>
            ) : applying ? (
              <><div className="spinner-sm" /> Applying…</>
            ) : (
              'Apply Now'
            )}
          </button>
        )}

        {detail && (
          <div className="text-right flex-shrink-0" aria-label={`Overall match: ${Math.round(detail.total_score * 100)}%`}>
            <p className={`text-2xl font-extrabold tabular-nums ${scoreColorClass}`}>
              {Math.round(detail.total_score * 100)}%
            </p>
            <p className="text-xs text-slate-400">overall match</p>
          </div>
        )}
      </div>

      {error && (
        <div className="alert-error m-4 flex items-center gap-2" role="alert">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <div className="w-96 flex-shrink-0 overflow-y-auto p-5 border-r border-slate-100 bg-white">
          {detail && (
            <>
              {/* Score cards */}
              <div className="card-lumino p-4 space-y-3 mb-6">
                <ScoreBar label="Overall Match" score={detail.total_score} large />
                <ScoreBar label="Skill Score" score={detail.skill_score} />
                <ScoreBar label="Domain Score" score={detail.domain_score} />
                {detail.culture_fit_score != null && (
                  <ScoreBar label="Culture Fit" score={detail.culture_fit_score} />
                )}
                {detail.optional_skill_score != null && detail.optional_skill_score > 0 && (
                  <ScoreBar label="Optional Skills" score={detail.optional_skill_score} />
                )}
              </div>

              {/* Bonus badges */}
              {(detail.culture_bonus > 0 || detail.preference_bonus > 0 ||
                (detail.education_fit_score != null && detail.education_fit_score > 0) ||
                (detail.preferred_qual_bonus != null && detail.preferred_qual_bonus > 0)) && (
                <div className="flex gap-2 flex-wrap mb-5">
                  {detail.culture_bonus > 0 && (
                    <span className="badge-green">Culture +{Math.round(detail.culture_bonus * 100)}%</span>
                  )}
                  {detail.preference_bonus > 0 && (
                    <span className="badge-blue">Prefs +{Math.round(detail.preference_bonus * 100)}%</span>
                  )}
                  {detail.education_fit_score != null && detail.education_fit_score > 0 && (
                    <span className="badge badge-green">Edu fit {Math.round(detail.education_fit_score * 100)}%</span>
                  )}
                  {detail.preferred_qual_bonus != null && detail.preferred_qual_bonus > 0 && (
                    <span className="badge badge-gray">+{Math.round(detail.preferred_qual_bonus * 100)}% quals</span>
                  )}
                </div>
              )}

              {/* Education fit detail */}
              {detail.met_education_reqs && detail.met_education_reqs.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-emerald-600 mb-1.5">Education Met</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.met_education_reqs.map(r => (
                      <span key={r} className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle size={9} /> {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {detail.gap_education_reqs && detail.gap_education_reqs.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-amber-600 mb-1.5">Education Gaps</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.gap_education_reqs.map(r => (
                      <span key={r} className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched skills */}
              {detail.matched_skills?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-emerald-600 mb-2">
                    Matched Skills ({detail.matched_skills.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.matched_skills.map(s => <SkillBadge key={s} label={s} variant="match" />)}
                  </div>
                </div>
              )}

              {/* Missing skills */}
              {detail.missing_skills?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-amber-600 mb-2">
                    Skill Gaps ({detail.missing_skills.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.missing_skills.map(s => <SkillBadge key={s} label={s} variant="missing" />)}
                  </div>
                </div>
              )}

              {/* Domain matches */}
              {detail.matched_domains?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-emerald-600 mb-2">Domain Match</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.matched_domains.map(d => <SkillBadge key={d} label={d} variant="match" />)}
                  </div>
                </div>
              )}

              {detail.missing_domains?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-amber-600 mb-2">Domain Gaps</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.missing_domains.map(d => <SkillBadge key={d} label={d} variant="missing" />)}
                  </div>
                </div>
              )}

              {/* Behavioral risk flags */}
              {detail.behavioral_risk_flags && detail.behavioral_risk_flags.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-semibold text-red-500 mb-2">Risk Flags</p>
                  <div className="space-y-1" role="list">
                    {detail.behavioral_risk_flags.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5"
                        role="listitem"
                      >
                        <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Analysis card */}
              <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-blue-600 flex items-center gap-1.5">
                    <Sparkles size={12} /> AI Analysis
                  </p>
                  {!explanation && !explaining && (
                    <button
                      type="button"
                      onClick={handleExplain}
                      className="btn-secondary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
                    >
                      Generate
                    </button>
                  )}
                </div>
                {explaining && (
                  <div className="flex items-center gap-2 text-xs text-slate-400" role="status" aria-live="polite">
                    <div className="spinner-sm" /> Analysing evidence…
                  </div>
                )}
                {explanation && <ExplanationPanel explanation={explanation} />}
                {explainErr && <p className="text-xs text-red-500" role="alert">{explainErr}</p>}
              </div>
            </>
          )}

          {/* View full job profile link */}
          {detail && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => navigate(`/user/jobs/${jobId}/profile`)}
                className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
              >
                <FileText size={14} />
                View Full Job Profile
              </button>
            </div>
          )}

          {/* Graph paths collapsible */}
          {paths.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setPathsOpen(o => !o)}
                className="flex items-center justify-between w-full mb-2 py-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                aria-expanded={pathsOpen}
                aria-controls="graph-paths-list"
              >
                <p className="text-xs font-semibold text-blue-600">Graph Paths ({paths.length})</p>
                {pathsOpen
                  ? <ChevronDown size={14} className="text-blue-500" />
                  : <ChevronRight size={14} className="text-blue-500" />
                }
              </button>
              {pathsOpen && (
                <div id="graph-paths-list">
                  {paths.map((p, i) => <PathItem key={i} path={p} index={i} />)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel - graph */}
        <div className="flex-1 p-4 bg-slate-50">
          <GraphViewer
            generateFn={() => api.generateMatchViz(userId, jobId!)}
            iframeSrc={api.matchVizUrl(userId, jobId!)}
            height="100%"
          />
        </div>
      </div>
    </div>
  )
}
