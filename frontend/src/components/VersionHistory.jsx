import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { RotateCcw, X } from 'lucide-react'

export default function VersionHistory({ entityType, entityId, onRollback, onClose }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rolling, setRolling] = useState(null)
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
    <div className="rounded-lg shadow-xl w-72"
         style={{ background: '#16213e', border: '1px solid #0f3460' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b"
           style={{ borderColor: '#0f3460' }}>
        <span className="text-xs font-semibold" style={{ color: '#e0e0e0' }}>Version History</span>
        <button onClick={onClose} style={{ color: '#8892a4' }}
                onMouseEnter={e => e.currentTarget.style.color = '#e0e0e0'}
                onMouseLeave={e => e.currentTarget.style.color = '#8892a4'}>
          <X size={14} />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto py-1">
        {loading && (
          <p className="px-3 py-2 text-xs" style={{ color: '#8892a4' }}>Loading…</p>
        )}
        {error && (
          <p className="px-3 py-2 text-xs" style={{ color: '#e94560' }}>{error}</p>
        )}
        {!loading && !error && versions.length === 0 && (
          <p className="px-3 py-2 text-xs" style={{ color: '#8892a4' }}>No checkpoints yet.</p>
        )}
        {versions.map(v => (
          <div key={v.version_id}
               className="flex items-center justify-between px-3 py-2 hover:bg-opacity-50"
               style={{ borderBottom: '1px solid #0a1628' }}
               onMouseEnter={e => e.currentTarget.style.background = '#0f2040'}
               onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div className="flex flex-col min-w-0">
              <span className="text-xs truncate" style={{ color: '#e0e0e0' }}>{v.label}</span>
              <span className="text-xs" style={{ color: '#8892a4' }}>
                {new Date(v.created_at).toLocaleString()}
              </span>
            </div>

            {confirmId === v.version_id ? (
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <button
                  onClick={() => doRollback(v.version_id)}
                  disabled={rolling === v.version_id}
                  className="text-xs px-2 py-1 rounded"
                  style={{ background: '#e94560', color: '#fff' }}>
                  {rolling === v.version_id ? '…' : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ background: '#0f3460', color: '#8892a4' }}>
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(v.version_id)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded ml-2 flex-shrink-0"
                style={{ background: '#0f3460', color: '#8892a4' }}
                onMouseEnter={e => e.currentTarget.style.color = '#e0e0e0'}
                onMouseLeave={e => e.currentTarget.style.color = '#8892a4'}>
                <RotateCcw size={11} /> Rollback
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
