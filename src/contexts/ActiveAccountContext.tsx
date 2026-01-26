import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getAllAccounts, UnifiedMarketplaceAccount } from '@/lib/accountUnification';

// Account from ml_accounts (source of truth via accountUnification)
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
  
  // Use refs to avoid dependency loops
  const accountsRef = useRef<ActiveAccount[]>([]);
  const initializingRef = useRef(false);
  
  // Keep ref in sync
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  // Load accounts from unified source (ml_accounts via accountUnification)
  const loadAccounts = useCallback(async (): Promise<ActiveAccount[]> => {
    const unifiedAccounts = await getAllAccounts();
    
    return unifiedAccounts.map((acc: UnifiedMarketplaceAccount) => ({
      id: acc.id,
      sellerId: acc.sellerId,
      nickname: acc.nickname,
      email: acc.email,
      isActive: acc.isActive,
      provider: acc.provider,
      status: acc.status,
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

  // Persist active account - uses ref to avoid dependency on accounts state
  const persistActiveAccount = useCallback(async (userId: string, accountId: string, accountsList?: ActiveAccount[]): Promise<void> => {
    const currentAccounts = accountsList || accountsRef.current;
    const account = currentAccounts.find(a => a.id === accountId);
    
    // Save to localStorage for immediate access
    localStorage.setItem('active_account_id', accountId);
    localStorage.setItem('active_seller_id', account?.sellerId || '');

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
  }, []);

  // Initialize context - stable function that doesn't change
  const initialize = useCallback(async () => {
    // Prevent double initialization
    if (initializingRef.current) return;
    initializingRef.current = true;
    
    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAccounts([]);
        setActiveAccountState(null);
        setLoading(false);
        setInitialized(true);
        initializingRef.current = false;
        return;
      }

      const loadedAccounts = await loadAccounts();
      setAccounts(loadedAccounts);
      accountsRef.current = loadedAccounts;

      if (loadedAccounts.length === 0) {
        setActiveAccountState(null);
        setLoading(false);
        setInitialized(true);
        initializingRef.current = false;
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
        await persistActiveAccount(user.id, active.id, loadedAccounts);
        
        // Also update localStorage for legacy code
        localStorage.setItem('cost_watchdog_seller_id', active.sellerId);
      }
    } catch (err) {
      console.error('[ActiveAccountContext] Initialize error:', err);
    } finally {
      setLoading(false);
      setInitialized(true);
      initializingRef.current = false;
    }
  }, [loadAccounts, getPersistedActiveAccountId, persistActiveAccount]);

  // Set active account (called when user switches)
  const setActiveAccount = useCallback(async (accountId: string): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const account = accountsRef.current.find(a => a.id === accountId);
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
  }, [persistActiveAccount]);

  // Refresh accounts
  const refreshAccounts = useCallback(async () => {
    const loadedAccounts = await loadAccounts();
    setAccounts(loadedAccounts);
    accountsRef.current = loadedAccounts;
    
    // Check if active account still exists
    const currentActiveId = activeAccount?.id;
    if (currentActiveId && !loadedAccounts.find(a => a.id === currentActiveId)) {
      const firstConnected = loadedAccounts.find(a => a.status === 'connected');
      if (firstConnected) {
        await setActiveAccount(firstConnected.id);
      } else {
        setActiveAccountState(null);
      }
    }
  }, [loadAccounts, activeAccount?.id, setActiveAccount]);

  // Initialize on mount - only once
  useEffect(() => {
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        initializingRef.current = false; // Reset to allow re-initialization
        initialize();
      } else if (event === 'SIGNED_OUT') {
        setAccounts([]);
        setActiveAccountState(null);
        accountsRef.current = [];
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
