import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getAllAccounts, UnifiedMarketplaceAccount, ConnectionStatus } from '@/lib/accountUnification';
import { refreshAccountToken } from '@/lib/mlTokenRefresh';

// Account from ml_accounts (source of truth via accountUnification)
export interface ActiveAccount {
  id: string;
  sellerId: string;
  nickname: string | null;
  email: string | null;
  isActive: boolean;
  provider: 'mercadolivre';
  status: ConnectionStatus;
  companyId: string | null;
  /** True when this account is accessed via company membership (collaborator). */
  isInherited?: boolean;
  // Extended tracking
  lastApiOkAt?: string;
  lastApiErrorCode?: string;
  consecutiveFailures?: number;
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
  // Guard to prevent repeated persist calls with the same value
  const lastPersistedRef = useRef<{userId: string; accountId: string} | null>(null);
  
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
      companyId: acc.companyId ?? null,
      isInherited: acc.isInherited ?? false,
      lastApiOkAt: acc.lastApiOkAt,
      lastApiErrorCode: acc.lastApiErrorCode,
      consecutiveFailures: acc.consecutiveFailures,
    }));
  }, []);

  // Get persisted active account from user_context or localStorage
  const getPersistedActiveAccountId = useCallback(async (userId: string): Promise<string | null> => {
    // Try user_context first
    const { data: context, error } = await supabase
      .from('user_context')
      .select('active_marketplace_account_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[CTX] user_context lookup error (ignored)', error.message);
    }

    if (context?.active_marketplace_account_id) {
      return context.active_marketplace_account_id;
    }

    // Fallback to localStorage (for compatibility)
    return localStorage.getItem('active_account_id');
  }, []);

  // Persist active account - uses ref to avoid dependency on accounts state
  // NOTE: Silently ignores DB errors since localStorage is the primary fast-path.
  // GUARD: Only persists when the (userId, accountId) pair actually changes.
  const persistActiveAccount = useCallback(async (userId: string, accountId: string, accountsList?: ActiveAccount[]): Promise<void> => {
    // Guard: skip if already persisted the same pair
    const lastPersisted = lastPersistedRef.current;
    if (lastPersisted?.userId === userId && lastPersisted?.accountId === accountId) {
      return; // Already persisted, no-op
    }
    
    // Mark as persisted BEFORE triggering the request to prevent re-entry
    lastPersistedRef.current = { userId, accountId };
    
    const currentAccounts = accountsList || accountsRef.current;
    const account = currentAccounts.find(a => a.id === accountId);
    
    // Save to localStorage for immediate access (primary fast-path)
    localStorage.setItem('active_account_id', accountId);
    localStorage.setItem('active_seller_id', account?.sellerId || '');

    // Best-effort save to user_context in database (non-blocking, fire-and-forget)
    // FK now references ml_accounts so this should succeed.
    supabase
      .from('user_context')
      .upsert(
        {
          user_id: userId,
          active_marketplace_account_id: accountId,
          active_company_id: account?.companyId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .then(({ error }) => {
        if (error) {
          // Clear the ref to allow retry on next account switch if DB failed
          if (lastPersistedRef.current?.accountId === accountId) {
            lastPersistedRef.current = null;
          }
          if (import.meta.env.DEV) {
            console.warn('[ActiveAccountContext] user_context upsert failed (non-blocking):', error.message);
          }
        }
      });
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info('[MOUNT] ActiveAccountProvider');
    return () => {
      // eslint-disable-next-line no-console
      console.info('[UNMOUNT] ActiveAccountProvider');
    };
  }, []);

  const prevStateRef = useRef({
    activeAccountId: null as string | null,
    sellerId: null as string | null,
    loading,
    initialized,
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const next = {
      activeAccountId: activeAccount?.id || null,
      sellerId: activeAccount?.sellerId || null,
      loading,
      initialized,
    };

    const prev = prevStateRef.current;
    if (
      prev.activeAccountId !== next.activeAccountId ||
      prev.sellerId !== next.sellerId ||
      prev.loading !== next.loading ||
      prev.initialized !== next.initialized
    ) {
      // eslint-disable-next-line no-console
      console.info('[CTX] ActiveAccountContext changed', { prev, next });
      console.log('[AUTH_LOADING_CHANGED]', next.loading);
      prevStateRef.current = next;
    }
  }, [activeAccount?.id, activeAccount?.sellerId, loading, initialized]);

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

      // Resolve the user's active company (used to prefer the inherited
      // company ML account over personal ones for collaborators).
      let activeCompanyId: string | null = null;
      try {
        const { data: ctx } = await supabase
          .from('user_context')
          .select('active_company_id')
          .eq('user_id', user.id)
          .maybeSingle();
        activeCompanyId = (ctx as any)?.active_company_id ?? null;
      } catch { /* ignore */ }

      const isUsable = (a: ActiveAccount) => a.status === 'connected' || a.status === 'attention';

      // 1) Persisted choice, if still usable
      let active = loadedAccounts.find(a => a.id === persistedId && isUsable(a));

      // 2) Inherited account of the active company (collaborator path)
      if (!active && activeCompanyId) {
        active = loadedAccounts.find(a => a.companyId === activeCompanyId && isUsable(a));
      }

      // 3) Any usable account, preferring inherited (company) over personal
      if (!active) {
        active = loadedAccounts.find(a => (a as any).isInherited && isUsable(a))
          || loadedAccounts.find(isUsable);
      }

      // 4) Fallback: first account at all
      if (!active && loadedAccounts.length > 0) {
        active = loadedAccounts[0];
      }

      if (active) {
        setActiveAccountState(active);
        await persistActiveAccount(user.id, active.id, loadedAccounts);
        
        // Also update localStorage for legacy code
        localStorage.setItem('cost_watchdog_seller_id', active.sellerId);

        // Proactive token refresh: if the active account has an expired token,
        // trigger a background refresh immediately so the user doesn't see "attention" for minutes
        if (active.status === 'attention') {
          console.info('[ActiveAccountContext] Token expired for active account, refreshing proactively...');
          refreshAccountToken(active.id).then(async (result) => {
            if (result.success) {
              console.info('[ActiveAccountContext] Proactive token refresh succeeded');
              // Reload accounts to update status to 'connected'
              const refreshedAccounts = await loadAccounts();
              setAccounts(refreshedAccounts);
              accountsRef.current = refreshedAccounts;
              const refreshedActive = refreshedAccounts.find(a => a.id === active.id);
              if (refreshedActive) {
                setActiveAccountState(refreshedActive);
              }
            } else {
              console.warn('[ActiveAccountContext] Proactive token refresh failed:', result.error);
            }
          }).catch((err) => {
            console.error('[ActiveAccountContext] Proactive refresh error:', err);
          });
        }
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
      // Re-initialize only after a real post-logout login. Ignore tab-return SIGNED_IN
      // events when the account context is already initialized to avoid global reload.
      if (event === 'SIGNED_IN' && !initialized && !initializingRef.current) {
        initialize();
      } else if (event === 'SIGNED_OUT') {
        setAccounts([]);
        setActiveAccountState(null);
        accountsRef.current = [];
        lastPersistedRef.current = null; // Clear persist guard on sign out
        localStorage.removeItem('active_account_id');
        localStorage.removeItem('active_seller_id');
        setInitialized(false);
      }
      // Ignore: TOKEN_REFRESHED, INITIAL_SESSION
    });

    return () => subscription.unsubscribe();
  }, [initialize, initialized]);

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
