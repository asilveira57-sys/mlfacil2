// ml-generate-labels-labeltest-batch — WORKER
// ============================================
// Processa 1 batch (≤5 shipments) do meli_print_queue_v2.
// Cabe folgado no orçamento de CPU (≤10 PNG embeds por invocation).
// Quando é o último batch, faz o merge final dos PDFs e marca job como concluido.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  LAYOUTS, fetchZplBatchFromMl, validateZpl, splitZplBlocks,
  distributeZplBlocks, distributeZplBlocksSafe, renderChunkToPdf,
  uint8ToBase64, DEFAULT_HEADER_PREFS,
  fetchVariationAttributesMap,
} from "../_shared/labeltest-render.ts";

async function resolveJobMlAccount(supabaseAdmin: any, job: any, batch: any) {
  const fields = 'id, access_token, user_id, ml_user_id';

  if (batch?.ml_account_id) {
    const { data } = await supabaseAdmin
      .from('ml_accounts')
      .select(fields)
      .eq('id', batch.ml_account_id)
      .eq('ml_user_id', job.seller_id)
      .eq('is_active', true)
      .maybeSingle();
    if (data) return data;
  }

  const { data: ownAccount } = await supabaseAdmin
    .from('ml_accounts')
    .select(fields)
    .eq('user_id', job.user_id)
    .eq('ml_user_id', job.seller_id)
    .eq('is_active', true)
    .maybeSingle();
  if (ownAccount) return ownAccount;

  const { data: collab } = await supabaseAdmin
    .from('collaborators')
    .select('created_by')
    .eq('auth_user_id', job.user_id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('accepted_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (collab?.created_by) {
    const { data: inheritedAccount } = await supabaseAdmin
      .from('ml_accounts')
      .select(fields)
      .eq('user_id', collab.created_by)
      .eq('ml_user_id', job.seller_id)
      .eq('is_active', true)
      .maybeSingle();
    if (inheritedAccount) return inheritedAccount;
  }

  const { data: fallbackAccounts } = await supabaseAdmin
    .from('ml_accounts')
    .select(fields)
    .eq('ml_user_id', job.seller_id)
    .eq('is_active', true)
    .in('connection_status', ['connected', 'attention'])
    .order('updated_at', { ascending: false })
    .limit(1);

  return fallbackAccounts?.[0] || null;
}

// Dispara o finalize em uma invocation isolada (sem competir CPU com o
// rendering deste worker). Não-bloqueante via waitUntil para não atrasar
// a resposta do worker.
async function triggerFinalize(supabaseUrl: string, serviceKey: string, jobId: string) {
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/ml-generate-labels-labeltest-finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({ job_id: jobId }),
    });
    const txt = await r.text().catch(() => '');
    console.log(`[labeltest-batch] finalize triggered job=${jobId} status=${r.status} body=${txt.slice(0, 200)}`);
  } catch (e: any) {
    console.error(`[labeltest-batch] finalize trigger failed job=${jobId}:`, e?.message || e);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  let supabaseAdmin: any = null;
  let supabaseUrl = '';
  let serviceKey = '';
  let jobId: string | null = null;
  let batchIdx: number | null = null;
  try {
    supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => null);
    if (!body?.job_id || typeof body.batch_index !== 'number') {
      return new Response(JSON.stringify({ error: 'job_id and batch_index required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    jobId = body.job_id;
    batchIdx = body.batch_index;
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
    const mlAccount = await resolveJobMlAccount(supabaseAdmin, job, batch);
    if (!mlAccount) throw new Error('ML account not found');

    // Shipments cache
    const { data: shipments } = await supabaseAdmin
      .from('meli_shipments_cache').select('shipment_id, order_id, logistic_type')
      .eq('seller_id', job.seller_id).in('shipment_id', sids);
    const shipMap = new Map((shipments || []).map((s: any) => [s.shipment_id, s]));

    // Step 1: Fetch ZPL batch + safe distribution (com fallback per-shipment automático)
    const fetched = await fetchZplBatchFromMl(sids, mlAccount.access_token);
    const errors: { shipment_id: string; reason_code: string; reason_message: string }[] = [];
    const log: any[] = [];
    let pdfBytes: Uint8Array | null = null; let successCount = 0; let pages = 0;

    const flexSet = new Set<string>(
      sids.filter(sid => shipMap.get(sid)?.logistic_type === 'self_service'),
    );

    let blocksByShipment = new Map<string, string[]>();
    let distErrors: { shipment_id: string; reason_code: string; reason_message: string }[] = [];

    if (!fetched.zpl) {
      console.warn(`[labeltest-batch] job=${jobId} batch=${batchIdx} batch falhou (${fetched.reason_code}), fallback per-shipment`);
      const safe = await distributeZplBlocksSafe([], sids, mlAccount.access_token, {
        flexShipmentIds: flexSet, includeDanfe: layoutInfo.includeDanfe,
      });
      blocksByShipment = safe.blocksByShipment;
      distErrors = safe.errors;
    } else {
      const validation = validateZpl(fetched.zpl);
      if (!validation.valid) {
        console.warn(`[labeltest-batch] job=${jobId} batch=${batchIdx} ZPL inválido, fallback per-shipment`);
        const safe = await distributeZplBlocksSafe([], sids, mlAccount.access_token, {
          flexShipmentIds: flexSet, includeDanfe: layoutInfo.includeDanfe,
        });
        blocksByShipment = safe.blocksByShipment;
        distErrors = safe.errors;
      } else {
        const allBlocks = splitZplBlocks(validation.cleaned);
        console.log(`[labeltest-batch] job=${jobId} batch=${batchIdx} dist: total_blocks=${allBlocks.length} flex=${flexSet.size} coleta=${sids.length - flexSet.size} layout=${layout} includeDanfe=${layoutInfo.includeDanfe}`);
        const safe = await distributeZplBlocksSafe(allBlocks, sids, mlAccount.access_token, {
          flexShipmentIds: flexSet, includeDanfe: layoutInfo.includeDanfe,
        });
        blocksByShipment = safe.blocksByShipment;
        distErrors = safe.errors;
        if (safe.usedFallback) console.warn(`[labeltest-batch] job=${jobId} batch=${batchIdx} fallback per-shipment ativado`);
      }
    }

    // distErrors: warnings DANFE_MISSING não bloqueiam; erros reais sim.
    for (const e of distErrors) {
      if (e.reason_code === 'DANFE_MISSING') {
        log.push({ shipment_id: e.shipment_id, status: 'warning', stage: 'distribute', warning: e.reason_message, reason_code: e.reason_code });
      } else {
        errors.push(e);
        console.error(`[labels:fail] sid=${e.shipment_id} job=${jobId} reason=${e.reason_code}`);
      }
    }

    if (blocksByShipment.size > 0) {
      // Header prefs + orders/items quando layout exige cabeçalho
      let headerPrefs = { ...DEFAULT_HEADER_PREFS };
      const ordersMap = new Map<string, any>();
      const orderItemsMap = new Map<string, any[]>();
      const cartByShipment = new Map<string, { isCart: boolean; itemCount: number; aggregatedItems: any[]; primaryOrder?: any }>();
      if (layoutInfo.includeHeader) {
        const { data: hp } = await supabaseAdmin.from('meli_label_header_preferences').select('*').eq('user_id', job.user_id).eq('seller_id', job.seller_id).maybeSingle();
        if (hp) headerPrefs = { ...DEFAULT_HEADER_PREFS, ...hp };
        headerPrefs.show_variation_attrs = true;
        headerPrefs.show_comment = true;

        // Buscar TODOS os pedidos irmãos pelos shipment_ids do batch (não só o order_id principal).
        // Carrinho = mesmo shipment_id com >1 order_id.
        const { data: allOrders } = await supabaseAdmin
          .from('meli_orders_cache')
          .select('order_id, pack_id, shipment_id, buyer_name, order_comment')
          .eq('seller_id', job.seller_id)
          .in('shipment_id', sids);

        const ordersByShipment = new Map<string, any[]>();
        for (const o of (allOrders || [])) {
          if (!o.shipment_id) continue;
          ordersMap.set(o.order_id, o);
          const arr = ordersByShipment.get(o.shipment_id) || [];
          arr.push(o);
          ordersByShipment.set(o.shipment_id, arr);
        }

        const allOrderIds = (allOrders || []).map((o: any) => o.order_id);
        if (allOrderIds.length > 0) {
          const { data: items } = await supabaseAdmin
            .from('meli_order_items_cache')
            .select('order_id, item_id, variation_id, title, title_short, sku, quantity, variation_attributes')
            .eq('seller_id', job.seller_id)
            .in('order_id', allOrderIds);

          const itemsForEnrich = (items || [])
            .filter((it: any) => it.item_id && it.variation_id && (!Array.isArray(it.variation_attributes) || it.variation_attributes.length === 0))
            .map((it: any) => ({ item_id: it.item_id as string, variation_id: it.variation_id as string }));
          const variationMap = itemsForEnrich.length > 0
            ? await fetchVariationAttributesMap(itemsForEnrich, mlAccount.access_token)
            : new Map<string, { name: string; value_name: string }[]>();

          for (const it of (items || [])) {
            if (it.item_id && it.variation_id && (!Array.isArray(it.variation_attributes) || it.variation_attributes.length === 0)) {
              const enriched = variationMap.get(`${it.item_id}|${it.variation_id}`);
              if (enriched && enriched.length > 0) it.variation_attributes = enriched as any;
            }
            const arr = orderItemsMap.get(it.order_id) || []; arr.push(it); orderItemsMap.set(it.order_id, arr);
          }

          // Detecção de carrinho: shipment_id com >1 pedido irmão
          for (const sid of sids) {
            const siblings = ordersByShipment.get(sid) || [];
            if (siblings.length > 1) {
              const primaryOrderId = shipMap.get(sid)?.order_id;
              const primary = siblings.find((s: any) => s.order_id === primaryOrderId) || siblings[0];
              const aggregated: any[] = [];
              for (const sib of siblings) {
                for (const it of (orderItemsMap.get(sib.order_id) || [])) aggregated.push(it);
              }
              const itemCount = aggregated.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
              cartByShipment.set(sid, { isCart: true, itemCount, aggregatedItems: aggregated, primaryOrder: primary });
              console.log(`[labeltest-batch] cart detected sid=${sid} siblings=${siblings.length} items=${itemCount}`);
            }
          }
        }
      }

      const result = await renderChunkToPdf({
        shipmentIds: sids, zplBlocksByShipment: blocksByShipment, layout,
        shipMap, ordersMap, orderItemsMap, headerPrefs, cartByShipment,
      });
      pdfBytes = result.pdfBytes; successCount = result.successCount; pages = result.pages;
      errors.push(...result.errors); log.push(...result.log);
    }

    const batchPdfB64 = pdfBytes ? uint8ToBase64(pdfBytes) : null;
    const elapsed = Date.now() - t0;
    console.log(`[labeltest-batch] job=${jobId} batch=${batchIdx} done: success=${successCount}/${sids.length} pages=${pages} errors=${errors.length} elapsed=${elapsed}ms`);

    // ─── Atualiza estado via RPC atômica (lock por job_id) ──────────────
    const batchPatch = {
      status: pdfBytes ? 'success' : 'error',
      success_count: successCount,
      error_count: errors.length,
      pages,
      pdf_b64: batchPdfB64,
      completed_at: new Date().toISOString(),
      elapsed_ms: elapsed,
    };
    const logEntries = [
      ...log,
      ...errors.map(e => ({ shipment_id: e.shipment_id, status: 'error', error: e.reason_message, reason_code: e.reason_code, batch_index: batchIdx })),
    ];

    const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc('labeltest_complete_batch', {
      p_job_id: jobId,
      p_batch_index: batchIdx,
      p_batch_patch: batchPatch as any,
      p_success_count: successCount,
      p_log_entries: logEntries as any,
    });
    if (rpcErr) {
      console.error(`[labeltest-batch] RPC error:`, rpcErr);
      throw rpcErr;
    }
    const rpcRow: any = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const allDone: boolean = !!rpcRow?.all_done;

    if (allDone) {
      // Delega merge final ao finalize (CPU isolada). Não bloqueia a resposta.
      // @ts-ignore - EdgeRuntime global
      EdgeRuntime.waitUntil(triggerFinalize(supabaseUrl, serviceKey, jobId));
      console.log(`[labeltest-batch] job=${jobId} all batches done, finalize dispatched`);
    }

    return new Response(JSON.stringify({ ok: true, success_count: successCount, errors: errors.length, all_done: allDone }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error(`[labeltest-batch] Unhandled error:`, error);
    if (supabaseAdmin && jobId && typeof batchIdx === 'number') {
      try {
        const errorMessage = error?.message || 'Internal error';
        const batchPatch = {
          status: 'error',
          success_count: 0,
          error_count: 1,
          pages: 0,
          completed_at: new Date().toISOString(),
          elapsed_ms: Date.now() - t0,
          error: errorMessage,
        };
        const { data: rpcRows } = await supabaseAdmin.rpc('labeltest_complete_batch', {
          p_job_id: jobId,
          p_batch_index: batchIdx,
          p_batch_patch: batchPatch as any,
          p_success_count: 0,
          p_log_entries: [{ status: 'error', reason_code: 'BATCH_WORKER_ERROR', error: errorMessage, batch_index: batchIdx }] as any,
        });
        const rpcRow: any = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        if (rpcRow?.all_done) {
          // @ts-ignore - EdgeRuntime global
          EdgeRuntime.waitUntil(triggerFinalize(supabaseUrl, serviceKey, jobId));
        }
      } catch (markError: any) {
        console.error(`[labeltest-batch] failed to mark batch error:`, markError?.message || markError);
      }
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
