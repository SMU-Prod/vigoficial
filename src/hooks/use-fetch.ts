"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  refetchInterval?: number;
  skip?: boolean;
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
  retry?: boolean; // FE-05: Enable automatic token refresh on 401
}

interface UseFetchState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

interface UseFetchReturn<T> extends UseFetchState<T> {
  refetch: () => Promise<void>;
  mutate: (newData: T) => void;
}

/**
 * Custom hook for fetching data with caching and error handling
 */
export function useFetch<T = unknown>(
  url: string | null,
  options: UseFetchOptions = {}
): UseFetchReturn<T> {
  const [state, setState] = useState<UseFetchState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const refetchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const optionsRef = useRef(options);
  const retryCountRef = useRef(0); // FE-05: Track refresh retries
  optionsRef.current = options;

  const fetchData = useCallback(async () => {
    if (!url || optionsRef.current.skip) {
      setState({ data: null, error: null, loading: false });
      return;
    }

    // Cancel previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { method = "GET", body } = optionsRef.current;

      const fetchOptions: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current?.signal,
      };

      if (body && method !== "GET") {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      // FE-05: Handle 401 Unauthorized with automatic token refresh
      if (response.status === 401 && optionsRef.current.retry !== false && retryCountRef.current === 0) {
        retryCountRef.current++;
        try {
          // Attempt to refresh token
          const refreshResponse = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          if (refreshResponse.ok) {
            // Token refreshed successfully, retry original request
            const retryResponse = await fetch(url, fetchOptions);
            if (!retryResponse.ok) {
              throw new Error(`HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
            }
            const data = await retryResponse.json();
            setState({ data: data as T, error: null, loading: false });
            optionsRef.current.onSuccess?.(data);
            return;
          }
        } catch (_refreshError) {
          console.warn("[useFetch] Token refresh failed, proceeding with original error");
        }
        // If refresh failed, fall through to handle original 401
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      setState({ data: data as T, error: null, loading: false });
      optionsRef.current.onSuccess?.(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;

      const error = err instanceof Error ? err : new Error("Unknown error");
      setState((prev) => ({ data: prev.data, error, loading: false }));
      optionsRef.current.onError?.(error);
      retryCountRef.current = 0; // Reset retry counter on final error
    }
  }, [url]);

  // Initial fetch
  useEffect(() => {
    retryCountRef.current = 0; // Reset retry counter on URL change
    fetchData();
    return () => { abortControllerRef.current?.abort(); };
  }, [fetchData]);

  // Auto-refetch interval
  useEffect(() => {
    const { refetchInterval, skip } = optionsRef.current;
    if (!refetchInterval || !url || skip) return;

    refetchIntervalRef.current = setInterval(fetchData, refetchInterval);
    return () => {
      if (refetchIntervalRef.current) clearInterval(refetchIntervalRef.current);
    };
  }, [url, fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const mutate = useCallback((newData: T) => {
    setState({ data: newData, error: null, loading: false });
  }, []);

  return { ...state, refetch, mutate };
}
