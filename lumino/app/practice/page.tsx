'use client';

import React, { useState } from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { motion } from 'motion/react';
import { 
  Send, 
  ArrowRight, 
  Sparkles,
  Search,
  Minus,
  Plus,
  Maximize2,
  Handshake,
  Layers,
  MessageSquare
} from 'lucide-react';

export default function InterviewPage() {
  const [text, setText] = useState('');

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-slate-50">
      <TopNavBar />
      <main className="flex-1 flex w-full h-full pt-16">
        {/* Left Panel: Conversational Interface */}
        <section className="w-full lg:w-[480px] xl:w-[540px] flex flex-col justify-center px-10 xl:px-16 bg-white relative z-10 border-r border-slate-100">
          {/* Progress Bar */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-50">
            <div className="h-full bg-primary w-2/5 transition-all duration-1000 ease-in-out shadow-[0_0_12px_rgba(59,130,246,0.5)]"></div>
          </div>

          {/* History Context */}
          <div className="mb-14 opacity-30 blur-[0.5px] transform scale-95 origin-left hover:opacity-60 transition-all duration-500 cursor-default">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-primary font-bold text-xs font-display">01</span>
              <span className="text-[10px] font-extrabold tracking-[0.2em] text-slate-400 uppercase">Experience Context</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2 font-display">Which tech stack do you prefer?</h3>
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 text-sm leading-relaxed">
              I specialize in the MERN stack but have been exploring Rust for systems programming recently.
            </div>
          </div>

          {/* Active Engagement */}
          <div className="relative">
            <div className="flex items-center gap-3 mb-8">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-black shadow-sm">02</span>
              <span className="text-[11px] font-extrabold tracking-[0.2em] text-primary uppercase font-display">Behavioral Logic</span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-extrabold text-indigo-950 mb-6 leading-[1.15] font-display tracking-tight">
              Tell me about a <span className="text-primary underline decoration-primary/20 decoration-4 underline-offset-4">technical decision</span> you disagreed with.
            </h1>
            <p className="text-slate-500 mb-10 text-sm leading-relaxed xl:text-base">
              The Curator is analyzing your response for architectural reasoning, team dynamics, and conflict resolution style.
            </p>
            <div className="group relative">
              <textarea 
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-primary focus:ring-0 text-xl xl:text-2xl p-0 py-6 min-h-[160px] resize-none text-slate-800 placeholder-slate-200 transition-all font-display leading-relaxed" 
                placeholder="Start typing..."
              ></textarea>
              {/* Lumino AI Insight Indicator */}
              <div className="absolute bottom-6 right-0 flex items-center gap-2 opacity-0 group-focus-within:opacity-100 transition-opacity duration-500">
                <div className="flex gap-1">
                  <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1 h-1 bg-primary rounded-full animate-bounce"></span>
                </div>
                <span className="text-[10px] uppercase font-black text-primary tracking-widest">Inference Active</span>
              </div>
            </div>
            <div className="mt-12 flex items-center justify-between">
              <div className="text-[11px] text-slate-400 font-medium flex items-center gap-2">
                <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 font-mono">SHIFT</span>
                <span>+</span>
                <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 font-mono">ENTER</span>
                <span className="ml-1">for line break</span>
              </div>
              <button className="bg-primary hover:bg-blue-600 text-white px-10 py-4 rounded-xl font-bold shadow-xl shadow-blue-500/25 flex items-center gap-3 transition-all transform hover:-translate-y-0.5 active:scale-95 group">
                <span className="font-display">Continue</span>
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </section>

        {/* Right Panel: The Knowledge Graph */}
        <section className="hidden lg:flex flex-1 bg-slate-50 relative overflow-hidden flex-col items-center justify-center">
          <div className="absolute inset-0 z-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(#cbd5e1 0.75px, transparent 0.75px)', backgroundSize: '32px 32px' }}></div>
          <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px]"></div>
          
          <div className="relative z-10 w-full h-full flex items-center justify-center">
            <div className="relative w-[80%] h-[80%]">
              {/* Center Node */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 group cursor-pointer">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-150 animate-pulse"></div>
                  <div className="w-24 h-24 bg-white rounded-full border-[6px] border-white shadow-2xl relative overflow-hidden">
                    <img alt="User profile" className="w-full h-full object-cover" src="https://picsum.photos/seed/lara/200/200" />
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">Candidate</div>
                </div>
              </div>

              {/* Skill Nodes */}
              <div className="absolute top-[30%] left-[70%] -translate-x-1/2 -translate-y-1/2 group">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 bg-white/70 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-prism group-hover:border-primary/50 transition-all duration-300 group-hover:scale-110">
                    <Layers className="text-slate-400 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="px-3 py-1.5 bg-white/70 backdrop-blur-md rounded-lg text-[11px] font-bold text-slate-500 font-display shadow-sm uppercase">SYSTEM DESIGN</div>
                </div>
              </div>

              <div className="absolute top-[35%] left-[30%] -translate-x-1/2 -translate-y-1/2 group">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 bg-white/70 backdrop-blur-md rounded-xl flex items-center justify-center shadow-prism group-hover:border-primary/50 transition-all duration-300">
                    <MessageSquare className="text-slate-400 group-hover:text-primary transition-colors text-xl" />
                  </div>
                  <div className="px-2.5 py-1 bg-white/70 backdrop-blur-md rounded-lg text-[10px] font-bold text-slate-400 font-display uppercase tracking-wider">Communication</div>
                </div>
              </div>

              {/* ACTIVE Skill Node */}
              <div className="absolute top-[75%] left-[50%] -translate-x-1/2 -translate-y-1/2 z-20">
                <div className="relative flex flex-col items-center gap-4">
                  <div className="w-18 h-18 bg-white rounded-3xl border-2 border-primary shadow-[0_0_40px_rgba(59,130,246,0.3)] flex items-center justify-center cursor-pointer">
                    <Handshake className="text-primary" size={32} />
                  </div>
                  <div className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 font-display">
                    <Sparkles size={14} className="animate-pulse" />
                    Conflict Resolution
                  </div>
                  
                  {/* AI Logic Popover */}
                  <div className="absolute left-full ml-6 top-0 w-64 bg-white/70 backdrop-blur-md p-5 rounded-2xl shadow-prism border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_#3B82F6]"></span>
                      <span className="text-[10px] font-black text-primary uppercase tracking-[0.15em] font-display">Inferred Trait</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      Analyzing response... Strong signal for <span className="text-primary font-bold">Strategic Negotiation</span>. 
                      High alignment with lead roles.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* HUD */}
          <div className="absolute bottom-10 right-10 flex flex-col items-end gap-5">
            <div className="bg-white/70 backdrop-blur-md p-6 rounded-2xl shadow-prism w-72 border-t border-white/40">
              <div className="flex justify-between items-center mb-5">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-display">Curator Insight</h4>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[9px] font-bold text-emerald-600 uppercase">Live</span>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-600 font-bold font-display">Profile Confidence</span>
                    <span className="text-primary font-black">68%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: '68%' }}></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="w-11 h-11 bg-white/70 backdrop-blur-md rounded-xl shadow-prism flex items-center justify-center text-slate-500 hover:text-primary transition-all active:scale-90">
                <Plus size={20} />
              </button>
              <button className="w-11 h-11 bg-white/70 backdrop-blur-md rounded-xl shadow-prism flex items-center justify-center text-slate-500 hover:text-primary transition-all active:scale-90">
                <Minus size={20} />
              </button>
              <button className="w-11 h-11 bg-white/70 backdrop-blur-md rounded-xl shadow-prism flex items-center justify-center text-slate-500 hover:text-primary transition-all active:scale-90">
                <Maximize2 size={20} />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
