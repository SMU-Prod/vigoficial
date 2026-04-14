"use client";

import { forwardRef, Children } from "react";
import { cn } from "@/lib/utils";

interface BreadcrumbProps {
  children: React.ReactNode;
  separator?: string | React.ReactNode;
  className?: string;
}

export const BreadcrumbList = forwardRef<HTMLElement, BreadcrumbProps>(
  ({ children, separator = "/", className }, ref) => {
    const items = Children.toArray(children);

    return (
      <nav ref={ref} aria-label="breadcrumb" className={cn("py-4", className)}>
        <ol className="flex items-center gap-2 flex-wrap">
          {items.map((child, index) => (
            <li key={`breadcrumb-${index}`} className="flex items-center gap-2">
              {index > 0 && (
                <span className="text-[var(--text-tertiary)] text-sm mx-1" aria-hidden="true">
                  {separator}
                </span>
              )}
              {child}
            </li>
          ))}
        </ol>
      </nav>
    );
  }
);

BreadcrumbList.displayName = "BreadcrumbList";

interface BreadcrumbItemProps {
  children: React.ReactNode;
  href?: string;
  className?: string;
  current?: boolean;
}

export const BreadcrumbItem = forwardRef<HTMLSpanElement, BreadcrumbItemProps>(
  ({ children, href, className, current = false }, ref) => {
    const textClass = cn(
      "text-sm transition-colors",
      current
        ? "text-[var(--text-primary)] font-medium"
        : "text-[var(--text-secondary)] hover:text-[var(--vigi-navy)]"
    );

    if (href) {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={cn(
            textClass,
            "inline-flex items-center focus-visible:outline focus-visible:outline-2",
            "focus-visible:outline-offset-2 focus-visible:outline-[var(--vigi-gold)] rounded",
            className
          )}
          aria-current={current ? "page" : undefined}
        >
          {children}
        </a>
      );
    }

    return (
      <span
        ref={ref}
        className={cn(textClass, className)}
        aria-current={current ? "page" : undefined}
      >
        {children}
      </span>
    );
  }
);

BreadcrumbItem.displayName = "BreadcrumbItem";

interface BreadcrumbSeparatorProps {
  children?: React.ReactNode;
  className?: string;
}

export const BreadcrumbSeparator = forwardRef<
  HTMLSpanElement,
  BreadcrumbSeparatorProps
>(({ children = "/", className }, ref) => (
  <span
    ref={ref}
    role="presentation"
    className={cn("text-[var(--text-tertiary)] text-sm mx-1", className)}
    aria-hidden="true"
  >
    {children}
  </span>
));

BreadcrumbSeparator.displayName = "BreadcrumbSeparator";
