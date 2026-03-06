import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/edgeFunctionClient';

// ─── Types ───

export interface Retrospective {
  id: string;
  tenant_id: string;
  company_id: string | null;
  rule_id: string | null;
  retrospective_type: string;
  title: string;
  period_start: string;
  period_end: string;
  anchor_start_date: string | null;
  anchor_end_date: string | null;
  status: string;
  pdf_url: string | null;
  presentation_url: string | null;
  html_url: string | null;
  summary_json: any;
  generated_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface RetrospectiveTarget {
  id: string;
  tenant_id: string;
  company_id: string | null;
  rule_id: string | null;
  anchor_date: string;
  due_date: string;
  target_scope: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface RetrospectiveRule {
  id: string;
  name: string;
  period_days: number;
  retrospective_type: string;
  applies_to_scope: string;
  is_active: boolean;
  auto_generate: boolean;
  auto_send: boolean;
  created_at: string;
}

export interface RetrospectiveSnapshot {
  id: string;
  tenant_id: string;
  company_id: string | null;
  snapshot_type: string;
  snapshot_date: string;
  period_start: string | null;
  period_end: string | null;
  orders_count: number | null;
  revenue_total: number | null;
  average_ticket: number | null;
  ads_spend: number | null;
  roas: number | null;
  acos: number | null;
  tacos: number | null;
  active_listings: number | null;
  products_count: number | null;
  estimated_profit: number | null;
  average_margin: number | null;
  created_at: string;
}

// ─── List retrospectives ───

export function useRetrospectives(tenantId: string | null, companyId?: string | null) {
  return useQuery({
    queryKey: ['retrospectives', tenantId, companyId],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase
        .from('retrospectives')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Retrospective[];
    },
    enabled: !!tenantId,
  });
}

// ─── List targets (queue) ───

export function useRetrospectiveTargets(tenantId: string | null) {
  return useQuery({
    queryKey: ['retrospective-targets', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('retrospective_targets')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('due_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RetrospectiveTarget[];
    },
    enabled: !!tenantId,
  });
}

// ─── List rules ───

export function useRetrospectiveRules() {
  return useQuery({
    queryKey: ['retrospective-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retrospective_rules')
        .select('*')
        .order('period_days', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RetrospectiveRule[];
    },
  });
}

// ─── List snapshots ───

export function useRetrospectiveSnapshots(tenantId: string | null, companyId?: string | null) {
  return useQuery({
    queryKey: ['retrospective-snapshots', tenantId, companyId],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase
        .from('retrospective_snapshots')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('snapshot_date', { ascending: false });

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as RetrospectiveSnapshot[];
    },
    enabled: !!tenantId,
  });
}

// ─── Trigger engine (manual/force) ───

export function useTriggerRetrospectiveEngine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      mode?: 'auto' | 'manual' | 'force';
      tenant_id?: string;
      company_id?: string;
      rule_id?: string;
    }) => {
      const result = await invokeEdgeFunction<{
        ok: boolean;
        processed: number;
        generated: number;
        skipped: number;
        errors: number;
        results: any[];
      }>('retrospective-engine', {
        body: {
          mode: params.mode || 'manual',
          tenant_id: params.tenant_id,
          company_id: params.company_id,
          rule_id: params.rule_id,
        },
      });

      if (!result.success) throw new Error(result.error || 'Erro ao executar motor');
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retrospectives'] });
      queryClient.invalidateQueries({ queryKey: ['retrospective-targets'] });
      queryClient.invalidateQueries({ queryKey: ['retrospective-snapshots'] });
    },
  });
}

// ─── Generate reports (HTML/Slides) for a retrospective ───

export function useGenerateRetrospectiveReports() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (retrospectiveId: string) => {
      const result = await invokeEdgeFunction<{
        ok: boolean;
        html_url: string | null;
        presentation_url: string | null;
      }>('retrospective-report-gen', {
        body: { retrospective_id: retrospectiveId },
      });

      if (!result.success) throw new Error(result.error || 'Erro ao gerar relatórios');
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retrospectives'] });
    },
  });
}

// ─── Delete retrospective ───

export function useDeleteRetrospectiveNew() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('retrospectives')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retrospectives'] });
    },
  });
}
