export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-[var(--border-primary)] rounded w-1/2 mb-4" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 bg-[var(--border-primary)] rounded w-20" />
            <div className="h-6 bg-[var(--border-primary)] rounded w-32" />
          </div>
        ))}
      </div>
      <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-4">
        <div className="h-5 bg-[var(--border-primary)] rounded w-32 mb-3" />
        <div className="flex flex-wrap gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-6 bg-[var(--border-primary)] rounded w-24" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-5 bg-[var(--border-primary)] rounded w-20" />
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--border-primary)] p-4 space-y-2"
          >
            <div className="h-4 bg-[var(--border-primary)] rounded w-40" />
            <div className="h-4 bg-[var(--border-primary)] rounded w-32" />
            <div className="space-y-2 mt-3">
              <div className="h-3 bg-[var(--border-primary)] rounded" />
              <div className="h-3 bg-[var(--border-primary)] rounded" />
              <div className="h-3 bg-[var(--border-primary)] rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
