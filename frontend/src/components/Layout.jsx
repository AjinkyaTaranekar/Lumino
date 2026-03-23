import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LogOut, Briefcase, LayoutDashboard, Network, Upload,
  Shield, BookOpen, Users, ShieldCheck, ShieldAlert, User,
  ChevronLeft, ChevronRight, Zap,
} from 'lucide-react'
import { api } from '../lib/api'

function VerifyBadge({ userId }) {
  const [pending, setPending] = useState(null)

  useEffect(() => {
    if (!userId) return
    api.getClarifications(userId)
      .then(d => setPending(d.questions.filter(q => q.status === 'pending' && q.resolution_impact === 'critical').length))
      .catch(() => {})
  }, [userId])

  if (!pending) return null
  return (
    <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-danger-500 text-white text-[10px] font-bold px-1">
      {pending > 9 ? '9+' : pending}
    </span>
  )
}

const seekerNav = [
  { to: '/user/upload',         icon: Upload,          label: 'Upload Resume' },
  { to: '/user/guidelines',     icon: BookOpen,        label: 'Resume Guide' },
  { to: '/user/clarifications', icon: ShieldAlert,     label: 'Verify Profile', badge: true },
  { to: '/user/profile',        icon: User,            label: 'My Profile' },
  { to: '/user/model',          icon: Network,         label: 'Knowledge Graph' },
  { to: '/user/dashboard',      icon: LayoutDashboard, label: 'Job Dashboard' },
]

const recruiterNav = [
  { to: '/recruiter/post',       icon: Briefcase, label: 'Post a Job' },
  { to: '/recruiter/candidates', icon: Users,     label: 'Find Candidates' },
]

const adminNav = [
  { to: '/admin', icon: Shield, label: 'Manage Users & Jobs' },
]

export default function Layout({ children }) {
  const { session, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const nav =
    session?.role === 'recruiter' ? recruiterNav
    : session?.role === 'admin'   ? adminNav
    : seekerNav

  const roleLabel =
    session?.role === 'recruiter' ? 'Recruiter'
    : session?.role === 'admin'   ? 'Admin'
    : 'Job Seeker'

  return (
    <div className="flex h-screen overflow-hidden bg-surface-bg">
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 border-r border-surface-border bg-white transition-all duration-200"
        style={{ width: collapsed ? 64 : 224 }}>

        {/* Brand */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-surface-border">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
                <Zap size={14} className="text-white" />
              </div>
              <span className="font-bold text-sm text-content-primary tracking-tight">Lumino</span>
            </div>
          )}
          {collapsed && (
            <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center mx-auto">
              <Zap size={14} className="text-white" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="btn-ghost p-1 rounded-md ml-auto flex-shrink-0"
            title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed
              ? <ChevronRight size={14} className="text-content-muted" />
              : <ChevronLeft  size={14} className="text-content-muted" />}
          </button>
        </div>

        {/* User info */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-surface-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center text-sm font-bold text-primary-600 flex-shrink-0">
                {session?.userId?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-content-primary truncate">{session?.userId}</p>
                <p className="text-xs text-content-muted">{roleLabel}</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label, badge }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/')
            return (
              <Link
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-content-muted hover:text-content-primary hover:bg-surface-raised'
                }`}>
                <Icon size={16} className="flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{label}</span>
                    {badge && session?.role !== 'recruiter' && session?.role !== 'admin' && (
                      <VerifyBadge userId={session?.userId} />
                    )}
                  </>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-2 pb-4 border-t border-surface-border pt-3">
          <button
            onClick={() => { logout(); navigate('/login') }}
            className={`flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-sm text-content-muted hover:text-danger-500 hover:bg-danger-50 transition-colors ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Sign Out' : undefined}>
            <LogOut size={16} className="flex-shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
