'use client';

import React from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { SideNavBar } from '@/components/side-nav-bar';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  Target, 
  Zap, 
  Map as MapIcon, 
  ChevronRight,
  Plus,
  Info
} from 'lucide-react';

export default function TrajectoryPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-24 p-8">
        <header className="mb-10 flex justify-between items-end max-w-6xl">
          <div>
            <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Career Trajectory Map</h1>
            <p className="mt-3 text-lg text-slate-500 max-w-2xl leading-relaxed">
              Visualizing your growth path from Senior Backend to Staff Engineer.
            </p>
          </div>
          <button className="bg-indigo-950 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-900 transition-all">
            <Plus size={18} />
            Add Milestone
          </button>
        </header>

        {/* The Map Visualization (Simplified) */}
        <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8 mb-10 max-w-6xl relative overflow-hidden min-h-[500px]">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
          
          <div className="relative z-10 h-full flex flex-col justify-center items-center">
            {/* Trajectory Path Line */}
            <div className="absolute w-[80%] h-1 bg-slate-100 top-1/2 -translate-y-1/2 z-0">
              <div className="h-full bg-primary w-2/3 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
            </div>

            <div className="w-full flex justify-between items-center px-10 relative z-10">
              {/* Milestone 1: Past */}
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-white border-4 border-slate-100 flex items-center justify-center shadow-md">
                  <CheckCircle className="text-slate-300" size={32} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">2021</p>
                  <p className="font-bold text-slate-600">Backend Dev</p>
                </div>
              </div>

              {/* Milestone 2: Current */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse scale-150"></div>
                  <div className="w-20 h-20 rounded-full bg-white border-4 border-primary flex items-center justify-center shadow-xl relative z-10">
                    <Target className="text-primary" size={40} />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-primary uppercase tracking-widest">Current</p>
                  <p className="font-bold text-indigo-950">Senior Backend</p>
                </div>
              </div>

              {/* Milestone 3: Future Target */}
              <div className="flex flex-col items-center gap-4 opacity-40">
                <div className="w-16 h-16 rounded-full bg-white border-4 border-dashed border-slate-200 flex items-center justify-center">
                  <TrendingUp className="text-slate-300" size={32} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">2025</p>
                  <p className="font-bold text-slate-400">Staff Engineer</p>
                </div>
              </div>
            </div>

            {/* AI Insight Overlay */}
            <div className="absolute bottom-10 left-10 bg-indigo-950 text-white p-6 rounded-2xl shadow-2xl max-w-xs border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={16} className="text-yellow-400" />
                <span className="text-[10px] font-black uppercase tracking-widest">AI Acceleration Tip</span>
              </div>
              <p className="text-sm text-indigo-100 leading-relaxed">
                Focus on <span className="text-white font-bold">Cross-Team Architecture</span>. Your current trajectory shows a 15% gap in distributed systems design.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
          <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-8">
            <h2 className="text-xl font-bold text-indigo-950 mb-6">Skill Gap Analysis</h2>
            <div className="space-y-6">
              {[
                { skill: 'Distributed Systems', level: 65, status: 'Gap' },
                { skill: 'Team Leadership', level: 80, status: 'On Track' },
                { skill: 'Cloud Architecture', level: 45, status: 'Critical' },
              ].map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-700">{item.skill}</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                      item.status === 'Critical' ? 'bg-red-50 text-red-600' : 
                      item.status === 'Gap' ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'
                    }`}>{item.status}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-1000 ${
                      item.status === 'Critical' ? 'bg-red-500' : 
                      item.status === 'Gap' ? 'bg-orange-500' : 'bg-green-500'
                    }`} style={{ width: `${item.level}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-8">
            <h2 className="text-xl font-bold text-indigo-950 mb-6">Recommended Roles</h2>
            <div className="space-y-4">
              {[
                { title: 'Staff Backend Engineer', company: 'Stripe', match: 94 },
                { title: 'Engineering Manager', company: 'Airbnb', match: 88 },
                { title: 'Principal Architect', company: 'Netflix', match: 82 },
              ].map((job, i) => (
                <div key={i} className="p-4 rounded-xl border border-slate-50 hover:border-primary/30 transition-all cursor-pointer group">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-indigo-950 group-hover:text-primary transition-colors">{job.title}</h3>
                      <p className="text-xs text-slate-500">{job.company}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-primary">{job.match}%</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black">Match</p>
                    </div>
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

import { CheckCircle } from 'lucide-react';
