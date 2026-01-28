import { useCallback, useRef, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTrendsGlobalCache } from './useTrendsGlobalCache';

// ============================================================
// CATALOG ENRICHMENT HOOK
// 
// Resolves catalog items (MLBU*) to actual product data:
// 1. Cache memory/localStorage first (14 day TTL)
// 2. DB cache (meli_order_items_cache, meli_listings_cache)
// 3. Background ML API enrichment (batch, rate-limited)
// ============================================================

const CATALOG_PREFIX = 'ml:catalog:';
const CATALOG_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface EnrichedItem {
  item_id: string;
  rank: number;
  title: string | null;
  thumbnail: string | null;
  price: number | null;
  sold_quantity: number | null;
  permalink: string | null;
  estimated_revenue: number | null;
  is_catalog: boolean;
  enrichment_status: 'complete' | 'partial' | 'pending' | 'unavailable';
}

interface CachedCatalogData {
  catalog_id: string;
  title: string | null;
  thumbnail: string | null;
  price: number | null;
  sold_quantity: number | null;
  permalink: string | null;
  resolved_item_id: string | null;
  cached_at: number;
}

// Memory cache for catalog resolutions
const catalogMemoryCache = new Map<string, CachedCatalogData>();

// Inflight enrichment requests
const inflightEnrichments = new Map<string, Promise<CachedCatalogData | null>>();

// Batch queue for API enrichment
let enrichmentQueue: string[] = [];
let isProcessingQueue = false;

