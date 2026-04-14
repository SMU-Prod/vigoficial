import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, children, className, disabled, ...props }, ref) => {
    const variants = {
      primary: "bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)]",
      secondary: "bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)] hover:bg-[var(--bg-hover)]",
      danger: "bg-[var(--status-danger)] text-white hover:opacity-90",
      ghost: "text-[var(--text-link)] hover:bg-[var(--ds-primary-light)]",
    };

    const sizes = {
      sm: "px-2.5 py-1 text-xs gap-1.5",
      md: "px-4 py-2 text-[13px] gap-1.5",
      lg: "px-6 py-2.5 text-[15px] gap-2",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium",
          "rounded-[var(--radius-md)]",
          "transition-all duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]",
          "disabled:opacity-45 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
