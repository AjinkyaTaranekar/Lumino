import { useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'

export default function GraphViewer({ generateFn, iframeSrc, height = '100%' }) {
  const [status, setStatus] = useState('generating')
  const [error, setError]   = useState(null)

  useEffect(() => {
    setStatus('generating')
    setError(null)
    generateFn()
      .then(() => setStatus('ready'))
      .catch(err => { setStatus('error'); setError(err.message) })
  }, [iframeSrc])

  if (status === 'generating') {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-3 bg-surface-raised rounded-xl border border-surface-border" style={{ height }}>
        <div className="spinner" />
        <p className="text-sm text-content-muted">Generating graph…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-3 bg-surface-raised rounded-xl border border-surface-border" style={{ height }}>
        <AlertCircle size={28} className="text-danger-400" />
        <p className="text-sm font-medium text-content-primary">Failed to generate graph</p>
        {error && <p className="text-xs text-content-muted max-w-xs text-center">{error}</p>}
      </div>
    )
  }

  return (
    <iframe
      src={iframeSrc}
      style={{ width: '100%', height, border: 'none', borderRadius: 12 }}
      title="Interactive graph"
    />
  )
}