export function useCatalogEnrichment() {
  const globalCache = useTrendsGlobalCache();
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ total: 0, completed: 0 });

  // ============================================================
  // CACHE HELPERS
  // ============================================================

  const getCatalogFromCache = useCallback((catalogId: string): CachedCatalogData | null => {
    // 1. Memory cache
    const memCached = catalogMemoryCache.get(catalogId);
    if (memCached && Date.now() - memCached.cached_at < CATALOG_TTL) {
      return memCached;
    }

    // 2. localStorage
    try {
      const stored = localStorage.getItem(`${CATALOG_PREFIX}${catalogId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedCatalogData;
        if (Date.now() - parsed.cached_at < CATALOG_TTL) {
          catalogMemoryCache.set(catalogId, parsed);
          return parsed;
        } else {
          localStorage.removeItem(`${CATALOG_PREFIX}${catalogId}`);
        }
      }
    } catch (e) {
      // Ignore
    }

    return null;
  }, []);

  const setCatalogToCache = useCallback((data: CachedCatalogData): void => {
    catalogMemoryCache.set(data.catalog_id, data);
    try {
      localStorage.setItem(`${CATALOG_PREFIX}${data.catalog_id}`, JSON.stringify(data));
    } catch (e) {
      // Ignore quota errors
    }
  }, []);

  // ============================================================
  // DATABASE LOOKUP
  // ============================================================

  const lookupFromDatabase = useCallback(async (catalogIds: string[]): Promise<Map<string, CachedCatalogData>> => {
    const results = new Map<string, CachedCatalogData>();
    
    if (catalogIds.length === 0) return results;

    // Try meli_order_items_cache first (has catalog_product_id)
    const { data: orderItems } = await supabase
      .from('meli_order_items_cache')
      .select('catalog_product_id, item_id, title, thumbnail, unit_price, created_at_meli')
      .in('catalog_product_id', catalogIds)
      .not('title', 'is', null)
      .order('created_at_meli', { ascending: false });

    const seenCatalogs = new Set<string>();
    for (const item of orderItems || []) {
      if (item.catalog_product_id && !seenCatalogs.has(item.catalog_product_id)) {
        seenCatalogs.add(item.catalog_product_id);
        const data: CachedCatalogData = {
          catalog_id: item.catalog_product_id,
          title: item.title,
          thumbnail: item.thumbnail,
          price: item.unit_price,
          sold_quantity: null, // Not available from order items
          permalink: null,
          resolved_item_id: item.item_id,
          cached_at: Date.now(),
        };
        results.set(item.catalog_product_id, data);
        setCatalogToCache(data);
      }
    }

    // For remaining, try meli_listings_cache
    const stillMissing = catalogIds.filter(id => !results.has(id));
    if (stillMissing.length > 0) {
      const { data: listings } = await supabase
        .from('meli_listings_cache')
        .select('catalog_product_id, item_id, title, thumbnail, price, sold_quantity, permalink')
        .in('catalog_product_id', stillMissing)
        .not('title', 'is', null)
        .order('last_sync_at', { ascending: false });

      const seenListings = new Set<string>();
      for (const listing of listings || []) {
        if (listing.catalog_product_id && !seenListings.has(listing.catalog_product_id)) {
          seenListings.add(listing.catalog_product_id);
          const data: CachedCatalogData = {
            catalog_id: listing.catalog_product_id,
            title: listing.title,
            thumbnail: listing.thumbnail,
            price: listing.price,
            sold_quantity: listing.sold_quantity,
            permalink: listing.permalink,
            resolved_item_id: listing.item_id,
            cached_at: Date.now(),
          };
          results.set(listing.catalog_product_id, data);
          setCatalogToCache(data);
        }
      }
    }

    return results;
  }, [setCatalogToCache]);

  // ============================================================
  // ENRICHMENT LOGIC
  // ============================================================

  const enrichItems = useCallback(async (
    items: Array<{
      item_id: string;
      rank: number;
      title: string | null;
      thumbnail: string | null;
      price: number | null;
      sold_quantity: number | null;
      permalink: string | null;
      estimated_revenue?: number | null;
      entity_type?: string;
    }>
  ): Promise<EnrichedItem[]> => {
    if (!items || items.length === 0) return [];

    const enriched: EnrichedItem[] = [];
    const catalogsToLookup: string[] = [];
    const itemsToEnrichFromGlobal: string[] = [];

    // First pass: identify what needs enrichment
    for (const item of items) {
      const isCatalog = item.item_id.startsWith('MLBU') || item.entity_type === 'PRODUCT';
      const hasData = !!item.title && !item.title.startsWith('[Catálogo]') && !!item.thumbnail;

      if (hasData) {
        // Already complete
        enriched.push({
          ...item,
          is_catalog: isCatalog,
          enrichment_status: 'complete',
          estimated_revenue: item.estimated_revenue ?? (item.price && item.sold_quantity ? item.price * item.sold_quantity : null),
        });
      } else if (isCatalog) {
        // Try cache first
        const cached = getCatalogFromCache(item.item_id);
        if (cached) {
          enriched.push({
            item_id: item.item_id,
            rank: item.rank,
            title: cached.title || item.title,
            thumbnail: cached.thumbnail || item.thumbnail,
            price: cached.price ?? item.price,
            sold_quantity: cached.sold_quantity ?? item.sold_quantity,
            permalink: cached.permalink || item.permalink,
            estimated_revenue: (cached.price ?? item.price) && (cached.sold_quantity ?? item.sold_quantity)
              ? ((cached.price ?? item.price)! * (cached.sold_quantity ?? item.sold_quantity)!)
              : item.estimated_revenue ?? null,
            is_catalog: true,
            enrichment_status: cached.title && cached.thumbnail ? 'complete' : 'partial',
          });
        } else {
          catalogsToLookup.push(item.item_id);
          // Add placeholder
          enriched.push({
            ...item,
            is_catalog: true,
            enrichment_status: 'pending',
            estimated_revenue: item.estimated_revenue ?? null,
          });
        }
      } else {
        // Regular item - try global cache
        const globalCached = globalCache.getItemFromMemory(item.item_id);
        if (globalCached) {
          enriched.push({
            ...item,
            title: globalCached.title || item.title,
            thumbnail: globalCached.thumbnail || item.thumbnail,
            is_catalog: false,
            enrichment_status: globalCached.title && globalCached.thumbnail ? 'complete' : 'partial',
            estimated_revenue: item.estimated_revenue ?? (item.price && item.sold_quantity ? item.price * item.sold_quantity : null),
          });
        } else {
          itemsToEnrichFromGlobal.push(item.item_id);
          enriched.push({
            ...item,
            is_catalog: false,
            enrichment_status: 'pending',
            estimated_revenue: item.estimated_revenue ?? null,
          });
        }
      }
    }

    // Background: lookup catalogs from database
    if (catalogsToLookup.length > 0) {
      setEnrichmentProgress({ total: catalogsToLookup.length, completed: 0 });
      
      const dbResults = await lookupFromDatabase(catalogsToLookup);
      let completed = 0;

      // Update enriched items with DB results
      for (let i = 0; i < enriched.length; i++) {
        const item = enriched[i];
        if (item.enrichment_status === 'pending' && item.is_catalog) {
          const dbData = dbResults.get(item.item_id);
          if (dbData) {
            enriched[i] = {
              ...item,
              title: dbData.title || item.title,
              thumbnail: dbData.thumbnail || item.thumbnail,
              price: dbData.price ?? item.price,
              sold_quantity: dbData.sold_quantity ?? item.sold_quantity,
              permalink: dbData.permalink || item.permalink,
              estimated_revenue: (dbData.price ?? item.price) && (dbData.sold_quantity ?? item.sold_quantity)
                ? ((dbData.price ?? item.price)! * (dbData.sold_quantity ?? item.sold_quantity)!)
                : item.estimated_revenue,
              enrichment_status: dbData.title && dbData.thumbnail ? 'complete' : 'partial',
            };
            completed++;
          } else {
            // Mark as unavailable (no data found)
            enriched[i] = {
              ...item,
              enrichment_status: 'unavailable',
            };
          }
        }
      }

      setEnrichmentProgress({ total: catalogsToLookup.length, completed });
    }

    return enriched;
  }, [getCatalogFromCache, lookupFromDatabase, globalCache]);

  // ============================================================
  // CLEANUP
  // ============================================================

  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, []);

  return {
    enrichItems,
    enrichmentProgress,
    getCatalogFromCache,
  };
}
