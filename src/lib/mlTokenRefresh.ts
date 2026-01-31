/**
 * ML Token Refresh System
 * 
 * Centralizes token refresh logic for multi-account support.
 * Each account maintains its own independent tokens.
 */

import { supabase } from '@/integrations/supabase/client';

export type ConnectionStatus = 'connected' | 'attention' | 'disconnected' | 'revoked';

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  newStatus?: ConnectionStatus;
  error?: string;
}

/**
 * Check if a token is expired or about to expire (within 5 minutes).
 */
export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const expiryDate = new Date(expiresAt);
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return expiryDate < fiveMinutesFromNow;
}

/**
 * Check if a token needs refresh but isn't fully expired yet.
 */
export function tokenNeedsRefresh(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const expiryDate = new Date(expiresAt);
  const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
  return expiryDate < thirtyMinutesFromNow;
}

/**
 * Get account by ID with token details.
 */
export async function getAccountWithTokens(accountId: string): Promise<{
  id: string;
  sellerId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  connectionStatus: ConnectionStatus;
} | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account, error } = await supabase
    .from('ml_accounts')
    .select('id, ml_user_id, access_token, refresh_token, token_expires_at, connection_status')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (error || !account) {
    console.error('[mlTokenRefresh] Failed to get account:', error);
    return null;
  }

  return {
    id: account.id,
    sellerId: account.ml_user_id,
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    expiresAt: account.token_expires_at,
    connectionStatus: (account.connection_status as ConnectionStatus) || 'connected',
  };
}

/**
 * Refresh token for a specific account via Edge Function.
 * This keeps the refresh logic server-side for security.
 */
export async function refreshAccountToken(accountId: string): Promise<TokenRefreshResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'No session' };
    }

    const { data, error } = await supabase.functions.invoke('ml-token-refresh', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { accountId },
    });

    if (error) {
      console.error('[mlTokenRefresh] Refresh failed:', error);
      return { 
        success: false, 
        error: error.message,
        newStatus: 'attention',
      };
    }

    if (data?.success) {
      return { 
        success: true, 
        accessToken: data.accessToken,
        newStatus: 'connected',
      };
    }

    // Handle specific error codes
    if (data?.error_code === 'invalid_grant' || data?.error_code === 'revoked') {
      return {
        success: false,
        error: 'Token revoked by user',
        newStatus: 'revoked',
      };
    }

    return { 
      success: false, 
      error: data?.error || 'Unknown error',
      newStatus: 'attention',
    };
  } catch (err) {
    console.error('[mlTokenRefresh] Error:', err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error',
      newStatus: 'attention',
    };
  }
}

/**
 * Get a valid access token for an account, refreshing if needed.
 * This is the main function to use before making ML API calls.
 */
export async function getValidAccessToken(accountId: string): Promise<{
  token: string | null;
  needsReconnect: boolean;
  error?: string;
}> {
  const account = await getAccountWithTokens(accountId);
  
  if (!account) {
    return { token: null, needsReconnect: true, error: 'Account not found' };
  }

  if (account.connectionStatus === 'revoked' || account.connectionStatus === 'disconnected') {
    return { token: null, needsReconnect: true, error: 'Account disconnected' };
  }

  // Check if token is still valid
  if (!isTokenExpired(account.expiresAt)) {
    return { token: account.accessToken, needsReconnect: false };
  }

  // Token expired, try to refresh
  console.log('[mlTokenRefresh] Token expired, refreshing for account:', accountId);
  const refreshResult = await refreshAccountToken(accountId);

  if (refreshResult.success && refreshResult.accessToken) {
    return { token: refreshResult.accessToken, needsReconnect: false };
  }

  // Refresh failed
  if (refreshResult.newStatus === 'revoked') {
    return { token: null, needsReconnect: true, error: 'Token revoked, please reconnect' };
  }

  return { token: null, needsReconnect: true, error: refreshResult.error };
}

/**
 * Update account status after an API call.
 * Call this after successful or failed ML API calls to track health.
 */
export async function updateAccountHealth(
  accountId: string, 
  success: boolean,
  errorCode?: string
): Promise<void> {
  const now = new Date().toISOString();

  if (success) {
    // Reset failures on success
    await supabase
      .from('ml_accounts')
      .update({
        connection_status: 'connected',
        last_api_ok_at: now,
        last_api_error_code: null,
        last_api_error_at: null,
        consecutive_failures: 0,
        updated_at: now,
      })
      .eq('id', accountId);
  } else {
    // Determine new status based on error
    let newStatus: ConnectionStatus = 'attention';
    
    if (errorCode === 'invalid_grant' || errorCode === 'unauthorized' || errorCode === '401') {
      // Try refresh first before marking as revoked
      const refreshResult = await refreshAccountToken(accountId);
      if (!refreshResult.success) {
        newStatus = refreshResult.newStatus || 'attention';
      } else {
        // Refresh succeeded, just update last error
        await supabase
          .from('ml_accounts')
          .update({
            connection_status: 'connected',
            last_api_error_code: errorCode,
            last_api_error_at: now,
            updated_at: now,
          })
          .eq('id', accountId);
        return;
      }
    }

    // Increment failure count
    const { data: current } = await supabase
      .from('ml_accounts')
      .select('consecutive_failures')
      .eq('id', accountId)
      .single();

    const failures = (current?.consecutive_failures || 0) + 1;

    // After 5 consecutive failures, mark as disconnected
    if (failures >= 5 && newStatus !== 'revoked') {
      newStatus = 'disconnected';
    }

    await supabase
      .from('ml_accounts')
      .update({
        connection_status: newStatus,
        last_api_error_code: errorCode || 'unknown',
        last_api_error_at: now,
        consecutive_failures: failures,
        updated_at: now,
      })
      .eq('id', accountId);
  }
}
