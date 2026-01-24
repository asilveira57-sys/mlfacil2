import { useCallback, useRef } from 'react';

const PREFETCH_DELAY = 350; // ms

interface PrefetchOptions {
  prefetchDetails: (categoryId: string) => Promise<void>;
  prefetchMetrics: (categoryId: string) => Promise<void>;
}

export function useMercadoPrefetch({ prefetchDetails, prefetchMetrics }: PrefetchOptions) {
  const timeoutRef = useRef<number | null>(null);
  const prefetchedRef = useRef(new Set<string>());

  const startPrefetch = useCallback((categoryId: string, isTopCategory: boolean = false) => {
    // Don't prefetch if already done
    if (prefetchedRef.current.has(categoryId)) return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Start prefetch after delay
    timeoutRef.current = window.setTimeout(() => {
      prefetchedRef.current.add(categoryId);
      
      // Always prefetch details on hover
      prefetchDetails(categoryId);
      
      // Only prefetch metrics for top category and if connection is good
      if (isTopCategory && navigator.onLine) {
        prefetchMetrics(categoryId);
      }
    }, PREFETCH_DELAY);
  }, [prefetchDetails, prefetchMetrics]);

  const cancelPrefetch = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearPrefetchHistory = useCallback(() => {
    prefetchedRef.current.clear();
  }, []);

  return {
    startPrefetch,
    cancelPrefetch,
    clearPrefetchHistory,
  };
}
