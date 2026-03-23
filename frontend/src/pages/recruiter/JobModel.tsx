import { ArrowLeft, Edit3, Network, RefreshCw, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GraphViewer from '../../components/GraphViewer';
import { api } from '../../lib/api';

export default function JobModel() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  // Bump key to force GraphViewer remount on refresh
  const [key, setKey] = useState(0);

  const iframeSrc = api.jobVizUrl(jobId!);

  return (
    <>
      <title>Job Model - Lumino</title>

      <div className="flex flex-col h-full">

        {/* ── Topbar ── */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="btn-ghost btn-sm flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary-300"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center">
              <Network className="w-3.5 h-3.5 text-primary-500" aria-hidden="true" />
            </div>
            <h1 className="text-base font-semibold text-indigo-950">
              Job Knowledge Graph
              <span className="ml-2 font-mono text-xs text-slate-400 font-normal">
                {jobId}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/recruiter/candidates/${jobId}`)}
              aria-label={`Find candidates for job ${jobId}`}
              className="btn-primary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              Find Candidates
            </button>

            <button
              onClick={() => navigate(`/recruiter/edit-job/${jobId}`)}
              aria-label={`Edit knowledge graph for job ${jobId}`}
              className="btn-secondary btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              Edit Graph
            </button>

            <button
              onClick={() => setKey(k => k + 1)}
              aria-label="Refresh graph visualization"
              className="btn-ghost btn-sm flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Refresh
            </button>
          </div>
        </header>

        {/* ── Graph area ── */}
        <main
          id="graph-area"
          className="flex-1 p-4 bg-slate-50"
          aria-label="Job knowledge graph visualization"
        >
          <GraphViewer
            key={key}
            generateFn={() => api.generateJobViz(jobId!)}
            iframeSrc={iframeSrc}
            height="100%"
          />
        </main>

      </div>
    </>
  );
}
