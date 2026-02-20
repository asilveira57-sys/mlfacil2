import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserContext } from '@/hooks/useUserContext';

export interface CutoffData {
  id: string;
  company_id: string;
  seller_id: string;
  date_ref: string;
  flex_enabled: boolean;
  flex_cutoff_type: string | null;
  flex_cutoff_time: string | null;
  flex_zone_summary_first: string | null;
  flex_zone_summary_last: string | null;
  flex_zone_details: Array<{ zone: string; cutoff: string }> | null;
  colecta_enabled: boolean;
  colecta_cutoff_time: string | null;
  colecta_window_from: string | null;
  colecta_window_to: string | null;
  colecta_cutoff_calculated: boolean;
  fetched_at: string;
  expires_at: string;
  status: 'ok' | 'partial' | 'error';
  error_message: string | null;
}

interface UseShippingCutoffOptions {
  sellerId: string | null;
  mlUserId: string | null;
}

export function useShippingCutoff({ sellerId, mlUserId }: UseShippingCutoffOptions) {
  const [data, setData] = useState<CutoffData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { activeCompanyId } = useUserContext();

  const fetchCutoff = useCallback(async (forceRefresh = false) => {
    if (!activeCompanyId || !sellerId || !mlUserId) return;

    const setter = forceRefresh ? setIsRefreshing : setIsLoading;
    setter(true);
    setError(null);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('shipping-cutoff', {
        body: {
          company_id: activeCompanyId,
          seller_id: sellerId,
          ml_user_id: mlUserId,
          force_refresh: forceRefresh,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Erro ao buscar hora de corte');
      }

      if (result?.error) {
        if (result.error === 'rate_limited') {
          setError(result.message);
        } else {
          throw new Error(result.error);
        }
        return;
      }

      if (result?.data) {
        setData(result.data as CutoffData);
      }
    } catch (e: any) {
      console.error('[ShippingCutoff] Error:', e);
      setError(e.message || 'Erro inesperado');
    } finally {
      setter(false);
    }
  }, [activeCompanyId, sellerId, mlUserId]);

  // Auto-fetch on mount
  useEffect(() => {
    if (sellerId && mlUserId && activeCompanyId) {
      fetchCutoff(false);
    }
  }, [fetchCutoff, sellerId, mlUserId, activeCompanyId]);

  const refresh = useCallback(() => fetchCutoff(true), [fetchCutoff]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
}
