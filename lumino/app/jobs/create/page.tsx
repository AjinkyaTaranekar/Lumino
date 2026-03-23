'use client';

import React, { useState } from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { SideNavBar } from '@/components/side-nav-bar';
import { motion } from 'motion/react';
import { 
  Plus, 
  Briefcase, 
  TrendingUp, 
  Users, 
  CheckCircle,
  ArrowRight,
  Info,
  Sparkles
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CreateJobPage() {
  const [step, setStep] = useState(1);
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-24 p-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
                {step}
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Step {step} of 3</span>
            </div>
            <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">Create Trajectory Opening</h1>
            <p className="mt-3 text-lg text-slate-500 leading-relaxed">
              Define the growth path, not just the job description.
            </p>
          </header>

          <div className="bg-white rounded-3xl shadow-prism border border-slate-100 p-10">
            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <h2 className="text-2xl font-bold text-indigo-950 mb-8">Role Fundamentals</h2>
                <div className="space-y-8">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Target Trajectory Title</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Senior Backend Engineer (Staff Track)"
                      className="w-full h-14 px-6 rounded-2xl border-slate-200 bg-slate-50 focus:ring-primary focus:border-primary transition-all font-medium"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Department</label>
                      <select className="w-full h-14 px-6 rounded-2xl border-slate-200 bg-slate-50 focus:ring-primary focus:border-primary transition-all font-medium appearance-none">
                        <option>Engineering</option>
                        <option>Product</option>
                        <option>Design</option>
                        <option>Marketing</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Location</label>
                      <select className="w-full h-14 px-6 rounded-2xl border-slate-200 bg-slate-50 focus:ring-primary focus:border-primary transition-all font-medium appearance-none">
                        <option>Remote</option>
                        <option>Hybrid (London)</option>
                        <option>On-site (SF)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <h2 className="text-2xl font-bold text-indigo-950 mb-8">Trajectory Mapping</h2>
                <div className="space-y-8">
                  <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4">
                    <Sparkles className="text-primary shrink-0" size={24} />
                    <div>
                      <h4 className="font-bold text-blue-900 text-sm mb-1">AI Trajectory Suggestion</h4>
                      <p className="text-xs text-blue-800 leading-relaxed">
                        Based on your department&apos;s current graph, this role should focus on <span className="font-bold">Distributed Systems</span> to bridge the upcoming technical debt gap in Q4.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Growth Milestones (Next 24 Months)</label>
                    <div className="space-y-3">
                      {['Mastery of Go Microservices', 'Lead Cross-Team Architecture Review', 'Staff Promotion Review'].map((m, i) => (
                        <div key={i} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <CheckCircle className="text-emerald-500" size={18} />
                          <span className="text-sm font-medium text-slate-700">{m}</span>
                        </div>
                      ))}
                      <button className="text-sm font-bold text-primary flex items-center gap-2 mt-2 hover:underline">
                        <Plus size={16} /> Add Milestone
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <h2 className="text-2xl font-bold text-indigo-950 mb-8">Review & Publish</h2>
                <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 space-y-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-indigo-950">Senior Backend Engineer</h3>
                      <p className="text-sm text-slate-500">Engineering • Remote</p>
                    </div>
                    <span className="bg-primary text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Draft</span>
                  </div>
                  <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Trajectory Velocity</p>
                      <p className="font-bold text-indigo-950">High (Staff Track)</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Key Skill Focus</p>
                      <p className="font-bold text-indigo-950">Distributed Systems</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="mt-12 pt-8 border-t border-slate-50 flex justify-between items-center">
              <button 
                onClick={() => setStep(s => Math.max(1, s - 1))}
                disabled={step === 1}
                className="text-slate-400 font-bold hover:text-indigo-950 transition-colors disabled:opacity-30"
              >
                Back
              </button>
              <button 
                onClick={() => {
                  if (step < 3) setStep(s => s + 1);
                  else router.push('/dashboard');
                }}
                className="bg-primary text-white px-10 py-4 rounded-xl font-bold shadow-xl shadow-blue-500/25 flex items-center gap-3 hover:bg-primary-dark transition-all"
              >
                {step === 3 ? 'Publish Opening' : 'Continue'}
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
