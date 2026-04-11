import { Send } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import type { PracticeMessage } from '../../lib/types';

const PERSONA_LABELS: Record<string, string> = {
  hiring_manager: 'Hiring Manager',
  tech_lead: 'Tech Lead',
  culture_fit: 'Culture Fit',
};

const PHASE_LABELS: Record<string, string> = {
  intro: 'Introduction',
  technical: 'Technical Round',
  behavioral: 'Behavioral Round',
  culture: 'Culture Fit',
  closing: 'Closing',
};

interface PracticeChatProps {
  messages: PracticeMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  sessionComplete: boolean;
}

export default function PracticeChat({
  messages,
  isLoading,
  onSend,
  sessionComplete,
}: PracticeChatProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading || sessionComplete) return;
    onSend(trimmed);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  let lastPhase: string | undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Message thread */}
      <div
        className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
        role="log"
        aria-live="polite"
        aria-label="Interview conversation"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const showPhaseDivider =
              msg.role === 'assistant' &&
              msg.phase &&
              msg.phaseChanged &&
              msg.phase !== lastPhase;

            if (msg.phase) lastPhase = msg.phase;

            return (
              <React.Fragment key={i}>
                {/* Phase transition divider */}
                {showPhaseDivider && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 my-4"
                    aria-label={`Phase: ${PHASE_LABELS[msg.phase!] ?? msg.phase}`}
                  >
                    <div className="flex-1 h-px bg-blue-100" />
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-500 uppercase tracking-wider border border-blue-100">
                      {PHASE_LABELS[msg.phase!] ?? msg.phase}
                    </span>
                    <div className="flex-1 h-px bg-blue-100" />
                  </motion.div>
                )}

                {/* System / info messages */}
                {msg.role === 'system' && (
                  <div className="text-center">
                    <span className="text-xs px-3 py-1 rounded-full bg-slate-50 text-slate-400">
                      {msg.content}
                    </span>
                  </div>
                )}

                {/* Interviewer messages */}
                {msg.role === 'assistant' && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-start gap-1"
                  >
                    {msg.persona && (
                      <span className="text-[10px] font-bold text-slate-400 pl-1">
                        {PERSONA_LABELS[msg.persona] ?? msg.persona}
                      </span>
                    )}
                    <div
                      className="max-w-[88%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-white"
                      style={{ background: 'rgba(15, 23, 63, 0.90)' }}
                    >
                      {msg.content}
                    </div>
                  </motion.div>
                )}

                {/* Candidate messages */}
                {msg.role === 'user' && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[88%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed text-white bg-gradient-to-br from-blue-500 to-indigo-600">
                      {msg.content}
                    </div>
                  </motion.div>
                )}
              </React.Fragment>
            );
          })}
        </AnimatePresence>

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex items-start" aria-label="Interviewer is typing">
            <div
              className="px-4 py-3 rounded-2xl rounded-tl-sm"
              style={{ background: 'rgba(15, 23, 63, 0.90)' }}
            >
              <div className="flex gap-1">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {!sessionComplete && (
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 px-4 py-3 border-t border-slate-100 bg-white flex-shrink-0"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer (Enter to send, Shift+Enter for a new line)"
            rows={3}
            disabled={isLoading}
            aria-label="Your answer"
            className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-100
                       text-indigo-950 placeholder:text-slate-300 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                       transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="Send answer"
            className="flex-shrink-0 p-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-600
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                       focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            <Send size={16} />
          </button>
        </form>
      )}

      {sessionComplete && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-center">
          <p className="text-xs text-slate-400 font-medium">
            Interview complete - your scorecard is available on the right panel
          </p>
        </div>
      )}
    </div>
  );
}
