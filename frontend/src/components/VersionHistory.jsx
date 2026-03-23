import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { RotateCcw, X, Clock } from 'lucide-react'

export default function VersionHistory({ entityType, entityId, onRollback, onClose }) {
  const [versions,  setVersions]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [rolling,   setRolling]   = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    api.listVersions(entityType, entityId)
      .then(setVersions)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [entityType, entityId])

  async function doRollback(versionId) {
    setRolling(versionId)
    try {
      await api.rollback(entityType, entityId, versionId)
      onRollback()
      onClose()
    } catch (e) {
      alert(`Rollback failed: ${e.message}`)
    } finally {
      setRolling(null)
      setConfirmId(null)
    }
  }

  return (
    <div className="card shadow-card-lg w-72 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-surface-border">
        <span className="text-xs font-semibold text-content-primary flex items-center gap-1.5">
          <Clock size={13} className="text-primary-500" /> Version History
        </span>
        <button onClick={onClose} className="btn-ghost p-1 rounded">
          <X size={13} />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-surface-border">
        {loading && <p className="px-3.5 py-3 text-xs text-content-muted">Loading…</p>}
        {error   && <p className="px-3.5 py-3 text-xs text-danger-500">{error}</p>}
        {!loading && !error && versions.length === 0 && (
          <p className="px-3.5 py-3 text-xs text-content-muted">No checkpoints yet.</p>
        )}
        {versions.map(v => (
          <div key={v.version_id} className="flex items-center justify-between px-3.5 py-2.5 hover:bg-surface-raised transition-colors">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-content-primary truncate">{v.label}</span>
              <span className="text-[11px] text-content-muted">
                {new Date(v.created_at).toLocaleString()}
              </span>
            </div>

            {confirmId === v.version_id ? (
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <button
                  onClick={() => doRollback(v.version_id)}
                  disabled={rolling === v.version_id}
                  className="btn-danger btn-sm px-2 py-1 text-[11px]">
                  {rolling === v.version_id ? '…' : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="btn-secondary btn-sm px-2 py-1 text-[11px]">
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(v.version_id)}
                className="btn-ghost btn-sm flex items-center gap-1 ml-2 flex-shrink-0 text-[11px]">
                <RotateCcw size={10} /> Rollback
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
