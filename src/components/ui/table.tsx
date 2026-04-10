import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string | React.ReactNode;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

export function DataTable<T extends { id?: string }>({
  columns,
  data,
  onRowClick,
  emptyMessage = "Nenhum registro encontrado.",
  loading,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border-secondary)] p-12 text-center text-[var(--text-tertiary)]">
        <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-[var(--ds-primary)]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Carregando...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border-secondary)] p-12 text-center text-[var(--text-tertiary)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border-secondary)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2 text-left text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider",
                    "border-b border-[var(--border-primary)]",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={row.id ?? `row-${rowIndex}`}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b border-[var(--border-secondary)] last:border-b-0",
                  "transition-colors duration-150",
                  "hover:bg-[var(--bg-hover)]",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-3 py-2.5 text-[13px] text-[var(--text-primary)]", col.className)}>
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
