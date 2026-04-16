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
const MM_TO_PT = 2.83465;
const SIZES: Record<string, { widthMm: number; heightMm: number; widthPt: number; heightPt: number }> = {
  'meli_100x150': { widthMm: 100, heightMm: 150, widthPt: 100 * MM_TO_PT, heightPt: 150 * MM_TO_PT },
  'meli_100x150_no_nf': { widthMm: 100, heightMm: 150, widthPt: 100 * MM_TO_PT, heightPt: 150 * MM_TO_PT },
  'mlfacil_100x175_header': { widthMm: 100, heightMm: 175, widthPt: 100 * MM_TO_PT, heightPt: 175 * MM_TO_PT },
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

function ptToMm(pt: number): number { return pt / MM_TO_PT; }

async function fetchSinglePdf(shipmentId: string, token: string): Promise<Uint8Array | null> {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch(`https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentId}&response_type=pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if ((r.status === 429 || r.status >= 500) && a < 3) { await sleep(getBackoff(a)); continue; }
      if (!r.ok) return null;
      return new Uint8Array(await r.arrayBuffer());
    } catch { if (a < 3) await sleep(getBackoff(a)); }
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

async function normalizePageToPdf(
  resultPdf: any,
  srcDoc: any,
  pageIndex: number,
  targetWidthPt: number,
  targetHeightPt: number,
  shipmentId: string,
): Promise<{ source_w_mm: number; source_h_mm: number; output_w_mm: number; output_h_mm: number }> {
  const srcPage = srcDoc.getPage(pageIndex);
  const { width: srcW, height: srcH } = srcPage.getSize();
  const srcWmm = ptToMm(srcW);
  const srcHmm = ptToMm(srcH);
  const outWmm = ptToMm(targetWidthPt);
  const outHmm = ptToMm(targetHeightPt);

  console.log(`[labeltest] shipment=${shipmentId} page=${pageIndex} source=${srcWmm.toFixed(1)}x${srcHmm.toFixed(1)}mm target=${outWmm.toFixed(1)}x${outHmm.toFixed(1)}mm`);

  const isCorrectSize = Math.abs(srcW - targetWidthPt) < 2 && Math.abs(srcH - targetHeightPt) < 2;

  if (isCorrectSize) {
    const [copied] = await resultPdf.copyPages(srcDoc, [pageIndex]);
    resultPdf.addPage(copied);
  } else {
    const embedded = await resultPdf.embedPage(srcPage);
    const np = resultPdf.addPage([targetWidthPt, targetHeightPt]);
    const scaleX = targetWidthPt / srcW;
    const scaleY = targetHeightPt / srcH;
    const scale = Math.min(scaleX, scaleY);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const offsetX = (targetWidthPt - drawW) / 2;
    const offsetY = (targetHeightPt - drawH) / 2;
    np.drawPage(embedded, { x: offsetX, y: offsetY, width: drawW, height: drawH });
  }
  return { source_w_mm: srcWmm, source_h_mm: srcHmm, output_w_mm: outWmm, output_h_mm: outHmm };
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

    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) return gate.response!;

    const { seller_id, shipment_ids, format, layout = 'meli_100x150' } = await req.json();
    if (!seller_id || !shipment_ids?.length) return new Response(JSON.stringify({ error: 'seller_id and shipment_ids required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!['pdf', 'zpl'].includes(format)) return new Response(JSON.stringify({ error: 'format must be pdf or zpl' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!['meli_100x150', 'mlfacil_100x175_header', 'meli_100x150_no_nf'].includes(layout)) return new Response(JSON.stringify({ error: 'Invalid layout' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const sizeInfo = SIZES[layout as keyof typeof SIZES];
    const startTime = Date.now();
    
    const { data: mlAccount } = await supabaseAdmin.from('ml_accounts').select('access_token, ml_user_id').eq('user_id', user.id).eq('ml_user_id', seller_id).eq('is_active', true).maybeSingle();
    if (!mlAccount) return new Response(JSON.stringify({ error: 'ML account not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const validationErrors: { shipment_id: string; reason: string }[] = [];
    const validIds: string[] = [];
    const { data: shipments } = await supabaseAdmin.from('meli_shipments_cache').select('shipment_id, order_id, label_available, logistic_type').eq('seller_id', seller_id).in('shipment_id', shipment_ids);
    const shipMap = new Map((shipments || []).map((s: any) => [s.shipment_id, s]));
    const orderIds = (shipments || []).map((s: any) => s.order_id);
    const { data: invoices } = await supabaseAdmin.from('meli_invoices_cache').select('order_id, invoice_status').eq('seller_id', seller_id).in('order_id', orderIds);
    const invMap = new Map((invoices || []).map((i: any) => [i.order_id, i]));
    const s2oMap = new Map<string, string[]>();

    for (const sid of shipment_ids) {
      const s = shipMap.get(sid);
      if (!s) { validationErrors.push({ shipment_id: sid, reason: 'Shipment não encontrado' }); continue; }
      if (!s.label_available) { validationErrors.push({ shipment_id: sid, reason: 'Etiqueta não disponível' }); continue; }
      if (s.logistic_type === 'fulfillment') { validationErrors.push({ shipment_id: sid, reason: 'Pedido Full (ML envia)' }); continue; }
      validIds.push(sid);
      s2oMap.set(sid, [s.order_id]);
    }

    if (validIds.length === 0) {
      return new Response(JSON.stringify({ success: false, validationErrors, message: 'Nenhum envio válido' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const fileHash = hashCode(`${seller_id}_${validIds.join(',')}_${Date.now()}`);
    const downloadFilename = `etiquetas_labeltest_${layout}_${validIds.length}un_${fileHash}.${format === 'pdf' ? 'pdf' : 'zpl'}`;
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
    let finalZplContent: string | null = null;
    let totalSuccess = 0;
    let totalPages = 0;
    const perShipmentLog: any[] = [];

    const labelTargetWPt = sizeInfo.widthPt;
    const labelTargetHPt = layout === 'mlfacil_100x175_header' ? 150 * MM_TO_PT : sizeInfo.heightPt;
    const danfeTargetWPt = sizeInfo.widthPt;
    const danfeTargetHPt = 150 * MM_TO_PT;

    if (format === 'pdf') {
      const isHeader = layout === 'mlfacil_100x175_header';
      const resultPdf = await PDFDocument.create();
      const font = isHeader ? await resultPdf.embedFont(StandardFonts.Helvetica) : null;
      const fontBold = isHeader ? await resultPdf.embedFont(StandardFonts.HelveticaBold) : null;

      for (let idx = 0; idx < validIds.length; idx++) {
        const sid = validIds[idx];
        const pdfBytes = await fetchSinglePdf(sid, mlAccount.access_token);
        if (!pdfBytes) { perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'Download failed' }); continue; }
        let src: any;
        try { src = await PDFDocument.load(pdfBytes); } catch (e) { perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'Invalid PDF' }); continue; }
        const pc = src.getPageCount();
        
        if (isHeader) {
          const embedded = await resultPdf.embedPage(src.getPage(0));
          const np = resultPdf.addPage([labelTargetWPt, labelTargetHPt + 25 * MM_TO_PT]);
          const scale = Math.min(labelTargetWPt / src.getPage(0).getWidth(), labelTargetHPt / src.getPage(0).getHeight());
          np.drawPage(embedded, { x: (labelTargetWPt - src.getPage(0).getWidth() * scale) / 2, y: 0, width: src.getPage(0).getWidth() * scale, height: src.getPage(0).getHeight() * scale });
          pagesAdded++;
        } else {
          await normalizePageToPdf(resultPdf, src, 0, sizeInfo.widthPt, sizeInfo.heightPt, sid);
          pagesAdded++;
          if (pc > 1) { await normalizePageToPdf(resultPdf, src, 1, danfeTargetWPt, danfeTargetHPt, sid); pagesAdded++; }
        }
        totalSuccess++;
        totalPages += pagesAdded;
      }
      finalPdfBase64 = uint8ToBase64(await resultPdf.save());
    }

    await supabaseAdmin.from('meli_print_queue_v2').update({ status: 'concluido', processed_labels: totalSuccess, total_pages: totalPages, job_completed_at: new Date().toISOString() }).eq('id', jobId);
    return new Response(JSON.stringify({ success: true, pdf_base64: finalPdfBase64 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
