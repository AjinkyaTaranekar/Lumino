import { Activity, BookOpen, Briefcase, Check, ChevronDown, ChevronRight, Folder, Heart, Layers, Star, Target, Users, X, Zap } from 'lucide-react'
import { useState } from 'react'
import type { GraphImpactBanner, GraphImpactItem, GraphMutation, GraphMutationProposal } from '../lib/types'

interface SectionProps {
  title: string
  items: unknown[] | undefined
  colorClass: string
  renderItem: (item: unknown) => string
  selected: Set<number>
  onToggle: (i: number) => void
}

function Section({ title, items, colorClass, renderItem, selected, onToggle }: SectionProps) {
  const [open, setOpen] = useState(true)
  if (!items || items.length === 0) return null
  return (
    <div className="mb-2">
      <button
        type="button"
        className={`flex items-center gap-1 text-xs font-semibold w-full text-left py-1 ${colorClass} focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {title} ({items.length})
      </button>
      {open && (
        <ul className="space-y-1 pl-3 mt-0.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => onToggle(i)}
                className="mt-0.5 flex-shrink-0 accent-blue-500"
                aria-label={`Select ${title} item ${i + 1}`}
              />
              <span className="font-mono text-[11px] break-all">{renderItem(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function renderNode(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'object' && node !== null) {
    const { label, name, ...rest } = node as Record<string, unknown>
    const extras = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(', ')
    return `[${label}] ${name}${extras ? ` - ${extras}` : ''}`
  }
  return String(node)
}

const IMPACT_ICONS: Record<GraphImpactItem['icon'], React.ElementType> = {
  skill: Zap,
  anecdote: BookOpen,
  motivation: Heart,
  value: Star,
  goal: Target,
  culture: Users,
  behavior: Activity,
  domain: Layers,
  project: Folder,
  experience: Briefcase,
}

const CHANGE_COLORS: Record<string, string> = {
  added: 'text-emerald-600 bg-emerald-50',
  updated: 'text-amber-600 bg-amber-50',
  removed: 'text-red-500 bg-red-50',
}

function ImpactBannerView({ banner }: { banner: GraphImpactBanner }) {
  return (
    <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
      <p className="text-xs font-semibold text-blue-700 mb-2">{banner.headline}</p>
      {banner.items.length > 0 && (
        <ul className="space-y-1 mb-2">
          {banner.items.map((item, i) => {
            const Icon = IMPACT_ICONS[item.icon] ?? Zap
            const colorCls = CHANGE_COLORS[item.change_type] ?? 'text-slate-600 bg-slate-100'
            return (
              <li key={i} className="flex items-start gap-2 text-xs">
                <Icon size={11} className={`flex-shrink-0 mt-0.5 ${colorCls.split(' ')[0]}`} />
                <span className="text-slate-700">
                  <span className={`inline-block px-1 rounded text-[10px] font-semibold mr-1 ${colorCls}`}>
                    {item.change_type}
                  </span>
                  <span className="font-medium">{item.label}</span>
                  {item.detail && <span className="text-slate-400"> - {item.detail}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {banner.digital_twin_progress && (
        <p className="text-[11px] text-blue-600 italic">{banner.digital_twin_progress}</p>
      )}
    </div>
  )
}

function renderEdge(edge: unknown): string {
  if (typeof edge === 'object' && edge !== null) {
    const { from, rel, to } = edge as Record<string, unknown>
    return `${from} -[${rel}]→ ${to}`
  }
  return String(edge)
}

interface MutationDiffCardProps {
  proposal: GraphMutationProposal
  onApply: (mutations: GraphMutation) => void
  onReject: () => void
}

export default function MutationDiffCard({ proposal, onApply, onReject }: MutationDiffCardProps) {
  const { mutations, reasoning, graph_impact_banner } = proposal

  const [addSel, setAddSel] = useState<Set<number>>(() => new Set((mutations.add_nodes || []).map((_, i) => i)))
  const [updSel, setUpdSel] = useState<Set<number>>(() => new Set((mutations.update_nodes || []).map((_, i) => i)))
  const [remSel, setRemSel] = useState<Set<number>>(() => new Set((mutations.remove_nodes || []).map((_, i) => i)))
  const [edgeSel, setEdgeSel] = useState<Set<number>>(() => new Set((mutations.add_edges || []).map((_, i) => i)))

  function toggleSet(set: Set<number>, setter: React.Dispatch<React.SetStateAction<Set<number>>>, i: number) {
    setter(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function handleApply() {
    onApply({
      add_nodes: (mutations.add_nodes || []).filter((_, i) => addSel.has(i)),
      update_nodes: (mutations.update_nodes || []).filter((_, i) => updSel.has(i)),
      remove_nodes: (mutations.remove_nodes || []).filter((_, i) => remSel.has(i)),
      add_edges: (mutations.add_edges || []).filter((_, i) => edgeSel.has(i)),
    })
  }

  const hasAny = (
    (mutations.add_nodes?.length || 0) +
    (mutations.update_nodes?.length || 0) +
    (mutations.remove_nodes?.length || 0) +
    (mutations.add_edges?.length || 0)
  ) > 0

  return (
    <div className="rounded-lg p-3 mt-2 bg-slate-50 border border-slate-100 text-xs">
      {graph_impact_banner && <ImpactBannerView banner={graph_impact_banner} />}
      {reasoning && (
        <p className="mb-2 text-xs italic text-slate-400">{reasoning}</p>
      )}

      {hasAny ? (
        <>
          <Section title="Add nodes" items={mutations.add_nodes} colorClass="text-emerald-600" renderItem={renderNode} selected={addSel} onToggle={i => toggleSet(addSel, setAddSel, i)} />
          <Section title="Update nodes" items={mutations.update_nodes} colorClass="text-amber-600" renderItem={renderNode} selected={updSel} onToggle={i => toggleSet(updSel, setUpdSel, i)} />
          <Section title="Remove nodes" items={mutations.remove_nodes} colorClass="text-red-500" renderItem={s => String(s)} selected={remSel} onToggle={i => toggleSet(remSel, setRemSel, i)} />
          <Section title="Add edges" items={mutations.add_edges} colorClass="text-blue-500" renderItem={renderEdge} selected={edgeSel} onToggle={i => toggleSet(edgeSel, setEdgeSel, i)} />

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleApply}
              className="btn-primary flex-1 flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            >
              <Check size={12} /> Apply
            </button>
            <button
              type="button"
              onClick={onReject}
              className="btn-secondary flex-1 flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
            >
              <X size={12} /> Reject
            </button>
          </div>
        </>
      ) : (
        <p className="text-slate-400">No graph changes proposed.</p>
      )}
    </div>
  )
}
