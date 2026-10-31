import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isLegacyPayload } from "../_shared/print-labels-storage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// V2 status reader — consulta meli_print_queue_v2 (não tocar V1).
// Mapeia o status interno (pendente/processando/concluido/parcial/erro) para
// o vocabulário esperado pelo poller do hook (processing/completed/partial/error).
function mapStatus(s: string): string {
  switch (s) {
    case 'concluido': return 'completed';
    case 'parcial': return 'partial';
    case 'erro': return 'error';
    case 'pendente':
    case 'processando':
    default: return 'processing';
  }
}

async function triggerBatchRetry(supabaseUrl: string, serviceKey: string, jobId: string, batchIndex: number) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ml-generate-labels-labeltest-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({ job_id: jobId, batch_index: batchIndex }),
    });
    await response.text().catch(() => '');
  } catch (error) {
    console.error('[status-v2] recovery retry failed:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { job_id } = await req.json();

    if (!job_id || typeof job_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'job_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Caminho novo (padrão): status leve calculado no banco, sem batches/PDF/log.
    // LABELS_LEGACY_PAYLOAD=1 → cai no caminho antigo abaixo (sem redeploy).
    if (!isLegacyPayload()) {
      const { data: rows, error: stErr } = await supabaseAdmin.rpc('labels_v2_job_status', { p_job_id: job_id, p_user_id: user.id });
      if (stErr) {
        console.error('[status-v2] DB error:', stErr);
        return new Response(
          JSON.stringify({ error: 'DB error', detail: stErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const st: any = Array.isArray(rows) ? rows[0] : rows;
      if (!st) {
        return new Response(
          JSON.stringify({ error: 'Job not found', job_id }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const nowMs = Date.now();
      const startedMs = st.job_started_at ? new Date(st.job_started_at).getTime() : nowMs;
      if (st.status === 'processando' && nowMs - startedMs > 60_000) {
        // Só aqui lemos o array (pequeno: apenas metadados por lote)
        const { data: jb } = await supabaseAdmin.from('meli_print_queue_v2').select('batches').eq('id', job_id).maybeSingle();
        const bs: any[] = Array.isArray(jb?.batches) ? jb!.batches : [];
        const retryCandidates = bs.filter((b: any) => {
          if (['success', 'error'].includes(b?.status)) return false;
          const lastRecoveryAt = b?.recovery_dispatched_at ? new Date(b.recovery_dispatched_at).getTime() : 0;
          return !lastRecoveryAt || nowMs - lastRecoveryAt > 60_000;
        });
        if (retryCandidates.length > 0) {
          const patched = bs.map((b: any) => retryCandidates.some((r: any) => r.idx === b.idx)
            ? { ...b, status: 'retrying', recovery_dispatched_at: new Date().toISOString() }
            : b);
          await supabaseAdmin.from('meli_print_queue_v2').update({ batches: patched as any } as any).eq('id', job_id);
          for (const batch of retryCandidates) {
            // @ts-ignore - EdgeRuntime global
            EdgeRuntime.waitUntil(triggerBatchRetry(supabaseUrl, serviceKey, job_id, batch.idx));
          }
        }
      }

      const errs = Array.isArray(st.errors) ? st.errors : [];
      return new Response(
        JSON.stringify({
          job_id: st.job_id,
          status: mapStatus(st.status),
          raw_status: st.status,
          format: st.format,
          layout: st.layout,
          total_labels: st.total_labels,
          processed_labels: st.processed_labels,
          total_batches: st.total_batches || 1,
          completed_batches: st.completed_batches,
          error_batches: st.error_batches,
          processing_batches: st.processing_batches,
          started_at: st.job_started_at,
          completed_at: st.job_completed_at,
          success_count: st.success_count > 0 ? st.success_count : st.processed_labels,
          error_count: errs.length,
          errors: errs,
          download_filename: st.download_filename,
          page_width_mm: st.page_width_mm,
          page_height_mm: st.page_height_mm,
          total_pages: st.total_pages,
          error_log: st.error_log,
          has_file: !!st.has_file,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── LEGADO (LABELS_LEGACY_PAYLOAD=1) ───────────────────────────────
    const { data: job, error: jobError } = await supabaseAdmin
      .from('meli_print_queue_v2')
      .select('id, user_id, status, format, layout, total_labels, processed_labels, batches, job_started_at, job_completed_at, file_url, zpl_content, pdf_base64, download_filename, page_width_mm, page_height_mm, total_pages, error_log, per_shipment_log')
      .eq('id', job_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (jobError) {
      console.error('[status-v2] DB error:', jobError);
      return new Response(
        JSON.stringify({ error: 'DB error', detail: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!job) {
      // 404 explícito — o cliente decide se mantém o activeJob (recovering_stalled) ou não.
      return new Response(
        JSON.stringify({ error: 'Job not found', job_id }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const batches = Array.isArray(job.batches) ? job.batches : [];
    const now = Date.now();
    const startedAt = job.job_started_at ? new Date(job.job_started_at).getTime() : now;
    const staleProcessing = job.status === 'processando' && now - startedAt > 60_000;

    if (staleProcessing) {
      const retryCandidates = batches.filter((b: any) => {
        if (['success', 'error'].includes(b?.status)) return false;
        const lastRecoveryAt = b?.recovery_dispatched_at ? new Date(b.recovery_dispatched_at).getTime() : 0;
        return !lastRecoveryAt || now - lastRecoveryAt > 60_000;
      });

      if (retryCandidates.length > 0) {
        const patchedBatches = batches.map((b: any) => retryCandidates.some((r: any) => r.idx === b.idx)
          ? { ...b, status: 'retrying', recovery_dispatched_at: new Date().toISOString() }
          : b
        );
        await supabaseAdmin
          .from('meli_print_queue_v2')
          .update({ batches: patchedBatches as any } as any)
          .eq('id', job.id);

        for (const batch of retryCandidates) {
          // @ts-ignore - EdgeRuntime global
          EdgeRuntime.waitUntil(triggerBatchRetry(supabaseUrl, serviceKey, job.id, batch.idx));
        }
        job.batches = patchedBatches;
      }
    }

    const completedBatches = batches.filter((b: any) => b?.status === 'success' || b?.status === 'completed').length;
    const errorBatches = batches.filter((b: any) => b?.status === 'error').length;
    const processingBatches = batches.filter((b: any) => b?.status === 'processing' || b?.status === 'retrying').length;

    // Coleta erros por shipment do per_shipment_log para entregar ao cliente
    const perLog = Array.isArray(job.per_shipment_log) ? job.per_shipment_log : [];
    const errors = perLog
      .filter((e: any) => e?.status === 'error')
      .map((e: any) => ({
        shipment_id: e.shipment_id,
        reason_code: e.reason_code || 'UNKNOWN',
        reason_message: e.error || e.reason_message || 'Erro desconhecido',
      }));
    const successCount = perLog.filter((e: any) => e?.status === 'ok').length;

    return new Response(
      JSON.stringify({
        job_id: job.id,
        status: mapStatus(job.status),
        raw_status: job.status,
        format: job.format,
        layout: job.layout,
        total_labels: job.total_labels,
        processed_labels: job.processed_labels,
        total_batches: batches.length || 1,
        completed_batches: completedBatches,
        error_batches: errorBatches,
        processing_batches: processingBatches,
        started_at: job.job_started_at,
        completed_at: job.job_completed_at,
        file_url: job.file_url,
        zpl_content: job.zpl_content,
        pdf_base64: job.pdf_base64,
        success_count: successCount > 0 ? successCount : job.processed_labels,
        error_count: errors.length,
        errors,
        download_filename: job.download_filename,
        page_width_mm: job.page_width_mm,
        page_height_mm: job.page_height_mm,
        total_pages: job.total_pages,
        error_log: job.error_log,
        per_shipment_log: job.per_shipment_log,
        has_file: !!(job.file_url || job.pdf_base64 || job.zpl_content),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[status-v2] error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
