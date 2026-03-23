import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import GraphViewer from '../../components/GraphViewer'
import { ArrowLeft, RefreshCw, Users, Edit3 } from 'lucide-react'

export default function JobModel() {
  const { jobId } = useParams()
  const navigate  = useNavigate()
  const [key, setKey] = useState(0)

  const iframeSrc = api.jobVizUrl(jobId)

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Topbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-card flex-shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="btn-ghost btn-sm flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <h1 className="text-base font-semibold text-content-primary">
            Job Model — {jobId}
          </h1>

          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/recruiter/candidates/${jobId}`)}
              className="btn-primary btn-sm flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" /> Find Candidates
            </button>
            <button
              onClick={() => navigate(`/recruiter/edit-job/${jobId}`)}
              className="btn-secondary btn-sm flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit Graph
            </button>
            <button
              onClick={() => setKey(k => k + 1)}
              className="btn-ghost btn-sm flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* Graph area */}
        <div className="flex-1 p-4 bg-surface-bg">
          <GraphViewer
            key={key}
            generateFn={() => api.generateJobViz(jobId)}
            iframeSrc={iframeSrc}
            height="100%"
          />
        </div>
      </div>
    </Layout>
  )
}
