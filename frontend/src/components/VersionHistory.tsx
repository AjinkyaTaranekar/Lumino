import { Clock, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { GraphVersion } from '../lib/types'

interface VersionHistoryProps {
  entityType: string
  entityId: string
  onRollback: () => void
  onClose: () => void
}

export default function VersionHistory({ entityType, entityId, onRollback, onClose }: VersionHistoryProps) {
  const [versions, setVersions] = useState<GraphVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rolling, setRolling] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    api.listVersions(entityType, entityId)
      .then((data: GraphVersion[]) => setVersions(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [entityType, entityId])

  async function doRollback(versionId: string) {
    setRolling(versionId)
    try {
      await api.rollback(entityType, entityId, versionId)
      onRollback()
      onClose()
    } catch (e: unknown) {
      alert(`Rollback failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRolling(null)
      setConfirmId(null)
    }
  }

  return (
    <div className="card-lumino w-72 overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
        <span className="text-xs font-semibold text-indigo-950 flex items-center gap-1.5">
          <Clock size={13} className="text-blue-500" /> Version History
        </span>
        <button
          type="button"
          onClick={onClose}
          className="btn-ghost p-1 rounded focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          aria-label="Close version history"
        >
          <X size={13} />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100" role="list" aria-label="Graph versions">
        {loading && <p className="px-3.5 py-3 text-xs text-slate-400">Loading…</p>}
        {error && <p className="px-3.5 py-3 text-xs text-red-500" role="alert">{error}</p>}
        {!loading && !error && versions.length === 0 && (
          <p className="px-3.5 py-3 text-xs text-slate-400">No saved versions yet.</p>
        )}
        {versions.map(v => (
          <div
            key={v.version_id}
            className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50 transition-colors"
            role="listitem"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-indigo-950 truncate">{v.label}</span>
              <span className="text-[11px] text-slate-400">
                {new Date(v.created_at).toLocaleString()}
              </span>
            </div>

            {confirmId === v.version_id ? (
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => doRollback(v.version_id)}
                  disabled={rolling === v.version_id}
                  className="btn-danger px-2 py-1 text-[11px] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-red-500"
                  aria-label="Confirm rollback"
                >
                  {rolling === v.version_id ? '…' : 'Yes'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="btn-secondary px-2 py-1 text-[11px] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400"
                  aria-label="Cancel rollback"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(v.version_id)}
                className="btn-ghost flex items-center gap-1 ml-2 flex-shrink-0 text-[11px] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500"
                aria-label={`Rollback to version ${v.label}`}
              >
                <RotateCcw size={10} /> Rollback
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
