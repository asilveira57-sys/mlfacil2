import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CutoffFlexData {
  enabled: boolean;
  cutoff_type: string | null;
  cutoff_time: string | null;
  zone_summary_first: string | null;
  zone_summary_last: string | null;
  zone_details_count: number;
}

export interface CutoffColectaData {
  enabled: boolean;
  cutoff_time: string | null;
  window_from: string | null;
  window_to: string | null;
  cutoff_calculated: boolean;
}

export interface CutoffAgencyData {
  enabled: boolean;
  cutoff_time: string | null;
  cutoff_source: string | null;
  handling_limit_time: string | null;
}

export interface CutoffMeta {
  status: 'ok' | 'partial' | 'error';
  fetched_at: string | null;
  expires_at: string | null;
  timezone: string;
  message: string | null;
}

export interface CutoffData {
  flex: CutoffFlexData;
  colecta: CutoffColectaData;
  agency: CutoffAgencyData;
  meta: CutoffMeta;
  // Raw cache data for zone details modal
  _raw?: any;
}

interface UseShippingCutoffOptions {
  sellerId: string | null;
  mlUserId: string | null;
  companyId: string | null;
}

const BC_CHANNEL = 'shipping_cutoff_refresh';

export function useShippingCutoff({ sellerId, mlUserId, companyId }: UseShippingCutoffOptions) {
  const [data, setData] = useState<CutoffData | null>(() => {
    // Restore last cached value to avoid loading flash on remount
    try {
      const cached = sessionStorage.getItem(`cutoff_${sellerId}`);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const refreshingRef = useRef(false);

  // BroadcastChannel for cross-tab anti-concurrency
  useEffect(() => {
    try {
      const bc = new BroadcastChannel(BC_CHANNEL);
      bcRef.current = bc;

      bc.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === 'shipping_cutoff_refresh_started' && msg.sellerId === sellerId) {
          setIsRefreshing(true);
        }
        if (msg.type === 'shipping_cutoff_refresh_finished' && msg.sellerId === sellerId) {
          setIsRefreshing(false);
          if (msg.data) {
            setData(msg.data);
            setError(null);
          }
        }
      };

      return () => { bc.close(); bcRef.current = null; };
    } catch {
      // BroadcastChannel not supported
      return;
    }
  }, [sellerId]);

  const fetchCutoff = useCallback(async (forceRefresh = false) => {
    if (!companyId || !sellerId || !mlUserId) return;
    if (refreshingRef.current && forceRefresh) return;

    // Only show full loading spinner if we have NO cached data
    const setter = forceRefresh ? setIsRefreshing : (data ? () => {} : setIsLoading);
    if (!forceRefresh && !data) setIsLoading(true);
    if (forceRefresh) setIsRefreshing(true);
    setError(null);

    if (forceRefresh) {
      refreshingRef.current = true;
      bcRef.current?.postMessage({ type: 'shipping_cutoff_refresh_started', sellerId });
    }

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('meli-shipping-cutoff-get', {
        body: {
          company_id: companyId,
          seller_id: sellerId,
          ml_user_id: mlUserId,
          force_refresh: forceRefresh,
        },
      });

      if (fnError) throw new Error(fnError.message || 'Erro ao buscar hora de corte');

      if (result?.error) {
        if (result.error === 'rate_limited') {
          setError(result.message);
        } else {
          throw new Error(result.error);
        }
        return;
      }

      // Result is already normalized { flex, colecta, meta }
      if (result?.flex || result?.colecta || result?.agency || result?.meta) {
        const parsed: CutoffData = {
          flex: result.flex,
          colecta: result.colecta,
          agency: result.agency || { enabled: false, cutoff_time: null, cutoff_source: null, handling_limit_time: null },
          meta: result.meta,
          _raw: result._raw,
        };
        setData(parsed);
        // Cache in sessionStorage for instant restore on remount
        try { sessionStorage.setItem(`cutoff_${sellerId}`, JSON.stringify(parsed)); } catch {}

        if (forceRefresh) {
          bcRef.current?.postMessage({ type: 'shipping_cutoff_refresh_finished', sellerId, data: parsed });
        }
      }
    } catch (e: any) {
      console.error('[ShippingCutoff] Error:', e);
      setError(e.message || 'Erro inesperado');
    } finally {
      setIsLoading(false);
      if (forceRefresh) {
        setIsRefreshing(false);
        refreshingRef.current = false;
      }
    }
  }, [companyId, sellerId, mlUserId, data]);

  useEffect(() => {
    if (sellerId && mlUserId && companyId) {
      fetchCutoff(false);
    }
  }, [fetchCutoff, sellerId, mlUserId, companyId]);

  const refresh = useCallback(() => fetchCutoff(true), [fetchCutoff]);

  return { data, isLoading, isRefreshing, error, refresh };
}
