import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { fetchAllRows } from '@/lib/supabaseHelpers';
import type {
  AdsCampaign,
  AdsAdGroup,
  AdsItem,
  AdsDailyMetric,
  AdsAlert,
  AdsSyncState,
  AdsMetricsSummary,
  AdsFilterState,
  EnrichedAdsItem,
} from '@/types/ads';

export function useAdsCampaigns(sellerId?: string) {
  const [campaigns, setCampaigns] = useState<AdsCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCampaigns = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const data = await fetchAllRows<AdsCampaign>(
        supabase
          .from('ads_campaigns')
          .select('*')
          .eq('seller_id', sellerId)
          .order('spent_total', { ascending: false })
      );
      setCampaigns(data);
    } catch (err) {
      console.error('[useAdsCampaigns] Error:', err);
      toast({ title: 'Erro ao carregar campanhas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [sellerId, toast]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // DISABLED: Realtime subscription disabled in static mode
  // Data only updates on manual refresh or page reload
  // useEffect(() => {
  //   if (!sellerId) return;
  //   const channel = supabase
  //     .channel(`ads-campaigns-${sellerId}`)
  //     .on('postgres_changes', {
  //       event: '*',
  //       schema: 'public',
  //       table: 'ads_campaigns',
  //       filter: `seller_id=eq.${sellerId}`,
  //     }, () => fetchCampaigns())
  //     .subscribe();
  //
  //   return () => { supabase.removeChannel(channel); };
  // }, [sellerId, fetchCampaigns]);

  return { campaigns, loading, refetch: fetchCampaigns };
}

export function useAdsItems(sellerId?: string, filters?: AdsFilterState) {
  const [items, setItems] = useState<AdsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchItems = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('ads_items')
        .select('*')
        .eq('seller_id', sellerId);

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.acos_min !== undefined) {
        query = query.gte('acos', filters.acos_min);
      }
      if (filters?.acos_max !== undefined) {
        query = query.lte('acos', filters.acos_max);
      }
      if (filters?.roas_min !== undefined) {
        query = query.gte('roas', filters.roas_min);
      }
      if (filters?.roas_max !== undefined) {
        query = query.lte('roas', filters.roas_max);
      }

      const data = await fetchAllRows<AdsItem>(query.order('spent', { ascending: false }));
      setItems(data);
    } catch (err) {
      console.error('[useAdsItems] Error:', err);
      toast({ title: 'Erro ao carregar itens de ADS', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [sellerId, filters, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading, refetch: fetchItems };
}

export function useAdsDailyMetrics(sellerId?: string, dateFrom?: string, dateTo?: string) {
  const [metrics, setMetrics] = useState<AdsDailyMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) return;
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('ads_daily_metrics')
          .select('*')
          .eq('seller_id', sellerId)
          .order('metric_date', { ascending: true });

        if (dateFrom) query = query.gte('metric_date', dateFrom);
        if (dateTo) query = query.lte('metric_date', dateTo);

        const data = await fetchAllRows<AdsDailyMetric>(query);
        setMetrics(data);
      } catch (err) {
        console.error('[useAdsDailyMetrics] Error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, [sellerId, dateFrom, dateTo]);

  return { metrics, loading };
}

export function useAdsAlerts(sellerId?: string) {
  const [alerts, setAlerts] = useState<AdsAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAlerts = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const data = await fetchAllRows<AdsAlert>(
        supabase
          .from('ads_alerts')
          .select('*')
          .eq('seller_id', sellerId)
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false })
      );
      setAlerts(data);
    } catch (err) {
      console.error('[useAdsAlerts] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  const dismissAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('ads_alerts')
        .update({ is_dismissed: true })
        .eq('id', alertId);
      if (error) throw error;
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      toast({ title: 'Alerta dispensado' });
    } catch (err) {
      toast({ title: 'Erro ao dispensar alerta', variant: 'destructive' });
    }
  };

  const markAsRead = async (alertId: string) => {
    try {
      await supabase.from('ads_alerts').update({ is_read: true }).eq('id', alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a));
    } catch (err) {
      console.error('[useAdsAlerts] markAsRead error:', err);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // DISABLED: Realtime subscription disabled in static mode
  // Data only updates on manual refresh or page reload
  // useEffect(() => {
  //   if (!sellerId) return;
  //   const channel = supabase
  //     .channel(`ads-alerts-${sellerId}`)
  //     .on('postgres_changes', {
  //       event: 'INSERT',
  //       schema: 'public',
  //       table: 'ads_alerts',
  //       filter: `seller_id=eq.${sellerId}`,
  //     }, () => fetchAlerts())
  //     .subscribe();
  //
  //   return () => { supabase.removeChannel(channel); };
  // }, [sellerId, fetchAlerts]);

  const unreadCount = useMemo(() => alerts.filter(a => !a.is_read).length, [alerts]);

  return { alerts, loading, unreadCount, dismissAlert, markAsRead, refetch: fetchAlerts };
}

export function useAdsSyncState(sellerId?: string) {
  const [syncState, setSyncState] = useState<AdsSyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSyncState = useCallback(async () => {
    if (!sellerId) return;
    try {
      const { data, error } = await supabase
        .from('ads_sync_state')
        .select('*')
        .eq('seller_id', sellerId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setSyncState(data as AdsSyncState);
    } catch (err) {
      console.error('[useAdsSyncState] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  const triggerSync = async () => {
    if (!sellerId) return;
    try {
      toast({ title: 'Sincronização iniciada...' });
      const { error } = await supabase.functions.invoke('ads-sync', {
        body: { seller_id: sellerId },
      });
      if (error) throw error;
      toast({ title: 'Sincronização em andamento' });
      fetchSyncState();
    } catch (err) {
      console.error('[useAdsSyncState] triggerSync error:', err);
      toast({ title: 'Erro ao iniciar sincronização', variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchSyncState();
  }, [fetchSyncState]);

  return { syncState, loading, triggerSync };
}

export function useAdsMetricsSummary(sellerId?: string, dateFrom?: string, dateTo?: string): AdsMetricsSummary {
  // Keep useAdsDailyMetrics call to maintain stable hook order
  useAdsDailyMetrics(sellerId, dateFrom, dateTo);
  const { items } = useAdsItems(sellerId);

  return useMemo(() => {
    const total_spent = items.reduce((sum, i) => sum + (i.spent || 0), 0);
    const total_revenue = items.reduce((sum, i) => sum + (i.revenue_from_ads || 0), 0);
    const total_clicks = items.reduce((sum, i) => sum + (i.clicks || 0), 0);
    const total_impressions = items.reduce((sum, i) => sum + (i.impressions || 0), 0);
    const total_conversions = items.reduce((sum, i) => sum + (i.conversions || 0), 0);

    const avg_acos = total_revenue > 0 ? (total_spent / total_revenue) * 100 : 0;
    const avg_roas = total_spent > 0 ? total_revenue / total_spent : 0;

    // Products at loss (ACOS > 30%)
    const products_at_loss = items.filter(i => (i.acos || 0) > 0.30).length;
    // Products scalable (ROAS > 3)
    const products_scalable = items.filter(i => (i.roas || 0) > 3).length;

    return {
      total_spent,
      total_revenue,
      total_clicks,
      total_impressions,
      total_conversions,
      avg_acos,
      avg_roas,
      products_at_loss,
      products_scalable,
    };
  }, [items]);
}

// Enrich items with promotion and margin data
export function useEnrichedAdsItems(sellerId?: string, filters?: AdsFilterState) {
  const { items, loading } = useAdsItems(sellerId, filters);
  const [enrichedItems, setEnrichedItems] = useState<EnrichedAdsItem[]>([]);

  useEffect(() => {
    // For now, compute situation based on ACOS/ROAS
    const enriched: EnrichedAdsItem[] = items.map(item => {
      let situation: 'scale' | 'maintain' | 'adjust' | 'pause' = 'maintain';
      
      if ((item.roas || 0) > 3 && item.conversions > 0) {
        situation = 'scale';
      } else if ((item.acos || 0) > 0.40) {
        situation = 'pause';
      } else if ((item.acos || 0) > 0.25) {
        situation = 'adjust';
      }

      return {
        ...item,
        situation,
        is_in_promotion: false, // TODO: cross with promotions
        margin_percent: undefined, // TODO: cross with costs
      };
    });

    setEnrichedItems(enriched);
  }, [items]);

  return { items: enrichedItems, loading };
}
