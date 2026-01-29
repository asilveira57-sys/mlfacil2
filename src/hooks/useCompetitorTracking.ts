import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CompetitorTracker {
  id: string;
  user_id: string;
  seller_id: string;
  marketplace: string;
  competitor_label: string;
  competitor_url: string;
  competitor_external_id: string | null;
  competitor_thumbnail: string | null;
  competitor_title: string | null;
  status: 'ativo' | 'pausado' | 'erro';
  min_price: number | null;
  max_price: number | null;
  reaction_mode: 'monitorar' | 'sugerir' | 'auto_aplicar';
  undercut_amount: number;
  check_interval_minutes: number;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_known_price: number | null;
  last_known_state: 'ativo' | 'indisponivel' | 'desconhecido';
  seller_listing_id: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

export interface CompetitorSnapshot {
  id: string;
  tracker_id: string;
  captured_at: string;
  price: number | null;
  state: string | null;
  source: string;
}

export interface CompetitorEvent {
  id: string;
  tracker_id: string;
  user_id: string;
  event_type: string;
  created_at: string;
  prev_price: number | null;
  new_price: number | null;
  message: string | null;
}

export interface CompetitorPriceAction {
  id: string;
  tracker_id: string;
  user_id: string;
  seller_listing_id: string | null;
  action_type: 'suggested' | 'applied' | 'skipped' | 'rejected';
  reason: string | null;
  competitor_price: number | null;
  proposed_price: number | null;
  applied_price: number | null;
  created_at: string;
}

export interface CompetitorAlert {
  id: string;
  user_id: string;
  seller_id: string;
  tracker_id: string | null;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface TrackingOverview {
  total_tracked: number;
  active_count: number;
  paused_count: number;
  error_count: number;
  alerts_count: number;
  pending_actions: number;
}

export function useCompetitorTracking(sellerId: string) {
  const [trackers, setTrackers] = useState<CompetitorTracker[]>([]);
  const [alerts, setAlerts] = useState<CompetitorAlert[]>([]);
  const [overview, setOverview] = useState<TrackingOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  };

  const fetchTrackers = useCallback(async (status: string = 'ativo') => {
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
      setTrackers(data.trackers || []);
    } catch (error: any) {
      console.error('Error fetching trackers:', error);
      toast.error('Erro ao carregar concorrentes monitorados');
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  const fetchAlerts = useCallback(async (unreadOnly: boolean = true) => {
    if (!sellerId) return;
    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/alerts?seller_id=${sellerId}&unread_only=${unreadOnly}`,
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

  const addTracker = useCallback(async (data: {
    competitor_url: string;
    competitor_label: string;
    marketplace?: string;
    min_price?: number;
    max_price?: number;
    reaction_mode?: string;
    undercut_amount?: number;
    check_interval_minutes?: number;
    seller_listing_id?: string;
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
    await fetchTrackers();
    await fetchOverview();
    return result;
  }, [sellerId, fetchTrackers, fetchOverview]);

  const updateTracker = useCallback(async (trackerId: string, updates: Partial<CompetitorTracker>) => {
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
        body: JSON.stringify({ seller_id: sellerId, tracker_id: trackerId, ...updates }),
      }
    );

    const result = await response.json();
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success('Configuração atualizada');
    await fetchTrackers();
  }, [sellerId, fetchTrackers]);

  const deleteTracker = useCallback(async (trackerId: string) => {
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
        body: JSON.stringify({ seller_id: sellerId, tracker_id: trackerId }),
      }
    );

    const result = await response.json();
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success('Monitoramento removido');
    await fetchTrackers();
    await fetchOverview();
  }, [sellerId, fetchTrackers, fetchOverview]);

  const checkTracker = useCallback(async (trackerId: string) => {
    setRefreshing(trackerId);
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
          body: JSON.stringify({ seller_id: sellerId, tracker_id: trackerId }),
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

      await fetchTrackers();
      await fetchAlerts();
    } finally {
      setRefreshing(null);
    }
  }, [sellerId, fetchTrackers, fetchAlerts]);

  const fetchSnapshots = useCallback(async (trackerId: string): Promise<CompetitorSnapshot[]> => {
    const session = await getSession();
    if (!session) return [];

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/history?seller_id=${sellerId}&tracker_id=${trackerId}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );

    const data = await response.json();
    return data.snapshots || [];
  }, [sellerId]);

  const fetchEvents = useCallback(async (trackerId: string): Promise<CompetitorEvent[]> => {
    const session = await getSession();
    if (!session) return [];

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/events?seller_id=${sellerId}&tracker_id=${trackerId}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );

    const data = await response.json();
    return data.events || [];
  }, [sellerId]);

  const fetchPriceActions = useCallback(async (trackerId?: string): Promise<CompetitorPriceAction[]> => {
    const session = await getSession();
    if (!session) return [];

    let url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/price-actions?seller_id=${sellerId}`;
    if (trackerId) url += `&tracker_id=${trackerId}`;

    const response = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const data = await response.json();
    return data.actions || [];
  }, [sellerId]);

  const dismissAlert = useCallback(async (alertId: string) => {
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
        body: JSON.stringify({ seller_id: sellerId, alert_id: alertId }),
      }
    );

    setAlerts(prev => prev.filter(a => a.id !== alertId));
    await fetchOverview();
  }, [sellerId, fetchOverview]);

  const respondToAction = useCallback(async (actionId: string, responseType: 'accept' | 'reject') => {
    const session = await getSession();
    if (!session) return;

    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-tracking/action-response`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seller_id: sellerId, action_id: actionId, response_type: responseType }),
      }
    );

    toast.success(responseType === 'accept' ? 'Ação aplicada' : 'Ação rejeitada');
    await fetchOverview();
  }, [sellerId, fetchOverview]);

  return {
    trackers,
    alerts,
    overview,
    loading,
    refreshing,
    fetchTrackers,
    fetchAlerts,
    fetchOverview,
    addTracker,
    updateTracker,
    deleteTracker,
    checkTracker,
    fetchSnapshots,
    fetchEvents,
    fetchPriceActions,
    dismissAlert,
    respondToAction,
  };
}
