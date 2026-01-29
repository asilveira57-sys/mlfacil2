import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TrackedListing {
  id: string;
  competitor_item_id: string;
  marketplace: string;
  competitor_name: string;
  competitor_link: string;
  title: string | null;
  thumbnail: string | null;
  current_price: number | null;
  original_price: number | null;
  listing_type: string | null;
  condition: string | null;
  shipping_free: boolean;
  shipping_full: boolean;
  is_available: boolean;
  status: 'active' | 'paused';
  min_price: number | null;
  max_price: number | null;
  reaction_type: 'monitor' | 'suggest' | 'auto';
  adjustment_value: number;
  my_item_id: string | null;
  last_check_at: string | null;
  last_price_change_at: string | null;
  check_count: number;
  price_change_count: number;
  error_message: string | null;
  created_at: string;
}

export interface PriceHistory {
  id: string;
  price: number;
  original_price: number | null;
  price_delta: number | null;
  price_delta_percent: number | null;
  is_available: boolean;
  listing_type: string | null;
  recorded_at: string;
}

export interface TrackingAlert {
  id: string;
  tracked_listing_id: string | null;
  alert_type: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message_pt: string;
  data_json: any;
  is_read: boolean;
  is_dismissed: boolean;
  suggested_action: string | null;
  suggested_price: number | null;
  created_at: string;
}

export interface TrackingOverview {
  total_tracked: number;
  active_count: number;
  paused_count: number;
  alerts_count: number;
  recent_price_changes: number;
}

export function useCompetitorTracking(sellerId: string) {
  const [listings, setListings] = useState<TrackedListing[]>([]);
  const [alerts, setAlerts] = useState<TrackingAlert[]>([]);
  const [overview, setOverview] = useState<TrackingOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  };

  const fetchListings = useCallback(async (status: string = 'active') => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/list?seller_id=${sellerId}&status=${status}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setListings(data.listings || []);
    } catch (error: any) {
      console.error('Error fetching listings:', error);
      toast.error('Erro ao carregar concorrentes monitorados');
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  const fetchAlerts = useCallback(async () => {
    if (!sellerId) return;
    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/alerts?seller_id=${sellerId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setAlerts(data.alerts || []);
    } catch (error: any) {
      console.error('Error fetching alerts:', error);
    }
  }, [sellerId]);

  const fetchOverview = useCallback(async () => {
    if (!sellerId) return;
    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/overview?seller_id=${sellerId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setOverview(data);
    } catch (error: any) {
      console.error('Error fetching overview:', error);
    }
  }, [sellerId]);

  const addTrackedListing = useCallback(async (data: {
    competitor_link: string;
    competitor_name: string;
    min_price?: number;
    max_price?: number;
    reaction_type?: string;
    adjustment_value?: number;
    my_item_id?: string;
  }) => {
    const session = await getSession();
    if (!session) return null;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/add`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seller_id: sellerId, ...data }),
      }
    );

    const result = await response.json();
    if (result.error) {
      toast.error(result.error);
      return null;
    }

    toast.success('Concorrente adicionado com sucesso');
    await fetchListings();
    await fetchOverview();
    return result;
  }, [sellerId, fetchListings, fetchOverview]);

  const updateListing = useCallback(async (listingId: string, updates: Partial<TrackedListing>) => {
    const session = await getSession();
    if (!session) return;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/update`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seller_id: sellerId, listing_id: listingId, ...updates }),
      }
    );

    const result = await response.json();
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success('Configuração atualizada');
    await fetchListings();
  }, [sellerId, fetchListings]);

  const deleteListing = useCallback(async (listingId: string) => {
    const session = await getSession();
    if (!session) return;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/delete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seller_id: sellerId, listing_id: listingId }),
      }
    );

    const result = await response.json();
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success('Monitoramento removido');
    await fetchListings();
    await fetchOverview();
  }, [sellerId, fetchListings, fetchOverview]);

  const checkListing = useCallback(async (listingId: string) => {
    setRefreshing(listingId);
    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/check`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ seller_id: sellerId, listing_id: listingId }),
        }
      );

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.price_changed) {
        toast.success(`Preço atualizado: R$ ${result.current_price?.toFixed(2)}`);
      } else {
        toast.info('Preço sem alteração');
      }

      await fetchListings();
      await fetchAlerts();
    } finally {
      setRefreshing(null);
    }
  }, [sellerId, fetchListings, fetchAlerts]);

  const fetchPriceHistory = useCallback(async (listingId: string): Promise<PriceHistory[]> => {
    const session = await getSession();
    if (!session) return [];

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/history?seller_id=${sellerId}&listing_id=${listingId}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );

    const data = await response.json();
    return data.history || [];
  }, [sellerId]);

  const dismissAlert = useCallback(async (alertId: string, resolve: boolean = false) => {
    const session = await getSession();
    if (!session) return;

    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/dismiss-alert`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seller_id: sellerId, alert_id: alertId, resolve }),
      }
    );

    setAlerts(prev => prev.filter(a => a.id !== alertId));
    await fetchOverview();
  }, [sellerId, fetchOverview]);

  return {
    listings,
    alerts,
    overview,
    loading,
    refreshing,
    fetchListings,
    fetchAlerts,
    fetchOverview,
    addTrackedListing,
    updateListing,
    deleteListing,
    checkListing,
    fetchPriceHistory,
    dismissAlert,
  };
}
