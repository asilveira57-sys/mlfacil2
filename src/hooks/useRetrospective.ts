import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Logger helper (fire-and-forget) ───
function logRetroEvent(action: string, userId?: string, meta?: Record<string, unknown>) {
  supabase
    .rpc('register_system_log', {
      p_level: 'info',
      p_system_area: 'retrospectiva',
      p_action: action,
      p_user_id: userId ?? undefined,
      p_meta_json: JSON.parse(JSON.stringify(meta ?? {})),
      p_success: true,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) console.warn('[RetroLog]', error.message);
    });
}

function logRetroError(action: string, userId?: string, errorMsg?: string, meta?: Record<string, unknown>) {
  supabase
    .rpc('register_system_log', {
      p_level: 'error',
      p_system_area: 'retrospectiva',
      p_action: action,
      p_user_id: userId ?? undefined,
      p_meta_json: JSON.parse(JSON.stringify({ ...meta, error: errorMsg })),
      p_success: false,
      p_message: errorMsg,
    })
    .then(() => {});
}

export type RetrospectiveReport = {
  id: string;
  user_id: string;
  seller_id: string;
  tipo: string;
  periodo_inicio: string;
  periodo_fim: string;
  json_snapshot: any;
  pdf_url: string | null;
  status: string;
  error_message: string | null;
  company_name: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

// ─── List reports (no LIMIT, paginação apenas na UI) ───
export function useRetrospectiveReports(userId: string | null, sellerId: string | null) {
  return useQuery({
    queryKey: ['retrospective-reports', userId, sellerId],
    queryFn: async () => {
      if (!userId || !sellerId) return [];
      const { data, error } = await supabase
        .from('retrospective_reports')
        .select('*')
        .eq('user_id', userId)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RetrospectiveReport[];
    },
    enabled: !!userId && !!sellerId,
  });
}

// ─── Generate a new retrospective ───
export function useGenerateRetrospective() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      sellerId,
      tipo,
      periodoInicio,
      periodoFim,
      companyName,
      logoUrl,
    }: {
      userId: string;
      sellerId: string;
      tipo: string;
      periodoInicio: string;
      periodoFim: string;
      companyName?: string;
      logoUrl?: string;
    }) => {
      // 1. Create report record in "processing" state
      const { data: report, error: insertErr } = await supabase
        .from('retrospective_reports')
        .insert({
          user_id: userId,
          seller_id: sellerId,
          tipo,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
          company_name: companyName || null,
          logo_url: logoUrl || null,
          status: 'processing',
          json_snapshot: {},
        })
        .select('id')
        .single();
      if (insertErr) throw insertErr;

      logRetroEvent('gerar_relatorio', userId, {
        tipo_periodo: tipo,
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
      });

      // 2. Call RPC to generate snapshot (no LIMIT)
      const { data: snapshot, error: rpcErr } = await supabase.rpc(
        'generate_retrospective_snapshot',
        {
          p_user_id: userId,
          p_seller_id: sellerId,
          p_periodo_inicio: periodoInicio,
          p_periodo_fim: periodoFim,
        }
      );

      if (rpcErr) {
        // Mark report as error
        await supabase
          .from('retrospective_reports')
          .update({ status: 'error', error_message: rpcErr.message })
          .eq('id', report.id);
        logRetroError('erro_processamento', userId, rpcErr.message, {
          report_id: report.id,
        });
        throw rpcErr;
      }

      // 3. Update report with snapshot
      const { error: updateErr } = await supabase
        .from('retrospective_reports')
        .update({
          json_snapshot: snapshot,
          status: 'completed',
        })
        .eq('id', report.id);

      if (updateErr) throw updateErr;

      return { id: report.id, snapshot };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retrospective-reports'] });
    },
  });
}

// ─── Delete report ───
export function useDeleteRetrospective() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const { error } = await supabase
        .from('retrospective_reports')
        .delete()
        .eq('id', id);
      if (error) throw error;
      logRetroEvent('excluir_relatorio', userId, { id_relatorio: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retrospective-reports'] });
    },
  });
}

// ─── Log PDF download ───
export function logPdfDownload(userId: string, reportId: string) {
  logRetroEvent('download_pdf', userId, { id_relatorio: reportId });
}
