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
import { isLegacyPayload, finalPath, uploadFile, downloadFile, removeFiles, enforceLatestOnly } from "../_shared/print-labels-storage.ts";

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
      .from('meli_print_queue_v2')
      .select('id, user_id, seller_id, status, total_labels, job_started_at, batches, file_url, has_pdf:pdf_base64')
      .eq('id', jobId).maybeSingle();
    if (jobErr || !job) {
      console.error(`[labeltest-finalize] job not found ${jobId}:`, jobErr);
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Já finalizado? idempotente
    if (['concluido', 'parcial', 'erro'].includes(job.status) && (job.has_pdf || job.file_url)) {
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

    // Merge dos PDFs com sucesso (aceita lotes no Storage ou legados em base64)
    const successBatches = batches
      .filter(b => b.status === 'success' && (b.storage_path || b.pdf_b64))
      .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
    const totalPages = batches.reduce((s, b) => s + (b.pages || 0), 0);
    const totalSuccess = batches.reduce((s, b) => s + (b.success_count || 0), 0);
    const legacy = isLegacyPayload();

    let mergedBytes: Uint8Array | null = null;
    if (successBatches.length > 0) {
      console.log(`[labeltest-finalize] job=${jobId} merging ${successBatches.length} PDFs (totalPages=${totalPages}) legacy=${legacy}`);
      const successPdfs: Uint8Array[] = [];
      for (const b of successBatches) {
        successPdfs.push(b.storage_path ? await downloadFile(supabaseAdmin, b.storage_path) : base64ToUint8(b.pdf_b64));
      }
      mergedBytes = await mergeChunkPdfs(successPdfs);
      console.log(`[labeltest-finalize] job=${jobId} merge done size=${(mergedBytes.length / 1024).toFixed(1)}KB`);
    }

    let finalPdfBase64: string | null = null;
    let fileUrl: string | null = null;
    if (mergedBytes) {
      if (legacy) {
        finalPdfBase64 = uint8ToBase64(mergedBytes);
      } else {
        fileUrl = finalPath(job.user_id, job.seller_id, jobId, 'pdf');
        await uploadFile(supabaseAdmin, fileUrl, mergedBytes, 'application/pdf');
      }
    }

    // batches fica só com metadados (sem conteúdo nem caminho de lote apagado)
    const batchPaths = batches.map((b: any) => b.storage_path).filter(Boolean) as string[];
    const cleanedBatches = batches.map((b: any) => ({
      idx: b.idx, status: b.status, pages: b.pages || 0,
      success_count: b.success_count || 0, error_count: b.error_count || 0,
      error: b.error || null, storage_path: null,
    }));

    const totalLabels = job.total_labels || 0;
    const finalStatus = totalSuccess === 0 ? 'erro' : totalSuccess === totalLabels ? 'concluido' : 'parcial';
    const startedAt = job.job_started_at ? new Date(job.job_started_at).getTime() : t0;

    const update: Record<string, unknown> = {
      batches: cleanedBatches as any,
      total_pages: totalPages,
      processed_labels: totalSuccess,
      status: finalStatus,
      job_completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    };
    if (legacy) update.pdf_base64 = finalPdfBase64;
    else update.file_url = fileUrl;
    await supabaseAdmin.from('meli_print_queue_v2').update(update as any).eq('id', jobId);

    // Lotes intermediários não são mais necessários
    await removeFiles(supabaseAdmin, batchPaths);
    // Retenção: um arquivo por vendedor
    if (fileUrl) await enforceLatestOnly(supabaseAdmin, job.seller_id, jobId);

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
