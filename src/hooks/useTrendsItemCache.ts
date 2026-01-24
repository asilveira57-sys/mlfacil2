import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTrendsGlobalCache, CachedItemGlobal } from './useTrendsGlobalCache';

/**
 * GLOBAL Item Cache - Shared across ALL accounts
 * 
 * This hook manages item metadata (title, thumbnail) with a 14-day TTL.
 * Items are cached globally (by item_id only, NOT by account_id) because
 * product metadata is public and doesn't vary by seller.
 * 
 * Uses useTrendsGlobalCache for storage and concurrency control.
 */

// Re-export for backward compatibility
interface CachedItem {
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  cached_at: number;
}

// Legacy module-level caches (now delegating to global cache)
// These are kept for backward compatibility but prefer using useTrendsGlobalCache directly
const pendingItems = new Set<string>();

export function useTrendsItemCache() {
  const pendingRef = useRef<Set<string>>(new Set());
  const globalCache = useTrendsGlobalCache();

  // Get from GLOBAL memory cache (shared across all accounts)
  const getFromMemory = useCallback((itemId: string): CachedItem | null => {
    return globalCache.getItemFromMemory(itemId);
  }, [globalCache]);

  // Set to GLOBAL memory cache
  const setToMemory = useCallback((item: CachedItem): void => {
    globalCache.setItemToCache(item as CachedItemGlobal);
  }, [globalCache]);

  // Fetch single item with rate limiting (GLOBAL cache, shared across accounts)
  const fetchItem = useCallback(async (itemId: string): Promise<CachedItem | null> => {
    // Check GLOBAL memory cache first
    const cached = getFromMemory(itemId);
    if (cached) return cached;

    // Check if already in flight
    const existing = globalCache.getItemInflight(itemId);
    if (existing) return existing;

    // Create fetch promise with queue management
    const fetchPromise = new Promise<CachedItem | null>((resolve) => {
      const doFetch = async () => {
        globalCache.startItemFetch();
        try {
          // Try meli_listings_cache first (public data, shared across accounts)
          const { data: listingData } = await supabase
            .from('meli_listings_cache')
            .select('item_id, title, thumbnail')
            .eq('item_id', itemId)
            .order('last_sync_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (listingData?.title || listingData?.thumbnail) {
            const item: CachedItem = {
              item_id: itemId,
              title: listingData.title,
              thumbnail: listingData.thumbnail,
              cached_at: Date.now(),
            };
            setToMemory(item);
            resolve(item);
            return;
          }

          // Try meli_order_items_cache as fallback
          const { data: orderItemData } = await supabase
            .from('meli_order_items_cache')
            .select('item_id, title, thumbnail')
            .eq('item_id', itemId)
            .order('created_at_meli', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (orderItemData?.title || orderItemData?.thumbnail) {
            const item: CachedItem = {
              item_id: itemId,
              title: orderItemData.title,
              thumbnail: orderItemData.thumbnail,
              cached_at: Date.now(),
            };
            setToMemory(item);
            resolve(item);
            return;
          }

          // No data found
          resolve(null);
        } catch (error) {
          console.error('[useTrendsItemCache] Fetch error:', error);
          resolve(null);
        } finally {
          globalCache.endItemFetch();
        }
      };

      // Queue or execute immediately using global concurrency control
      if (globalCache.canStartItemFetch()) {
        doFetch();
      } else {
        globalCache.queueItemFetch(doFetch);
      }
    });

    globalCache.setItemInflight(itemId, fetchPromise);
    return fetchPromise;
  }, [getFromMemory, setToMemory, globalCache]);

  // Batch fetch items (GLOBAL cache)
  const fetchBatch = useCallback(async (itemIds: string[]): Promise<Map<string, CachedItem>> => {
    const results = new Map<string, CachedItem>();
    const toFetch: string[] = [];

    // Check GLOBAL memory cache first (not per-account)
    for (const id of itemIds) {
      const cached = getFromMemory(id);
      if (cached) {
        results.set(id, cached);
      } else if (!pendingRef.current.has(id) && !pendingItems.has(id)) {
        toFetch.push(id);
        pendingRef.current.add(id);
        pendingItems.add(id);
      }
    }

    // Fetch missing items (stored in GLOBAL cache)
    if (toFetch.length > 0) {
      const fetched = await Promise.all(toFetch.map(id => fetchItem(id)));
      
      fetched.forEach((item, index) => {
        const id = toFetch[index];
        pendingRef.current.delete(id);
        pendingItems.delete(id);
        if (item) {
          results.set(id, item);
        }
      });
    }

    return results;
  }, [getFromMemory, fetchItem]);

  // Pre-warm GLOBAL cache from items (shared across all accounts)
  const prewarmCache = useCallback((items: Array<{ item_id: string; title?: string | null; thumbnail?: string | null }>): void => {
    globalCache.prewarmItems(items);
  }, [globalCache]);

  // Get cached or placeholder (from GLOBAL cache)
  const getOrPlaceholder = useCallback((itemId: string, fallbackTitle?: string | null, fallbackThumb?: string | null): CachedItem => {
    const cached = getFromMemory(itemId);
    if (cached) return cached;

    // Return with fallback values
    return {
      item_id: itemId,
      title: fallbackTitle || null,
      thumbnail: fallbackThumb || null,
      cached_at: 0,
    };
  }, [getFromMemory]);

  // Clear GLOBAL cache
  const clearAll = useCallback((): void => {
    globalCache.clearAll();
    pendingRef.current.clear();
    pendingItems.clear();
  }, [globalCache]);

  // Get cache stats
  const getStats = useCallback(() => globalCache.getStats(), [globalCache]);

  return {
    getFromMemory,
    setToMemory,
    fetchItem,
    fetchBatch,
    prewarmCache,
    getOrPlaceholder,
    clearAll,
    getStats,
  };
}
