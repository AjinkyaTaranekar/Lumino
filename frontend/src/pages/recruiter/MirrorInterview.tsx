import { ArrowLeft, BrainCircuit, Flame, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { RecruiterTwinEvidence } from '../../lib/types';

type TwinChatMessage = {
    role: 'recruiter' | 'twin';
    content: string;
    confidence?: number;
    evidence?: RecruiterTwinEvidence[];
    followUpQuestion?: string;
    cultureFollowUpQuestion?: string;
    nextBestFollowups?: string[];
    nightmareQuestions?: string[];
};

type SessionSetup = {
    openingMessage: string;
    confidence: number;
    evidence: RecruiterTwinEvidence[];
    followUpQuestion: string;
    cultureFollowUpQuestion: string;
    nextBestFollowups: string[];
    nightmareQuestions: string[];
};

function confidenceBadge(confidence: number | undefined): string {
    if (confidence == null) return 'badge badge-gray';
    if (confidence >= 0.75) return 'badge badge-green';
    if (confidence >= 0.45) return 'badge badge-orange';
    return 'badge badge-red';
}

export default function MirrorInterview() {
    const { jobId, userId } = useParams<{ jobId: string; userId: string }>();
    const { session } = useAuth();
    const navigate = useNavigate();

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [jobTitle, setJobTitle] = useState<string>('Candidate Mirror');
    const [company, setCompany] = useState<string>('');
    const [candidateSnapshot, setCandidateSnapshot] = useState<string>('');
    const [nightmareMode, setNightmareMode] = useState<boolean>(false);
    const [sessionSetup, setSessionSetup] = useState<SessionSetup | null>(null);

    const [messages, setMessages] = useState<TwinChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loadingStart, setLoadingStart] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startedRef = useRef(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const lastTwinMessage = useMemo(
        () => [...messages].reverse().find((msg) => msg.role === 'twin'),
        [messages]
    );

    const activeInsight = useMemo(() => {
        if (lastTwinMessage) {
            return {
                confidence: lastTwinMessage.confidence ?? 0,
                evidence: lastTwinMessage.evidence ?? [],
                followUpQuestion: lastTwinMessage.followUpQuestion ?? '',
                cultureFollowUpQuestion: lastTwinMessage.cultureFollowUpQuestion ?? '',
                nextBestFollowups: lastTwinMessage.nextBestFollowups ?? [],
                nightmareQuestions: lastTwinMessage.nightmareQuestions ?? [],
            };
        }
        return sessionSetup;
    }, [lastTwinMessage, sessionSetup]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, sending]);

    useEffect(() => {
        async function start() {
            if (startedRef.current || !session?.userId || !jobId || !userId) return;
            startedRef.current = true;
            setLoadingStart(true);
            setError(null);
            try {
                const res = await api.practice.recruiter.startSession({
                    recruiter_id: session.userId,
                    user_id: userId,
                    job_id: jobId,
                    nightmare_mode: nightmareMode,
                });

                setSessionId(res.session_id);
                setJobTitle(res.job_title || 'Candidate Mirror');
                setCompany(res.company || 'Unknown company');
                setCandidateSnapshot(res.candidate_snapshot);
                setSessionSetup({
                    openingMessage: res.opening_message,
                    confidence: res.confidence,
                    evidence: res.evidence,
                    followUpQuestion: res.follow_up_question,
                    cultureFollowUpQuestion: res.culture_follow_up_question,
                    nextBestFollowups: res.next_best_followups,
                    nightmareQuestions: res.nightmare_questions,
                });
                setMessages([]);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to start mirror interview';
                if (message.toLowerCase().includes('has not applied')) {
                    setError('Mirror interview is available only for candidates who have applied to this job.');
                } else {
                    setError(message);
                }
                startedRef.current = false;
            } finally {
                setLoadingStart(false);
            }
        }

        start();
    }, [jobId, userId, session?.userId, nightmareMode]);

    async function handleSend() {
        const trimmed = input.trim();
        if (!trimmed || !session?.userId || !sessionId || sending) return;

        setInput('');
        setError(null);
        const optimistic: TwinChatMessage = { role: 'recruiter', content: trimmed };
        setMessages((prev) => [...prev, optimistic]);
        setSending(true);

        try {
            const turn = await api.practice.recruiter.sendMessage(sessionId, {
                recruiter_id: session.userId,
                content: trimmed,
                nightmare_mode: nightmareMode,
            });

            setMessages((prev) => [
                ...prev,
                {
                    role: 'twin',
                    content: turn.twin_response,
                    confidence: turn.confidence,
                    evidence: turn.evidence,
                    followUpQuestion: turn.follow_up_question,
                    cultureFollowUpQuestion: turn.culture_follow_up_question,
                    nextBestFollowups: turn.next_best_followups,
                    nightmareQuestions: turn.nightmare_questions,
                },
            ]);
        } catch (err) {
            setMessages((prev) => prev.slice(0, -1));
            setError(err instanceof Error ? err.message : 'Failed to send message');
        } finally {
            setSending(false);
        }
    }

    function onInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void handleSend();
        }
    }

    return (
        <>
            <title>Mirror Interview - Lumino</title>

            <div className="px-6 py-6 max-w-7xl mx-auto h-[calc(100vh-4rem)] flex flex-col gap-4">
                <div className="card-lumino p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => navigate(`/talent-pool/${jobId}`)}
                            className="btn-ghost btn-sm"
                            aria-label="Back to candidates"
                        >
                            <ArrowLeft size={14} />
                            Back
                        </button>

                        <div className="min-w-0">
                            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Recruiter Mirror Interview</p>
                            <h1 className="text-lg font-bold text-indigo-950 truncate">
                                {jobTitle} {company ? `- ${company}` : ''}
                            </h1>
                            <p className="text-xs text-slate-500 mt-0.5">Candidate: {userId}</p>
                        </div>
                    </div>

                    <button
                        onClick={() => setNightmareMode((v) => !v)}
                        className={nightmareMode ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
                        aria-pressed={nightmareMode}
                        title="Generate hard-but-fair pressure questions for interview prep"
                    >
                        <Flame size={14} />
                        {nightmareMode ? 'Nightmare Mode On' : 'Nightmare Mode Off'}
                    </button>
                </div>

                {error && <div className="alert-error">{error}</div>}

                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
                    <div className="card-lumino flex flex-col min-h-0 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <p className="text-sm font-semibold text-indigo-950 flex items-center gap-2">
                                <BrainCircuit size={16} className="text-blue-600" />
                                Talk To Candidate Twin
                            </p>
                            <p className="text-xs text-slate-500">Evidence-grounded mirror, not a generic bot</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60">
                            {loadingStart && (
                                <div className="text-sm text-slate-500 flex items-center gap-2">
                                    <span className="spinner-sm" aria-hidden="true" />
                                    Starting mirror session...
                                </div>
                            )}

                            {!loadingStart && messages.length === 0 && sessionSetup?.openingMessage && (
                                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">
                                        Recruiter Leads The First Question
                                    </p>
                                    <p className="text-sm text-blue-900">{sessionSetup.openingMessage}</p>
                                </div>
                            )}

                            {messages.map((msg, idx) => (
                                <motion.div
                                    key={`${msg.role}-${idx}`}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={msg.role === 'recruiter' ? 'flex justify-end' : 'flex justify-start'}
                                >
                                    <div
                                        className={
                                            msg.role === 'recruiter'
                                                ? 'max-w-[88%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-blue-500 to-indigo-600 text-white px-4 py-3 text-sm'
                                                : 'max-w-[88%] rounded-2xl rounded-tl-sm bg-indigo-950 text-white px-4 py-3 text-sm'
                                        }
                                    >
                                        {msg.content}
                                    </div>
                                </motion.div>
                            ))}

                            {sending && (
                                <div className="text-xs text-slate-500 flex items-center gap-2">
                                    <span className="spinner-sm" aria-hidden="true" />
                                    Twin is generating an evidence-based answer...
                                </div>
                            )}

                            <div ref={bottomRef} />
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-white flex items-end gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={onInputKeyDown}
                                rows={3}
                                disabled={!sessionId || sending || loadingStart}
                                className="input resize-none"
                                placeholder="Introduce yourself, then ask your first interview question (Enter to send, Shift+Enter for new line)"
                            />
                            <button
                                className="btn-primary"
                                onClick={() => void handleSend()}
                                disabled={!input.trim() || !sessionId || sending || loadingStart}
                            >
                                <Send size={15} />
                                Send
                            </button>
                        </div>
                    </div>

                    <div className="card-lumino min-h-0 overflow-y-auto p-4 space-y-4">
                        <div className="insight-callout">
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 mb-1">Latest Mirror Confidence</p>
                            <div className="flex items-center justify-between gap-3">
                                <span className={confidenceBadge(activeInsight?.confidence)}>
                                    Confidence {Math.round((activeInsight?.confidence ?? 0) * 100)}%
                                </span>
                                <Sparkles size={14} className="text-primary-500" />
                            </div>
                        </div>

                        <div>
                            <p className="section-title mb-2">Evidence Snippets</p>
                            <div className="space-y-2">
                                {(activeInsight?.evidence ?? []).length === 0 ? (
                                    <p className="text-sm text-slate-500">No evidence extracted yet. Send a recruiter question.</p>
                                ) : (
                                    (activeInsight?.evidence ?? []).map((item, idx) => (
                                        <div key={`${item.source}-${idx}`} className="rounded-xl border border-slate-100 p-3 bg-white">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="badge badge-blue">{item.source.replace('_', ' ')}</span>
                                            </div>
                                            <p className="text-sm text-slate-700">{item.snippet}</p>
                                            <p className="text-xs text-slate-500 mt-1">{item.relevance}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div>
                            <p className="section-title mb-2">Best Follow-up To Ask Candidate</p>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                                {activeInsight?.followUpQuestion || 'No follow-up yet.'}
                            </div>
                        </div>

                        <div>
                            <p className="section-title mb-2">Culture-Based Follow-up</p>
                            {activeInsight?.cultureFollowUpQuestion ? (
                                <button
                                    onClick={() => setInput(activeInsight.cultureFollowUpQuestion || '')}
                                    className="w-full text-left rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800 hover:bg-emerald-100 transition-colors"
                                >
                                    {activeInsight.cultureFollowUpQuestion}
                                </button>
                            ) : (
                                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">
                                    Culture-oriented follow-up will appear here.
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="section-title mb-2">Next Best Follow-up Set</p>
                            {(activeInsight?.nextBestFollowups ?? []).length === 0 ? (
                                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">
                                    Follow-up suggestions appear here after each twin response.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(activeInsight?.nextBestFollowups ?? []).map((question, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setInput(question)}
                                            className="w-full text-left rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-700 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                                        >
                                            {question}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="section-title mb-2">Nightmare Question Deck</p>
                            {(activeInsight?.nightmareQuestions ?? []).length === 0 ? (
                                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500 flex items-center gap-2">
                                    <ShieldAlert size={14} className="text-slate-400" />
                                    Turn on Nightmare Mode to generate pressure-test interview prompts.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(activeInsight?.nightmareQuestions ?? []).map((question, idx) => (
                                        <div key={idx} className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                                            {question}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="section-title mb-2">Candidate Mirror Snapshot</p>
                            <pre className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 whitespace-pre-wrap font-sans">
                                {candidateSnapshot || 'Snapshot will appear once session starts.'}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
