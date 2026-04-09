import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.32/index.js";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface ValidationError {
  shipment_id: string;
  reason: string;
}

interface BatchResult {
  batch_id: number;
  shipment_ids: string[];
  status: 'pending' | 'success' | 'error';
  retry_count: number;
  pdf_data?: Uint8Array;
  zpl_data?: string;
  error_message?: string;
}

const MAX_BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const DELAY_BETWEEN_BATCHES_MS = 100;

// Header configuration
const HEADER_HEIGHT_PT = 65; // ~23mm header area
const HEADER_PADDING_TOP = 8;
const HEADER_LINE_HEIGHT_FACTOR = 1.3;
const SEPARATOR_LINE_Y_OFFSET = 4;

const DEFAULT_HEADER_PREFS = {
  show_customer: true,
  show_products: true,
  show_order_id: true,
  show_shipment_id: false,
  show_comment: true,
  show_sku: true,
  line_order: ['customer', 'products', 'order', 'comment'],
  max_product_lines: 3,
  max_total_lines: 6,
  font_size: 9,
};

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getBackoffDelay(attempt: number): number {
  return Math.pow(2, attempt - 1) * 1000;
}

async function extractZplFromZip(zipBuffer: ArrayBuffer): Promise<string> {
  const blob = new Blob([zipBuffer]);
  const zipReader = new ZipReader(new BlobReader(blob));
  
  try {
    const entries = await zipReader.getEntries();
    const txtEntry = entries.find((entry: { filename: string }) => 
      entry.filename.toLowerCase().endsWith('.txt')
    );
    
    if (!txtEntry || !txtEntry.getData) {
      throw new Error('Arquivo ZPL (.txt) não encontrado no ZIP');
    }
    
    const textWriter = new TextWriter();
    return await txtEntry.getData(textWriter);
  } finally {
    await zipReader.close();
  }
}

function isZipFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function sanitize(text: string | null | undefined, maxLength = 90): string {
  if (!text) return '';
  return truncate(
    text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(),
    maxLength
  );
}

// Build product display lines — one item per line with SKU
function buildProductLines(
  items: { sku: string | null; title_short: string | null; title: string | null; quantity: number }[],
  maxProductLines: number,
  showSku: boolean,
  maxLineLength = 58
): string[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return (a.sku || a.title_short || a.title || '').localeCompare(b.sku || b.title_short || b.title || '');
  });

  // Format each item: "Nx [SKU] Title" — one per line
  const formatted = sorted.map(item => {
    const skuPart = showSku && item.sku ? `[${item.sku}] ` : '';
    const displayText = item.title_short || item.title || item.sku || 'Item';
    const prefix = `${item.quantity}x ${skuPart}`;
    const maxTitleLen = maxLineLength - prefix.length;
    return `${prefix}${truncate(displayText, Math.max(maxTitleLen, 15))}`;
  });

  const lines: string[] = [];

  for (let i = 0; i < formatted.length; i++) {
    if (lines.length >= maxProductLines) {
      const remaining = formatted.length - i;
      if (remaining > 0 && lines.length > 0) {
        const suffix = ` +${remaining} ${remaining === 1 ? 'item' : 'itens'}`;
        const last = lines[lines.length - 1];
        lines[lines.length - 1] = last.length + suffix.length <= maxLineLength
          ? last + suffix
          : truncate(last, maxLineLength - suffix.length) + suffix;
      }
      break;
    }

    if (lines.length === maxProductLines - 1 && i < formatted.length - 1) {
      const remaining = formatted.length - i - 1;
      const suffix = remaining > 0 ? ` +${remaining} ${remaining === 1 ? 'item' : 'itens'}` : '';
      const line = formatted[i];
      if (line.length + suffix.length <= maxLineLength) {
        lines.push(line + suffix);
      } else {
        lines.push(truncate(line, maxLineLength - suffix.length) + suffix);
      }
      break;
    }

    lines.push(truncate(formatted[i], maxLineLength));
  }

  return lines;
}

