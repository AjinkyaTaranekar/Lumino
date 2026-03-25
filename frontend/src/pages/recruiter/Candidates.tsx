import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Network,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingOverlay from '../../components/LoadingOverlay';
import ScoreBar from '../../components/ScoreBar';
import SkillBadge from '../../components/SkillBadge';
import { api } from '../../lib/api';
import type { AppliedCandidate, CandidateResult } from '../../lib/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function rankLabel(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `${rank}th`;
}

function scoreColor(score: number): string {
  if (score >= 0.7) return 'text-emerald-600';
  if (score >= 0.4) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 0.7) return 'bg-emerald-50 border-emerald-100';
  if (score >= 0.4) return 'bg-amber-50 border-amber-100';
  return 'bg-red-50 border-red-100';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── CultureBadge ──────────────────────────────────────────────────────────

interface CultureBadgeProps {
  label: string;
  value: number | undefined;
}

function CultureBadge({ label, value }: CultureBadgeProps) {
  const pct = Math.round((value ?? 0) * 100);
  const cls =
    (value ?? 0) >= 0.7
      ? 'badge badge-green'
      : (value ?? 0) > 0
        ? 'badge badge-orange'
        : 'badge badge-gray';
  return (
    <span className={cls}>
      {label}: {pct}%
    </span>
  );
}

// ── CandidateCard ─────────────────────────────────────────────────────────

interface CandidateCardProps {
  result: CandidateResult;
  rank: number;
  jobId: string;
}

function CandidateCard({ result, rank, jobId }: CandidateCardProps) {
  const navigate = useNavigate();
  const isTopRank = rank <= 3;
  const scorePct = Math.round(result.total_score * 100);
  const avatarSeed = encodeURIComponent(result.user_id);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="card-lumino p-5 fade-in"
      role="article"
      aria-label={`Candidate ${result.user_id}, rank ${rank}`}
    >
      {/* ── Top row ── */}
      <div className="flex items-start gap-4 mb-5">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <img
            src={`https://picsum.photos/seed/${avatarSeed}/100/100`}
            alt={`Avatar for candidate ${result.user_id}`}
            className="w-12 h-12 rounded-full object-cover border-2 border-slate-100"
          />
          <span
            aria-label={`Rank ${rank}`}
            className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-white
              ${isTopRank ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            {rank <= 3 ? <Trophy className="w-3 h-3" aria-hidden="true" /> : rank}
          </span>
        </div>

        {/* Identity + rank label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm text-indigo-950 truncate">{result.user_id}</h3>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isTopRank
                  ? 'bg-primary-50 text-primary-600 border-primary-100'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}
            >
              {rankLabel(rank)}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Candidate</p>
        </div>

        {/* Score circle */}
        <div
          className={`flex-shrink-0 w-14 h-14 rounded-2xl border flex flex-col items-center justify-center ${scoreBg(result.total_score)}`}
          aria-label={`Match score: ${scorePct}%`}
        >
          <span className={`text-lg font-bold leading-none ${scoreColor(result.total_score)}`}>
            {scorePct}
          </span>
          <span className="text-[9px] text-slate-400 mt-0.5">%</span>
        </div>
      </div>

      {/* ── Score bars ── */}
      <div className="space-y-2 mb-4">
        <ScoreBar label="Overall Match" score={result.total_score} large />
        <div className="grid grid-cols-2 gap-3 mt-2">
          <ScoreBar label="Skills (65%)" score={result.skill_score} />
          <ScoreBar label="Domain (35%)" score={result.domain_score} />
          {result.optional_skill_score != null && result.optional_skill_score > 0 && (
            <ScoreBar label="Optional Skills" score={result.optional_skill_score} />
          )}
        </div>
      </div>

      {/* ── Culture badges ── */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <CultureBadge label="Culture fit" value={result.culture_bonus} />
        <CultureBadge label="Preferences" value={result.preference_bonus} />
      </div>

      {/* ── Matched skills ── */}
      {result.matched_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1" aria-label="Matched skills">
          {result.matched_skills.slice(0, 6).map(s => (
            <SkillBadge key={s} label={s} variant="match" />
          ))}
          {result.matched_skills.length > 6 && (
            <SkillBadge label={`+${result.matched_skills.length - 6} more`} variant="neutral" />
          )}
        </div>
      )}

      {/* ── Missing skills ── */}
      {result.missing_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3" aria-label="Missing skills">
          {result.missing_skills.slice(0, 4).map(s => (
            <SkillBadge key={s} label={s} variant="missing" />
          ))}
        </div>
      )}

      {/* ── Explanation ── */}
      {result.explanation && (
        <p className="text-xs text-slate-400 italic mb-4 leading-relaxed">{result.explanation}</p>
      )}

      {/* ── CTA ── */}
      <button
        onClick={() =>
          navigate(`/user/match/${jobId}`, { state: { viewAs: result.user_id } })
        }
        aria-label={`View match details for ${result.user_id}`}
        className="btn-primary btn-sm w-full flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300 mt-1"
      >
        View Match Details <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </motion.div>
  );
}

