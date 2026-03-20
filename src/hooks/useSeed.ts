import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import type { 
  SeedBalance, 
  SeedPlantedItem, 
  SeedMetricsSnapshot,
  SeedAplusCandidate,
  PlantedItemWithMetrics,
  EligibleItem 
} from '@/types/seed';

// In-memory cache for listings data
const listingsCache = new Map<string, { title: string; thumbnail: string; sku: string }>();

interface UseSeedResult {
  // Seed balance
  seedBalance: SeedBalance | null;
  availableSeeds: number;
  totalSeeds: number;
  usedSeeds: number;
  
  // Planted items
  plantedItems: PlantedItemWithMetrics[];
  plantedCount: number;
  
  // Eligible items (Curve A/A+)
  eligibleItems: EligibleItem[];
  aplusCandidates: SeedAplusCandidate[];
  
  // State
  loading: boolean;
  error: string | null;
  
  // Actions
  plantItem: (itemId: string, itemTitle?: string, thumbnail?: string, abcClass?: string) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  refreshData: () => Promise<void>;
}

// Helper function to extract MLB ID from product_key
function extractMlbId(productKey: string): string | null {
  if (!productKey.startsWith('MLB')) return null;
  const match = productKey.match(/^(MLB\d+)/);
  return match ? match[1] : null;
}

