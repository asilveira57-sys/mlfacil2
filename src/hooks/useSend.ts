import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import type { 
  SendSeedBalance, 
  SendPlantedItem, 
  SendMetricsSnapshot,
  SendAplusCandidate,
  PlantedItemWithMetrics,
  EligibleItem 
} from '@/types/send';

interface UseSendResult {
  // Seed balance
  seedBalance: SendSeedBalance | null;
  availableSeeds: number;
  totalSeeds: number;
  usedSeeds: number;
  
  // Planted items
  plantedItems: PlantedItemWithMetrics[];
  plantedCount: number;
  
  // Eligible items (Curve A/A+)
  eligibleItems: EligibleItem[];
  aplusCandidates: SendAplusCandidate[];
  
  // State
  loading: boolean;
  error: string | null;
  
  // Actions
  plantItem: (itemId: string, itemTitle?: string, thumbnail?: string, abcClass?: string) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  refreshData: () => Promise<void>;
}

export function useSend(): UseSendResult {
  const { sellerId } = useActiveAccount();
  const [seedBalance, setSeedBalance] = useState<SendSeedBalance | null>(null);
  const [plantedItems, setPlantedItems] = useState<PlantedItemWithMetrics[]>([]);
  const [eligibleItems, setEligibleItems] = useState<EligibleItem[]>([]);
  const [aplusCandidates, setAplusCandidates] = useState<SendAplusCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all Send data
  const fetchData = useCallback(async () => {
    if (!sellerId) {
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

      // Fetch seed balance (or create default)
      let { data: balanceData } = await supabase
        .from('send_seed_balance')
        .select('*')
        .eq('user_id', user.id)
        .eq('seller_id', sellerId)
        .single();

      if (!balanceData) {
        // Create default balance
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

      setSeedBalance(balanceData as SendSeedBalance);

      // Fetch planted items
      const { data: plantedData } = await supabase
        .from('send_planted_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('seller_id', sellerId)
        .order('planted_at', { ascending: false });

      // Fetch latest metrics for each planted item
      const plantedWithMetrics: PlantedItemWithMetrics[] = [];
      for (const item of (plantedData || [])) {
        const { data: metricsData } = await supabase
          .from('send_metrics_snapshots')
          .select('*')
          .eq('planted_item_id', item.id)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .single();

        const { count: historyCount } = await supabase
          .from('send_item_history')
          .select('*', { count: 'exact', head: true })
          .eq('item_id', item.item_id)
          .eq('user_id', user.id);

        plantedWithMetrics.push({
          ...item,
          latestMetrics: metricsData as SendMetricsSnapshot | null,
          historyCount: historyCount || 0,
        });
      }

      setPlantedItems(plantedWithMetrics);

      // Fetch A+ candidates
      const { data: aplusData } = await supabase
        .from('send_aplus_candidates')
        .select('*')
        .eq('user_id', user.id)
        .eq('seller_id', sellerId)
        .order('stability_score', { ascending: false });

      setAplusCandidates((aplusData || []) as SendAplusCandidate[]);

      // Build eligible items from ABC analysis cache
      const { data: abcData } = await supabase
        .from('abc_profit_cache')
        .select('*')
        .eq('user_id', user.id)
        .eq('seller_id', sellerId)
        .eq('metric', 'revenue')
        .in('class', ['A'])
        .order('value_total', { ascending: false })
        .limit(50);

      const plantedItemIds = new Set((plantedData || []).map(p => p.item_id));
      
      // Get item IDs to fetch from listings cache
      const abcItemIds = (abcData || []).map(abc => abc.product_key);
      const aplusItemIds = (aplusData || []).map(c => c.item_id);
      const allItemIds = [...new Set([...abcItemIds, ...aplusItemIds])];

      // Fetch thumbnails and titles from meli_listings_cache
      const { data: listingsData } = await supabase
        .from('meli_listings_cache')
        .select('item_id, title, thumbnail')
        .eq('seller_id', sellerId)
        .in('item_id', allItemIds);

      const listingsMap = new Map(
        (listingsData || []).map(l => [l.item_id, { title: l.title, thumbnail: l.thumbnail }])
      );

      const eligible: EligibleItem[] = (abcData || []).map(abc => {
        const listing = listingsMap.get(abc.product_key);
        return {
          item_id: abc.product_key,
          item_title: listing?.title || abc.display_name,
          item_thumbnail: listing?.thumbnail || null,
          abc_class: 'A' as const,
          total_revenue: abc.value_total,
          sales_count: 0,
          is_planted: plantedItemIds.has(abc.product_key),
        };
      });

      // Add A+ candidates not already in eligible
      for (const candidate of (aplusData || [])) {
        if (!eligible.find(e => e.item_id === candidate.item_id)) {
          const listing = listingsMap.get(candidate.item_id);
          eligible.push({
            item_id: candidate.item_id,
            item_title: listing?.title || candidate.item_title,
            item_thumbnail: listing?.thumbnail || null,
            abc_class: 'A+',
            total_revenue: candidate.total_revenue,
            sales_count: 0,
            is_planted: plantedItemIds.has(candidate.item_id),
          });
        }
      }

      setEligibleItems(eligible);

    } catch (err) {
      console.error('[useSend] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados do Send');
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
      // Insert planted item
      const { error: insertError } = await supabase
        .from('send_planted_items')
        .insert({
          user_id: user.id,
          seller_id: sellerId,
          item_id: itemId,
          item_title: itemTitle || null,
          item_thumbnail: thumbnail || null,
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
          event_data: { abc_class: abcClass, title: itemTitle },
        });

      await fetchData();
      return true;
    } catch (err) {
      console.error('[useSend] plantItem error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao plantar item');
      return false;
    }
  }, [sellerId, seedBalance, fetchData]);

  // Remove an item from Send
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

      await fetchData();
      return true;
    } catch (err) {
      console.error('[useSend] removeItem error:', err);
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
    refreshData: fetchData,
  };
}
