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

// Build product display lines
function buildProductLines(
  items: { sku: string | null; title_short: string | null; title: string | null; quantity: number }[],
  maxProductLines: number,
  maxLineLength = 58
): string[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return (a.sku || a.title_short || a.title || '').localeCompare(b.sku || b.title_short || b.title || '');
  });

  const formatted = sorted.map(item => {
    const text = truncate(item.title_short || item.title || item.sku || 'Item', 40);
    return `${item.quantity}x ${text}`;
  });

  const lines: string[] = [];
  let currentLine = '';
  let placed = 0;

  for (let i = 0; i < formatted.length; i++) {
    const item = formatted[i];
    const sep = currentLine ? ' | ' : '';
    const potential = currentLine + sep + item;

    if (lines.length === maxProductLines - 1 && i < formatted.length - 1) {
      const remaining = formatted.length - placed;
      if (potential.length + ` +${remaining - 1} itens`.length <= maxLineLength) {
        currentLine = potential;
        placed++;
        const left = formatted.length - placed;
        if (left > 0) currentLine += ` +${left} ${left === 1 ? 'item' : 'itens'}`;
        lines.push(currentLine);
      } else {
        if (currentLine) {
          currentLine += ` +${remaining} ${remaining === 1 ? 'item' : 'itens'}`;
          lines.push(currentLine);
        } else {
          lines.push(truncate(item, maxLineLength - 10) + ` +${formatted.length - 1} itens`);
        }
      }
      break;
    }

    if (potential.length <= maxLineLength) {
      currentLine = potential;
      placed++;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = item;
        placed++;
      } else {
        lines.push(truncate(item, maxLineLength));
        placed++;
        currentLine = '';
      }
    }

    if (lines.length >= maxProductLines) {
      const remaining = formatted.length - placed;
      if (remaining > 0 && lines.length > 0) {
        const suffix = ` +${remaining} ${remaining === 1 ? 'item' : 'itens'}`;
        const last = lines[lines.length - 1];
        lines[lines.length - 1] = last.length + suffix.length <= maxLineLength
          ? last + suffix
          : truncate(last, maxLineLength - suffix.length) + suffix;
      }
      break;
    }
  }

  if (currentLine && lines.length < maxProductLines) {
    lines.push(currentLine);
  }

  return lines;
}

// Build header lines for a single order
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
    contents.products = buildProductLines(items, prefs.max_product_lines);
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

  const lines: string[] = [];
  for (const lineType of prefs.line_order) {
    for (const line of (contents[lineType] || [])) {
      if (lines.length >= prefs.max_total_lines) break;
      lines.push(line);
    }
    if (lines.length >= prefs.max_total_lines) break;
  }

  return lines;
}

