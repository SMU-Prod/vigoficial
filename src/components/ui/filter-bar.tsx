"use client";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Badge } from "./badge";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  type: "select" | "date" | "search";
  options?: FilterOption[];
  placeholder?: string;
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

export function FilterBar({ filters, values, onChange, onClear }: FilterBarProps) {
  const activeFilterCount = Object.values(values).filter(v => v && v.trim()).length;

  return (
    <div className="vigi-card p-4 mb-4">
      <div className={cn(
        "flex flex-col md:flex-row md:items-center gap-3 md:gap-4",
        "flex-wrap"
      )}>
        {filters.map((filter) => (
          <div key={filter.key} className="flex-1 min-w-[200px] md:min-w-fit">
            {filter.type === "select" && (
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                  {filter.label}
                </label>
                <select
                  value={values[filter.key] || ""}
                  onChange={(e) => onChange(filter.key, e.target.value)}
                  className={cn(
                    "vigi-input",
                    "bg-[var(--bg-input)] text-[var(--text-primary)]",
                    "border border-[var(--border-primary)]",
                    "rounded-[var(--radius-md)]",
                    "px-3 py-2 text-[13px]",
                    "focus:border-[var(--border-focus)] focus:outline-none",
                    "focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-opacity-20"
                  )}
                >
                  <option value="">Todos</option>
                  {filter.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {filter.type === "date" && (
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                  {filter.label}
                </label>
                <input
                  type="date"
                  value={values[filter.key] || ""}
                  onChange={(e) => onChange(filter.key, e.target.value)}
                  className={cn(
                    "vigi-input",
                    "bg-[var(--bg-input)] text-[var(--text-primary)]",
                    "border border-[var(--border-primary)]",
                    "rounded-[var(--radius-md)]",
                    "px-3 py-2 text-[13px]",
                    "focus:border-[var(--border-focus)] focus:outline-none",
                    "focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-opacity-20"
                  )}
                />
              </div>
            )}

            {filter.type === "search" && (
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                  {filter.label}
                </label>
                <input
                  type="text"
                  placeholder={filter.placeholder || "Buscar..."}
                  value={values[filter.key] || ""}
                  onChange={(e) => onChange(filter.key, e.target.value)}
                  className={cn(
                    "vigi-input",
                    "bg-[var(--bg-input)] text-[var(--text-primary)]",
                    "border border-[var(--border-primary)]",
                    "rounded-[var(--radius-md)]",
                    "px-3 py-2 text-[13px]",
                    "focus:border-[var(--border-focus)] focus:outline-none",
                    "focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-opacity-20"
                  )}
                />
              </div>
            )}
          </div>
        ))}

        <div className="flex items-end gap-2 md:ml-auto">
          {activeFilterCount > 0 && (
            <Badge variant="blue" className="text-[12px]">
              {activeFilterCount} ativo{activeFilterCount !== 1 ? "s" : ""}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={activeFilterCount === 0}
          >
            Limpar filtros
          </Button>
        </div>
      </div>
    </div>
  );
}

export default FilterBar;
