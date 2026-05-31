/**
 * useMLConnectionState
 *
 * Pure observer hook for ML connection status on the dashboard.
 *
 * States: FIRST_CONNECTION | RECONNECTING | CONNECTED | RECONNECT_REQUIRED
 *
 * IMPORTANT: This hook does NOT trigger token refreshes anymore. The proactive
 * refresh lives in ActiveAccountContext (one attempt per session per account,
 * guarded against concurrent calls). The dashboard simply reflects the current
 * connection state, which prevents the "Restaurando sua conexão" screen from
 * reappearing on every navigation.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { supabase } from '@/integrations/supabase/client';

export type MLConnectionState =
  | 'FIRST_CONNECTION'
  | 'RECONNECTING'
  | 'CONNECTED'
  | 'RECONNECT_REQUIRED';

export interface MLConnectionInfo {
  state: MLConnectionState | null; // null = still loading
  accountId: string | null;
  sellerId: string | null;
  nickname: string | null;
  email: string | null;
  lastApiOkAt?: string;
}

async function logConnectionEvent(
  eventType: string,
  userId: string | null,
  meta?: Record<string, unknown>
) {
  if (!userId) return;
  try {
    await supabase.from('account_events').insert([{
      user_id: userId,
      event_type: eventType,
      module: 'dashboard',
      event_scope: 'connection_state',
      event_source: 'frontend',
      event_date: new Date().toISOString(),
      event_data: (meta || {}) as any,
    }]);
  } catch (_) {
    // fail-safe
  }
}

export function useMLConnectionState(): MLConnectionInfo {
  const { activeAccount, accounts, loading, initialized, isRefreshingToken } = useActiveAccount();
  const prevStateRef = useRef<MLConnectionState | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Get userId once for telemetry
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id || null;
    });
  }, []);

  const state: MLConnectionState | null = useMemo(() => {
    if (!initialized || loading) return null;

    if (accounts.length === 0) return 'FIRST_CONNECTION';

    if (activeAccount?.status === 'connected') return 'CONNECTED';

    // While the context is proactively refreshing a token, show RECONNECTING.
    if (isRefreshingToken) return 'RECONNECTING';

    if (activeAccount?.status === 'attention'
        || activeAccount?.status === 'disconnected'
        || activeAccount?.status === 'revoked') {
      return 'RECONNECT_REQUIRED';
    }

    // Accounts exist but no active account selected
    if (accounts.length > 0 && !activeAccount) {
      return accounts.some(a => a.status === 'connected')
        ? 'CONNECTED'
        : 'RECONNECT_REQUIRED';
    }

    return null;
  }, [initialized, loading, accounts, activeAccount, isRefreshingToken]);

  // Log state transitions (telemetry only — never trigger side effects on the connection)
  useEffect(() => {
    if (state && state !== prevStateRef.current) {
      const eventMap: Record<MLConnectionState, string> = {
        FIRST_CONNECTION: 'dashboard_connection_state_first_connection',
        RECONNECTING: 'dashboard_connection_state_validating',
        CONNECTED: 'dashboard_connection_state_connected',
        RECONNECT_REQUIRED: 'dashboard_connection_state_reconnect_required',
      };
      console.info(`[MLConnectionState] ${prevStateRef.current} → ${state}`);
      logConnectionEvent(eventMap[state], userIdRef.current, {
        accountId: activeAccount?.id,
        sellerId: activeAccount?.sellerId,
        previousState: prevStateRef.current,
      });
      prevStateRef.current = state;
    }
  }, [state, activeAccount?.id, activeAccount?.sellerId]);

  return {
    state,
    accountId: activeAccount?.id || null,
    sellerId: activeAccount?.sellerId || null,
    nickname: activeAccount?.nickname || null,
    email: activeAccount?.email || null,
    lastApiOkAt: activeAccount?.lastApiOkAt,
  };
}
