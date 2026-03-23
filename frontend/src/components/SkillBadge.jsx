const VARIANTS = {
  match:   'bg-success-50 text-success-600 border border-success-100',
  missing: 'bg-warning-50 text-warning-600 border border-warning-100',
  neutral: 'bg-gray-50 text-gray-500 border border-gray-200',
  info:    'bg-primary-50 text-primary-600 border border-primary-100',
  danger:  'bg-danger-50 text-danger-600 border border-danger-100',
}

export default function SkillBadge({ label, variant = 'neutral' }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${VARIANTS[variant] || VARIANTS.neutral}`}>
      {label}
    </span>
  )
}
