import { useCallback, useRef } from 'react';
import { MercadoCategoryItem } from '@/types/mercado';

// Grid cache TTL: 45 minutes
const GRID_CACHE_TTL = 45 * 60 * 1000;

interface GridCacheEntry {
  categories: MercadoCategoryItem[];
  cached_at: number;
  order_snapshot: string[]; // Frozen order of category IDs
}

// Module-level cache for grid data by parentId
const gridCache = new Map<string, GridCacheEntry>();

export function useMercadoGridCache() {
  const orderSnapshotRef = useRef<string[]>([]);

  // Get cache key for a parent
  const getCacheKey = useCallback((parentId: string | null): string => {
    return parentId ?? '__root__';
  }, []);

  // Check if cache entry is valid
  const isValid = useCallback((entry: GridCacheEntry | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.cached_at < GRID_CACHE_TTL;
  }, []);

  // Get cached grid data
  const getCached = useCallback((parentId: string | null): GridCacheEntry | null => {
    const key = getCacheKey(parentId);
    const entry = gridCache.get(key);
    if (isValid(entry)) {
      return entry!;
    }
    return null;
  }, [getCacheKey, isValid]);

  // Check if cache exists but is expired (for background refresh)
  const hasExpiredCache = useCallback((parentId: string | null): GridCacheEntry | null => {
    const key = getCacheKey(parentId);
    const entry = gridCache.get(key);
    if (entry && !isValid(entry)) {
      return entry;
    }
    return null;
  }, [getCacheKey, isValid]);

  // Set cache and freeze order
  const setCache = useCallback((parentId: string | null, categories: MercadoCategoryItem[]): void => {
    const key = getCacheKey(parentId);
    const orderSnapshot = categories.map(c => c.id);
    
    gridCache.set(key, {
      categories,
      cached_at: Date.now(),
      order_snapshot: orderSnapshot,
    });
    
    orderSnapshotRef.current = orderSnapshot;
  }, [getCacheKey]);

  // Update cache values without changing order (for background updates)
  const updateCacheValues = useCallback((parentId: string | null, newCategories: MercadoCategoryItem[]): MercadoCategoryItem[] => {
    const key = getCacheKey(parentId);
    const existingEntry = gridCache.get(key);
    
    if (!existingEntry) {
      // No existing order, just set new cache
      setCache(parentId, newCategories);
      return newCategories;
    }
    
    // Build a map of new data by ID
    const newDataMap = new Map(newCategories.map(c => [c.id, c]));
    
    // Maintain existing order, update values
    const orderedCategories = existingEntry.order_snapshot
      .map(id => newDataMap.get(id))
      .filter((c): c is MercadoCategoryItem => c !== undefined);
    
    // Append any new categories that weren't in the original order
    const existingIds = new Set(existingEntry.order_snapshot);
    const newItems = newCategories.filter(c => !existingIds.has(c.id));
    orderedCategories.push(...newItems);
    
    // Update cache with new values but preserve order
    gridCache.set(key, {
      categories: orderedCategories,
      cached_at: Date.now(),
      order_snapshot: existingEntry.order_snapshot,
    });
    
    return orderedCategories;
  }, [getCacheKey, setCache]);

  // Get current order snapshot for the grid
  const getOrderSnapshot = useCallback((parentId: string | null): string[] => {
    const key = getCacheKey(parentId);
    const entry = gridCache.get(key);
    return entry?.order_snapshot ?? [];
  }, [getCacheKey]);

  // Clear cache for a specific parent
  const invalidate = useCallback((parentId: string | null): void => {
    const key = getCacheKey(parentId);
    gridCache.delete(key);
    orderSnapshotRef.current = [];
  }, [getCacheKey]);

  // Clear all cache
  const clearAll = useCallback((): void => {
    gridCache.clear();
    orderSnapshotRef.current = [];
  }, []);

  return {
    getCached,
    hasExpiredCache,
    setCache,
    updateCacheValues,
    getOrderSnapshot,
    invalidate,
    clearAll,
  };
}
