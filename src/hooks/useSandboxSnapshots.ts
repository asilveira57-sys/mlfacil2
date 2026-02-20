import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SandboxSnapshot {
  id: string;
  company_id: string;
  user_id: string;
  seller_id: string;
  total_vendas_semana: number;
  pedidos_semana: number;
  ticket_medio: number;
  produto_mais_vendido: string | null;
  etiquetas_pendentes: number;
  nf_pendentes: number;
  perguntas_pendentes: number;
  pedidos_envio: number;
  reclamacoes_abertas: number;
  reclamacoes_aguardando: number;
  pos_venda_pendente: number;
  mediacoes_abertas: number;
  gasto_ads_semana: number;
  faturamento_ads_semana: number;
  acos_medio: number;
  roas_medio: number;
  cutoff_flex_time: string | null;
  cutoff_coleta_time: string | null;
  estoque_critico: number;
  snapshot_status: string;
  snapshot_error: string | null;
  updated_at: string;
  // Joined
  company_name?: string;
  color_key?: string;
}

export function useSandboxSnapshots() {
  return useQuery({
    queryKey: ['sandbox-snapshots'],
    queryFn: async (): Promise<SandboxSnapshot[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get snapshots
      const { data: snapshots, error } = await supabase
        .from('sandbox_company_snapshot')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!snapshots || snapshots.length === 0) return [];

      // Get companies for display names
      const companyIds = snapshots.map(s => s.company_id);
      const { data: companies } = await supabase
        .from('companies')
        .select('id, display_name')
        .in('id', companyIds);

      // Get customization colors
      const { data: customizations } = await supabase
        .from('company_customization')
        .select('company_id, color_key')
        .in('company_id', companyIds);

      const companyMap = new Map((companies || []).map(c => [c.id, c.display_name]));
      const colorMap = new Map((customizations || []).map(c => [c.company_id, c.color_key]));

      return snapshots
        .filter(s => s.snapshot_status !== 'no_account')
        .map(s => ({
          ...s,
          company_name: companyMap.get(s.company_id) || 'Empresa',
          color_key: colorMap.get(s.company_id) || 'blue',
        }));
    },
    staleTime: 2 * 60 * 1000, // 2 min
    refetchOnMount: true,
  });
}