// ── AppliedCandidateCard ───────────────────────────────────────────────────

interface AppliedCandidateCardProps {
  result: AppliedCandidate;
  rank: number;
  jobId: string;
}

function AppliedCandidateCard({ result, rank, jobId }: AppliedCandidateCardProps) {
  const navigate = useNavigate();
  const hasScore = result.total_score != null;
  const scorePct = hasScore ? Math.round(result.total_score! * 100) : null;
  const avatarSeed = encodeURIComponent(result.user_id);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="card-lumino p-5 fade-in"
      role="article"
      aria-label={`Applicant ${result.user_id}`}
    >
      {/* ── Top row ── */}
      <div className="flex items-start gap-4 mb-4">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <img
            src={`https://picsum.photos/seed/${avatarSeed}/100/100`}
            alt={`Avatar for ${result.user_id}`}
            className="w-12 h-12 rounded-full object-cover border-2 border-slate-100"
          />
          <span
            aria-label={`Rank ${rank}`}
            className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-white
              ${rank <= 3 ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            {rank <= 3 ? <Trophy className="w-3 h-3" aria-hidden="true" /> : rank}
          </span>
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-indigo-950 truncate">{result.user_id}</h3>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
            <CalendarDays size={10} aria-hidden="true" />
            Applied {formatDate(result.applied_at)}
          </p>
        </div>

        {/* Score circle or unavailable */}
        {hasScore ? (
          <div
            className={`flex-shrink-0 w-14 h-14 rounded-2xl border flex flex-col items-center justify-center ${scoreBg(result.total_score!)}`}
            aria-label={`Match score: ${scorePct}%`}
          >
            <span className={`text-lg font-bold leading-none ${scoreColor(result.total_score!)}`}>
              {scorePct}
            </span>
            <span className="text-[9px] text-slate-400 mt-0.5">%</span>
          </div>
        ) : (
          <div className="flex-shrink-0 w-14 h-14 rounded-2xl border border-slate-100 bg-slate-50 flex flex-col items-center justify-center">
            <span className="text-[9px] text-slate-400 text-center leading-tight px-1">No score</span>
          </div>
        )}
      </div>

      {/* ── Score bars (only if scored) ── */}
      {hasScore && (
        <div className="space-y-2 mb-4">
          <ScoreBar label="Overall Match" score={result.total_score!} large />
          <div className="grid grid-cols-2 gap-3 mt-2">
            {result.skill_score != null && <ScoreBar label="Skills (65%)" score={result.skill_score} />}
            {result.domain_score != null && <ScoreBar label="Domain (35%)" score={result.domain_score} />}
          </div>
        </div>
      )}

      {/* ── Culture badges ── */}
      {hasScore && (
        <div className="flex gap-2 mb-3 flex-wrap">
          <CultureBadge label="Culture fit" value={result.culture_bonus} />
          <CultureBadge label="Preferences" value={result.preference_bonus} />
        </div>
      )}

      {/* ── Matched skills ── */}
      {result.matched_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1" aria-label="Matched skills">
          {result.matched_skills.slice(0, 6).map(s => (
            <SkillBadge key={s} label={s} variant="match" />
          ))}
          {result.matched_skills.length > 6 && (
            <SkillBadge label={`+${result.matched_skills.length - 6} more`} variant="neutral" />
          )}
        </div>
      )}

      {/* ── Missing skills ── */}
      {result.missing_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3" aria-label="Missing skills">
          {result.missing_skills.slice(0, 4).map(s => (
            <SkillBadge key={s} label={s} variant="missing" />
          ))}
        </div>
      )}

      {/* ── CTA ── */}
      <button
        onClick={() =>
          navigate(`/user/match/${jobId}`, { state: { viewAs: result.user_id } })
        }
        aria-label={`View match details for ${result.user_id}`}
        className="btn-primary btn-sm w-full flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300 mt-1"
      >
        View Match Details <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

type CandidateTab = 'all' | 'applied';

