import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Send } from 'lucide-react'
import MutationDiffCard from './MutationDiffCard'

const ChatPanel = forwardRef(function ChatPanel({ messages, loading, onSend, onApply, onReject }, ref) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useImperativeHandle(ref, () => ({
    preSeed(text) { setInput(text) }
  }))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || loading) return
    onSend(trimmed)
    setInput('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => {
          if (msg.role === 'system') {
            return (
              <div key={i} className="text-center">
                <span className="text-xs px-3 py-1 rounded-full bg-surface-raised text-content-muted">
                  {msg.content}
                </span>
              </div>
            )
          }

          const isUser = msg.role === 'user'
          return (
            <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-xs rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                isUser
                  ? 'bg-primary-500 text-white rounded-br-sm'
                  : 'bg-surface-raised text-content-primary border border-surface-border rounded-bl-sm'
              }`}>
                {msg.content}
              </div>

              {!isUser && msg.proposal?.mutations && (
                <div className="w-full max-w-sm mt-1.5">
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
          <div className="flex items-start">
            <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-surface-raised border border-surface-border">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-content-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-content-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-content-muted animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 px-3 py-3 border-t border-surface-border bg-white flex-shrink-0">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={2}
          disabled={loading}
          className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-surface-raised border border-surface-border text-content-primary placeholder-content-subtle
                     focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex-shrink-0 p-2.5 rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Send size={16} />
        </button>
      </form>
    </div>
  )
})

export default ChatPanel
