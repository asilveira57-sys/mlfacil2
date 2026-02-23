import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/edgeFunctionClient';

export interface AgentConfig {
  id?: string;
  workspace_id: string;
  seller_id: string;
  is_enabled: boolean;
  max_seller_discount: number;
  min_total_discount: number | null;
  require_copart: boolean;
  scope_type: string;
  scope_items: string[];
  scope_categories: string[];
  exclude_items: string[];
  accepted_types: string[];
  accept_unknown_type: boolean;
  min_stock: number;
  min_margin: number | null;
  allow_when_margin_unknown: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AgentLog {
  id: string;
  workspace_id: string;
  seller_id: string;
  run_id: string;
  triggered_by: string;
  promotions_affected: number;
  items_adhered: number;
  items_failed: number;
  items_skipped: number;
  details: Record<string, unknown>;
  executed_at: string;
}

const DEFAULT_CONFIG: Omit<AgentConfig, 'workspace_id' | 'seller_id'> = {
  is_enabled: false,
  max_seller_discount: 10,
  min_total_discount: null,
  require_copart: false,
  scope_type: 'all',
  scope_items: [],
  scope_categories: [],
  exclude_items: [],
  accepted_types: ['SMART', 'DEAL', 'PRICE_MATCHING'],
  accept_unknown_type: false,
  min_stock: 0,
  min_margin: null,
  allow_when_margin_unknown: false,
};

export function useAgentConfig(workspaceId: string | null, sellerId: string | null) {
  return useQuery({
    queryKey: ['promotion-agent-config', workspaceId, sellerId],
    queryFn: async (): Promise<AgentConfig> => {
      const { data, error } = await supabase
        .from('promotion_agent_config')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('seller_id', sellerId!)
        .maybeSingle();

      if (error) throw error;
      if (data) return data as unknown as AgentConfig;

      return { ...DEFAULT_CONFIG, workspace_id: workspaceId!, seller_id: sellerId! };
    },
    enabled: !!workspaceId && !!sellerId,
  });
}

export function useUpsertAgentConfig() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (config: AgentConfig) => {
      // Check if exists
      const { data: existing } = await supabase
        .from('promotion_agent_config')
        .select('id')
        .eq('workspace_id', config.workspace_id)
        .eq('seller_id', config.seller_id)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('promotion_agent_config')
          .update({
            is_enabled: config.is_enabled,
            max_seller_discount: config.max_seller_discount,
            min_total_discount: config.min_total_discount,
            require_copart: config.require_copart,
            scope_type: config.scope_type,
            scope_items: config.scope_items,
            scope_categories: config.scope_categories,
            exclude_items: config.exclude_items,
            accepted_types: config.accepted_types,
            accept_unknown_type: config.accept_unknown_type,
            min_stock: config.min_stock,
            min_margin: config.min_margin,
            allow_when_margin_unknown: config.allow_when_margin_unknown,
          } as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('promotion_agent_config')
          .insert({
            workspace_id: config.workspace_id,
            seller_id: config.seller_id,
            is_enabled: config.is_enabled,
            max_seller_discount: config.max_seller_discount,
            min_total_discount: config.min_total_discount,
            require_copart: config.require_copart,
            scope_type: config.scope_type,
            scope_items: config.scope_items,
            scope_categories: config.scope_categories,
            exclude_items: config.exclude_items,
            accepted_types: config.accepted_types,
            accept_unknown_type: config.accept_unknown_type,
            min_stock: config.min_stock,
            min_margin: config.min_margin,
            allow_when_margin_unknown: config.allow_when_margin_unknown,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: (_, config) => {
      qc.invalidateQueries({ queryKey: ['promotion-agent-config', config.workspace_id, config.seller_id] });
    },
  });
}

export function useAgentLogs(workspaceId: string | null, sellerId: string | null) {
  return useQuery({
    queryKey: ['promotion-agent-logs', workspaceId, sellerId],
    queryFn: async (): Promise<AgentLog[]> => {
      const { data, error } = await supabase
        .from('promotion_agent_logs')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('seller_id', sellerId!)
        .order('executed_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as unknown as AgentLog[];
    },
    enabled: !!workspaceId && !!sellerId,
  });
}

export function useTriggerAgentRun() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId, sellerId }: { workspaceId: string; sellerId: string }) => {
      const result = await invokeEdgeFunction('promotion-agent-run', {
        body: {
          workspace_id: workspaceId,
          seller_id: sellerId,
          triggered_by: 'manual',
        },
      });
      if (!result.success) throw new Error(result.error || 'Erro ao executar agente');
      return result.data;
    },
    onSuccess: (_, { workspaceId, sellerId }) => {
      qc.invalidateQueries({ queryKey: ['promotion-agent-logs', workspaceId, sellerId] });
    },
  });
}
