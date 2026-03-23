'use client';

import React from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { SideNavBar } from '@/components/side-nav-bar';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  Map as MapIcon, 
  Users, 
  Zap, 
  CheckCircle, 
  MessageSquare,
  Calendar,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';

export default function CandidateProfilePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-24 p-8">
        <Link href="/talent-pool" className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-950 font-bold text-sm mb-8 transition-colors">
          <ArrowLeft size={16} />
          Back to Talent Pool
        </Link>

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Profile Header & Info */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8 flex flex-col md:flex-row gap-8 items-center md:items-start">
              <div className="relative">
                <div className="w-32 h-32 rounded-3xl overflow-hidden shadow-xl border-4 border-white">
                  <img src="https://picsum.photos/seed/elena/200/200" alt="Elena Rodriguez" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-primary rounded-2xl border-4 border-white flex items-center justify-center text-white font-black text-sm shadow-lg">
                  96%
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div>
                    <h1 className="text-3xl font-extrabold text-indigo-950 font-display">Elena Rodriguez</h1>
                    <p className="text-lg font-medium text-slate-500">Senior Backend Engineer @ FintechCorp</p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <button className="bg-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-primary-dark transition-all">
                      Schedule Interview
                    </button>
                    <button className="bg-slate-100 text-slate-600 p-3 rounded-xl hover:bg-slate-200 transition-all">
                      <MessageSquare size={20} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  {['Distributed Systems', 'Go', 'Kubernetes', 'Staff Potential'].map(tag => (
                    <span key={tag} className="text-[10px] font-black uppercase px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg border border-slate-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Trajectory Analysis */}
            <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold text-indigo-950 flex items-center gap-2">
                  <MapIcon className="text-primary" size={24} />
                  Trajectory Analysis
                </h2>
                <span className="text-[10px] font-black uppercase text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full">High Velocity</span>
              </div>
              
              <div className="relative h-48 flex items-center justify-center mb-8">
                <div className="absolute w-full h-1 bg-slate-50 top-1/2 -translate-y-1/2">
                  <div className="h-full bg-primary w-3/4 shadow-[0_0_15px_rgba(59,130,246,0.3)]"></div>
                </div>
                <div className="w-full flex justify-between relative z-10 px-4">
                  {[
                    { label: 'Junior', year: '2019', active: true },
                    { label: 'Mid-Level', year: '2021', active: true },
                    { label: 'Senior', year: '2023', active: true, current: true },
                    { label: 'Staff', year: '2025', active: false },
                  ].map((m, i) => (
                    <div key={i} className="flex flex-col items-center gap-3">
                      <div className={`w-10 h-10 rounded-full border-4 flex items-center justify-center ${
                        m.current ? 'bg-white border-primary shadow-lg scale-125' : 
                        m.active ? 'bg-primary border-primary text-white' : 'bg-white border-slate-100'
                      }`}>
                        {m.active && !m.current ? <CheckCircle size={16} /> : null}
                      </div>
                      <div className="text-center">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${m.current ? 'text-primary' : 'text-slate-400'}`}>{m.year}</p>
                        <p className={`text-xs font-bold ${m.current ? 'text-indigo-950' : 'text-slate-500'}`}>{m.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-sm text-slate-600 leading-relaxed">
                  <strong className="text-indigo-950">AI Summary:</strong> Elena has transitioned from Mid to Senior in just 18 months, significantly faster than the industry average of 36 months. Her technical depth in <span className="text-primary font-bold">Go concurrency</span> and <span className="text-primary font-bold">Kubernetes orchestration</span> is staff-level.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Stats & Team Fit */}
          <div className="space-y-8">
            <div className="bg-indigo-950 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300 mb-6">Match Breakdown</h3>
                <div className="space-y-6">
                  {[
                    { label: 'Technical Skills', value: 98 },
                    { label: 'Domain Expertise', value: 85 },
                    { label: 'Culture Fit', value: 92 },
                    { label: 'Trajectory Velocity', value: 95 },
                  ].map((stat, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs font-bold mb-2">
                        <span>{stat.label}</span>
                        <span>{stat.value}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${stat.value}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -right-10 -bottom-10 opacity-10">
                <Zap size={180} />
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
              <h3 className="text-lg font-bold text-indigo-950 mb-6 flex items-center gap-2">
                <Users className="text-primary" size={20} />
                Team Dynamics
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <h4 className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-2">Complementary Traits</h4>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Elena's "High-Agency" trait balances the current team's "Analytical-Heavy" bias. She will likely accelerate delivery cycles.
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest mb-2">Potential Mentor</h4>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Strong alignment with <span className="font-bold">Staff Engineer David L.</span> for staff-track mentorship.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
