"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  disabled?: boolean;
}

export const Pagination = forwardRef<HTMLDivElement, PaginationProps>(
  ({
    currentPage,
    totalPages,
    totalCount,
    pageSize = 10,
    onPageChange,
    onPageSizeChange,
    disabled = false,
  }, ref) => {
    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, totalCount);

    const getPageNumbers = () => {
      const pages: (number | string)[] = [];
      const maxVisible = 5;
      const halfVisible = Math.floor(maxVisible / 2);

      if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);

        if (currentPage > halfVisible + 2) {
          pages.push("...");
        }

        const start = Math.max(2, currentPage - halfVisible);
        const end = Math.min(totalPages - 1, currentPage + halfVisible);

        for (let i = start; i <= end; i++) {
          pages.push(i);
        }

        if (currentPage < totalPages - halfVisible - 1) {
          pages.push("...");
        }

        pages.push(totalPages);
      }

      return pages;
    };

    const pages = getPageNumbers();

    return (
      <div ref={ref} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--text-secondary)]">
            Exibindo <span className="font-medium">{startIndex}</span> a{" "}
            <span className="font-medium">{endIndex}</span> de{" "}
            <span className="font-medium">{totalCount}</span> registros
          </div>

          {onPageSizeChange && (
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              disabled={disabled}
              className={cn(
                "px-3 py-1.5 text-sm border border-[var(--border-primary)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)]",
                "focus:outline-none focus:ring-2 focus:ring-[var(--vigi-gold)] focus:border-transparent",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <option value={10}>10 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
            </select>
          )}
        </div>

        <div className="flex items-center justify-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={disabled || currentPage === 1}
            aria-label="Página anterior"
          >
            ← Anterior
          </Button>

          <div className="flex items-center gap-1 mx-2">
            {pages.map((page, index) => {
              if (page === "...") {
                return (
                  <span key={`ellipsis-${index}`} className="px-2 py-1 text-[var(--text-tertiary)]">
                    {page}
                  </span>
                );
              }

              const isActive = page === currentPage;
              return (
                <button
                  key={page}
                  onClick={() => onPageChange(page as number)}
                  disabled={disabled}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "min-w-10 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    "focus-visible:outline-[var(--vigi-gold)]",
                    isActive
                      ? "bg-[var(--btn-primary)] text-white border-[var(--btn-primary)]"
                      : "border-[var(--border-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {page}
                </button>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={disabled || currentPage === totalPages}
            aria-label="Próxima página"
          >
            Próxima →
          </Button>
        </div>
      </div>
    );
  }
);

Pagination.displayName = "Pagination";
