import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

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

const MM_TO_PT = 2.83465;
const SIZES: Record<string, { widthMm: number; heightMm: number; widthPt: number; heightPt: number }> = {
  'meli_100x150': { widthMm: 100, heightMm: 150, widthPt: 100 * MM_TO_PT, heightPt: 150 * MM_TO_PT },
  'meli_100x150_no_nf': { widthMm: 100, heightMm: 150, widthPt: 100 * MM_TO_PT, heightPt: 150 * MM_TO_PT },
  'mlfacil_100x175_header': { widthMm: 100, heightMm: 175, widthPt: 100 * MM_TO_PT, heightPt: 175 * MM_TO_PT },
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const getBackoff = (attempt: number) => Math.pow(2, attempt - 1) * 1000;

function truncate(t: string, max: number) { return t.length <= max ? t : t.substring(0, max - 3) + '...'; }
function sanitize(t: string | null | undefined, max = 90) { if (!t) return ''; return truncate(t.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(), max); }

function wrapTextLines(text: string, maxChars: number): string[] {
  if (!text || text.length <= maxChars) return [text];
  const words = text.split(' '); const result: string[] = []; let current = '';
  for (const w of words) { if (!current) current = w; else if (current.length + 1 + w.length <= maxChars) current += ' ' + w; else { result.push(current); current = w; } }
  if (current) result.push(current);
  return result.length > 0 ? result : [text];
}

function buildProductLines(items: any[], maxLines: number, showSku: boolean, showVarAttrs: boolean, maxLen = 58) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.quantity !== a.quantity ? b.quantity - a.quantity : (a.sku || a.title_short || '').localeCompare(b.sku || b.title_short || ''));
  const lines: { text: string; bold: boolean }[] = [];
  for (const item of sorted) {
    if (lines.length >= maxLines) break;
    const title = sanitize(item.title || item.title_short || item.sku || 'Item', 200);
    for (const tl of wrapTextLines(title, maxLen)) { if (lines.length >= maxLines) break; lines.push({ text: tl, bold: true }); }
    if (lines.length < maxLines) { const sku = showSku && item.sku ? ` - Apelido: ${item.sku}` : ''; lines.push({ text: truncate(`Quantidade: ${item.quantity}${sku}`, maxLen), bold: false }); }
    if (showVarAttrs && item.variation_attributes && lines.length < maxLines) { for (const a of item.variation_attributes) { if (lines.length >= maxLines) break; const n = a?.name || a?.id || ''; const v = a?.value_name || a?.value || ''; if (n && v) lines.push({ text: truncate(`${n}: ${v}`, maxLen), bold: false }); } }
  }
  return lines;
}

const DEFAULT_HEADER_PREFS = {
  show_customer: true, show_products: true, show_order_id: true,
  show_shipment_id: false, show_comment: true, show_sku: true,
  show_variation_attrs: true,
  line_order: ['customer', 'products', 'order', 'comment'],
  max_product_lines: 5, max_total_lines: 8, font_size: 9,
};

function buildHeaderLines(prefs: typeof DEFAULT_HEADER_PREFS, order: any, items: any[]) {
  const contents: Record<string, { text: string; bold: boolean }[]> = { customer: [], products: [], order: [], shipment: [], comment: [] };
  if (prefs.show_customer && order.buyer_name) contents.customer = [{ text: sanitize(order.buyer_name, 40), bold: false }];
  if (prefs.show_products && items.length > 0) contents.products = buildProductLines(items, prefs.max_product_lines, prefs.show_sku ?? true, prefs.show_variation_attrs ?? true);
  if (prefs.show_order_id) contents.order = [{ text: `Pedido: ${order.order_id}`, bold: false }];
  if (prefs.show_shipment_id && order.shipment_id) contents.shipment = [{ text: `Envio: ${order.shipment_id}`, bold: false }];
  if (prefs.show_comment && order.order_comment) { const c = sanitize(order.order_comment, 60); if (c) contents.comment = [{ text: `Obs: ${c}`, bold: false }]; }
  const lines: { text: string; bold: boolean }[] = [];
  if (contents.customer.length > 0) for (const l of contents.customer) { if (lines.length >= prefs.max_total_lines) break; lines.push(l); }
  for (const lt of prefs.line_order) { if (lt === 'customer') continue; for (const l of (contents[lt] || [])) { if (lines.length >= prefs.max_total_lines) break; lines.push(l); } if (lines.length >= prefs.max_total_lines) break; }
  return lines;
}

function ptToMm(pt: number): number { return pt / MM_TO_PT; }

