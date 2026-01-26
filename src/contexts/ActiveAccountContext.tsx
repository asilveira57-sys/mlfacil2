import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Account from ml_accounts (primary source for now)
export interface ActiveAccount {
  id: string;
  sellerId: string;
  nickname: string | null;
  email: string | null;
  isActive: boolean;
  provider: 'mercadolivre';
  status: 'connected' | 'expired' | 'error' | 'disconnected';
}

interface ActiveAccountContextType {
  // Current active account
  activeAccount: ActiveAccount | null;
  activeAccountId: string | null;
  sellerId: string | null;
  
  // All available accounts
  accounts: ActiveAccount[];
  
  // State
  loading: boolean;
  initialized: boolean;
  
  // Actions
  setActiveAccount: (accountId: string) => Promise<boolean>;
  refreshAccounts: () => Promise<void>;
}

const ActiveAccountContext = createContext<ActiveAccountContextType | null>(null);

export function ActiveAccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<ActiveAccount[]>([]);
  const [activeAccount, setActiveAccountState] = useState<ActiveAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Load accounts from ml_accounts (primary source)
  const loadAccounts = useCallback(async (): Promise<ActiveAccount[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: mlAccounts, error } = await supabase
      .from('ml_accounts')
      .select('id, ml_user_id, nickname, email, is_active')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ActiveAccountContext] Error loading accounts:', error);
      return [];
    }

    return (mlAccounts || []).map(acc => ({
      id: acc.id,
      sellerId: acc.ml_user_id,
      nickname: acc.nickname,
      email: acc.email,
      isActive: acc.is_active,
      provider: 'mercadolivre' as const,
      status: acc.is_active ? 'connected' as const : 'disconnected' as const,
    }));
  }, []);

  // Get persisted active account from user_context or localStorage
  const getPersistedActiveAccountId = useCallback(async (userId: string): Promise<string | null> => {
    // Try user_context first
    const { data: context } = await supabase
      .from('user_context')
      .select('active_marketplace_account_id')
      .eq('user_id', userId)
      .single();

    if (context?.active_marketplace_account_id) {
      return context.active_marketplace_account_id;
    }

    // Fallback to localStorage (for compatibility)
    return localStorage.getItem('active_account_id');
  }, []);

  // Persist active account
  const persistActiveAccount = useCallback(async (userId: string, accountId: string): Promise<void> => {
    // Save to localStorage for immediate access
    localStorage.setItem('active_account_id', accountId);
    localStorage.setItem('active_seller_id', accounts.find(a => a.id === accountId)?.sellerId || '');

    // Save to user_context in database
    try {
      const { data: existingContext } = await supabase
        .from('user_context')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existingContext) {
        await supabase
          .from('user_context')
          .update({ 
            active_marketplace_account_id: accountId,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      } else {
        await supabase
          .from('user_context')
          .insert({
            user_id: userId,
            active_marketplace_account_id: accountId,
          });
      }
    } catch (err) {
      console.error('[ActiveAccountContext] Error persisting context:', err);
    }
  }, [accounts]);

  // Initialize context
  const initialize = useCallback(async () => {
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAccounts([]);
      setActiveAccountState(null);
      setLoading(false);
      setInitialized(true);
      return;
    }

    try {
      const loadedAccounts = await loadAccounts();
      setAccounts(loadedAccounts);

      if (loadedAccounts.length === 0) {
        setActiveAccountState(null);
        setLoading(false);
        setInitialized(true);
        return;
      }

      // Get persisted active account
      const persistedId = await getPersistedActiveAccountId(user.id);
      
      // Find the active account
      let active = loadedAccounts.find(a => a.id === persistedId && a.status === 'connected');
      
      // If not found or not connected, use first connected account
      if (!active) {
        active = loadedAccounts.find(a => a.status === 'connected');
      }
      
      // If still not found, use first account
      if (!active && loadedAccounts.length > 0) {
        active = loadedAccounts[0];
      }

      if (active) {
        setActiveAccountState(active);
        await persistActiveAccount(user.id, active.id);
        
        // Also update localStorage for legacy code
        localStorage.setItem('cost_watchdog_seller_id', active.sellerId);
      }
    } catch (err) {
      console.error('[ActiveAccountContext] Initialize error:', err);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [loadAccounts, getPersistedActiveAccountId, persistActiveAccount]);

  // Set active account (called when user switches)
  const setActiveAccount = useCallback(async (accountId: string): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const account = accounts.find(a => a.id === accountId);
    if (!account) {
      toast.error('Conta não encontrada');
      return false;
    }

    try {
      setActiveAccountState(account);
      await persistActiveAccount(user.id, accountId);
      
      // Update legacy localStorage for watchdogs
      localStorage.setItem('cost_watchdog_seller_id', account.sellerId);
      
      // Dispatch event for legacy code
      window.dispatchEvent(new CustomEvent('active_account_changed', { 
        detail: { accountId, sellerId: account.sellerId } 
      }));

      toast.success(`Conta ativa: ${account.nickname || account.email || account.sellerId}`);
      return true;
    } catch (err) {
      console.error('[ActiveAccountContext] Error setting active account:', err);
      toast.error('Erro ao trocar conta');
      return false;
    }
  }, [accounts, persistActiveAccount]);

  // Refresh accounts
  const refreshAccounts = useCallback(async () => {
    const loadedAccounts = await loadAccounts();
    setAccounts(loadedAccounts);
    
    // Check if active account still exists
    if (activeAccount && !loadedAccounts.find(a => a.id === activeAccount.id)) {
      const firstConnected = loadedAccounts.find(a => a.status === 'connected');
      if (firstConnected) {
        await setActiveAccount(firstConnected.id);
      } else {
        setActiveAccountState(null);
      }
    }
  }, [loadAccounts, activeAccount, setActiveAccount]);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Listen for auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        initialize();
      } else if (event === 'SIGNED_OUT') {
        setAccounts([]);
        setActiveAccountState(null);
        localStorage.removeItem('active_account_id');
        localStorage.removeItem('active_seller_id');
      }
    });

    return () => subscription.unsubscribe();
  }, [initialize]);

  const value: ActiveAccountContextType = {
    activeAccount,
    activeAccountId: activeAccount?.id || null,
    sellerId: activeAccount?.sellerId || null,
    accounts,
    loading,
    initialized,
    setActiveAccount,
    refreshAccounts,
  };

  return (
    <ActiveAccountContext.Provider value={value}>
      {children}
    </ActiveAccountContext.Provider>
  );
}

export function useActiveAccount(): ActiveAccountContextType {
  const context = useContext(ActiveAccountContext);
  if (!context) {
    throw new Error('useActiveAccount must be used within ActiveAccountProvider');
  }
  return context;
}

// Hook for components that need seller ID
export function useActiveSellerId(): string | null {
  const { sellerId } = useActiveAccount();
  return sellerId;
}
