import { useCallback } from 'react';
import { MercadoCategoryItem } from '@/types/mercado';

/**
 * MERCADO CHILDREN CACHE - 30-day TTL for category tree
 * 
 * Stores children by parentCategoryId:
 * Key: ml:category_children:{parentCategoryId}
 * Data: list of children (id, name, share_percent, total_count, has_children)
 */

// TTL: 30 days
const CHILDREN_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

// Storage key prefix
const CHILDREN_PREFIX = 'ml:category_children:';

interface CachedChildren {
  parent_id: string | null;
  children: MercadoCategoryItem[];
  has_verified_no_children: boolean; // True if we verified this category has no children
  cached_at: number;
}

// In-memory cache for fast access
const childrenMemoryCache = new Map<string, CachedChildren>();

// Track in-flight requests to avoid duplicates
const inflightChildrenRequests = new Map<string, Promise<CachedChildren | null>>();

// Track categories being warmed in background
const warmingInProgress = new Set<string>();
const warmingQueue: string[] = [];
let isWarmingActive = false;
const MAX_CONCURRENT_WARMING = 2;
let activeWarmingCount = 0;

export function useMercadoChildrenCache() {
  // Get cache key for a parent
  const getCacheKey = useCallback((parentId: string | null): string => {
    return parentId ?? '__root__';
  }, []);

  // Check if cache entry is still valid
  const isValid = useCallback((entry: CachedChildren | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.cached_at < CHILDREN_CACHE_TTL;
  }, []);

  // Get children from cache (memory + localStorage)
  const getChildren = useCallback((parentId: string | null): CachedChildren | null => {
    const key = getCacheKey(parentId);
    
    // Check memory first
    const memCached = childrenMemoryCache.get(key);
    if (isValid(memCached)) {
      return memCached!;
    }

    // Try localStorage
    try {
      const stored = localStorage.getItem(`${CHILDREN_PREFIX}${key}`);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedChildren;
        if (isValid(parsed)) {
          childrenMemoryCache.set(key, parsed);
          return parsed;
        } else {
          localStorage.removeItem(`${CHILDREN_PREFIX}${key}`);
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }

    return null;
  }, [getCacheKey, isValid]);

  // Set children to cache
  const setChildren = useCallback((parentId: string | null, children: MercadoCategoryItem[], hasVerifiedNoChildren = false): void => {
    const key = getCacheKey(parentId);
    const entry: CachedChildren = {
      parent_id: parentId,
      children,
      has_verified_no_children: hasVerifiedNoChildren,
      cached_at: Date.now(),
    };

    childrenMemoryCache.set(key, entry);

    // Persist to localStorage
    try {
      localStorage.setItem(`${CHILDREN_PREFIX}${key}`, JSON.stringify(entry));
    } catch (e) {
      // Ignore storage quota errors
    }
  }, [getCacheKey]);

  // Check if category is verified to have no children
  const hasNoChildren = useCallback((parentId: string): boolean => {
    const cached = getChildren(parentId);
    return cached?.has_verified_no_children === true;
  }, [getChildren]);

  // Mark category as having no children (after verifying with API)
  const markNoChildren = useCallback((parentId: string): void => {
    setChildren(parentId, [], true);
  }, [setChildren]);

  // Get in-flight request
  const getInflight = useCallback((parentId: string | null): Promise<CachedChildren | null> | null => {
    const key = getCacheKey(parentId);
    return inflightChildrenRequests.get(key) || null;
  }, [getCacheKey]);

  // Set in-flight request
  const setInflight = useCallback((parentId: string | null, promise: Promise<CachedChildren | null>): void => {
    const key = getCacheKey(parentId);
    inflightChildrenRequests.set(key, promise);
    promise.finally(() => {
      inflightChildrenRequests.delete(key);
    });
  }, [getCacheKey]);

  // Invalidate cache for forced refresh
  const invalidate = useCallback((parentId: string | null): void => {
    const key = getCacheKey(parentId);
    childrenMemoryCache.delete(key);
    try {
      localStorage.removeItem(`${CHILDREN_PREFIX}${key}`);
    } catch (e) {
      // Ignore
    }
  }, [getCacheKey]);

  // Background warming queue processor
  const processWarmingQueue = useCallback((fetchFn: (parentId: string) => Promise<MercadoCategoryItem[]>) => {
    if (!isWarmingActive) return;
    
    while (activeWarmingCount < MAX_CONCURRENT_WARMING && warmingQueue.length > 0) {
      const parentId = warmingQueue.shift();
      if (!parentId || warmingInProgress.has(parentId)) continue;

      // Skip if already cached
      if (getChildren(parentId)) {
        continue;
      }

      warmingInProgress.add(parentId);
      activeWarmingCount++;

      fetchFn(parentId)
        .then(children => {
          if (children.length === 0) {
            markNoChildren(parentId);
          } else {
            setChildren(parentId, children);
          }
        })
        .catch(() => {
          // Silently fail background warming
        })
        .finally(() => {
          warmingInProgress.delete(parentId);
          activeWarmingCount--;
          processWarmingQueue(fetchFn);
        });
    }

    // Check if warming is complete
    if (warmingQueue.length === 0 && activeWarmingCount === 0) {
      isWarmingActive = false;
    }
  }, [getChildren, setChildren, markNoChildren]);

  // Queue categories for background warming
  const warmChildren = useCallback((categoryIds: string[], fetchFn: (parentId: string) => Promise<MercadoCategoryItem[]>) => {
    // Filter out already cached or in-progress categories
    const toWarm = categoryIds.filter(id => 
      !getChildren(id) && 
      !warmingInProgress.has(id) && 
      !warmingQueue.includes(id)
    );

    if (toWarm.length === 0) return;

    warmingQueue.push(...toWarm);
    isWarmingActive = true;
    
    // Start processing queue
    processWarmingQueue(fetchFn);
  }, [getChildren, processWarmingQueue]);

  // Check if warming is in progress
  const isWarming = useCallback((parentId: string): boolean => {
    return warmingInProgress.has(parentId);
  }, []);

  // Get cache stats
  const getStats = useCallback(() => ({
    memoryCacheSize: childrenMemoryCache.size,
    inflightRequests: inflightChildrenRequests.size,
    warmingQueueSize: warmingQueue.length,
    activeWarming: activeWarmingCount,
    isWarmingActive,
  }), []);

  // Clear all cache
  const clearAll = useCallback((): void => {
    childrenMemoryCache.clear();
    inflightChildrenRequests.clear();
    warmingQueue.length = 0;
    warmingInProgress.clear();
    isWarmingActive = false;
    activeWarmingCount = 0;
  }, []);

  return {
    getChildren,
    setChildren,
    hasNoChildren,
    markNoChildren,
    getInflight,
    setInflight,
    invalidate,
    warmChildren,
    isWarming,
    getStats,
    clearAll,
  };
}