function hashCode(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36).substring(0, 6);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let b = ''; const cs = 32768;
  for (let i = 0; i < bytes.length; i += cs) { const c = bytes.subarray(i, i + cs); b += String.fromCharCode.apply(null, Array.from(c)); }
  return btoa(b);
}

async function fetchSinglePdf(shipmentId: string, token: string): Promise<Uint8Array | null> {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch(`https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentId}&response_type=pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if ((r.status === 429 || r.status >= 500) && a < 3) { await sleep(getBackoff(a)); continue; }
      if (!r.ok) {
        console.error(`[labeltest] ML API error for ${shipmentId}: ${r.status} ${r.statusText}`);
        return null;
      }
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      console.error(`[labeltest] fetch error for ${shipmentId} attempt ${a}:`, e);
      if (a < 3) await sleep(getBackoff(a));
    }
  }
  return null;
}

async function normalizePageToPdf(
  resultPdf: any, srcDoc: any, pageIndex: number,
  targetWidthPt: number, targetHeightPt: number, shipmentId: string,
): Promise<{ source_w_mm: number; source_h_mm: number; output_w_mm: number; output_h_mm: number }> {
  const srcPage = srcDoc.getPage(pageIndex);
  const { width: srcW, height: srcH } = srcPage.getSize();
  const srcWmm = ptToMm(srcW); const srcHmm = ptToMm(srcH);
  const outWmm = ptToMm(targetWidthPt); const outHmm = ptToMm(targetHeightPt);
  console.log(`[labeltest] shipment=${shipmentId} page=${pageIndex} source=${srcWmm.toFixed(1)}x${srcHmm.toFixed(1)}mm target=${outWmm.toFixed(1)}x${outHmm.toFixed(1)}mm`);

  const isCorrectSize = Math.abs(srcW - targetWidthPt) < 2 && Math.abs(srcH - targetHeightPt) < 2;
  if (isCorrectSize) {
    const [copied] = await resultPdf.copyPages(srcDoc, [pageIndex]);
    resultPdf.addPage(copied);
  } else {
    const embedded = await resultPdf.embedPage(srcPage);
    const np = resultPdf.addPage([targetWidthPt, targetHeightPt]);
    const scale = Math.min(targetWidthPt / srcW, targetHeightPt / srcH);
    const drawW = srcW * scale; const drawH = srcH * scale;
    np.drawPage(embedded, { x: (targetWidthPt - drawW) / 2, y: (targetHeightPt - drawH) / 2, width: drawW, height: drawH });
  }
  return { source_w_mm: srcWmm, source_h_mm: srcHmm, output_w_mm: outWmm, output_h_mm: outHmm };
}

const HEADER_HEIGHT_PT = 25 * MM_TO_PT;
const LABEL_150_PT = 150 * MM_TO_PT;
const HEADER_PADDING_TOP = 8;
const HEADER_LINE_HEIGHT_FACTOR = 1.3;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return respond(false, { error: 'Missing auth' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return respond(false, { error: 'Not authenticated' });

    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) return respond(false, { error: 'Access denied', error_code: 'TRIAL_EXPIRED' });

    let body: any;
    try { body = await req.json(); } catch { return respond(false, { error: 'Invalid JSON body' }); }

    const { seller_id, shipment_ids, format, layout = 'meli_100x150' } = body;
    if (!seller_id || !shipment_ids?.length) return respond(false, { error: 'seller_id and shipment_ids required' });
    if (!['pdf', 'zpl'].includes(format)) return respond(false, { error: 'format must be pdf or zpl' });
    if (!SIZES[layout]) return respond(false, { error: 'Invalid layout' });

    const sizeInfo = SIZES[layout];
    console.log(`[labeltest] Starting job: seller=${seller_id} format=${format} layout=${layout} shipments=${shipment_ids.length}`);

    const { data: mlAccount } = await supabaseAdmin
      .from('ml_accounts').select('access_token, ml_user_id')
      .eq('user_id', user.id).eq('ml_user_id', seller_id).eq('is_active', true).maybeSingle();
    if (!mlAccount) return respond(false, { error: 'ML account not found' });

    // Validate shipments
    const validationErrors: { shipment_id: string; reason: string }[] = [];
    const validIds: string[] = [];
    const { data: shipments } = await supabaseAdmin
      .from('meli_shipments_cache').select('shipment_id, order_id, label_available, logistic_type')
      .eq('seller_id', seller_id).in('shipment_id', shipment_ids);
    const shipMap = new Map((shipments || []).map((s: any) => [s.shipment_id, s]));

    for (const sid of shipment_ids) {
      const s = shipMap.get(sid);
      if (!s) { validationErrors.push({ shipment_id: sid, reason: 'Shipment não encontrado' }); continue; }
      if (!s.label_available) { validationErrors.push({ shipment_id: sid, reason: 'Etiqueta não disponível' }); continue; }
      if (s.logistic_type === 'fulfillment') { validationErrors.push({ shipment_id: sid, reason: 'Pedido Full (ML envia)' }); continue; }
      validIds.push(sid);
    }

    if (validIds.length === 0) {
      return respond(false, { error: 'Nenhum envio válido', validationErrors });
    }

    const fileHash = hashCode(`${seller_id}_${validIds.join(',')}_${Date.now()}`);
    const ext = format === 'pdf' ? 'pdf' : 'zpl';
    const downloadFilename = `etiquetas_labeltest_${layout}_${validIds.length}un_${fileHash}.${ext}`;

    const { data: job } = await supabaseAdmin.from('meli_print_queue_v2').insert({
      user_id: user.id, seller_id, format, layout, shipment_ids: validIds,
      total_labels: validIds.length, status: 'processando',
      page_width_mm: sizeInfo.widthMm, page_height_mm: sizeInfo.heightMm,
      download_filename: downloadFilename,
      job_started_at: new Date().toISOString(),
      module: 'labeltest',
    }).select('id').single();
    const jobId = job?.id;

    let finalPdfBase64: string | null = null;
    let totalSuccess = 0;
    let totalPages = 0;
    const perShipmentLog: any[] = [];

    if (format === 'pdf') {
      const isHeader = layout === 'mlfacil_100x175_header';
      const resultPdf = await PDFDocument.create();
      let font: any = null;
      let fontBold: any = null;
      if (isHeader) {
        font = await resultPdf.embedFont(StandardFonts.Helvetica);
        fontBold = await resultPdf.embedFont(StandardFonts.HelveticaBold);
      }

      // Load header prefs + order data for header layout
      let headerPrefs = { ...DEFAULT_HEADER_PREFS };
      let orderItemsMap = new Map<string, any[]>();
      let ordersMap = new Map<string, any>();

      if (isHeader) {
        const { data: hp } = await supabaseAdmin
          .from('shipping_label_header_prefs').select('*')
          .eq('user_id', user.id).eq('seller_id', seller_id).maybeSingle();
        if (hp) headerPrefs = { ...DEFAULT_HEADER_PREFS, ...hp };

        const orderIds = validIds.map(sid => shipMap.get(sid)?.order_id).filter(Boolean);
        if (orderIds.length > 0) {
          const { data: orders } = await supabaseAdmin
            .from('meli_orders_cache').select('order_id, buyer_name, order_comment')
            .eq('seller_id', seller_id).in('order_id', orderIds);
          for (const o of (orders || [])) ordersMap.set(o.order_id, o);

          const { data: items } = await supabaseAdmin
            .from('meli_order_items_cache').select('order_id, title, title_short, sku, quantity, variation_attributes')
            .in('order_id', orderIds);
          for (const item of (items || [])) {
            const arr = orderItemsMap.get(item.order_id) || [];
            arr.push(item);
            orderItemsMap.set(item.order_id, arr);
          }
        }
      }

      for (const sid of validIds) {
        let pagesAdded = 0;
        const pdfBytes = await fetchSinglePdf(sid, mlAccount.access_token);
        if (!pdfBytes) {
          perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'Download failed' });
          continue;
        }

        let src: any;
        try { src = await PDFDocument.load(pdfBytes); } catch (e: any) {
          perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'Invalid PDF: ' + e.message });
          continue;
        }

        const pc = src.getPageCount();
        console.log(`[labeltest] shipment=${sid} pages_in_source=${pc}`);

        if (isHeader) {
          // Header layout: label page normalized to 100x150, then add 25mm header on top = 100x175
          const labelPageIdx = 0;
          const fullPageH = sizeInfo.heightPt; // 175mm
          const labelH = LABEL_150_PT; // 150mm

          const dims = await normalizePageToPdf(resultPdf, src, labelPageIdx, sizeInfo.widthPt, fullPageH, sid);
          // Now overlay the header text in the top 25mm area
          const lastPageIdx = resultPdf.getPageCount() - 1;
          const page = resultPdf.getPage(lastPageIdx);

          const orderId = shipMap.get(sid)?.order_id;
          const orderData = ordersMap.get(orderId) || { order_id: orderId, buyer_name: '', shipment_id: sid };
          const orderItems = orderItemsMap.get(orderId) || [];
          const lines = buildHeaderLines(headerPrefs, { ...orderData, shipment_id: sid }, orderItems);

          const fontSize = headerPrefs.font_size || 9;
          const lineH = fontSize * HEADER_LINE_HEIGHT_FACTOR;
          let yPos = fullPageH - HEADER_PADDING_TOP;

          for (const line of lines) {
            const f = line.bold ? fontBold : font;
            page.drawText(line.text, { x: 8, y: yPos, size: fontSize, font: f, color: rgb(0, 0, 0) });
            yPos -= lineH;
          }

          // Separator line
          page.drawLine({
            start: { x: 4, y: fullPageH - HEADER_HEIGHT_PT + 2 },
            end: { x: sizeInfo.widthPt - 4, y: fullPageH - HEADER_HEIGHT_PT + 2 },
            thickness: 0.5, color: rgb(0.5, 0.5, 0.5),
          });

          pagesAdded = 1;

          // Add DANFE if exists (page 2+)
          if (pc > 1) {
            await normalizePageToPdf(resultPdf, src, 1, sizeInfo.widthPt, LABEL_150_PT, sid);
            pagesAdded++;
          }
        } else if (layout === 'meli_100x150_no_nf') {
          // Only first page (label), skip DANFE
          await normalizePageToPdf(resultPdf, src, 0, sizeInfo.widthPt, sizeInfo.heightPt, sid);
          pagesAdded = 1;
        } else {
          // Standard: all pages normalized
          for (let pi = 0; pi < pc; pi++) {
            const targetH = pi === 0 ? sizeInfo.heightPt : LABEL_150_PT;
            await normalizePageToPdf(resultPdf, src, pi, sizeInfo.widthPt, targetH, sid);
            pagesAdded++;
          }
        }

        totalSuccess++;
        totalPages += pagesAdded;
        perShipmentLog.push({ shipment_id: sid, status: 'ok', pages: pagesAdded });
      }

      const pdfBytes = await resultPdf.save();
      finalPdfBase64 = uint8ToBase64(pdfBytes);
      console.log(`[labeltest] PDF built: ${totalSuccess}/${validIds.length} shipments, ${totalPages} pages, ${(pdfBytes.length / 1024).toFixed(0)}KB`);
    } else {
      // ZPL format - fetch each shipment as ZPL
      const zplParts: string[] = [];
      for (const sid of validIds) {
        for (let a = 1; a <= 3; a++) {
          try {
            const r = await fetch(`https://api.mercadolibre.com/shipment_labels?shipment_ids=${sid}&response_type=zpl2`, {
              headers: { Authorization: `Bearer ${mlAccount.access_token}` },
            });
            if ((r.status === 429 || r.status >= 500) && a < 3) { await sleep(getBackoff(a)); continue; }
            if (!r.ok) { perShipmentLog.push({ shipment_id: sid, status: 'error', error: `ML ${r.status}` }); break; }
            const txt = await r.text();
            zplParts.push(txt);
            totalSuccess++;
            totalPages++;
            perShipmentLog.push({ shipment_id: sid, status: 'ok' });
            break;
          } catch (e) { if (a >= 3) perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'Network error' }); else await sleep(getBackoff(a)); }
        }
      }
      // ZPL doesn't need base64, return as text
      finalPdfBase64 = null;
    }

    const elapsed = Date.now() - t0;
    const finalStatus = totalSuccess === validIds.length ? 'concluido' : totalSuccess > 0 ? 'parcial' : 'erro';

    if (jobId) {
      await supabaseAdmin.from('meli_print_queue_v2').update({
        status: finalStatus,
        processed_labels: totalSuccess,
        total_pages: totalPages,
        job_completed_at: new Date().toISOString(),
      }).eq('id', jobId);
    }

    console.log(`[labeltest] Job complete: status=${finalStatus} ${totalSuccess}/${validIds.length} in ${elapsed}ms`);

    return respond(true, {
      data: {
        job_id: jobId,
        pdf_base64: finalPdfBase64,
        total_success: totalSuccess,
        total_pages: totalPages,
        validation_errors: validationErrors,
        per_shipment: perShipmentLog,
        layout,
        page_width_mm: sizeInfo.widthMm,
        page_height_mm: sizeInfo.heightMm,
        processing_time_ms: elapsed,
        download_filename: downloadFilename,
      },
    });
  } catch (error: any) {
    console.error(`[labeltest] Unhandled error:`, error);
    return respond(false, {
      error: error.message || 'Internal server error',
      diagnostics: { error_stage: 'unhandled', processing_time_ms: Date.now() - t0 },
    });
  }
});
