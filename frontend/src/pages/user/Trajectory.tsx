import {
  ArrowRight,
  CheckCircle,
  Maximize2,
  Plus,
  Target,
  TrendingUp,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string;
  label: string;
  role: string;
  year: string;
  type: 'past' | 'current' | 'future';
  top: string;
  left: string;
}

interface SkillBar {
  skill: string;
  pct: number;
  status: 'critical' | 'gap' | 'on-track';
}

interface RecommendedRole {
  title: string;
  company: string;
  match: number;
  jobId: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MILESTONES: Milestone[] = [
  { id: 'm1', label: 'Software Engineer', role: 'Junior Developer', year: '2020', type: 'past', top: '60%', left: '12%' },
  { id: 'm2', label: 'Mid Engineer', role: 'Full-Stack Developer', year: '2022', type: 'past', top: '42%', left: '32%' },
  { id: 'm3', label: 'Senior Engineer', role: 'Current Role', year: '2024', type: 'current', top: '28%', left: '53%' },
  { id: 'm4', label: 'Tech Lead', role: 'Target Role', year: '2026', type: 'future', top: '18%', left: '72%' },
  { id: 'm5', label: 'Principal Engineer', role: 'Vision', year: '2028', type: 'future', top: '12%', left: '88%' },
];

const SKILL_BARS: SkillBar[] = [
  { skill: 'System Design', pct: 35, status: 'critical' },
  { skill: 'Team Leadership', pct: 52, status: 'gap' },
  { skill: 'TypeScript', pct: 88, status: 'on-track' },
  { skill: 'Cloud Architecture', pct: 61, status: 'gap' },
  { skill: 'React / Next.js', pct: 92, status: 'on-track' },
];

const RECOMMENDED_ROLES: RecommendedRole[] = [
  { title: 'Senior Full-Stack Engineer', company: 'Stripe', match: 94, jobId: 'job-001' },
  { title: 'Tech Lead - Platform', company: 'Vercel', match: 88, jobId: 'job-002' },
  { title: 'Staff Engineer', company: 'Linear', match: 81, jobId: 'job-003' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: SkillBar['status']): string {
  if (status === 'critical') return 'bg-red-500';
  if (status === 'gap') return 'bg-orange-400';
  return 'bg-emerald-500';
}

function statusTextColor(status: SkillBar['status']): string {
  if (status === 'critical') return 'text-red-600';
  if (status === 'gap') return 'text-orange-500';
  return 'text-emerald-600';
}

function statusLabel(status: SkillBar['status']): string {
  if (status === 'critical') return 'Critical';
  if (status === 'gap') return 'Gap';
  return 'On Track';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Trajectory() {
  const navigate = useNavigate();

  return (
    <>
      <title>Career Trajectory - Lumino</title>

      <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-indigo-950 tracking-tight flex items-center gap-3">
              <TrendingUp size={28} className="text-blue-500" aria-hidden="true" />
              Career Trajectory Map
            </h1>
            <p className="text-slate-500 mt-1.5 text-sm">
              Visualise your past milestones, current position, and AI-projected future path.
            </p>
          </div>
          <motion.button
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="btn-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            aria-label="Add a new career milestone"
          >
            <Plus size={16} aria-hidden="true" />
            Add Milestone
          </motion.button>
        </div>

        {/* ── Main Visualization Card ── */}
        <div
          className="card-lumino relative overflow-hidden"
          style={{ minHeight: '500px' }}
          role="region"
          aria-label="Career trajectory visualization"
        >
          {/* Dot grid background */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
            aria-hidden="true"
          />

          {/* Trajectory path SVG line */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#818CF8" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            {/* Rough curve from left milestones to right */}
            <path
              d="M 120,300 C 200,270 260,210 320,200 S 440,160 520,140 S 640,110 720,100"
              fill="none"
              stroke="url(#pathGradient)"
              strokeWidth="2.5"
              strokeDasharray="6 3"
            />
          </svg>

          {/* Milestone nodes */}
          {MILESTONES.map((m) => (
            <div
              key={m.id}
              className="absolute"
              style={{ top: m.top, left: m.left, transform: 'translate(-50%, -50%)' }}
            >
              {m.type === 'current' ? (
                /* Glowing current node */
                <div className="relative flex items-center justify-center" role="img" aria-label={`Current milestone: ${m.label}`}>
                  <span className="absolute w-10 h-10 rounded-full border-2 border-blue-400 animate-pulse" aria-hidden="true" />
                  <span className="absolute w-14 h-14 rounded-full border border-blue-300 opacity-40 animate-pulse" style={{ animationDelay: '0.3s' }} aria-hidden="true" />
                  <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white shadow-lg shadow-blue-500/40 z-10 flex items-center justify-center">
                    <CheckCircle size={14} className="text-white" aria-hidden="true" />
                  </div>
                  <div className="absolute top-10 left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap text-center">
                    <p className="text-xs font-bold text-indigo-950">{m.label}</p>
                    <p className="text-[10px] text-blue-600 font-semibold">{m.year} · Now</p>
                  </div>
                </div>
              ) : m.type === 'past' ? (
                /* Past milestone */
                <div role="img" aria-label={`Past milestone: ${m.label}, ${m.year}`}>
                  <div className="w-6 h-6 rounded-full bg-slate-300 border-2 border-white shadow-md flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-slate-500" aria-hidden="true" />
                  </div>
                  <div className="absolute top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                    <p className="text-[10px] font-bold text-slate-600">{m.label}</p>
                    <p className="text-[9px] text-slate-400">{m.year}</p>
                  </div>
                </div>
              ) : (
                /* Future milestone */
                <div role="img" aria-label={`Future milestone: ${m.label}, target ${m.year}`}>
                  <div className="w-6 h-6 rounded-full bg-indigo-100 border-2 border-indigo-300 border-dashed shadow flex items-center justify-center">
                    <Target size={10} className="text-indigo-400" aria-hidden="true" />
                  </div>
                  <div className="absolute top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                    <p className="text-[10px] font-bold text-indigo-600">{m.label}</p>
                    <p className="text-[9px] text-indigo-400">{m.year}</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ── AI Acceleration Tip overlay (bottom-left) ── */}
          <div
            className="absolute bottom-5 left-5 max-w-xs rounded-2xl p-4"
            style={{ background: 'rgba(15, 23, 63, 0.92)', backdropFilter: 'blur(8px)' }}
            role="complementary"
            aria-label="AI acceleration tip"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center">
                <Zap size={12} className="text-white" aria-hidden="true" />
              </div>
              <p className="text-xs font-bold text-white">AI Acceleration Tip</p>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Completing System Design coursework could accelerate your path to Tech Lead by{' '}
              <span className="text-blue-400 font-semibold">8–12 months</span>. This is your highest-leverage skill gap.
            </p>
          </div>

          {/* Zoom controls (bottom-right) */}
          <div
            className="absolute bottom-5 right-5 flex gap-2"
            role="group"
            aria-label="Visualization controls"
          >
            {[
              { icon: ZoomIn, label: 'Zoom in' },
              { icon: ZoomOut, label: 'Zoom out' },
              { icon: Maximize2, label: 'Fit to screen' },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                aria-label={label}
                className="w-9 h-9 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-indigo-950 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
              >
                <Icon size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        {/* ── Analysis Cards Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Skill Gap Analysis */}
          <motion.div
            className="card-lumino p-6"
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            role="region"
            aria-label="Skill gap analysis"
          >
            <h2 className="text-base font-extrabold text-indigo-950 tracking-tight mb-4">
              Skill Gap Analysis
            </h2>
            <ul className="space-y-3" aria-label="Skills and their progress">
              {SKILL_BARS.map((bar) => (
                <li key={bar.skill}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-700">{bar.skill}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${statusTextColor(bar.status)}`}>
                        {statusLabel(bar.status)}
                      </span>
                      <span className="text-xs text-slate-400">{bar.pct}%</span>
                    </div>
                  </div>
                  <div
                    className="h-2 bg-slate-100 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={bar.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${bar.skill}: ${bar.pct}%`}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${statusColor(bar.status)}`}
                      style={{ width: `${bar.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center gap-4 pt-4 border-t border-slate-100">
              {[
                { color: 'bg-red-500', label: 'Critical' },
                { color: 'bg-orange-400', label: 'Gap' },
                { color: 'bg-emerald-500', label: 'On Track' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${color}`} aria-hidden="true" />
                  <span className="text-xs text-slate-500">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recommended Roles */}
          <motion.div
            className="card-lumino p-6"
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            role="region"
            aria-label="Recommended roles"
          >
            <h2 className="text-base font-extrabold text-indigo-950 tracking-tight mb-4">
              Recommended Roles
            </h2>
            <ul className="space-y-3" aria-label="Matching job recommendations">
              {RECOMMENDED_ROLES.map((role) => (
                <li key={role.jobId}>
                  <motion.button
                    onClick={() => navigate('/dashboard')}
                    whileHover={{ x: 4 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 transition-colors group focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 text-left"
                    aria-label={`${role.title} at ${role.company} - ${role.match}% match. Click to view on dashboard.`}
                  >
                    <div>
                      <p className="text-sm font-bold text-indigo-950 group-hover:text-blue-700 transition-colors">
                        {role.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{role.company}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-extrabold text-blue-600 leading-none">{role.match}%</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">match</p>
                      </div>
                      <ArrowRight
                        size={16}
                        className="text-slate-300 group-hover:text-blue-500 transition-colors"
                        aria-hidden="true"
                      />
                    </div>
                  </motion.button>
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-secondary w-full mt-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
              aria-label="See all job matches on dashboard"
            >
              See All Matches
            </button>
          </motion.div>

        </div>
      </div>
    </>
  );
}
