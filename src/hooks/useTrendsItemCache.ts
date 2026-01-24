import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Cache TTL: 7 days
const ITEM_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

// Max concurrent fetches
const MAX_CONCURRENT_FETCHES = 5;

interface CachedItem {
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  cached_at: number;
}

// Module-level caches
const itemMemoryCache = new Map<string, CachedItem>();
const inflightRequests = new Map<string, Promise<CachedItem | null>>();
let concurrentFetches = 0;
const fetchQueue: (() => void)[] = [];

export function useTrendsItemCache() {
  const pendingRef = useRef<Set<string>>(new Set());

  // Check if cached item is valid
  const isValid = useCallback((item: CachedItem | undefined): boolean => {
    if (!item) return false;
    return Date.now() - item.cached_at < ITEM_CACHE_TTL;
  }, []);

  // Get from memory cache
  const getFromMemory = useCallback((itemId: string): CachedItem | null => {
    const cached = itemMemoryCache.get(itemId);
    if (isValid(cached)) {
      return cached!;
    }
    return null;
  }, [isValid]);

  // Set to memory cache
  const setToMemory = useCallback((item: CachedItem): void => {
    itemMemoryCache.set(item.item_id, item);
  }, []);

  // Process fetch queue
  const processQueue = useCallback(() => {
    while (concurrentFetches < MAX_CONCURRENT_FETCHES && fetchQueue.length > 0) {
      const next = fetchQueue.shift();
      if (next) next();
    }
  }, []);

  // Fetch single item with rate limiting
  const fetchItem = useCallback(async (itemId: string): Promise<CachedItem | null> => {
    // Check memory first
    const cached = getFromMemory(itemId);
    if (cached) return cached;

    // Check if already in flight
    const existing = inflightRequests.get(itemId);
    if (existing) return existing;

    // Create fetch promise with queue management
    const fetchPromise = new Promise<CachedItem | null>((resolve) => {
      const doFetch = async () => {
        concurrentFetches++;
        try {
          // Try meli_listings_cache first
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
          concurrentFetches--;
          inflightRequests.delete(itemId);
          processQueue();
        }
      };

      // Queue or execute immediately
      if (concurrentFetches < MAX_CONCURRENT_FETCHES) {
        doFetch();
      } else {
        fetchQueue.push(doFetch);
      }
    });

    inflightRequests.set(itemId, fetchPromise);
    return fetchPromise;
  }, [getFromMemory, setToMemory, processQueue]);

  // Batch fetch items
  const fetchBatch = useCallback(async (itemIds: string[]): Promise<Map<string, CachedItem>> => {
    const results = new Map<string, CachedItem>();
    const toFetch: string[] = [];

    // Check memory cache first
    for (const id of itemIds) {
      const cached = getFromMemory(id);
      if (cached) {
        results.set(id, cached);
      } else if (!pendingRef.current.has(id)) {
        toFetch.push(id);
        pendingRef.current.add(id);
      }
    }

    // Fetch missing items
    if (toFetch.length > 0) {
      const fetched = await Promise.all(toFetch.map(id => fetchItem(id)));
      
      fetched.forEach((item, index) => {
        const id = toFetch[index];
        pendingRef.current.delete(id);
        if (item) {
          results.set(id, item);
        }
      });
    }

    return results;
  }, [getFromMemory, fetchItem]);

  // Pre-warm cache from items
  const prewarmCache = useCallback((items: Array<{ item_id: string; title?: string | null; thumbnail?: string | null }>): void => {
    for (const item of items) {
      if (item.title || item.thumbnail) {
        const cached: CachedItem = {
          item_id: item.item_id,
          title: item.title || null,
          thumbnail: item.thumbnail || null,
          cached_at: Date.now(),
        };
        setToMemory(cached);
      }
    }
  }, [setToMemory]);

  // Get cached or placeholder
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

  // Clear cache
  const clearAll = useCallback((): void => {
    itemMemoryCache.clear();
    inflightRequests.clear();
    pendingRef.current.clear();
  }, []);

  return {
    getFromMemory,
    setToMemory,
    fetchItem,
    fetchBatch,
    prewarmCache,
    getOrPlaceholder,
    clearAll,
  };
}
