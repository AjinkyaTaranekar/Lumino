import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import GraphViewer from '../../components/GraphViewer'
import ScoreBar from '../../components/ScoreBar'
import SkillBadge from '../../components/SkillBadge'
import { ArrowLeft, ChevronDown, ChevronRight, Sparkles, Building2, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'

const VERDICT_STYLES = {
  'Strong match':    'badge-green',
  'Good match':      'badge-green',
  'Moderate match':  'badge-orange',
  'Weak match':      'badge-red',
  'Not recommended': 'badge-red',
}

function ExplanationPanel({ explanation }) {
  if (typeof explanation === 'string') {
    return <p className="text-sm text-content-secondary leading-relaxed">{explanation}</p>
  }

  const {
    verdict = '', headline = '', why_they_fit = [], critical_gaps = [],
    nice_to_have_gaps = [], seniority_fit = '', honest_take = '',
    recommendation = '', interview_focus = [],
  } = explanation

  return (
    <div className="space-y-4">
      {verdict && (
        <span className={`badge ${VERDICT_STYLES[verdict] || 'badge-gray'} text-xs`}>
          {verdict}
        </span>
      )}

      {headline && (
        <p className="text-sm font-medium text-content-primary leading-relaxed">{headline}</p>
      )}

      {why_they_fit?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-success-600 mb-1.5">Why they fit</p>
          <ul className="space-y-1">
            {why_they_fit.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-content-secondary">
                <CheckCircle size={13} className="text-success-500 flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {critical_gaps?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-danger-500 mb-1.5">Critical gaps</p>
          <ul className="space-y-1">
            {critical_gaps.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-content-secondary">
                <AlertTriangle size={13} className="text-danger-400 flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nice_to_have_gaps?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-warning-600 mb-1.5">Nice-to-have gaps</p>
          <ul className="space-y-1">
            {nice_to_have_gaps.slice(0, 4).map((item, i) => (
              <li key={i} className="text-sm text-content-muted flex items-start gap-2">
                <span className="text-warning-400 flex-shrink-0">~</span>{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {seniority_fit && (
        <div className="alert-info rounded-lg">
          <TrendingUp size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-xs mb-0.5">Seniority fit</p>
            <p className="text-xs">{seniority_fit}</p>
          </div>
        </div>
      )}

      {honest_take && (
        <div>
          <p className="text-xs font-semibold text-content-muted mb-1">Honest assessment</p>
          <p className="text-sm text-content-secondary leading-relaxed">{honest_take}</p>
        </div>
      )}

      {recommendation && (
        <div className="rounded-lg p-3 bg-surface-raised border border-surface-border">
          <p className="text-xs font-semibold text-content-secondary mb-1">Recommendation</p>
          <p className="text-sm text-content-primary">{recommendation}</p>
        </div>
      )}

      {interview_focus?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-warning-600 mb-1.5">Interview focus areas</p>
          <ul className="space-y-1">
            {interview_focus.map((item, i) => (
              <li key={i} className="text-sm text-content-secondary flex items-start gap-2">
                <span className="text-primary-400 flex-shrink-0">→</span>{item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PathItem({ path, index }) {
  const segments = path.path.split(' → ')
  return (
    <div className="rounded-lg p-3 mb-2 bg-surface-raised border border-surface-border">
      <p className="text-xs font-medium text-content-muted mb-1.5">Path {index + 1}</p>
      <div className="flex flex-wrap gap-1 items-center">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="px-2 py-0.5 rounded bg-primary-50 text-primary-700 text-xs font-mono">{seg}</span>
            {i < segments.length - 1 && <ChevronRight size={10} className="text-content-muted" />}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function MatchExplorer() {
  const { jobId }   = useParams()
  const { session } = useAuth()
  const navigate    = useNavigate()
  const location    = useLocation()

  const viewAs  = location.state?.viewAs || null
  const userId  = viewAs || session.userId
  const isProxy = !!viewAs

  const [detail,      setDetail]      = useState(null)
  const [paths,       setPaths]       = useState([])
  const [pathsOpen,   setPathsOpen]   = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [explanation, setExplanation] = useState(null)
  const [explaining,  setExplaining]  = useState(false)
  const [explainErr,  setExplainErr]  = useState(null)

  async function handleExplain() {
    setExplaining(true)
    setExplainErr(null)
    try {
      const exp = await api.explainMatch(userId, jobId, isProxy ? 'recruiter' : 'seeker')
      setExplanation(exp.explanation)
    } catch (e) {
      setExplainErr(e.message)
    } finally {
      setExplaining(false)
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [d, p] = await Promise.all([
          api.getMatchDetail(userId, jobId),
          api.getMatchPaths(userId, jobId, 20),
        ])
        setDetail(d)
        setPaths(p.paths || [])
        setExplaining(true)
        try {
          const exp = await api.explainMatch(userId, jobId, isProxy ? 'recruiter' : 'seeker')
          setExplanation(exp.explanation)
        } catch (e) {
          setExplainErr(e.message)
        } finally {
          setExplaining(false)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobId, userId])

  const scoreColor = detail
    ? (detail.total_score >= 0.7 ? 'text-success-600' : detail.total_score >= 0.4 ? 'text-warning-600' : 'text-danger-500')
    : ''

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">

        {/* Topbar */}
        <div className="flex items-center gap-4 px-6 py-3.5 border-b border-surface-border bg-white flex-shrink-0">
          <button
            onClick={() => navigate(isProxy ? `/recruiter/candidates/${jobId}` : '/user/dashboard')}
            className="btn-ghost flex items-center gap-2 text-sm">
            <ArrowLeft size={15} /> {isProxy ? 'Candidates' : 'Dashboard'}
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-content-primary truncate">
              {loading ? 'Loading match…' : detail ? detail.job_title : `Job ${jobId}`}
            </h1>
            {detail?.company && (
              <p className="text-xs text-content-muted flex items-center gap-1">
                <Building2 size={10} /> {detail.company}
              </p>
            )}
          </div>

          {detail && (
            <div className="text-right flex-shrink-0">
              <p className={`text-2xl font-bold tabular-nums ${scoreColor}`}>
                {Math.round(detail.total_score * 100)}%
              </p>
              <p className="text-xs text-content-muted">overall match</p>
            </div>
          )}
        </div>

        {error && (
          <div className="alert-error m-4">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {/* Two-panel layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel */}
          <div className="w-96 flex-shrink-0 overflow-y-auto p-5 border-r border-surface-border bg-white">
            {detail && (
              <>
                {/* Score bars */}
                <div className="space-y-3 mb-6">
                  <ScoreBar label="Overall Match" score={detail.total_score} large />
                  <ScoreBar label="Skill Score"   score={detail.skill_score} />
                  <ScoreBar label="Domain Score"  score={detail.domain_score} />
                  {detail.culture_fit_score != null && (
                    <ScoreBar label="Culture Fit" score={detail.culture_fit_score} />
                  )}
                </div>

                {/* Bonuses */}
                {(detail.culture_bonus > 0 || detail.preference_bonus > 0) && (
                  <div className="flex gap-2 flex-wrap mb-5">
                    {detail.culture_bonus > 0 && (
                      <span className="badge badge-green">Culture +{Math.round(detail.culture_bonus * 100)}%</span>
                    )}
                    {detail.preference_bonus > 0 && (
                      <span className="badge badge-blue">Prefs +{Math.round(detail.preference_bonus * 100)}%</span>
                    )}
                  </div>
                )}

                {/* Matched skills */}
                {detail.matched_skills?.length > 0 && (
                  <div className="mb-4">
                    <p className="section-title mb-2 text-success-600">
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
                    <p className="section-title mb-2 text-warning-600">
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
                    <p className="section-title mb-2 text-success-600">Domain Match</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.matched_domains.map(d => <SkillBadge key={d} label={d} variant="match" />)}
                    </div>
                  </div>
                )}

                {detail.missing_domains?.length > 0 && (
                  <div className="mb-4">
                    <p className="section-title mb-2 text-warning-600">Domain Gaps</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.missing_domains.map(d => <SkillBadge key={d} label={d} variant="missing" />)}
                    </div>
                  </div>
                )}

                {/* Behavioral risk flags */}
                {detail.behavioral_risk_flags?.length > 0 && (
                  <div className="mb-5">
                    <p className="section-title mb-2 text-danger-500">Risk Flags</p>
                    <div className="space-y-1">
                      {detail.behavioral_risk_flags.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-danger-600 bg-danger-50 border border-danger-100 rounded-lg px-2.5 py-1.5">
                          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Explanation */}
                <div className="mb-5 p-4 rounded-xl bg-surface-raised border border-surface-border">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-primary-600 flex items-center gap-1.5">
                      <Sparkles size={12} /> AI Analysis
                    </p>
                    {!explanation && !explaining && (
                      <button onClick={handleExplain} className="btn-secondary btn-sm">
                        Generate
                      </button>
                    )}
                  </div>
                  {explaining && (
                    <div className="flex items-center gap-2 text-xs text-content-muted">
                      <div className="spinner-sm" /> Analysing evidence…
                    </div>
                  )}
                  {explanation && <ExplanationPanel explanation={explanation} />}
                  {explainErr && <p className="text-xs text-danger-500">{explainErr}</p>}
                </div>
              </>
            )}

            {/* Graph paths */}
            {paths.length > 0 && (
              <div>
                <button
                  onClick={() => setPathsOpen(o => !o)}
                  className="flex items-center justify-between w-full mb-2 py-1">
                  <p className="section-title text-primary-600">Graph Paths ({paths.length})</p>
                  {pathsOpen ? <ChevronDown size={14} className="text-primary-500" /> : <ChevronRight size={14} className="text-primary-500" />}
                </button>
                {pathsOpen && paths.map((p, i) => <PathItem key={i} path={p} index={i} />)}
              </div>
            )}
          </div>

          {/* Right panel — graph */}
          <div className="flex-1 p-4 bg-surface-bg">
            <GraphViewer
              generateFn={() => api.generateMatchViz(userId, jobId)}
              iframeSrc={api.matchVizUrl(userId, jobId)}
              height="100%"
            />
          </div>
        </div>
      </div>
    </Layout>
  )
}
