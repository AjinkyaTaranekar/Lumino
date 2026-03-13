import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import GraphViewer from '../../components/GraphViewer'
import ChatPanel from '../../components/ChatPanel'
import VersionHistory from '../../components/VersionHistory'
import SkillGapPanel from '../../components/SkillGapPanel'
import { ArrowLeft, Save, ChevronDown } from 'lucide-react'

export default function EditGraph() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const jobId = location.state?.jobId   // passed from Dashboard/MatchExplorer

  const [sessionId, setSessionId] = useState(null)
  const [graphKey, setGraphKey] = useState(0)          // increment to reload iframe
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [initError, setInitError] = useState(null)
  const [showVersions, setShowVersions] = useState(false)
  const [showGap, setShowGap] = useState(!!jobId)

  const chatRef = useRef(null)

  // Start edit session on mount
  useEffect(() => {
    let cancelled = false
    async function startSession() {
      try {
        const res = await api.startEditSession('user', session.userId, null)
        if (cancelled) return
        setSessionId(res.session_id)
        setMessages([{
          role: 'assistant',
          content: res.opening_question,
          proposal: null,
        }])
      } catch (err) {
        if (!cancelled) setInitError(err.message)
      }
    }
    startSession()
    return () => { cancelled = true }
  }, [session.userId])

  async function handleSend(message) {
    if (!sessionId || loading) return
    setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: message, proposal: null }])
    try {
      const proposal = await api.sendEditMessage('user', session.userId, sessionId, message)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: proposal.follow_up_question,
        proposal,
      }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${err.message}`, proposal: null }])
    } finally {
      setLoading(false)
    }
  }

  async function handleApply(mutations) {
    if (!sessionId) return
    try {
      const res = await api.applyMutations('user', session.userId, sessionId, mutations)
      setGraphKey(k => k + 1)   // reload graph
      setMessages(prev => [...prev, {
        role: 'system',
        content: `✓ Applied: +${res.nodes_added} nodes, ~${res.nodes_updated} updated, -${res.nodes_removed} removed, +${res.edges_added} edges. Checkpoint saved.`,
        proposal: null,
      }])
    } catch (err) {
      alert(`Failed to apply mutations: ${err.message}`)
    }
  }

  async function handleReject() {
    if (!sessionId) return
    setLoading(true)
    try {
      const proposal = await api.rejectMutations('user', session.userId, sessionId)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: proposal.follow_up_question,
        proposal,
      }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${err.message}`, proposal: null }])
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveCheckpoint() {
    try {
      await api.saveCheckpoint('user', session.userId, `manual_${new Date().toISOString().slice(0,10)}`)
      alert('Checkpoint saved!')
    } catch (err) {
      alert(`Failed: ${err.message}`)
    }
  }

  async function handleRollback() {
    setGraphKey(k => k + 1)
  }

  function preSeedChat(skillName) {
    chatRef.current?.preSeed(`Tell me about your experience with ${skillName}`)
  }

  const iframeSrc = api.userVizUrl(session.userId)

  return (
    <Layout>
      <div className="flex flex-col h-full" style={{ background: '#1a1a2e' }}>
        {/* Topbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
             style={{ background: '#16213e', borderColor: '#0f3460' }}>
          <button
            onClick={() => navigate('/user/model')}
            className="flex items-center gap-2 text-sm"
            style={{ color: '#8892a4' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e0e0e0'}
            onMouseLeave={e => e.currentTarget.style.color = '#8892a4'}>
            <ArrowLeft size={16} /> Back to Graph
          </button>

          <h1 className="text-base font-semibold" style={{ color: '#e0e0e0' }}>
            Edit Knowledge Graph — {session.userId}
          </h1>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveCheckpoint}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: '#27AE60', color: '#fff' }}
              onMouseEnter={e => e.currentTarget.style.background = '#1e8449'}
              onMouseLeave={e => e.currentTarget.style.background = '#27AE60'}>
              <Save size={12} /> Save Checkpoint
            </button>

            <div className="relative">
              <button
                onClick={() => setShowVersions(v => !v)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: '#0f3460', color: '#8892a4', border: '1px solid #0f3460' }}
                onMouseEnter={e => e.currentTarget.style.color = '#e0e0e0'}
                onMouseLeave={e => e.currentTarget.style.color = '#8892a4'}>
                Versions <ChevronDown size={12} />
              </button>
              {showVersions && (
                <div className="absolute right-0 top-8 z-50">
                  <VersionHistory
                    entityType="user"
                    entityId={session.userId}
                    onRollback={handleRollback}
                    onClose={() => setShowVersions(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: graph + optional skill gap */}
          <div className="flex flex-col" style={{ width: '60%', minWidth: 0 }}>
            <div className="flex-1 p-3">
              <GraphViewer
                key={graphKey}
                generateFn={() => api.generateUserViz(session.userId)}
                iframeSrc={iframeSrc}
                height="100%"
              />
            </div>

            {jobId && (
              <div className="flex-shrink-0 border-t" style={{ borderColor: '#0f3460' }}>
                <button
                  className="w-full flex items-center justify-between px-4 py-2 text-xs"
                  style={{ color: '#8892a4', background: '#16213e' }}
                  onClick={() => setShowGap(g => !g)}>
                  <span>Skills Gap vs selected job</span>
                  <ChevronDown size={12} style={{ transform: showGap ? 'rotate(180deg)' : 'none' }} />
                </button>
                {showGap && (
                  <SkillGapPanel
                    userId={session.userId}
                    jobId={jobId}
                    onSkillClick={preSeedChat}
                  />
                )}
              </div>
            )}
          </div>

          {/* Right: chat */}
          <div className="flex flex-col border-l flex-shrink-0"
               style={{ width: '40%', borderColor: '#0f3460' }}>
            {initError ? (
              <div className="flex items-center justify-center h-full text-sm"
                   style={{ color: '#e94560' }}>
                Failed to start session: {initError}
              </div>
            ) : (
              <ChatPanel
                ref={chatRef}
                messages={messages}
                loading={loading}
                onSend={handleSend}
                onApply={handleApply}
                onReject={handleReject}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
