"use client";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <div className={cn(
        "flex flex-col md:flex-row md:items-center md:justify-between gap-4",
        "w-full"
      )}>
        <div className="flex-1">
          <h1 className="vigi-page-title">{title}</h1>
          {subtitle && (
            <p className="vigi-page-subtitle mt-1">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