// Build header lines for a single order — customer ALWAYS first
function buildHeaderLinesForOrder(
  prefs: typeof DEFAULT_HEADER_PREFS,
  order: { order_id: string; shipment_id: string | null; buyer_name: string | null; order_comment: string | null },
  items: { sku: string | null; title_short: string | null; title: string | null; quantity: number }[]
): string[] {
  const contents: Record<string, string[]> = {
    customer: [],
    products: [],
    order: [],
    shipment: [],
    comment: [],
  };

  if (prefs.show_customer && order.buyer_name) {
    contents.customer = [`Cliente: ${sanitize(order.buyer_name, 40)}`];
  }
  if (prefs.show_products && items.length > 0) {
    contents.products = buildProductLines(items, prefs.max_product_lines, prefs.show_sku ?? true);
  }
  if (prefs.show_order_id) {
    contents.order = [`Pedido: ${order.order_id}`];
  }
  if (prefs.show_shipment_id && order.shipment_id) {
    contents.shipment = [`Envio: ${order.shipment_id}`];
  }
  if (prefs.show_comment && order.order_comment) {
    const clean = sanitize(order.order_comment, 60);
    if (clean) contents.comment = [`Obs: ${clean}`];
  }

  // Customer ALWAYS first
  const lines: string[] = [];
  if (contents.customer.length > 0) {
    for (const line of contents.customer) {
      if (lines.length >= prefs.max_total_lines) break;
      lines.push(line);
    }
  }
  for (const lineType of prefs.line_order) {
    if (lineType === 'customer') continue;
    for (const line of (contents[lineType] || [])) {
      if (lines.length >= prefs.max_total_lines) break;
      lines.push(line);
    }
    if (lines.length >= prefs.max_total_lines) break;
  }

  return lines;
}

// ============================================================
// SAFE per-shipment header pipeline
// Downloads each shipment's PDF individually, applies header
// ONLY to page 1 (label), and excludes DANFE pages entirely.
// This eliminates the class of errors where headers leak onto
// invoices or get swapped between orders.
// ============================================================

