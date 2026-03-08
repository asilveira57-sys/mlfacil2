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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return [];
      const user = session.user;

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

      // Get ml_accounts to map company_id → ml_account.id
      const { data: mlAccounts } = await supabase
        .from('ml_accounts')
        .select('id, company_id')
        .in('company_id', companyIds)
        .eq('is_active', true);

      // company_customization stores ml_account UUID as company_id
      const mlAccountIds = (mlAccounts || []).map(a => a.id);
      const allLookupIds = [...companyIds, ...mlAccountIds];
      const { data: customizations } = await supabase
        .from('company_customization')
        .select('company_id, color_key')
        .in('company_id', allLookupIds);

      // Build reverse map: real company_id → color_key
      const mlToCompany = new Map((mlAccounts || []).map(a => [a.id, a.company_id]));
      const colorMap = new Map<string, string>();
      (customizations || []).forEach(c => {
        // Direct match (company_id)
        if (companyIds.includes(c.company_id)) {
          colorMap.set(c.company_id, c.color_key);
        }
        // Indirect match (ml_account UUID → real company_id)
        const realCompanyId = mlToCompany.get(c.company_id);
        if (realCompanyId && !colorMap.has(realCompanyId)) {
          colorMap.set(realCompanyId, c.color_key);
        }
      });

      const companyMap = new Map((companies || []).map(c => [c.id, c.display_name]));

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
