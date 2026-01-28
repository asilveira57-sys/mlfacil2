import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  ErpIntegration,
  NfseSettings,
  NfseFieldMapping,
  IntegrationSyncRun,
  ServiceOrder,
  ServiceInvoiceQueue,
  ServiceInvoiceEvent,
  ErpProvider,
} from '@/types/erp-integration';

// ========== ERP Integrations ==========

export function useErpIntegrations(companyId?: string) {
  return useQuery({
    queryKey: ['erp-integrations', companyId],
    queryFn: async () => {
      let query = supabase
        .from('erp_integrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ErpIntegration[];
    },
    enabled: !!companyId,
  });
}

export function useErpIntegrationMutations() {
  const queryClient = useQueryClient();

  const upsertIntegration = useMutation({
    mutationFn: async (integration: Partial<ErpIntegration> & { company_id: string; provider: ErpProvider }) => {
      const { data, error } = await supabase
        .from('erp_integrations')
        .upsert({
          ...integration,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'company_id,provider',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-integrations'] });
      toast.success('Integração salva com sucesso');
    },
    onError: (error) => {
      toast.error(`Erro ao salvar integração: ${error.message}`);
    },
  });

  const testConnection = useMutation({
    mutationFn: async ({ integrationId, provider }: { integrationId: string; provider: ErpProvider }) => {
      // Call edge function to test connection
      const { data, error } = await supabase.functions.invoke('erp-test-connection', {
        body: { integration_id: integrationId, provider },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['erp-integrations'] });
      if (data?.success) {
        toast.success('Conexão testada com sucesso!');
      } else {
        toast.error(data?.message || 'Falha no teste de conexão');
      }
    },
    onError: (error) => {
      toast.error(`Erro ao testar conexão: ${error.message}`);
    },
  });

  return { upsertIntegration, testConnection };
}

// ========== NFS-e Settings ==========

export function useNfseSettings(companyId?: string) {
  return useQuery({
    queryKey: ['nfse-settings', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfse_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;
      return data as NfseSettings | null;
    },
    enabled: !!companyId,
  });
}

export function useNfseSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<NfseSettings> & { company_id: string }) => {
      const { data, error } = await supabase
        .from('nfse_settings')
        .upsert({
          ...settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'company_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nfse-settings'] });
      toast.success('Configurações de NFS-e salvas');
    },
    onError: (error) => {
      toast.error(`Erro ao salvar configurações: ${error.message}`);
    },
  });
}

// ========== Field Mappings ==========

export function useNfseFieldMappings(companyId?: string, provider?: ErpProvider) {
  return useQuery({
    queryKey: ['nfse-field-mappings', companyId, provider],
    queryFn: async () => {
      let query = supabase
        .from('nfse_field_mappings')
        .select('*')
        .eq('company_id', companyId);

      if (provider) {
        query = query.eq('provider', provider);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as NfseFieldMapping[];
    },
    enabled: !!companyId,
  });
}

export function useNfseFieldMappingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mappings: Array<Partial<NfseFieldMapping> & { company_id: string; provider: ErpProvider; target_field: string; source_path: string }>) => {
      const { data, error } = await supabase
        .from('nfse_field_mappings')
        .upsert(
          mappings.map(m => ({
            ...m,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'company_id,provider,target_field' }
        )
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nfse-field-mappings'] });
      toast.success('Mapeamentos salvos');
    },
    onError: (error) => {
      toast.error(`Erro ao salvar mapeamentos: ${error.message}`);
    },
  });
}

// ========== Sync Runs ==========

export function useIntegrationSyncRuns(integrationId?: string) {
  return useQuery({
    queryKey: ['integration-sync-runs', integrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_sync_runs')
        .select('*')
        .eq('integration_id', integrationId)
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as IntegrationSyncRun[];
    },
    enabled: !!integrationId,
  });
}

// ========== Service Orders ==========

export function useServiceOrders(companyId?: string, filters?: { nfseStatus?: string; provider?: string }) {
  return useQuery({
    queryKey: ['service-orders', companyId, filters],
    queryFn: async () => {
      let query = supabase
        .from('service_orders')
        .select(`
          *,
          customer:service_order_customers(*)
        `)
        .eq('company_id', companyId)
        .order('order_date', { ascending: false });

      if (filters?.nfseStatus) {
        query = query.eq('nfse_status', filters.nfseStatus);
      }
      if (filters?.provider) {
        query = query.eq('provider', filters.provider);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data as ServiceOrder[];
    },
    enabled: !!companyId,
  });
}

// ========== Invoice Queue ==========

export function useServiceInvoiceQueue(companyId?: string, status?: string) {
  return useQuery({
    queryKey: ['service-invoice-queue', companyId, status],
    queryFn: async () => {
      let query = supabase
        .from('service_invoice_queue')
        .select(`
          *,
          service_order:service_orders(*),
          customer:service_order_customers(*)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data as ServiceInvoiceQueue[];
    },
    enabled: !!companyId,
  });
}

export function useInvoiceQueueMutations() {
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, errorMessage }: { id: string; status: string; errorMessage?: string }) => {
      const { data, error } = await supabase
        .from('service_invoice_queue')
        .update({
          status,
          error_message: errorMessage || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-invoice-queue'] });
      toast.success('Status atualizado');
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const markAsIssued = useMutation({
    mutationFn: async ({ id, nfseNumber, nfseProtocol, nfseUrl }: { id: string; nfseNumber?: string; nfseProtocol?: string; nfseUrl?: string }) => {
      const { data, error } = await supabase
        .from('service_invoice_queue')
        .update({
          status: 'issued',
          nfse_number: nfseNumber || null,
          nfse_protocol: nfseProtocol || null,
          nfse_url: nfseUrl || null,
          issued_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-invoice-queue'] });
      toast.success('Nota marcada como emitida');
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  return { updateStatus, markAsIssued };
}

// ========== Invoice Events ==========

export function useServiceInvoiceEvents(queueId?: string) {
  return useQuery({
    queryKey: ['service-invoice-events', queueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_invoice_events')
        .select('*')
        .eq('queue_id', queueId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ServiceInvoiceEvent[];
    },
    enabled: !!queueId,
  });
}

// ========== Trigger Sync ==========

export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ integrationId }: { integrationId: string }) => {
      const { data, error } = await supabase.functions.invoke('erp-sync-orders', {
        body: { integration_id: integrationId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-sync-runs'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Sincronização iniciada');
    },
    onError: (error) => {
      toast.error(`Erro ao iniciar sincronização: ${error.message}`);
    },
  });
}
