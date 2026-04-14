"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  type: "info" | "warning" | "success" | "danger";
  category?: string;
  link?: string;
}

interface NotificationBellProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}

const typeColors = {
  info: "border-l-[var(--status-info)]",
  warning: "border-l-[var(--status-warning)]",
  success: "border-l-[var(--status-success)]",
  danger: "border-l-[var(--status-danger)]",
};

const typeBgColors = {
  info: "bg-[var(--status-info-light)]",
  warning: "bg-[var(--status-warning-light)]",
  success: "bg-[var(--status-success-light)]",
  danger: "bg-[var(--status-danger-light)]",
};

const categoryIcons: Record<string, string> = {
  email_sent: "📧",
  email_received: "📨",
  email_error: "📧",
  workflow_created: "🔄",
  workflow_completed: "✅",
  workflow_error: "❌",
  compliance_alert: "⚠️",
  compliance_expiring: "📋",
  dou_match: "📰",
  dou_alert_sent: "📰",
  gesp_completed: "🏛️",
  gesp_error: "🏛️",
  billing_paid: "💰",
  billing_overdue: "💸",
  billing_created: "💳",
  prospect_new: "🎯",
  prospect_converted: "🏆",
  prospect_reply: "💬",
  agent_completed: "🤖",
  agent_error: "🤖",
  fleet_alert: "🚗",
  system: "⚙️",
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return "Agora";
  if (diffMin < 60) return `Há ${diffMin} min`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return `Há ${diffDays} dias`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function NotificationBell({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClear,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [open]);

  const handleNotificationClick = (notification: Notification) => {
    onMarkRead(notification.id);
    if (notification.link) {
      window.location.href = notification.link;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "relative p-2 rounded-[var(--radius-md)]",
          "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          "hover:bg-[var(--bg-hover)] transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
          "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
        )}
        aria-label="Notificações"
        aria-expanded={open}
      >
        {/* Bell SVG */}
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <div className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 bg-[var(--status-danger)] text-white text-xs font-bold rounded-full animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </div>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          className={cn(
            "absolute right-0 mt-2 w-96 z-50",
            "bg-[var(--bg-secondary)] border border-[var(--border-primary)]",
            "rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]",
            "flex flex-col"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Notificações {unreadCount > 0 && <span className="text-xs font-normal text-[var(--text-tertiary)]">({unreadCount} não lidas)</span>}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-xs text-[var(--text-link)] hover:text-[var(--text-link-hover)] transition-colors"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                <span className="text-2xl block mb-2">🔔</span>
                Nenhuma notificação
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-primary)]">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors duration-150",
                      "hover:bg-[var(--bg-hover)] border-l-4",
                      typeColors[notification.type],
                      !notification.read && typeBgColors[notification.type]
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {/* Category icon */}
                      <span className="text-base flex-shrink-0 mt-0.5">
                        {categoryIcons[notification.category || "system"] || "📌"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {notification.title}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          {formatTimeAgo(notification.created_at)}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="flex-shrink-0 w-2 h-2 bg-[var(--status-info)] rounded-full mt-1" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-[var(--border-primary)]">
              <button
                onClick={onClear}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--status-danger)] transition-colors w-full text-center"
              >
                Limpar notificações lidas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
