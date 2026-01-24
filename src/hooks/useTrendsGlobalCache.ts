import { useCallback } from 'react';

/**
 * GLOBAL CACHE - Shared across all accounts
 * 
 * Used for public, reusable data:
 * - Item metadata (title, thumbnail) by item_id
 * - Category metadata (name, path, tree) by category_id
 * 
 * Keys DO NOT include account_id
 */

// TTL in milliseconds
const ITEM_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days
const CATEGORY_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

// Storage key prefixes
const ITEM_PREFIX = 'ml:item:';
const CATEGORY_PREFIX = 'ml:category:';

interface CachedItemGlobal {
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  cached_at: number;
}

interface CachedCategoryGlobal {
  category_id: string;
  name: string;
  path?: string[];
  parent_id?: string | null;
  children_count?: number;
  cached_at: number;
}

// In-memory cache for fast access (session-level, shared across all accounts)
const globalItemMemoryCache = new Map<string, CachedItemGlobal>();
const globalCategoryMemoryCache = new Map<string, CachedCategoryGlobal>();

// Track in-flight requests to avoid duplicates
const globalInflightItems = new Map<string, Promise<CachedItemGlobal | null>>();
const globalInflightCategories = new Map<string, Promise<CachedCategoryGlobal | null>>();

// Concurrency control for item fetches
const MAX_CONCURRENT_ITEM_FETCHES = 5;
let currentItemFetches = 0;
const itemFetchQueue: (() => void)[] = [];

// Process fetch queue
const processItemQueue = () => {
  while (currentItemFetches < MAX_CONCURRENT_ITEM_FETCHES && itemFetchQueue.length > 0) {
    const next = itemFetchQueue.shift();
    if (next) next();
  }
};

