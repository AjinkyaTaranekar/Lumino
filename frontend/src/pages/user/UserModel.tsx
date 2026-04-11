import { ArrowLeft, Edit3, Info, Layers, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GraphViewer from '../../components/GraphViewer';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

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
  const [stats, setStats] = useState<GraphStats | null>(null);

  useEffect(() => {
    if (!userId) return;
    api.getUserStats(userId)
      .then(s => setStats(s as GraphStats))
      .catch(() => { });
  }, [userId]);

  const iframeSrc = api.userVizUrl(userId!);

  return (
    <>
      <title>Digital Twin - Lumino</title>

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
              AI Digital Twin -{' '}
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
              aria-label="Refine digital twin"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Refine Twin
            </button>
          </div>
        </div>

        {/* Interpretation notice */}
        <div className="mx-3 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-800">LLM Interpretation Notice</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              This Digital Twin is generated from AI interpretation of your resume and interactions.
              Verify and correct assumptions before relying on ranking decisions.
            </p>
          </div>
          <button
            onClick={() => navigate('/user/clarifications')}
            className="btn-secondary btn-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-amber-400"
            aria-label="Verify digital twin assumptions"
          >
            Verify
          </button>
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
            title="Digital Twin (LLM interpretation)"
          />
        </div>

      </div>
    </>
  );
}
