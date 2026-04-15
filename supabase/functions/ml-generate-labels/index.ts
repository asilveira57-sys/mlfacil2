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
const HEADER_MIN_HEIGHT_PT = 85; // minimum ~30mm header area
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
  show_variation_attrs: true,
  line_order: ['customer', 'products', 'order', 'comment'],
  max_product_lines: 5,
  max_total_lines: 8,
  font_size: 9,
};

// Target dimensions: 10cm x 15cm in points (1pt = 0.3528mm)
const TARGET_WIDTH_PT = 283.46;
const TARGET_HEIGHT_PT = 425.20;
const SIZE_TOLERANCE = 0.15; // ±15%

/**
 * Normalizes a PDF page to 10x15cm if it's significantly larger (e.g. A4).
 * If the page is already within tolerance, returns it as-is (no-op).
 * Returns a new PDFDocument with a single normalized page.
 */
async function normalizePageTo10x15(
  sourcePdf: Awaited<ReturnType<typeof PDFDocument.load>>,
  pageIndex: number,
  targetPdf: Awaited<ReturnType<typeof PDFDocument.create>>
): Promise<{ page: Awaited<ReturnType<typeof PDFDocument.prototype.embedPage>>; width: number; height: number } | null> {
  const srcPage = sourcePdf.getPage(pageIndex);
  const { width: srcW, height: srcH } = srcPage.getSize();

  const minW = TARGET_WIDTH_PT * (1 - SIZE_TOLERANCE);
  const maxW = TARGET_WIDTH_PT * (1 + SIZE_TOLERANCE);
  const minH = TARGET_HEIGHT_PT * (1 - SIZE_TOLERANCE);
  const maxH = TARGET_HEIGHT_PT * (1 + SIZE_TOLERANCE);

  // Already correct size — no normalization needed
  if (srcW >= minW && srcW <= maxW && srcH >= minH && srcH <= maxH) {
    return null; // signal: use original flow
  }

  console.log(`[NORMALIZE] Page ${pageIndex}: ${srcW.toFixed(1)}x${srcH.toFixed(1)}pt → scaling to ${TARGET_WIDTH_PT}x${TARGET_HEIGHT_PT}pt`);

  // Embed the oversized page and scale it down
  const embedded = await targetPdf.embedPage(srcPage);
  const scaleX = TARGET_WIDTH_PT / srcW;
  const scaleY = TARGET_HEIGHT_PT / srcH;
  const scale = Math.min(scaleX, scaleY); // fit proportionally

  const scaledW = srcW * scale;
  const scaledH = srcH * scale;
  const offsetX = (TARGET_WIDTH_PT - scaledW) / 2;
  const offsetY = (TARGET_HEIGHT_PT - scaledH) / 2;

  const newPage = targetPdf.addPage([TARGET_WIDTH_PT, TARGET_HEIGHT_PT]);
  newPage.drawPage(embedded, {
    x: offsetX,
    y: offsetY,
    width: scaledW,
    height: scaledH,
  });

  return { page: embedded, width: TARGET_WIDTH_PT, height: TARGET_HEIGHT_PT };
}

/**
 * Copy a single page from source to target, normalizing to 10x15 if needed.
 * Returns true if page was added.
 */
