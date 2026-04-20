import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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
