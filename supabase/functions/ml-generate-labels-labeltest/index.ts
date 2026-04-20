// ml-generate-labels-labeltest — DISPATCHER (V2 async)
// =====================================================
// Para PDF: cria job em meli_print_queue_v2 com batches de 5 shipments e
// dispara workers (ml-generate-labels-labeltest-batch) em background.
// Retorna { job_id, total_labels, total_batches } imediatamente — o frontend
// faz polling via ml-generate-labels-status-v2.
//
// Para ZPL: continua single-shot inline (não usa Labelary/pdf-lib, sem CPU spike).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  LAYOUTS, hashCode, validateZpl, splitZplBlocks, distributeZplBlocks,
  fetchZplBatchFromMl, sleep,
} from "../_shared/labeltest-render.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function respond(ok: boolean, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ ok, ...payload }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const PDF_CHUNK_SIZE = 5; // 5 shipments por worker invocation → cabe folgado no orçamento de CPU
const MAX_LABELS = 30;    // regra de negócio

// Validação reaproveitada do legado
const REPRINT_SUBSTATUSES = new Set([
  'ready_to_print', 'printed', 'ready_for_pickup', 'in_packing_list',
  'invoice_issued', 'invoice_validated', 'not_required',
]);

// ─── Background trigger: invoca os workers de batch com concorrência 2 ──
// Labelary aguenta 2 workers em paralelo (cada um já roda 2 PNGs concorrentes).
// Lote de 15 etiquetas (3 batches): ~10s + ~10s = ~20s (vs 32s sequencial).
async function triggerBatchWorkers(supabaseUrl: string, serviceKey: string, jobId: string, totalBatches: number) {
  const CONCURRENT_BATCHES = 2;
  console.log(`[labeltest-dispatcher] triggerBatchWorkers job=${jobId} totalBatches=${totalBatches} concurrency=${CONCURRENT_BATCHES}`);

  const invokeBatch = async (idx: number) => {
    const t0 = Date.now();
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/ml-generate-labels-labeltest-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ job_id: jobId, batch_index: idx }),
      });
      const elapsed = Date.now() - t0;
      console.log(`[labeltest-dispatcher] batch ${idx + 1}/${totalBatches} job=${jobId} status=${r.status} elapsed=${elapsed}ms`);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.error(`[labeltest-dispatcher] batch ${idx} failed: ${r.status} ${body.slice(0, 200)}`);
      }
    } catch (e: any) {
      console.error(`[labeltest-dispatcher] batch ${idx} exception: ${e.message}`);
    }
  };

  // Pool simples com janela de N concorrentes
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const runnersCount = Math.min(CONCURRENT_BATCHES, totalBatches);
  for (let i = 0; i < runnersCount; i++) {
    runners.push((async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= totalBatches) return;
        await invokeBatch(idx);
        // Pequena folga entre disparos do mesmo runner (rate limit Labelary)
        if (cursor < totalBatches) await sleep(250);
      }
    })());
  }
  await Promise.all(runners);
  console.log(`[labeltest-dispatcher] all batches dispatched for job=${jobId}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return respond(false, { error: 'Missing auth' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return respond(false, { error: 'Not authenticated' }, 401);

    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) return respond(false, { error: 'Access denied', error_code: 'TRIAL_EXPIRED' }, 403);

    let body: any;
    try { body = await req.json(); } catch { return respond(false, { error: 'Invalid JSON body' }, 400); }

    const { seller_id, shipment_ids, format, layout = 'meli_100x150' } = body;
    if (!seller_id || !shipment_ids?.length) return respond(false, { error: 'seller_id and shipment_ids required' }, 400);
    if (!['pdf', 'zpl'].includes(format)) return respond(false, { error: 'format must be pdf or zpl' }, 400);
    if (!LAYOUTS[layout]) return respond(false, { error: 'Invalid layout' }, 400);
    if (shipment_ids.length > MAX_LABELS) return respond(false, { error: `Máximo de ${MAX_LABELS} etiquetas por geração` }, 400);

    const layoutInfo = LAYOUTS[layout];
    console.log(`[labeltest-dispatcher] seller=${seller_id} format=${format} layout=${layout} shipments=${shipment_ids.length}`);

    // ML account
    const { data: mlAccount } = await supabaseAdmin
      .from('ml_accounts').select('access_token, ml_user_id')
      .eq('user_id', user.id).eq('ml_user_id', seller_id).eq('is_active', true).maybeSingle();
    if (!mlAccount) return respond(false, { error: 'ML account not found' }, 404);

    // ─── Validate shipments ────────────────────────────────────────
    const validationErrors: { shipment_id: string; reason_code: string; reason_message: string }[] = [];
    const validIds: string[] = [];
    const { data: shipments } = await supabaseAdmin
      .from('meli_shipments_cache').select('shipment_id, order_id, label_available, logistic_type, shipment_substatus, shipment_status')
      .eq('seller_id', seller_id).in('shipment_id', shipment_ids);
    const shipMap = new Map((shipments || []).map((s: any) => [s.shipment_id, s]));

    for (const sid of shipment_ids) {
      const s = shipMap.get(sid);
      if (!s) { validationErrors.push({ shipment_id: sid, reason_code: 'shipment_nao_encontrado', reason_message: 'Envio não encontrado no cache' }); continue; }
      if (s.logistic_type === 'fulfillment') { validationErrors.push({ shipment_id: sid, reason_code: 'full', reason_message: 'Pedido Full (ML envia)' }); continue; }
      if (!s.label_available) {
        const sub = s.shipment_substatus || '';
        if (!REPRINT_SUBSTATUSES.has(sub)) { validationErrors.push({ shipment_id: sid, reason_code: 'sem_label_available', reason_message: `Etiqueta não disponível (substatus: ${sub || 'vazio'})` }); continue; }
      }
      validIds.push(sid);
    }

    if (validIds.length === 0) {
      return respond(false, {
        error: 'Nenhum envio válido',
        data: { success_count: 0, error_count: validationErrors.length, errors: validationErrors },
      }, 422);
    }

    const fileHash = hashCode(`${seller_id}_${validIds.join(',')}_${Date.now()}`);
    const ext = format === 'pdf' ? 'pdf' : 'zpl';
    const downloadFilename = `etiquetas_labeltest_${layout}_${validIds.length}un_${fileHash}.${ext}`;

    // ─────────────────────────────────────────────────────────────────
    // ZPL: single-shot inline (sem Labelary/pdf-lib → sem CPU spike)
    // ─────────────────────────────────────────────────────────────────
    if (format === 'zpl') {
      console.log(`[labeltest-dispatcher] ZPL single-shot for ${validIds.length} shipments`);
      const batchResult = await fetchZplBatchFromMl(validIds, mlAccount.access_token);
      if (!batchResult.zpl) {
        return respond(false, { error: batchResult.reason_message || 'Falha ao buscar ZPL', data: { success_count: 0, error_count: validIds.length } }, 502);
      }
      const validation = validateZpl(batchResult.zpl);
      if (!validation.valid) return respond(false, { error: validation.reason_message }, 502);
      const allBlocks = splitZplBlocks(validation.cleaned);
      const { blocksByShipment, errors: distErrors } = distributeZplBlocks(allBlocks, validIds);

      const zplParts: string[] = []; let totalSuccess = 0; let totalPages = 0;
      const perShipmentLog: any[] = [];
      for (const sid of validIds) {
        const blocks = blocksByShipment.get(sid);
        if (blocks) { zplParts.push(blocks.join('\n')); totalSuccess++; totalPages += blocks.length; perShipmentLog.push({ shipment_id: sid, status: 'ok', zpl_blocks: blocks.length }); }
      }
      const finalZplContent = zplParts.join('\n');

      // Persiste job já concluído (para histórico)
      const { data: job } = await supabaseAdmin.from('meli_print_queue_v2').insert({
        user_id: user.id, seller_id, format, layout, shipment_ids: validIds,
        total_labels: validIds.length, processed_labels: totalSuccess,
        status: totalSuccess === validIds.length ? 'concluido' : totalSuccess > 0 ? 'parcial' : 'erro',
        page_width_mm: layoutInfo.widthMm, page_height_mm: layoutInfo.heightMm,
        download_filename: downloadFilename, total_pages: totalPages,
        zpl_content: finalZplContent,
        per_shipment_log: perShipmentLog as any,
        job_started_at: new Date(t0).toISOString(),
        job_completed_at: new Date().toISOString(),
        module: 'labeltest', batches: [] as any,
      } as any).select('id').single();

      return respond(true, {
        data: {
          job_id: job?.id, zpl_content: finalZplContent,
          success_count: totalSuccess, error_count: distErrors.length + validationErrors.length,
          errors: [...validationErrors, ...distErrors],
          total_success: totalSuccess, total_pages: totalPages,
          per_shipment: perShipmentLog,
          layout, page_width_mm: layoutInfo.widthMm, page_height_mm: layoutInfo.heightMm,
          processing_time_ms: Date.now() - t0,
          download_filename: downloadFilename,
          // sinaliza ao frontend: já está pronto, sem polling
          inline_complete: true,
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // PDF: cria job + batches, dispara workers em background
    // ─────────────────────────────────────────────────────────────────
    const chunks: string[][] = [];
    for (let i = 0; i < validIds.length; i += PDF_CHUNK_SIZE) chunks.push(validIds.slice(i, i + PDF_CHUNK_SIZE));

    const batches = chunks.map((sids, idx) => ({
      idx, sids, status: 'pending' as const,
      success_count: 0, error_count: 0, pages: 0,
    }));

    const { data: job, error: jobErr } = await supabaseAdmin.from('meli_print_queue_v2').insert({
      user_id: user.id, seller_id, format, layout, shipment_ids: validIds,
      total_labels: validIds.length, processed_labels: 0,
      status: 'processando',
      page_width_mm: layoutInfo.widthMm, page_height_mm: layoutInfo.heightMm,
      download_filename: downloadFilename,
      job_started_at: new Date(t0).toISOString(),
      module: 'labeltest',
      batches: batches as any,
      per_shipment_log: validationErrors.length > 0 ? validationErrors : null as any,
    } as any).select('id').single();

    if (jobErr || !job) {
      console.error(`[labeltest-dispatcher] failed to create job:`, jobErr);
      return respond(false, { error: 'Falha ao criar job de impressão' }, 500);
    }
    const jobId = job.id;

    console.log(`[labeltest-dispatcher] job=${jobId} created with ${chunks.length} batches`);

    // Dispara workers em background
    // @ts-ignore - EdgeRuntime global
    EdgeRuntime.waitUntil(triggerBatchWorkers(supabaseUrl, serviceKey, jobId, chunks.length));

    return respond(true, {
      data: {
        job_id: jobId,
        total_labels: validIds.length,
        total_batches: chunks.length,
        validation_errors: validationErrors,
        download_filename: downloadFilename,
        layout,
        page_width_mm: layoutInfo.widthMm,
        page_height_mm: layoutInfo.heightMm,
        // sinaliza ao frontend: precisa fazer polling
        async_job: true,
      },
    });
  } catch (error: any) {
    console.error(`[labeltest-dispatcher] Unhandled error:`, error);
    return respond(false, { error: error.message || 'Internal server error' }, 500);
  }
});
