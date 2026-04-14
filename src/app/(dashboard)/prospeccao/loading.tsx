export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 bg-[var(--border-primary)] rounded w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[var(--bg-secondary)] rounded-xl p-6 shadow-sm">
            <div className="h-4 bg-[var(--border-primary)] rounded w-24 mb-3" />
            <div className="h-8 bg-[var(--border-primary)] rounded w-16" />
          </div>
        ))}
      </div>
      <div className="bg-[var(--bg-secondary)] rounded-xl p-6 shadow-sm">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 bg-[var(--border-primary)] rounded w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
