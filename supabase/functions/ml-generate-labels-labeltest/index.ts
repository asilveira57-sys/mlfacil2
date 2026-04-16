import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function respond(ok: boolean, payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Layout sizes (mm) ──────────────────────────────────────────────
const MM_TO_PT = 2.83465;
const LABEL_W_MM = 100;
const LABEL_H_MM = 150;
const HEADER_H_MM = 25;

const LAYOUTS: Record<string, { widthMm: number; heightMm: number; includeHeader: boolean; includeDanfe: boolean }> = {
  'meli_100x150':               { widthMm: 100, heightMm: 150, includeHeader: false, includeDanfe: true },
  'meli_100x150_no_nf':         { widthMm: 100, heightMm: 150, includeHeader: false, includeDanfe: false },
  'mlfacil_100x175_header':     { widthMm: 100, heightMm: 175, includeHeader: true,  includeDanfe: true },
};

// Labelary ZPL→PNG config (legacy-faithful)
const LABELARY_DPI = 8;        // 8 dpmm = 203 DPI (thermal standard)
const LABELARY_W_INCH = 4;     // ~101.6mm
const LABELARY_H_INCH = 6;     // ~152.4mm
const LABELARY_URL = `http://api.labelary.com/v1/printers/${LABELARY_DPI}dpmm/labels/${LABELARY_W_INCH}x${LABELARY_H_INCH}/0/`;

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

// ─── ZPL fetch from ML API ──────────────────────────────────────────
async function fetchZplFromMl(shipmentId: string, token: string): Promise<string | null> {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch(
        `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentId}&response_type=zpl2`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if ((r.status === 429 || r.status >= 500) && a < 3) { await sleep(getBackoff(a)); continue; }
      if (!r.ok) {
        console.error(`[labeltest] ML ZPL error for ${shipmentId}: ${r.status}`);
        return null;
      }
      return await r.text();
    } catch (e) {
      console.error(`[labeltest] ZPL fetch error ${shipmentId} attempt ${a}:`, e);
      if (a < 3) await sleep(getBackoff(a));
    }
  }
  return null;
}

// ─── ZPL → PNG via Labelary (legacy-faithful) ───────────────────────
async function zplToImage(zplContent: string, shipmentId: string): Promise<Uint8Array | null> {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch(LABELARY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'image/png' },
        body: zplContent,
      });
      if ((r.status === 429 || r.status >= 500) && a < 3) { await sleep(getBackoff(a) + 200); continue; }
      if (!r.ok) {
        console.error(`[labeltest] Labelary error for ${shipmentId}: ${r.status}`);
        return null;
      }
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      console.error(`[labeltest] Labelary error ${shipmentId} attempt ${a}:`, e);
      if (a < 3) await sleep(getBackoff(a));
    }
  }
  return null;
}

