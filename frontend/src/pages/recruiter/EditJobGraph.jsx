import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import GraphViewer from '../../components/GraphViewer'
import ChatPanel from '../../components/ChatPanel'
import VersionHistory from '../../components/VersionHistory'
import { ArrowLeft, Save, ChevronDown } from 'lucide-react'

export default function EditJobGraph() {
  const { jobId } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [sessionId, setSessionId] = useState(null)
  const [graphKey, setGraphKey] = useState(0)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [initError, setInitError] = useState(null)
  const [showVersions, setShowVersions] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function startSession() {
      try {
        const res = await api.startEditSession('job', jobId, session.userId)
        if (cancelled) return
        setSessionId(res.session_id)
        setMessages([{ role: 'assistant', content: res.opening_question, proposal: null }])
      } catch (err) {
        if (!cancelled) setInitError(err.message)
      }
    }
    startSession()
    return () => { cancelled = true }
  }, [jobId, session.userId])

  async function handleSend(message) {
    if (!sessionId || loading) return
    setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: message, proposal: null }])
    try {
      const proposal = await api.sendEditMessage('job', jobId, sessionId, message)
      setMessages(prev => [...prev, { role: 'assistant', content: proposal.follow_up_question, proposal }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${err.message}`, proposal: null }])
    } finally {
      setLoading(false)
    }
  }

  async function handleApply(mutations) {
    if (!sessionId) return
    try {
      const res = await api.applyMutations('job', jobId, sessionId, mutations)
      setGraphKey(k => k + 1)
      setMessages(prev => [...prev, {
        role: 'system',
        content: `✓ Applied: +${res.nodes_added} nodes, ~${res.nodes_updated} updated, -${res.nodes_removed} removed. Checkpoint saved.`,
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
      const proposal = await api.rejectMutations('job', jobId, sessionId)
      setMessages(prev => [...prev, { role: 'assistant', content: proposal.follow_up_question, proposal }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${err.message}`, proposal: null }])
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveCheckpoint() {
    try {
      await api.saveCheckpoint('job', jobId, `manual_${new Date().toISOString().slice(0,10)}`)
      alert('Checkpoint saved!')
    } catch (err) {
      alert(`Failed: ${err.message}`)
    }
  }

  return (
    <Layout>
      <div className="flex flex-col h-full" style={{ background: '#1a1a2e' }}>
        {/* Topbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
             style={{ background: '#16213e', borderColor: '#0f3460' }}>
          <button
            onClick={() => navigate(`/recruiter/model/${jobId}`)}
            className="flex items-center gap-2 text-sm"
            style={{ color: '#8892a4' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e0e0e0'}
            onMouseLeave={e => e.currentTarget.style.color = '#8892a4'}>
            <ArrowLeft size={16} /> Back to Job Model
          </button>

          <h1 className="text-base font-semibold" style={{ color: '#e0e0e0' }}>
            Edit Job Graph — {jobId}
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
                    entityType="job"
                    entityId={jobId}
                    onRollback={() => setGraphKey(k => k + 1)}
                    onClose={() => setShowVersions(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          <div style={{ width: '60%', minWidth: 0 }} className="p-3">
            <GraphViewer
              key={graphKey}
              generateFn={() => api.generateJobViz(jobId)}
              iframeSrc={api.jobVizUrl(jobId)}
              height="100%"
            />
          </div>
          <div className="flex flex-col border-l flex-shrink-0"
               style={{ width: '40%', borderColor: '#0f3460' }}>
            {initError ? (
              <div className="flex items-center justify-center h-full text-sm"
                   style={{ color: '#e94560' }}>
                Failed to start session: {initError}
              </div>
            ) : (
              <ChatPanel
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
