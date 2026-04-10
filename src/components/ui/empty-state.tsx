"use client";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = "📋", title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-lg font-semibold text-[var(--vigi-navy)] mb-2">{title}</h3>
      <p className="text-[var(--text-secondary)] text-sm text-center max-w-sm mb-6">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-5 py-2.5 bg-[var(--btn-primary)] text-white rounded-lg hover:bg-[var(--btn-primary-hover)] transition-colors text-sm font-medium"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
