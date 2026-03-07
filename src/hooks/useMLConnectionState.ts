/**
 * useMLConnectionState
 * 
 * State machine hook for ML connection status on dashboard.
 * States: FIRST_CONNECTION | RECONNECTING | CONNECTED | RECONNECT_REQUIRED
 * 
 * Prevents premature "Connect" card when account exists but token is being validated.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { refreshAccountToken } from '@/lib/mlTokenRefresh';
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

const MIN_RECONNECTING_MS = 1500; // prevent flicker

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
  const { activeAccount, accounts, loading, initialized, refreshAccounts } = useActiveAccount();
  const [state, setState] = useState<MLConnectionState | null>(null);
  const reconnectingStartRef = useRef<number | null>(null);
  const attemptedRef = useRef(false);
  const prevStateRef = useRef<MLConnectionState | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Get userId once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id || null;
    });
  }, []);

  // Log state transitions
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

  // Main state machine
  const evaluate = useCallback(async () => {
    if (!initialized || loading) return;

    // No accounts at all → first connection
    if (accounts.length === 0) {
      setState('FIRST_CONNECTION');
      return;
    }

    // Has account with connected status → connected
    if (activeAccount && activeAccount.status === 'connected') {
      setState('CONNECTED');
      return;
    }

    // Has account with attention status → try reconnecting
    if (activeAccount && activeAccount.status === 'attention') {
      if (attemptedRef.current) return; // already attempting
      attemptedRef.current = true;
      
      setState('RECONNECTING');
      reconnectingStartRef.current = Date.now();
      
      logConnectionEvent('oauth_revalidation_started', userIdRef.current, {
        accountId: activeAccount.id,
      });

      try {
        const result = await refreshAccountToken(activeAccount.id);
        
        // Ensure minimum display time for RECONNECTING
        const elapsed = Date.now() - (reconnectingStartRef.current || 0);
        if (elapsed < MIN_RECONNECTING_MS) {
          await new Promise(r => setTimeout(r, MIN_RECONNECTING_MS - elapsed));
        }

        if (result.success) {
          logConnectionEvent('oauth_revalidation_success', userIdRef.current, {
            accountId: activeAccount.id,
          });
          await refreshAccounts();
          setState('CONNECTED');
        } else {
          logConnectionEvent('oauth_revalidation_failed', userIdRef.current, {
            accountId: activeAccount.id,
            error: result.error,
            newStatus: result.newStatus,
          });
          setState('RECONNECT_REQUIRED');
        }
      } catch (err: any) {
        logConnectionEvent('oauth_revalidation_failed', userIdRef.current, {
          accountId: activeAccount.id,
          error: err?.message,
        });
        setState('RECONNECT_REQUIRED');
      }
      return;
    }

    // Has account with disconnected/revoked status → reconnect required
    if (activeAccount && (activeAccount.status === 'disconnected' || activeAccount.status === 'revoked')) {
      setState('RECONNECT_REQUIRED');
      return;
    }

    // Accounts exist but no active account selected (edge case)
    if (accounts.length > 0 && !activeAccount) {
      // Check if any account is connected
      const connectedAccount = accounts.find(a => a.status === 'connected');
      if (connectedAccount) {
        setState('CONNECTED');
      } else {
        setState('RECONNECT_REQUIRED');
      }
      return;
    }
  }, [initialized, loading, accounts, activeAccount, refreshAccounts]);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  // Reset attemptedRef when activeAccount changes (e.g., user switches account)
  useEffect(() => {
    attemptedRef.current = false;
  }, [activeAccount?.id]);

  return {
    state,
    accountId: activeAccount?.id || null,
    sellerId: activeAccount?.sellerId || null,
    nickname: activeAccount?.nickname || null,
    email: activeAccount?.email || null,
    lastApiOkAt: activeAccount?.lastApiOkAt,
  };
}
