interface LoadingOverlayProps {
  message?: string
}

export default function LoadingOverlay({ message = 'Loading…' }: LoadingOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="spinner" />
        <p className="text-sm font-medium text-slate-600">{message}</p>
      </div>
    </div>
  )
}
