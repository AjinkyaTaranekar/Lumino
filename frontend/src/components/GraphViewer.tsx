import { AlertCircle, Maximize2, Network, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface GraphViewerProps {
  /** Called to (re-)generate the graph on the backend. Returns a promise. */
  generateFn: () => Promise<unknown>
  /** URL that serves the rendered HTML graph file (GET). */
  iframeSrc: string
  height?: string
  title?: string
}

type Status = 'generating' | 'loading' | 'ready' | 'error'

const STEPS = [
  'Initialising session',
  'Building graph nodes',
  'Resolving edges',
  'Rendering visualisation',
]

const LEGEND_ITEMS = [
  { label: 'Strong match', color: '#16a34a' },
  { label: 'Related signal', color: '#0d9488' },
  { label: 'Inferred link', color: '#d97706' },
  { label: 'Gap', color: '#dc2626' },
]

// ─── Animated graph skeleton ──────────────────────────────────────────────────
function GraphSkeleton() {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 400 260"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Edges */}
      {[
        [200, 70, 110, 160], [200, 70, 290, 160], [200, 70, 200, 210],
        [110, 160, 55, 230], [290, 160, 345, 230], [110, 160, 200, 210],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="5 4">
          <animate attributeName="stroke-dashoffset"
            values="0;-18" dur={`${0.9 + i * 0.15}s`} repeatCount="indefinite" />
        </line>
      ))}
      {/* Nodes */}
      {[
        { cx: 200, cy: 70, r: 22, d: '0s' },
        { cx: 110, cy: 160, r: 16, d: '0.2s' },
        { cx: 290, cy: 160, r: 16, d: '0.4s' },
        { cx: 200, cy: 210, r: 13, d: '0.6s' },
        { cx: 55, cy: 230, r: 10, d: '0.8s' },
        { cx: 345, cy: 230, r: 10, d: '1.0s' },
      ].map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill="#E2E8F0">
          <animate attributeName="opacity" values="0.35;1;0.35"
            dur="1.8s" begin={n.d} repeatCount="indefinite" />
          <animate attributeName="fill" values="#E2E8F0;#BFDBFE;#E2E8F0"
            dur="1.8s" begin={n.d} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  )
}

// ─── GraphViewer ──────────────────────────────────────────────────────────────
export default function GraphViewer({
  generateFn,
  iframeSrc,
  height = '100%',
  title = 'Knowledge Graph',
}: GraphViewerProps) {
  const [status, setStatus] = useState<Status>('generating')
  const [error, setError] = useState<string | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(() => {
    setStatus('generating')
    setError(null)
    setStepIdx(0)

    // Advance fake step labels every ~700ms while waiting for backend
    let i = 0
    const advance = () => {
      i = Math.min(i + 1, STEPS.length - 1)
      setStepIdx(i)
      if (i < STEPS.length - 1) stepTimer.current = setTimeout(advance, 700)
    }
    stepTimer.current = setTimeout(advance, 700)

    generateFn()
      .then(() => {
        if (stepTimer.current) clearTimeout(stepTimer.current)
        setStepIdx(STEPS.length - 1)
        // Mount the iframe now - it will fire onLoad when the HTML is ready
        setStatus('loading')
      })
      .catch((err: unknown) => {
        if (stepTimer.current) clearTimeout(stepTimer.current)
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [generateFn]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    run()
    return () => { if (stepTimer.current) clearTimeout(stepTimer.current) }
  }, [iframeSrc]) // eslint-disable-line react-hooks/exhaustive-deps

  const progress = Math.round(((stepIdx + 1) / STEPS.length) * 100)
  const isBuilding = status === 'generating' || status === 'loading'

  return (
    <div
      className="w-full flex flex-col rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white"
      style={{ height }}
    >
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white flex-shrink-0">
        <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Network size={13} className="text-blue-500" />
        </div>
        <span className="text-xs font-semibold text-indigo-950 truncate flex-1">{title}</span>

        {isBuilding ? (
          <span className="text-[10px] font-medium text-blue-500 animate-pulse flex-shrink-0">
            Building…
          </span>
        ) : status === 'ready' ? (
          <span className="text-[10px] text-slate-400 hidden sm:block flex-shrink-0">
            Zoom, pan, and inspect links for evidence
          </span>
        ) : null}

        <button
          onClick={() => window.open(iframeSrc, '_blank')}
          className="p-1 rounded text-slate-400 hover:text-indigo-950 hover:bg-slate-100 transition-colors flex-shrink-0"
          title="Open full screen"
          aria-label="Open graph in new tab"
        >
          <Maximize2 size={13} />
        </button>
        <button
          onClick={run}
          className="p-1 rounded text-slate-400 hover:text-indigo-950 hover:bg-slate-100 transition-colors flex-shrink-0"
          title="Regenerate"
          aria-label="Regenerate graph"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0 bg-white">

        {/* Skeleton overlay while building */}
        {isBuilding && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 p-8 bg-white"
            role="status" aria-live="polite" aria-label="Generating graph"
          >
            <div className="w-56 h-44">
              <GraphSkeleton />
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-xs space-y-2.5">
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Steps */}
              <div className="space-y-1.5">
                {STEPS.map((step, idx) => {
                  const done = idx < stepIdx
                  const current = idx === stepIdx
                  return (
                    <div key={step} className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${done ? 'bg-blue-500' :
                        current ? 'ring-2 ring-blue-400 ring-offset-1 bg-blue-50' :
                          'bg-slate-100'
                        }`}>
                        {done && (
                          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 10 10">
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.6"
                              strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {current && <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />}
                      </div>
                      <span className={`text-[11px] transition-colors duration-300 ${done || current ? 'text-indigo-950 font-medium' : 'text-slate-400'
                        }`}>
                        {step}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-8 bg-white"
            role="alert">
            <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
              <AlertCircle size={22} className="text-red-400" />
            </div>
            <div className="text-center space-y-1 max-w-xs">
              <p className="text-sm font-semibold text-indigo-950">Failed to generate graph</p>
              {error && <p className="text-xs text-slate-400 leading-relaxed">{error}</p>}
            </div>
            <button onClick={run} className="btn-primary btn-sm flex items-center gap-1.5">
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}

        {/* iframe - mount once POST completes; onLoad transitions to 'ready' */}
        {(status === 'loading' || status === 'ready') && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="w-full h-full border-none block"
            style={{ opacity: status === 'ready' ? 1 : 0 }}
            title={title}
            onLoad={() => setStatus('ready')}
          />
        )}
      </div>
    </div>
  )
}
