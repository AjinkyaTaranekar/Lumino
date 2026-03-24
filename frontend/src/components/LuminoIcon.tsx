import { Sparkles } from 'lucide-react'

const SIZES = {
  xs:  { box: 'w-6 h-6',  radius: 'rounded-lg',  icon: 11 },
  sm:  { box: 'w-7 h-7',  radius: 'rounded-lg',  icon: 14 },
  md:  { box: 'w-9 h-9',  radius: 'rounded-xl',  icon: 18 },
  lg:  { box: 'w-12 h-12', radius: 'rounded-2xl', icon: 22 },
  xl:  { box: 'w-16 h-16', radius: 'rounded-3xl', icon: 30 },
  '2xl': { box: 'w-20 h-20', radius: 'rounded-3xl', icon: 36 },
} as const

interface LuminoIconProps {
  size?: keyof typeof SIZES
  shadow?: boolean
  className?: string
}

export default function LuminoIcon({ size = 'md', shadow = false, className = '' }: LuminoIconProps) {
  const s = SIZES[size]
  return (
    <div
      className={`${s.box} ${s.radius} bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 ${shadow ? 'shadow-xl shadow-blue-200' : ''} ${className}`}
    >
      <Sparkles size={s.icon} className="text-white" />
    </div>
  )
}
