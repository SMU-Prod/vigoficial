import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            {label}
            {props.required && <span className="text-[var(--status-danger)] ml-0.5">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            "block w-full rounded-[var(--radius-md)] border px-3 py-2 text-[13px] text-[var(--text-primary)] bg-[var(--bg-input)]",
            "transition-[border-color] duration-150 ease-out",
            "focus:outline-none",
            error
              ? "border-[var(--status-danger)] focus:border-[var(--status-danger)] focus:ring-2 focus:ring-[var(--status-danger)]/20"
              : "border-[var(--border-primary)] focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/12",
            props.disabled && "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed opacity-60",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="">{placeholder}</option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-[var(--status-danger)]">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";
