import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

type SnapshotType = 'initial' | 'ads' | 'promo' | 'periodic';

interface CreateSnapshotParams {
  snapshotType: SnapshotType;
  periodDays?: number;
  companyId?: string | null;
  sellerId?: string | null;
}

/**
 * Hook to create immutable journey snapshots for the seller.
 * Fire-and-forget: errors are logged but never break the caller.
 */
export function useJourneySnapshot() {
  const createSnapshot = useCallback(async (params: CreateSnapshotParams) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.functions.invoke('seller-journey-snapshot', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          user_id: user.id,
          company_id: params.companyId || null,
          seller_id: params.sellerId || null,
          snapshot_type: params.snapshotType,
          period_days: params.periodDays || 0,
        },
      });

      console.info(`[JourneySnapshot] ${params.snapshotType} (${params.periodDays || 0}d) created`);
    } catch (err) {
      console.warn('[JourneySnapshot] Failed:', err);
    }
  }, []);

  const logJourneyEvent = useCallback(async (
    eventType: string,
    eventData: Record<string, unknown> = {},
    companyId?: string | null,
    sellerId?: string | null,
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await (supabase as any).from('seller_journey_logs').insert({
        user_id: user.id,
        company_id: companyId || null,
        seller_id: sellerId || null,
        event_type: eventType,
        event_data: {
          ...eventData,
          timestamp: new Date().toISOString(),
        },
      });

      console.info(`[JourneyLog] ${eventType}`);
    } catch (err) {
      console.warn('[JourneyLog] Failed:', err);
    }
  }, []);

  return { createSnapshot, logJourneyEvent };
}
