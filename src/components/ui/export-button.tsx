"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ExportButtonProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  filename: string;
  columns?: { key: string; label: string }[];
  formats?: ("csv" | "excel")[];
}

export function ExportButton({
  data,
  filename,
  columns,
  formats = ["csv", "excel"],
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const getCSVContent = (isExcel: boolean = false): string => {
    const cols = columns || (data.length > 0 ? Object.keys(data[0]).map(key => ({ key, label: key })) : []);

    const headers = cols.map(col => `"${col.label}"`).join(",");
    const rows = data.map(row =>
      cols.map(col => {
        const value = row[col.key];
        const stringValue = String(value ?? "");
        return `"${stringValue.replace(/"/g, '""')}"`;
      }).join(",")
    );

    const csv = [headers, ...rows].join("\n");

    if (isExcel) {
      return "\uFEFF" + csv;
    }
    return csv;
  };

  const handleExport = async (format: "csv" | "excel") => {
    setLoading(true);
    try {
      const content = getCSVContent(format === "excel");
      const mimeType = format === "excel" ? "text/csv;charset=utf-8" : "text/csv;charset=utf-8";
      const blob = new Blob([content], { type: mimeType });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `${filename}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen(!open)}
        disabled={loading || data.length === 0}
        className="flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {loading ? "Exportando..." : "Exportar"}
      </Button>

      {open && (
        <div className={cn(
          "absolute right-0 top-full mt-2 z-50",
          "bg-[var(--bg-secondary)] border border-[var(--border-primary)]",
          "rounded-[var(--radius-md)] shadow-[var(--shadow-md)]",
          "overflow-hidden min-w-[150px]"
        )}>
          {formats.includes("csv") && (
            <button
              onClick={() => handleExport("csv")}
              disabled={loading}
              className={cn(
                "w-full text-left px-4 py-2.5 text-[13px]",
                "text-[var(--text-primary)] transition-colors duration-150",
                "hover:bg-[var(--bg-hover)]",
                "border-b border-[var(--border-secondary)]",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              CSV
            </button>
          )}
          {formats.includes("excel") && (
            <button
              onClick={() => handleExport("excel")}
              disabled={loading}
              className={cn(
                "w-full text-left px-4 py-2.5 text-[13px]",
                "text-[var(--text-primary)] transition-colors duration-150",
                "hover:bg-[var(--bg-hover)]",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              Excel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ExportButton;
