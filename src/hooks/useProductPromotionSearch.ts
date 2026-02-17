import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProductPromotionInfo {
  promotion_id: string;
  promotion_name: string | null;
  promotion_type: string;
  promotion_status: string;
  item_status: string;
  meli_percentage: number | null;
  seller_percentage: number | null;
  offer_id: string | null;
  original_price: number | null;
  promo_price: number | null;
  feeReductionAmount: number | null;
  start_at: string | null;
  end_at: string | null;
}

export interface ProductSearchResult {
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  sku: string | null;
  promotions: ProductPromotionInfo[];
}

interface UseProductPromotionSearchResult {
  results: ProductSearchResult[];
  loading: boolean;
  error: string | null;
}

/**
 * Cross-promotion product search: finds all promotions a product appears in.
 * Debounced, triggers after 3+ chars.
 */
export function useProductPromotionSearch(
  workspaceId: string | null,
  sellerId: string | null,
  query: string
): UseProductPromotionSearchResult {
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (searchQuery: string) => {
    if (!workspaceId || !sellerId || searchQuery.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const trimmed = searchQuery.trim();
      const isItemId = /^ML[A-Z]\d+$/i.test(trimmed);

      // 1. Find matching item_ids from meli_listings_cache (by title, sku, or item_id)
      let matchingItemIds: string[] = [];
      let listingsMap = new Map<string, { title: string | null; thumbnail: string | null; sku: string | null }>();

      if (isItemId) {
        matchingItemIds = [trimmed.toUpperCase()];
      } else {
        // Search by title or sku in listings cache
        const { data: listings } = await supabase
          .from('meli_listings_cache')
          .select('item_id, title, thumbnail, sku')
          .eq('seller_id', sellerId)
          .or(`title.ilike.%${trimmed}%,sku.ilike.%${trimmed}%,item_id.ilike.%${trimmed}%`)
          .limit(50);

        if (listings && listings.length > 0) {
          matchingItemIds = listings.map(l => l.item_id);
          for (const l of listings) {
            listingsMap.set(l.item_id, { title: l.title, thumbnail: l.thumbnail, sku: l.sku });
          }
        }
      }

      // 2. If no cache results and not an item_id search, try enriching all promo items
      // and filtering by title client-side
      if (matchingItemIds.length === 0 && !isItemId) {
        // Fetch all unique item_ids from promotions
        const { data: allPromoItems } = await supabase
          .from('promotion_items_snapshots')
          .select('item_id')
          .eq('workspace_id', workspaceId)
          .eq('seller_id', sellerId);

        if (!allPromoItems || allPromoItems.length === 0) {
          setResults([]);
          return;
        }

        const uniqueIds = [...new Set(allPromoItems.map(i => i.item_id))];

        // Try to enrich via edge function
        try {
          const { data: enrichData, error: enrichError } = await supabase.functions.invoke('promotions-action', {
            body: {
              action: 'enrich',
              seller_id: sellerId,
              items: uniqueIds.map(id => ({ item_id: id })),
            },
          });

          if (!enrichError && enrichData?.ok && enrichData.data) {
            const enrichMap = enrichData.data as Record<string, { title: string | null; thumbnail: string | null; permalink: string | null }>;
            
            // Filter by title match
            for (const [itemId, info] of Object.entries(enrichMap)) {
              if (info.title && info.title.toLowerCase().includes(trimmed.toLowerCase())) {
                matchingItemIds.push(itemId);
                listingsMap.set(itemId, { title: info.title, thumbnail: info.thumbnail, sku: null });
              }
            }
          }
        } catch (err) {
          console.warn('[useProductPromotionSearch] Enrich fallback failed:', err);
        }
      }

      if (matchingItemIds.length === 0) {
        setResults([]);
        return;
      }

      // 2. Find all promotion_items_snapshots for these items
      const { data: promoItems, error: promoError } = await supabase
        .from('promotion_items_snapshots')
        .select('item_id, promotion_id, item_status, original_price, promo_price, raw_item_data')
        .eq('workspace_id', workspaceId)
        .eq('seller_id', sellerId)
        .in('item_id', matchingItemIds);

      if (promoError) throw promoError;

      if (!promoItems || promoItems.length === 0) {
        setResults([]);
        return;
      }

      // 3. Get promotion details for all found promotion_ids
      const promoIds = [...new Set(promoItems.map(pi => pi.promotion_id))];
      const { data: promos } = await supabase
        .from('promotion_snapshots')
        .select('promotion_id, promotion_name, promotion_type, status, start_at, end_at')
        .eq('workspace_id', workspaceId)
        .eq('seller_id', sellerId)
        .in('promotion_id', promoIds);

      const promoMap = new Map(
        (promos || []).map(p => [p.promotion_id, p])
      );

      // 4. Get listing visuals (merge with already-found listingsMap)
      const uniqueItemIds = [...new Set(promoItems.map(pi => pi.item_id))];
      const missingVisualIds = uniqueItemIds.filter(id => !listingsMap.has(id));
      if (missingVisualIds.length > 0) {
        const { data: listings } = await supabase
          .from('meli_listings_cache')
          .select('item_id, title, thumbnail, sku')
          .eq('seller_id', sellerId)
          .in('item_id', missingVisualIds);

        if (listings) {
          for (const l of listings) {
            listingsMap.set(l.item_id, { title: l.title, thumbnail: l.thumbnail, sku: l.sku });
          }
        }
      }

      // 5. Group by item_id
      const grouped = new Map<string, ProductSearchResult>();

      for (const pi of promoItems) {
        const promo = promoMap.get(pi.promotion_id);
        const rawData = pi.raw_item_data as Record<string, unknown> | null;
        const meliPct = (rawData?.meli_percentage as number) || null;
        const sellerPct = (rawData?.seller_percentage as number) || null;
        const rawPrice = (rawData?.price as number) || null;
        const effectivePromoPrice = pi.promo_price || rawPrice;
        const offerId = (rawData?.offer_id as string) || null;
        const feeReduction = (meliPct && pi.original_price)
          ? pi.original_price * meliPct / 100
          : null;

        if (!grouped.has(pi.item_id)) {
          const cachedVisual = listingsMap.get(pi.item_id);
          grouped.set(pi.item_id, {
            item_id: pi.item_id,
            title: cachedVisual?.title || (rawData?.title as string) || null,
            thumbnail: cachedVisual?.thumbnail || (rawData?.thumbnail as string) || null,
            sku: cachedVisual?.sku || null,
            promotions: [],
          });
        }

        grouped.get(pi.item_id)!.promotions.push({
          promotion_id: pi.promotion_id,
          promotion_name: promo?.promotion_name || null,
          promotion_type: promo?.promotion_type || 'UNKNOWN',
          promotion_status: promo?.status || 'unknown',
          item_status: pi.item_status,
          meli_percentage: meliPct,
          offer_id: offerId,
          original_price: pi.original_price,
          promo_price: effectivePromoPrice,
          feeReductionAmount: feeReduction,
          seller_percentage: sellerPct,
          start_at: promo?.start_at || null,
          end_at: promo?.end_at || null,
        });
      }

      setResults(Array.from(grouped.values()));
    } catch (err) {
      console.error('[useProductPromotionSearch] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro na busca');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, sellerId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      search(query);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  return { results, loading, error };
}