export default function Candidates() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  // All candidates tab
  const [candidates, setCandidates] = useState<CandidateResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Applied candidates tab
  const [activeTab, setActiveTab] = useState<CandidateTab>('all');
  const [appliedCandidates, setAppliedCandidates] = useState<AppliedCandidate[] | null>(null);
  const [appliedLoading, setAppliedLoading] = useState(false);
  const [appliedError, setAppliedError] = useState<string | null>(null);

  async function handleFind() {
    if (!jobId) return;
    setError(null);
    setLoading(true);
    try {
      const data = await api.getCandidates(jobId);
      const sorted = [...data.results].sort((a, b) => b.total_score - a.total_score);
      setCandidates(sorted);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch candidates.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFindApplicants() {
    if (!jobId) return;
    setAppliedError(null);
    setAppliedLoading(true);
    try {
      const data = await api.getJobApplicants(jobId);
      const sorted = [...data.applicants].sort((a, b) => {
        if (a.total_score != null && b.total_score != null) return b.total_score - a.total_score;
        if (a.total_score != null) return -1;
        if (b.total_score != null) return 1;
        return 0;
      });
      setAppliedCandidates(sorted);
    } catch (err: unknown) {
      setAppliedError(err instanceof Error ? err.message : 'Failed to fetch applicants.');
    } finally {
      setAppliedLoading(false);
    }
  }

  return (
    <>
      <title>Candidates - Lumino</title>
      {(loading || appliedLoading) && (
        <LoadingOverlay message={loading ? 'Finding matching candidates…' : 'Loading applicants…'} />
      )}

      <div className="px-6 py-8 max-w-4xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate('/recruiter/candidates')}
              aria-label="Back to Talent Pool"
              className="btn-ghost btn-sm flex items-center gap-1.5 mt-0.5 focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-indigo-950">
                  Candidates
                </h1>
                <span className="badge badge-blue font-mono text-xs">{jobId}</span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                {activeTab === 'all'
                  ? candidates
                    ? `${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} ranked by match score`
                    : 'Click to find matching candidates'
                  : appliedCandidates
                    ? `${appliedCandidates.length} applicant${appliedCandidates.length !== 1 ? 's' : ''}`
                    : 'Loading applicants…'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => navigate(`/recruiter/model/${jobId}`)}
              className="btn-secondary btn-sm focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              View Job Model
            </button>
            {activeTab === 'all' && (
              <button
                onClick={handleFind}
                disabled={loading}
                className="btn-primary btn-sm flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary-300"
                aria-busy={loading}
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                Find Matching Candidates
              </button>
            )}
          </div>
        </div>

        {/* ── Tab toggle ── */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6 w-fit">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'all'
                ? 'bg-white text-indigo-950 shadow-sm'
                : 'text-slate-500 hover:text-indigo-950'
            }`}
          >
            All Candidates
          </button>
          <button
            onClick={() => {
              setActiveTab('applied');
              if (!appliedCandidates) handleFindApplicants();
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'applied'
                ? 'bg-white text-indigo-950 shadow-sm'
                : 'text-slate-500 hover:text-indigo-950'
            }`}
          >
            Applied
            {appliedCandidates != null && (
              <span className="text-xs bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded-full">
                {appliedCandidates.length}
              </span>
            )}
          </button>
        </div>

        {/* ── All Candidates tab ── */}
        {activeTab === 'all' && (
          <>
            {error && (
              <div role="alert" className="alert-error mb-6">
                {error}
              </div>
            )}

            {candidates && (
              <div role="list" aria-label="Ranked candidates" className="space-y-4">
                {candidates.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
                      <Users className="w-7 h-7 text-slate-300" aria-hidden="true" />
                    </div>
                    <p className="text-slate-600 font-medium mb-1">No candidates found</p>
                    <p className="text-sm text-slate-400">
                      No candidate profiles in the system yet.
                    </p>
                  </div>
                ) : (
                  candidates.map((c, i) => (
                    <CandidateCard key={c.user_id} result={c} rank={i + 1} jobId={jobId!} />
                  ))
                )}
              </div>
            )}

            {!candidates && !loading && (
              <div className="text-center py-24">
                <div className="w-16 h-16 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mx-auto mb-4">
                  <Network className="w-8 h-8 text-primary-500" aria-hidden="true" />
                </div>
                <p className="text-indigo-950 font-semibold mb-2">
                  Ready to match candidates
                </p>
                <p className="text-sm text-slate-500 mb-1">
                  Click "Find Matching Candidates" to rank all profiles against this job.
                </p>
                <p className="text-xs text-slate-400">
                  Each candidate is scored using skills (65%) and domain (35%) graph analysis.
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Applied tab ── */}
        {activeTab === 'applied' && (
          <>
            {appliedError && (
              <div role="alert" className="alert-error mb-6">
                {appliedError}
              </div>
            )}

            {appliedCandidates && (
              <div role="list" aria-label="Applied candidates" className="space-y-4">
                {appliedCandidates.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
                      <Users className="w-7 h-7 text-slate-300" aria-hidden="true" />
                    </div>
                    <p className="text-slate-600 font-medium mb-1">No applicants yet</p>
                    <p className="text-sm text-slate-400">
                      Candidates who apply to this job will appear here.
                    </p>
                  </div>
                ) : (
                  appliedCandidates.map((c, i) => (
                    <AppliedCandidateCard key={c.user_id} result={c} rank={i + 1} jobId={jobId!} />
                  ))
                )}
              </div>
            )}

            {!appliedCandidates && !appliedLoading && (
              <div className="text-center py-24">
                <div className="w-16 h-16 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mx-auto mb-4">
                  <Network className="w-8 h-8 text-primary-500" aria-hidden="true" />
                </div>
                <p className="text-indigo-950 font-semibold mb-2">Loading applicants…</p>
              </div>
            )}
          </>
        )}

      </div>
    </>
  );
}
