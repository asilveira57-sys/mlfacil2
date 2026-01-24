import { useCallback, useRef } from 'react';
import { useTrendsCache } from './useTrendsCache';
import { useTrendsTelemetry } from './useTrendsTelemetry';

const PREFETCH_DELAY = 350; // ms to wait before prefetching

export function useTrendsPrefetch(
  fetchDetails: (categoryId: string) => Promise<void>,
  fetchMetrics: (categoryId: string) => Promise<void>
) {
  const cache = useTrendsCache();
  const telemetry = useTrendsTelemetry();
  const hoverTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const prefetchedCategories = useRef<Set<string>>(new Set());

  // Start prefetch timer on mouse enter
  const onMouseEnter = useCallback((categoryId: string, isTop1: boolean = false) => {
    // Skip if already prefetched
    if (prefetchedCategories.current.has(categoryId)) {
      return;
    }

    // Clear any existing timer
    const existingTimer = hoverTimers.current.get(categoryId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      const startTime = performance.now();
      telemetry.log({
        event_type: 'prefetch_start',
        category_id: categoryId,
        data_type: 'details',
        duration_ms: 0,
        timestamp: new Date().toISOString(),
      });

      try {
        // Always prefetch details
        await fetchDetails(categoryId);

        // Only prefetch metrics for top 1 category
        if (isTop1 && navigator.onLine) {
          await fetchMetrics(categoryId);
        }

        prefetchedCategories.current.add(categoryId);
        
        telemetry.log({
          event_type: 'prefetch_complete',
          category_id: categoryId,
          data_type: 'details',
          duration_ms: performance.now() - startTime,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.warn('Prefetch failed for', categoryId, error);
      }

      hoverTimers.current.delete(categoryId);
    }, PREFETCH_DELAY);

    hoverTimers.current.set(categoryId, timer);
  }, [fetchDetails, fetchMetrics, telemetry]);

  // Cancel prefetch on mouse leave
  const onMouseLeave = useCallback((categoryId: string) => {
    const timer = hoverTimers.current.get(categoryId);
    if (timer) {
      clearTimeout(timer);
      hoverTimers.current.delete(categoryId);
    }
  }, []);

  // Reset prefetched set (e.g., when navigating to new category level)
  const resetPrefetched = useCallback(() => {
    prefetchedCategories.current.clear();
  }, []);

  return {
    onMouseEnter,
    onMouseLeave,
    resetPrefetched,
  };
}
