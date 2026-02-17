import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProductPromotionInfo {
  promotion_id: string;
  promotion_name: string | null;
  promotion_type: string;
  promotion_status: string;
  item_status: string;
  meli_percentage: number | null;
  offer_id: string | null;
  original_price: number | null;
  promo_price: number | null;
  feeReductionAmount: number | null;
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

      // 1. Find matching item_ids from meli_listings_cache (by title, sku, or item_id)
      const isItemId = /^ML[A-Z]\d+$/i.test(trimmed);

      let matchingItemIds: string[] = [];

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
        .select('promotion_id, promotion_name, promotion_type, status')
        .eq('workspace_id', workspaceId)
        .eq('seller_id', sellerId)
        .in('promotion_id', promoIds);

      const promoMap = new Map(
        (promos || []).map(p => [p.promotion_id, p])
      );

      // 4. Get listing visuals
      const uniqueItemIds = [...new Set(promoItems.map(pi => pi.item_id))];
      const { data: listings } = await supabase
        .from('meli_listings_cache')
        .select('item_id, title, thumbnail, sku')
        .eq('seller_id', sellerId)
        .in('item_id', uniqueItemIds);

      const listingMap = new Map(
        (listings || []).map(l => [l.item_id, l])
      );

      // 5. Group by item_id
      const grouped = new Map<string, ProductSearchResult>();

      for (const pi of promoItems) {
        const listing = listingMap.get(pi.item_id);
        const promo = promoMap.get(pi.promotion_id);
        const rawData = pi.raw_item_data as Record<string, unknown> | null;
        const meliPct = (rawData?.meli_percentage as number) || null;
        const offerId = (rawData?.offer_id as string) || null;
        const feeReduction = (meliPct && pi.original_price)
          ? pi.original_price * meliPct / 100
          : null;

        if (!grouped.has(pi.item_id)) {
          grouped.set(pi.item_id, {
            item_id: pi.item_id,
            title: listing?.title || (rawData?.title as string) || null,
            thumbnail: listing?.thumbnail || (rawData?.thumbnail as string) || null,
            sku: listing?.sku || null,
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
          promo_price: pi.promo_price,
          feeReductionAmount: feeReduction,
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
