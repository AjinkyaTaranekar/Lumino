import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Send } from 'lucide-react'
import MutationDiffCard from './MutationDiffCard'

const ChatPanel = forwardRef(function ChatPanel({ messages, loading, onSend, onApply, onReject }, ref) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useImperativeHandle(ref, () => ({
    preSeed(text) {
      setInput(text)
    }
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
    <div className="flex flex-col h-full" style={{ background: '#12192e' }}>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => {
          if (msg.role === 'system') {
            return (
              <div key={i} className="text-center">
                <span className="text-xs px-3 py-1 rounded-full"
                      style={{ background: '#0f3460', color: '#8892a4' }}>
                  {msg.content}
                </span>
              </div>
            )
          }

          const isUser = msg.role === 'user'
          return (
            <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div
                className="max-w-xs rounded-xl px-3 py-2 text-sm"
                style={isUser
                  ? { background: '#0f3460', color: '#e0e0e0', borderRadius: '16px 16px 4px 16px' }
                  : { background: '#1e2d4a', color: '#c8d0dc', borderRadius: '16px 16px 16px 4px' }}>
                {msg.content}
              </div>

              {!isUser && msg.proposal && msg.proposal.mutations && (
                <div className="w-full max-w-sm mt-1">
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
            <div className="px-3 py-2 rounded-xl text-sm"
                 style={{ background: '#1e2d4a', color: '#8892a4' }}>
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 px-3 py-3 border-t flex-shrink-0"
        style={{ borderColor: '#0f3460', background: '#16213e' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={2}
          disabled={loading}
          className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: '#0f1a2e',
            color: '#e0e0e0',
            border: '1px solid #0f3460',
            lineHeight: '1.4',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex-shrink-0 p-2 rounded-lg"
          style={{
            background: loading || !input.trim() ? '#0f3460' : '#27AE60',
            color: loading || !input.trim() ? '#4a5568' : '#fff',
          }}>
          <Send size={16} />
        </button>
      </form>
    </div>
  )
})

export default ChatPanel
