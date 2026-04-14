"use client";

import { createContext, useContext, useState, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface TabsContextType {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

const useTabsContext = () => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within Tabs");
  }
  return context;
};

interface TabsProps {
  children: React.ReactNode;
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({ children, defaultValue, value, onValueChange }: TabsProps) {
  const [activeTab, setActiveTab] = useState(value ?? defaultValue);

  const handleSetActiveTab = (newValue: string) => {
    setActiveTab(newValue);
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleSetActiveTab }}>
      <div>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(({ children, className }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn(
      "flex items-center gap-1 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] rounded-t-lg p-1",
      className
    )}
  >
    {children}
  </div>
));

TabsList.displayName = "TabsList";

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: React.ReactNode;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, children, className, ...props }, ref) => {
    const { activeTab, setActiveTab } = useTabsContext();
    const isActive = activeTab === value;

    return (
      <button
        ref={ref}
        role="tab"
        aria-selected={isActive}
        aria-controls={`panel-${value}`}
        id={`tab-${value}`}
        onClick={() => setActiveTab(value)}
        className={cn(
          "px-4 py-2 text-sm font-medium text-[var(--text-secondary)] border-b-2 border-transparent",
          "hover:text-[var(--text-primary)] transition-colors focus-visible:outline focus-visible:outline-2",
          "focus-visible:outline-offset-2 focus-visible:outline-[var(--vigi-gold)]",
          isActive && "text-[var(--vigi-navy)] border-b-2 border-[var(--vigi-gold)]",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

TabsTrigger.displayName = "TabsTrigger";

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, children, className }, ref) => {
    const { activeTab } = useTabsContext();
    const isActive = activeTab === value;

    if (!isActive) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`panel-${value}`}
        aria-labelledby={`tab-${value}`}
        className={cn("p-4 bg-[var(--bg-secondary)] rounded-b-lg", className)}
      >
        {children}
      </div>
    );
  }
);

TabsContent.displayName = "TabsContent";
