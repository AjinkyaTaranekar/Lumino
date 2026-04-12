import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  Briefcase,
  Building2,
  CheckCircle2,
  GraduationCap,
  Heart,
  MapPin,
  Network,
  Plus,
  Star,
  Target,
  ThumbsDown,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import JobTagBadge from '../components/JobTagBadge';
import MatchInsightsPanel from '../components/MatchInsightsPanel';
import ScoreBar from '../components/ScoreBar';
import SkillBadge from '../components/SkillBadge';
import { useAuth } from '../context/AuthContext';
import { trackEvent } from '../lib/analytics';
import { api } from '../lib/api';
import { getCachedMatches, setCachedMatches } from '../lib/matchCache';
import type { BatchCandidateResponse, CandidateResult, Job, JobInteraction, MatchInsightsResponse, MatchResult } from '../lib/types';

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIERS = [
  {
    id: 'strong',
    label: 'High-Confidence Matches',
    sub: 'Strong fit signals. Prioritize these first.',
    icon: Zap,
    min: 0.72,
    gradient: 'from-indigo-950 to-blue-900',
    ring: 'ring-blue-400/30',
    countBg: 'bg-white/10 text-white',
  },
  {
    id: 'mid',
    label: 'Viable Opportunities',
    sub: 'Good fit with manageable tradeoffs.',
    icon: Target,
    min: 0.44,
    gradient: 'from-amber-600 to-orange-500',
    ring: 'ring-amber-400/30',
    countBg: 'bg-white/15 text-white',
  },
  {
    id: 'low',
    label: 'Stretch Opportunities',
    sub: 'Ambitious targets. Use insights to close key gaps.',
    icon: TrendingDown,
    min: 0,
    gradient: 'from-slate-600 to-slate-500',
    ring: 'ring-slate-400/20',
    countBg: 'bg-white/10 text-white',
  },
] as const;

function scoreTier(score: number) {
  if (score >= 0.72) return 'strong';
  if (score >= 0.44) return 'mid';
  return 'low';
}

// ─── Compact horizontal match card ───────────────────────────────────────────

