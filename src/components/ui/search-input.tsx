"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
  debounceMs?: number;
  loading?: boolean;
  onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onSearch, debounceMs = 300, loading = false, onClear, placeholder = "Buscar...", className, ...props }, ref) => {
    const [value, setValue] = useState("");
    const debounceTimer = useRef<NodeJS.Timeout>(null);

    const handleSearch = useCallback(
      (searchValue: string) => {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(() => {
          onSearch?.(searchValue);
        }, debounceMs);
      },
      [onSearch, debounceMs]
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      handleSearch(newValue);
    };

    const handleClear = () => {
      setValue("");
      onClear?.();
      onSearch?.("");
    };

    useEffect(() => {
      return () => {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }
      };
    }, []);

    return (
      <div className={cn("relative w-full", className)}>
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        <input
          ref={ref}
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={loading}
          className={cn(
            "w-full pl-10 pr-10 py-2 text-[13px]",
            "border border-[var(--border-primary)] rounded-[var(--radius-full)]",
            "bg-[var(--bg-input)] text-[var(--text-primary)]",
            "focus:outline-none focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/12",
            "placeholder:text-[var(--text-tertiary)]",
            "transition-all duration-150 ease-out",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          {...props}
        />

        {loading && (
          <svg
            className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ds-primary)]"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}

        {!loading && value && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            aria-label="Limpar busca"
            type="button"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
