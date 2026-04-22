// ml-generate-labels-labeltest-finalize — FINALIZER
// =====================================================
// Único responsável pelo merge final dos PDFs por job. Isolado em sua
// própria invocation para não competir CPU com workers (cada worker já
// gasta ~10s renderizando 5 etiquetas via Labelary; mesclar 6 PDFs
// base64 grandes dentro do mesmo invocation estoura o limite de CPU).
//
// Idempotente: só finaliza se status ainda for 'processando'/'parcial' e
// se all batches estiverem em estado terminal (success|error). Caso
// contrário, retorna { skipped: true, reason }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { base64ToUint8, uint8ToBase64, mergeChunkPdfs } from "../_shared/labeltest-render.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => null);
    const jobId: string | undefined = body?.job_id;
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'job_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[labeltest-finalize] start job=${jobId}`);

    const { data: job, error: jobErr } = await supabaseAdmin
      .from('meli_print_queue_v2').select('*').eq('id', jobId).maybeSingle();
    if (jobErr || !job) {
      console.error(`[labeltest-finalize] job not found ${jobId}:`, jobErr);
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Já finalizado? idempotente
    if (['concluido', 'parcial', 'erro'].includes(job.status) && job.pdf_base64) {
      console.log(`[labeltest-finalize] job=${jobId} already finalized status=${job.status}, skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'already_finalized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const batches: any[] = Array.isArray(job.batches) ? job.batches : [];
    if (batches.length === 0) {
      return new Response(JSON.stringify({ error: 'No batches in job' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Bloqueia se ainda há batch não-terminal
    const pending = batches.filter(b => !['success', 'error'].includes(b?.status));
    if (pending.length > 0) {
      console.log(`[labeltest-finalize] job=${jobId} ${pending.length} batches still pending/processing — refusing to finalize`);
      return new Response(JSON.stringify({
        ok: false, skipped: true, reason: 'batches_pending',
        pending_indexes: pending.map((b: any) => b.idx),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Merge dos PDFs com sucesso
    const successBatches = batches.filter(b => b.status === 'success' && b.pdf_b64);
    const totalPages = batches.reduce((s, b) => s + (b.pages || 0), 0);
    const totalSuccess = batches.reduce((s, b) => s + (b.success_count || 0), 0);

    let finalPdfBase64: string | null = null;
    if (successBatches.length > 0) {
      console.log(`[labeltest-finalize] job=${jobId} merging ${successBatches.length} PDFs (totalPages=${totalPages})`);
      const successPdfs: Uint8Array[] = successBatches.map((b: any) => base64ToUint8(b.pdf_b64));
      const merged = await mergeChunkPdfs(successPdfs);
      finalPdfBase64 = uint8ToBase64(merged);
      console.log(`[labeltest-finalize] job=${jobId} merge done size=${(finalPdfBase64.length / 1024).toFixed(1)}KB`);
    }

    // Limpa pdf_b64 dos batches (reduz row size)
    const cleanedBatches = batches.map((b: any) => { const { pdf_b64, ...rest } = b; return rest; });

    const totalLabels = job.total_labels || 0;
    const finalStatus = totalSuccess === 0 ? 'erro' : totalSuccess === totalLabels ? 'concluido' : 'parcial';
    const startedAt = job.job_started_at ? new Date(job.job_started_at).getTime() : t0;

    await supabaseAdmin.from('meli_print_queue_v2').update({
      batches: cleanedBatches as any,
      pdf_base64: finalPdfBase64,
      total_pages: totalPages,
      processed_labels: totalSuccess,
      status: finalStatus,
      job_completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    } as any).eq('id', jobId);

    const elapsed = Date.now() - t0;
    console.log(`[labeltest-finalize] job=${jobId} FINALIZED status=${finalStatus} success=${totalSuccess}/${totalLabels} pages=${totalPages} elapsed=${elapsed}ms`);

    return new Response(JSON.stringify({
      ok: true, status: finalStatus, total_success: totalSuccess,
      total_labels: totalLabels, total_pages: totalPages, elapsed_ms: elapsed,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error(`[labeltest-finalize] Unhandled error:`, error);
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
