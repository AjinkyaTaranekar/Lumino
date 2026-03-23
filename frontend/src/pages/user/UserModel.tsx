import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Edit3, Layers } from 'lucide-react';
import GraphViewer from '../../components/GraphViewer';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

// ─── Stats shape returned by api.getUserStats ─────────────────────────────────

interface GraphStats {
  categories?: number;
  families?: number;
  leaves?: number;
}

// ─── UserModel ────────────────────────────────────────────────────────────────

export default function UserModel() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const userId = session?.userId;

  const [graphKey, setGraphKey] = useState(0);
  const [stats,    setStats]    = useState<GraphStats | null>(null);

  useEffect(() => {
    if (!userId) return;
    api.getUserStats(userId)
      .then(s => setStats(s as GraphStats))
      .catch(() => {});
  }, [userId]);

  const iframeSrc = api.userVizUrl(userId!);

  return (
    <>
      <title>Digital Twin — Lumino</title>

      <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50">

        {/* Topbar */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-100 shadow-sm flex-shrink-0 gap-4">

          {/* Left: back */}
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-950 transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {/* Center: title + stats */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-semibold text-indigo-950 truncate">
              Digital Twin —{' '}
              <span className="text-blue-500">{userId}</span>
            </h1>
            {stats && (
              <div className="hidden sm:flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {stats.categories !== undefined && (
                    <span className="badge badge-blue text-xs">{stats.categories} categories</span>
                  )}
                  {stats.families !== undefined && (
                    <span className="badge badge-gray text-xs">{stats.families} families</span>
                  )}
                  {stats.leaves !== undefined && (
                    <span className="badge badge-green text-xs">{stats.leaves} skills</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setGraphKey(k => k + 1)}
              className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              aria-label="Refresh graph"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={() => navigate('/user/edit-graph')}
              className="btn-primary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              aria-label="Edit knowledge graph"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Graph
            </button>
          </div>
        </div>

        {/* Mobile stats row */}
        {stats && (
          <div className="sm:hidden flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-100 flex-wrap">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            {stats.categories !== undefined && (
              <span className="badge badge-blue text-xs">{stats.categories} categories</span>
            )}
            {stats.families !== undefined && (
              <span className="badge badge-gray text-xs">{stats.families} families</span>
            )}
            {stats.leaves !== undefined && (
              <span className="badge badge-green text-xs">{stats.leaves} skills</span>
            )}
          </div>
        )}

        {/* Graph area */}
        <div className="flex-1 min-h-0 overflow-hidden p-3">
          <GraphViewer
            key={graphKey}
            generateFn={() => api.generateUserViz(userId!)}
            iframeSrc={iframeSrc}
            height="100%"
            title="Digital Twin"
          />
        </div>

      </div>
    </>
  );
}
