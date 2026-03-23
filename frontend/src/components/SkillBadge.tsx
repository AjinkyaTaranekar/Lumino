type BadgeVariant = 'match' | 'missing' | 'neutral' | 'info' | 'danger'

const VARIANTS: Record<BadgeVariant, string> = {
  match:   'bg-emerald-50 text-emerald-600 border border-emerald-100',
  missing: 'bg-amber-50 text-amber-600 border border-amber-100',
  neutral: 'bg-gray-50 text-gray-500 border border-gray-200',
  info:    'bg-blue-50 text-blue-600 border border-blue-100',
  danger:  'bg-red-50 text-red-600 border border-red-100',
}

interface SkillBadgeProps {
  label: string
  variant?: BadgeVariant
}

export default function SkillBadge({ label, variant = 'neutral' }: SkillBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${VARIANTS[variant] ?? VARIANTS.neutral}`}
    >
      {label}
    </span>
  )
}
