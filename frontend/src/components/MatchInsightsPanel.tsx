import { AlertTriangle, CheckCircle2, Compass, Lightbulb, Shield, TrendingUp } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MatchInsightsResponse } from '../lib/types';

interface MatchInsightsPanelProps {
    insights: MatchInsightsResponse | null;
    loading?: boolean;
    error?: string | null;
}

function confidenceBadge(confidence: MatchInsightsResponse['confidence']): string {
    if (confidence === 'high') return 'badge-green';
    if (confidence === 'medium') return 'badge-orange';
    return 'badge-red';
}

function priorityBadge(priority: 'high' | 'medium' | 'low'): string {
    if (priority === 'high') return 'badge-red';
    if (priority === 'medium') return 'badge-orange';
    return 'badge-blue';
}

function barColor(score: number): string {
    if (score >= 0.75) return '#16a34a';
    if (score >= 0.5) return '#ea580c';
    return '#dc2626';
}

export default function MatchInsightsPanel({ insights, loading = false, error = null }: MatchInsightsPanelProps) {
    if (loading) {
        return (
            <section className="card-lumino p-4 space-y-3" aria-label="Loading explainability insights">
                <div className="h-4 w-40 bg-slate-100 rounded animate-pulse" />
                <div className="h-40 bg-slate-100 rounded animate-pulse" />
                <div className="h-12 bg-slate-100 rounded animate-pulse" />
            </section>
        );
    }

    if (error) {
        return (
            <section className="alert-warning rounded-xl" aria-label="Explainability unavailable">
                <AlertTriangle size={14} className="flex-shrink-0" />
                <div>
                    <p className="font-semibold text-xs">Insights unavailable</p>
                    <p className="text-xs">{error}</p>
                </div>
            </section>
        );
    }

    if (!insights) {
        return null;
    }

    const chartData = insights.score_breakdown.map((item) => ({
        label: item.label,
        scorePct: Math.round(item.score * 100),
        scoreRaw: item.score,
    }));

    return (
        <section className="card-lumino p-4 space-y-4" aria-label="Match explainability panel">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Decision Intelligence</p>
                    <h3 className="text-sm font-extrabold text-indigo-950">Why This Match Ranks Here</h3>
                </div>
                <span className={`badge ${confidenceBadge(insights.confidence)}`}>
                    Confidence: {insights.confidence}
                </span>
            </div>

            <div className="h-44 rounded-xl bg-slate-50 border border-slate-100 p-2">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 6, right: 18, left: 8, bottom: 6 }}>
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 11, fill: '#475569' }} />
                        <Tooltip
                            cursor={{ fill: '#e2e8f0' }}
                            formatter={(value: number) => [`${value}%`, 'Score']}
                            contentStyle={{ borderRadius: 10, border: '1px solid #dbeafe', fontSize: 12 }}
                        />
                        <Bar dataKey="scorePct" radius={[6, 6, 6, 6]}>
                            {chartData.map((row) => (
                                <Cell key={row.label} fill={barColor(row.scoreRaw)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {insights.strongest_evidence.length > 0 && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1 mb-1.5">
                        <CheckCircle2 size={12} /> Strongest Evidence
                    </p>
                    <ul className="space-y-1">
                        {insights.strongest_evidence.slice(0, 3).map((item) => (
                            <li key={item} className="text-xs text-emerald-800">{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {insights.top_gaps.length > 0 && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-700 flex items-center gap-1 mb-1.5">
                        <TrendingUp size={12} /> Highest-Impact Gaps
                    </p>
                    <ul className="space-y-1">
                        {insights.top_gaps.slice(0, 3).map((item) => (
                            <li key={item} className="text-xs text-amber-800">{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {insights.next_steps.length > 0 && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <p className="text-xs font-semibold text-blue-700 flex items-center gap-1 mb-1.5">
                        <Compass size={12} /> Next Best Actions
                    </p>
                    <div className="space-y-2">
                        {insights.next_steps.slice(0, 3).map((step) => (
                            <div key={step.title} className="rounded-lg bg-white/80 border border-blue-100 p-2">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <p className="text-xs font-semibold text-indigo-950">{step.title}</p>
                                    <span className={`badge ${priorityBadge(step.priority)}`}>{step.priority}</span>
                                </div>
                                <p className="text-xs text-slate-600">{step.detail}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {insights.recruiter_takeaways.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-1.5">
                        <Lightbulb size={12} /> Decision Notes
                    </p>
                    <ul className="space-y-1">
                        {insights.recruiter_takeaways.slice(0, 3).map((item) => (
                            <li key={item} className="text-xs text-slate-600">{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {insights.caveats.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-600 flex items-center gap-1 mb-1.5">
                        <Shield size={12} /> Caveats
                    </p>
                    <ul className="space-y-1">
                        {insights.caveats.slice(0, 2).map((item) => (
                            <li key={item} className="text-xs text-slate-500">{item}</li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
