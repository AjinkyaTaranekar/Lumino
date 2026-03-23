'use client';

import React from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { SideNavBar } from '@/components/side-nav-bar';
import { motion } from 'motion/react';
import { 
  Briefcase, 
  Map as MapIcon, 
  Users, 
  Zap, 
  CheckCircle, 
  Clock,
  Globe,
  DollarSign,
  ArrowRight,
  Share2,
  Bookmark,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';

export default function JobDetailsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-24 p-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                <div className="flex items-start gap-6">
                  <div className="w-20 h-20 rounded-2xl bg-indigo-950 flex items-center justify-center text-white font-black text-3xl shadow-xl">
                    S
                  </div>
                  <div>
                    <h1 className="text-3xl font-extrabold text-indigo-950 font-display">Senior Backend Engineer</h1>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-slate-500 font-medium">
                      <span className="flex items-center gap-1.5"><Globe size={16} /> Remote</span>
                      <span className="flex items-center gap-1.5"><Clock size={16} /> Full-time</span>
                      <span className="flex items-center gap-1.5"><DollarSign size={16} /> $160k - $220k</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="p-3 rounded-xl border border-slate-200 text-slate-400 hover:text-primary transition-all">
                    <Bookmark size={20} />
                  </button>
                  <button className="p-3 rounded-xl border border-slate-200 text-slate-400 hover:text-primary transition-all">
                    <Share2 size={20} />
                  </button>
                  <button className="bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-primary-dark transition-all">
                    Apply Now
                  </button>
                </div>
              </div>

              <div className="prose prose-slate max-w-none">
                <h3 className="text-xl font-bold text-indigo-950 mb-4">The Opportunity</h3>
                <p className="text-slate-600 leading-relaxed mb-6">
                  We are looking for a Senior Backend Engineer to join our Core Infrastructure team. You will be responsible for scaling our distributed payment processing engine, which handles over $2B in transactions monthly. This role is specifically designed for someone on a <span className="text-primary font-bold">Staff Engineer trajectory</span>.
                </p>
                <h3 className="text-xl font-bold text-indigo-950 mb-4">What you&apos;ll do</h3>
                <ul className="space-y-3 text-slate-600 list-none p-0">
                  {['Architect and implement high-throughput microservices in Go.', 'Optimize PostgreSQL query performance for massive datasets.', 'Mentor junior engineers and lead cross-team architecture reviews.'].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="text-emerald-500 mt-1 shrink-0" size={18} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Trajectory Map for this Role */}
            <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold text-indigo-950 flex items-center gap-2">
                  <MapIcon className="text-primary" size={24} />
                  Role Trajectory Map
                </h2>
                <span className="text-[10px] font-black uppercase text-primary bg-primary/5 px-3 py-1 rounded-full">Staff Track</span>
              </div>
              
              <div className="relative h-40 flex items-center justify-center mb-8">
                <div className="absolute w-[80%] h-1 bg-slate-100 top-1/2 -translate-y-1/2">
                  <div className="h-full bg-primary w-1/2"></div>
                </div>
                <div className="w-full flex justify-between relative z-10 px-10">
                  {[
                    { label: 'Onboarding', time: 'Month 1-3' },
                    { label: 'Core Contributor', time: 'Month 6-12' },
                    { label: 'Staff Engineer', time: 'Year 2+' },
                  ].map((m, i) => (
                    <div key={i} className="flex flex-col items-center gap-3">
                      <div className={`w-8 h-8 rounded-full border-4 ${i === 1 ? 'bg-white border-primary shadow-lg scale-125' : 'bg-white border-slate-100'}`}></div>
                      <div className="text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{m.time}</p>
                        <p className="text-xs font-bold text-indigo-950">{m.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <div className="bg-indigo-950 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-6">
                  <Zap className="text-yellow-400" size={20} />
                  <span className="text-xs font-black uppercase tracking-widest">Lumino Match</span>
                </div>
                <div className="flex items-end gap-2 mb-6">
                  <span className="text-5xl font-black">94%</span>
                  <span className="text-indigo-300 font-bold text-sm mb-2">High Alignment</span>
                </div>
                <p className="text-sm text-indigo-200 leading-relaxed mb-8">
                  Your technical depth in <span className="text-white font-bold">Go</span> and <span className="text-white font-bold">System Design</span> perfectly matches this role&apos;s requirements.
                </p>
                <button className="w-full bg-white text-indigo-950 py-4 rounded-xl font-bold hover:bg-slate-100 transition-all shadow-xl">
                  Analyze My Fit
                </button>
              </div>
              <div className="absolute -right-10 -bottom-10 opacity-10">
                <TrendingUp size={180} />
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
              <h3 className="text-lg font-bold text-indigo-950 mb-6 flex items-center gap-2">
                <Users className="text-primary" size={20} />
                Team Dynamics
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-50">
                  <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
                    <img src="https://picsum.photos/seed/manager/100/100" alt="Hiring Manager" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Hiring Manager</p>
                    <p className="text-sm font-bold text-indigo-950">Sarah Chen</p>
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-xs text-blue-800 leading-relaxed">
                    The team currently has 4 Senior Engineers and 2 Staff Engineers. They are looking for a <span className="font-bold">technical leader</span> to bridge the gap.
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
