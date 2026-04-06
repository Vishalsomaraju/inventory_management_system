// Primitive shimmer block
export function SkeletonBlock({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700 ${className}`}
    />
  );
}

// A full table skeleton: header row + N body rows × C columns
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
      {/* fake header */}
      <div className="flex gap-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* fake rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-4 border-b border-slate-100 dark:border-slate-700/50 px-4 py-4 last:border-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock
              key={c}
              className={`h-4 flex-1 ${c === 0 ? 'max-w-[120px]' : ''} ${c === cols - 1 ? 'max-w-[80px]' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Stat card skeleton (matches DashboardPage cards)
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm p-5 flex items-center gap-4">
      <SkeletonBlock className="h-11 w-11 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="h-6 w-12" />
      </div>
    </div>
  );
}

// Page header bar skeleton (title + button)
export function HeaderSkeleton({ hasButton = true }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm">
      <div className="space-y-2">
        <SkeletonBlock className="h-5 w-36" />
        <SkeletonBlock className="h-3 w-56" />
      </div>
      {hasButton && <SkeletonBlock className="h-10 w-28" />}
    </div>
  );
}
