import {
    Bookmark,
    BookmarkCheck,
    Briefcase,
    Building2,
    ChevronDown,
    ChevronUp,
    Filter,
    GraduationCap,
    Heart,
    Info,
    MapPin,
    RefreshCw,
    Search,
    Sparkles,
    ThumbsDown,
    X,
    Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import JobTagBadge from '../../components/JobTagBadge';
import SkillBadge from '../../components/SkillBadge';
import { useAuth } from '../../context/AuthContext';
import { trackEvent } from '../../lib/analytics';
import { api } from '../../lib/api';
import { getCachedMatches, setCachedMatches } from '../../lib/matchCache';
import type { Job, MatchResult } from '../../lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────
type ScoreBand = 'all' | 'strong' | 'viable' | 'stretch';
type InterestFilter = 'all' | 'high' | 'matched_tags';
type SkillGapFilter = 'any' | 'none' | 'small' | 'large';
type SortBy = 'match' | 'interest' | 'fewest_gaps' | 'company';

interface InteractionState { liked: boolean; disliked: boolean; bookmarked: boolean }
type InteractionMap = Record<string, InteractionState>;

interface EnrichedMatch extends MatchResult {
    remote_policy?: Job['remote_policy'];
    company_size?: string;
    experience_years_min?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toInteractionMap(
    interactions: Array<{ job_id: string; liked: boolean; disliked: boolean; bookmarked: boolean }>,
): InteractionMap {
    return interactions.reduce<InteractionMap>((acc, curr) => {
        acc[curr.job_id] = { liked: curr.liked, disliked: curr.disliked, bookmarked: curr.bookmarked };
        return acc;
    }, {});
}

function scoreMeta(score: number): { label: string; bar: string; text: string; bg: string; border: string; accent: string } {
    if (score >= 0.72) return {
        label: 'Strong match',
        bar: 'bg-emerald-500',
        text: 'text-emerald-700',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        accent: 'bg-emerald-500',
    };
    if (score >= 0.44) return {
        label: 'Good match',
        bar: 'bg-amber-500',
        text: 'text-amber-700',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        accent: 'bg-amber-400',
    };
    return {
        label: 'Stretch',
        bar: 'bg-rose-400',
        text: 'text-rose-700',
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        accent: 'bg-rose-400',
    };
}

function remoteBadge(policy?: Job['remote_policy']): string {
    if (policy === 'remote') return 'badge-green';
    if (policy === 'hybrid') return 'badge-orange';
    if (policy === 'onsite') return 'badge-blue';
    return 'badge-gray';
}

// ── Sub-score pill ────────────────────────────────────────────────────────────
function ScorePill({ label, score }: { label: string; score: number | null | undefined }) {
    if (score == null) return null;
    const pct = Math.round(score * 100);
    const cls = pct >= 70
        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
        : pct >= 40
            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
            : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
            {label} <span className="font-black">{pct}%</span>
        </span>
    );
}

// ── Arc score ring ────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
    const pct = Math.round(score * 100);
    const r = 22;
    const circ = 2 * Math.PI * r;
    const fill = (score * circ);
    const meta = scoreMeta(score);
    const strokeColor = score >= 0.72 ? '#10b981' : score >= 0.44 ? '#f59e0b' : '#f43f5e';
    return (
        <div className="relative flex-shrink-0 w-16 h-16 flex items-center justify-center">
            <svg width="64" height="64" className="-rotate-90">
                <circle cx="32" cy="32" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
                <circle
                    cx="32" cy="32" r={r} fill="none"
                    stroke={strokeColor} strokeWidth="5"
                    strokeDasharray={`${fill} ${circ}`}
                    strokeLinecap="round"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-sm font-black leading-none ${meta.text}`}>{pct}%</span>
                <span className="text-[8px] text-slate-400 font-semibold leading-none mt-0.5">match</span>
            </div>
        </div>
    );
}

// ── Filter sidebar section ────────────────────────────────────────────────────
function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{title}</p>
            {children}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JobSearch() {
    const { session } = useAuth();
    const navigate = useNavigate();
    const userId = session?.userId ?? '';

    // Data
    const [matches, setMatches] = useState<MatchResult[] | null>(null);
    const [jobMetaById, setJobMetaById] = useState<Record<string, Job>>({});
    const [interactionMap, setInteractionMap] = useState<InteractionMap>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Semantic search
    const [searchResults, setSearchResults] = useState<MatchResult[] | null>(null);
    const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // UI state
    const [showFilters, setShowFilters] = useState(false);

    // Filters
    const [query, setQuery] = useState('');
    const [scoreBand, setScoreBand] = useState<ScoreBand>('all');
    const [remotePolicy, setRemotePolicy] = useState<'all' | 'remote' | 'hybrid' | 'onsite'>('all');
    const [interestFilter, setInterestFilter] = useState<InterestFilter>('all');
    const [skillGapFilter, setSkillGapFilter] = useState<SkillGapFilter>('any');
    const [sortBy, setSortBy] = useState<SortBy>('match');
    const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
    const [hideDismissed, setHideDismissed] = useState(true);
    const [companySizeFilter, setCompanySizeFilter] = useState<string>('all');
    const [minExperience, setMinExperience] = useState<string>('any');

    const isSearchMode = query.trim().length > 0;

    // ── Load base matches ───────────────────────────────────────────────────
    async function loadMatches() {
        if (!userId) return;
        setLoading(true);
        setError(null);
        const cached = getCachedMatches(userId);
        if (cached) setMatches(cached);

        try {
            const base = cached ? Promise.resolve({ results: cached }) : api.getMatches(userId);
            const [matchData, interactionsData, jobsData] = await Promise.all([
                base,
                api.getJobInteractions(userId).catch(() => ({ interactions: [] })),
                api.listJobs().catch(() => [] as Job[]),
            ]);
            setMatches(matchData.results);
            setCachedMatches(userId, matchData.results);
            setInteractionMap(toInteractionMap(interactionsData.interactions));
            setJobMetaById(
                jobsData.reduce<Record<string, Job>>((acc, j) => { acc[j.id] = j; return acc; }, {}),
            );
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load matches.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadMatches(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Debounced semantic search ───────────────────────────────────────────
    useEffect(() => {
        if (!isSearchMode || !userId) {
            setSearchResults(null);
            setSuggestedTags([]);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            try {
                const data = await api.searchJobs(userId, query.trim());
                setSearchResults(data.results);
                setSuggestedTags(data.suggested_tags ?? []);
            } catch {
                setSearchResults([]);
                setSuggestedTags([]);
            } finally {
                setIsSearching(false);
            }
        }, 400);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, userId, isSearchMode]);

    // ── Enriched data ───────────────────────────────────────────────────────
    function enrich(list: MatchResult[]): EnrichedMatch[] {
        return list.map(m => ({
            ...m,
            remote_policy: jobMetaById[m.job_id]?.remote_policy,
            company_size: jobMetaById[m.job_id]?.company_size,
            experience_years_min: jobMetaById[m.job_id]?.experience_years_min,
        }));
    }

    const enrichedMatches = useMemo(() => enrich(matches ?? []), [matches, jobMetaById]);
    const enrichedSearch  = useMemo(() => enrich(searchResults ?? []), [searchResults, jobMetaById]);
    const sourceItems     = isSearchMode ? enrichedSearch : enrichedMatches;

    const companyOptions = useMemo(
        () => Array.from(new Set(enrichedMatches.map(m => m.company).filter(Boolean) as string[])).sort(),
        [enrichedMatches],
    );
    const tagOptions = useMemo(
        () => Array.from(new Set(enrichedMatches.flatMap(m => m.job_tags ?? []))).sort(),
        [enrichedMatches],
    );
    const companySizeOptions = useMemo(
        () => Array.from(new Set(Object.values(jobMetaById).map(j => j.company_size).filter(Boolean) as string[])).sort(),
        [jobMetaById],
    );

    const noCultureFit = useMemo(
        () => sourceItems.length > 0 && sourceItems.slice(0, 8).every(r => r.culture_fit_score == null || r.culture_fit_score === 0),
        [sourceItems],
    );

    const activeFilterCount = useMemo(() => [
        scoreBand !== 'all',
        remotePolicy !== 'all',
        interestFilter !== 'all',
        skillGapFilter !== 'any',
        companySizeFilter !== 'all',
        minExperience !== 'any',
        selectedCompanies.length > 0,
        selectedTags.length > 0,
        bookmarkedOnly,
        hideDismissed,
    ].filter(Boolean).length, [
        scoreBand, remotePolicy, interestFilter, skillGapFilter,
        companySizeFilter, minExperience, selectedCompanies, selectedTags,
        bookmarkedOnly, hideDismissed,
    ]);

    // ── Interaction handlers ────────────────────────────────────────────────
    function getInteraction(jobId: string): InteractionState {
        return interactionMap[jobId] ?? { liked: false, disliked: false, bookmarked: false };
    }
    function updateInteraction(jobId: string, fn: (p: InteractionState) => InteractionState) {
        setInteractionMap(prev => {
            const before = prev[jobId] ?? { liked: false, disliked: false, bookmarked: false };
            return { ...prev, [jobId]: fn(before) };
        });
    }
    function handleExplore(jobId: string) {
        if (userId) trackEvent(userId, jobId, 'job_clicked');
        navigate(`/user/match/${jobId}`);
    }
    function handleLike(jobId: string) {
        if (!userId) return;
        const nowLiked = !getInteraction(jobId).liked;
        updateInteraction(jobId, p => ({ ...p, liked: nowLiked, disliked: false }));
        trackEvent(userId, jobId, nowLiked ? 'job_liked' : 'job_dismissed');
    }
    function handleDislike(jobId: string) {
        if (!userId) return;
        const nowDisliked = !getInteraction(jobId).disliked;
        updateInteraction(jobId, p => ({ ...p, disliked: nowDisliked, liked: false }));
        trackEvent(userId, jobId, nowDisliked ? 'job_disliked' : 'job_dismissed');
    }
    function handleBookmark(jobId: string) {
        if (!userId) return;
        const nowBookmarked = !getInteraction(jobId).bookmarked;
        updateInteraction(jobId, p => ({ ...p, bookmarked: nowBookmarked }));
        trackEvent(userId, jobId, 'job_bookmarked');
    }
    function toggleCompany(c: string) {
        setSelectedCompanies(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
    }
    function toggleTag(t: string) {
        setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    }
    function clearAllFilters() {
        setScoreBand('all'); setRemotePolicy('all'); setInterestFilter('all');
        setSkillGapFilter('any'); setCompanySizeFilter('all'); setMinExperience('any');
        setSelectedCompanies([]); setSelectedTags([]);
        setBookmarkedOnly(false); setHideDismissed(true); setSortBy('match');
    }

    // ── Filtered + sorted results ───────────────────────────────────────────
    const filteredAndSorted = useMemo(() => {
        let items = [...sourceItems];

        if (scoreBand === 'strong')  items = items.filter(i => i.total_score >= 0.72);
        if (scoreBand === 'viable')  items = items.filter(i => i.total_score >= 0.44 && i.total_score < 0.72);
        if (scoreBand === 'stretch') items = items.filter(i => i.total_score < 0.44);
        if (remotePolicy !== 'all')  items = items.filter(i => i.remote_policy === remotePolicy);
        if (interestFilter === 'high') items = items.filter(i => (i.interest_score ?? 0) >= 0.65);
        if (interestFilter === 'matched_tags') items = items.filter(i => (i.interest_tags_matched?.length ?? 0) > 0);
        if (skillGapFilter === 'none')  items = items.filter(i => i.missing_skills.length === 0);
        if (skillGapFilter === 'small') items = items.filter(i => i.missing_skills.length > 0 && i.missing_skills.length <= 3);
        if (skillGapFilter === 'large') items = items.filter(i => i.missing_skills.length > 3);
        if (companySizeFilter !== 'all') items = items.filter(i => i.company_size === companySizeFilter);
        if (minExperience !== 'any') {
            const max = parseInt(minExperience, 10);
            items = items.filter(i => (i.experience_years_min ?? 0) <= max);
        }
        if (selectedCompanies.length > 0) items = items.filter(i => i.company && selectedCompanies.includes(i.company));
        if (selectedTags.length > 0) items = items.filter(i => selectedTags.every(t => (i.job_tags ?? []).includes(t)));
        if (bookmarkedOnly) items = items.filter(i => getInteraction(i.job_id).bookmarked);
        if (hideDismissed)  items = items.filter(i => !getInteraction(i.job_id).disliked);

        if (!isSearchMode) {
            items.sort((a, b) => {
                if (sortBy === 'match')        return b.total_score - a.total_score;
                if (sortBy === 'interest')     return (b.interest_score ?? 0) - (a.interest_score ?? 0);
                if (sortBy === 'fewest_gaps')  return a.missing_skills.length - b.missing_skills.length;
                return (a.company ?? 'zzz').localeCompare(b.company ?? 'zzz');
            });
        }
        return items;
    }, [
        sourceItems, scoreBand, remotePolicy, interestFilter, skillGapFilter,
        companySizeFilter, minExperience, selectedCompanies, selectedTags,
        bookmarkedOnly, hideDismissed, sortBy, isSearchMode, interactionMap,
    ]);

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <>
            <title>Job Search — Lumino</title>
            <div className="min-h-screen bg-slate-50">

                {/* ── Sticky command bar ── */}
                <div className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-sm">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">

                        {/* Search row */}
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                                <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${isSearchMode ? 'text-blue-500' : 'text-slate-400'}`}>
                                    {isSearching
                                        ? <span className="spinner-sm" aria-hidden="true" />
                                        : <Search size={16} aria-hidden="true" />}
                                </div>
                                <input
                                    type="search"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search by role, skill, domain, company…"
                                    aria-label="Search jobs"
                                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border transition-all duration-200 outline-none
                                        ${isSearchMode
                                            ? 'border-blue-300 bg-blue-50/40 ring-2 ring-blue-100 placeholder-blue-300 text-blue-900'
                                            : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
                                        }`}
                                />
                                {isSearchMode && (
                                    <button
                                        onClick={() => setQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Mode pill */}
                            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                isSearchMode
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>
                                {isSearchMode ? <Sparkles size={12} /> : <Zap size={12} />}
                                {isSearchMode ? 'Semantic' : 'Ranked'}
                            </div>

                            {/* Filter toggle */}
                            <button
                                onClick={() => setShowFilters(v => !v)}
                                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                    showFilters || activeFilterCount > 0
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <Filter size={13} />
                                Filters
                                {activeFilterCount > 0 && (
                                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white text-blue-600 text-[10px] font-black leading-none">
                                        {activeFilterCount}
                                    </span>
                                )}
                                {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>

                            {!isSearchMode && (
                                <button
                                    onClick={loadMatches}
                                    disabled={loading}
                                    aria-label="Refresh matches"
                                    className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40"
                                >
                                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                </button>
                            )}
                        </div>

                        {/* Suggested tags in semantic mode */}
                        <AnimatePresence>
                            {isSearchMode && suggestedTags.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Suggested</span>
                                        {suggestedTags.map(tag => (
                                            <button
                                                key={tag}
                                                onClick={() => toggleTag(tag)}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                                                    selectedTags.includes(tag)
                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                                                }`}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Active filter chips */}
                        {(selectedTags.length > 0 || selectedCompanies.length > 0 || scoreBand !== 'all' || remotePolicy !== 'all') && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {selectedTags.map(tag => (
                                    <button key={tag} onClick={() => toggleTag(tag)}
                                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold hover:bg-blue-200 transition-colors">
                                        {tag} <X size={10} />
                                    </button>
                                ))}
                                {selectedCompanies.map(c => (
                                    <button key={c} onClick={() => toggleCompany(c)}
                                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold hover:bg-slate-200 transition-colors">
                                        {c} <X size={10} />
                                    </button>
                                ))}
                                {scoreBand !== 'all' && (
                                    <button onClick={() => setScoreBand('all')}
                                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold hover:bg-amber-200 transition-colors">
                                        {scoreBand} <X size={10} />
                                    </button>
                                )}
                                {remotePolicy !== 'all' && (
                                    <button onClick={() => setRemotePolicy('all')}
                                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold hover:bg-slate-200 transition-colors">
                                        {remotePolicy} <X size={10} />
                                    </button>
                                )}
                                {activeFilterCount > 1 && (
                                    <button onClick={clearAllFilters}
                                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[11px] font-semibold hover:bg-red-100 transition-colors border border-red-200">
                                        Clear all <X size={10} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Stats bar */}
                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
                            <p className="text-[11px] text-slate-400 font-medium">
                                {filteredAndSorted.length} role{filteredAndSorted.length !== 1 ? 's' : ''}
                                {isSearchMode ? ' found via semantic search' : ' in your ranked matches'}
                            </p>
                            {!isSearchMode && (
                                <select
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value as SortBy)}
                                    className="text-[11px] text-slate-500 bg-transparent outline-none border-0 cursor-pointer font-semibold"
                                >
                                    <option value="match">Best match</option>
                                    <option value="interest">Highest interest</option>
                                    <option value="fewest_gaps">Fewest skill gaps</option>
                                    <option value="company">Company A–Z</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {/* ── Collapsible filter panel ── */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden border-t border-slate-100 bg-slate-50/80"
                            >
                                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">

                                        <FilterSection title="Match">
                                            <div className="grid grid-cols-2 gap-1">
                                                {(['all', 'strong', 'viable', 'stretch'] as ScoreBand[]).map(b => (
                                                    <button key={b} onClick={() => setScoreBand(b)}
                                                        className={`py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                                                            scoreBand === b
                                                                ? 'bg-blue-600 text-white border-blue-600'
                                                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                                        }`}>
                                                        {b === 'all' ? 'All' : b.charAt(0).toUpperCase() + b.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </FilterSection>

                                        <FilterSection title="Work style">
                                            <div className="space-y-1">
                                                {(['all', 'remote', 'hybrid', 'onsite'] as const).map(p => (
                                                    <button key={p} onClick={() => setRemotePolicy(p)}
                                                        className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                                                            remotePolicy === p
                                                                ? 'bg-blue-600 text-white border-blue-600'
                                                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                                        }`}>
                                                        {p === 'all' ? 'Any' : p.charAt(0).toUpperCase() + p.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </FilterSection>

                                        <FilterSection title="Skill gaps">
                                            <div className="space-y-1">
                                                {([
                                                    { id: 'any', label: 'Any' },
                                                    { id: 'none', label: 'No gaps' },
                                                    { id: 'small', label: '1–3 gaps' },
                                                    { id: 'large', label: '4+ gaps' },
                                                ] as { id: SkillGapFilter; label: string }[]).map(opt => (
                                                    <button key={opt.id} onClick={() => setSkillGapFilter(opt.id)}
                                                        className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                                                            skillGapFilter === opt.id
                                                                ? 'bg-blue-600 text-white border-blue-600'
                                                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                                        }`}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </FilterSection>

                                        <FilterSection title="Experience & size">
                                            <div className="space-y-2">
                                                <select
                                                    value={minExperience}
                                                    onChange={e => setMinExperience(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 outline-none focus:border-blue-300"
                                                >
                                                    <option value="any">Any experience</option>
                                                    <option value="0">Entry level</option>
                                                    <option value="2">Up to 2 yrs</option>
                                                    <option value="5">Up to 5 yrs</option>
                                                    <option value="8">Up to 8 yrs</option>
                                                </select>
                                                {companySizeOptions.length > 0 && (
                                                    <select
                                                        value={companySizeFilter}
                                                        onChange={e => setCompanySizeFilter(e.target.value)}
                                                        className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 outline-none focus:border-blue-300"
                                                    >
                                                        <option value="all">Any size</option>
                                                        {companySizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                )}
                                            </div>
                                        </FilterSection>

                                        <FilterSection title="View">
                                            <div className="space-y-1.5">
                                                <label className="flex items-center justify-between text-[11px] text-slate-600 font-medium cursor-pointer">
                                                    Bookmarked only
                                                    <input type="checkbox" checked={bookmarkedOnly} onChange={e => setBookmarkedOnly(e.target.checked)} className="accent-blue-600" />
                                                </label>
                                                <label className="flex items-center justify-between text-[11px] text-slate-600 font-medium cursor-pointer">
                                                    Hide dismissed
                                                    <input type="checkbox" checked={hideDismissed} onChange={e => setHideDismissed(e.target.checked)} className="accent-blue-600" />
                                                </label>
                                                {interestFilter !== 'all' ? (
                                                    <button onClick={() => setInterestFilter('all')} className="text-[11px] text-blue-600 font-semibold underline">
                                                        Clear interest filter
                                                    </button>
                                                ) : (
                                                    <button onClick={() => setInterestFilter('high')} className="text-[11px] text-slate-500 font-semibold hover:text-blue-600">
                                                        + High interest only
                                                    </button>
                                                )}
                                            </div>
                                        </FilterSection>
                                    </div>

                                    {/* Company + tag quick picks */}
                                    {(companyOptions.length > 0 || tagOptions.length > 0) && (
                                        <div className="mt-4 pt-4 border-t border-slate-200 grid sm:grid-cols-2 gap-4">
                                            {companyOptions.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Company</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {companyOptions.slice(0, 8).map(c => (
                                                            <button key={c} onClick={() => toggleCompany(c)}
                                                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
                                                                    selectedCompanies.includes(c)
                                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                                                }`}>
                                                                {c}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {tagOptions.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Tags</p>
                                                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                                                        {tagOptions.map(tag => (
                                                            <button key={tag} onClick={() => toggleTag(tag)}
                                                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
                                                                    selectedTags.includes(tag)
                                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                                                }`}>
                                                                {tag}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Content ── */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-3">

                    {/* Culture fit info banner */}
                    {noCultureFit && (
                        <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200"
                        >
                            <Info size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-amber-700">
                                <span className="font-semibold">Culture fit is not scored yet.</span> Build your Digital Twin with a Culture Identity to unlock this dimension.{' '}
                                <Link to="/user/model" className="underline font-semibold hover:text-amber-900">Open editor →</Link>
                            </p>
                        </motion.div>
                    )}

                    {error && <div className="alert-error" role="alert">{error}</div>}

                    {/* Loading */}
                    {loading && !matches && (
                        <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
                            <span className="spinner-sm" />
                            <span className="text-sm">Loading your matches…</span>
                        </div>
                    )}

                    {/* Semantic searching */}
                    {isSearchMode && isSearching && (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
                            <span className="spinner-sm" />
                            <span className="text-sm text-blue-600">Searching semantically…</span>
                        </div>
                    )}

                    {/* Empty states */}
                    {!loading && !isSearchMode && matches?.length === 0 && (
                        <div className="empty-state py-24">
                            <Briefcase size={40} className="mx-auto text-slate-200 mb-4" />
                            <p className="empty-state-title text-lg">No ranked matches yet</p>
                            <p className="empty-state-copy">Upload your resume to generate explainable match rankings.</p>
                            <Link to="/resume" className="btn-primary btn-sm mt-5 inline-flex">Upload Resume</Link>
                        </div>
                    )}

                    {isSearchMode && !isSearching && searchResults?.length === 0 && (
                        <div className="empty-state py-20">
                            <Search size={36} className="mx-auto text-slate-200 mb-4" />
                            <p className="empty-state-title">No results for "{query}"</p>
                            <p className="empty-state-copy mt-1">Try different keywords or clear the search to see your ranked matches.</p>
                        </div>
                    )}

                    {!isSearching && filteredAndSorted.length === 0 && sourceItems.length > 0 && (
                        <div className="empty-state py-20">
                            <MapPin size={32} className="mx-auto text-slate-200 mb-4" />
                            <p className="empty-state-title">No roles match your filters</p>
                            <button onClick={clearAllFilters} className="btn-secondary btn-sm mt-4">Reset Filters</button>
                        </div>
                    )}

                    {/* ── Job cards ── */}
                    {filteredAndSorted.map((result, idx) => {
                        const meta = scoreMeta(result.total_score);
                        const interaction = getInteraction(result.job_id);

                        return (
                            <motion.article
                                key={result.job_id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, delay: Math.min(idx * 0.025, 0.18) }}
                                className="group bg-white rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-[0_4px_24px_rgba(0,0,0,0.07)] transition-all duration-200 overflow-hidden"
                            >
                                <div className="flex">
                                    {/* Accent bar */}
                                    <div className={`w-1 flex-shrink-0 ${meta.accent}`} />

                                    <div className="flex-1 p-4 sm:p-5 min-w-0">

                                        {/* ── Header ── */}
                                        <div className="flex items-start gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                                    <h2 className="text-[15px] font-bold text-slate-900 truncate leading-tight">
                                                        {result.job_title || result.job_id}
                                                    </h2>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text} ring-1 ${meta.border}`}>
                                                        {meta.label}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                                                    {result.company && (
                                                        <span className="flex items-center gap-1">
                                                            <Building2 size={11} />
                                                            <span className="font-medium text-slate-700">{result.company}</span>
                                                        </span>
                                                    )}
                                                    {result.company_size && (
                                                        <span className="text-slate-400">·  {result.company_size}</span>
                                                    )}
                                                    <span className={`badge text-[10px] ${remoteBadge(result.remote_policy)}`}>
                                                        {result.remote_policy ?? 'unknown'}
                                                    </span>
                                                    {result.experience_years_min != null && (
                                                        <span className="text-slate-400 text-[10px]">{result.experience_years_min}+ yrs exp</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Score ring */}
                                            <ScoreRing score={result.total_score} />
                                        </div>

                                        {/* ── Tags ── */}
                                        {(result.job_tags?.length ?? 0) > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-3">
                                                {result.job_tags!.slice(0, 5).map(tag => (
                                                    <JobTagBadge
                                                        key={tag}
                                                        tag={tag}
                                                        variant={result.interest_tags_matched?.includes(tag) ? 'interest' : 'neutral'}
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        {/* ── Sub-scores ── */}
                                        <div className="flex flex-wrap items-center gap-1.5 mt-3">
                                            <ScorePill label="Skills" score={result.skill_score} />
                                            <ScorePill label="Domain" score={result.domain_score} />
                                            {result.culture_fit_score != null && result.culture_fit_score > 0
                                                ? <ScorePill label="Culture" score={result.culture_fit_score} />
                                                : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-400 ring-1 ring-slate-200">
                                                        Culture <span className="italic">—</span>
                                                    </span>
                                                )
                                            }
                                            {result.soft_skill_score != null && <ScorePill label="Soft" score={result.soft_skill_score} />}
                                            {result.interest_score != null && <ScorePill label="Interest" score={result.interest_score} />}
                                        </div>

                                        {/* ── Skills ── */}
                                        {(result.matched_skills.length > 0 || result.missing_skills.length > 0) && (
                                            <div className="flex flex-wrap gap-1 mt-3">
                                                {result.matched_skills.slice(0, 5).map(s => (
                                                    <SkillBadge key={s} label={s} variant="match" />
                                                ))}
                                                {result.missing_skills.slice(0, 3).map(s => (
                                                    <SkillBadge key={s} label={s} variant="missing" />
                                                ))}
                                            </div>
                                        )}

                                        {/* ── Footer actions ── */}
                                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-50">
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    onClick={() => handleLike(result.job_id)}
                                                    className={`p-2 rounded-lg transition-all ${interaction.liked
                                                        ? 'text-emerald-600 bg-emerald-50'
                                                        : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'}`}
                                                    aria-label="Interested"
                                                >
                                                    <Heart size={14} fill={interaction.liked ? 'currentColor' : 'none'} />
                                                </button>
                                                <button
                                                    onClick={() => handleDislike(result.job_id)}
                                                    className={`p-2 rounded-lg transition-all ${interaction.disliked
                                                        ? 'text-rose-500 bg-rose-50'
                                                        : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                                                    aria-label="Dismiss"
                                                >
                                                    <ThumbsDown size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleBookmark(result.job_id)}
                                                    className={`p-2 rounded-lg transition-all ${interaction.bookmarked
                                                        ? 'text-blue-600 bg-blue-50'
                                                        : 'text-slate-300 hover:text-blue-500 hover:bg-blue-50'}`}
                                                    aria-label="Bookmark"
                                                >
                                                    {interaction.bookmarked
                                                        ? <BookmarkCheck size={14} />
                                                        : <Bookmark size={14} />}
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Link
                                                    to={`/practice?jobId=${result.job_id}`}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors"
                                                >
                                                    <GraduationCap size={12} />
                                                    Practice
                                                </Link>
                                                <button
                                                    onClick={() => handleExplore(result.job_id)}
                                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm hover:shadow-md ${
                                                        result.total_score >= 0.72
                                                            ? 'bg-emerald-600 hover:bg-emerald-700'
                                                            : result.total_score >= 0.44
                                                                ? 'bg-blue-600 hover:bg-blue-700'
                                                                : 'bg-slate-600 hover:bg-slate-700'
                                                    }`}
                                                >
                                                    View Match →
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.article>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
