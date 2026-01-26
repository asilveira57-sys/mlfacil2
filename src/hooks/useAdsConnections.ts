import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AdsConnection {
  id: string;
  user_id: string;
  seller_id: string;
  workspace_id: string | null;
  status: 'connected' | 'expired' | 'error' | 'disconnected' | 'pending';
  status_message: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'partial' | 'error' | null;
  last_sync_message: string | null;
  sync_interval_hours: number;
  next_scheduled_sync_at: string | null;
  auto_sync_enabled: boolean;
  ml_account_name: string | null;
  ml_account_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface MlAccount {
  id: string;
  user_id: string;
  ml_user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  nickname: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdsSyncJob {
  id: string;
  connection_id: string;
  job_type: 'full' | 'incremental' | 'campaigns' | 'ad_groups' | 'items' | 'metrics' | 'daily_metrics';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string | null;
  completed_at: string | null;
  total_records: number | null;
  processed_records: number;
  failed_records: number;
  date_from: string | null;
  date_to: string | null;
  error_message: string | null;
  result_summary: Record<string, any> | null;
  retry_count: number;
  created_at: string;
}

export interface AdsSyncLog {
  id: string;
  connection_id: string;
  job_id: string | null;
  seller_id: string;
  log_type: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  success: boolean | null;
  message: string | null;
  details: Record<string, any> | null;
  records_fetched: number | null;
  records_processed: number | null;
  records_created: number | null;
  records_updated: number | null;
  records_failed: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AdsDataFreshness {
  id: string;
  connection_id: string;
  seller_id: string;
  data_type: string;
  last_successful_sync_at: string | null;
  last_sync_attempt_at: string | null;
  consecutive_failures: number;
  is_stale: boolean;
  stale_threshold_hours: number;
  cached_record_count: number | null;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  staleDataWarnings: number;
  pendingJobs: number;
  lastSyncAt: string | null;
}

export function useAdsConnections(sellerId?: string) {
  const [connections, setConnections] = useState<AdsConnection[]>([]);
  const [currentConnection, setCurrentConnection] = useState<AdsConnection | null>(null);
  const [mlAccount, setMlAccount] = useState<MlAccount | null>(null);
  const [syncJobs, setSyncJobs] = useState<AdsSyncJob[]>([]);
  const [syncLogs, setSyncLogs] = useState<AdsSyncLog[]>([]);
  const [freshness, setFreshness] = useState<AdsDataFreshness[]>([]);
  const [stats, setStats] = useState<ConnectionStats>({
    totalConnections: 0,
    activeConnections: 0,
    staleDataWarnings: 0,
    pendingJobs: 0,
    lastSyncAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);

  // Check for existing ml_accounts and auto-link if needed
  const checkAutoLink = useCallback(async (userId: string, targetSellerId: string): Promise<AdsConnection | null> => {
    try {
      setAutoLinking(true);
      
      // First check if ads_connection already exists for this seller
      const { data: existingConnection } = await supabase
        .from('ads_connections')
        .select('*')
        .eq('seller_id', targetSellerId)
        .single();

      if (existingConnection) {
        return existingConnection as unknown as AdsConnection;
      }

      // Check if ml_accounts has this seller
      const { data: mlAccountData } = await supabase
        .from('ml_accounts')
        .select('*')
        .eq('ml_user_id', targetSellerId)
        .eq('is_active', true)
        .single();

      if (!mlAccountData) {
        return null;
      }

      setMlAccount(mlAccountData as unknown as MlAccount);

      // Auto-create ads_connection from ml_accounts
      console.log('[useAdsConnections] Auto-linking ml_account to ads_connections:', targetSellerId);
      
      const { data: newConnection, error } = await supabase
        .from('ads_connections')
        .insert({
          user_id: userId,
          seller_id: targetSellerId,
          status: 'connected',
          status_message: 'Vinculado automaticamente via conta Mercado Livre',
          ml_account_name: mlAccountData.nickname,
          ml_account_email: mlAccountData.email,
          connected_at: new Date().toISOString(),
          auto_sync_enabled: true,
          sync_interval_hours: 6,
          next_scheduled_sync_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[useAdsConnections] Auto-link error:', error);
        return null;
      }

      console.log('[useAdsConnections] Auto-link successful:', newConnection);
      return newConnection as unknown as AdsConnection;
    } catch (err) {
      console.error('[useAdsConnections] Auto-link exception:', err);
      return null;
    } finally {
      setAutoLinking(false);
    }
  }, []);

  // Fetch ml_account for display purposes
  const fetchMlAccount = useCallback(async (targetSellerId: string) => {
    const { data } = await supabase
      .from('ml_accounts')
      .select('*')
      .eq('ml_user_id', targetSellerId)
      .eq('is_active', true)
      .single();

    if (data) {
      setMlAccount(data as unknown as MlAccount);
    }
  }, []);

  // Fetch all connections for the user
  const fetchConnections = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('ads_connections')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[useAdsConnections] Error fetching connections:', error);
      setLoading(false);
      return;
    }

    let typedConnections = (data || []) as unknown as AdsConnection[];

    // If we have a sellerId but no connection, try auto-link
    if (sellerId && !typedConnections.find(c => c.seller_id === sellerId)) {
      const autoLinked = await checkAutoLink(user.id, sellerId);
      if (autoLinked) {
        typedConnections = [autoLinked, ...typedConnections];
      }
    }

    setConnections(typedConnections);

    // Find connection for current seller
    if (sellerId) {
      const current = typedConnections.find(c => c.seller_id === sellerId);
      setCurrentConnection(current || null);
      
      // Also fetch ml_account for display
      await fetchMlAccount(sellerId);
    }

    // Calculate stats
    const active = typedConnections.filter(c => c.status === 'connected').length;
    const lastSync = typedConnections
      .filter(c => c.last_sync_at)
      .sort((a, b) => new Date(b.last_sync_at!).getTime() - new Date(a.last_sync_at!).getTime())[0];

    setStats(prev => ({
      ...prev,
      totalConnections: typedConnections.length,
      activeConnections: active,
      lastSyncAt: lastSync?.last_sync_at || null,
    }));

    setLoading(false);
  }, [sellerId, checkAutoLink, fetchMlAccount]);

  // Fetch sync jobs for current connection
  const fetchSyncJobs = useCallback(async (connectionId: string) => {
    const { data, error } = await supabase
      .from('ads_sync_jobs')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[useAdsConnections] Error fetching sync jobs:', error);
      return;
    }

    const typedJobs = (data || []) as unknown as AdsSyncJob[];
    setSyncJobs(typedJobs);

    const pending = typedJobs.filter(j => j.status === 'pending' || j.status === 'running').length;
    setStats(prev => ({ ...prev, pendingJobs: pending }));
  }, []);

  // Fetch sync logs
  const fetchSyncLogs = useCallback(async (connectionId: string) => {
    const { data, error } = await supabase
      .from('ads_sync_logs')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[useAdsConnections] Error fetching sync logs:', error);
      return;
    }

    setSyncLogs((data || []) as unknown as AdsSyncLog[]);
  }, []);

  // Fetch data freshness
  const fetchFreshness = useCallback(async (connectionId: string) => {
    const { data, error } = await supabase
      .from('ads_data_freshness')
      .select('*')
      .eq('connection_id', connectionId);

    if (error) {
      console.error('[useAdsConnections] Error fetching freshness:', error);
      return;
    }

    const typedFreshness = (data || []) as unknown as AdsDataFreshness[];
    setFreshness(typedFreshness);

    const staleCount = typedFreshness.filter(f => f.is_stale).length;
    setStats(prev => ({ ...prev, staleDataWarnings: staleCount }));
  }, []);

  // Connect account (creates or updates connection)
  const connectAccount = async (accountSellerId: string, accountName?: string, accountEmail?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('ads_connections')
        .upsert({
          user_id: user.id,
          seller_id: accountSellerId,
          status: 'pending',
          status_message: 'Aguardando autorização...',
          ml_account_name: accountName,
          ml_account_email: accountEmail,
          connected_at: new Date().toISOString(),
          next_scheduled_sync_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        }, {
          onConflict: 'user_id,seller_id',
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Conexão iniciada com sucesso');
      await fetchConnections();
      return data as unknown as AdsConnection;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao conectar conta';
      toast.error(message);
      throw err;
    }
  };

  // Update connection status
  const updateConnectionStatus = async (
    connectionId: string, 
    status: AdsConnection['status'], 
    statusMessage?: string
  ) => {
    try {
      const updateData: Partial<AdsConnection> = { status };
      if (statusMessage) updateData.status_message = statusMessage;
      if (status === 'connected') updateData.connected_at = new Date().toISOString();
      if (status === 'disconnected') updateData.disconnected_at = new Date().toISOString();

      const { error } = await supabase
        .from('ads_connections')
        .update(updateData)
        .eq('id', connectionId);

      if (error) throw error;

      await fetchConnections();
      toast.success('Status atualizado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar status';
      toast.error(message);
    }
  };

  // Disconnect account
  const disconnectAccount = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from('ads_connections')
        .update({
          status: 'disconnected',
          status_message: 'Desconectado pelo usuário',
          disconnected_at: new Date().toISOString(),
          auto_sync_enabled: false,
        })
        .eq('id', connectionId);

      if (error) throw error;

      toast.success('Conta desconectada');
      await fetchConnections();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao desconectar';
      toast.error(message);
    }
  };

  // Trigger manual sync
  const triggerSync = async (connectionId: string, jobType: AdsSyncJob['job_type'] = 'full') => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ads-connector-sync', {
        body: {
          connection_id: connectionId,
          job_type: jobType,
          manual: true,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return null;
      }

      toast.success('Sincronização iniciada');
      await fetchSyncJobs(connectionId);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar sincronização';
      toast.error(message);
      return null;
    } finally {
      setSyncing(false);
    }
  };

  // Update sync settings
  const updateSyncSettings = async (connectionId: string, settings: { 
    sync_interval_hours?: number; 
    auto_sync_enabled?: boolean;
  }) => {
    try {
      const updateData: Partial<AdsConnection> = { ...settings };
      
      if (settings.sync_interval_hours && settings.auto_sync_enabled) {
        updateData.next_scheduled_sync_at = new Date(
          Date.now() + settings.sync_interval_hours * 60 * 60 * 1000
        ).toISOString();
      }

      const { error } = await supabase
        .from('ads_connections')
        .update(updateData)
        .eq('id', connectionId);

      if (error) throw error;

      toast.success('Configurações salvas');
      await fetchConnections();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar configurações';
      toast.error(message);
    }
  };

  // Check if data is stale for any type
  const isDataStale = useCallback((dataType: string): boolean => {
    const freshnessItem = freshness.find(f => f.data_type === dataType);
    return freshnessItem?.is_stale || false;
  }, [freshness]);

  // Get last successful sync for a data type
  const getLastSuccessfulSync = useCallback((dataType: string): string | null => {
    const freshnessItem = freshness.find(f => f.data_type === dataType);
    return freshnessItem?.last_successful_sync_at || null;
  }, [freshness]);

  // Initial load
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Load connection details when current connection changes
  useEffect(() => {
    if (currentConnection?.id) {
      fetchSyncJobs(currentConnection.id);
      fetchSyncLogs(currentConnection.id);
      fetchFreshness(currentConnection.id);
    }
  }, [currentConnection?.id, fetchSyncJobs, fetchSyncLogs, fetchFreshness]);

  return {
    // Data
    connections,
    currentConnection,
    mlAccount,
    syncJobs,
    syncLogs,
    freshness,
    stats,
    
    // State
    loading,
    syncing,
    autoLinking,
    
    // Actions
    connectAccount,
    disconnectAccount,
    updateConnectionStatus,
    triggerSync,
    updateSyncSettings,
    
    // Helpers
    isDataStale,
    getLastSuccessfulSync,
    refetch: fetchConnections,
  };
}
