import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, width = "100%", height = "16px", ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200",
        "rounded-md animate-pulse",
        className
      )}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
      {...props}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="16px"
          width={i === lines - 1 ? "80%" : "100%"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="border border-[var(--border-primary)] rounded-lg p-6 bg-[var(--bg-secondary)]">
      <Skeleton height="24px" width="40%" className="mb-4" />
      <SkeletonText lines={3} className="mb-6" />
      <div className="flex gap-2 pt-4 border-t">
        <Skeleton width="80px" height="32px" />
        <Skeleton width="80px" height="32px" />
      </div>
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, columns = 4, className }: SkeletonTableProps) {
  return (
    <div className={cn("border border-[var(--border-primary)] rounded-lg overflow-hidden", className)}>
      <div className="bg-[var(--bg-tertiary)] border-b">
        <div className="flex">
          {Array.from({ length: columns }).map((_, i) => (
            <div key={`header-${i}`} className="flex-1 px-4 py-3 border-r last:border-r-0">
              <Skeleton height="16px" width="60%" />
            </div>
          ))}
        </div>
      </div>

      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={`row-${rowIdx}`} className="flex">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <div key={`cell-${rowIdx}-${colIdx}`} className="flex-1 px-4 py-3 border-r last:border-r-0">
                <Skeleton height="16px" width={(rowIdx + colIdx) % 2 === 0 ? "70%" : "90%"} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
