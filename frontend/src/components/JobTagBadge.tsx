/**
 * Semantic tag badge for job postings.
 * Distinct from SkillBadge — these represent job character, not technical requirements.
 *
 * Variants:
 *   interest  — user has positive interest in this tag (score > 0.5)
 *   neutral   — no strong interest data
 *   muted     — user has shown disinterest (score < 0.4)
 */

const TAG_CATEGORY_ICONS: Record<string, string> = {
  work_style: '🏠',
  compensation: '💰',
  culture: '🌱',
  tech: '⚙️',
  impact: '🎯',
};

const VARIANT_STYLES: Record<string, string> = {
  interest: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  neutral:  'bg-slate-50 text-slate-500 border border-slate-200',
  muted:    'bg-red-50 text-red-400 border border-red-100 opacity-60',
};

interface JobTagBadgeProps {
  tag: string;
  category?: string;
  variant?: 'interest' | 'neutral' | 'muted';
}

export default function JobTagBadge({ tag, category, variant = 'neutral' }: JobTagBadgeProps) {
  const icon = category ? TAG_CATEGORY_ICONS[category] : null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${VARIANT_STYLES[variant]}`}>
      {icon && <span className="text-[10px]">{icon}</span>}
      {tag}
    </span>
  );
}
