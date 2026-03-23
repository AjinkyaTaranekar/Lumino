import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Menu, X } from 'lucide-react';

interface NavItem {
  label: string;
  to: string;
}

export function TopNavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = user?.role === 'USER'
    ? [
        { label: 'Dashboard',        to: '/dashboard'  },
        { label: 'Trajectory Map',   to: '/trajectory' },
        { label: 'My Applications',  to: '/applications' },
        { label: 'Practice',         to: '/practice'   },
      ]
    : user?.role === 'RECRUITER'
    ? [
        { label: 'Dashboard',   to: '/dashboard'  },
        { label: 'Talent Pool', to: '/talent-pool' },
        { label: 'Jobs',        to: '/jobs'        },
      ]
    : [
        { label: 'Admin Console', to: '/admin' },
      ];

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header
      className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-[0_20px_40px_rgba(24,20,69,0.06)]"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">

        {/* Logo + desktop nav */}
        <div className="flex items-center gap-6 lg:gap-8">
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2 group cursor-pointer active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded"
            aria-label="Lumino home"
          >
            <img
              src="/logo.png"
              alt="Lumino logo"
              className="w-9 h-9 object-contain"
            />
            <span className="text-2xl font-bold tracking-tighter text-indigo-950">Lumino</span>
          </NavLink>

          {/* Desktop nav links */}
          <nav className="hidden md:flex space-x-5 lg:space-x-6 items-center" aria-label="Main navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm font-semibold tracking-tight transition-colors duration-200 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded ${
                    isActive
                      ? 'text-blue-700 border-b-2 border-blue-700'
                      : 'text-slate-500 hover:text-indigo-950'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right side: notifications + profile */}
        <div className="flex items-center gap-3 sm:gap-5">
          {/* Profile */}
          <div className="flex items-center gap-3 sm:pl-4 sm:border-l sm:border-slate-100">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-bold text-indigo-950">{user?.name}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{user?.role}</p>
            </div>
            <div className="relative group">
              <div
                className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden ring-2 ring-white shadow-sm cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label="User menu"
                aria-haspopup="true"
              >
                <img
                  src={`https://picsum.photos/seed/${user?.id}/100/100`}
                  alt={user?.name ?? 'Profile'}
                  className="w-full h-full object-cover"
                />
              </div>
              {/* Dropdown */}
              <div
                className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
                role="menu"
              >
                <div className="px-4 py-2 border-b border-slate-100 mb-1">
                  <p className="text-sm font-bold text-indigo-950">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                  role="menuitem"
                >
                  <LogOut size={16} aria-hidden="true" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            onClick={() => setMobileOpen(o => !o)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-controls="mobile-menu"
          >
            {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav
          id="mobile-menu"
          className="md:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-2"
          aria-label="Mobile navigation"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
          >
            Sign Out
          </button>
        </nav>
      )}
    </header>
  );
}
