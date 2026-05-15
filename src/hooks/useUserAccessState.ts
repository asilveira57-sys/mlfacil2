import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { 
  UserStatus, 
  UserStatusResponse, 
  FeatureFlags, 
  UserAccessState,
  SelectedPlan 
} from '@/types/user-access';

interface UseUserAccessStateReturn {
  // Data
  status: UserStatus | null;
  state: UserAccessState | null;
  flags: FeatureFlags | null;
  selectedPlan: SelectedPlan | null;
  
  // Loading states
  loading: boolean;
  error: string | null;
  
  // Actions
  refetch: () => Promise<void>;
  selectPlan: (planId: string) => Promise<boolean>;
  updateOnboarding: (params: {
    status?: 'pending' | 'completed';
    objective?: string[];
    printMode?: string;
    labelSize?: string;
  }) => Promise<boolean>;
  
  // Quick checks
  isAuthenticated: boolean;
  requiresOnboarding: boolean;
  trialActive: boolean;
  trialExpired: boolean;
  requiresPayment: boolean;
  canImportSales: boolean;
  canPrintLabels: boolean;
  mlConnected: boolean;
  mlIsOwner: boolean;
  mlApiAccessAllowed: boolean;
  mlApiAccessReason: string | null;
  mlApiAccessMessage: string | null;
  billingComplete: boolean;
  requiresBilling: boolean;
}

export function useUserAccessState(): UseUserAccessStateReturn {
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Track if initial load completed - after that, refetches are silent (no loading state)
  const initialLoadDoneRef = React.useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      // Only show loading on initial fetch, not on background refetches
      // This prevents the "flash" when switching browser tabs
      if (!initialLoadDoneRef.current) {
        setLoading(true);
      }
      setError(null);

      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setIsAuthenticated(false);
        setStatus(null);
        return;
      }

      setIsAuthenticated(true);

      // Call the combined RPC function
      const { data, error: rpcError } = await supabase.rpc('get_user_status');

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const response = data as unknown as UserStatusResponse;

      if ('error' in response) {
        throw new Error(response.error);
      }

      setStatus(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar estado do usuário';
      console.error('[useUserAccessState] Error:', message);
      setError(message);
    } finally {
      setLoading(false);
      initialLoadDoneRef.current = true;
    }
  }, []);

  // Listen for auth state changes
  // CRITICAL: Only react to sign-out, NOT to SIGNED_IN
  // The initial fetchStatus() already handles the login case
  // Reacting to SIGNED_IN can cause cascade of re-fetches on tab switch
  useEffect(() => {
    fetchStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setStatus(null);
        setIsAuthenticated(false);
        initialLoadDoneRef.current = false;
        // Clear persisted React Query cache to prevent stale data on next login
        try { localStorage.removeItem('mlfacil-rq-cache'); } catch {}
      } else if (event === 'SIGNED_IN' && !initialLoadDoneRef.current) {
        // Clear stale persisted cache from previous sessions — prevents white screen
        // when logging in on a window that still has old cached user/onboarding data
        try {
          localStorage.removeItem('mlfacil-rq-cache');
          localStorage.removeItem('mktp_onboarding_progress');
        } catch {}
        initialLoadDoneRef.current = false;
        // Re-fetch after login so ProtectedRoute sees correct requiresOnboarding
        fetchStatus();
      }
      // TOKEN_REFRESHED is intentionally ignored to avoid tab-switch cascades
    });

    return () => subscription.unsubscribe();
  }, [fetchStatus]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[ACCESS_LOADING_CHANGED]', loading);
  }, [loading]);

  // Select a plan
  const selectPlan = useCallback(async (planId: string): Promise<boolean> => {
    try {
      const attemptRpcSelect = async (): Promise<{ success: boolean; error?: string }> => {
        const { data, error: rpcError } = await supabase.rpc('select_plan', {
          p_plan_id: planId,
        });

        if (rpcError) return { success: false, error: rpcError.message };

        const result = data as unknown as { success?: boolean; error?: string };
        if (!result?.success) {
          return { success: false, error: result?.error || 'Erro ao selecionar plano' };
        }

        return { success: true };
      };

      let rpcResult = await attemptRpcSelect();

      // Sessões recém-confirmadas podem falhar no primeiro call; tenta renovar e repetir.
      if (!rpcResult.success && rpcResult.error === 'not_authenticated') {
        await supabase.auth.refreshSession();
        rpcResult = await attemptRpcSelect();
      }

      if (!rpcResult.success) {
        // Fallback resiliente: valida plano e grava selected_plan_id direto no estado do usuário.
        const { data: planRow, error: planError } = await supabase
          .from('plans_v2')
          .select('id')
          .eq('id', planId)
          .eq('is_active', true)
          .maybeSingle();

        if (planError) throw new Error(planError.message);
        if (!planRow) throw new Error(rpcResult.error || 'plan_not_found');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('not_authenticated');

        const { error: upsertError } = await supabase
          .from('user_access_state')
          .upsert(
            {
              user_id: user.id,
              selected_plan_id: planId,
            },
            { onConflict: 'user_id' }
          );

        if (upsertError) throw new Error(upsertError.message);
      }

      // Refetch to get updated state
      await fetchStatus();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao selecionar plano';
      console.error('[useUserAccessState] selectPlan error:', message);
      setError(message);
      return false;
    }
  }, [fetchStatus]);

  // Update onboarding state
  const updateOnboarding = useCallback(async (params: {
    status?: 'pending' | 'completed';
    objective?: string[];
    printMode?: string;
    labelSize?: string;
  }): Promise<boolean> => {
    try {
      const { error: rpcError } = await supabase.rpc('update_onboarding_state', {
        p_status: params.status || null,
        p_objective: params.objective || null,
        p_print_mode: params.printMode || null,
        p_label_size: params.labelSize || null,
      });

      if (rpcError) throw new Error(rpcError.message);

      // Refetch to get updated state
      await fetchStatus();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar onboarding';
      console.error('[useUserAccessState] updateOnboarding error:', message);
      setError(message);
      return false;
    }
  }, [fetchStatus]);

  // Derived values
  const state = status?.state || null;
  const flags = status?.feature_flags || null;
  const selectedPlan = status?.selected_plan || null;

  return {
    // Data
    status,
    state,
    flags,
    selectedPlan,
    
    // Loading states
    loading,
    error,
    
    // Actions
    refetch: fetchStatus,
    selectPlan,
    updateOnboarding,
    
    // Quick checks (with safe defaults)
    isAuthenticated,
    requiresOnboarding: flags?.requires_onboarding ?? false,
    trialActive: flags?.trial_active ?? false,
    trialExpired: flags?.trial_expired ?? false,
    requiresPayment: flags?.requires_payment ?? false,
    canImportSales: flags?.can_import_sales ?? false,
    canPrintLabels: flags?.can_print_labels ?? false,
    mlConnected: flags?.ml_connected ?? false,
    mlIsOwner: flags?.ml_is_owner ?? false,
    mlApiAccessAllowed: flags?.ml_api_access_allowed ?? false,
    mlApiAccessReason: flags?.ml_api_access_reason ?? null,
    mlApiAccessMessage: flags?.ml_api_access_message ?? null,
    billingComplete: (flags as any)?.billing_complete ?? false,
    requiresBilling: (flags as any)?.requires_billing ?? false,
  };
}
