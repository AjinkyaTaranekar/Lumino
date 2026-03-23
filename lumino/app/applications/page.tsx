'use client';

import React from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { motion } from 'motion/react';
import Link from 'next/link';
import { 
  CheckCircle, 
  TrendingUp, 
  Download, 
  FileText, 
  BookOpen, 
  Timer, 
  Users,
  ArrowRight,
  ExternalLink,
  Rocket
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export default function FeedbackPage() {
  const alignmentData = [
    { name: 'Aligned', value: 85 },
    { name: 'Gap', value: 15 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TopNavBar />
      <main className="flex-grow py-8 px-4 sm:px-6 lg:px-8 pt-24">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <span className="w-1.5 h-1.5 mr-1.5 bg-green-500 rounded-full"></span>
                    Interview Complete
                  </span>
                  <span className="text-sm text-slate-500">September 14, 2023</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Senior Backend Engineer Feedback</h1>
                <p className="text-slate-600 max-w-2xl text-lg">
                  Regardless of the final hiring decision, every conversation is an opportunity to refine your craft. Here is your personalized growth analysis.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button className="inline-flex items-center justify-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition-all">
                  <Download size={16} className="mr-2" />
                  Download PDF
                </button>
                <button className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary hover:bg-primary-dark transition-colors">
                  View Full Transcript
                </button>
              </div>
            </div>
          </div>

          {/* Three Panel Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Strengths Observed */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-green-50 rounded-lg">
                  <CheckCircle className="text-green-600" size={24} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Strengths Observed</h2>
              </div>
              <ul className="space-y-4 flex-grow">
                {[
                  { title: 'System Design Trade-offs', desc: 'Excellent articulation of CAP theorem implications in your distributed cache proposal.' },
                  { title: 'Communication Clarity', desc: 'You effectively checked for understanding before diving into complex implementation details.' },
                  { title: 'SQL Optimization', desc: 'Correctly identified the missing index on the composite key during the debugging exercise.' },
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle className="text-primary mt-1 shrink-0" size={14} />
                    <div>
                      <h3 className="font-medium text-slate-900">{item.title}</h3>
                      <p className="text-sm text-slate-500 mt-1">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Growth Areas */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-orange-50 rounded-lg">
                  <TrendingUp className="text-orange-600" size={24} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Growth Areas</h2>
              </div>
              <ul className="space-y-4 flex-grow">
                {[
                  { title: 'Project Estimation', desc: 'Tendency to underestimate integration testing time. Consider applying PERT methodology.' },
                  { title: 'Handling Ambiguity', desc: 'Jumped to code too quickly on the "vague requirements" prompt. Ask more clarifying questions first.' },
                  { title: 'Concurrency Patterns', desc: 'Review Go routines vs OS threads differences for high-throughput scenarios.' },
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <TrendingUp className="text-orange-500 mt-1 shrink-0" size={14} />
                    <div>
                      <h3 className="font-medium text-slate-900">{item.title}</h3>
                      <p className="text-sm text-slate-500 mt-1">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Trajectory Fit (AI Analysis) */}
            <div className="bg-white rounded-xl shadow-sm border border-primary/20 p-6 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <TrendingUp size={64} className="text-primary" />
              </div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Rocket className="text-primary" size={24} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Role Trajectory Fit</h2>
              </div>
              <div className="flex flex-col items-center justify-center mb-6 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={alignmentData}
                      innerRadius={40}
                      outerRadius={50}
                      paddingAngle={5}
                      dataKey="value"
                      startAngle={90}
                      endAngle={450}
                    >
                      <Cell fill="#3B82F6" />
                      <Cell fill="#F1F5F9" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-slate-900">85%</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest">Alignment</span>
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  <strong className="text-primary">AI Analysis:</strong> Your technical depth strongly aligns with a Senior Engineer level. However, to bridge the gap to Staff Engineer, strategic scoping and cross-team impact estimation need refinement.
                </p>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-xs font-medium text-slate-500">
                    <span>Technical Depth</span>
                    <span className="text-slate-900">92%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: '92%' }}></div>
                  </div>
                  <div className="flex justify-between text-xs font-medium text-slate-500 mt-2">
                    <span>Strategic Scoping</span>
                    <span className="text-slate-900">65%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-primary/60 h-1.5 rounded-full" style={{ width: '65%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actionable Next Steps */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Actionable Next Steps</h2>
                <p className="text-sm text-slate-500 mt-1">Curated resources based on your interview performance patterns.</p>
              </div>
              <button className="text-primary hover:text-primary-dark text-sm font-medium inline-flex items-center">
                Generate Practice Plan <ArrowRight size={16} className="ml-1" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: BookOpen, type: 'Book Chapter', title: 'Designing Data-Intensive Applications', desc: 'Focus on Chapter 5: Replication & Partitioning strategies.', action: 'Start Reading' },
                { icon: Timer, type: 'Exercise', title: 'Practice Estimation using PERT', desc: '15-minute interactive exercise on calculating weighted averages.', action: 'Start Exercise' },
                { icon: Users, type: 'Soft Skills', title: 'Mock Interview: Stakeholder Mgmt', desc: 'AI-driven roleplay focused on negotiating timeline constraints.', action: 'Schedule Mock' },
              ].map((step, idx) => (
                <div key={idx} className="group block p-5 rounded-lg border border-slate-200 hover:border-primary/50 hover:shadow-md transition-all bg-slate-50/50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-white rounded-md shadow-sm text-primary group-hover:text-white group-hover:bg-primary transition-colors">
                      <step.icon size={20} />
                    </div>
                    <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">{step.type}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 mb-1 group-hover:text-primary transition-colors">{step.title}</h3>
                  <p className="text-sm text-slate-500 mb-3">{step.desc}</p>
                  <div className="text-xs text-primary font-medium flex items-center">
                    {step.action} <ExternalLink size={10} className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center py-6">
            <p className="text-slate-400 text-sm italic">
              "Growth is painful. Change is painful. But nothing is as painful as staying stuck where you don't belong."
            </p>
          </div>
        </div>
      </main>
      <footer className="bg-white border-t border-slate-200 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-sm">© 2023 Lumino Inc. All rights reserved.</p>
          <div className="flex space-x-6">
            <Link href="#" className="text-slate-400 hover:text-slate-500 text-sm">Privacy Policy</Link>
            <Link href="#" className="text-slate-400 hover:text-slate-500 text-sm">Terms of Service</Link>
            <Link href="#" className="text-slate-400 hover:text-slate-500 text-sm">Help Center</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
