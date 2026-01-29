import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const STORAGE_KEY = 'app_auto_refresh_enabled';

interface RefreshPolicyContextType {
  /**
   * When false (default), the app is in "Static Mode":
   * - No polling (refetchInterval disabled)
   * - No realtime subscriptions
   * - Data only updates on manual refresh or page reload
   */
  autoRefreshEnabled: boolean;
  
  /**
   * Toggle auto-refresh on/off (persisted to localStorage)
   */
  setAutoRefreshEnabled: (enabled: boolean) => void;
  
  /**
   * Trigger a manual refresh of all active queries
   * Also dispatches a global 'manual_refresh' event for non-React Query hooks
   */
  manualRefresh: () => void;
  
  /**
   * Whether a manual refresh is currently in progress
   */
  isRefreshing: boolean;
}

const RefreshPolicyContext = createContext<RefreshPolicyContextType | null>(null);

export function useRefreshPolicy() {
  const context = useContext(RefreshPolicyContext);
  if (!context) {
    throw new Error('useRefreshPolicy must be used within RefreshPolicyProvider');
  }
  return context;
}

interface RefreshPolicyProviderProps {
  children: ReactNode;
}

export function RefreshPolicyProvider({ children }: RefreshPolicyProviderProps) {
  const queryClient = useQueryClient();
  
  // Load initial state from localStorage (default: false = static mode)
  const [autoRefreshEnabled, setAutoRefreshEnabledState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });
  
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Persist to localStorage when changed
  const setAutoRefreshEnabled = useCallback((enabled: boolean) => {
    setAutoRefreshEnabledState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Manual refresh function
  const manualRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    try {
      // Dispatch global event for non-React Query hooks
      window.dispatchEvent(new CustomEvent('manual_refresh'));
      
      // Refetch all active React Query queries
      await queryClient.refetchQueries({ type: 'active' });
    } catch (err) {
      console.error('[RefreshPolicy] Manual refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, isRefreshing]);

  // Listen for manual_refresh events and update isRefreshing state
  useEffect(() => {
    const handleRefresh = () => {
      // This is just for external triggers, the state is already managed in manualRefresh
    };
    
    window.addEventListener('manual_refresh', handleRefresh);
    return () => window.removeEventListener('manual_refresh', handleRefresh);
  }, []);

  const value: RefreshPolicyContextType = {
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    manualRefresh,
    isRefreshing,
  };

  return (
    <RefreshPolicyContext.Provider value={value}>
      {children}
    </RefreshPolicyContext.Provider>
  );
}
