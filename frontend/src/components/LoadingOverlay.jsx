export default function LoadingOverlay({ message = 'Loading…' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="spinner" />
        <p className="text-sm font-medium text-content-secondary">{message}</p>
      </div>
    </div>
  )
}
