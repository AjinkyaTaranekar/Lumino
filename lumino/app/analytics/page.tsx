'use client';

import React from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { SideNavBar } from '@/components/side-nav-bar';
import { motion } from 'motion/react';
import { 
  Settings, 
  Database, 
  Shield, 
  Users, 
  Zap, 
  CheckCircle,
  ArrowRight,
  Plus
} from 'lucide-react';

export default function WorkspaceSetupPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-24 p-8">
        <header className="mb-10 max-w-6xl">
          <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Workspace Setup</h1>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl leading-relaxed">
            Configure your team&apos;s graph parameters and integration settings.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
          {/* Graph Configuration */}
          <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Database size={24} />
              </div>
              <h2 className="text-xl font-bold text-indigo-950">Knowledge Graph Settings</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Inference Depth</label>
                <input type="range" className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary" />
                <div className="flex justify-between mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Standard</span>
                  <span>Deep Neural</span>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50">
                <h4 className="text-sm font-bold text-indigo-950 mb-4">Active Trajectory Models</h4>
                <div className="space-y-3">
                  {[
                    { name: 'Engineering Tracks v4.2', active: true },
                    { name: 'Product Leadership v1.0', active: true },
                    { name: 'Marketing Velocity v2.1', active: false },
                  ].map((model, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm font-medium text-slate-700">{model.name}</span>
                      <div className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${model.active ? 'bg-primary' : 'bg-slate-300'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${model.active ? 'right-1' : 'left-1'}`}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Team Permissions */}
          <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <Shield size={24} />
              </div>
              <h2 className="text-xl font-bold text-indigo-950">Team & Permissions</h2>
            </div>

            <div className="space-y-4">
              {[
                { name: 'Owen (You)', role: 'Admin', email: 'owen@lumino.ai' },
                { name: 'Sarah Chen', role: 'Recruiter', email: 'sarah@lumino.ai' },
                { name: 'David L.', role: 'Hiring Manager', email: 'david@lumino.ai' },
              ].map((member, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-50 hover:border-slate-100 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
                      <img src={`https://picsum.photos/seed/${member.name}/100/100`} alt={member.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-indigo-950">{member.name}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-black">{member.role}</p>
                    </div>
                  </div>
                  <button className="text-slate-400 hover:text-indigo-950 transition-colors">
                    <Settings size={18} />
                  </button>
                </div>
              ))}
              <button className="w-full py-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 font-bold text-sm flex items-center justify-center gap-2 hover:border-primary/50 hover:text-primary transition-all">
                <Plus size={18} />
                Invite Team Member
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
