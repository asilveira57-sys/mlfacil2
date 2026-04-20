// ml-generate-labels-labeltest-batch — WORKER
// ============================================
// Processa 1 batch (≤5 shipments) do meli_print_queue_v2.
// Cabe folgado no orçamento de CPU (≤10 PNG embeds por invocation).
// Quando é o último batch, faz o merge final dos PDFs e marca job como concluido.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  LAYOUTS, fetchZplBatchFromMl, validateZpl, splitZplBlocks,
  distributeZplBlocks, renderChunkToPdf, mergeChunkPdfs,
  base64ToUint8, uint8ToBase64, DEFAULT_HEADER_PREFS,
} from "../_shared/labeltest-render.ts";

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
    if (!body?.job_id || typeof body.batch_index !== 'number') {
      return new Response(JSON.stringify({ error: 'job_id and batch_index required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { job_id: jobId, batch_index: batchIdx } = body;
    console.log(`[labeltest-batch] start job=${jobId} batch=${batchIdx}`);

    // Carrega job
    const { data: job, error: jobErr } = await supabaseAdmin.from('meli_print_queue_v2').select('*').eq('id', jobId).maybeSingle();
    if (jobErr || !job) {
      console.error(`[labeltest-batch] job not found ${jobId}:`, jobErr);
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const batches: any[] = Array.isArray(job.batches) ? [...job.batches] : [];
    const batch = batches[batchIdx];
    if (!batch) {
      console.error(`[labeltest-batch] batch index ${batchIdx} not found in job ${jobId}`);
      return new Response(JSON.stringify({ error: 'Batch not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (batch.status === 'success' || batch.status === 'error') {
      console.log(`[labeltest-batch] batch ${batchIdx} already ${batch.status}, skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Marca como processing
    batches[batchIdx] = { ...batch, status: 'processing', started_at: new Date().toISOString() };
    await supabaseAdmin.from('meli_print_queue_v2').update({ batches: batches as any } as any).eq('id', jobId);

    const sids: string[] = batch.sids || [];
    const layout = job.layout;
    const layoutInfo = LAYOUTS[layout];
    if (!layoutInfo) throw new Error(`Invalid layout: ${layout}`);

    // ML account token
    const { data: mlAccount } = await supabaseAdmin
      .from('ml_accounts').select('access_token')
      .eq('user_id', job.user_id).eq('ml_user_id', job.seller_id).eq('is_active', true).maybeSingle();
    if (!mlAccount) throw new Error('ML account not found');

    // Shipments cache
    const { data: shipments } = await supabaseAdmin
      .from('meli_shipments_cache').select('shipment_id, order_id, logistic_type')
      .eq('seller_id', job.seller_id).in('shipment_id', sids);
    const shipMap = new Map((shipments || []).map((s: any) => [s.shipment_id, s]));

    // Step 1: Fetch ZPL batch
    const fetched = await fetchZplBatchFromMl(sids, mlAccount.access_token);
    const errors: { shipment_id: string; reason_code: string; reason_message: string }[] = [];
    const log: any[] = [];
    let pdfBytes: Uint8Array | null = null; let successCount = 0; let pages = 0;

    if (!fetched.zpl) {
      for (const sid of sids) errors.push({ shipment_id: sid, reason_code: fetched.reason_code || 'ML_ZPL_FETCH_FAILED', reason_message: fetched.reason_message || 'Falha ao baixar ZPL' });
    } else {
      const validation = validateZpl(fetched.zpl);
      if (!validation.valid) {
        for (const sid of sids) errors.push({ shipment_id: sid, reason_code: validation.reason_code!, reason_message: validation.reason_message! });
      } else {
        const allBlocks = splitZplBlocks(validation.cleaned);
        const { blocksByShipment, errors: distErrors } = distributeZplBlocks(allBlocks, sids);
        errors.push(...distErrors);

        if (blocksByShipment.size > 0) {
          // Header prefs + orders/items quando layout exige cabeçalho
          let headerPrefs = { ...DEFAULT_HEADER_PREFS };
          const ordersMap = new Map<string, any>();
          const orderItemsMap = new Map<string, any[]>();
          if (layoutInfo.includeHeader) {
            const { data: hp } = await supabaseAdmin.from('meli_label_header_preferences').select('*').eq('user_id', job.user_id).eq('seller_id', job.seller_id).maybeSingle();
            if (hp) headerPrefs = { ...DEFAULT_HEADER_PREFS, ...hp };
            headerPrefs.show_variation_attrs = true;
            const orderIds = sids.map(sid => shipMap.get(sid)?.order_id).filter(Boolean);
            if (orderIds.length > 0) {
              const { data: orders } = await supabaseAdmin.from('meli_orders_cache').select('order_id, buyer_name, order_comment').eq('seller_id', job.seller_id).in('order_id', orderIds);
              for (const o of (orders || [])) ordersMap.set(o.order_id, o);
              const { data: items } = await supabaseAdmin.from('meli_order_items_cache').select('order_id, title, title_short, sku, quantity, variation_attributes').eq('seller_id', job.seller_id).in('order_id', orderIds);
              for (const it of (items || [])) { const arr = orderItemsMap.get(it.order_id) || []; arr.push(it); orderItemsMap.set(it.order_id, arr); }
            }
          }

          const result = await renderChunkToPdf({
            shipmentIds: sids, zplBlocksByShipment: blocksByShipment, layout,
            shipMap, ordersMap, orderItemsMap, headerPrefs,
          });
          pdfBytes = result.pdfBytes; successCount = result.successCount; pages = result.pages;
          errors.push(...result.errors); log.push(...result.log);
        }
      }
    }

    const batchPdfB64 = pdfBytes ? uint8ToBase64(pdfBytes) : null;
    const elapsed = Date.now() - t0;
    console.log(`[labeltest-batch] job=${jobId} batch=${batchIdx} done: success=${successCount}/${sids.length} pages=${pages} errors=${errors.length} elapsed=${elapsed}ms`);

    // ─── Atualiza estado do job (re-lê para evitar race com outro worker) ──
    const { data: freshJob } = await supabaseAdmin.from('meli_print_queue_v2').select('batches, processed_labels, per_shipment_log').eq('id', jobId).single();
    const freshBatches: any[] = Array.isArray(freshJob?.batches) ? [...freshJob!.batches] : batches;
    freshBatches[batchIdx] = {
      ...freshBatches[batchIdx],
      status: pdfBytes ? 'success' : 'error',
      success_count: successCount,
      error_count: errors.length,
      pages,
      pdf_b64: batchPdfB64,
      completed_at: new Date().toISOString(),
      elapsed_ms: elapsed,
    };

    const newProcessed = (freshJob?.processed_labels || 0) + successCount;
    const existingLog: any[] = Array.isArray(freshJob?.per_shipment_log) ? freshJob!.per_shipment_log : [];
    const mergedLog = [...existingLog, ...log, ...errors.map(e => ({ shipment_id: e.shipment_id, status: 'error', error: e.reason_message, reason_code: e.reason_code, batch_index: batchIdx }))];

    const allDone = freshBatches.every(b => b.status === 'success' || b.status === 'error');
    let finalUpdate: any = { batches: freshBatches, processed_labels: newProcessed, per_shipment_log: mergedLog };

    if (allDone) {
      // ─── Merge final ─────────────────────────────────────────────
      const successPdfs: Uint8Array[] = freshBatches
        .filter(b => b.status === 'success' && b.pdf_b64)
        .map(b => base64ToUint8(b.pdf_b64));
      const totalPages = freshBatches.reduce((s, b) => s + (b.pages || 0), 0);
      const totalSuccess = freshBatches.reduce((s, b) => s + (b.success_count || 0), 0);

      let finalPdfBase64: string | null = null;
      if (successPdfs.length > 0) {
        const merged = await mergeChunkPdfs(successPdfs);
        finalPdfBase64 = uint8ToBase64(merged);
      }

      // Limpa pdf_b64 dos batches para reduzir tamanho da row (já temos o merged)
      const cleanedBatches = freshBatches.map(b => { const { pdf_b64, ...rest } = b; return rest; });

      const finalStatus = totalSuccess === 0 ? 'erro' : totalSuccess === (job.total_labels || 0) ? 'concluido' : 'parcial';
      finalUpdate = {
        ...finalUpdate,
        batches: cleanedBatches,
        pdf_base64: finalPdfBase64,
        total_pages: totalPages,
        status: finalStatus,
        job_completed_at: new Date().toISOString(),
        duration_ms: Date.now() - new Date(job.job_started_at).getTime(),
      };
      console.log(`[labeltest-batch] job=${jobId} FINALIZED status=${finalStatus} success=${totalSuccess}/${job.total_labels} pages=${totalPages}`);
    }

    await supabaseAdmin.from('meli_print_queue_v2').update(finalUpdate as any).eq('id', jobId);

    return new Response(JSON.stringify({ ok: true, success_count: successCount, errors: errors.length, all_done: allDone }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error(`[labeltest-batch] Unhandled error:`, error);
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
