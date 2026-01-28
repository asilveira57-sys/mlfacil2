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
  // CRITICAL: Only refetch on actual session changes, NOT on TOKEN_REFRESHED
  // TOKEN_REFRESHED fires when tab regains focus if token is near expiry
  useEffect(() => {
    fetchStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Only react to actual sign-in/out events, not token refresh
      if (event === 'SIGNED_IN') {
        fetchStatus();
      } else if (event === 'SIGNED_OUT') {
        setStatus(null);
        setIsAuthenticated(false);
      }
      // TOKEN_REFRESHED is intentionally ignored to prevent tab-switch flickering
    });

    return () => subscription.unsubscribe();
  }, [fetchStatus]);

  // Select a plan
  const selectPlan = useCallback(async (planId: string): Promise<boolean> => {
    try {
      const { data, error: rpcError } = await supabase.rpc('select_plan', {
        p_plan_id: planId,
      });

      if (rpcError) throw new Error(rpcError.message);

      const result = data as unknown as { success: boolean; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao selecionar plano');
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
  };
}
