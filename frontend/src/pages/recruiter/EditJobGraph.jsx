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
  const { jobId }   = useParams()
  const { session } = useAuth()
  const navigate    = useNavigate()

  const [sessionId, setSessionId]     = useState(null)
  const [graphKey, setGraphKey]       = useState(0)
  const [messages, setMessages]       = useState([])
  const [loading, setLoading]         = useState(false)
  const [initError, setInitError]     = useState(null)
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
        content: `Applied: +${res.nodes_added} nodes, ~${res.nodes_updated} updated, -${res.nodes_removed} removed. Checkpoint saved.`,
        proposal: null,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Failed to apply mutations: ${err.message}`,
        proposal: null,
      }])
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
      await api.saveCheckpoint('job', jobId, `manual_${new Date().toISOString().slice(0, 10)}`)
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'Checkpoint saved successfully.',
        proposal: null,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Failed to save checkpoint: ${err.message}`,
        proposal: null,
      }])
    }
  }

  return (
    <Layout>
      <div className="flex flex-col h-full bg-surface-bg">
        {/* Topbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-surface-border bg-surface-card flex-shrink-0">
          <button
            onClick={() => navigate(`/recruiter/model/${jobId}`)}
            className="btn-ghost btn-sm flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Job Model
          </button>

          <h1 className="text-base font-semibold text-content-primary">
            Edit Job Graph — {jobId}
          </h1>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveCheckpoint}
              className="btn-success btn-sm flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Save Checkpoint
            </button>
            <div className="relative">
              <button
                onClick={() => setShowVersions(v => !v)}
                className="btn-secondary btn-sm flex items-center gap-1.5"
              >
                Versions <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showVersions && (
                <div className="absolute right-0 top-9 z-50">
                  <VersionHistory
                    entityType="job"
                    entityId={jobId}
                    onRollback={() => { setGraphKey(k => k + 1); setShowVersions(false) }}
                    onClose={() => setShowVersions(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main two-panel layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Graph — 60% */}
          <div className="w-3/5 min-w-0 p-3">
            <GraphViewer
              key={graphKey}
              generateFn={() => api.generateJobViz(jobId)}
              iframeSrc={api.jobVizUrl(jobId)}
              height="100%"
            />
          </div>

          {/* Chat — 40% */}
          <div className="flex flex-col w-2/5 flex-shrink-0 border-l border-surface-border bg-surface-card">
            {initError ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="alert-error text-center">
                  Failed to start edit session: {initError}
                </div>
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
