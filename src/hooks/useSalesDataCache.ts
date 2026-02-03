import { useCallback, useRef } from 'react';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  filterDate: string | null;
}

// TTL based on data age
const HISTORICAL_TTL = 24 * 60 * 60 * 1000; // 24 hours for old data
const RECENT_TTL = 5 * 60 * 1000; // 5 minutes for recent data (last 7 days)
const RECENT_DAYS_THRESHOLD = 7; // Days to consider as "recent"

/**
 * Smart cache for sales data with different TTLs based on data freshness
 * 
 * Strategy:
 * - Historical data (older than 7 days): Long TTL (24h) - data rarely changes
 * - Recent data (last 7 days): Short TTL (5min) - needs frequent updates
 * - Cache key includes sellerId + dateRange for proper isolation
 */
export function useSalesDataCache() {
  const cache = useRef<Map<string, CacheEntry<any>>>(new Map());

  /**
   * Check if the filter includes recent dates that need more frequent refresh
   */
  const shouldRefreshRecent = useCallback((dateTo: string | null): boolean => {
    if (!dateTo) return true;
    
    const now = new Date();
    const filterEnd = new Date(dateTo + 'T23:59:59');
    const daysDiff = Math.floor((now.getTime() - filterEnd.getTime()) / (1000 * 60 * 60 * 24));
    
    // If filter includes dates from last 7 days, we should refresh
    return daysDiff < RECENT_DAYS_THRESHOLD;
  }, []);

  /**
   * Get TTL based on how recent the data is
   */
  const getTTL = useCallback((dateTo: string | null): number => {
    if (shouldRefreshRecent(dateTo)) {
      return RECENT_TTL;
    }
    return HISTORICAL_TTL;
  }, [shouldRefreshRecent]);

  /**
   * Get cached data if valid
   */
  const getCached = useCallback(<T>(key: string): T | null => {
    const entry = cache.current.get(key);
    if (!entry) return null;

    const ttl = getTTL(entry.filterDate);
    const isValid = Date.now() - entry.cachedAt < ttl;
    
    if (!isValid) {
      cache.current.delete(key);
      return null;
    }

    return entry.data as T;
  }, [getTTL]);

  /**
   * Set data to cache with appropriate TTL
   */
  const setCached = useCallback(<T>(key: string, data: T, dateTo: string | null): void => {
    cache.current.set(key, {
      data,
      cachedAt: Date.now(),
      filterDate: dateTo,
    });

    // Limit cache size (keep last 20 entries)
    if (cache.current.size > 20) {
      const firstKey = cache.current.keys().next().value;
      if (firstKey) cache.current.delete(firstKey);
    }
  }, []);

  /**
   * Invalidate cache for a specific seller
   */
  const invalidateForSeller = useCallback((sellerId: string): void => {
    const keysToDelete: string[] = [];
    cache.current.forEach((_, key) => {
      if (key.startsWith(sellerId)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => cache.current.delete(key));
  }, []);

  /**
   * Clear all cache
   */
  const clearAll = useCallback((): void => {
    cache.current.clear();
  }, []);

  /**
   * Get number of recent days that need refresh
   */
  const getRecentDaysToRefresh = useCallback((): number => {
    return RECENT_DAYS_THRESHOLD;
  }, []);

  return {
    getCached,
    setCached,
    invalidateForSeller,
    clearAll,
    shouldRefreshRecent,
    getRecentDaysToRefresh,
  };
}
