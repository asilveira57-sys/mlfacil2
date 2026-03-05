import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TenantLimitCheck {
  company_id: string;
  total_sales_30d: number;
  total_revenue_30d: number;
  accounts_count: number;
  plan_max_sales: number;
  plan_name: string | null;
  plan_slug: string | null;
  plan_price_cents: number | null;
  exceeds_limit: boolean;
  usage_percent: number;
  current_period_end: string | null;
  accounts_detail: Array<{
    account_id: string;
    label: string;
    seller_id: string;
    state: string;
    sales_30d: number;
    revenue_30d: number;
  }>;
}

export interface ProrataCalculation {
  current_plan_price_cents?: number;
  new_plan_id: string;
  new_plan_name: string;
  new_plan_price_cents: number;
  days_remaining: number;
  days_total: number;
  credit_cents: number;
  prorata_amount_cents: number;
  charge_cents: number;
}

export function useTenantLimits(companyId?: string) {
  const [limitCheck, setLimitCheck] = useState<TenantLimitCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const checkLimits = useCallback(async () => {
    if (!companyId) return null;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('check_tenant_plan_limit', {
        p_company_id: companyId,
      });
      if (error) throw error;
      const result = data as unknown as TenantLimitCheck;
      setLimitCheck(result);
      return result;
    } catch (err) {
      console.error('[useTenantLimits] Error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    checkLimits();
  }, [checkLimits]);

  const calculateProrata = useCallback(async (newPlanId: string): Promise<ProrataCalculation | null> => {
    if (!companyId) return null;
    try {
      const { data, error } = await supabase.rpc('calculate_prorata_upgrade', {
        p_company_id: companyId,
        p_new_plan_id: newPlanId,
      });
      if (error) throw error;
      return data as unknown as ProrataCalculation;
    } catch (err) {
      console.error('[useTenantLimits] Prorata error:', err);
      toast({ title: 'Erro ao calcular pró-rata', variant: 'destructive' });
      return null;
    }
  }, [companyId, toast]);

  const executeUpgrade = useCallback(async (newPlanId: string) => {
    if (!companyId) return false;
    try {
      const { data, error } = await supabase.rpc('execute_plan_upgrade', {
        p_company_id: companyId,
        p_new_plan_id: newPlanId,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.success) {
        toast({ title: 'Upgrade realizado com sucesso!' });
        await checkLimits();
        return true;
      }
      toast({ title: result?.error || 'Erro no upgrade', variant: 'destructive' });
      return false;
    } catch (err) {
      console.error('[useTenantLimits] Upgrade error:', err);
      toast({ title: 'Erro ao realizar upgrade', variant: 'destructive' });
      return false;
    }
  }, [companyId, toast, checkLimits]);

  const onAccountConnected = useCallback(async (accountId: string) => {
    if (!companyId) return null;
    try {
      const { data, error } = await supabase.rpc('on_account_connected_check_limit', {
        p_company_id: companyId,
        p_account_id: accountId,
      });
      if (error) throw error;
      const result = data as any;
      
      if (result?.status === 'pending_upgrade') {
        toast({
          title: 'Upgrade necessário',
          description: result.message,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Conta ativada com sucesso' });
      }
      
      await checkLimits();
      return result;
    } catch (err) {
      console.error('[useTenantLimits] onAccountConnected error:', err);
      return null;
    }
  }, [companyId, toast, checkLimits]);

  return {
    limitCheck,
    loading,
    checkLimits,
    calculateProrata,
    executeUpgrade,
    onAccountConnected,
    exceedsLimit: limitCheck?.exceeds_limit ?? false,
    usagePercent: limitCheck?.usage_percent ?? 0,
  };
}
