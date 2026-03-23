import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Edit3, Layers } from 'lucide-react';
import Layout from '../../components/Layout';
import GraphViewer from '../../components/GraphViewer';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function UserModel() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const userId = session?.userId;

  const [graphKey, setGraphKey] = useState(0);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!userId) return;
    api.getUserStats(userId)
      .then(setStats)
      .catch(() => {});
  }, [userId]);

  const iframeSrc = api.userVizUrl(userId);

  return (
    <Layout>
      <div className="flex flex-col h-full bg-surface-bg">

        {/* Topbar */}
        <div className="flex items-center justify-between px-5 py-3 bg-surface-card border-b border-surface-border flex-shrink-0 gap-4">

          {/* Left: back button */}
          <button
            onClick={() => navigate('/user/dashboard')}
            className="flex items-center gap-1.5 text-sm text-content-muted hover:text-content-primary transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {/* Center: title + stats */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-semibold text-content-primary truncate">
              Knowledge Graph — <span className="text-primary-500">{userId}</span>
            </h1>
            {stats && (
              <div className="hidden sm:flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-content-muted flex-shrink-0" />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="badge badge-blue text-xs">
                    {stats.categories} categories
                  </span>
                  <span className="badge badge-gray text-xs">
                    {stats.families} families
                  </span>
                  <span className="badge badge-green text-xs">
                    {stats.leaves} skills
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setGraphKey(k => k + 1)}
              className="btn-secondary btn-sm flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={() => navigate('/user/edit-graph')}
              className="btn-primary btn-sm flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Graph
            </button>
          </div>
        </div>

        {/* Mobile stats row */}
        {stats && (
          <div className="sm:hidden flex items-center gap-2 px-4 py-2 bg-surface-card border-b border-surface-border flex-wrap">
            <Layers className="w-3.5 h-3.5 text-content-muted" />
            <span className="badge badge-blue text-xs">{stats.categories} categories</span>
            <span className="badge badge-gray text-xs">{stats.families} families</span>
            <span className="badge badge-green text-xs">{stats.leaves} skills</span>
          </div>
        )}

        {/* Graph area */}
        <div className="flex-1 p-4 min-h-0">
          <GraphViewer
            key={graphKey}
            generateFn={() => api.generateUserViz(userId)}
            iframeSrc={iframeSrc}
            height="100%"
          />
        </div>
      </div>
    </Layout>
  );
}
