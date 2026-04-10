"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// useNotifications — Hook for real-time notification polling
// Replaces hardcoded mock notifications in dashboard layout
// ============================================================================

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "danger";
  category: string;
  link?: string;
  read: boolean;
  created_at: string;
  read_at?: string;
}

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL = 30_000; // 30 seconds

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=30");
      if (!res.ok) {
        if (res.status === 401) return; // Not logged in, skip silently
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setError(null);
    } catch (err) {
      console.error("[useNotifications] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Erro ao buscar notificações");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();

    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Revert on failure
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const clearAll = useCallback(async () => {
    // Optimistic: remove read notifications from UI
    setNotifications((prev) => prev.filter((n) => !n.read));

    try {
      await fetch("/api/notifications", { method: "DELETE" });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markRead,
    markAllRead,
    clearAll,
    refresh: fetchNotifications,
  };
}
