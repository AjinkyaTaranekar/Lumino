import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, ChevronDown, ChevronUp } from 'lucide-react';
import GraphViewer from '../../components/GraphViewer';
import ChatPanel from '../../components/ChatPanel';
import VersionHistory from '../../components/VersionHistory';
import SkillGapPanel from '../../components/SkillGapPanel';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { GraphMutation } from '../../lib/types';

// ─── Chat message shape ───────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  proposal: unknown | null;
}

// ─── Apply result shape ───────────────────────────────────────────────────────

interface ApplyResult {
  nodes_added?:   number;
  nodes_updated?: number;
  nodes_removed?: number;
  edges_added?:   number;
}

// ─── EditGraph ────────────────────────────────────────────────────────────────

export default function EditGraph() {
  const { session }  = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();
  const userId       = session?.userId;
  const jobId        = (location.state as { jobId?: string } | null)?.jobId;

  const [sessionId,        setSessionId]        = useState<string | null>(null);
  const [graphKey,         setGraphKey]          = useState(0);
  const [messages,         setMessages]          = useState<ChatMessage[]>([]);
  const [loading,          setLoading]           = useState(false);
  const [initError,        setInitError]         = useState<string | null>(null);
  const [showVersions,     setShowVersions]      = useState(false);
  const [showGap,          setShowGap]           = useState(!!jobId);
  const [checkpointSaving, setCheckpointSaving]  = useState(false);

  const chatRef = useRef<{ preSeed: (msg: string) => void } | null>(null);

  // Start edit session on mount
  useEffect(() => {
    let cancelled = false;
    async function startSession() {
      try {
        const res = await api.startEditSession('user', userId!);
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
        if (!cancelled) setInitError((err as Error).message);
      }
    }
    startSession();
    return () => { cancelled = true; };
  }, [userId]);

  async function handleSend(message: string) {
    if (!sessionId || loading) return;
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: message, proposal: null }]);
    try {
      const proposal = await api.sendEditMessage('user', userId!, sessionId, message);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: (proposal as { follow_up_question?: string }).follow_up_question ?? '',
          proposal,
        },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Error: ${(err as Error).message}`, proposal: null },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(mutations: GraphMutation) {
    if (!sessionId) return;
    try {
      const res = await api.applyMutations('user', userId!, sessionId, mutations) as ApplyResult;
      setGraphKey(k => k + 1);
      const summary = [
        (res.nodes_added   ?? 0) > 0 ? `+${res.nodes_added} nodes`   : null,
        (res.nodes_updated ?? 0) > 0 ? `~${res.nodes_updated} updated` : null,
        (res.nodes_removed ?? 0) > 0 ? `-${res.nodes_removed} removed` : null,
        (res.edges_added   ?? 0) > 0 ? `+${res.edges_added} edges`    : null,
      ].filter(Boolean).join(', ');
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
          userId!,
          sessionId,
          "Those changes are saved. Based on what I've told you so far, what area do you want to dig deeper into next?"
        );
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: (next as { follow_up_question?: string }).follow_up_question ?? '',
            proposal: next,
          },
        ]);
      } catch {
        // non-fatal
      }
      setLoading(false);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Failed to apply: ${(err as Error).message}`, proposal: null },
      ]);
    }
  }

  async function handleReject() {
    if (!sessionId) return;
    setLoading(true);
    try {
      const proposal = await api.rejectMutations('user', userId!, sessionId);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: (proposal as { follow_up_question?: string }).follow_up_question ?? '',
          proposal,
        },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Error: ${(err as Error).message}`, proposal: null },
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
        userId!,
        `manual_${new Date().toISOString().slice(0, 10)}`
      );
      setMessages(prev => [
        ...prev,
        { role: 'system', content: 'Checkpoint saved successfully.', proposal: null },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Checkpoint failed: ${(err as Error).message}`, proposal: null },
      ]);
    } finally {
      setCheckpointSaving(false);
    }
  }

  function handleRollback() {
    setGraphKey(k => k + 1);
    setShowVersions(false);
  }

  function preSeedChat(skillName: string) {
    chatRef.current?.preSeed(`Tell me about your experience with ${skillName}`);
  }

  const iframeSrc = api.userVizUrl(userId!);

  return (
    <>
      <title>Deep Dive Interview — Lumino</title>

      <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50">

        {/* Topbar */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-100 shadow-sm flex-shrink-0 gap-3">

          {/* Left */}
          <button
            onClick={() => navigate('/user/model')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-950 transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
            aria-label="Back to digital twin"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Graph
          </button>

          {/* Center */}
          <h1 className="text-sm font-semibold text-indigo-950 truncate min-w-0">
            Deep Dive Interview —{' '}
            <span className="text-blue-500">{userId}</span>
          </h1>

          {/* Right */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleSaveCheckpoint}
              disabled={checkpointSaving}
              className="btn-secondary btn-sm flex items-center gap-1.5 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              aria-label="Save checkpoint"
            >
              <Save className="w-3.5 h-3.5" />
              {checkpointSaving ? 'Saving…' : 'Save Checkpoint'}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowVersions(v => !v)}
                className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                aria-expanded={showVersions}
                aria-haspopup="true"
              >
                Versions
                {showVersions
                  ? <ChevronUp className="w-3.5 h-3.5" />
                  : <ChevronDown className="w-3.5 h-3.5" />
                }
              </button>
              {showVersions && (
                <div className="absolute right-0 top-9 z-50">
                  <VersionHistory
                    entityType="user"
                    entityId={userId!}
                    onRollback={handleRollback}
                    onClose={() => setShowVersions(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left panel: graph (60%) */}
          <div
            className="flex flex-col min-w-0 border-r border-slate-100"
            style={{ width: '60%' }}
          >
            <div className="flex-1 min-h-0 overflow-hidden p-2">
              <GraphViewer
                key={graphKey}
                generateFn={() => api.generateUserViz(userId!)}
                iframeSrc={iframeSrc}
                height="100%"
                title="Digital Twin"
              />
            </div>

            {/* Skill gap collapsible */}
            {jobId && (
              <div className="flex-shrink-0 border-t border-slate-100">
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  onClick={() => setShowGap(g => !g)}
                  aria-expanded={showGap}
                >
                  <span>Skills Gap vs. selected job</span>
                  {showGap
                    ? <ChevronUp className="w-3.5 h-3.5" />
                    : <ChevronDown className="w-3.5 h-3.5" />
                  }
                </button>
                {showGap && (
                  <SkillGapPanel
                    userId={userId!}
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
    </>
  );
}
