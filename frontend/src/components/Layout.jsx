import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogOut, Briefcase, LayoutDashboard, Network, Upload, Shield, BookOpen, Users, ShieldCheck, ShieldAlert, User } from 'lucide-react'
import { api } from '../lib/api'

function VerifyBadge({ userId }) {
  const [pending, setPending] = useState(null)

  useEffect(() => {
    if (!userId) return
    api.getClarifications(userId)
      .then(d => setPending(d.questions.filter(q => q.status === 'pending' && q.resolution_impact === 'critical').length))
      .catch(() => {})
  }, [userId])

  if (pending === null) return null
  if (pending === 0) return <ShieldCheck size={12} style={{ color: '#27ae60' }} />
  return (
    <span
      className="text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center"
      style={{ background: '#e94560', color: '#fff', fontSize: 9 }}>
      {pending > 9 ? '9+' : pending}
    </span>
  )
}

const seekerNav = [
  { to: '/user/upload',          icon: Upload,          label: 'Upload Resume' },
  { to: '/user/guidelines',      icon: BookOpen,        label: 'Resume Guide' },
  { to: '/user/clarifications',  icon: ShieldAlert,     label: 'Verify Profile', badge: true },
  { to: '/user/profile',         icon: User,            label: 'My Profile' },
  { to: '/user/model',           icon: Network,         label: 'My Model' },
  { to: '/user/dashboard',       icon: LayoutDashboard, label: 'Job Dashboard' },
]

const recruiterNav = [
  { to: '/recruiter/post',       icon: Briefcase, label: 'Post Job' },
  { to: '/recruiter/candidates', icon: Users,     label: 'Find Candidates' },
]

const adminNav = [
  { to: '/admin', icon: Shield, label: 'Manage Users & Jobs' },
]

export default function Layout({ children }) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const nav =
    session?.role === 'recruiter' ? recruiterNav
    : session?.role === 'admin'   ? adminNav
    : seekerNav

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex flex-col w-56 flex-shrink-0 border-r"
             style={{ background: '#16213e', borderColor: '#0f3460' }}>
        {/* Brand */}
        <div className="px-5 py-5 border-b" style={{ borderColor: '#0f3460' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: '#e94560' }}>
              <Network size={14} color="white" />
            </div>
            <span className="font-bold text-sm tracking-wide" style={{ color: '#e0e0e0' }}>
              Adaptive
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: '#8892a4' }}>Job Matching</p>
        </div>

        {/* User info */}
        <div className="px-5 py-4 border-b" style={{ borderColor: '#0f3460' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                 style={{ background: '#0f3460', color: '#e94560' }}>
              {session?.userId?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: '#e0e0e0' }}>
                {session?.userId}
              </p>
              <p className="text-xs capitalize" style={{ color: '#8892a4' }}>
                {session?.role === 'recruiter' ? 'Recruiter'
                  : session?.role === 'admin' ? 'Admin'
                  : 'Job Seeker'}
              </p>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, icon: Icon, label, badge }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/')
            return (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  background: active ? 'rgba(233,69,96,0.12)' : 'transparent',
                  color: active ? '#e94560' : '#8892a4',
                }}>
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {badge && session?.role !== 'recruiter' && session?.role !== 'admin' && (
                  <VerifyBadge userId={session?.userId} />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-5">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ color: '#8892a4' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e94560'}
            onMouseLeave={e => e.currentTarget.style.color = '#8892a4'}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto" style={{ background: '#1a1a2e' }}>
        {children}
      </main>
    </div>
  )
}
