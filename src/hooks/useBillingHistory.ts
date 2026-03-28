import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PaymentRecord {
  id: string;
  tenant_id: string;
  provider: string;
  payment_id: string;
  external_reference: string | null;
  amount_brl: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export interface EntitlementRecord {
  id: string;
  tenant_id: string;
  entitlement_type: string;
  tier_id: string | null;
  status: string;
  current_period_start: string;
  current_period_end: string;
  source: string;
  last_payment_id: string | null;
  created_at: string;
  tier_name?: string;
}

export function useBillingHistory() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get tenant_id from tenant_members
        const { data: membership } = await supabase
          .from('tenant_members')
          .select('tenant_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        const tenantId = membership?.tenant_id;
        if (!tenantId) {
          setLoading(false);
          return;
        }

        // Fetch payments
        const { data: paymentsData } = await supabase
          .from('tenant_payments')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });

        if (paymentsData) {
          setPayments(paymentsData as unknown as PaymentRecord[]);
        }

        // Fetch entitlements with tier name
        const { data: entData } = await supabase
          .from('tenant_entitlements')
          .select('*, plan_tiers(name)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });

        if (entData) {
          setEntitlements(
            (entData as any[]).map((e) => ({
              ...e,
              tier_name: e.plan_tiers?.name || null,
            }))
          );
        }
      } catch (err) {
        console.error('[useBillingHistory] Error:', err);
        setError(err instanceof Error ? err.message : 'Erro ao carregar histórico');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return { payments, entitlements, loading, error };
}
