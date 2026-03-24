import {
  Award,
  BookOpen,
  CheckCircle,
  Download,
  ExternalLink,
  FileText,
  Info,
  TrendingUp,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import React from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedbackPoint {
  id: string;
  text: string;
}

interface NextStep {
  id: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const STRENGTHS: FeedbackPoint[] = [
  { id: 's1', text: 'Strong TypeScript and React foundation with production-grade experience.' },
  { id: 's2', text: 'Clear communication style - answers were structured and concise.' },
  { id: 's3', text: 'Demonstrated ownership mindset when describing past projects.' },
  { id: 's4', text: 'Good understanding of trade-offs in system design decisions.' },
];

const GROWTH_AREAS: FeedbackPoint[] = [
  { id: 'g1', text: 'Deepen knowledge of distributed systems and scalability patterns.' },
  { id: 'g2', text: 'Practice estimating complexity and timelines under pressure.' },
  { id: 'g3', text: 'Expand experience with cross-team stakeholder alignment.' },
];

const PIE_DATA = [
  { name: 'Aligned', value: 85 },
  { name: 'Gap', value: 15 },
];

const PIE_COLORS = ['#3B82F6', '#E2E8F0'];

const NEXT_STEPS: NextStep[] = [
  {
    id: 'n1',
    title: 'System Design Deep Dive',
    description: 'A curated course covering distributed systems, CAP theorem, and real-world architecture patterns.',
    cta: 'Start Learning',
    href: '#',
    icon: BookOpen,
    color: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  {
    id: 'n2',
    title: 'Mock Interview Practice',
    description: 'Book a live mock session with an ex-FAANG engineer to sharpen your interview delivery.',
    cta: 'Book Session',
    href: '/practice',
    icon: Users,
    color: 'bg-purple-50 border-purple-200 text-purple-700',
  },
  {
    id: 'n3',
    title: 'Update Your Knowledge Graph',
    description: "Re-upload your resume or add new skills to improve your match scores for future applications.",
    cta: 'Update Profile',
    href: '/resume',
    icon: TrendingUp,
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
];

// ─── Custom Pie Label ─────────────────────────────────────────────────────────

function CenterLabel({ cx, cy }: { cx?: number; cy?: number }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan
        x={cx}
        dy="-0.3em"
        style={{ fontSize: '22px', fontWeight: 800, fill: '#1e1b4b' }}
      >
        85%
      </tspan>
      <tspan
        x={cx}
        dy="1.4em"
        style={{ fontSize: '10px', fill: '#64748b', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}
      >
        Alignment
      </tspan>
    </text>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Applications() {
  return (
    <>
      <title>My Applications - Lumino</title>

      <div className="px-6 py-8 max-w-6xl mx-auto space-y-8">

        {/* ── Page Header ── */}
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-950 tracking-tight">
            My Applications
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm">
            Review feedback from your interviews and applications. Real-time data would be pulled from the API.
          </p>
        </div>

        {/* ── Application Header Card ── */}
        <motion.div
          className="card-lumino p-6"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          role="region"
          aria-label="Latest application details"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Award size={22} className="text-emerald-600" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200"
                    aria-label="Application status: Interview Complete"
                  >
                    <CheckCircle size={11} aria-hidden="true" />
                    Interview Complete
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-indigo-950 tracking-tight mt-1">
                  Senior Full-Stack Engineer - Stripe
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Interviewed on <time dateTime="2026-03-20">20 March 2026</time>
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                className="btn-secondary btn-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                aria-label="Download interview report as PDF"
              >
                <Download size={13} aria-hidden="true" />
                Download Report
              </button>
              <button
                className="btn-secondary btn-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                aria-label="View interview transcript"
              >
                <FileText size={13} aria-hidden="true" />
                Transcript
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Three-Panel Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Strengths Observed */}
          <motion.div
            className="card-lumino p-6"
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            role="region"
            aria-label="Strengths observed"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-600" aria-hidden="true" />
              </div>
              <h3 className="font-extrabold text-indigo-950 tracking-tight">Strengths Observed</h3>
            </div>
            <ul className="space-y-3" aria-label="List of observed strengths">
              {STRENGTHS.map((s) => (
                <li key={s.id} className="flex items-start gap-2.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 mt-2"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-slate-600 leading-relaxed">{s.text}</p>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Growth Areas */}
          <motion.div
            className="card-lumino p-6"
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            role="region"
            aria-label="Growth areas"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <TrendingUp size={16} className="text-amber-600" aria-hidden="true" />
              </div>
              <h3 className="font-extrabold text-indigo-950 tracking-tight">Growth Areas</h3>
            </div>
            <ul className="space-y-3" aria-label="List of growth areas">
              {GROWTH_AREAS.map((g) => (
                <li key={g.id} className="flex items-start gap-2.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-2"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-slate-600 leading-relaxed">{g.text}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                <Info size={13} className="text-amber-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Focus on System Design first - it has the highest impact on your target role progression.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Role Trajectory Fit */}
          <motion.div
            className="card-lumino p-6"
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            role="region"
            aria-label="Role trajectory fit"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <Award size={16} className="text-blue-600" aria-hidden="true" />
              </div>
              <h3 className="font-extrabold text-indigo-950 tracking-tight">Role Trajectory Fit</h3>
            </div>

            {/* Pie Chart */}
            <div
              className="h-44"
              role="img"
              aria-label="Pie chart showing 85% role alignment"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={PIE_DATA}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={2}
                    dataKey="value"
                    labelLine={false}
                  >
                    {PIE_DATA.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={PIE_COLORS[index]}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <CenterLabel cx={undefined} cy={undefined} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex justify-center gap-6 mt-2">
              {PIE_DATA.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[i] }}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-slate-500">{d.name}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400 text-center mt-3 leading-relaxed">
              Based on skill graph alignment with Senior Engineer role requirements.
            </p>
          </motion.div>

        </div>

        {/* ── Actionable Next Steps ── */}
        <section aria-labelledby="next-steps-heading">
          <h2
            id="next-steps-heading"
            className="text-lg font-extrabold text-indigo-950 tracking-tight mb-4"
          >
            Actionable Next Steps
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {NEXT_STEPS.map((step) => (
              <motion.div
                key={step.id}
                className={`rounded-2xl p-5 border ${step.color} flex flex-col gap-3`}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              >
                <step.icon size={20} aria-hidden="true" />
                <div>
                  <h3 className="font-bold text-sm text-indigo-950">{step.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{step.description}</p>
                </div>
                <Link
                  to={step.href}
                  className="inline-flex items-center gap-1.5 text-xs font-bold mt-auto focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 rounded"
                  aria-label={`${step.cta} - ${step.title}`}
                >
                  {step.cta}
                  <ExternalLink size={11} aria-hidden="true" />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Inspirational Quote ── */}
        <div
          className="card-lumino p-8 text-center"
          role="complementary"
          aria-label="Inspirational quote"
        >
          <blockquote className="text-lg font-bold text-indigo-950 tracking-tight max-w-2xl mx-auto leading-relaxed">
            "The expert in anything was once a beginner. Every senior engineer started
            exactly where you are now."
          </blockquote>
          <p className="text-sm text-slate-400 mt-3 font-medium">- Lumino Career Coach</p>
        </div>

        {/* ── Footer Links ── */}
        <footer className="flex flex-wrap items-center justify-center gap-6 py-4 text-xs text-slate-400" role="contentinfo">
          {[
            { label: 'Privacy Policy', to: '#' },
            { label: 'Terms of Service', to: '#' },
            { label: 'Help Centre', to: '#' },
            { label: 'Contact Support', to: '#' },
          ].map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className="hover:text-indigo-950 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 rounded"
            >
              {link.label}
            </Link>
          ))}
          <span>© {new Date().getFullYear()} Lumino. All rights reserved.</span>
        </footer>

      </div>
    </>
  );
}
