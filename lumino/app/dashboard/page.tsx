'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { TopNavBar } from '@/components/top-nav-bar';
import { SideNavBar } from '@/components/side-nav-bar';
import { motion } from 'motion/react';
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'USER') {
    return <UserDashboard />;
  } else if (user?.role === 'RECRUITER') {
    return <RecruiterDashboard />;
  } else {
    return <AdminDashboard />;
  }
}

function UserDashboard() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-24 p-8">
        <header className="mb-10 max-w-6xl">
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Welcome back, Lara</h1>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl leading-relaxed">
            Your career trajectory is on track. You have 3 new feedback reports to review.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
          {/* Quick Stats */}
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Profile Match</h3>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-indigo-950">85%</span>
              <span className="text-emerald-500 font-bold text-sm mb-1">+5% this week</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Active Applications</h3>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-indigo-950">12</span>
              <span className="text-slate-400 font-bold text-sm mb-1">4 pending review</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Skill Growth</h3>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-indigo-950">14</span>
              <span className="text-primary font-bold text-sm mb-1">New traits mapped</span>
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
          <div className="bg-white rounded-2xl shadow-prism border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h2 className="text-xl font-bold text-indigo-950">Recent Feedback</h2>
              <Link href="/applications" className="text-sm font-bold text-primary hover:underline">View All</Link>
            </div>
            <div className="divide-y divide-slate-50">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-6 hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-indigo-950">Senior Backend Engineer</h3>
                    <span className="text-[10px] font-bold uppercase py-1 px-2 bg-green-50 text-green-600 rounded-full">Complete</span>
                  </div>
                  <p className="text-sm text-slate-500">FintechCorp • September 14, 2023</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-indigo-950 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-2xl font-bold mb-4">Ready for your next interview?</h2>
              <p className="text-indigo-200 mb-8 max-w-xs">The Digital Curator is ready to analyze your behavioral logic and technical depth.</p>
              <Link href="/interview" className="inline-flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg shadow-primary/20">
                Start Practice Session
              </Link>
            </div>
            <div className="absolute -right-10 -bottom-10 opacity-10">
              <TrendingUp size={240} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function RecruiterDashboard() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-24 p-8">
        <header className="mb-10 max-w-6xl">
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Recruiter Portal</h1>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl leading-relaxed">
            Managing 8 active trajectories across 3 departments.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl">
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Total Candidates</h3>
            <span className="text-4xl font-black text-indigo-950">1,240</span>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">High Match</h3>
            <span className="text-4xl font-black text-primary">42</span>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Interviews Today</h3>
            <span className="text-4xl font-black text-indigo-950">8</span>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Time to Hire</h3>
            <span className="text-4xl font-black text-indigo-950">14d</span>
          </div>
        </div>

        <div className="mt-12 max-w-6xl">
          <div className="bg-white rounded-2xl shadow-prism border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h2 className="text-xl font-bold text-indigo-950">Active Openings</h2>
              <Link href="/jobs/create" className="text-sm font-bold text-primary hover:underline">+ Create New</Link>
            </div>
            <div className="divide-y divide-slate-50">
              {[
                { title: 'Senior Backend Engineer', dept: 'Engineering', candidates: 12 },
                { title: 'Product Marketing Manager', dept: 'Marketing', candidates: 8 },
                { title: 'Lead Frontend Developer', dept: 'Engineering', candidates: 15 },
              ].map((job, i) => (
                <div key={i} className="p-6 hover:bg-slate-50 transition-colors cursor-pointer flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-indigo-950">{job.title}</h3>
                    <p className="text-sm text-slate-500">{job.dept}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">{job.candidates} Candidates</p>
                    <p className="text-[10px] text-slate-400 uppercase font-black">4 High Match</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function AdminDashboard() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-24 p-8">
        <header className="mb-10 max-w-6xl">
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">System Administration</h1>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl leading-relaxed">
            Global system health and user management.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl">
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Graph Nodes</h3>
            <span className="text-4xl font-black text-indigo-950">45,201</span>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">API Latency</h3>
            <span className="text-4xl font-black text-emerald-500">124ms</span>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-prism border border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Active Sessions</h3>
            <span className="text-4xl font-black text-indigo-950">892</span>
          </div>
        </div>
      </main>
    </div>
  );
}
