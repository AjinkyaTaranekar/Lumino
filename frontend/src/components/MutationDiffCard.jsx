import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react'

function Section({ title, items, colorClass, renderItem, selected, onToggle }) {
  const [open, setOpen] = useState(true)
  if (!items || items.length === 0) return null
  return (
    <div className="mb-2">
      <button
        className={`flex items-center gap-1 text-xs font-semibold w-full text-left py-1 ${colorClass}`}
        onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {title} ({items.length})
      </button>
      {open && (
        <ul className="space-y-1 pl-3 mt-0.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-content-secondary">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => onToggle(i)}
                className="mt-0.5 flex-shrink-0 accent-primary-500"
              />
              <span className="font-mono text-[11px] break-all">{renderItem(item)}</span>
            </li>
          ))}
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

  const [addSel,  setAddSel]  = useState(() => new Set((mutations.add_nodes    || []).map((_, i) => i)))
  const [updSel,  setUpdSel]  = useState(() => new Set((mutations.update_nodes || []).map((_, i) => i)))
  const [remSel,  setRemSel]  = useState(() => new Set((mutations.remove_nodes || []).map((_, i) => i)))
  const [edgeSel, setEdgeSel] = useState(() => new Set((mutations.add_edges    || []).map((_, i) => i)))

  function toggleSet(set, setter, i) {
    setter(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function handleApply() {
    onApply({
      add_nodes:    (mutations.add_nodes    || []).filter((_, i) => addSel.has(i)),
      update_nodes: (mutations.update_nodes || []).filter((_, i) => updSel.has(i)),
      remove_nodes: (mutations.remove_nodes || []).filter((_, i) => remSel.has(i)),
      add_edges:    (mutations.add_edges    || []).filter((_, i) => edgeSel.has(i)),
    })
  }

  const hasAny = (
    (mutations.add_nodes?.length    || 0) +
    (mutations.update_nodes?.length || 0) +
    (mutations.remove_nodes?.length || 0) +
    (mutations.add_edges?.length    || 0)
  ) > 0

  return (
    <div className="rounded-lg p-3 mt-2 bg-surface-raised border border-surface-border text-xs">
      {reasoning && (
        <p className="mb-2 text-xs italic text-content-muted">{reasoning}</p>
      )}

      {hasAny ? (
        <>
          <Section title="Add nodes"    items={mutations.add_nodes}    colorClass="text-success-600"  renderItem={renderNode}       selected={addSel}  onToggle={i => toggleSet(addSel,  setAddSel,  i)} />
          <Section title="Update nodes" items={mutations.update_nodes} colorClass="text-warning-600"  renderItem={renderNode}       selected={updSel}  onToggle={i => toggleSet(updSel,  setUpdSel,  i)} />
          <Section title="Remove nodes" items={mutations.remove_nodes} colorClass="text-danger-500"   renderItem={s => String(s)}   selected={remSel}  onToggle={i => toggleSet(remSel,  setRemSel,  i)} />
          <Section title="Add edges"    items={mutations.add_edges}    colorClass="text-primary-500"  renderItem={renderEdge}       selected={edgeSel} onToggle={i => toggleSet(edgeSel, setEdgeSel, i)} />

          <div className="flex gap-2 mt-3">
            <button onClick={handleApply} className="btn-success btn-sm flex-1">
              <Check size={12} /> Apply
            </button>
            <button onClick={onReject} className="btn-secondary btn-sm flex-1">
              <X size={12} /> Reject
            </button>
          </div>
        </>
      ) : (
        <p className="text-content-muted">No graph changes proposed.</p>
      )}
    </div>
  )
}
