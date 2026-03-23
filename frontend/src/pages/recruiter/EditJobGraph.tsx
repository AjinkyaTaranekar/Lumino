import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { GraphMutation } from '../../lib/types';
import GraphViewer from '../../components/GraphViewer';
import ChatPanel from '../../components/ChatPanel';
import VersionHistory from '../../components/VersionHistory';
import { ArrowLeft, Save, ChevronDown } from 'lucide-react';

// ── Message type (local) ──────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  proposal: import('../../lib/types').GraphMutationProposal | null;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function EditJobGraph() {
  const { jobId }   = useParams<{ jobId: string }>();
  const { session } = useAuth();
  const navigate    = useNavigate();

  const [sessionId, setSessionId]       = useState<string | null>(null);
  const [graphKey, setGraphKey]         = useState(0);
  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [loading, setLoading]           = useState(false);
  const [initError, setInitError]       = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  // ── Start edit session on mount ───────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function startSession() {
      try {
        const res = await api.startEditSession('job', jobId!, session?.userId);
        if (cancelled) return;
        setSessionId(res.session_id);
        setMessages([{
          role: 'assistant',
          content: res.opening_question,
          proposal: null,
        }]);
      } catch (err: unknown) {
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : 'Failed to start session.');
        }
      }
    }

    startSession();
    return () => { cancelled = true; };
  }, [jobId, session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chat handlers ─────────────────────────────────────────────────────

  async function handleSend(message: string) {
    if (!sessionId || loading) return;
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: message, proposal: null }]);
    try {
      const proposal = await api.sendEditMessage('job', jobId!, sessionId, message);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: proposal.follow_up_question,
          proposal: proposal as import('../../lib/types').GraphMutationProposal,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error.';
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${msg}`, proposal: null }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(mutations: GraphMutation) {
    if (!sessionId) return;
    try {
      const res = await api.applyMutations('job', jobId!, sessionId, mutations) as {
        nodes_added: number;
        nodes_updated: number;
        nodes_removed: number;
      };
      setGraphKey(k => k + 1);
      setMessages(prev => [
        ...prev,
        {
          role: 'system',
          content: `Applied: +${res.nodes_added} nodes, ~${res.nodes_updated} updated, -${res.nodes_removed} removed. Checkpoint saved.`,
          proposal: null,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error.';
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Failed to apply mutations: ${msg}`, proposal: null },
      ]);
    }
  }

  async function handleReject() {
    if (!sessionId) return;
    setLoading(true);
    try {
      const proposal = await api.rejectMutations('job', jobId!, sessionId) as import('../../lib/types').GraphMutationProposal;
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: proposal.follow_up_question,
          proposal,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error.';
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${msg}`, proposal: null }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCheckpoint() {
    try {
      await api.saveCheckpoint('job', jobId!, `manual_${new Date().toISOString().slice(0, 10)}`);
      setMessages(prev => [
        ...prev,
        { role: 'system', content: 'Checkpoint saved successfully.', proposal: null },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error.';
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Failed to save checkpoint: ${msg}`, proposal: null },
      ]);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      <title>Edit Job Graph — Lumino</title>

      <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50">

        {/* ── Topbar ── */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-white flex-shrink-0">
          <button
            onClick={() => navigate(`/recruiter/model/${jobId}`)}
            aria-label="Back to Job Model"
            className="btn-ghost btn-sm flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary-300"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Job Model
          </button>

          <h1 className="text-base font-semibold text-indigo-950">
            Edit Job Graph
            <span className="ml-2 font-mono text-xs text-slate-400 font-normal">
              {jobId}
            </span>
          </h1>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveCheckpoint}
              aria-label="Save checkpoint"
              className="btn-success btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-green-300"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              Save Checkpoint
            </button>

            <div className="relative">
              <button
                onClick={() => setShowVersions(v => !v)}
                aria-expanded={showVersions}
                aria-haspopup="true"
                aria-label="Show version history"
                className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
              >
                Versions
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${showVersions ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {showVersions && (
                <div className="absolute right-0 top-9 z-50">
                  <VersionHistory
                    entityType="job"
                    entityId={jobId!}
                    onRollback={() => { setGraphKey(k => k + 1); setShowVersions(false); }}
                    onClose={() => setShowVersions(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Two-panel layout ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Graph — 60% */}
          <main
            id="graph-panel"
            className="w-3/5 min-w-0 p-2 overflow-hidden"
            aria-label="Job knowledge graph"
          >
            <GraphViewer
              key={graphKey}
              generateFn={() => api.generateJobViz(jobId!)}
              iframeSrc={api.jobVizUrl(jobId!)}
              height="100%"
              title="Job Knowledge Graph"
            />
          </main>

          {/* Chat — 40% */}
          <aside
            id="chat-panel"
            className="flex flex-col w-2/5 flex-shrink-0 border-l border-slate-100 bg-white"
            aria-label="Graph editing chat"
          >
            {initError ? (
              <div className="flex items-center justify-center h-full p-6" role="alert">
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
          </aside>

        </div>
      </div>
    </>
  );
}