// ─── Fetch DANFE PDF from ML (for layouts that need it) ─────────────
async function fetchDanfePdf(shipmentId: string, token: string): Promise<Uint8Array | null> {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch(
        `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentId}&response_type=pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if ((r.status === 429 || r.status >= 500) && a < 3) { await sleep(getBackoff(a)); continue; }
      if (!r.ok) return null;
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      if (a < 3) await sleep(getBackoff(a));
    }
  }
  return null;
}

const HEADER_HEIGHT_PT = HEADER_H_MM * MM_TO_PT;
const LABEL_W_PT = LABEL_W_MM * MM_TO_PT;
const LABEL_H_PT = LABEL_H_MM * MM_TO_PT;
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
    if (!LAYOUTS[layout]) return respond(false, { error: 'Invalid layout' });

    const layoutInfo = LAYOUTS[layout];
    const targetWPt = layoutInfo.widthMm * MM_TO_PT;
    const targetHPt = layoutInfo.heightMm * MM_TO_PT;

    console.log(`[labeltest] Starting: seller=${seller_id} format=${format} layout=${layout} size=${layoutInfo.widthMm}x${layoutInfo.heightMm}mm shipments=${shipment_ids.length}`);

    // Get ML account
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
      return respond(false, { error: 'Nenhum envio válido', validation_errors: validationErrors });
    }

    const fileHash = hashCode(`${seller_id}_${validIds.join(',')}_${Date.now()}`);
    const ext = format === 'pdf' ? 'pdf' : 'zpl';
    const downloadFilename = `etiquetas_labeltest_${layout}_${validIds.length}un_${fileHash}.${ext}`;

    // Create job record
    const { data: job } = await supabaseAdmin.from('meli_print_queue_v2').insert({
      user_id: user.id, seller_id, format, layout, shipment_ids: validIds,
      total_labels: validIds.length, status: 'processando',
      page_width_mm: layoutInfo.widthMm, page_height_mm: layoutInfo.heightMm,
      download_filename: downloadFilename,
      job_started_at: new Date().toISOString(),
      module: 'labeltest',
    } as any).select('id').single();
    const jobId = job?.id;

    let finalPdfBase64: string | null = null;
    let finalZplContent: string | null = null;
    let totalSuccess = 0;
    let totalPages = 0;
    const perShipmentLog: any[] = [];

    // ─────────────────────────────────────────────────────────────────
    // STEP 1: Fetch ZPL for ALL shipments from ML API
    // ─────────────────────────────────────────────────────────────────
    console.log(`[labeltest] Step 1: Fetching ZPL for ${validIds.length} shipments`);
    const zplByShipment = new Map<string, string>();

    for (const sid of validIds) {
      const zpl = await fetchZplFromMl(sid, mlAccount.access_token);
      if (zpl) {
        zplByShipment.set(sid, zpl);
        console.log(`[labeltest] ZPL fetched: ${sid} (${zpl.length} chars)`);
      } else {
        perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'ZPL download failed from ML' });
        console.error(`[labeltest] ZPL failed: ${sid}`);
      }
      // Rate limit between ML calls
      if (validIds.indexOf(sid) < validIds.length - 1) await sleep(150);
    }

    if (format === 'zpl') {
      // ─── ZPL format: just concatenate and return ────────────────
      const zplParts: string[] = [];
      for (const sid of validIds) {
        const zpl = zplByShipment.get(sid);
        if (zpl) {
          zplParts.push(zpl);
          totalSuccess++;
          totalPages++;
          perShipmentLog.push({ shipment_id: sid, status: 'ok' });
        }
      }
      finalZplContent = zplParts.join('\n');
    } else {
      // ─── PDF format: ZPL → Labelary PNG → pdf-lib PDF ──────────
      // STEP 2: Convert ZPL to PNG via Labelary
      console.log(`[labeltest] Step 2: Converting ${zplByShipment.size} ZPLs to PNG via Labelary`);
      const imageByShipment = new Map<string, Uint8Array>();

      for (const [sid, zpl] of zplByShipment) {
        const png = await zplToImage(zpl, sid);
        if (png) {
          imageByShipment.set(sid, png);
          console.log(`[labeltest] Labelary OK: ${sid} (${(png.length / 1024).toFixed(0)}KB)`);
        } else {
          perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'Labelary conversion failed' });
          console.error(`[labeltest] Labelary failed: ${sid}`);
        }
        // Rate limit between Labelary calls
        await sleep(200);
      }

      // STEP 3: Build PDF with fixed dimensions (legacy-faithful)
      console.log(`[labeltest] Step 3: Building PDF, layout=${layout}`);
      const resultPdf = await PDFDocument.create();

      // Load fonts for header layout
      let font: any = null;
      let fontBold: any = null;
      if (layoutInfo.includeHeader) {
        font = await resultPdf.embedFont(StandardFonts.Helvetica);
        fontBold = await resultPdf.embedFont(StandardFonts.HelveticaBold);
      }

      // Load header prefs + order data
      let headerPrefs = { ...DEFAULT_HEADER_PREFS };
      const orderItemsMap = new Map<string, any[]>();
      const ordersMap = new Map<string, any>();

      if (layoutInfo.includeHeader) {
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

      // STEP 4: For each shipment, embed label image into PDF page
      for (const sid of validIds) {
        const imgBytes = imageByShipment.get(sid);
        if (!imgBytes) continue; // already logged as error

        try {
          const pngImage = await resultPdf.embedPng(imgBytes);

          if (layoutInfo.includeHeader) {
            // ─── Header layout: 100x175mm ─────────────────────────
            // Top 25mm = header text, bottom 150mm = label image
            const page = resultPdf.addPage([targetWPt, targetHPt]);

            // Draw label image in bottom 150mm area (full width)
            const labelAreaY = 0;
            const labelAreaH = LABEL_H_PT;
            const imgAspect = pngImage.width / pngImage.height;
            const targetAspect = LABEL_W_PT / labelAreaH;

            let drawW: number, drawH: number, drawX: number, drawY: number;
            if (imgAspect > targetAspect) {
              // Image wider: fit to width
              drawW = LABEL_W_PT;
              drawH = LABEL_W_PT / imgAspect;
              drawX = 0;
              drawY = labelAreaY + (labelAreaH - drawH) / 2;
            } else {
              // Image taller: fit to height
              drawH = labelAreaH;
              drawW = labelAreaH * imgAspect;
              drawX = (LABEL_W_PT - drawW) / 2;
              drawY = labelAreaY;
            }
            page.drawImage(pngImage, { x: drawX, y: drawY, width: drawW, height: drawH });

            // Draw header text in top 25mm
            const orderId = shipMap.get(sid)?.order_id;
            const orderData = ordersMap.get(orderId) || { order_id: orderId, buyer_name: '', shipment_id: sid };
            const orderItems = orderItemsMap.get(orderId) || [];
            const lines = buildHeaderLines(headerPrefs, { ...orderData, shipment_id: sid }, orderItems);

            const fontSize = headerPrefs.font_size || 9;
            const lineH = fontSize * HEADER_LINE_HEIGHT_FACTOR;
            let yPos = targetHPt - HEADER_PADDING_TOP;

            for (const line of lines) {
              const f = line.bold ? fontBold : font;
              page.drawText(line.text, { x: 8, y: yPos, size: fontSize, font: f, color: rgb(0, 0, 0) });
              yPos -= lineH;
            }

            // Separator line between header and label
            const sepY = LABEL_H_PT;
            page.drawLine({
              start: { x: 4, y: sepY },
              end: { x: LABEL_W_PT - 4, y: sepY },
              thickness: 0.5, color: rgb(0.5, 0.5, 0.5),
            });

            totalPages++;
          } else {
            // ─── Standard/no-NF layout: 100x150mm ────────────────
            const page = resultPdf.addPage([targetWPt, targetHPt]);

            // Fit image to full page (0 margins, like legacy)
            const imgAspect = pngImage.width / pngImage.height;
            const pageAspect = targetWPt / targetHPt;

            let drawW: number, drawH: number, drawX: number, drawY: number;
            if (imgAspect > pageAspect) {
              drawW = targetWPt;
              drawH = targetWPt / imgAspect;
              drawX = 0;
              drawY = (targetHPt - drawH) / 2;
            } else {
              drawH = targetHPt;
              drawW = targetHPt * imgAspect;
              drawX = (targetWPt - drawW) / 2;
              drawY = 0;
            }
            page.drawImage(pngImage, { x: drawX, y: drawY, width: drawW, height: drawH });
            totalPages++;
          }

          // If DANFE is needed and layout includes it, fetch PDF and embed DANFE page
          if (layoutInfo.includeDanfe && layout !== 'meli_100x150_no_nf') {
            const danfeBytes = await fetchDanfePdf(sid, mlAccount.access_token);
            if (danfeBytes) {
              try {
                const danfePdf = await PDFDocument.load(danfeBytes);
                const pageCount = danfePdf.getPageCount();
                // DANFE is typically the 2nd page in ML's PDF
                if (pageCount > 1) {
                  const [danfePage] = await resultPdf.copyPages(danfePdf, [1]);
                  resultPdf.addPage(danfePage);
                  totalPages++;
                  console.log(`[labeltest] DANFE added for ${sid}`);
                }
              } catch (de) {
                console.warn(`[labeltest] DANFE parse error for ${sid}:`, de);
              }
            }
          }

          totalSuccess++;
          perShipmentLog.push({
            shipment_id: sid, status: 'ok',
            source: 'zpl_labelary',
            output_w_mm: layoutInfo.widthMm, output_h_mm: layoutInfo.heightMm,
          });
        } catch (embedErr: any) {
          console.error(`[labeltest] Embed error for ${sid}:`, embedErr);
          perShipmentLog.push({ shipment_id: sid, status: 'error', error: 'PDF embed failed: ' + embedErr.message });
        }
      }

      // Save final PDF
      const pdfBytes = await resultPdf.save();
      finalPdfBase64 = uint8ToBase64(pdfBytes);
      console.log(`[labeltest] PDF built: ${totalSuccess}/${validIds.length} shipments, ${totalPages} pages, ${(pdfBytes.length / 1024).toFixed(0)}KB`);
    }

    // Update job record
    const elapsed = Date.now() - t0;
    const finalStatus = totalSuccess === validIds.length ? 'concluido' : totalSuccess > 0 ? 'parcial' : 'erro';

    if (jobId) {
      await supabaseAdmin.from('meli_print_queue_v2').update({
        status: finalStatus,
        processed_labels: totalSuccess,
        total_pages: totalPages,
        job_completed_at: new Date().toISOString(),
      } as any).eq('id', jobId);
    }

    console.log(`[labeltest] Job complete: status=${finalStatus} ${totalSuccess}/${validIds.length} in ${elapsed}ms`);

    return respond(true, {
      data: {
        job_id: jobId,
        pdf_base64: finalPdfBase64,
        zpl_content: finalZplContent,
        total_success: totalSuccess,
        total_pages: totalPages,
        validation_errors: validationErrors,
        per_shipment: perShipmentLog,
        layout,
        page_width_mm: layoutInfo.widthMm,
        page_height_mm: layoutInfo.heightMm,
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
