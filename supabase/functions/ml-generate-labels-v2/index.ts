import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.32/index.js";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Physical sizes in points (1mm = 2.83465pt)
const SIZES = {
  'meli_100x150': { widthMm: 100, heightMm: 150, widthPt: 283.46, heightPt: 425.20 },
  'meli_100x150_no_nf': { widthMm: 100, heightMm: 150, widthPt: 283.46, heightPt: 425.20 },
  'mlfacil_100x175_header': { widthMm: 100, heightMm: 175, widthPt: 283.46, heightPt: 496.06 },
};

const MAX_RETRIES = 5;
const HEADER_MIN_HEIGHT_PT = 85;
const HEADER_PADDING_TOP = 8;
const HEADER_LINE_HEIGHT_FACTOR = 1.3;
const SEPARATOR_LINE_Y_OFFSET = 4;

const DEFAULT_HEADER_PREFS = {
  show_customer: true, show_products: true, show_order_id: true,
  show_shipment_id: false, show_comment: true, show_sku: true,
  show_variation_attrs: true,
  line_order: ['customer', 'products', 'order', 'comment'],
  max_product_lines: 5, max_total_lines: 8, font_size: 9,
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

async function fetchSinglePdf(shipmentId: string, token: string): Promise<Uint8Array | null> {
  // 5 retries, tratando 404 como transiente (ML às vezes responde 404 enquanto
  // a etiqueta ainda está sendo gerada do lado deles).
  for (let a = 1; a <= 5; a++) {
    try {
      const r = await fetch(`https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentId}&response_type=pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if ((r.status === 429 || r.status >= 500 || r.status === 404) && a < 5) { await sleep(getBackoff(a)); continue; }
      if (!r.ok) { console.error(`[V2] sid=${shipmentId} HTTP ${r.status} (final)`); return null; }
      return new Uint8Array(await r.arrayBuffer());
    } catch (e: any) { console.error(`[V2] sid=${shipmentId} fetch err attempt=${a}: ${e?.message}`); if (a < 5) await sleep(getBackoff(a)); }
  }
  return null;
}

function isZipFile(b: ArrayBuffer) { const u = new Uint8Array(b); return u.length >= 2 && u[0] === 0x50 && u[1] === 0x4B; }

async function extractZplFromZip(zipBuffer: ArrayBuffer): Promise<string> {
  const blob = new Blob([zipBuffer]);
  const zr = new ZipReader(new BlobReader(blob));
  try { const entries = await zr.getEntries(); const txt = entries.find((e: any) => e.filename.toLowerCase().endsWith('.txt')); if (!txt?.getData) throw new Error('ZPL not found'); return await txt.getData(new TextWriter()); } finally { await zr.close(); }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let b = ''; const cs = 32768;
  for (let i = 0; i < bytes.length; i += cs) { const c = bytes.subarray(i, i + cs); b += String.fromCharCode.apply(null, Array.from(c)); }
  return btoa(b);
}

function hashCode(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36).substring(0, 6);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });

    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    let user: { id: string } | null = null;
    if (claimsError || !claimsData?.claims?.sub) {
      const { data: { user: fb }, error: ue } = await supabaseAuth.auth.getUser();
      if (ue || !fb) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      user = { id: fb.id };
    } else { user = { id: claimsData.claims.sub as string }; }

    // ML API Access Gate
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) return gate.response!;

    const { seller_id, shipment_ids, format, layout = 'meli_100x150' } = await req.json();
    if (!seller_id || !shipment_ids?.length) return new Response(JSON.stringify({ error: 'seller_id and shipment_ids required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!['pdf', 'zpl'].includes(format)) return new Response(JSON.stringify({ error: 'format must be pdf or zpl' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!['meli_100x150', 'mlfacil_100x175_header', 'meli_100x150_no_nf'].includes(layout)) return new Response(JSON.stringify({ error: 'Invalid layout' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const sizeInfo = SIZES[layout as keyof typeof SIZES];
    const startTime = Date.now();
    console.log(`[V2] ${format}/${layout} for ${shipment_ids.length} shipments, seller ${seller_id}`);

    // Get ML account
    const { data: mlAccount } = await supabaseAdmin.from('ml_accounts').select('access_token, ml_user_id').eq('user_id', user.id).eq('ml_user_id', seller_id).eq('is_active', true).maybeSingle();
    if (!mlAccount) return new Response(JSON.stringify({ error: 'ML account not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Validation
    const validationErrors: { shipment_id: string; reason: string }[] = [];
    const validIds: string[] = [];
    const { data: shipments } = await supabaseAdmin.from('meli_shipments_cache').select('shipment_id, order_id, label_available, logistic_type').eq('seller_id', seller_id).in('shipment_id', shipment_ids);
    const shipMap = new Map((shipments || []).map((s: any) => [s.shipment_id, s]));
    const orderIds = (shipments || []).map((s: any) => s.order_id);
    const { data: invoices } = await supabaseAdmin.from('meli_invoices_cache').select('order_id, invoice_status').eq('seller_id', seller_id).in('order_id', orderIds);
    const invMap = new Map((invoices || []).map((i: any) => [i.order_id, i]));
    const s2oMap = new Map<string, string[]>();

    // Live re-check stale invoices
    const stale = orderIds.filter((oid: string) => { const inv = invMap.get(oid); return !inv || inv.invoice_status !== 'emitida'; });
    if (stale.length > 0 && mlAccount.access_token) {
      for (const oid of stale) {
        try {
          const br = await fetch(`https://api.mercadolibre.com/orders/${oid}/billing_info`, { headers: { Authorization: `Bearer ${mlAccount.access_token}` } });
          if (br.ok) {
            const bi = await br.json();
            const dn = bi.billing_info?.doc_number;
            const ai = bi.additional_info?.find((i: any) => i.type === 'invoice');
            if (dn || ai || bi.status === 'invoiced') {
              invMap.set(oid, { order_id: oid, invoice_status: 'emitida' });
              supabaseAdmin.from('meli_invoices_cache').upsert({ user_id: user.id, seller_id, order_id: oid, invoice_status: 'emitida', invoice_number: dn || ai?.doc_number, invoice_key: bi.billing_info?.access_key || ai?.access_key, issued_at: ai?.issue_date || bi.date_created, last_sync_at: new Date().toISOString() }, { onConflict: 'seller_id,order_id' });
            }
          }
          if (!invMap.get(oid) || invMap.get(oid)!.invoice_status !== 'emitida') {
            try { const fr = await fetch(`https://api.mercadolibre.com/packs/${oid}/fiscal_documents`, { headers: { Authorization: `Bearer ${mlAccount.access_token}` } }); if (fr.ok) { const fd = await fr.json(); if (Array.isArray(fd) && fd.length > 0) invMap.set(oid, { order_id: oid, invoice_status: 'emitida' }); } } catch {}
          }
        } catch {}
      }
    }

    for (const sid of shipment_ids) {
      const s = shipMap.get(sid);
      if (!s) { validationErrors.push({ shipment_id: sid, reason: 'Shipment não encontrado' }); continue; }
      if (!s.label_available) { validationErrors.push({ shipment_id: sid, reason: 'Etiqueta não disponível' }); continue; }
      if (s.logistic_type === 'fulfillment') { validationErrors.push({ shipment_id: sid, reason: 'Pedido Full (ML envia)' }); continue; }
      const inv = invMap.get(s.order_id);
      const hasNf = inv?.invoice_status === 'emitida';
      const isFlex = s.logistic_type === 'self_service';
      if (layout === 'mlfacil_100x175_header' && format === 'pdf' && !hasNf && !isFlex) { validationErrors.push({ shipment_id: sid, reason: 'NF não emitida' }); continue; }
      validIds.push(sid);
      s2oMap.set(sid, [s.order_id]);
    }

    if (validIds.length === 0) {
      await supabaseAdmin.from('meli_print_queue_v2').insert({ user_id: user.id, seller_id, format, layout, shipment_ids, total_labels: 0, status: 'erro', error_log: JSON.stringify(validationErrors), job_started_at: new Date().toISOString(), job_completed_at: new Date().toISOString(), duration_ms: Date.now() - startTime });
      return new Response(JSON.stringify({ success: false, validationErrors, message: 'Nenhum envio válido' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create job
    const fileHash = hashCode(`${seller_id}_${validIds.join(',')}_${Date.now()}`);
    const downloadFilename = `etiquetas_v2_${layout}_${validIds.length}un_${fileHash}.${format === 'pdf' ? 'pdf' : 'zpl'}`;
    const { data: job } = await supabaseAdmin.from('meli_print_queue_v2').insert({
      user_id: user.id, seller_id, format, layout, shipment_ids: validIds,
      total_labels: validIds.length, status: 'processando',
      page_width_mm: sizeInfo.widthMm, page_height_mm: sizeInfo.heightMm,
      page_width_pt: sizeInfo.widthPt, page_height_pt: sizeInfo.heightPt,
      download_filename: downloadFilename,
      job_started_at: new Date().toISOString(),
    }).select('id').single();
    const jobId = job?.id;

    let finalPdfBase64: string | null = null;
    let finalZplContent: string | null = null;
    let totalSuccess = 0;
    let totalPages = 0;
    const perShipmentLog: { shipment_id: string; status: string; pages?: number; error?: string }[] = [];

    if (format === 'pdf') {
      const isHeader = layout === 'mlfacil_100x175_header' || layout === 'meli_100x150_no_nf';
      const skipDanfe = layout === 'meli_100x150_no_nf';

      // Load prefs for header layouts
      let prefs = DEFAULT_HEADER_PREFS;
      let headerDataMap = new Map<string, { text: string; bold: boolean }[]>();
      if (isHeader) {
        const { data: pd } = await supabaseAdmin.from('meli_label_header_preferences').select('*').eq('seller_id', seller_id).maybeSingle();
        if (pd) prefs = { show_customer: pd.show_customer, show_products: pd.show_products, show_order_id: pd.show_order_id, show_shipment_id: pd.show_shipment_id, show_comment: pd.show_comment, show_sku: pd.show_sku ?? true, show_variation_attrs: (pd as any).show_variation_attrs ?? true, line_order: pd.line_order as string[], max_product_lines: pd.max_product_lines, max_total_lines: pd.max_total_lines, font_size: pd.font_size };
        // Enrich s2oMap with pack siblings
        const { data: allSO } = await supabaseAdmin.from('meli_orders_cache').select('order_id, pack_id, shipment_id, buyer_name, order_comment').eq('seller_id', seller_id).in('shipment_id', validIds);
        for (const o of (allSO || [])) { if (!o.shipment_id) continue; const e = s2oMap.get(o.shipment_id) || []; if (!e.includes(o.order_id)) e.push(o.order_id); s2oMap.set(o.shipment_id, e); }
        const allOids = [...new Set(validIds.flatMap(sid => s2oMap.get(sid) || []))];
        const { data: itemsData } = await supabaseAdmin.from('meli_order_items_cache').select('order_id, sku, title_short, title, quantity, variation_attributes').eq('seller_id', seller_id).in('order_id', allOids);
        const itemsByOrder = new Map<string, any[]>();
        for (const i of (itemsData || [])) { const e = itemsByOrder.get(i.order_id) || []; e.push(i); itemsByOrder.set(i.order_id, e); }
        for (const sid of validIds) {
          const sOids = s2oMap.get(sid) || [];
          if (sOids.length === 0) continue;
          const primary = (allSO || []).find((o: any) => o.shipment_id === sid);
          if (!primary) continue;
          const allItems: any[] = [];
          for (const oid of sOids) allItems.push(...(itemsByOrder.get(oid) || []));
          headerDataMap.set(sid, buildHeaderLines(prefs, { order_id: primary.pack_id || primary.order_id, shipment_id: primary.shipment_id, buyer_name: primary.buyer_name, order_comment: primary.order_comment }, allItems));
        }
      }

      // Per-shipment skip DANFE set
      const perShipmentSkipDanfe = new Set<string>();
      if (layout === 'mlfacil_100x175_header') {
        for (const sid of validIds) {
          const s = shipMap.get(sid);
          if (s?.logistic_type === 'self_service') { const inv = invMap.get(s.order_id); if (!inv || inv.invoice_status !== 'emitida') perShipmentSkipDanfe.add(sid); }
        }
      }

      const resultPdf = await PDFDocument.create();
      const font = isHeader ? await resultPdf.embedFont(StandardFonts.Helvetica) : null;
      const fontBold = isHeader ? await resultPdf.embedFont(StandardFonts.HelveticaBold) : null;

      for (let idx = 0; idx < validIds.length; idx++) {
        const sid = validIds[idx];
        const pdfBytes = await fetchSinglePdf(sid, mlAccount.access_token);
        if (!pdfBytes) {
          perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'Download failed' });
          // BLOCK ALL
          break;
        }
        let src: Awaited<ReturnType<typeof PDFDocument.load>>;
        try { src = await PDFDocument.load(pdfBytes); } catch (e) {
          perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'Invalid PDF' });
          break;
        }
        const pc = src.getPageCount();
        if (pc === 0) { perShipmentLog.push({ shipment_id: sid, status: 'error', error: '0 pages' }); break; }

        let pagesAdded = 0;
        if (isHeader) {
          const srcPage = src.getPage(0);
          const { width: ow, height: oh } = srcPage.getSize();
          const embedded = await resultPdf.embedPage(srcPage);
          const hLines = headerDataMap.get(sid) || [];
          if (hLines.length > 0) {
            const lh = prefs.font_size * HEADER_LINE_HEIGHT_FACTOR;
            const ch = HEADER_PADDING_TOP + (hLines.length * lh) + SEPARATOR_LINE_Y_OFFSET + 6;
            const hh = Math.max(HEADER_MIN_HEIGHT_PT, ch);
            const nh = oh + hh;
            const np = resultPdf.addPage([ow, nh]);
            np.drawPage(embedded, { x: 0, y: 0, width: ow, height: oh });
            let ty = nh - HEADER_PADDING_TOP - prefs.font_size;
            for (const line of hLines) { np.drawText(line.text, { x: 8, y: ty, size: line.bold ? prefs.font_size + 1 : prefs.font_size, font: line.bold ? fontBold! : font!, color: rgb(0, 0, 0) }); ty -= lh; }
            const hby = oh + SEPARATOR_LINE_Y_OFFSET - 1;
            np.drawRectangle({ x: 3, y: hby, width: ow - 6, height: nh - hby - 2, borderColor: rgb(0.15, 0.15, 0.15), borderWidth: 1.0, color: undefined });
            np.drawLine({ start: { x: 4, y: oh + SEPARATOR_LINE_Y_OFFSET }, end: { x: ow - 4, y: oh + SEPARATOR_LINE_Y_OFFSET }, thickness: 1.2, color: rgb(0.2, 0.2, 0.2) });
          } else {
            const np = resultPdf.addPage([ow, oh]);
            np.drawPage(embedded, { x: 0, y: 0, width: ow, height: oh });
          }
          pagesAdded++;
          const shouldSkip = skipDanfe || perShipmentSkipDanfe.has(sid);
          if (!shouldSkip && pc > 1) { const [dp] = await resultPdf.copyPages(src, [1]); resultPdf.addPage(dp); pagesAdded++; }
        } else {
          // Standard: label + DANFE
          const [lp] = await resultPdf.copyPages(src, [0]);
          resultPdf.addPage(lp);
          pagesAdded++;
          if (pc > 1) { const [dp] = await resultPdf.copyPages(src, [1]); resultPdf.addPage(dp); pagesAdded++; }
        }
        totalSuccess++;
        totalPages += pagesAdded;
        perShipmentLog.push({ shipment_id: sid, status: 'ok', pages: pagesAdded });
        if (idx < validIds.length - 1) await sleep(50);
      }

      const hasErrors = perShipmentLog.some(l => l.status === 'error');
      if (hasErrors) { totalSuccess = 0; totalPages = 0; }
      else if (totalSuccess > 0) { finalPdfBase64 = uint8ToBase64(await resultPdf.save()); }
    } else {
      // ZPL pipeline
      const url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${validIds.join(',')}&response_type=zpl2`;
      for (let a = 1; a <= MAX_RETRIES; a++) {
        try {
          const r = await fetch(url, { headers: { Authorization: `Bearer ${mlAccount.access_token}` } });
          if ((r.status === 429 || r.status >= 500) && a < MAX_RETRIES) { await sleep(getBackoff(a)); continue; }
          if (!r.ok) throw new Error(`ML API ${r.status}`);
          const buf = await r.arrayBuffer();
          finalZplContent = isZipFile(buf) ? await extractZplFromZip(buf) : new TextDecoder('utf-8').decode(buf);
          totalSuccess = validIds.length;
          for (const sid of validIds) perShipmentLog.push({ shipment_id: sid, status: 'ok' });
          break;
        } catch (e: any) {
          if (a >= MAX_RETRIES) { for (const sid of validIds) perShipmentLog.push({ shipment_id: sid, status: 'error', error: e.message }); }
          else await sleep(getBackoff(a));
        }
      }
    }

    const duration = Date.now() - startTime;
    const finalStatus = totalSuccess === 0 ? 'erro' : perShipmentLog.some(l => l.status === 'error') ? 'parcial' : 'concluido';

    if (jobId) {
      await supabaseAdmin.from('meli_print_queue_v2').update({
        status: finalStatus, processed_labels: totalSuccess, total_pages: totalPages,
        per_shipment_log: perShipmentLog, job_completed_at: new Date().toISOString(), duration_ms: duration,
        error_log: finalStatus !== 'concluido' ? JSON.stringify(perShipmentLog.filter(l => l.status === 'error')) : null,
      }).eq('id', jobId);
    }

    console.log(`[V2] Job ${jobId} done: ${totalSuccess}/${validIds.length} labels, ${totalPages} pages, ${duration}ms`);

    return new Response(JSON.stringify({
      success: totalSuccess > 0, job_id: jobId,
      total_labels: totalSuccess, total_pages: totalPages,
      page_width_mm: sizeInfo.widthMm, page_height_mm: sizeInfo.heightMm,
      pdf_base64: finalPdfBase64, zpl_content: finalZplContent,
      download_filename: downloadFilename, duration_ms: duration,
      per_shipment_log: perShipmentLog,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
      error_batches: perShipmentLog.filter(l => l.status === 'error').length,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[V2] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
