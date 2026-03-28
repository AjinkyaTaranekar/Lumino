import { AlertCircle, Bookmark, Briefcase, Building2, CheckCircle2, GraduationCap, Heart, Network, Plus, Target, ThumbsDown, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import JobTagBadge from '../components/JobTagBadge';
import ScoreBar from '../components/ScoreBar';
import SkillBadge from '../components/SkillBadge';
import { useAuth } from '../context/AuthContext';
import { trackEvent } from '../lib/analytics';
import { api } from '../lib/api';
import type { JobInteraction, MatchResult } from '../lib/types';

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIERS = [
  {
    id: 'strong',
    label: 'Absolute Match',
    sub: 'You\'re built for these roles',
    icon: Zap,
    min: 0.72,
    gradient: 'from-indigo-950 to-blue-900',
    ring: 'ring-blue-400/30',
    countBg: 'bg-white/10 text-white',
  },
  {
    id: 'mid',
    label: 'Solid Contenders',
    sub: 'Worth a closer look',
    icon: Target,
    min: 0.44,
    gradient: 'from-amber-600 to-orange-500',
    ring: 'ring-amber-400/30',
    countBg: 'bg-white/15 text-white',
  },
  {
    id: 'low',
    label: 'Long Shots',
    sub: 'Stretch goals — gap analysis inside',
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
      whileHover={{ y: -4, boxShadow: '0 12px 32px -8px rgba(15,23,63,0.15)' }}
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
            <circle cx="24" cy="24" r={r} fill="none" stroke="#f1f5f9" strokeWidth="4" />
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
        {result.culture_fit_score != null && (
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.userId) return;
    setLoading(true);
    Promise.all([
      api.getMatches(session.userId),
      api.getJobInteractions(session.userId).catch(() => ({ interactions: [] })),
    ])
      .then(([matchData, interactionData]) => {
        setMatches(matchData.results);
        setInteractionMap(new Map(interactionData.interactions.map(i => [i.job_id, i])));
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session?.userId]);

  // Group into tiers
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
              ? 'Computing your personalised match rankings…'
              : matches
                ? `${totalCount} jobs ranked · ${strongCount} absolute match${strongCount !== 1 ? 'es' : ''}`
                : 'Your job recommendations will appear here.'}
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
              label: 'Absolute Matches',
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
              sub: 'knowledge graph',
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

        {/* ── Loading skeletons ── */}
        {loading && (
          <div className="space-y-8">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}

        {/* ── Tier rows ── */}
        <AnimatePresence>
          {grouped && !loading && (
            <div className="space-y-8">
              {TIERS.map((tier, ti) => {
                const tierMatches = grouped[tier.id];
                const offset = TIERS.slice(0, ti).reduce((acc, t) => acc + grouped[t.id].length, 0);
                return (
                  <TierRow
                    key={tier.id}
                    tier={tier}
                    matches={tierMatches}
                    userId={session?.userId ?? ''}
                    rankOffset={offset}
                    interactionMap={interactionMap}
                  />
                );
              })}

              {totalCount === 0 && (
                <div className="card-lumino p-16 text-center">
                  <Briefcase size={40} className="mx-auto mb-3 text-slate-200" aria-hidden="true" />
                  <p className="text-slate-500 font-medium">No matches found yet</p>
                  <p className="text-sm text-slate-400 mt-1">Upload your resume to build your knowledge graph first.</p>
                  <Link to="/resume" className="btn-primary btn-sm inline-flex mt-4">Upload Resume</Link>
                </div>
              )}
            </div>
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
            <h3 className="text-base font-bold text-indigo-950">Knowledge Graph Profile</h3>
            <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
              Your skills, experience, and goals modelled as a semantic graph. Explore and refine to improve match accuracy.
            </p>
          </div>
          <Link to="/user/model" className="btn-primary flex-shrink-0">
            View Digital Twin →
          </Link>
        </section>

        {/* ── Practice CTA ── */}
        <div className="bg-indigo-950 rounded-2xl p-8 text-white relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-2">Ready for your next interview?</h2>
            <p className="text-indigo-300 mb-6 text-sm max-w-xs">
              The AI interviewer is ready. Practice against the exact jobs you matched.
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

function RecruiterDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const stats = [
    { label: 'Interviews Today', value: '8', color: 'text-indigo-950' },
    { label: 'High Match', value: '42', color: 'text-blue-500' },
    { label: 'Time to Hire', value: '14d', color: 'text-indigo-950' },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-6xl">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-indigo-950 tracking-tight">Recruiter Portal</h1>
        <p className="mt-3 text-lg text-slate-500">Welcome back, {user?.name}.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        {stats.map(s => (
          <motion.div key={s.label} whileHover={{ y: -2 }} className="stat-card">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{s.label}</h3>
            <span className={`text-4xl font-black ${s.color}`}>{s.value}</span>
          </motion.div>
        ))}
      </div>

      <motion.div whileHover={{ y: -2 }} className="card-lumino p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
            <Briefcase size={24} className="text-primary-500" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-indigo-950">Manage Job Openings</h2>
            <p className="text-sm text-slate-400 mt-0.5">View your postings, browse candidates, and manage your pipeline.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button onClick={() => navigate('/jobs/create')} className="btn-secondary flex items-center gap-1.5">
            <Plus size={14} aria-hidden="true" /> Post a Job
          </button>
          <button onClick={() => navigate('/jobs')} className="btn-primary flex items-center gap-1.5">
            <Briefcase size={14} aria-hidden="true" /> My Jobs
          </button>
        </div>
      </motion.div>
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
