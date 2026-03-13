import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

function Section({ title, items, color, renderItem, selected, onToggle }) {
  const [open, setOpen] = useState(true)
  if (!items || items.length === 0) return null
  return (
    <div className="mb-2">
      <button
        className="flex items-center gap-1 text-xs font-semibold w-full text-left py-1"
        style={{ color }}
        onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title} ({items.length})
      </button>
      {open && (
        <ul className="space-y-1 pl-4">
          {items.map((item, i) => {
            const key = typeof item === 'string' ? item : (item.name || JSON.stringify(item))
            return (
              <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#c0c0c8' }}>
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => onToggle(i)}
                  className="mt-0.5 flex-shrink-0"
                />
                <span className="font-mono">{renderItem(item)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function renderNode(node) {
  if (typeof node === 'string') return node
  const { label, name, ...rest } = node
  const extras = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(', ')
  return `[${label}] ${name}${extras ? ` — ${extras}` : ''}`
}

function renderEdge(edge) {
  return `${edge.from} —[${edge.rel}]→ ${edge.to}`
}

export default function MutationDiffCard({ proposal, onApply, onReject }) {
  const { mutations, reasoning } = proposal

  const [addSel, setAddSel] = useState(() => new Set((mutations.add_nodes || []).map((_, i) => i)))
  const [updSel, setUpdSel] = useState(() => new Set((mutations.update_nodes || []).map((_, i) => i)))
  const [remSel, setRemSel] = useState(() => new Set((mutations.remove_nodes || []).map((_, i) => i)))
  const [edgeSel, setEdgeSel] = useState(() => new Set((mutations.add_edges || []).map((_, i) => i)))

  function toggleSet(set, setter, i) {
    setter(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function handleApply() {
    const selected = {
      add_nodes:    (mutations.add_nodes || []).filter((_, i) => addSel.has(i)),
      update_nodes: (mutations.update_nodes || []).filter((_, i) => updSel.has(i)),
      remove_nodes: (mutations.remove_nodes || []).filter((_, i) => remSel.has(i)),
      add_edges:    (mutations.add_edges || []).filter((_, i) => edgeSel.has(i)),
    }
    onApply(selected)
  }

  const hasAny = (
    (mutations.add_nodes?.length || 0) +
    (mutations.update_nodes?.length || 0) +
    (mutations.remove_nodes?.length || 0) +
    (mutations.add_edges?.length || 0)
  ) > 0

  return (
    <div className="rounded-lg p-3 mt-2 text-xs"
         style={{ background: '#0f1a2e', border: '1px solid #1e3a5f' }}>
      {reasoning && (
        <p className="mb-2 italic" style={{ color: '#8892a4' }}>{reasoning}</p>
      )}

      {hasAny ? (
        <>
          <Section
            title="Add nodes" items={mutations.add_nodes} color="#27AE60"
            renderItem={renderNode} selected={addSel}
            onToggle={i => toggleSet(addSel, setAddSel, i)} />
          <Section
            title="Update nodes" items={mutations.update_nodes} color="#F39C12"
            renderItem={renderNode} selected={updSel}
            onToggle={i => toggleSet(updSel, setUpdSel, i)} />
          <Section
            title="Remove nodes" items={mutations.remove_nodes} color="#e94560"
            renderItem={s => String(s)} selected={remSel}
            onToggle={i => toggleSet(remSel, setRemSel, i)} />
          <Section
            title="Add edges" items={mutations.add_edges} color="#5b9bd5"
            renderItem={renderEdge} selected={edgeSel}
            onToggle={i => toggleSet(edgeSel, setEdgeSel, i)} />

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleApply}
              className="flex-1 py-1.5 rounded text-xs font-semibold"
              style={{ background: '#27AE60', color: '#fff' }}
              onMouseEnter={e => e.currentTarget.style.background = '#1e8449'}
              onMouseLeave={e => e.currentTarget.style.background = '#27AE60'}>
              Apply selected
            </button>
            <button
              onClick={onReject}
              className="flex-1 py-1.5 rounded text-xs font-semibold"
              style={{ background: '#2a1a2e', color: '#e94560', border: '1px solid #e94560' }}
              onMouseEnter={e => e.currentTarget.style.background = '#3a1a2e'}
              onMouseLeave={e => e.currentTarget.style.background = '#2a1a2e'}>
              Reject all
            </button>
          </div>
        </>
      ) : (
        <p style={{ color: '#8892a4' }}>No graph changes proposed.</p>
      )}
    </div>
  )
}
