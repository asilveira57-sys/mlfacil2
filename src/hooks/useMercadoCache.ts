import { useCallback, useRef } from 'react';
import { MercadoCategoryDetails, MercadoCategoryMetrics, MercadoCacheEntry } from '@/types/mercado';

// TTL in milliseconds
const DETAILS_TTL = 12 * 60 * 60 * 1000; // 12 hours
const METRICS_TTL = 45 * 60 * 1000; // 45 minutes

// In-memory cache (session-level) - ISOLATED from trends module
const mercadoMemoryCache = {
  details: new Map<string, MercadoCacheEntry<MercadoCategoryDetails>>(),
  metrics: new Map<string, MercadoCacheEntry<MercadoCategoryMetrics>>(),
};

// Track in-flight requests to avoid duplicates
const mercadoInflightRequests = {
  details: new Map<string, Promise<MercadoCategoryDetails>>(),
  metrics: new Map<string, Promise<MercadoCategoryMetrics>>(),
};

export function useMercadoCache() {
  const cacheHits = useRef({ memory: 0, db: 0, network: 0 });

  // Check if cache entry is still valid
  const isValid = useCallback(<T>(entry: MercadoCacheEntry<T> | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.cached_at < entry.ttl_ms;
  }, []);

  // Get from memory cache
  const getFromMemory = useCallback(<T>(
    type: 'details' | 'metrics',
    categoryId: string
  ): T | null => {
    const cache = type === 'details' ? mercadoMemoryCache.details : mercadoMemoryCache.metrics;
    const entry = cache.get(categoryId) as MercadoCacheEntry<T> | undefined;
    
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
    const cache = type === 'details' ? mercadoMemoryCache.details : mercadoMemoryCache.metrics;
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
    const requests = type === 'details' ? mercadoInflightRequests.details : mercadoInflightRequests.metrics;
    
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
      mercadoMemoryCache.details.delete(categoryId);
    }
    if (!type || type === 'metrics') {
      mercadoMemoryCache.metrics.delete(categoryId);
    }
  }, []);

  // Clear all cache
  const clearAll = useCallback((): void => {
    mercadoMemoryCache.details.clear();
    mercadoMemoryCache.metrics.clear();
  }, []);

  // Get cache stats
  const getStats = useCallback(() => ({
    ...cacheHits.current,
    detailsSize: mercadoMemoryCache.details.size,
    metricsSize: mercadoMemoryCache.metrics.size,
  }), []);

  return {
    getFromMemory,
    setToMemory,
    getOrCreateRequest,
    invalidate,
    clearAll,
    getStats,
  };
}
