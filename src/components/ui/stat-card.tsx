"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  variant?: "default" | "success" | "warning" | "danger" | "info";
  loading?: boolean;
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  variant = "default",
  loading = false,
}: StatCardProps) {
  const variantStyles = {
    default: "bg-[var(--ds-primary-light)]",
    success: "bg-[var(--status-success-bg)]",
    warning: "bg-[var(--status-warning-bg)]",
    danger: "bg-[var(--status-danger-bg)]",
    info: "bg-[var(--status-info-bg)]",
  };

  const iconColorStyles = {
    default: "text-[var(--ds-primary)]",
    success: "text-[var(--status-success)]",
    warning: "text-[var(--status-warning)]",
    danger: "text-[var(--status-danger)]",
    info: "text-[var(--status-info)]",
  };

  const trendColorClass = trend && trend.value < 0
    ? "text-[var(--status-danger)]"
    : "text-[var(--status-success)]";

  if (loading) {
    return (
      <div className="vigi-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Skeleton height="16px" width="60%" className="mb-3" />
            <Skeleton height="32px" width="80%" className="mb-4" />
            <Skeleton height="14px" width="70%" />
          </div>
          <Skeleton height="48px" width="48px" className="rounded-lg flex-shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="vigi-card p-6">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-[13px] text-[var(--text-secondary)] font-medium mb-2">
            {label}
          </p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {value}
          </p>
          {trend && (
            <div className={cn("flex items-center gap-1 mt-2 text-[12px] font-medium", trendColorClass)}>
              {trend.value >= 0 ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
              <span>{Math.abs(trend.value)}% {trend.label}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={cn(
            "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
            variantStyles[variant],
            "ml-4"
          )}>
            <div className={iconColorStyles[variant]}>
              {icon}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StatCard;