// Add headers to PDF pages
async function addHeadersToPdf(
  pdfBytes: Uint8Array,
  shipmentIds: string[],
  headerDataMap: Map<string, string[]>,
  fontSize: number
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(pdfBytes);
  const resultPdf = await PDFDocument.create();
  const font = await resultPdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await resultPdf.embedFont(StandardFonts.HelveticaBold);
  
  const pageCount = sourcePdf.getPageCount();
  
  // Detect pagination mode: ML API returns 2 pages per shipment (label + NF/DANFE)
  const pagesPerShipment = pageCount === shipmentIds.length * 2 ? 2 : 1;
  console.log(`Adding headers to ${pageCount} pages for ${shipmentIds.length} shipments (pagesPerShipment=${pagesPerShipment})`);

  for (let i = 0; i < pageCount; i++) {
    const embeddedPage = await resultPdf.embedPage(sourcePdf.getPage(i));
    const { width: origWidth, height: origHeight } = embeddedPage;
    
    // In paired mode, odd pages are NF/DANFE - copy without any modification
    const isNfPage = pagesPerShipment === 2 && i % 2 === 1;
    if (isNfPage) {
      const newPage = resultPdf.addPage([origWidth, origHeight]);
      newPage.drawPage(embeddedPage, { x: 0, y: 0, width: origWidth, height: origHeight });
      continue;
    }
    
    // Calculate correct shipment index
    const shipmentIndex = pagesPerShipment === 2 ? Math.floor(i / 2) : i;
    const shipmentId = shipmentIndex < shipmentIds.length ? shipmentIds[shipmentIndex] : null;
    const headerLines = shipmentId ? (headerDataMap.get(shipmentId) || []) : [];
    
    if (headerLines.length === 0) {
      // No header data - copy with original dimensions
      const newPage = resultPdf.addPage([origWidth, origHeight]);
      newPage.drawPage(embeddedPage, { x: 0, y: 0, width: origWidth, height: origHeight });
      continue;
    }
    
    // Create taller page with header
    const newHeight = origHeight + HEADER_HEIGHT_PT;
    const newPage = resultPdf.addPage([origWidth, newHeight]);
    
    // Draw original label at the bottom
    newPage.drawPage(embeddedPage, { x: 0, y: 0, width: origWidth, height: origHeight });
    
    // Draw header text in the top area
    const lineHeight = fontSize * HEADER_LINE_HEIGHT_FACTOR;
    let textY = newHeight - HEADER_PADDING_TOP - fontSize;
    
    for (let j = 0; j < headerLines.length; j++) {
      const line = headerLines[j];
      
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
  }
  
  return await resultPdf.save();
}

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

    const { seller_id, shipment_ids, format, layout = 'meli_100x150' } = await req.json();
    
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

    // Map shipment_id -> order_id for header building
    const shipmentToOrderId = new Map<string, string>();

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

      // Return 200 with success:false so the SDK can read validation details
      // (non-2xx causes SDK to set error and discard the body)
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

    // Split into batches of 50 (ML API limit)
    const batches = chunkArray(validShipmentIds, MAX_BATCH_SIZE);
    const totalBatches = batches.length;
    
    console.log(`Processing ${validShipmentIds.length} labels in ${totalBatches} batch(es)`);

    // Create job record
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

    // Process all batches
    const batchResults: BatchResult[] = [];
    
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

    // Check results
    const successBatches = batchResults.filter(b => b.status === 'success');
    const errorBatches = batchResults.filter(b => b.status === 'error');
    
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

    // Merge successful results
    let finalPdfBase64: string | null = null;
    let finalZplContent: string | null = null;

    if (format === 'pdf') {
      const pdfDataArray = successBatches.filter(b => b.pdf_data).map(b => b.pdf_data!);
      
      let mergedPdfBytes: Uint8Array;
      if (pdfDataArray.length > 1) {
        mergedPdfBytes = await mergePDFs(pdfDataArray);
      } else {
        mergedPdfBytes = pdfDataArray[0];
      }

      // ADD HEADERS if layout requires it
      if (layout === 'mlfacil_100x175_header') {
        console.log(`Adding headers to ${validShipmentIds.length} labels...`);
        
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

          console.log(`Built headers for ${headerDataMap.size} shipments`);

          // Add headers to PDF
          mergedPdfBytes = await addHeadersToPdf(
            mergedPdfBytes,
            validShipmentIds,
            headerDataMap,
            prefs.font_size
          );

          console.log('Headers added successfully');
        } catch (headerError) {
          console.error('Error adding headers to PDF:', headerError);
          // Continue without headers rather than failing the whole request
          console.log('Falling back to labels without headers');
        }
      }

      finalPdfBase64 = uint8ArrayToBase64(mergedPdfBytes);
    } else {
      const zplDataArray = successBatches.filter(b => b.zpl_data).map(b => b.zpl_data!);
      finalZplContent = mergeZPLs(zplDataArray);
    }

    const totalSuccessLabels = successBatches.reduce((sum, b) => sum + b.shipment_ids.length, 0);

    // Update job as completed
    const finalStatus = errorBatches.length > 0 ? 'parcial' : 'concluido';
    
    await supabaseAdmin.from('meli_print_queue').update({
      status: finalStatus,
      processed_labels: totalSuccessLabels,
      batches: batchResults,
      job_completed_at: new Date().toISOString(),
      error_log: errorBatches.length > 0 
        ? JSON.stringify(errorBatches.map(b => ({ batch_id: b.batch_id, shipment_ids: b.shipment_ids, error: b.error_message })))
        : null,
    }).eq('id', jobId);

    console.log(`Job ${jobId} completed: ${totalSuccessLabels} labels generated`);

    return new Response(
      JSON.stringify({ 
        success: true,
        job_id: jobId,
        total_batches: totalBatches,
        success_batches: successBatches.length,
        error_batches: errorBatches.length,
        total_labels: totalSuccessLabels,
        pdf_base64: finalPdfBase64,
        zpl_content: finalZplContent,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        batch_errors: errorBatches.length > 0 ? errorBatches.map(b => ({
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