async function fetchSingleShipmentPdf(
  shipmentId: string,
  accessToken: string
): Promise<Uint8Array | null> {
  const url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentId}&response_type=pdf`;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (res.status === 429 || res.status >= 500) {
        if (attempt < 3) {
          await sleep(getBackoffDelay(attempt));
          continue;
        }
      }
      
      if (!res.ok) {
        console.error(`Failed to fetch label for shipment ${shipmentId}: ${res.status}`);
        return null;
      }
      
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      console.error(`Error fetching shipment ${shipmentId} (attempt ${attempt}):`, err);
      if (attempt < 3) await sleep(getBackoffDelay(attempt));
    }
  }
  return null;
}

async function buildHeaderPdfSafe(
  shipmentIds: string[],
  accessToken: string,
  headerDataMap: Map<string, string[]>,
  fontSize: number,
  updateProgress: (batchId: number, status: string, retryCount: number, errorMessage?: string) => Promise<void>,
  separationPdfBase64?: string | null,
): Promise<{ pdfBytes: Uint8Array; processedCount: number; errorShipments: string[] }> {
  const resultPdf = await PDFDocument.create();
  const font = await resultPdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await resultPdf.embedFont(StandardFonts.HelveticaBold);
  
  let processedCount = 0;
  const errorShipments: string[] = [];
  
  // Process each shipment individually — deterministic, no index guessing
  for (let idx = 0; idx < shipmentIds.length; idx++) {
    const shipmentId = shipmentIds[idx];
    const headerLines = headerDataMap.get(shipmentId) || [];
    
    // Report progress every 10 shipments
    if (idx % 10 === 0) {
      await updateProgress(1, 'processing', 1);
    }
    
    // Fetch this shipment's PDF individually
    const pdfBytes = await fetchSingleShipmentPdf(shipmentId, accessToken);
    if (!pdfBytes) {
      console.error(`BLOCKING: shipment ${shipmentId} failed to download PDF`);
      errorShipments.push(shipmentId);
      // BLOCK ALL: any failure stops the entire generation
      break;
    }
    
    let sourcePdf: Awaited<ReturnType<typeof PDFDocument.load>>;
    try {
      sourcePdf = await PDFDocument.load(pdfBytes);
    } catch (err) {
      console.error(`BLOCKING: shipment ${shipmentId} has invalid PDF`, err);
      errorShipments.push(shipmentId);
      break;
    }
    
    const pageCount = sourcePdf.getPageCount();
    if (pageCount === 0) {
      console.error(`BLOCKING: shipment ${shipmentId} PDF has 0 pages`);
      errorShipments.push(shipmentId);
      break;
    }
    
    // === PAGE 0: Label — apply header ===
    const embeddedPage = await resultPdf.embedPage(sourcePdf.getPage(0));
    const { width: origWidth, height: origHeight } = embeddedPage;
    
    if (headerLines.length > 0) {
      // Create taller page with header
      const newHeight = origHeight + HEADER_HEIGHT_PT;
      const newPage = resultPdf.addPage([origWidth, newHeight]);
      
      // Draw original label at the bottom
      newPage.drawPage(embeddedPage, { x: 0, y: 0, width: origWidth, height: origHeight });
      
      // Draw header text in the top area
      const lineHeight = fontSize * HEADER_LINE_HEIGHT_FACTOR;
      let textY = newHeight - HEADER_PADDING_TOP - fontSize;
      
      for (const line of headerLines) {
        newPage.drawText(line, {
          x: 8,
          y: textY,
          size: fontSize,
          font: fontBold,
          color: rgb(0, 0, 0),
          maxWidth: origWidth - 16,
        });
        textY -= lineHeight;
      }
      
      // Draw separator line between header and label
      const separatorY = origHeight + SEPARATOR_LINE_Y_OFFSET;
      newPage.drawLine({
        start: { x: 4, y: separatorY },
        end: { x: origWidth - 4, y: separatorY },
        thickness: 1.2,
        color: rgb(0.2, 0.2, 0.2),
      });
    } else {
      // No header data — copy label page as-is
      const newPage = resultPdf.addPage([origWidth, origHeight]);
      newPage.drawPage(embeddedPage, { x: 0, y: 0, width: origWidth, height: origHeight });
    }
    
    // === PAGES 1..N: DANFE/invoice — copy as-is, NO header ===
    if (pageCount > 1) {
      const danfeIndices = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);
      const copiedDanfePages = await resultPdf.copyPages(sourcePdf, danfeIndices);
      for (const danfePage of copiedDanfePages) {
        resultPdf.addPage(danfePage);
      }
    }
    
    processedCount++;
    
    // Small delay between individual fetches to avoid rate limiting
    if (idx < shipmentIds.length - 1) {
      await sleep(50);
    }
  }
  
  // If any shipment failed, block entire generation
  if (errorShipments.length > 0) {
    return {
      pdfBytes: new Uint8Array(0),
      processedCount: 0,
      errorShipments,
    };
  }
  
  // === APPEND SEPARATION REPORT as last page(s) ===
  if (separationPdfBase64) {
    try {
      // Decode base64 to Uint8Array
      const binaryStr = atob(separationPdfBase64);
      const sepBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        sepBytes[i] = binaryStr.charCodeAt(i);
      }
      const sepDoc = await PDFDocument.load(sepBytes);
      const sepPages = await resultPdf.copyPages(sepDoc, sepDoc.getPageIndices());
      for (const page of sepPages) {
        resultPdf.addPage(page);
      }
      console.log(`[HEADER] Appended ${sepPages.length} separation report page(s)`);
    } catch (err) {
      console.error('[HEADER] Failed to append separation report:', err);
      // Don't block generation for separation report failure
    }
  }
  
  return {
    pdfBytes: await resultPdf.save(),
    processedCount,
    errorShipments,
  };
}

// ============================================================

async function processBatchWithRetry(
  batchId: number,
  shipmentIds: string[],
  format: 'pdf' | 'zpl',
  accessToken: string,
  updateProgress: (batchId: number, status: string, retryCount: number, errorMessage?: string) => Promise<void>
): Promise<BatchResult> {
  const result: BatchResult = {
    batch_id: batchId,
    shipment_ids: shipmentIds,
    status: 'pending',
    retry_count: 0,
  };

  const responseType = format === 'pdf' ? 'pdf' : 'zpl2';
  const mlUrl = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentIds.join(',')}&response_type=${responseType}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    result.retry_count = attempt;
    
    try {
      console.log(`Batch ${batchId}: Attempt ${attempt}/${MAX_RETRIES} for ${shipmentIds.length} labels`);
      await updateProgress(batchId, 'processing', attempt);

      const mlResponse = await fetch(mlUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!mlResponse.ok) {
        const errorText = await mlResponse.text();
        
        if ((mlResponse.status === 429 || mlResponse.status >= 500) && attempt < MAX_RETRIES) {
          const delay = getBackoffDelay(attempt);
          console.log(`Batch ${batchId}: Rate limited/Server error. Retry in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        
        throw new Error(`ML API Error ${mlResponse.status}: ${errorText}`);
      }

      if (format === 'pdf') {
        const pdfBuffer = await mlResponse.arrayBuffer();
        result.pdf_data = new Uint8Array(pdfBuffer);
      } else {
        const responseBuffer = await mlResponse.arrayBuffer();
        if (isZipFile(responseBuffer)) {
          result.zpl_data = await extractZplFromZip(responseBuffer);
        } else {
          result.zpl_data = new TextDecoder('utf-8').decode(responseBuffer);
        }
      }

      result.status = 'success';
      console.log(`Batch ${batchId}: Success after ${attempt} attempt(s)`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Batch ${batchId}: Attempt ${attempt} failed:`, errorMessage);
      
      if (attempt < MAX_RETRIES) {
        const delay = getBackoffDelay(attempt);
        await updateProgress(batchId, 'retrying', attempt, errorMessage);
        await sleep(delay);
      } else {
        result.status = 'error';
        result.error_message = errorMessage;
        await updateProgress(batchId, 'error', attempt, errorMessage);
      }
    }
  }

  return result;
}

async function mergePDFs(pdfDataArray: Uint8Array[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();
  
  for (const pdfData of pdfDataArray) {
    try {
      const pdf = await PDFDocument.load(pdfData);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    } catch (error) {
      console.error('Error loading PDF for merge:', error);
    }
  }
  
  return await mergedPdf.save();
}

function mergeZPLs(zplDataArray: string[]): string {
  return zplDataArray.join('\n\n');
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
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

    console.log('Authenticated user:', user.id);

    // ML API Access Gate
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) {
      console.log(`[ml-generate-labels] Access denied: ${gate.reason}`);
      return gate.response!;
    }

    const { seller_id, shipment_ids, format, layout = 'meli_100x150', separation_pdf_base64 } = await req.json();
    
    if (!seller_id || !shipment_ids || shipment_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'seller_id and shipment_ids are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['pdf', 'zpl'].includes(format)) {
      return new Response(
        JSON.stringify({ error: 'format must be pdf or zpl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['meli_100x150', 'mlfacil_100x175_header'].includes(layout)) {
      return new Response(
        JSON.stringify({ error: 'layout must be meli_100x150 or mlfacil_100x175_header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating ${format} labels (layout: ${layout}) for seller: ${seller_id}, shipments: ${shipment_ids.length}`);

    // Get ML account with access token
    const { data: mlAccount, error: mlError } = await supabaseAdmin
      .from('ml_accounts')
      .select('access_token, ml_user_id')
      .eq('user_id', user.id)
      .eq('ml_user_id', seller_id)
      .eq('is_active', true)
      .maybeSingle();

    if (mlError || !mlAccount) {
      return new Response(
        JSON.stringify({ error: 'ML account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // VALIDATION: Check all shipments are ready
    const validationErrors: ValidationError[] = [];
    const validShipmentIds: string[] = [];

    const { data: shipments } = await supabaseAdmin
      .from('meli_shipments_cache')
      .select('shipment_id, order_id, label_available')
      .eq('seller_id', seller_id)
      .in('shipment_id', shipment_ids);

    const shipmentMap = new Map((shipments || []).map(s => [s.shipment_id, s]));

    const orderIds = (shipments || []).map(s => s.order_id);
    const { data: invoices } = await supabaseAdmin
      .from('meli_invoices_cache')
      .select('order_id, invoice_status')
      .eq('seller_id', seller_id)
      .in('order_id', orderIds);

    const invoiceMap = new Map((invoices || []).map(i => [i.order_id, i]));
    const shipmentToOrderId = new Map<string, string>();

    // Identify orders with missing/stale invoice status and re-check via ML API
    const staleOrderIds = orderIds.filter(oid => {
      const inv = invoiceMap.get(oid);
      return !inv || inv.invoice_status !== 'emitida';
    });

    if (staleOrderIds.length > 0 && mlAccount.access_token) {
      console.log(`Re-checking ${staleOrderIds.length} orders with stale invoice status via ML API`);
      for (const orderId of staleOrderIds) {
        try {
          const billingRes = await fetch(
            `https://api.mercadolibre.com/orders/${orderId}/billing_info`,
            { headers: { 'Authorization': `Bearer ${mlAccount.access_token}` } }
          );
          
          let freshStatus = 'pendente';
          let invoiceNumber: string | null = null;
          let invoiceKey: string | null = null;
          let issuedAt: string | null = null;
          
          if (billingRes.ok) {
            const billingInfo = await billingRes.json();
            const docNumber = billingInfo.billing_info?.doc_number;
            const additionalInvoice = billingInfo.additional_info?.find((info: { type: string }) => info.type === 'invoice');
            
            if (docNumber || additionalInvoice || billingInfo.status === 'invoiced') {
              freshStatus = 'emitida';
              invoiceNumber = docNumber || additionalInvoice?.doc_number || null;
              invoiceKey = billingInfo.billing_info?.access_key || additionalInvoice?.access_key || null;
              issuedAt = additionalInvoice?.issue_date || billingInfo.date_created || null;
            }
          }
          
          if (freshStatus !== 'emitida') {
            try {
              const fiscalRes = await fetch(
                `https://api.mercadolibre.com/packs/${orderId}/fiscal_documents`,
                { headers: { 'Authorization': `Bearer ${mlAccount.access_token}` } }
              );
              if (fiscalRes.ok) {
                const fiscalDocs = await fiscalRes.json();
                if (Array.isArray(fiscalDocs) && fiscalDocs.length > 0) {
                  freshStatus = 'emitida';
                  invoiceNumber = fiscalDocs[0].fiscal_document_number || null;
                  invoiceKey = fiscalDocs[0].access_key || null;
                  issuedAt = fiscalDocs[0].issue_date || null;
                }
              }
            } catch { /* ignore */ }
          }
          
          if (freshStatus === 'emitida') {
            console.log(`Invoice found for order ${orderId} via live API check`);
            invoiceMap.set(orderId, { order_id: orderId, invoice_status: 'emitida' });
            supabaseAdmin.from('meli_invoices_cache').upsert({
              user_id: user.id,
              seller_id,
              order_id: orderId,
              invoice_status: 'emitida',
              invoice_number: invoiceNumber,
              invoice_key: invoiceKey,
              issued_at: issuedAt,
              last_sync_at: new Date().toISOString(),
            }, { onConflict: 'seller_id,order_id' });
          }
        } catch (err) {
          console.error(`Error re-checking invoice for order ${orderId}:`, err);
        }
      }
    }

    for (const shipment_id of shipment_ids) {
      const shipment = shipmentMap.get(shipment_id);
      
      if (!shipment) {
        validationErrors.push({ shipment_id, reason: 'Shipment não encontrado no cache' });
        continue;
      }

      if (!shipment.label_available) {
        validationErrors.push({ shipment_id, reason: 'Etiqueta não disponível para este envio' });
        continue;
      }

      const invoice = invoiceMap.get(shipment.order_id);
      if (!invoice || invoice.invoice_status !== 'emitida') {
        validationErrors.push({ shipment_id, reason: 'NF não emitida para este pedido' });
        continue;
      }

      validShipmentIds.push(shipment_id);
      shipmentToOrderId.set(shipment_id, shipment.order_id);
    }

    console.log(`Validation: ${validShipmentIds.length} valid, ${validationErrors.length} errors`);

    if (validShipmentIds.length === 0) {
      await supabaseAdmin.from('meli_print_queue').insert({
        user_id: user.id,
        seller_id: seller_id,
        format: format,
        shipment_ids: shipment_ids,
        total_labels: 0,
        processed_labels: 0,
        batches: [],
        status: 'erro',
        error_log: JSON.stringify(validationErrors),
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          validationErrors,
          message: validationErrors.length > 0
            ? `Nenhum envio válido: ${validationErrors.map(e => e.reason).filter((v, i, a) => a.indexOf(v) === i).join('; ')}`
            : 'Nenhum envio válido para gerar etiqueta',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create job record
    const isHeaderLayout = layout === 'mlfacil_100x175_header' && format === 'pdf';

    // For header layout: we process per-shipment (no batching via ML API)
    // For standard layout: we batch via ML API as before
    const batches = isHeaderLayout
      ? [validShipmentIds] // single "batch" covering all shipments
      : chunkArray(validShipmentIds, MAX_BATCH_SIZE);
    const totalBatches = batches.length;
    
    console.log(`Processing ${validShipmentIds.length} labels in ${totalBatches} batch(es) (header=${isHeaderLayout})`);

    const batchesInitial = batches.map((batch, idx) => ({
      batch_id: idx + 1,
      shipment_ids: batch,
      status: 'pending',
      retry_count: 0,
    }));

    const { data: jobRecord, error: jobError } = await supabaseAdmin
      .from('meli_print_queue')
      .insert({
        user_id: user.id,
        seller_id: seller_id,
        format: format,
        layout: layout,
        shipment_ids: validShipmentIds,
        total_labels: validShipmentIds.length,
        processed_labels: 0,
        batches: batchesInitial,
        status: 'processando',
        job_started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !jobRecord) {
      throw new Error('Failed to create job record');
    }

    const jobId = jobRecord.id;
    console.log(`Created job: ${jobId}`);

    // Progress update function
    const updateProgress = async (batchId: number, status: string, retryCount: number, errorMessage?: string) => {
      try {
        const { data: current } = await supabaseAdmin
          .from('meli_print_queue')
          .select('batches, processed_labels')
          .eq('id', jobId)
          .single();

        if (current) {
          const updatedBatches = (current.batches as BatchResult[]).map(b => 
            b.batch_id === batchId 
              ? { ...b, status, retry_count: retryCount, error_message: errorMessage }
              : b
          );

          const successCount = updatedBatches.filter(b => b.status === 'success').length;
          const processedLabels = batches
            .slice(0, successCount)
            .reduce((sum, batch) => sum + batch.length, 0);

          await supabaseAdmin
            .from('meli_print_queue')
            .update({ 
              batches: updatedBatches,
              processed_labels: processedLabels,
            })
            .eq('id', jobId);
        }
      } catch (e) {
        console.error('Failed to update progress:', e);
      }
    };

    let finalPdfBase64: string | null = null;
    let finalZplContent: string | null = null;
    let totalSuccessLabels = 0;
    let errorBatchCount = 0;
    const batchResults: BatchResult[] = [];

    // ===== HEADER LAYOUT: safe per-shipment pipeline =====
    if (isHeaderLayout) {
      console.log(`[HEADER] Starting safe per-shipment pipeline for ${validShipmentIds.length} shipments`);
      
      try {
        // Load seller preferences
        const { data: prefData } = await supabaseAdmin
          .from('meli_label_header_preferences')
          .select('*')
          .eq('seller_id', seller_id)
          .maybeSingle();

        const prefs = prefData ? {
          show_customer: prefData.show_customer,
          show_products: prefData.show_products,
          show_order_id: prefData.show_order_id,
          show_shipment_id: prefData.show_shipment_id,
          show_comment: prefData.show_comment,
          line_order: prefData.line_order as string[],
          max_product_lines: prefData.max_product_lines,
          max_total_lines: prefData.max_total_lines,
          font_size: prefData.font_size,
        } : DEFAULT_HEADER_PREFS;

        // Load order data for all valid shipments
        const validOrderIds = validShipmentIds
          .map(sid => shipmentToOrderId.get(sid))
          .filter(Boolean) as string[];

        const { data: ordersData } = await supabaseAdmin
          .from('meli_orders_cache')
          .select('order_id, pack_id, shipment_id, buyer_name, order_comment')
          .eq('seller_id', seller_id)
          .in('order_id', validOrderIds);

        const { data: itemsData } = await supabaseAdmin
          .from('meli_order_items_cache')
          .select('order_id, sku, title_short, title, quantity')
          .eq('seller_id', seller_id)
          .in('order_id', validOrderIds);

        // Group items by order_id
        const itemsByOrder = new Map<string, typeof itemsData>();
        for (const item of (itemsData || [])) {
          const existing = itemsByOrder.get(item.order_id) || [];
          existing.push(item);
          itemsByOrder.set(item.order_id, existing);
        }

        // Build header lines for each shipment
        const headerDataMap = new Map<string, string[]>();

        for (const shipmentId of validShipmentIds) {
          const orderId = shipmentToOrderId.get(shipmentId);
          if (!orderId) continue;

          const order = (ordersData || []).find(o => o.order_id === orderId);
          if (!order) continue;

          const items = (itemsByOrder.get(orderId) || []).map(i => ({
            sku: i.sku,
            title_short: i.title_short,
            title: i.title,
            quantity: i.quantity,
          }));

          const lines = buildHeaderLinesForOrder(prefs, {
            order_id: order.pack_id || order.order_id,
            shipment_id: order.shipment_id,
            buyer_name: order.buyer_name,
            order_comment: order.order_comment,
          }, items);

          headerDataMap.set(shipmentId, lines);
        }

        console.log(`[HEADER] Built headers for ${headerDataMap.size} shipments`);

        // Build PDF with safe per-shipment pipeline
        const headerResult = await buildHeaderPdfSafe(
          validShipmentIds,
          mlAccount.access_token,
          headerDataMap,
          prefs.font_size,
          updateProgress,
          separation_pdf_base64 || null,
        );

        totalSuccessLabels = headerResult.processedCount;
        
        // BLOCK ALL: if any shipment failed, entire generation is blocked
        if (headerResult.errorShipments.length > 0) {
          console.error(`[HEADER] BLOCKED: ${headerResult.errorShipments.length} shipments failed: ${headerResult.errorShipments.join(', ')}`);
          errorBatchCount = 1;
          totalSuccessLabels = 0;
          batchResults.push({
            batch_id: 1,
            shipment_ids: validShipmentIds,
            status: 'error',
            retry_count: 1,
            error_message: `Geração bloqueada: falha no envio ${headerResult.errorShipments[0]}. Nenhum PDF foi gerado para evitar erros.`,
          });
        } else if (totalSuccessLabels > 0) {
          finalPdfBase64 = uint8ArrayToBase64(headerResult.pdfBytes);
          batchResults.push({
            batch_id: 1,
            shipment_ids: validShipmentIds,
            status: 'success',
            retry_count: 1,
          });
        }

        console.log(`[HEADER] Pipeline complete: ${totalSuccessLabels} labels generated`);
      } catch (headerError) {
        console.error('[HEADER] Fatal error in header pipeline:', headerError);
        // Complete failure
        batchResults.push({
          batch_id: 1,
          shipment_ids: validShipmentIds,
          status: 'error',
          retry_count: 1,
          error_message: headerError instanceof Error ? headerError.message : 'Unknown error',
        });
        errorBatchCount = 1;
      }
    } else {
      // ===== STANDARD LAYOUT: batch pipeline (unchanged) =====
      for (let i = 0; i < batches.length; i++) {
        const batchId = i + 1;
        const result = await processBatchWithRetry(
          batchId, batches[i], format, mlAccount.access_token, updateProgress
        );
        batchResults.push(result);

        if (i < batches.length - 1) {
          await sleep(DELAY_BETWEEN_BATCHES_MS);
        }
      }

      const successBatches = batchResults.filter(b => b.status === 'success');
      const errorBatches = batchResults.filter(b => b.status === 'error');
      errorBatchCount = errorBatches.length;
      
      console.log(`Results: ${successBatches.length} success, ${errorBatches.length} errors`);

      if (successBatches.length === 0) {
        await supabaseAdmin.from('meli_print_queue').update({
          status: 'erro',
          error_log: JSON.stringify(errorBatches.map(b => ({
            batch_id: b.batch_id, shipment_ids: b.shipment_ids, error: b.error_message,
          }))),
          job_completed_at: new Date().toISOString(),
        }).eq('id', jobId);

        return new Response(
          JSON.stringify({ 
            success: false, job_id: jobId, message: 'Todos os lotes falharam',
            errors: errorBatches.map(b => ({ batch_id: b.batch_id, shipment_ids: b.shipment_ids, error: b.error_message })),
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (format === 'pdf') {
        const pdfDataArray = successBatches.filter(b => b.pdf_data).map(b => b.pdf_data!);
        
        let mergedPdfBytes: Uint8Array;
        if (pdfDataArray.length > 1) {
          mergedPdfBytes = await mergePDFs(pdfDataArray);
        } else {
          mergedPdfBytes = pdfDataArray[0];
        }
        finalPdfBase64 = uint8ArrayToBase64(mergedPdfBytes);
      } else {
        const zplDataArray = successBatches.filter(b => b.zpl_data).map(b => b.zpl_data!);
        finalZplContent = mergeZPLs(zplDataArray);
      }

      totalSuccessLabels = successBatches.reduce((sum, b) => sum + b.shipment_ids.length, 0);
    }

    // Update job as completed
    const finalStatus = totalSuccessLabels === 0 ? 'erro' : errorBatchCount > 0 ? 'parcial' : 'concluido';
    
    const errorBatchResults = batchResults.filter(b => b.status === 'error');

    await supabaseAdmin.from('meli_print_queue').update({
      status: finalStatus,
      processed_labels: totalSuccessLabels,
      batches: batchResults,
      job_completed_at: new Date().toISOString(),
      error_log: errorBatchResults.length > 0 
        ? JSON.stringify(errorBatchResults.map(b => ({ batch_id: b.batch_id, shipment_ids: b.shipment_ids, error: b.error_message })))
        : null,
    }).eq('id', jobId);

    console.log(`Job ${jobId} completed: ${totalSuccessLabels} labels generated`);

    return new Response(
      JSON.stringify({ 
        success: totalSuccessLabels > 0,
        job_id: jobId,
        total_batches: totalBatches,
        success_batches: batchResults.filter(b => b.status === 'success').length,
        error_batches: errorBatchResults.length,
        total_labels: totalSuccessLabels,
        pdf_base64: finalPdfBase64,
        zpl_content: finalZplContent,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        batch_errors: errorBatchResults.length > 0 ? errorBatchResults.map(b => ({
          batch_id: b.batch_id, shipment_ids: b.shipment_ids, error: b.error_message,
        })) : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ml-generate-labels:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