export function useTrendsGlobalCache() {
  // =========== ITEM CACHE (Global - 14 days) ===========
  
  const isItemValid = useCallback((item: CachedItemGlobal | undefined): boolean => {
    if (!item) return false;
    return Date.now() - item.cached_at < ITEM_TTL;
  }, []);

  const getItemFromMemory = useCallback((itemId: string): CachedItemGlobal | null => {
    const cached = globalItemMemoryCache.get(itemId);
    if (isItemValid(cached)) {
      return cached!;
    }
    // Also try localStorage as fallback
    try {
      const stored = localStorage.getItem(`${ITEM_PREFIX}${itemId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedItemGlobal;
        if (isItemValid(parsed)) {
          globalItemMemoryCache.set(itemId, parsed);
          return parsed;
        } else {
          localStorage.removeItem(`${ITEM_PREFIX}${itemId}`);
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return null;
  }, [isItemValid]);

  const setItemToCache = useCallback((item: CachedItemGlobal): void => {
    globalItemMemoryCache.set(item.item_id, item);
    // Also persist to localStorage for cross-session reuse
    try {
      localStorage.setItem(`${ITEM_PREFIX}${item.item_id}`, JSON.stringify(item));
    } catch (e) {
      // Ignore storage quota errors
    }
  }, []);

  const getItemInflight = useCallback((itemId: string): Promise<CachedItemGlobal | null> | null => {
    return globalInflightItems.get(itemId) || null;
  }, []);

  const setItemInflight = useCallback((itemId: string, promise: Promise<CachedItemGlobal | null>): void => {
    globalInflightItems.set(itemId, promise);
    promise.finally(() => {
      globalInflightItems.delete(itemId);
      processItemQueue();
    });
  }, []);

  const canStartItemFetch = useCallback((): boolean => {
    return currentItemFetches < MAX_CONCURRENT_ITEM_FETCHES;
  }, []);

  const startItemFetch = useCallback((): void => {
    currentItemFetches++;
  }, []);

  const endItemFetch = useCallback((): void => {
    currentItemFetches--;
    processItemQueue();
  }, []);

  const queueItemFetch = useCallback((fn: () => void): void => {
    itemFetchQueue.push(fn);
    processItemQueue();
  }, []);

  // =========== CATEGORY CACHE (Global - 30 days) ===========

  const isCategoryValid = useCallback((cat: CachedCategoryGlobal | undefined): boolean => {
    if (!cat) return false;
    return Date.now() - cat.cached_at < CATEGORY_TTL;
  }, []);

  const getCategoryFromMemory = useCallback((categoryId: string): CachedCategoryGlobal | null => {
    const cached = globalCategoryMemoryCache.get(categoryId);
    if (isCategoryValid(cached)) {
      return cached!;
    }
    // Also try localStorage
    try {
      const stored = localStorage.getItem(`${CATEGORY_PREFIX}${categoryId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedCategoryGlobal;
        if (isCategoryValid(parsed)) {
          globalCategoryMemoryCache.set(categoryId, parsed);
          return parsed;
        } else {
          localStorage.removeItem(`${CATEGORY_PREFIX}${categoryId}`);
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return null;
  }, [isCategoryValid]);

  const setCategoryToCache = useCallback((category: CachedCategoryGlobal): void => {
    globalCategoryMemoryCache.set(category.category_id, category);
    try {
      localStorage.setItem(`${CATEGORY_PREFIX}${category.category_id}`, JSON.stringify(category));
    } catch (e) {
      // Ignore storage quota errors
    }
  }, []);

  const getCategoryInflight = useCallback((categoryId: string): Promise<CachedCategoryGlobal | null> | null => {
    return globalInflightCategories.get(categoryId) || null;
  }, []);

  const setCategoryInflight = useCallback((categoryId: string, promise: Promise<CachedCategoryGlobal | null>): void => {
    globalInflightCategories.set(categoryId, promise);
    promise.finally(() => {
      globalInflightCategories.delete(categoryId);
    });
  }, []);

  // =========== BULK OPERATIONS ===========

  const prewarmItems = useCallback((items: Array<{ item_id: string; title?: string | null; thumbnail?: string | null }>): void => {
    const now = Date.now();
    for (const item of items) {
      if (item.title || item.thumbnail) {
        const cached: CachedItemGlobal = {
          item_id: item.item_id,
          title: item.title || null,
          thumbnail: item.thumbnail || null,
          cached_at: now,
        };
        setItemToCache(cached);
      }
    }
  }, [setItemToCache]);

  const prewarmCategories = useCallback((categories: Array<{ category_id: string; name: string; path?: string[]; parent_id?: string | null; children_count?: number }>): void => {
    const now = Date.now();
    for (const cat of categories) {
      const cached: CachedCategoryGlobal = {
        category_id: cat.category_id,
        name: cat.name,
        path: cat.path,
        parent_id: cat.parent_id,
        children_count: cat.children_count,
        cached_at: now,
      };
      setCategoryToCache(cached);
    }
  }, [setCategoryToCache]);

  // =========== STATS & CLEANUP ===========

  const getStats = useCallback(() => ({
    itemsInMemory: globalItemMemoryCache.size,
    categoriesInMemory: globalCategoryMemoryCache.size,
    itemsInflight: globalInflightItems.size,
    categoriesInflight: globalInflightCategories.size,
    pendingItemFetches: itemFetchQueue.length,
  }), []);

  const clearAll = useCallback((): void => {
    globalItemMemoryCache.clear();
    globalCategoryMemoryCache.clear();
    globalInflightItems.clear();
    globalInflightCategories.clear();
    itemFetchQueue.length = 0;
    currentItemFetches = 0;
  }, []);

  return {
    // Items
    getItemFromMemory,
    setItemToCache,
    getItemInflight,
    setItemInflight,
    canStartItemFetch,
    startItemFetch,
    endItemFetch,
    queueItemFetch,
    prewarmItems,
    
    // Categories
    getCategoryFromMemory,
    setCategoryToCache,
    getCategoryInflight,
    setCategoryInflight,
    prewarmCategories,
    
    // Utils
    getStats,
    clearAll,
  };
}

// Export types for use elsewhere
export type { CachedItemGlobal, CachedCategoryGlobal };
