/**
 * Global in-memory cache for ADS module data.
 * Persists across React component mounts/unmounts (stale-while-revalidate pattern).
 */

interface CacheEntry<T = unknown> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

// Global cache — survives React unmounts, only resets on full page reload
const adsMemoryCache = new Map<string, CacheEntry>();

// TTL constants in ms
export const ADS_CACHE_TTL = {
  PERIOD_METRICS: 15 * 60 * 1000,   // 15 min
  CAMPAIGNS: 10 * 60 * 1000,        // 10 min
  ITEMS: 10 * 60 * 1000,            // 10 min
  DAILY_METRICS: 10 * 60 * 1000,    // 10 min
  ALERTS: 2 * 60 * 1000,            // 2 min
  SYNC_STATE: 5 * 60 * 1000,        // 5 min
} as const;

/**
 * Get cached data if it exists and hasn't expired.
 * Returns null if no cache or expired.
 */
export function getAdsCache<T>(key: string): T | null {
  const entry = adsMemoryCache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.cachedAt;
  if (age > entry.ttlMs) {
    // Expired — don't delete yet (stale-while-revalidate: we return stale data)
    return null;
  }
  
  return entry.data as T;
}

/**
 * Get cached data even if expired (stale), for stale-while-revalidate pattern.
 * Returns { data, isStale } or null if nothing cached at all.
 */
export function getAdsCacheStale<T>(key: string): { data: T; isStale: boolean } | null {
  const entry = adsMemoryCache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.cachedAt;
  return {
    data: entry.data as T,
    isStale: age > entry.ttlMs,
  };
}

/**
 * Store data in the global cache.
 */
export function setAdsCache<T>(key: string, data: T, ttlMs: number): void {
  adsMemoryCache.set(key, {
    data,
    cachedAt: Date.now(),
    ttlMs,
  });
}

/**
 * Invalidate all cache entries for a specific seller.
 */
export function clearAdsCacheForSeller(sellerId: string): void {
  for (const key of adsMemoryCache.keys()) {
    if (key.startsWith(`${sellerId}:`)) {
      adsMemoryCache.delete(key);
    }
  }
}

/**
 * Build a cache key for ADS data.
 */
export function adsCacheKey(sellerId: string, namespace: string, ...parts: string[]): string {
  return [sellerId, namespace, ...parts].join(':');
}

/**
 * Get total cached entries count (for debugging).
 */
export function getAdsCacheSize(): number {
  return adsMemoryCache.size;
}
