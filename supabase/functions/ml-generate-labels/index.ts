import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.32/index.js";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

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

const MAX_BATCH_SIZE = 50; // ML API limit
const MAX_RETRIES = 5;
const DELAY_BETWEEN_BATCHES_MS = 100;

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Exponential backoff delay: 1s, 2s, 4s, 8s, 16s
 */
function getBackoffDelay(attempt: number): number {
  return Math.pow(2, attempt - 1) * 1000;
}

/**
 * Extracts ZPL content from a ZIP file response.
 */
async function extractZplFromZip(zipBuffer: ArrayBuffer): Promise<string> {
  const blob = new Blob([zipBuffer]);
  const zipReader = new ZipReader(new BlobReader(blob));
  
  try {
    const entries = await zipReader.getEntries();
    console.log(`ZIP contains ${entries.length} files:`, entries.map((e: { filename: string }) => e.filename));
    
    const txtEntry = entries.find((entry: { filename: string }) => 
      entry.filename.toLowerCase().endsWith('.txt')
    );
    
    if (!txtEntry) {
      throw new Error('Arquivo ZPL (.txt) não encontrado no ZIP');
    }
    
    if (!txtEntry.getData) {
      throw new Error('Não foi possível extrair dados do arquivo ZPL');
    }
    
    const textWriter = new TextWriter();
    const zplContent = await txtEntry.getData(textWriter);
    
    return zplContent;
  } finally {
    await zipReader.close();
  }
}

/**
 * Checks if a buffer starts with ZIP magic bytes (PK)
 */
function isZipFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B;
}

/**
 * Splits array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Process a single batch with retry logic
 */
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
        
        // Check if it's a rate limit error (429) or server error (5xx)
        if (mlResponse.status === 429 || mlResponse.status >= 500) {
          if (attempt < MAX_RETRIES) {
            const delay = getBackoffDelay(attempt);
            console.log(`Batch ${batchId}: Rate limited/Server error. Retry in ${delay}ms...`);
            await sleep(delay);
            continue;
          }
        }
        
        throw new Error(`ML API Error ${mlResponse.status}: ${errorText}`);
      }

      // Success - process response
      if (format === 'pdf') {
        const pdfBuffer = await mlResponse.arrayBuffer();
        result.pdf_data = new Uint8Array(pdfBuffer);
      } else {
        const responseBuffer = await mlResponse.arrayBuffer();
        if (isZipFile(responseBuffer)) {
          result.zpl_data = await extractZplFromZip(responseBuffer);
        } else {
          const decoder = new TextDecoder('utf-8');
          result.zpl_data = decoder.decode(responseBuffer);
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
        console.log(`Batch ${batchId}: Retry in ${delay}ms...`);
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

/**
 * Merge multiple PDFs into one
 */
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

/**
 * Merge multiple ZPL strings into one
 */
function mergeZPLs(zplDataArray: string[]): string {
  return zplDataArray.join('\n\n');
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

    const { seller_id, shipment_ids, format } = await req.json();
    
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

    console.log(`Generating ${format} labels for seller: ${seller_id}, shipments: ${shipment_ids.length}`);

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
          message: 'Nenhum envio válido para gerar etiqueta',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        // Get current batches
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
      const batchShipmentIds = batches[i];
      
      const result = await processBatchWithRetry(
        batchId,
        batchShipmentIds,
        format,
        mlAccount.access_token,
        updateProgress
      );
      
      batchResults.push(result);

      // Small delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    // Check results
    const successBatches = batchResults.filter(b => b.status === 'success');
    const errorBatches = batchResults.filter(b => b.status === 'error');
    
    console.log(`Results: ${successBatches.length} success, ${errorBatches.length} errors`);

    if (successBatches.length === 0) {
      // All failed
      await supabaseAdmin
        .from('meli_print_queue')
        .update({
          status: 'erro',
          error_log: JSON.stringify(errorBatches.map(b => ({
            batch_id: b.batch_id,
            shipment_ids: b.shipment_ids,
            error: b.error_message,
          }))),
          job_completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      return new Response(
        JSON.stringify({ 
          success: false,
          job_id: jobId,
          message: 'Todos os lotes falharam',
          errors: errorBatches.map(b => ({
            batch_id: b.batch_id,
            shipment_ids: b.shipment_ids,
            error: b.error_message,
          })),
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Merge successful results
    let finalPdfBase64: string | null = null;
    let finalZplContent: string | null = null;

    if (format === 'pdf') {
      const pdfDataArray = successBatches
        .filter(b => b.pdf_data)
        .map(b => b.pdf_data!);
      
      if (pdfDataArray.length > 1) {
        const mergedPdf = await mergePDFs(pdfDataArray);
        const binary = String.fromCharCode(...mergedPdf);
        finalPdfBase64 = btoa(binary);
      } else if (pdfDataArray.length === 1) {
        const binary = String.fromCharCode(...pdfDataArray[0]);
        finalPdfBase64 = btoa(binary);
      }
    } else {
      const zplDataArray = successBatches
        .filter(b => b.zpl_data)
        .map(b => b.zpl_data!);
      
      finalZplContent = mergeZPLs(zplDataArray);
    }

    const totalSuccessLabels = successBatches.reduce(
      (sum, b) => sum + b.shipment_ids.length, 0
    );

    // Update job as completed
    const finalStatus = errorBatches.length > 0 ? 'parcial' : 'concluido';
    
    await supabaseAdmin
      .from('meli_print_queue')
      .update({
        status: finalStatus,
        processed_labels: totalSuccessLabels,
        batches: batchResults,
        job_completed_at: new Date().toISOString(),
        error_log: errorBatches.length > 0 
          ? JSON.stringify(errorBatches.map(b => ({
              batch_id: b.batch_id,
              shipment_ids: b.shipment_ids,
              error: b.error_message,
            })))
          : null,
      })
      .eq('id', jobId);

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
          batch_id: b.batch_id,
          shipment_ids: b.shipment_ids,
          error: b.error_message,
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
