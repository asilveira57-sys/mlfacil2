import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { validateSellerAccess } from '@/lib/accountUnification';
import type { PromotionItemSnapshot } from '@/hooks/usePromotions';

export interface ListingVisual {
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  sku: string | null;
  permalink: string | null;
  listing_type_id: string | null;
}

export interface EnrichedPromotionItem extends PromotionItemSnapshot {
  title: string | null;
  thumbnail: string | null;
  sku: string | null;
  permalink: string | null;
  listing_type_id: string | null;
  /** Computed: best available final price (deal_price || effective_price) */
  finalPrice: number | null;
  /** Computed: discount % with fallback logic */
  computedDiscount: number | null;
  /** offer_id extracted from raw_item_data (needed for SMART adhesion) */
  offer_id: string | null;
}

interface UseEnrichedPromotionItemsResult {
  items: EnrichedPromotionItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  pendingItems: EnrichedPromotionItem[];
  ineligibleItems: EnrichedPromotionItem[];
  startedItems: EnrichedPromotionItem[];
}

/**
 * Enriched version of usePromotionItems that joins with meli_listings_cache
 * to add thumbnail, title, sku, permalink, and listing_type_id to each item.
 * Also computes finalPrice and computedDiscount with fallback logic.
 */
export function useEnrichedPromotionItems(
  workspaceId: string | null,
  promotionId?: string | null,
  sellerId?: string | null
): UseEnrichedPromotionItemsResult {
  const [rawItems, setRawItems] = useState<PromotionItemSnapshot[]>([]);
  const [visuals, setVisuals] = useState<Map<string, ListingVisual>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!workspaceId || !sellerId) {
      setRawItems([]);
      setVisuals(new Map());
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const hasAccess = await validateSellerAccess(sellerId);
      if (!hasAccess) {
        console.warn('[useEnrichedPromotionItems] No access to seller:', sellerId);
        setRawItems([]);
        setLoading(false);
        return;
      }

      // 1. Fetch promotion items (include raw_item_data for fallbacks)
      let query = supabase
        .from('promotion_items_snapshots')
        .select('*, raw_item_data')
        .eq('workspace_id', workspaceId)
        .eq('seller_id', sellerId)
        .order('item_status', { ascending: true });

      if (promotionId) {
        query = query.eq('promotion_id', promotionId);
      }

      const { data: itemsData, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      const items = (itemsData as unknown as PromotionItemSnapshot[]) || [];
      setRawItems(items);

      // 2. Enrich with listing visuals (second query + ML API fallback)
      if (items.length > 0) {
        const itemIds = [...new Set(items.map(i => i.item_id))];
        
        // Fetch in batches of 100 to avoid URL length limits
        const visualsMap = new Map<string, ListingVisual>();
        const batchSize = 100;
        
        for (let i = 0; i < itemIds.length; i += batchSize) {
          const batch = itemIds.slice(i, i + batchSize);
          const { data: listingsData } = await supabase
            .from('meli_listings_cache')
            .select('item_id, title, thumbnail, sku, permalink, listing_type_id')
            .eq('seller_id', sellerId)
            .in('item_id', batch);

          if (listingsData) {
            for (const listing of listingsData) {
              if (!visualsMap.has(listing.item_id)) {
                visualsMap.set(listing.item_id, listing as ListingVisual);
              }
            }
          }
        }

        // Fallback: fetch missing items from ML public API
        const missingIds = itemIds.filter(id => !visualsMap.has(id));
        if (missingIds.length > 0) {
          const mlBatchSize = 20; // ML API allows up to 20 ids per call
          for (let i = 0; i < missingIds.length; i += mlBatchSize) {
            const batch = missingIds.slice(i, i + mlBatchSize);
            try {
              const idsParam = batch.join(',');
              const res = await fetch(`https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,thumbnail,permalink`);
              if (res.ok) {
                const results = await res.json() as { code: number; body: { id: string; title: string; thumbnail: string; permalink: string } }[];
                for (const result of results) {
                  if (result.code === 200 && result.body) {
                    visualsMap.set(result.body.id, {
                      item_id: result.body.id,
                      title: result.body.title || null,
                      thumbnail: result.body.thumbnail || null,
                      sku: null,
                      permalink: result.body.permalink || null,
                      listing_type_id: null,
                    });
                  }
                }
              }
            } catch (err) {
              console.warn('[useEnrichedPromotionItems] ML API fallback failed:', err);
            }
          }
        }
        
        setVisuals(visualsMap);
      } else {
        setVisuals(new Map());
      }
    } catch (err) {
      console.error('[useEnrichedPromotionItems] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar itens');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, promotionId, sellerId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Merge raw items with visuals + compute derived fields
  const enrichedItems = useMemo<EnrichedPromotionItem[]>(() => {
    return rawItems.map(item => {
      const visual = visuals.get(item.item_id);
      const rawData = (item as unknown as Record<string, unknown>).raw_item_data as Record<string, unknown> | null;
      
      // Best available final price
      const finalPrice = item.promo_price || item.effective_price || null;
      
      // Compute discount with fallbacks
      let computedDiscount = item.discount_percent;
      if (!computedDiscount && item.original_price && item.original_price > 0) {
        if (item.promo_price) {
          computedDiscount = Math.round((1 - item.promo_price / item.original_price) * 100);
        } else if (item.effective_price && item.effective_price !== item.original_price) {
          computedDiscount = Math.round((1 - item.effective_price / item.original_price) * 100);
        }
      }

      // Extract offer_id from raw_item_data
      const offerId = (rawData?.offer_id as string) || null;

      // Fallback title/thumbnail from raw_item_data when cache misses
      const rawTitle = (rawData?.title as string) || (rawData?.item_title as string) || null;
      const rawThumbnail = (rawData?.thumbnail as string) || (rawData?.picture_url as string) || null;
      
      return {
        ...item,
        title: visual?.title || rawTitle || null,
        thumbnail: visual?.thumbnail || rawThumbnail || null,
        sku: visual?.sku || null,
        permalink: visual?.permalink || null,
        listing_type_id: visual?.listing_type_id || null,
        finalPrice,
        computedDiscount,
        offer_id: offerId,
      };
    });
  }, [rawItems, visuals]);

  // Computed views
  const pendingItems = useMemo(() => 
    enrichedItems.filter(i => i.item_status === 'candidate' || i.item_status === 'pending'),
    [enrichedItems]
  );

  const ineligibleItems = useMemo(() => 
    enrichedItems.filter(i => i.item_status === 'ineligible'),
    [enrichedItems]
  );

  const startedItems = useMemo(() => 
    enrichedItems.filter(i => i.item_status === 'started'),
    [enrichedItems]
  );

  return {
    items: enrichedItems,
    loading,
    error,
    refetch: fetchItems,
    pendingItems,
    ineligibleItems,
    startedItems,
  };
}
