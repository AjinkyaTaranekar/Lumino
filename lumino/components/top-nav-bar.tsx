'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { Bell, Grid, User as UserIcon, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TopNavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navItems = user?.role === 'USER' ? [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'My Applications', href: '/applications' },
    { label: 'Practice', href: '/practice' },
  ] : [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Talent Pool', href: '/talent-pool' },
    { label: 'Jobs', href: '/jobs' },
    { label: 'Analytics', href: '/analytics' },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-[0_20px_40px_rgba(24,20,69,0.06)]">
      <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 group cursor-pointer active:scale-95 transition-transform">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <span className="font-black text-xl">L</span>
            </div>
            <span className="text-2xl font-bold tracking-tighter text-indigo-950 font-display">Lumino</span>
          </Link>
          <div className="hidden md:flex space-x-6 items-center">
            {navItems.map((item) => (
              <Link 
                key={item.href}
                href={item.href}
                className={`text-sm font-semibold tracking-tight font-display transition-colors duration-200 ${
                  pathname === item.href ? 'text-blue-700 border-b-2 border-blue-700 pb-1' : 'text-slate-500 hover:text-indigo-950'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
              <Bell size={20} />
            </button>
            <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
              <Grid size={20} />
            </button>
          </div>
          <div className="flex items-center gap-3 pl-4 border-l border-slate-100">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-indigo-950 font-display">{user?.name}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{user?.role}</p>
            </div>
            <div className="relative group">
              <div className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden ring-2 ring-white shadow-sm cursor-pointer">
                <img 
                  alt="Profile" 
                  className="w-full h-full object-cover" 
                  src={`https://picsum.photos/seed/${user?.id}/100/100`} 
                />
              </div>
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <button 
                  onClick={logout}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
