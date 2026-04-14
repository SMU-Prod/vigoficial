"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}

const widthMap = {
  sm: "w-80",
  md: "w-[480px]",
  lg: "w-[640px]",
  xl: "w-[800px]",
};

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "md",
}: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className={cn(
          "absolute inset-0 bg-black/50 backdrop-blur-sm",
          "transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose();
        }}
      />

      {/* Drawer Panel */}
      <div
        className={cn(
          "absolute inset-y-0 right-0",
          widthMap[width],
          "bg-[var(--bg-secondary)] border-l border-[var(--border-secondary)]",
          "shadow-[var(--shadow-lg)]",
          "flex flex-col",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-[var(--border-primary)] flex-shrink-0">
          <div className="flex-1 pr-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className={cn(
              "flex-shrink-0 text-[var(--text-tertiary)]",
              "hover:text-[var(--text-primary)]",
              "transition-colors duration-150",
              "p-1 rounded-[var(--radius-sm)]",
              "hover:bg-[var(--bg-hover)]"
            )}
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Drawer;
