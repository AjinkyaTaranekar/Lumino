import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  TrendingUp,
  Database,
  Settings,
  HelpCircle,
  Rocket,
} from 'lucide-react'

export default function SideNavBar() {
  const { session } = useAuth()
  const location = useLocation()

  const isSeeker = session?.role === 'seeker'

  const navItems = isSeeker
    ? [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Trajectory Map', href: '/trajectory', icon: TrendingUp },
        { label: 'Jobs', href: '/jobs', icon: Briefcase },
        { label: 'Model', href: '/model', icon: Database },
        { label: 'Network', href: '/network', icon: Users },
      ]
    : [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Talent Pool', href: '/talent-pool', icon: Users },
        { label: 'Jobs', href: '/jobs', icon: Briefcase },
        { label: 'Trajectory Map', href: '/trajectory', icon: TrendingUp },
        { label: 'Model', href: '/model', icon: Database },
      ]

  return (
    <aside className="hidden lg:flex flex-col h-[calc(100vh-64px)] w-64 fixed left-0 top-16 bg-slate-50/50 backdrop-blur-xl p-4 space-y-2 font-medium z-40 border-r border-slate-100">
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:translate-x-1 ${
              location.pathname === item.href
                ? 'bg-white text-blue-700 shadow-sm font-bold border border-slate-200/50'
                : 'text-slate-600 hover:bg-slate-200/50'
            }`}
          >
            <item.icon size={20} />
            <span className="text-sm">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-4 space-y-1">
        <div className="p-4 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/30 mb-4 cursor-pointer hover:bg-blue-700 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <Rocket size={16} />
            <p className="font-bold text-sm">Upgrade to Pro</p>
          </div>
          <p className="text-[10px] opacity-90">Unlock advanced AI forecasting</p>
        </div>
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-indigo-950 transition-colors"
        >
          <Settings size={18} />
          <span className="text-sm">Settings</span>
        </NavLink>
        <NavLink
          to="/support"
          className="flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-indigo-950 transition-colors"
        >
          <HelpCircle size={18} />
          <span className="text-sm">Support</span>
        </NavLink>
      </div>
    </aside>
  )
}
