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
  vendas_despachar_amanha: number;
  snapshot_status: string;
  snapshot_error: string | null;
  updated_at: string;
  // Joined
  company_name?: string;
  color_key?: string;
}

export function useSandboxSnapshots() {
  const query = useQuery({
    queryKey: ['sandbox-snapshots'],
    queryFn: async (): Promise<{ filtered: SandboxSnapshot[]; all: SandboxSnapshot[] }> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return { filtered: [], all: [] };
      const user = session.user;

      const { data: snapshots, error } = await supabase
        .from('sandbox_company_snapshot')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!snapshots || snapshots.length === 0) return { filtered: [], all: [] };

      const companyIds = snapshots.map(s => s.company_id);
      const { data: companies } = await supabase
        .from('companies')
        .select('id, display_name')
        .in('id', companyIds);

      const { data: mlAccounts } = await supabase
        .from('ml_accounts')
        .select('id, company_id')
        .in('company_id', companyIds)
        .eq('is_active', true);

      const mlAccountIds = (mlAccounts || []).map(a => a.id);
      const allLookupIds = [...companyIds, ...mlAccountIds];
      const { data: customizations } = await supabase
        .from('company_customization')
        .select('company_id, color_key')
        .in('company_id', allLookupIds);

      const mlToCompany = new Map((mlAccounts || []).map(a => [a.id, a.company_id]));
      const colorMap = new Map<string, string>();
      (customizations || []).forEach(c => {
        if (companyIds.includes(c.company_id)) {
          colorMap.set(c.company_id, c.color_key);
        }
        const realCompanyId = mlToCompany.get(c.company_id);
        if (realCompanyId && !colorMap.has(realCompanyId)) {
          colorMap.set(realCompanyId, c.color_key);
        }
      });

      const companyMap = new Map((companies || []).map(c => [c.id, c.display_name]));

      const all = snapshots.map(s => ({
        ...s,
        company_name: companyMap.get(s.company_id) || 'Empresa',
        color_key: colorMap.get(s.company_id) || 'blue',
      }));

      const filtered = all.filter(s => s.snapshot_status !== 'no_account');

      return { filtered, all };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    data: query.data?.filtered ?? [],
    allSnapshots: query.data?.all ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
