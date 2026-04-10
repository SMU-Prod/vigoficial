"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface StepperProps {
  steps: {
    id: string;
    label: string;
    description?: string;
  }[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export const Stepper = forwardRef<HTMLDivElement, StepperProps>(
  ({ steps, currentStep, onStepClick, orientation = "horizontal", className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex gap-8",
          orientation === "vertical" && "flex-col",
          className
        )}
      >
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          const isClickable = isCompleted && onStepClick;

          return (
            <div key={step.id} className={cn("flex items-start", orientation === "vertical" && "flex-col relative")}>
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "absolute",
                    orientation === "horizontal"
                      ? "h-0.5 w-8 top-5 left-16 -z-10"
                      : "w-0.5 h-12 left-5 top-16",
                    isCompleted ? "bg-[var(--btn-primary)]" : "bg-[var(--border-primary)]"
                  )}
                  aria-hidden="true"
                />
              )}

              {/* Step Circle */}
              <button
                onClick={() => isClickable && onStepClick?.(index)}
                disabled={!isClickable}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  "focus-visible:outline-[var(--vigi-gold)] transition-colors",
                  isActive && "ring-4 ring-[var(--vigi-gold)]/20",
                  isCompleted
                    ? "bg-[var(--btn-primary)] text-white cursor-pointer hover:bg-[#142d52]"
                    : isActive
                      ? "bg-[var(--bg-secondary)] border-2 border-[var(--vigi-gold)] text-[var(--vigi-navy)]"
                      : "bg-[var(--border-primary)] text-[var(--text-secondary)]",
                  !isClickable && "cursor-not-allowed"
                )}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${step.label}`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </button>

              {/* Step Label */}
              <div className={cn("ml-4", orientation === "vertical" && "ml-0 mt-3")}>
                <p className={cn("font-medium", isActive || isCompleted ? "text-[var(--vigi-navy)]" : "text-[var(--text-secondary)]")}>
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{step.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

Stepper.displayName = "Stepper";
