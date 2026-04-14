"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

interface TimelineProps {
  items: TimelineItem[];
  maxItems?: number;
}

export function Timeline({ items, maxItems }: TimelineProps) {
  const [showAll, setShowAll] = useState(false);

  const variantDotColor = {
    default: "bg-[var(--ds-primary)]",
    success: "bg-[var(--status-success)]",
    warning: "bg-[var(--status-warning)]",
    danger: "bg-[var(--status-danger)]",
    info: "bg-[var(--status-info)]",
  };

  const displayItems = maxItems && !showAll ? items.slice(0, maxItems) : items;
  const hiddenCount = maxItems && items.length > maxItems ? items.length - maxItems : 0;

  return (
    <div className="vigi-card p-6">
      <div className="space-y-0">
        {displayItems.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              "relative pl-8 pb-6",
              index === displayItems.length - 1 && !showAll && hiddenCount === 0 && "pb-0"
            )}
          >
            {/* Line */}
            {index < displayItems.length - 1 || (maxItems && !showAll && hiddenCount > 0) ? (
              <div className="absolute left-2.5 top-8 bottom-0 w-0.5 bg-[var(--border-primary)]" />
            ) : null}

            {/* Dot */}
            <div className={cn(
              "absolute left-0 top-1 w-5 h-5 rounded-full",
              "border-2 border-[var(--bg-secondary)]",
              variantDotColor[item.variant || "default"]
            )} />

            {/* Content */}
            <div>
              <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
                {item.title}
              </h4>
              {item.description && (
                <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                  {item.description}
                </p>
              )}
              <p className="text-[11px] text-[var(--text-tertiary)] mt-2">
                {item.timestamp}
              </p>
            </div>
          </div>
        ))}
      </div>

      {maxItems && !showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className={cn(
            "mt-4 text-[13px] font-medium",
            "text-[var(--text-link)]",
            "hover:underline transition-colors duration-150"
          )}
        >
          Ver mais {hiddenCount} {hiddenCount === 1 ? "item" : "itens"}
        </button>
      )}
    </div>
  );
}

export default Timeline;
