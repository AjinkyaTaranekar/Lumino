import { useState } from 'react'
import {
  ArrowRight, Sparkles, Layers, MessageSquare, Handshake,
  Minus, Plus, Maximize2, Zap
} from 'lucide-react'

// NOTE: Real interview/practice session API does not exist yet. See MISSING_APIS.md.
// This page is a UI prototype only.

const SAMPLE_QUESTION = 'Tell me about a technical decision you disagreed with.'
const PREV_QUESTION = 'Which tech stack do you prefer for backend development?'
const PREV_ANSWER = 'I specialize in Python/FastAPI with Neo4j for graph data, but I also explore Go for high-throughput scenarios.'

export default function Practice() {
  const [text, setText] = useState('')
  const confidence = Math.min(68 + text.length, 95)

  return (
    <div className="h-[calc(100vh-80px)] w-full overflow-hidden flex">
      {/* Left Panel: Conversational Interface */}
      <section className="w-full lg:w-[480px] xl:w-[540px] flex flex-col justify-center px-10 xl:px-16 bg-white relative z-10 border-r border-slate-100 overflow-y-auto py-10">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-50">
          <div className="h-full bg-primary-500 w-2/5 transition-all duration-1000 shadow-[0_0_12px_rgba(19,127,236,0.5)]" />
        </div>

        {/* Previous Q&A (faded) */}
        <div className="mb-10 opacity-30 transform scale-95 origin-left cursor-default">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-primary-500 font-bold text-xs font-display">01</span>
            <span className="text-[10px] font-extrabold tracking-[0.2em] text-slate-400 uppercase">Experience Context</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2 font-display">{PREV_QUESTION}</h3>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 text-sm leading-relaxed">
            {PREV_ANSWER}
          </div>
        </div>

        {/* Active Question */}
        <div className="relative">
          <div className="flex items-center gap-3 mb-8">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-500/10 text-primary-500 text-xs font-black">02</span>
            <span className="text-[11px] font-extrabold tracking-[0.2em] text-primary-500 uppercase font-display">Behavioral Logic</span>
          </div>
          <h1 className="text-3xl xl:text-4xl font-extrabold text-indigo-950 mb-6 leading-[1.2] font-display tracking-tight">
            {SAMPLE_QUESTION.split('technical decision')[0]}
            <span className="text-primary-500 underline decoration-primary-200 decoration-4 underline-offset-4">technical decision</span>
            {SAMPLE_QUESTION.split('technical decision')[1]}
          </h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            The Curator is analyzing your response for architectural reasoning and conflict resolution style.
          </p>
          <div className="group relative">
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-primary-500 focus:ring-0 text-xl p-0 py-6 min-h-[140px] resize-none text-slate-800 placeholder-slate-200 transition-all font-display leading-relaxed outline-none"
              placeholder="Start typing..."
            />
            {text.length > 0 && (
              <div className="absolute bottom-6 right-0 flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1 h-1 bg-primary-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1 h-1 bg-primary-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1 h-1 bg-primary-500 rounded-full animate-bounce" />
                </div>
                <span className="text-[10px] uppercase font-black text-primary-500 tracking-widest">Inference Active</span>
              </div>
            )}
          </div>
          <div className="mt-10 flex items-center justify-between">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 font-mono">SHIFT</span>+
              <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 font-mono">ENTER</span>
              <span className="ml-1">for line break</span>
            </div>
            <button className="bg-primary-500 hover:bg-primary-600 text-white px-8 py-4 rounded-xl font-bold shadow-xl flex items-center gap-3 transition-all">
              <span className="font-display">Continue</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Right Panel: Knowledge Graph Visualization */}
      <section className="hidden lg:flex flex-1 bg-slate-50 relative overflow-hidden flex-col items-center justify-center">
        <div
          className="absolute inset-0 z-0 opacity-40"
          style={{ backgroundImage: 'radial-gradient(#cbd5e1 0.75px, transparent 0.75px)', backgroundSize: '32px 32px' }}
        />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary-500/5 rounded-full blur-[100px]" />

        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <div className="relative w-[80%] h-[70%]">
            {/* Center node */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
              <div className="relative">
                <div className="absolute inset-0 bg-primary-500/20 blur-2xl rounded-full scale-150" />
                <div className="w-20 h-20 bg-white rounded-full border-[5px] border-white shadow-2xl relative overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-br from-primary-500 to-indigo-950 flex items-center justify-center text-white font-black text-2xl">
                    L
                  </div>
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest whitespace-nowrap shadow-lg">
                  Candidate
                </div>
              </div>
            </div>

            {/* Skill nodes */}
            {[
              { top: '25%', left: '72%', icon: Layers, label: 'SYSTEM DESIGN' },
              { top: '30%', left: '25%', icon: MessageSquare, label: 'COMMUNICATION' },
              { top: '72%', left: '50%', icon: Handshake, label: 'CONFLICT RESOLUTION', active: true },
            ].map((node, i) => (
              <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ top: node.top, left: node.left }}>
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-12 h-12 bg-white/70 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-prism ${node.active ? 'border-2 border-primary-500' : ''}`}>
                    <node.icon className={node.active ? 'text-primary-500' : 'text-slate-400'} size={22} />
                  </div>
                  <div className="px-2 py-1 bg-white/70 backdrop-blur-md rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-wider shadow-sm whitespace-nowrap">
                    {node.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* HUD */}
        <div className="absolute bottom-8 right-8 w-64">
          <div className="bg-white/70 backdrop-blur-md p-5 rounded-2xl shadow-prism border-t border-white/40">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-yellow-400" />
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Curator Insight</h4>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[9px] font-bold text-emerald-600 uppercase">Live</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-slate-600 font-bold">Profile Confidence</span>
                <span className="text-primary-500 font-black">{confidence}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-500"
                  style={{ width: `${confidence}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            {[Plus, Minus, Maximize2].map((Icon, i) => (
              <button key={i} className="w-10 h-10 bg-white/70 backdrop-blur-md rounded-xl shadow-prism flex items-center justify-center text-slate-500 hover:text-primary-500 transition-all">
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
