export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-[var(--border-primary)] rounded w-48" />
        <div className="h-10 bg-[var(--border-primary)] rounded w-32" />
      </div>

      <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border p-4 space-y-3">
        <div className="h-10 bg-[var(--border-primary)] rounded" />
        <div className="h-10 bg-[var(--border-primary)] rounded" />
      </div>

      <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border">
        <div className="space-y-3 p-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-[var(--border-primary)] rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
