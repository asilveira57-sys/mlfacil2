/**
 * Account Unification Layer
 * 
 * Single Source of Truth: ml_accounts
 * 
 * This module provides:
 * 1. Unified account interface across all modules
 * 2. Compatibility layer for legacy tables (marketplace_accounts, ads_connections)
 * 3. Duplicate prevention logic
 * 4. Helper functions for context propagation
 */

import { supabase } from '@/integrations/supabase/client';

// Connection status types
export type ConnectionStatus = 'connected' | 'attention' | 'disconnected' | 'revoked';

// Unified account interface
export interface UnifiedMarketplaceAccount {
  id: string;              // ml_accounts.id
  sellerId: string;        // ml_accounts.ml_user_id
  userId: string;          // ml_accounts.user_id (titular)
  nickname: string | null;
  email: string | null;
  provider: 'mercadolivre';
  status: ConnectionStatus;
  isActive: boolean;
  isConnected: boolean;
  companyId: string | null; // ml_accounts.company_id
  /** True when the account is accessed via company membership (collaborator), not ownership. */
  isInherited?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  // New tracking fields
  connectionStatus: ConnectionStatus;
  lastApiOkAt?: string;
  lastApiErrorCode?: string;
  lastApiErrorAt?: string;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

// Result of account operations
interface AccountOperationResult {
  success: boolean;
  account?: UnifiedMarketplaceAccount;
  error?: string;
  isExisting?: boolean;
}

/**
 * Check if an account already exists for a given seller ID.
 * Prevents duplicate connections across all tables.
 */
export async function checkAccountExists(sellerId: string): Promise<{
  exists: boolean;
  source: 'ml_accounts' | 'marketplace_accounts' | null;
  account?: UnifiedMarketplaceAccount;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { exists: false, source: null };
  }