function MatchCard({
  result, rank, userId, interaction,
}: {
  result: MatchResult;
  rank: number;
  userId: string;
  interaction?: JobInteraction;
}) {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(interaction?.liked ?? false);
  const [disliked, setDisliked] = useState(interaction?.disliked ?? false);
  const [bookmarked, setBookmarked] = useState(interaction?.bookmarked ?? false);
  const pct = Math.round(result.total_score * 100);
  const color = result.total_score >= 0.72 ? '#10b981' : result.total_score >= 0.44 ? '#f59e0b' : '#ef4444';
  const r = 20;
  const circ = 2 * Math.PI * r;

  function handleExplore() {
    trackEvent(userId, result.job_id, 'job_clicked');
    navigate(`/user/match/${result.job_id}`);
  }

  function handleLike() {
    const nowLiked = !liked;
    setLiked(nowLiked);
    setDisliked(false);
    trackEvent(userId, result.job_id, nowLiked ? 'job_liked' : 'job_dismissed');
  }

  function handleDislike() {
    const nowDisliked = !disliked;
    setDisliked(nowDisliked);
    setLiked(false);
    trackEvent(userId, result.job_id, nowDisliked ? 'job_disliked' : 'job_dismissed');
  }

  function handleBookmark() {
    const nowBookmarked = !bookmarked;
    setBookmarked(nowBookmarked);
    trackEvent(userId, result.job_id, 'job_bookmarked');
  }

  return (
    <motion.div
      className="flex-shrink-0 w-72 card-lumino p-4 flex flex-col gap-3 cursor-pointer group"
      whileHover={{ y: -4, boxShadow: '0 12px 32px -8px rgba(15,23,63,0.25)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      onClick={handleExplore}
      role="article"
      aria-label={`${result.job_title} — ${pct}% match`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Rank */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${rank <= 3 ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'
          }`}>
          {rank}
        </div>

        {/* Title + company */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-indigo-950 leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors">
            {result.job_title || result.job_id}
          </h3>
          {result.company && (
            <p className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
              <Building2 size={10} aria-hidden="true" />
              {result.company}
            </p>
          )}
        </div>

        {/* Score ring */}
        <div className="relative w-11 h-11 flex-shrink-0">
          <svg viewBox="0 0 48 48" className="w-11 h-11 -rotate-90">
            <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-100" />
            <motion.circle
              cx="24" cy="24" r={r} fill="none"
              stroke={color} strokeWidth="4" strokeLinecap="round"
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ - (pct / 100) * circ }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
              strokeDasharray={circ}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-bold text-indigo-950">{pct}%</span>
          </div>
        </div>
      </div>

      {/* Tags */}
      {(result.job_tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.job_tags!.slice(0, 3).map(tag => (
            <JobTagBadge
              key={tag}
              tag={tag}
              variant={result.interest_tags_matched?.includes(tag) ? 'interest' : 'neutral'}
            />
          ))}
          {result.job_tags!.length > 3 && (
            <JobTagBadge tag={`+${result.job_tags!.length - 3}`} variant="neutral" />
          )}
        </div>
      )}

      {/* Score breakdown bars */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <ScoreBar label="Skills" score={result.skill_score} />
        <ScoreBar label="Domain" score={result.domain_score} />
        {result.culture_fit_score != null && result.culture_fit_score > 0 && (
          <ScoreBar label="Culture" score={result.culture_fit_score} />
        )}
        {result.soft_skill_score != null && result.soft_skill_score > 0 && (
          <ScoreBar label="Soft Skills" score={result.soft_skill_score} />
        )}
        {result.interest_score != null && (
          <ScoreBar label="Interest" score={result.interest_score} />
        )}
      </div>

      {/* Matched skills */}
      {result.matched_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.matched_skills.slice(0, 4).map(s => (
            <SkillBadge key={s} label={s} variant="match" />
          ))}
          {result.matched_skills.length > 4 && (
            <SkillBadge label={`+${result.matched_skills.length - 4}`} variant="neutral" />
          )}
        </div>
      )}

      {/* Gap pills (only for low tier) */}
      {result.total_score < 0.44 && result.missing_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.missing_skills.slice(0, 3).map(s => (
            <SkillBadge key={s} label={s} variant="missing" />
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleLike}
            className={`p-1.5 rounded-lg transition-colors ${liked ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'}`}
            aria-label="I'm interested"
          >
            <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={handleDislike}
            className={`p-1.5 rounded-lg transition-colors ${disliked ? 'text-red-500 bg-red-50' : 'text-slate-300 hover:text-red-400 hover:bg-red-50'}`}
            aria-label="Not for me"
          >
            <ThumbsDown size={13} />
          </button>
          <button
            onClick={handleBookmark}
            className={`p-1.5 rounded-lg transition-colors ${bookmarked ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50'}`}
            aria-label="Save for later"
          >
            <Bookmark size={13} fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/practice?jobId=${result.job_id}`}
            onClick={e => e.stopPropagation()}
            className="p-1.5 rounded-lg text-slate-300 hover:text-purple-500 hover:bg-purple-50 transition-colors"
            aria-label="Practice interview"
          >
            <GraduationCap size={13} />
          </Link>
          <button
            onClick={handleExplore}
            className="btn-primary py-1 px-3 text-xs flex items-center gap-1"
          >
            Explore
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Tier row ─────────────────────────────────────────────────────────────────

function TierRow({
  tier,
  matches,
  userId,
  rankOffset,
  interactionMap,
}: {
  tier: typeof TIERS[number];
  matches: MatchResult[];
  userId: string;
  rankOffset: number;
  interactionMap: Map<string, JobInteraction>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const Icon = tier.icon;

  if (matches.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      aria-label={tier.label}
    >
      {/* Tier header */}
      <div className={`rounded-2xl bg-gradient-to-r ${tier.gradient} px-5 py-4 mb-4 flex items-center gap-3 ring-1 ${tier.ring}`}>
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-extrabold tracking-tight text-sm">{tier.label}</h2>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tier.countBg}`}>
              {matches.length}
            </span>
          </div>
          <p className="text-white/60 text-xs mt-0.5">{tier.sub}</p>
        </div>
      </div>

      {/* Horizontal scroll */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {matches.map((r, i) => (
          <div key={r.job_id} style={{ scrollSnapAlign: 'start' }}>
            <MatchCard
              result={r}
              rank={rankOffset + i + 1}
              userId={userId}
              interaction={interactionMap.get(r.job_id)}
            />
          </div>
        ))}
      </div>
    </motion.section>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="space-y-4">
      <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
      <div className="flex gap-3 overflow-hidden">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex-shrink-0 w-72 h-52 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ─── User Dashboard ───────────────────────────────────────────────────────────

function UserDashboard() {
  const { user, session } = useAuth();
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [interactionMap, setInteractionMap] = useState<Map<string, JobInteraction>>(new Map());
  const [topInsights, setTopInsights] = useState<MatchInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.userId) return;
    const currentUserId = session.userId;

    const cachedResults = getCachedMatches(currentUserId);
    if (cachedResults) {
      setMatches(cachedResults);
      if (cachedResults.length > 0) {
        setInsightsLoading(true);
        setInsightsError(null);
        api.getMatchInsights(currentUserId, cachedResults[0].job_id, 'seeker')
          .then(setTopInsights)
          .catch((err: unknown) => {
            setInsightsError(err instanceof Error ? err.message : String(err));
            setTopInsights(null);
          })
          .finally(() => setInsightsLoading(false));
      }
      return;
    }

    setLoading(true);
    Promise.all([
      api.getMatches(currentUserId),
      api.getJobInteractions(currentUserId).catch(() => ({ interactions: [] })),
    ])
      .then(([matchData, interactionData]) => {
        setMatches(matchData.results);
        setCachedMatches(currentUserId, matchData.results);
        setInteractionMap(new Map(interactionData.interactions.map(i => [i.job_id, i])));

        if (matchData.results.length > 0) {
          setInsightsLoading(true);
          setInsightsError(null);
          api.getMatchInsights(currentUserId, matchData.results[0].job_id, 'seeker')
            .then(setTopInsights)
            .catch((err: unknown) => {
              setInsightsError(err instanceof Error ? err.message : String(err));
              setTopInsights(null);
            })
            .finally(() => setInsightsLoading(false));
        } else {
          setTopInsights(null);
          setInsightsError(null);
        }
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session?.userId]);

  const grouped = matches
    ? {
      strong: matches.filter(m => scoreTier(m.total_score) === 'strong'),
      mid: matches.filter(m => scoreTier(m.total_score) === 'mid'),
      low: matches.filter(m => scoreTier(m.total_score) === 'low'),
    }
    : null;

  const strongCount = grouped?.strong.length ?? 0;
  const totalCount = matches?.length ?? 0;
  const topScore = matches && matches.length > 0 ? Math.round(matches[0].total_score * 100) : null;

  return (
    <>
      <title>Dashboard — Lumino</title>
      <div className="px-6 py-8 max-w-5xl mx-auto space-y-10">

        {/* ── Page header ── */}
        <header>
          <h1 className="text-3xl font-extrabold text-indigo-950 tracking-tight">
            Welcome back, {user?.name}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {loading
              ? 'Computing your personalized ranking intelligence...'
              : matches
                ? `${totalCount} roles ranked with transparent score breakdowns. ${strongCount} are ready-to-apply fits.`
                : 'Your ranked opportunities and improvement roadmap will appear here.'}
          </p>
        </header>

        {/* ── Quick stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: 'Top Score',
              value: topScore != null ? `${topScore}%` : '—',
              sub: 'best match',
              icon: CheckCircle2,
              color: 'text-emerald-500',
              bg: 'bg-emerald-50',
            },
            {
              label: 'High-Confidence',
              value: loading ? '…' : String(strongCount),
              sub: '≥72% fit',
              icon: Zap,
              color: 'text-blue-500',
              bg: 'bg-blue-50',
            },
            {
              label: 'Total Ranked',
              value: loading ? '…' : String(totalCount),
              sub: 'positions',
              icon: Briefcase,
              color: 'text-indigo-500',
              bg: 'bg-indigo-50',
            },
            {
              label: 'Digital Twin',
              value: 'Active',
              sub: 'LLM interpretation',
              icon: Network,
              color: 'text-purple-500',
              bg: 'bg-purple-50',
            },
          ].map(stat => (
            <motion.div
              key={stat.label}
              whileHover={{ y: -2 }}
              className="card-lumino p-4 flex items-center gap-3"
            >
              <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                <stat.icon size={16} className={stat.color} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">{stat.label}</p>
                <p className="text-xl font-extrabold text-indigo-950 leading-tight">{stat.value}</p>
                <p className="text-[10px] text-slate-400">{stat.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="alert-error" role="alert">
            <AlertCircle size={14} className="flex-shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* ── Top insight panel ── */}
        {(topInsights || insightsLoading || insightsError) && (
          <MatchInsightsPanel insights={topInsights} loading={insightsLoading} error={insightsError} />
        )}

        {/* ── Loading skeletons ── */}
        {loading && (
          <div className="space-y-8">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}

        {/* ── Search workspace CTA ── */}
        <AnimatePresence>
          {!loading && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-lumino p-6 sm:p-7 border-indigo-100"
              aria-label="Job search workspace"
            >
              {totalCount === 0 ? (
                <div className="text-center py-6">
                  <Briefcase size={40} className="mx-auto mb-3 text-slate-200" aria-hidden="true" />
                  <p className="text-slate-500 font-medium">No ranked opportunities yet</p>
                  <p className="text-sm text-slate-400 mt-1">Upload or refresh your profile so Lumino can generate explainable job matches.</p>
                  <Link to="/resume" className="btn-primary btn-sm inline-flex mt-4">Upload Resume</Link>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row lg:items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                    <Target size={22} className="text-blue-600" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-extrabold text-indigo-950 tracking-tight">Your ranked matches have moved to Job Search</h2>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                      Use keyword search, sorting, and advanced filters to work through all {totalCount} ranked opportunities in one dedicated workspace.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="badge badge-blue">{strongCount} high-confidence roles</span>
                      <span className="badge badge-green">Best match {topScore != null ? `${topScore}%` : 'N/A'}</span>
                      <span className="badge badge-gray">LinkedIn-style search flow</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to="/user/search" className="btn-primary">
                      Open Job Search
                    </Link>
                  </div>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Digital Twin CTA ── */}
        <section
          className="card-lumino p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5"
          aria-label="Digital Twin"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
            <Network size={24} className="text-indigo-500" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-indigo-950">AI Digital Twin Profile</h3>
            <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
              An LLM-generated interpretation of your skills, experience, and goals.
              Review and refine it to improve match accuracy and decision trust.
            </p>
          </div>
          <Link to="/user/model" className="btn-primary flex-shrink-0">
            Review Digital Twin →
          </Link>
        </section>

        {/* ── Practice CTA ── */}
        <div className="bg-indigo-950 rounded-2xl p-8 text-white relative overflow-hidden ring-1 ring-blue-500/20">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-2">Turn top matches into real offers</h2>
            <p className="text-indigo-300 mb-6 text-sm max-w-xs">
              Practice role-specific interview rounds with feedback linked to your current match gaps.
            </p>
            <Link
              to="/practice"
              className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-blue-500/20"
            >
              Start Practice Session
            </Link>
          </div>
          <div className="absolute -right-8 -bottom-8 opacity-[0.07] pointer-events-none" aria-hidden="true">
            <TrendingUp size={220} />
          </div>
        </div>

      </div>
    </>
  );
}

// ─── Recruiter Dashboard ──────────────────────────────────────────────────────

interface JobStat {
  jobId: string;
  candidates: CandidateResult[];
  loaded: boolean;
}

function ScoreDistributionBar({ buckets, max }: {
  buckets: { label: string; count: number; color: string }[];
  max: number;
}) {
  return (
    <div className="space-y-2">
      {buckets.map(b => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-12 text-right flex-shrink-0">{b.label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: b.color }}
              initial={{ width: 0 }}
              animate={{ width: max > 0 ? `${(b.count / max) * 100}%` : '0%' }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
            />
          </div>
          <span className="text-xs font-bold text-slate-700 w-6 flex-shrink-0">{b.count}</span>
        </div>
      ))}
    </div>
  );
}

function HiringFunnelChart({ stages }: {
  stages: { label: string; count: number; color: string; icon: React.ComponentType<{ size?: number }> }[];
}) {
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <div className="space-y-2">
      {stages.map((stage, i) => {
        const Icon = stage.icon;
        const pct = Math.round((stage.count / maxCount) * 100);
        return (
          <div key={stage.label} className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0`}
              style={{ backgroundColor: stage.color + '20' }}>
              <Icon size={14} style={{ color: stage.color }} />
            </div>
            <div className="flex-1 relative">
              <div className="bg-slate-100 rounded-lg h-8 overflow-hidden">
                <motion.div
                  className="h-full rounded-lg flex items-center px-3"
                  style={{ backgroundColor: stage.color + (i === 0 ? 'ff' : '99') }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.1 }}
                >
                  <span className="text-xs font-bold text-white truncate">{stage.count}</span>
                </motion.div>
              </div>
            </div>
            <span className="text-xs text-slate-500 w-24 flex-shrink-0">{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniScoreBar({ scores }: { scores: number[] }) {
  const bucketColors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];
  const buckets = [
    scores.filter(s => s < 0.3).length,
    scores.filter(s => s >= 0.3 && s < 0.5).length,
    scores.filter(s => s >= 0.5 && s < 0.7).length,
    scores.filter(s => s >= 0.7 && s < 0.85).length,
    scores.filter(s => s >= 0.85).length,
  ];
  const max = Math.max(...buckets, 1);

  return (
    <div className="flex items-end gap-0.5 h-8">
      {buckets.map((count, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-sm"
          style={{ backgroundColor: bucketColors[i] }}
          initial={{ height: 0 }}
          animate={{ height: `${(count / max) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.05 }}
        />
      ))}
    </div>
  );
}

function RecruiterDashboard() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobStats, setJobStats] = useState<Map<string, JobStat>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.userId) return;
    api.listJobs(session.userId)
      .then(data => {
        setJobs(data);
        setLoading(false);
        // Load candidates for first 6 jobs in parallel
        data.slice(0, 6).forEach(job => {
          api.getCandidates(job.id)
            .then((res: BatchCandidateResponse) => {
              setJobStats(prev => {
                const next = new Map(prev);
                next.set(job.id, { jobId: job.id, candidates: res.results, loaded: true });
                return next;
              });
            })
            .catch(() => {
              setJobStats(prev => {
                const next = new Map(prev);
                next.set(job.id, { jobId: job.id, candidates: [], loaded: true });
                return next;
              });
            });
        });
      })
      .catch(() => setLoading(false));
  }, [session?.userId]);

  // Aggregate stats
  const allCandidates = [...jobStats.values()].flatMap(s => s.candidates);
  const totalCandidates = allCandidates.length;
  const highMatchCount = allCandidates.filter(c => c.total_score >= 0.72).length;
  const loadedJobCount = [...jobStats.values()].filter(s => s.loaded).length;
  const avgTopScore = loadedJobCount > 0
    ? Math.round(
      [...jobStats.values()]
        .filter(s => s.candidates.length > 0)
        .reduce((acc, s) => acc + (s.candidates[0]?.total_score ?? 0), 0) /
      Math.max([...jobStats.values()].filter(s => s.candidates.length > 0).length, 1) * 100
    )
    : 0;

  // Score distribution buckets across all candidates
  const allScores = allCandidates.map(c => c.total_score);
  const scoreBuckets = [
    { label: '<30%', count: allScores.filter(s => s < 0.3).length, color: '#ef4444' },
    { label: '30–50%', count: allScores.filter(s => s >= 0.3 && s < 0.5).length, color: '#f59e0b' },
    { label: '50–70%', count: allScores.filter(s => s >= 0.5 && s < 0.7).length, color: '#3b82f6' },
    { label: '70–85%', count: allScores.filter(s => s >= 0.7 && s < 0.85).length, color: '#10b981' },
    { label: '85%+', count: allScores.filter(s => s >= 0.85).length, color: '#8b5cf6' },
  ];
  const maxBucket = Math.max(...scoreBuckets.map(b => b.count), 1);

  // Hiring funnel
  const funnelStages = [
    { label: 'Total Candidates', count: totalCandidates, color: '#6366f1', icon: Users },
    { label: 'Viable (≥44%)', count: allCandidates.filter(c => c.total_score >= 0.44).length, color: '#3b82f6', icon: Target },
    { label: 'High-Confidence', count: highMatchCount, color: '#10b981', icon: Star },
    { label: 'Top Tier (≥85%)', count: allCandidates.filter(c => c.total_score >= 0.85).length, color: '#8b5cf6', icon: Zap },
  ];

  const kpiCards = [
    {
      label: 'Active Roles',
      value: loading ? '—' : String(jobs.length),
      sub: 'open positions',
      icon: Briefcase,
      color: '#6366f1',
      bg: 'bg-indigo-50',
      textColor: 'text-indigo-600',
    },
    {
      label: 'Candidates Ranked',
      value: totalCandidates > 0 ? String(totalCandidates) : loadedJobCount > 0 ? '0' : '—',
      sub: `across ${loadedJobCount} jobs`,
      icon: Users,
      color: '#3b82f6',
      bg: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      label: 'High-Confidence Fits',
      value: totalCandidates > 0 ? String(highMatchCount) : loadedJobCount > 0 ? '0' : '—',
      sub: '≥72% match score',
      icon: Star,
      color: '#10b981',
      bg: 'bg-emerald-50',
      textColor: 'text-emerald-600',
    },
    {
      label: 'Avg Top Match',
      value: avgTopScore > 0 ? `${avgTopScore}%` : '—',
      sub: 'best candidate/role',
      icon: TrendingUp,
      color: '#f59e0b',
      bg: 'bg-amber-50',
      textColor: 'text-amber-600',
    },
  ];

  return (
    <>
      <title>Hiring Dashboard — Lumino</title>
      <div className="px-6 py-8 max-w-7xl mx-auto space-y-8">

        {/* ── Header ── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-8 bg-gradient-to-b from-indigo-500 to-blue-600 rounded-full" />
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                Hiring Intelligence
              </h1>
            </div>
            <p className="text-slate-500 ml-5 text-sm">
              Welcome back, <span className="font-semibold text-slate-700">{user?.name}</span>. Prioritize candidates with transparent fit signals.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-5 sm:ml-0">
            <button
              onClick={() => navigate('/jobs/create')}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Plus size={14} /> Publish Role
            </button>
            <button
              onClick={() => navigate('/jobs')}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Briefcase size={14} /> View Jobs
            </button>
          </div>
        </header>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -3 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                  <card.icon size={18} style={{ color: card.color }} />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${card.textColor} bg-opacity-10 px-2 py-1 rounded-full`}
                  style={{ backgroundColor: card.color + '15' }}>
                  LIVE
                </span>
              </div>
              <p className="text-3xl font-black text-gray-900 leading-none mb-1">{card.value}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wide">{card.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{card.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Main content grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column: Hiring Funnel + Score Distribution ── */}
          <div className="lg:col-span-1 space-y-6">

            {/* Hiring Funnel */}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
            >
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1.5 h-5 bg-gradient-to-b from-indigo-500 to-blue-500 rounded-full" />
                <h2 className="text-sm font-bold text-gray-800 tracking-tight">Candidate Funnel</h2>
              </div>
              {totalCandidates === 0 && loadedJobCount === 0 ? (
                <div className="text-center py-6">
                  <Users size={32} className="mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">Rank candidates to see funnel</p>
                </div>
              ) : (
                <HiringFunnelChart stages={funnelStages} />
              )}
            </motion.div>

            {/* Score Distribution */}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
            >
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1.5 h-5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full" />
                <h2 className="text-sm font-bold text-gray-800 tracking-tight">Score Distribution</h2>
              </div>
              {allScores.length === 0 ? (
                <div className="text-center py-6">
                  <Target size={32} className="mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">No ranked candidates yet</p>
                </div>
              ) : (
                <ScoreDistributionBar buckets={scoreBuckets} max={maxBucket} />
              )}
              {allScores.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-black text-gray-900">{Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length * 100)}%</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg Score</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-emerald-600">{Math.round(Math.max(...allScores) * 100)}%</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Best</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-indigo-600">{highMatchCount}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Ready</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          {/* ── Right column: Per-job performance ── */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-full"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-5 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
                  <h2 className="text-sm font-bold text-gray-800 tracking-tight">Role Performance</h2>
                </div>
                <button
                  onClick={() => navigate('/jobs')}
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 transition-colors"
                >
                  All Jobs <ArrowRight size={12} />
                </button>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase size={40} className="mx-auto mb-3 text-slate-200" />
                  <p className="text-slate-500 font-medium">No roles posted yet</p>
                  <p className="text-sm text-slate-400 mt-1">Post your first role to start ranking candidates.</p>
                  <button
                    onClick={() => navigate('/jobs/create')}
                    className="btn-primary btn-sm mt-4 inline-flex items-center gap-1.5"
                  >
                    <Plus size={13} /> Post First Role
                  </button>
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1">
                  {jobs.map((job, i) => {
                    const stat = jobStats.get(job.id);
                    const topScore = stat?.candidates[0]?.total_score ?? null;
                    const candidateCount = stat?.candidates.length ?? 0;
                    const scores = stat?.candidates.map(c => c.total_score) ?? [];
                    const highCount = scores.filter(s => s >= 0.72).length;

                    return (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + i * 0.06 }}
                        className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all cursor-pointer"
                        onClick={() => navigate(`/talent-pool/${job.id}`)}
                      >
                        {/* Rank */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : i === 2 ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                          {i + 1}
                        </div>

                        {/* Job info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                                {job.title ?? job.id}
                              </h3>
                              <div className="flex items-center gap-2 mt-0.5">
                                {job.company && (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Building2 size={10} /> {job.company}
                                  </span>
                                )}
                                {job.remote_policy && (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <MapPin size={10} /> {job.remote_policy}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Top score badge */}
                            {topScore !== null && (
                              <div className={`text-xs font-black px-2 py-1 rounded-lg flex-shrink-0 ${topScore >= 0.72 ? 'bg-emerald-100 text-emerald-700' : topScore >= 0.44 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                {Math.round(topScore * 100)}%
                              </div>
                            )}
                          </div>

                          {/* Stats row */}
                          <div className="flex items-center gap-3 mt-2">
                            {stat?.loaded ? (
                              <>
                                <span className="text-[11px] text-slate-500">
                                  <span className="font-bold text-gray-700">{candidateCount}</span> candidates
                                </span>
                                {highCount > 0 && (
                                  <span className="text-[11px] text-emerald-600 font-semibold">
                                    {highCount} high-fit
                                  </span>
                                )}
                                {scores.length > 0 && (
                                  <div className="flex-1 max-w-[80px]">
                                    <MiniScoreBar scores={scores} />
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-400 animate-pulse">Loading candidates…</span>
                            )}
                          </div>
                        </div>

                        {/* Arrow */}
                        <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* ── Bottom row: Quick actions + top skills gap ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Quick actions */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-indigo-600 to-blue-600 rounded-2xl p-6 text-white relative overflow-hidden"
          >
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-1">Quick Actions</h3>
              <p className="text-indigo-200 text-sm mb-5">Jump back into your hiring workflow.</p>
              <div className="space-y-2">
                <button
                  onClick={() => navigate('/jobs/create')}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Plus size={16} /> Post a New Role
                </button>
                <button
                  onClick={() => navigate('/jobs')}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Briefcase size={16} /> Manage All Jobs
                </button>
              </div>
            </div>
            <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none">
              <Network size={140} />
            </div>
          </motion.div>

          {/* Top missing skills across pool */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-5 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full" />
              <h3 className="text-sm font-bold text-gray-800">Most Common Skill Gaps</h3>
            </div>
            {allCandidates.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No data yet — rank candidates first</p>
              </div>
            ) : (() => {
              const gapCounts = new Map<string, number>();
              allCandidates.forEach(c => {
                c.missing_skills?.forEach(skill => {
                  gapCounts.set(skill, (gapCounts.get(skill) ?? 0) + 1);
                });
              });
              const topGaps = [...gapCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6);
              const maxGap = topGaps[0]?.[1] ?? 1;

              return (
                <div className="space-y-2">
                  {topGaps.map(([skill, count]) => (
                    <div key={skill} className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 w-28 truncate flex-shrink-0 font-medium">{skill}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / maxGap) * 100}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-500 w-4 text-right">{count}</span>
                    </div>
                  ))}
                  {topGaps.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">No skill gaps found</p>
                  )}
                </div>
              );
            })()}
          </motion.div>
        </div>

      </div>
    </>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboardWidget() {
  return (
    <div className="p-6 sm:p-8 max-w-6xl">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-indigo-950 tracking-tight">System Administration</h1>
        <p className="mt-3 text-lg text-slate-500">Platform observability, trust, and lifecycle controls.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Graph Nodes', value: '45,201', color: 'text-indigo-950' },
          { label: 'API Latency', value: '124ms', color: 'text-emerald-500' },
          { label: 'Active Sessions', value: '892', color: 'text-indigo-950' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{s.label}</h3>
            <span className={`text-4xl font-black ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <Link to="/admin" className="btn-primary btn-lg">Go to Admin Console →</Link>
      </div>
    </div>
  );
}

// ─── Role-aware entry point ───────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'RECRUITER') return <RecruiterDashboard />;
  if (user?.role === 'ADMIN') return <AdminDashboardWidget />;
  return <UserDashboard />;
}
