export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 bg-[var(--border-primary)] rounded w-48" />
      <div className="h-10 bg-[var(--border-primary)] rounded" />
      <div className="flex gap-2 border-b border-[var(--border-primary)] pb-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-4 bg-[var(--border-primary)] rounded w-24" />
        ))}
      </div>
      <div className="bg-[var(--bg-secondary)] rounded-xl p-6 shadow-sm">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-[var(--border-primary)] rounded w-full" />
          ))}
        </div>
      </div>
      <div className="h-10 bg-[var(--border-primary)] rounded w-48" />
    </div>
  );
}
