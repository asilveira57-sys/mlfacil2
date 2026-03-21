import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PlanModule {
  id: string;
  plan_id: string;
  module_id: string;
  is_enabled: boolean;
}

export interface SystemModuleItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  route: string | null;
  requires_connection: boolean;
  is_active: boolean;
  layer: string;
  parent_module_id: string | null;
}

// Fetch all modules for the checkbox UI
export function useAllSystemModules() {
  return useQuery({
    queryKey: ['admin-all-system-modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('id, key, name, description, category, route, requires_connection, is_active, layer, parent_module_id')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data || []) as SystemModuleItem[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Fetch modules assigned to a specific plan
export function usePlanModulesByPlan(planId: string | null) {
  return useQuery({
    queryKey: ['plan-modules', planId],
    queryFn: async () => {
      if (!planId) return [];
      const { data, error } = await supabase
        .from('plan_modules')
        .select('id, plan_id, module_id, is_enabled')
        .eq('plan_id', planId);
      if (error) throw error;
      return (data || []) as PlanModule[];
    },
    enabled: !!planId,
  });
}

// Fetch module counts per plan (for the list view)
export function usePlanModuleCounts() {
  return useQuery({
    queryKey: ['plan-module-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_modules')
        .select('plan_id, module_id')
        .eq('is_enabled', true);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data || []) {
        counts[row.plan_id] = (counts[row.plan_id] || 0) + 1;
      }
      return counts;
    },
    staleTime: 30_000,
  });
}

// Save modules for a plan (replace all)
export function useSavePlanModules() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ planId, moduleIds }: { planId: string; moduleIds: string[] }) => {
      // Delete existing
      const { error: delErr } = await supabase
        .from('plan_modules')
        .delete()
        .eq('plan_id', planId);
      if (delErr) throw delErr;

      if (moduleIds.length === 0) return { saved: 0 };

      // Insert new
      const rows = moduleIds.map(mid => ({
        plan_id: planId,
        module_id: mid,
        is_enabled: true,
      }));
      const { error: insErr } = await supabase
        .from('plan_modules')
        .insert(rows);
      if (insErr) throw insErr;

      // Log
      await supabase.from('plan_access_logs').insert({
        action_type: 'plan_modules_updated',
        entity_type: 'plan_tier',
        entity_id: planId,
        payload_after: { modules_enabled: moduleIds, count: moduleIds.length } as any,
      });

      return { saved: moduleIds.length };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['plan-modules', vars.planId] });
      qc.invalidateQueries({ queryKey: ['plan-module-counts'] });
      toast.success('Módulos do plano atualizados');
    },
    onError: () => {
      toast.error('Erro ao salvar módulos do plano');
    },
  });
}

// Group modules by category for display
export function groupModulesByCategory(modules: SystemModuleItem[]): Record<string, SystemModuleItem[]> {
  const groups: Record<string, SystemModuleItem[]> = {};
  for (const m of modules) {
    const cat = m.category || m.layer || 'outros';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  }
  return groups;
}

const CATEGORY_LABELS: Record<string, string> = {
  marketplace: 'Marketplace',
  ferramentas: 'Ferramentas',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
  sistema: 'Sistema',
  admin: 'Admin',
  outros: 'Outros',
};

export function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
}
