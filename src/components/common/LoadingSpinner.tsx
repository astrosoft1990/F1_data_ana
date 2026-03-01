export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className={`${sizes[size]} animate-spin rounded-full border-2 border-f1-border border-t-f1-red`} />
  )
}

export function LoadingCard() {
  return (
    <div className="bg-f1-card border border-f1-border rounded-xl p-6 flex items-center justify-center gap-3 min-h-[200px]">
      <LoadingSpinner />
      <span className="text-f1-muted text-sm">加载数据中...</span>
    </div>
  )
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-f1-card border border-red-900/50 rounded-xl p-6 flex flex-col items-center gap-3 min-h-[200px] justify-center">
      <div className="text-4xl">⚠️</div>
      <p className="text-red-400 text-sm text-center">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 px-4 py-2 bg-f1-red text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
        >
          重试
        </button>
      )}
    </div>
  )
}
