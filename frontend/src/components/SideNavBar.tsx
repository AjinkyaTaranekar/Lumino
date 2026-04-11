import {
  BookOpen,
  Briefcase,
  Database,
  Heart,
  LayoutDashboard,
  Network,
  ShieldAlert,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ size?: number }>;
}

export function SideNavBar() {
  const { user, session } = useAuth();
  const [profileUnverified, setProfileUnverified] = useState(false);

  useEffect(() => {
    if (user?.role !== 'USER' || !session?.userId) return;
    api.getClarifications(session.userId)
      .then(data => setProfileUnverified(!data.graph_verified || data.pending > 0))
      .catch(() => { });
  }, [user?.role, session?.userId]);

  const navItems: NavItem[] = user?.role === 'USER'
    ? [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'My Profile', to: '/user/profile', icon: UserIcon },
      { label: 'Preference Intelligence', to: '/user/interests', icon: Heart },
      { label: 'Upload Resume', to: '/resume', icon: Upload },
      { label: 'Profile Accuracy', to: '/user/clarifications', icon: ShieldAlert },
      { label: 'Digital Twin', to: '/user/model', icon: Network },
      { label: 'Resume Guide', to: '/user/guidelines', icon: BookOpen },
    ]
    : user?.role === 'RECRUITER'
      ? [
        { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
        { label: 'Jobs', to: '/jobs', icon: Briefcase },
        { label: 'Publish Role', to: '/jobs/create', icon: Database },
      ]
      : [
        { label: 'Admin Console', to: '/admin', icon: Database },
      ];

  return (
    <aside
      className="hidden lg:flex flex-col h-[calc(100vh-64px)] w-64 fixed left-0 top-16 bg-slate-50/50 backdrop-blur-xl p-4 space-y-2 font-medium z-40 border-r border-slate-100"
      aria-label="Sidebar navigation"
    >
      <nav className="flex-1 space-y-1" role="navigation">
        {navItems.map((item) => {
          const showAlert = item.to === '/user/clarifications' && profileUnverified;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:translate-x-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${isActive
                  ? 'bg-white text-blue-700 shadow-sm font-bold border border-slate-200/50'
                  : showAlert
                    ? 'text-amber-600 hover:bg-amber-50/60'
                    : 'text-slate-600 hover:bg-slate-200/50'
                }`
              }
              aria-current={({ isActive }: { isActive: boolean }) => isActive ? 'page' : undefined}
              aria-label={showAlert ? `${item.label} - action required` : item.label}
            >
              <div className="relative flex-shrink-0">
                <item.icon size={20} aria-hidden="true" />
                {showAlert && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3" aria-hidden="true">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                  </span>
                )}
              </div>
              <span className="text-sm flex-1">{item.label}</span>
              {showAlert && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  !
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

    </aside>
  );
}
