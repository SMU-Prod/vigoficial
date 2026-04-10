"use client";

import { forwardRef, useCallback, useState } from "react";
import { cn } from "@/lib/utils";

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value?: string;
  onChange?: (value: string) => void;
  minDate?: string;
  maxDate?: string;
  label?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value = "", onChange, minDate, maxDate, label, className, ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState(() => {
      if (value) {
        const date = new Date(value);
        return formatDateBR(date);
      }
      return "";
    });

    const formatDateBR = (date: Date): string => {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const parseDateBR = (input: string): Date | null => {
      const cleaned = input.replace(/\D/g, "");
      if (cleaned.length !== 8) return null;

      const day = parseInt(cleaned.substring(0, 2), 10);
      const month = parseInt(cleaned.substring(2, 4), 10);
      const year = parseInt(cleaned.substring(4, 8), 10);

      if (month < 1 || month > 12 || day < 1 || day > 31) return null;

      const date = new Date(year, month - 1, day);
      if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;

      return date;
    };

    const toISOString = (date: Date): string => {
      return date.toISOString().split("T")[0];
    };

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value;
        const cleaned = input.replace(/\D/g, "");

        if (cleaned.length > 8) {
          return;
        }

        let formatted = cleaned;
        if (cleaned.length >= 3) {
          formatted = cleaned.substring(0, 2) + "/" + cleaned.substring(2);
        }
        if (cleaned.length >= 5) {
          formatted = cleaned.substring(0, 2) + "/" + cleaned.substring(2, 4) + "/" + cleaned.substring(4);
        }

        setDisplayValue(formatted);

        if (cleaned.length === 8) {
          const parsed = parseDateBR(formatted);
          if (parsed) {
            let isValid = true;

            if (minDate) {
              const min = new Date(minDate);
              min.setHours(0, 0, 0, 0);
              isValid = parsed >= min;
            }

            if (isValid && maxDate) {
              const max = new Date(maxDate);
              max.setHours(23, 59, 59, 999);
              isValid = parsed <= max;
            }

            if (isValid) {
              onChange?.(toISOString(parsed));
            }
          }
        }
      },
      [onChange, minDate, maxDate]
    );

    const handleBlur = () => {
      if (displayValue && !displayValue.includes("_")) {
        const parsed = parseDateBR(displayValue);
        if (!parsed) {
          setDisplayValue("");
          onChange?.("");
        }
      }
    };

    return (
      <div className="space-y-1">
        {label && <label className="text-sm font-medium text-[var(--text-primary)]">{label}</label>}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>

          <input
            ref={ref}
            type="text"
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="DD/MM/AAAA"
            className={cn(
              "w-full pl-10 pr-4 py-2 text-sm border border-[var(--border-primary)] rounded-md bg-[var(--bg-secondary)] text-[var(--text-primary)]",
              "focus:outline-none focus:ring-2 focus:ring-[var(--vigi-gold)] focus:border-transparent",
              "placeholder-gray-400 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              className
            )}
            {...props}
          />
        </div>
      </div>
    );
  }
);

DatePicker.displayName = "DatePicker";
