"use client";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  height?: number;
}

const SkeletonLoader = ({ height }: { height: number }) => (
  <div
    className="bg-[var(--bg-secondary)] rounded-[var(--radius-md)] animate-pulse"
    style={{ height: `${height}px` }}
  />
);

export function ChartCard({
  title,
  subtitle,
  children,
  actions,
  loading = false,
  height = 300,
}: ChartCardProps) {
  return (
    <div className="vigi-card p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex-shrink-0 ml-4">{actions}</div>}
      </div>

      {/* Chart Area */}
      <div className="w-full">
        {loading ? (
          <SkeletonLoader height={height} />
        ) : (
          <div style={{ minHeight: `${height}px` }}>{children}</div>
        )}
      </div>
    </div>
  );
}

export default ChartCard;
