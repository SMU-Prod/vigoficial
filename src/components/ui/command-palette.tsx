"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  category: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  items: CommandItem[];
  open: boolean;
  onClose: () => void;
}

// Fuzzy search implementation
function fuzzySearch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  let queryIndex = 0;

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === lowerQuery.length;
}

// Highlight matching text
function highlightMatch(text: string, query: string): React.ReactNode[] {
  if (!query) return [text];

  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let queryIndex = 0;

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      if (i > lastIndex) {
        parts.push(text.substring(lastIndex, i));
      }
      parts.push(
        <mark key={`match-${i}`} className="bg-[var(--status-warning-light)] font-medium">
          {text[i]}
        </mark>
      );
      lastIndex = i + 1;
      queryIndex++;
    }
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

export function CommandPalette({ items, open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => items.filter((item) => {
    if (!query) return true;
    const searchText = `${item.label} ${item.description || ""} ${(item.keywords || []).join(" ")}`;
    return fuzzySearch(query, searchText);
  }), [items, query]);

  const groupedItems = useMemo(() => filteredItems.reduce(
    (acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, CommandItem[]>
  ), [filteredItems]);

  const flatItems = useMemo(() => Object.values(groupedItems).flat(), [groupedItems]);

  const handleSelectItem = useCallback((item: CommandItem) => {
    item.action();
    onClose();
    setQuery("");
  }, [onClose]);

  // Focus input on open
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        setQuery("");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? filteredItems.length - 1 : prev - 1
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleSelectItem(filteredItems[selectedIndex]);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, selectedIndex, filteredItems, handleSelectItem, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
          setQuery("");
        }
      }}
    >
      <div
        ref={containerRef}
        className="w-full max-w-lg bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] border border-[var(--border-secondary)] flex flex-col max-h-96"
      >
        {/* Search Input */}
        <div className="p-4 border-b border-[var(--border-primary)]">
          <input
            ref={inputRef}
            type="text"
            placeholder="Digite para buscar..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className={cn(
              "w-full px-3 py-2 rounded-[var(--radius-md)]",
              "bg-[var(--bg-primary)] text-[var(--text-primary)]",
              "border border-[var(--border-primary)]",
              "placeholder:text-[var(--text-tertiary)]",
              "focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]",
              "transition-all duration-150"
            )}
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--text-tertiary)]">
              Nenhum resultado para <span className="font-medium">&ldquo;{query}&rdquo;</span>
            </div>
          ) : (
            <div>
              {Object.entries(groupedItems).map(([category, categoryItems]) => (
                <div key={category}>
                  {/* Category Header */}
                  <div className="px-4 py-2 mt-2 first:mt-0 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {category}
                  </div>

                  {/* Category Items */}
                  {categoryItems.map((item) => {
                    const itemIndex = flatItems.indexOf(item);
                    const isSelected = selectedIndex === itemIndex;

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={cn(
                          "w-full px-4 py-2 text-left flex items-start gap-3",
                          "transition-colors duration-150",
                          isSelected
                            ? "bg-[var(--bg-hover)]"
                            : "hover:bg-[var(--bg-hover)]"
                        )}
                      >
                        {/* Icon */}
                        {item.icon && (
                          <div className="flex-shrink-0 w-5 h-5 mt-0.5 text-[var(--text-secondary)]">
                            {item.icon}
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {highlightMatch(item.label, query)}
                          </p>
                          {item.description && (
                            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-1">
                              {highlightMatch(item.description, query)}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Hint */}
        {filteredItems.length > 0 && (
          <div className="px-4 py-2 border-t border-[var(--border-primary)] text-xs text-[var(--text-tertiary)] flex items-center justify-between">
            <span>
              {selectedIndex + 1} de {flatItems.length}
            </span>
            <div className="flex gap-2">
              <kbd className="px-2 py-1 bg-[var(--bg-primary)] rounded text-[var(--text-secondary)] border border-[var(--border-primary)]">
                ↑↓
              </kbd>
              <kbd className="px-2 py-1 bg-[var(--bg-primary)] rounded text-[var(--text-secondary)] border border-[var(--border-primary)]">
                Enter
              </kbd>
              <kbd className="px-2 py-1 bg-[var(--bg-primary)] rounded text-[var(--text-secondary)] border border-[var(--border-primary)]">
                Esc
              </kbd>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CommandPalette;
