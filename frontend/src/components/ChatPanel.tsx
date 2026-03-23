import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Send, Sparkles } from 'lucide-react'
import MutationDiffCard from './MutationDiffCard'
import type { EditSessionMessage, GraphMutation } from '../lib/types'

export interface ChatPanelHandle {
  preSeed: (text: string) => void
}

interface ChatPanelProps {
  messages: EditSessionMessage[]
  loading: boolean
  onSend: (text: string) => void
  onApply: (mutations: GraphMutation) => void
  onReject: () => void
}

const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
  function ChatPanel({ messages, loading, onSend, onApply, onReject }, ref) {
    const [input, setInput]   = useState('')
    const bottomRef           = useRef<HTMLDivElement>(null)

    useImperativeHandle(ref, () => ({
      preSeed(text: string) {
        setInput(text)
      },
    }))

    useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      const trimmed = input.trim()
      if (!trimmed || loading) return
      onSend(trimmed)
      setInput('')
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit(e as unknown as React.FormEvent)
      }
    }

    return (
      <div className="flex flex-col h-full bg-white">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <Sparkles size={14} className="text-indigo-500" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-bold text-indigo-950 leading-none">AI Interviewer</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Building your knowledge graph</p>
          </div>
          {loading && (
            <span className="ml-auto badge badge-blue text-[10px] animate-pulse">Thinking…</span>
          )}
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" role="log" aria-live="polite" aria-label="Chat messages">
          {messages.map((msg, i) => {
            if (msg.role === 'system') {
              return (
                <div key={i} className="text-center">
                  <span className="text-xs px-3 py-1 rounded-full bg-slate-50 text-slate-400">
                    {msg.content}
                  </span>
                </div>
              )
            }

            const isUser = msg.role === 'user'
            return (
              <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-blue-500 text-white rounded-br-sm'
                    : 'bg-slate-50 text-indigo-950 border border-slate-100 rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>

                {!isUser && msg.proposal?.mutations && (
                  <div className="w-full max-w-[90%] mt-1.5">
                    <MutationDiffCard
                      proposal={msg.proposal}
                      onApply={onApply}
                      onReject={onReject}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {loading && (
            <div className="flex items-start" aria-label="AI is typing">
              <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-slate-50 border border-slate-100">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 px-3 py-3 border-t border-slate-100 bg-white flex-shrink-0"
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={2}
            disabled={loading}
            aria-label="Message input"
            className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-100 text-indigo-950 placeholder:text-slate-300
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send message"
            className="flex-shrink-0 p-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                       focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    )
  }
)

export default ChatPanel