async function copyPageNormalized(
  sourcePdf: Awaited<ReturnType<typeof PDFDocument.load>>,
  pageIndex: number,
  targetPdf: Awaited<ReturnType<typeof PDFDocument.create>>
): Promise<boolean> {
  const srcPage = sourcePdf.getPage(pageIndex);
  const { width: srcW, height: srcH } = srcPage.getSize();

  const minW = TARGET_WIDTH_PT * (1 - SIZE_TOLERANCE);
  const maxW = TARGET_WIDTH_PT * (1 + SIZE_TOLERANCE);
  const minH = TARGET_HEIGHT_PT * (1 - SIZE_TOLERANCE);
  const maxH = TARGET_HEIGHT_PT * (1 + SIZE_TOLERANCE);

  if (srcW >= minW && srcW <= maxW && srcH >= minH && srcH <= maxH) {
    // Already correct — copy as-is
    const [copied] = await targetPdf.copyPages(sourcePdf, [pageIndex]);
    targetPdf.addPage(copied);
    return true;
  }

  // Needs normalization
  console.log(`[NORMALIZE] Copying page ${pageIndex}: ${srcW.toFixed(1)}x${srcH.toFixed(1)}pt → ${TARGET_WIDTH_PT}x${TARGET_HEIGHT_PT}pt`);
  const embedded = await targetPdf.embedPage(srcPage);
  const scaleX = TARGET_WIDTH_PT / srcW;
  const scaleY = TARGET_HEIGHT_PT / srcH;
  const scale = Math.min(scaleX, scaleY);

  const scaledW = srcW * scale;
  const scaledH = srcH * scale;
  const offsetX = (TARGET_WIDTH_PT - scaledW) / 2;
  const offsetY = (TARGET_HEIGHT_PT - scaledH) / 2;

  const newPage = targetPdf.addPage([TARGET_WIDTH_PT, TARGET_HEIGHT_PT]);
  newPage.drawPage(embedded, {
    x: offsetX,
    y: offsetY,
    width: scaledW,
    height: scaledH,
  });
  return true;
}

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

/** Word-wrap a string into lines that fit within maxChars characters */
function wrapTextLines(text: string, maxChars: number): string[] {
  if (!text || text.length <= maxChars) return [text];
  const words = text.split(' ');
  const result: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word;
    } else {
      result.push(current);
      current = word;
    }
  }
  if (current) result.push(current);
  return result.length > 0 ? result : [text];
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
  items: { sku: string | null; title_short: string | null; title: string | null; quantity: number; variation_attributes?: any[] | null }[],
  maxProductLines: number,
  showSku: boolean,
  showVariationAttrs: boolean,
  maxLineLength = 58
): { text: string; bold: boolean }[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return (a.sku || a.title_short || a.title || '').localeCompare(b.sku || b.title_short || b.title || '');
  });

  const lines: { text: string; bold: boolean }[] = [];

  for (const item of sorted) {
    if (lines.length >= maxProductLines) break;

    // Product title — wrap to multiple lines instead of truncating
    const displayTitle = sanitize(item.title || item.title_short || item.sku || 'Item', 200);
    const titleWrapped = wrapTextLines(displayTitle, maxLineLength);
    for (const tl of titleWrapped) {
      if (lines.length >= maxProductLines) break;
      lines.push({ text: tl, bold: true });
    }

    // Qty + SKU line
    if (lines.length < maxProductLines) {
      const skuPart = showSku && item.sku ? ` - Apelido: ${item.sku}` : '';
      lines.push({ text: truncate(`Quantidade: ${item.quantity}${skuPart}`, maxLineLength), bold: false });
    }

    // Variation attributes
    if (showVariationAttrs && item.variation_attributes && lines.length < maxProductLines) {
      for (const attr of item.variation_attributes) {
        if (lines.length >= maxProductLines) break;
        const name = attr?.name || attr?.id || '';
        const value = attr?.value_name || attr?.value || '';
        if (name && value) {
          lines.push({ text: truncate(`${name}: ${value}`, maxLineLength), bold: false });
        }
      }
    }
  }

  return lines;
}

