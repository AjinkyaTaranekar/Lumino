import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, ChevronDown, ChevronUp } from 'lucide-react';
import Layout from '../../components/Layout';
import GraphViewer from '../../components/GraphViewer';
import ChatPanel from '../../components/ChatPanel';
import VersionHistory from '../../components/VersionHistory';
import SkillGapPanel from '../../components/SkillGapPanel';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function EditGraph() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = session?.userId;
  const jobId = location.state?.jobId;

  const [sessionId, setSessionId] = useState(null);
  const [graphKey, setGraphKey] = useState(0);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const [showGap, setShowGap] = useState(!!jobId);
  const [checkpointSaving, setCheckpointSaving] = useState(false);

  const chatRef = useRef(null);

  // Start edit session on mount
  useEffect(() => {
    let cancelled = false;
    async function startSession() {
      try {
        const res = await api.startEditSession('user', userId, null);
        if (cancelled) return;
        setSessionId(res.session_id);
        setMessages([
          {
            role: 'assistant',
            content: res.opening_question,
            proposal: null,
          },
        ]);
      } catch (err) {
        if (!cancelled) setInitError(err.message);
      }
    }
    startSession();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleSend(message) {
    if (!sessionId || loading) return;
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: message, proposal: null }]);
    try {
      const proposal = await api.sendEditMessage('user', userId, sessionId, message);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: proposal.follow_up_question,
          proposal,
        },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Error: ${err.message}`, proposal: null },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(mutations) {
    if (!sessionId) return;
    try {
      const res = await api.applyMutations('user', userId, sessionId, mutations);
      setGraphKey(k => k + 1);
      const summary = [
        res.nodes_added > 0 ? `+${res.nodes_added} nodes` : null,
        res.nodes_updated > 0 ? `~${res.nodes_updated} updated` : null,
        res.nodes_removed > 0 ? `-${res.nodes_removed} removed` : null,
        res.edges_added > 0 ? `+${res.edges_added} edges` : null,
      ]
        .filter(Boolean)
        .join(', ');
      setMessages(prev => [
        ...prev,
        {
          role: 'system',
          content: `Applied${summary ? ': ' + summary : ''}. Graph updated.`,
          proposal: null,
        },
      ]);
      // Auto-continue interview
      setLoading(true);
      try {
        const next = await api.sendEditMessage(
          'user',
          userId,
          sessionId,
          "Those changes are saved. Based on what I've told you so far, what area do you want to dig deeper into next?"
        );
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: next.follow_up_question,
            proposal: next,
          },
        ]);
      } catch (_) {
        // non-fatal
      }
      setLoading(false);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Failed to apply: ${err.message}`, proposal: null },
      ]);
    }
  }

  async function handleReject() {
    if (!sessionId) return;
    setLoading(true);
    try {
      const proposal = await api.rejectMutations('user', userId, sessionId);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: proposal.follow_up_question,
          proposal,
        },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Error: ${err.message}`, proposal: null },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCheckpoint() {
    setCheckpointSaving(true);
    try {
      await api.saveCheckpoint(
        'user',
        userId,
        `manual_${new Date().toISOString().slice(0, 10)}`
      );
      setMessages(prev => [
        ...prev,
        { role: 'system', content: 'Checkpoint saved successfully.', proposal: null },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Checkpoint failed: ${err.message}`, proposal: null },
      ]);
    } finally {
      setCheckpointSaving(false);
    }
  }

  function handleRollback() {
    setGraphKey(k => k + 1);
    setShowVersions(false);
  }

  function preSeedChat(skillName) {
    chatRef.current?.preSeed(`Tell me about your experience with ${skillName}`);
  }

  const iframeSrc = api.userVizUrl(userId);

  return (
    <Layout>
      <div className="flex flex-col h-full bg-surface-bg">

        {/* Topbar */}
        <div className="flex items-center justify-between px-5 py-3 bg-surface-card border-b border-surface-border flex-shrink-0 gap-3">

          {/* Left */}
          <button
            onClick={() => navigate('/user/model')}
            className="flex items-center gap-1.5 text-sm text-content-muted hover:text-content-primary transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Graph
          </button>

          {/* Center */}
          <h1 className="text-sm font-semibold text-content-primary truncate min-w-0">
            Edit Knowledge Graph —{' '}
            <span className="text-primary-500">{userId}</span>
          </h1>

          {/* Right */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleSaveCheckpoint}
              disabled={checkpointSaving}
              className="btn-success btn-sm flex items-center gap-1.5 disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              {checkpointSaving ? 'Saving…' : 'Save Checkpoint'}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowVersions(v => !v)}
                className="btn-secondary btn-sm flex items-center gap-1.5"
              >
                Versions
                {showVersions ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {showVersions && (
                <div className="absolute right-0 top-9 z-50">
                  <VersionHistory
                    entityType="user"
                    entityId={userId}
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

          {/* Left panel: graph + optional skill gap (60%) */}
          <div className="flex flex-col min-w-0 border-r border-surface-border" style={{ width: '60%' }}>
            <div className="flex-1 p-3 min-h-0">
              <GraphViewer
                key={graphKey}
                generateFn={() => api.generateUserViz(userId)}
                iframeSrc={iframeSrc}
                height="100%"
              />
            </div>

            {/* Skill gap collapsible */}
            {jobId && (
              <div className="flex-shrink-0 border-t border-surface-border">
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-content-secondary hover:bg-surface-hover transition-colors bg-surface-card"
                  onClick={() => setShowGap(g => !g)}
                >
                  <span>Skills Gap vs. selected job</span>
                  {showGap ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                {showGap && (
                  <SkillGapPanel
                    userId={userId}
                    jobId={jobId}
                    onSkillClick={preSeedChat}
                  />
                )}
              </div>
            )}
          </div>

          {/* Right panel: chat (40%) */}
          <div className="flex flex-col flex-shrink-0" style={{ width: '40%' }}>
            {initError ? (
              <div className="flex items-center justify-center h-full px-6">
                <div className="alert-error text-sm">
                  Failed to start session: {initError}
                </div>
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
  );
}