  // Check ml_accounts (source of truth)
  const { data: mlAccount } = await supabase
    .from('ml_accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('ml_user_id', sellerId)
    .single();

  if (mlAccount) {
    return {
      exists: true,
      source: 'ml_accounts',
      account: mapMlAccountToUnified(mlAccount),
    };
  }

  return { exists: false, source: null };
}

/**
 * Get or create a unified account.
 * Uses ml_accounts as source of truth and ensures no duplicates.
 */
export async function getOrCreateAccount(
  sellerId: string,
  accountData: {
    nickname?: string;
    email?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  }
): Promise<AccountOperationResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'User not authenticated' };
  }

  // Check if already exists
  const existing = await checkAccountExists(sellerId);
  if (existing.exists && existing.account) {
    console.log('[accountUnification] Account already exists:', sellerId);
    
    // Update tokens if provided (reconnection case)
    if (accountData.accessToken) {
      await supabase
        .from('ml_accounts')
        .update({
          access_token: accountData.accessToken,
          refresh_token: accountData.refreshToken || '',
          token_expires_at: accountData.expiresAt || new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.account.id);
      
      existing.account.status = 'connected';
      existing.account.isActive = true;
    }
    
    return { success: true, account: existing.account, isExisting: true };
  }

  // Create new account in ml_accounts (source of truth)
  const { data: newAccount, error } = await supabase
    .from('ml_accounts')
    .insert({
      user_id: user.id,
      ml_user_id: sellerId,
      nickname: accountData.nickname || null,
      email: accountData.email || null,
      access_token: accountData.accessToken || '',
      refresh_token: accountData.refreshToken || '',
      token_expires_at: accountData.expiresAt || new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('[accountUnification] Error creating account:', error);
    return { success: false, error: error.message };
  }

  console.log('[accountUnification] New account created:', newAccount.id);

  return {
    success: true,
    account: mapMlAccountToUnified(newAccount),
    isExisting: false,
  };
}

/**
 * Ensure ADS connection exists for an ml_account.
 * Links ads_connections to the source account.
 */
export async function ensureAdsConnection(
  mlAccountId: string,
  sellerId: string
): Promise<{ connectionId: string | null; isNew: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { connectionId: null, isNew: false };
  }

  // Check if ads_connection already exists
  const { data: existingConnection } = await supabase
    .from('ads_connections')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('user_id', user.id)
    .single();

  if (existingConnection) {
    return { connectionId: existingConnection.id, isNew: false };
  }

  // Get ml_account details for linking
  const { data: mlAccount } = await supabase
    .from('ml_accounts')
    .select('nickname, email')
    .eq('id', mlAccountId)
    .single();

  // Create linked ads_connection
  const { data: newConnection, error } = await supabase
    .from('ads_connections')
    .insert({
      user_id: user.id,
      seller_id: sellerId,
      status: 'connected',
      status_message: 'Vinculado automaticamente via conta Mercado Livre',
      ml_account_name: mlAccount?.nickname,
      ml_account_email: mlAccount?.email,
      connected_at: new Date().toISOString(),
      auto_sync_enabled: true,
      sync_interval_hours: 6,
      next_scheduled_sync_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[accountUnification] Error creating ads_connection:', error);
    return { connectionId: null, isNew: false };
  }

  console.log('[accountUnification] ADS connection linked:', newConnection.id);
  return { connectionId: newConnection.id, isNew: true };
}

/**
 * Get all accounts for current user from source of truth.
 */
export async function getAllAccounts(): Promise<UnifiedMarketplaceAccount[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  // Use the security-definer RPC so collaborators inherit ML accounts from the
  // companies they belong to (without ever exposing tokens to the browser).
  const { data, error } = await supabase.rpc('get_accessible_ml_accounts');

  if (error) {
    console.error('[accountUnification] Error fetching accessible accounts:', error);
    return [];
  }

  return ((data as any[]) || [])
    .map(mapMlAccountToUnified)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Get account by seller ID.
 */
export async function getAccountBySellerId(sellerId: string): Promise<UnifiedMarketplaceAccount | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: mlAccount } = await supabase
    .from('ml_accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('ml_user_id', sellerId)
    .single();

  if (!mlAccount) {
    return null;
  }

  return mapMlAccountToUnified(mlAccount);
}

/**
 * Update account status in source of truth.
 */
export async function updateAccountStatus(
  accountId: string,
  status: ConnectionStatus
): Promise<boolean> {
  const isActive = status === 'connected' || status === 'attention';
  const isConnected = status !== 'disconnected' && status !== 'revoked';

  const { error } = await supabase
    .from('ml_accounts')
    .update({
      is_active: isActive,
      is_connected: isConnected,
      connection_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId);

  if (error) {
    console.error('[accountUnification] Error updating status:', error);
    return false;
  }

  // Also sync status to ads_connections if exists
  const { data: mlAccount } = await supabase
    .from('ml_accounts')
    .select('ml_user_id')
    .eq('id', accountId)
    .single();

  if (mlAccount) {
    await supabase
      .from('ads_connections')
      .update({
        status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('seller_id', mlAccount.ml_user_id);
  }

  return true;
}

/**
 * Map ml_accounts row to unified interface.
 * Uses connection_status as primary source of truth for status.
 */
function mapMlAccountToUnified(row: Record<string, unknown>): UnifiedMarketplaceAccount {
  const isActive = row.is_active as boolean;
  
  // Use connection_status directly if available, otherwise derive from token state
  let connectionStatus = (row.connection_status as ConnectionStatus) || 'disconnected';
  
  // Override based on token state if connection_status says connected but token is expired
  if (connectionStatus === 'connected') {
    const tokenExpiresAt = row.token_expires_at as string | null;
    if (!tokenExpiresAt || new Date(tokenExpiresAt) < new Date()) {
      connectionStatus = 'attention'; // Token expired, needs refresh
    }
  }
  
  // NOTE: We do NOT downgrade status based on is_active flag anymore.
  // is_active only indicates which account is "selected" for the UI, not connection health.
  // connection_status is the single source of truth for connection state.

  return {
    id: row.id as string,
    sellerId: row.ml_user_id as string,
    userId: row.user_id as string,
    nickname: row.nickname as string | null,
    email: row.email as string | null,
    provider: 'mercadolivre',
    status: connectionStatus,
    isActive,
    isConnected: (row.is_connected as boolean) ?? true,
    companyId: (row.company_id as string | null) ?? null,
    accessToken: row.access_token as string | undefined,
    refreshToken: row.refresh_token as string | undefined,
    expiresAt: row.token_expires_at as string | undefined,
    connectionStatus,
    lastApiOkAt: row.last_api_ok_at as string | undefined,
    lastApiErrorCode: row.last_api_error_code as string | undefined,
    lastApiErrorAt: row.last_api_error_at as string | undefined,
    consecutiveFailures: (row.consecutive_failures as number) || 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Validate that a seller ID belongs to the current user.
 * Use this to prevent data leakage between accounts.
 */
export async function validateSellerAccess(sellerId: string): Promise<boolean> {
  const account = await getAccountBySellerId(sellerId);
  // Must be connected AND have valid connection status
  return account !== null 
    && account.isConnected !== false
    && (account.status === 'connected' || account.status === 'attention');
}

/**
 * Get connection ID for a seller in ads_connections.
 * Creates auto-link if needed.
 */
export async function getAdsConnectionId(sellerId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  // Try to get existing
  const { data: connection } = await supabase
    .from('ads_connections')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('user_id', user.id)
    .single();

  if (connection) {
    return connection.id;
  }

  // Check if ml_account exists and create link
  const { data: mlAccount } = await supabase
    .from('ml_accounts')
    .select('id')
    .eq('ml_user_id', sellerId)
    .eq('user_id', user.id)
    .single();

  if (mlAccount) {
    const result = await ensureAdsConnection(mlAccount.id, sellerId);
    return result.connectionId;
  }

  return null;
}