// Build header lines for a single order — customer ALWAYS first
function buildHeaderLinesForOrder(
  prefs: typeof DEFAULT_HEADER_PREFS,
  order: { order_id: string; shipment_id: string | null; buyer_name: string | null; order_comment: string | null },
  items: { sku: string | null; title_short: string | null; title: string | null; quantity: number; variation_attributes?: any[] | null }[]
): { text: string; bold: boolean }[] {
  const contents: Record<string, { text: string; bold: boolean }[]> = {
    customer: [],
    products: [],
    order: [],
    shipment: [],
    comment: [],
  };

  if (prefs.show_customer && order.buyer_name) {
    contents.customer = [{ text: sanitize(order.buyer_name, 40), bold: false }];
  }
  if (prefs.show_products && items.length > 0) {
    contents.products = buildProductLines(items, prefs.max_product_lines, prefs.show_sku ?? true, prefs.show_variation_attrs ?? true);
  }
  if (prefs.show_order_id) {
    contents.order = [{ text: `Pedido: ${order.order_id}`, bold: false }];
  }
  if (prefs.show_shipment_id && order.shipment_id) {
    contents.shipment = [{ text: `Envio: ${order.shipment_id}`, bold: false }];
  }
  if (prefs.show_comment && order.order_comment) {
    const clean = sanitize(order.order_comment, 60);
    if (clean) contents.comment = [{ text: `Obs: ${clean}`, bold: false }];
  }

  // Customer ALWAYS first
  const lines: { text: string; bold: boolean }[] = [];
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
  headerDataMap: Map<string, { text: string; bold: boolean }[]>,
  fontSize: number,
  updateProgress: (batchId: number, status: string, retryCount: number, errorMessage?: string) => Promise<void>,
  skipDanfe: boolean = false,
  perShipmentSkipDanfe: Set<string> = new Set(),
): Promise<{ pdfBytes: Uint8Array; processedCount: number; errorShipments: string[] }> {
  const resultPdf = await PDFDocument.create();
  const font = await resultPdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await resultPdf.embedFont(StandardFonts.HelveticaBold);
  
  let processedCount = 0;
  const errorShipments: string[] = [];
  
  // Process each shipment individually — deterministic, no index guessing
  for (let idx = 0; idx < shipmentIds.length; idx++) {
    const shipmentId = shipmentIds[idx];
    const headerLines = headerDataMap.get(shipmentId) || [] as { text: string; bold: boolean }[];
    
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
    
    // === PAGE 0: Label — apply header (with normalization) ===
    // Check if page needs normalization to 10x15
    const srcPage0 = sourcePdf.getPage(0);
    const { width: rawW, height: rawH } = srcPage0.getSize();
    const minW = TARGET_WIDTH_PT * (1 - SIZE_TOLERANCE);
    const maxW = TARGET_WIDTH_PT * (1 + SIZE_TOLERANCE);
    const minH = TARGET_HEIGHT_PT * (1 - SIZE_TOLERANCE);
    const maxH = TARGET_HEIGHT_PT * (1 + SIZE_TOLERANCE);
    const needsNormalize = !(rawW >= minW && rawW <= maxW && rawH >= minH && rawH <= maxH);

    let embeddedPage: Awaited<ReturnType<typeof resultPdf.embedPage>>;
    let origWidth: number;
    let origHeight: number;

    if (needsNormalize) {
      console.log(`[HEADER] Normalizing label ${shipmentId}: ${rawW.toFixed(1)}x${rawH.toFixed(1)}pt → ${TARGET_WIDTH_PT}x${TARGET_HEIGHT_PT}pt`);
      // Create a temp doc with normalized page, then embed from there
      const tempPdf = await PDFDocument.create();
      const tempEmbed = await tempPdf.embedPage(srcPage0);
      const scaleX = TARGET_WIDTH_PT / rawW;
      const scaleY = TARGET_HEIGHT_PT / rawH;
      const scale = Math.min(scaleX, scaleY);
      const scaledW = rawW * scale;
      const scaledH = rawH * scale;
      const offsetX = (TARGET_WIDTH_PT - scaledW) / 2;
      const offsetY = (TARGET_HEIGHT_PT - scaledH) / 2;
      const tempPage = tempPdf.addPage([TARGET_WIDTH_PT, TARGET_HEIGHT_PT]);
      tempPage.drawPage(tempEmbed, { x: offsetX, y: offsetY, width: scaledW, height: scaledH });
      const tempBytes = await tempPdf.save();
      const normalizedPdf = await PDFDocument.load(tempBytes);
      embeddedPage = await resultPdf.embedPage(normalizedPdf.getPage(0));
      origWidth = TARGET_WIDTH_PT;
      origHeight = TARGET_HEIGHT_PT;
    } else {
      embeddedPage = await resultPdf.embedPage(srcPage0);
      origWidth = rawW;
      origHeight = rawH;
    }
    
    if (headerLines.length > 0) {
      // Calculate dynamic header height based on number of lines
      const lineHeight = fontSize * HEADER_LINE_HEIGHT_FACTOR;
      const calculatedHeight = HEADER_PADDING_TOP + (headerLines.length * lineHeight) + SEPARATOR_LINE_Y_OFFSET + 6;
      const headerHeight = Math.max(HEADER_MIN_HEIGHT_PT, calculatedHeight);
      
      // Create taller page with header
      const newHeight = origHeight + headerHeight;
      const newPage = resultPdf.addPage([origWidth, newHeight]);
      
      // Draw original label at the bottom
      newPage.drawPage(embeddedPage, { x: 0, y: 0, width: origWidth, height: origHeight });
      
      // Draw header text in the top area (no maxWidth — text is pre-wrapped)
      let textY = newHeight - HEADER_PADDING_TOP - fontSize;
      
      for (const line of headerLines) {
        newPage.drawText(line.text, {
          x: 8,
          y: textY,
          size: line.bold ? fontSize + 1 : fontSize,
          font: line.bold ? fontBold : font,
          color: rgb(0, 0, 0),
        });
        textY -= lineHeight;
      }
      
      // Draw border box around header area
      const headerBoxY = origHeight + SEPARATOR_LINE_Y_OFFSET - 1;
      const headerBoxHeight = newHeight - headerBoxY - 2;
      newPage.drawRectangle({
        x: 3,
        y: headerBoxY,
        width: origWidth - 6,
        height: headerBoxHeight,
        borderColor: rgb(0.15, 0.15, 0.15),
        borderWidth: 1.0,
        color: undefined,
      });
      
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
    
    // === PAGE 1: DANFE/invoice — normalized to 10x15 ===
    // Only copy page index 1 (DANFE). Ignore pages 2+ (ML internal separation lists).
    // Skip DANFE when: global skipDanfe flag OR per-shipment fallback (Flex without NF)
    const shouldSkipDanfe = skipDanfe || perShipmentSkipDanfe.has(shipmentId);
    if (!shouldSkipDanfe && pageCount > 1) {
      await copyPageNormalized(sourcePdf, 1, resultPdf);
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

// Strip extra pages (separation lists) from merged ML PDFs.
// ML API returns N pages per shipment (typically 3: label, DANFE, separation list).
// mode 'standard' keeps pages 0,1 per shipment (label + DANFE).
// mode 'no_nf' keeps only page 0 per shipment (label only).
async function stripExtraPages(pdfBytes: Uint8Array, shipmentCount: number, mode: 'standard' | 'no_nf'): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(pdfBytes);
  const totalPages = sourcePdf.getPageCount();
  
  // If we can't determine pages-per-shipment, fallback: keep all for standard, even-only for no_nf
  if (shipmentCount <= 0) {
    console.warn(`[stripExtraPages] shipmentCount=0, returning as-is`);
    return pdfBytes;
  }

  const pagesPerShipment = Math.floor(totalPages / shipmentCount);
  
  // If 1 page per shipment or can't divide evenly, nothing to strip
  if (pagesPerShipment <= 1) {
    if (mode === 'no_nf') {
      console.log(`[stripExtraPages] Already 1 page/shipment, nothing to strip`);
    }
    return pdfBytes;
  }

  // For standard: keep pages 0,1 per group; for no_nf: keep only page 0
  const keepIndices = mode === 'no_nf' ? [0] : [0, 1];
  
  const resultPdf = await PDFDocument.create();
  const indicesToKeep: number[] = [];
  
  for (let s = 0; s < shipmentCount; s++) {
    const groupStart = s * pagesPerShipment;
    for (const idx of keepIndices) {
      const pageIdx = groupStart + idx;
      if (pageIdx < totalPages) {
        indicesToKeep.push(pageIdx);
      }
    }
  }
  
  if (indicesToKeep.length > 0) {
    const copiedPages = await resultPdf.copyPages(sourcePdf, indicesToKeep);
    copiedPages.forEach(page => resultPdf.addPage(page));
  }
  
  console.log(`[stripExtraPages][${mode}] ${pagesPerShipment} pages/shipment, ${totalPages} → ${indicesToKeep.length} pages`);
  return await resultPdf.save();
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
    console.log('[ml-generate-labels] Request received, auth header present:', !!authHeader);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[ml-generate-labels] Missing or invalid authorization header');
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
      console.error('[ml-generate-labels] Auth failed:', userError?.message || 'No user returned');
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: userError?.message }),
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

    if (!['meli_100x150', 'mlfacil_100x175_header', 'meli_100x150_no_nf'].includes(layout)) {
      return new Response(
        JSON.stringify({ error: 'layout must be meli_100x150, mlfacil_100x175_header or meli_100x150_no_nf' }),
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
      .select('shipment_id, order_id, label_available, logistic_type')
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
    // 1:N mapping: one shipment can have multiple order_ids (pack/cart)
    const shipmentToOrderIds = new Map<string, string[]>();

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
      const isFlex = shipment.logistic_type === 'self_service';
      const isFull = shipment.logistic_type === 'fulfillment';
      const hasInvoice = invoice && invoice.invoice_status === 'emitida';

      // Full orders: never allowed
      if (isFull) {
        validationErrors.push({ shipment_id, reason: 'Pedido Full (ML envia)' });
        continue;
      }

      // "Cabeçalho + DANFE" validation:
      // - Coleta without NF: blocked (requires NF)
      // - Flex without NF: allowed, will fallback to header-only (skipDanfe per shipment)
      if (layout === 'mlfacil_100x175_header' && format === 'pdf' && !hasInvoice && !isFlex) {
        validationErrors.push({ shipment_id, reason: 'NF não emitida para este pedido' });
        continue;
      }

      validShipmentIds.push(shipment_id);
      // Store as array for 1:N support (will be enriched with pack siblings later)
      shipmentToOrderIds.set(shipment_id, [shipment.order_id]);
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
    const isPdfLayout = format === 'pdf';
    const isHeaderLayout = isPdfLayout && (
      layout === 'mlfacil_100x175_header' || layout === 'meli_100x150_no_nf'
    );
    // Standard ML PDF uses per-shipment processing to preserve page order and avoid ML separation pages.
    const isPerShipmentPdf = isPdfLayout && layout === 'meli_100x150';

    // All PDF layouts: single "batch" covering all shipments (per-shipment processing)
    // ZPL: batch via ML API as before
    const batches = (isHeaderLayout || isPerShipmentPdf)
      ? [validShipmentIds]
      : chunkArray(validShipmentIds, MAX_BATCH_SIZE);
    const totalBatches = batches.length;
    
    console.log(`Processing ${validShipmentIds.length} labels in ${totalBatches} batch(es) (header=${isHeaderLayout}, perShipmentPdf=${isPerShipmentPdf})`);

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

    // ===== CUSTOM HEADER PDF LAYOUTS: safe per-shipment pipeline =====
    if (isHeaderLayout) {
      console.log(`[HEADER] Starting safe per-shipment pipeline for ${validShipmentIds.length} shipments (layout=${layout})`);
      
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
          show_sku: prefData.show_sku ?? true,
          show_variation_attrs: (prefData as any).show_variation_attrs ?? true,
          line_order: prefData.line_order as string[],
          max_product_lines: prefData.max_product_lines,
          max_total_lines: prefData.max_total_lines,
          font_size: prefData.font_size,
        } : DEFAULT_HEADER_PREFS;

        // Load order data for all valid shipments — including pack siblings
        const knownOrderIds = validShipmentIds
          .flatMap(sid => shipmentToOrderIds.get(sid) || []);

        // First, find all orders for these shipments to discover pack siblings
        const { data: allShipmentOrders } = await supabaseAdmin
          .from('meli_orders_cache')
          .select('order_id, pack_id, shipment_id, buyer_name, order_comment')
          .eq('seller_id', seller_id)
          .in('shipment_id', validShipmentIds);

        // Enrich shipmentToOrderIds with ALL sibling order_ids
        for (const o of (allShipmentOrders || [])) {
          if (!o.shipment_id) continue;
          const existing = shipmentToOrderIds.get(o.shipment_id) || [];
          if (!existing.includes(o.order_id)) {
            existing.push(o.order_id);
            shipmentToOrderIds.set(o.shipment_id, existing);
          }
        }

        // Collect all unique order_ids (including siblings)
        const allOrderIds = [...new Set(
          validShipmentIds.flatMap(sid => shipmentToOrderIds.get(sid) || [])
        )];

        const { data: itemsData } = await supabaseAdmin
          .from('meli_order_items_cache')
          .select('order_id, sku, title_short, title, quantity, variation_attributes')
          .eq('seller_id', seller_id)
          .in('order_id', allOrderIds);

        // Group items by order_id
        const itemsByOrder = new Map<string, typeof itemsData>();
        for (const item of (itemsData || [])) {
          const existing = itemsByOrder.get(item.order_id) || [];
          existing.push(item);
          itemsByOrder.set(item.order_id, existing);
        }

        // Build header lines for each shipment — aggregate items from ALL sibling orders
        const headerDataMap = new Map<string, { text: string; bold: boolean }[]>();

        for (const shipmentId of validShipmentIds) {
          const siblingOrderIds = shipmentToOrderIds.get(shipmentId) || [];
          if (siblingOrderIds.length === 0) continue;

          const primaryOrder = (allShipmentOrders || []).find(o => o.shipment_id === shipmentId);
          if (!primaryOrder) continue;

          const allItems: { sku: string | null; title_short: string | null; title: string | null; quantity: number; variation_attributes?: any[] | null }[] = [];
          for (const oid of siblingOrderIds) {
            for (const i of (itemsByOrder.get(oid) || [])) {
              allItems.push({
                sku: i.sku,
                title_short: i.title_short,
                title: i.title,
                quantity: i.quantity,
                variation_attributes: (i as any).variation_attributes || null,
              });
            }
          }

          const lines = buildHeaderLinesForOrder(prefs, {
            order_id: primaryOrder.pack_id || primaryOrder.order_id,
            shipment_id: primaryOrder.shipment_id,
            buyer_name: primaryOrder.buyer_name,
            order_comment: primaryOrder.order_comment,
          }, allItems);

          headerDataMap.set(shipmentId, lines);
        }

        console.log(`[HEADER] Built headers for ${headerDataMap.size} shipments (pack-aware)`);

        // Build PDF with safe per-shipment pipeline
        // - mlfacil_100x175_header => header + DANFE (but Flex without NF falls back to header-only)
        // - meli_100x150_no_nf => header without DANFE
        const skipDanfe = layout === 'meli_100x150_no_nf';
        
        // Build per-shipment skipDanfe set for Flex orders without NF
        const perShipmentSkipDanfe = new Set<string>();
        if (layout === 'mlfacil_100x175_header') {
          for (const sid of validShipmentIds) {
            const shipment = shipmentMap.get(sid);
            if (shipment && shipment.logistic_type === 'self_service') {
              const invoice = invoiceMap.get(shipment.order_id);
              if (!invoice || invoice.invoice_status !== 'emitida') {
                perShipmentSkipDanfe.add(sid);
                console.log(`[HEADER] Flex fallback: shipment ${sid} will skip DANFE (no NF)`);
              }
            }
          }
        }
        
        const headerResult = await buildHeaderPdfSafe(
          validShipmentIds,
          mlAccount.access_token,
          headerDataMap,
          prefs.font_size,
          updateProgress,
          skipDanfe,
          perShipmentSkipDanfe,
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
    } else if (isPerShipmentPdf) {
      // ===== STANDARD PDF LAYOUT: per-shipment pipeline (handles mixed Flex+Coleta) =====
      console.log(`[STANDARD] Starting per-shipment pipeline for ${validShipmentIds.length} shipments`);
      
      try {
        const resultPdf = await PDFDocument.create();
        let processedCount = 0;
        const errorShipments: string[] = [];
        const isNoNf = layout === 'meli_100x150_no_nf';
        
        for (let idx = 0; idx < validShipmentIds.length; idx++) {
          const shipmentId = validShipmentIds[idx];
          
          // Report progress every 10 shipments
          if (idx % 10 === 0) {
            await updateProgress(1, 'processing', 1);
          }
          
          const pdfBytes = await fetchSingleShipmentPdf(shipmentId, mlAccount.access_token);
          if (!pdfBytes) {
            console.error(`[STANDARD] BLOCKING: shipment ${shipmentId} failed to download PDF`);
            errorShipments.push(shipmentId);
            break;
          }
          
          let sourcePdf: Awaited<ReturnType<typeof PDFDocument.load>>;
          try {
            sourcePdf = await PDFDocument.load(pdfBytes);
          } catch (err) {
            console.error(`[STANDARD] BLOCKING: shipment ${shipmentId} has invalid PDF`, err);
            errorShipments.push(shipmentId);
            break;
          }
          
          const pageCount = sourcePdf.getPageCount();
          if (pageCount === 0) {
            console.error(`[STANDARD] BLOCKING: shipment ${shipmentId} PDF has 0 pages`);
            errorShipments.push(shipmentId);
            break;
          }
          
          // Page 0: Label — copy with normalization to 10x15
          await copyPageNormalized(sourcePdf, 0, resultPdf);
          
          // Page 1: DANFE — copy with normalization if exists and not in no_nf mode
          if (!isNoNf && pageCount > 1) {
            await copyPageNormalized(sourcePdf, 1, resultPdf);
          }
          // Pages 2+: separation lists — always ignored
          
          processedCount++;
          
          if (idx < validShipmentIds.length - 1) {
            await sleep(50);
          }
        }
        
        if (errorShipments.length > 0) {
          console.error(`[STANDARD] BLOCKED: ${errorShipments.length} shipments failed: ${errorShipments.join(', ')}`);
          errorBatchCount = 1;
          totalSuccessLabels = 0;
          batchResults.push({
            batch_id: 1,
            shipment_ids: validShipmentIds,
            status: 'error',
            retry_count: 1,
            error_message: `Geração bloqueada: falha no envio ${errorShipments[0]}. Nenhum PDF foi gerado para evitar erros.`,
          });
        } else if (processedCount > 0) {
          finalPdfBase64 = uint8ArrayToBase64(await resultPdf.save());
          totalSuccessLabels = processedCount;
          batchResults.push({
            batch_id: 1,
            shipment_ids: validShipmentIds,
            status: 'success',
            retry_count: 1,
          });
        }
        
        console.log(`[STANDARD] Pipeline complete: ${totalSuccessLabels} labels generated`);
      } catch (stdError) {
        console.error('[STANDARD] Fatal error in per-shipment pipeline:', stdError);
        batchResults.push({
          batch_id: 1,
          shipment_ids: validShipmentIds,
          status: 'error',
          retry_count: 1,
          error_message: stdError instanceof Error ? stdError.message : 'Unknown error',
        });
        errorBatchCount = 1;
      }
    } else {
      // ===== ZPL FORMAT: batch pipeline (unchanged) =====
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

      const zplDataArray = successBatches.filter(b => b.zpl_data).map(b => b.zpl_data!);
      finalZplContent = mergeZPLs(zplDataArray);
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