export function useSeed(): UseSeedResult {
  const { sellerId } = useActiveAccount();
  const [seedBalance, setSeedBalance] = useState<SeedBalance | null>(null);
  const [plantedItems, setPlantedItems] = useState<PlantedItemWithMetrics[]>([]);
  const [eligibleItems, setEligibleItems] = useState<EligibleItem[]>([]);
  const [aplusCandidates, setAplusCandidates] = useState<SeedAplusCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track fetched data to prevent unnecessary refetches
  const lastFetchRef = useRef<{ sellerId: string; timestamp: number } | null>(null);
  const CACHE_TTL = 60000; // 1 minute cache

  // Fetch all Seed data
  const fetchData = useCallback(async () => {
    if (!sellerId) {
      setLoading(false);
      return;
    }

    // Check cache to prevent refetching too quickly
    const now = Date.now();
    if (
      lastFetchRef.current?.sellerId === sellerId && 
      now - lastFetchRef.current.timestamp < CACHE_TTL
    ) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Resolve tenant_id from company
      let tenantId: string | null = null;
      const { data: mlAccount } = await supabase
        .from('ml_accounts')
        .select('company_id')
        .eq('ml_user_id', sellerId)
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (mlAccount?.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('tenant_id')
          .eq('id', mlAccount.company_id)
          .single();
        tenantId = company?.tenant_id || null;
      }

      // Trigger recalculation via RPC (idempotent, fast)
      if (tenantId) {
        try {
          await supabase.rpc('recalculate_seed_balance_for_seller', {
            p_tenant_id: tenantId,
            p_user_id: user.id,
            p_seller_id: sellerId,
          });
        } catch (rpcErr) {
          console.warn('[useSeed] RPC recalculate failed (non-blocking):', rpcErr);
        }
      }

      // Fetch seed balance (now should exist after recalculate)
      let { data: balanceData } = await supabase
        .from('send_seed_balance')
        .select('*')
        .eq('user_id', user.id)
        .eq('seller_id', sellerId)
        .single();

      if (!balanceData) {
        // Fallback: create minimal balance if RPC didn't run (e.g. no tenant)
        const { data: newBalance } = await supabase
          .from('send_seed_balance')
          .insert({
            user_id: user.id,
            seller_id: sellerId,
            seeds_from_plan: 5,
            seeds_purchased: 0,
            seeds_used: 0,
            plan_tier: 'basic',
          })
          .select()
          .single();
        balanceData = newBalance;
      }

      setSeedBalance(balanceData as SeedBalance);

      // Parallel fetch: planted items, A+ candidates, ABC data
      const [plantedRes, aplusRes, abcRes] = await Promise.all([
        supabase
          .from('send_planted_items')
          .select('*')
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .order('planted_at', { ascending: false }),
        
        supabase
          .from('send_aplus_candidates')
          .select('*')
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .order('stability_score', { ascending: false }),
        
        supabase
          .from('abc_profit_cache')
          .select('*')
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .eq('metric', 'revenue')
          .in('class', ['A'])
          .order('value_total', { ascending: false })
          .limit(50)
      ]);

      const plantedData = plantedRes.data || [];
      const aplusData = aplusRes.data || [];
      const abcData = abcRes.data || [];

      setAplusCandidates(aplusData as SeedAplusCandidate[]);

      // Collect all item IDs we need to hydrate
      const allProductKeys = abcData.map(abc => abc.product_key);
      const plantedItemIds = plantedData.map(p => p.item_id);
      const aplusItemIds = aplusData.map(c => c.item_id);
      
      // Separate into MLB IDs and SKUs
      const mlbIds: string[] = [];
      const skuCodes: string[] = [];
      
      for (const pk of [...allProductKeys, ...plantedItemIds, ...aplusItemIds]) {
        const mlbId = extractMlbId(pk);
        if (mlbId) {
          mlbIds.push(mlbId);
        } else if (pk) {
          skuCodes.push(pk);
        }
      }
      
      const uniqueMlbIds = [...new Set(mlbIds)];
      const uniqueSkuCodes = [...new Set(skuCodes)];

      // Check what's missing from cache
      const missingMlbIds = uniqueMlbIds.filter(id => !listingsCache.has(id));
      const missingSkuCodes = uniqueSkuCodes.filter(sku => !listingsCache.has(sku));

      // Fetch missing data - try meli_listings_cache first, then meli_order_items_cache as fallback
      if (missingMlbIds.length > 0 || missingSkuCodes.length > 0) {
        // First try: meli_listings_cache (by item_id and sku)
        const mlbFetch = missingMlbIds.length > 0 
          ? supabase
              .from('meli_listings_cache')
              .select('item_id, sku, title, thumbnail')
              .eq('seller_id', sellerId)
              .in('item_id', missingMlbIds)
          : null;

        const skuFetch = missingSkuCodes.length > 0
          ? supabase
              .from('meli_listings_cache')
              .select('item_id, sku, title, thumbnail')
              .eq('seller_id', sellerId)
              .in('sku', missingSkuCodes)
          : null;

        const [mlbResult, skuResult] = await Promise.all([mlbFetch, skuFetch]);

        // Process meli_listings_cache results
        for (const l of (mlbResult?.data || [])) {
          listingsCache.set(l.item_id, { 
            title: l.title || '', 
            thumbnail: l.thumbnail || '', 
            sku: l.sku || '' 
          });
          if (l.sku) {
            listingsCache.set(l.sku, { 
              title: l.title || '', 
              thumbnail: l.thumbnail || '', 
              sku: l.sku 
            });
          }
        }

        for (const l of (skuResult?.data || [])) {
          listingsCache.set(l.item_id, { 
            title: l.title || '', 
            thumbnail: l.thumbnail || '', 
            sku: l.sku || '' 
          });
          if (l.sku) {
            listingsCache.set(l.sku, { 
              title: l.title || '', 
              thumbnail: l.thumbnail || '', 
              sku: l.sku 
            });
          }
        }

        // Second try: meli_order_items_cache for any still missing (both SKUs and MLB IDs)
        const stillMissingSkus = missingSkuCodes.filter(sku => !listingsCache.has(sku));
        const stillMissingMlbIds = missingMlbIds.filter(id => !listingsCache.has(id));
        
        // Fetch by product_key for SKUs
        const skuOrderFetch = stillMissingSkus.length > 0
          ? supabase
              .from('meli_order_items_cache')
              .select('product_key, item_id, title, thumbnail, sku')
              .eq('seller_id', sellerId)
              .in('product_key', stillMissingSkus)
          : null;

        // Also fetch by item_id for MLB IDs that weren't in listings_cache
        const mlbOrderFetch = stillMissingMlbIds.length > 0
          ? supabase
              .from('meli_order_items_cache')
              .select('product_key, item_id, title, thumbnail, sku')
              .eq('seller_id', sellerId)
              .in('item_id', stillMissingMlbIds)
          : null;

        const [skuOrderRes, mlbOrderRes] = await Promise.all([skuOrderFetch, mlbOrderFetch]);

        for (const oi of [...(skuOrderRes?.data || []), ...(mlbOrderRes?.data || [])]) {
          if (oi.product_key && !listingsCache.has(oi.product_key)) {
            listingsCache.set(oi.product_key, {
              title: oi.title || '',
              thumbnail: oi.thumbnail || '',
              sku: oi.sku || oi.product_key
            });
          }
          if (oi.item_id && !listingsCache.has(oi.item_id)) {
            listingsCache.set(oi.item_id, {
              title: oi.title || '',
              thumbnail: oi.thumbnail || '',
              sku: oi.sku || ''
            });
          }
        }
      }

      // Helper to get cached listing
      const getCachedListing = (productKey: string) => {
        const mlbId = extractMlbId(productKey);
        return (mlbId ? listingsCache.get(mlbId) : null) || listingsCache.get(productKey);
      };

      // Build planted items with metrics
      const plantedWithMetrics: PlantedItemWithMetrics[] = [];
      
      // Parallel fetch metrics for all planted items
      const metricsPromises = plantedData.map(item => 
        supabase
          .from('send_metrics_snapshots')
          .select('*')
          .eq('planted_item_id', item.id)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .single()
          .then(({ data }) => ({ itemId: item.id, metrics: data }))
      );

      const historyCountPromises = plantedData.map(item =>
        supabase
          .from('send_item_history')
          .select('*', { count: 'exact', head: true })
          .eq('item_id', item.item_id)
          .eq('user_id', user.id)
          .then(({ count }) => ({ itemId: item.id, count: count || 0 }))
      );

      const [metricsResults, historyResults] = await Promise.all([
        Promise.all(metricsPromises),
        Promise.all(historyCountPromises)
      ]);

      const metricsMap = new Map(metricsResults.map(r => [r.itemId, r.metrics]));
      const historyMap = new Map(historyResults.map(r => [r.itemId, r.count]));

      for (const item of plantedData) {
        const listing = getCachedListing(item.item_id);
        
        plantedWithMetrics.push({
          ...item,
          // Hydrate from cache if stored values are missing
          item_title: item.item_title || listing?.title || item.item_id,
          item_thumbnail: item.item_thumbnail || listing?.thumbnail || null,
          latestMetrics: metricsMap.get(item.id) as SeedMetricsSnapshot | null,
          historyCount: historyMap.get(item.id) || 0,
        });
      }

      setPlantedItems(plantedWithMetrics);

      // Build eligible items
      const plantedItemIdSet = new Set(plantedData.map(p => p.item_id));
      
      const eligible: EligibleItem[] = abcData.map(abc => {
        const listing = getCachedListing(abc.product_key);
        return {
          item_id: abc.product_key,
          item_title: listing?.title || abc.display_name || abc.product_key,
          item_thumbnail: listing?.thumbnail || null,
          abc_class: 'A' as const,
          total_revenue: abc.value_total,
          sales_count: 0,
          is_planted: plantedItemIdSet.has(abc.product_key),
        };
      });

      // Add A+ candidates not already in eligible
      for (const candidate of aplusData) {
        if (!eligible.find(e => e.item_id === candidate.item_id)) {
          const listing = getCachedListing(candidate.item_id);
          eligible.push({
            item_id: candidate.item_id,
            item_title: listing?.title || candidate.item_title || candidate.item_id,
            item_thumbnail: listing?.thumbnail || null,
            abc_class: 'A+',
            total_revenue: candidate.total_revenue,
            sales_count: 0,
            is_planted: plantedItemIdSet.has(candidate.item_id),
          });
        }
      }

      setEligibleItems(eligible);

      // Update cache timestamp
      lastFetchRef.current = { sellerId, timestamp: now };

    } catch (err) {
      console.error('[useSeed] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados do Seed');
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Plant a new item
  const plantItem = useCallback(async (
    itemId: string, 
    itemTitle?: string, 
    thumbnail?: string,
    abcClass: string = 'A'
  ): Promise<boolean> => {
    if (!sellerId || !seedBalance) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const available = seedBalance.seeds_from_plan + seedBalance.seeds_purchased - seedBalance.seeds_used;
    if (available <= 0) {
      setError('Você não tem sementes disponíveis. Compre mais sementes ou remova um anúncio.');
      return false;
    }

    try {
      // Get hydrated data from cache if not provided
      const listing = listingsCache.get(extractMlbId(itemId) || itemId) || listingsCache.get(itemId);
      const finalTitle = itemTitle || listing?.title || null;
      const finalThumbnail = thumbnail || listing?.thumbnail || null;

      // Insert planted item
      const { error: insertError } = await supabase
        .from('send_planted_items')
        .insert({
          user_id: user.id,
          seller_id: sellerId,
          item_id: itemId,
          item_title: finalTitle,
          item_thumbnail: finalThumbnail,
          abc_class: abcClass,
          is_a_plus: abcClass === 'A+',
        });

      if (insertError) throw insertError;

      // Update seed balance
      const { error: balanceError } = await supabase
        .from('send_seed_balance')
        .update({
          seeds_used: seedBalance.seeds_used + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', seedBalance.id);

      if (balanceError) throw balanceError;

      // Log history event
      await supabase
        .from('send_item_history')
        .insert({
          user_id: user.id,
          seller_id: sellerId,
          item_id: itemId,
          event_type: 'planted',
          event_data: { abc_class: abcClass, title: finalTitle },
        });

      // Force refresh
      lastFetchRef.current = null;
      await fetchData();
      return true;
    } catch (err) {
      console.error('[useSeed] plantItem error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao plantar item');
      return false;
    }
  }, [sellerId, seedBalance, fetchData]);

  // Remove an item from Seed
  const removeItem = useCallback(async (itemId: string): Promise<boolean> => {
    if (!sellerId || !seedBalance) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    try {
      // Log history event before removing
      await supabase
        .from('send_item_history')
        .insert({
          user_id: user.id,
          seller_id: sellerId,
          item_id: itemId,
          event_type: 'removed',
          event_data: { reason: 'manual' },
        });

      // Delete planted item
      const { error: deleteError } = await supabase
        .from('send_planted_items')
        .delete()
        .eq('user_id', user.id)
        .eq('seller_id', sellerId)
        .eq('item_id', itemId);

      if (deleteError) throw deleteError;

      // Update seed balance (return seed)
      const { error: balanceError } = await supabase
        .from('send_seed_balance')
        .update({
          seeds_used: Math.max(0, seedBalance.seeds_used - 1),
          updated_at: new Date().toISOString(),
        })
        .eq('id', seedBalance.id);

      if (balanceError) throw balanceError;

      // Force refresh
      lastFetchRef.current = null;
      await fetchData();
      return true;
    } catch (err) {
      console.error('[useSeed] removeItem error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao remover item');
      return false;
    }
  }, [sellerId, seedBalance, fetchData]);

  const availableSeeds = seedBalance 
    ? seedBalance.seeds_from_plan + seedBalance.seeds_purchased - seedBalance.seeds_used 
    : 0;

  return {
    seedBalance,
    availableSeeds,
    totalSeeds: seedBalance ? seedBalance.seeds_from_plan + seedBalance.seeds_purchased : 0,
    usedSeeds: seedBalance?.seeds_used || 0,
    plantedItems,
    plantedCount: plantedItems.length,
    eligibleItems,
    aplusCandidates,
    loading,
    error,
    plantItem,
    removeItem,
    refreshData: async () => {
      lastFetchRef.current = null;
      await fetchData();
    },
  };
}
