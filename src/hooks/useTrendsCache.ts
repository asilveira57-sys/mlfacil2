import { useCallback, useRef } from 'react';
import { CategoryDetails, CategoryMetrics, CacheEntry } from '@/types/trends-explorer';
import { useTrendsGlobalCache } from './useTrendsGlobalCache';

/**
 * TRENDS CACHE - Hybrid Global/Account caching for category data
 * 
 * Uses GLOBAL cache for:
 * - Category details (name, path, tree structure) - 12h TTL
 * - This is public metadata that doesn't change per account
 * 
 * Uses ACCOUNT-SPECIFIC pattern for:
 * - Metrics that depend on seller eligibility (handled by useTrendsAccountCache)
 * 
 * Category tree and breadcrumb data is stored in useTrendsGlobalCache (30-day TTL)
 */

// TTL in milliseconds
const DETAILS_TTL = 12 * 60 * 60 * 1000; // 12 hours
const METRICS_TTL = 45 * 60 * 1000; // 45 minutes

// In-memory cache (session-level) for category details and metrics
// Details use GLOBAL keys (categoryId only)
// Metrics may include account context when needed
const memoryCache = {
  details: new Map<string, CacheEntry<CategoryDetails>>(),
  metrics: new Map<string, CacheEntry<CategoryMetrics>>(),
};

// Track in-flight requests to avoid duplicates
const inflightRequests = {
  details: new Map<string, Promise<CategoryDetails>>(),
  metrics: new Map<string, Promise<CategoryMetrics>>(),
};

export function useTrendsCache() {
  const cacheHits = useRef({ memory: 0, db: 0, network: 0 });
  const globalCache = useTrendsGlobalCache();

  // Check if cache entry is still valid
  const isValid = useCallback(<T>(entry: CacheEntry<T> | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.cached_at < entry.ttl_ms;
  }, []);

  // Get from memory cache (GLOBAL for details, session for metrics)
  const getFromMemory = useCallback(<T>(
    type: 'details' | 'metrics',
    categoryId: string
  ): T | null => {
    const cache = type === 'details' ? memoryCache.details : memoryCache.metrics;
    const entry = cache.get(categoryId) as CacheEntry<T> | undefined;
    
    if (isValid(entry)) {
      cacheHits.current.memory++;
      return entry!.data;
    }
    return null;
  }, [isValid]);

  // Set to memory cache
  const setToMemory = useCallback(<T>(
    type: 'details' | 'metrics',
    categoryId: string,
    data: T
  ): void => {
    const cache = type === 'details' ? memoryCache.details : memoryCache.metrics;
    const ttl = type === 'details' ? DETAILS_TTL : METRICS_TTL;
    
    cache.set(categoryId, {
      data: data as any,
      cached_at: Date.now(),
      ttl_ms: ttl,
    });
  }, []);

  // Get or create inflight request (deduplication)
  const getOrCreateRequest = useCallback(<T>(
    type: 'details' | 'metrics',
    categoryId: string,
    fetchFn: () => Promise<T>
  ): Promise<T> => {
    const requests = type === 'details' ? inflightRequests.details : inflightRequests.metrics;
    
    const existing = requests.get(categoryId);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fetchFn().finally(() => {
      requests.delete(categoryId);
    });

    requests.set(categoryId, promise as any);
    return promise;
  }, []);

  // Clear cache for a category
  const invalidate = useCallback((categoryId: string, type?: 'details' | 'metrics'): void => {
    if (!type || type === 'details') {
      memoryCache.details.delete(categoryId);
    }
    if (!type || type === 'metrics') {
      memoryCache.metrics.delete(categoryId);
    }
  }, []);

  // Clear all cache
  const clearAll = useCallback((): void => {
    memoryCache.details.clear();
    memoryCache.metrics.clear();
  }, []);

  // Get cache stats
  const getStats = useCallback(() => ({
    ...cacheHits.current,
    detailsSize: memoryCache.details.size,
    metricsSize: memoryCache.metrics.size,
    globalStats: globalCache.getStats(),
  }), [globalCache]);

  // Get category from global cache (30-day TTL, cross-session)
  const getCategoryFromGlobalCache = useCallback((categoryId: string) => {
    return globalCache.getCategoryFromMemory(categoryId);
  }, [globalCache]);

  // Prewarm global category cache
  const prewarmCategories = useCallback((categories: Array<{ category_id: string; name: string; path?: string[]; parent_id?: string | null; children_count?: number }>) => {
    globalCache.prewarmCategories(categories);
  }, [globalCache]);

  return {
    getFromMemory,
    setToMemory,
    getOrCreateRequest,
    invalidate,
    clearAll,
    getStats,
    getCategoryFromGlobalCache,
    prewarmCategories,
  };
}
