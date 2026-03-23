'use client';

import React, { useState } from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { SideNavBar } from '@/components/side-nav-bar';
import { motion } from 'motion/react';
import { 
  Search, 
  Filter, 
  UserPlus, 
  MoreHorizontal, 
  Star, 
  ChevronRight,
  ArrowUpRight,
  Zap,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';

const CANDIDATES = [
  { id: '1', name: 'Elena Rodriguez', role: 'Senior Backend Engineer', match: 96, status: 'Interviewing', skills: ['Go', 'Kubernetes', 'gRPC'], avatar: 'https://picsum.photos/seed/elena/100/100' },
  { id: '2', name: 'Marcus Chen', role: 'Staff Frontend Engineer', match: 92, status: 'Shortlisted', skills: ['React', 'TypeScript', 'WebAssembly'], avatar: 'https://picsum.photos/seed/marcus/100/100' },
  { id: '3', name: 'Sarah Jenkins', role: 'Product Architect', match: 88, status: 'New', skills: ['System Design', 'Product Strategy'], avatar: 'https://picsum.photos/seed/sarah/100/100' },
  { id: '4', name: 'David Kim', role: 'Senior Backend Engineer', match: 85, status: 'Reviewing', skills: ['Python', 'AWS', 'PostgreSQL'], avatar: 'https://picsum.photos/seed/david/100/100' },
];

export default function TalentPoolPage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-24 p-8">
        <header className="mb-10 flex justify-between items-end max-w-7xl">
          <div>
            <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Talent Pool</h1>
            <p className="mt-3 text-lg text-slate-500 max-w-2xl leading-relaxed">
              Analyzing 1,240 candidates across engineering tracks.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all">
              <Filter size={18} />
              Filters
            </button>
            <button className="bg-primary text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-primary-dark transition-all">
              <UserPlus size={18} />
              Add Candidate
            </button>
          </div>
        </header>

        {/* Search Bar */}
        <div className="relative mb-8 max-w-7xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by name, skill, or trajectory..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-14 pl-12 pr-4 rounded-2xl border-slate-200 bg-white shadow-sm focus:ring-primary focus:border-primary transition-all font-medium"
          />
        </div>

        {/* Candidate Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-7xl">
          {CANDIDATES.map((candidate) => (
            <motion.div 
              key={candidate.id}
              whileHover={{ y: -4 }}
              className="bg-white rounded-3xl shadow-prism border border-slate-100 p-6 flex gap-6 group cursor-pointer"
            >
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-md">
                  <img src={candidate.avatar} alt={candidate.name} className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-indigo-950 rounded-xl border-4 border-white flex items-center justify-center text-white font-black text-xs">
                  {candidate.match}%
                </div>
              </div>

              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <h3 className="text-xl font-bold text-indigo-950 group-hover:text-primary transition-colors">{candidate.name}</h3>
                    <p className="text-sm font-medium text-slate-500">{candidate.role}</p>
                  </div>
                  <button className="text-slate-300 hover:text-yellow-400 transition-colors">
                    <Star size={20} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {candidate.skills.map(skill => (
                    <span key={skill} className="text-[10px] font-black uppercase px-2 py-1 bg-slate-50 text-slate-500 rounded-md border border-slate-100">
                      {skill}
                    </span>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      candidate.status === 'Interviewing' ? 'bg-emerald-500' : 
                      candidate.status === 'Shortlisted' ? 'bg-primary' : 'bg-slate-300'
                    }`}></span>
                    <span className="text-xs font-bold text-slate-600">{candidate.status}</span>
                  </div>
                  <Link href={`/talent-pool/${candidate.id}`} className="text-sm font-bold text-primary flex items-center gap-1 hover:underline">
                    View Profile <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* AI Insight Banner */}
        <div className="mt-12 bg-indigo-950 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-8 max-w-7xl relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="text-yellow-400" size={20} />
              <span className="text-xs font-black uppercase tracking-widest">Trajectory Insight</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">High-Velocity Talent Detected</h2>
            <p className="text-indigo-200 max-w-xl">
              Elena Rodriguez has shown a 40% faster trajectory growth than the average Senior Backend Engineer. Her graph indicates a strong pivot towards Distributed Systems Architecture.
            </p>
          </div>
          <button className="relative z-10 bg-white text-indigo-950 px-8 py-4 rounded-xl font-bold hover:bg-slate-100 transition-all shadow-xl">
            Analyze Elena's Graph
          </button>
          <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
            <TrendingUp size={300} />
          </div>
        </div>
      </main>
    </div>
  );
}
