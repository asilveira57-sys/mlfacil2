import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface ValidationError {
  shipment_id: string;
  reason: string;
}

/**
 * Extracts ZPL content from a ZIP file response.
 * The ML API returns ZPL labels inside a ZIP containing a .txt file with the actual ZPL code.
 */
async function extractZplFromZip(zipBuffer: ArrayBuffer): Promise<string> {
  const blob = new Blob([zipBuffer]);
  const zipReader = new ZipReader(new BlobReader(blob));
  
  try {
    const entries = await zipReader.getEntries();
    console.log(`ZIP contains ${entries.length} files:`, entries.map(e => e.filename));
    
    // Find the .txt file containing ZPL
    const txtEntry = entries.find(entry => 
      entry.filename.toLowerCase().endsWith('.txt')
    );
    
    if (!txtEntry) {
      console.error('No .txt file found in ZIP. Available files:', entries.map(e => e.filename));
      throw new Error('Arquivo ZPL (.txt) não encontrado no ZIP');
    }
    
    console.log(`Extracting ZPL from: ${txtEntry.filename}`);
    
    // Extract text content
    if (!txtEntry.getData) {
      throw new Error('Não foi possível extrair dados do arquivo ZPL');
    }
    
    const textWriter = new TextWriter();
    const zplContent = await txtEntry.getData(textWriter);
    
    console.log(`Extracted ZPL content length: ${zplContent.length} chars`);
    
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
  // ZIP files start with "PK" (0x50 0x4B)
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '');
    
    // Create admin client with service role for ALL operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Validate JWT and get user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError) {
      console.error('Auth error:', userError.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: userError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!user) {
      console.error('No user found for token');
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
      console.error('ML account not found:', mlError?.message);
      return new Response(
        JSON.stringify({ error: 'ML account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // VALIDATION: Check all shipments are ready
    const validationErrors: ValidationError[] = [];
    const validShipmentIds: string[] = [];

    // Get shipment cache data
    const { data: shipments } = await supabaseAdmin
      .from('meli_shipments_cache')
      .select('shipment_id, order_id, label_available')
      .eq('seller_id', seller_id)
      .in('shipment_id', shipment_ids);

    const shipmentMap = new Map((shipments || []).map(s => [s.shipment_id, s]));

    // Get invoice cache data
    const orderIds = (shipments || []).map(s => s.order_id);
    const { data: invoices } = await supabaseAdmin
      .from('meli_invoices_cache')
      .select('order_id, invoice_status')
      .eq('seller_id', seller_id)
      .in('order_id', orderIds);

    const invoiceMap = new Map((invoices || []).map(i => [i.order_id, i]));

    // Validate each shipment
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
      // Record error in print queue (audit log only)
      await supabaseAdmin.from('meli_print_queue').insert({
        user_id: user.id,
        seller_id: seller_id,
        format: format,
        shipment_ids: shipment_ids,
        total_labels: 0,
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

    // Call ML API to generate labels
    const responseType = format === 'pdf' ? 'pdf' : 'zpl2';
    const mlUrl = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${validShipmentIds.join(',')}&response_type=${responseType}`;
    
    console.log('Calling ML labels API:', mlUrl);

    const mlResponse = await fetch(mlUrl, {
      headers: {
        'Authorization': `Bearer ${mlAccount.access_token}`,
      },
    });

    if (!mlResponse.ok) {
      const errorText = await mlResponse.text();
      console.error('ML labels API error:', errorText);

      // Record error in print queue (audit log)
      await supabaseAdmin.from('meli_print_queue').insert({
        user_id: user.id,
        seller_id: seller_id,
        format: format,
        shipment_ids: validShipmentIds,
        total_labels: 0,
        status: 'erro',
        error_log: `ML API Error: ${errorText}`,
      });

      return new Response(
        JSON.stringify({ error: 'Failed to generate labels from ML', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get content for immediate download (no storage)
    let pdfBase64: string | null = null;
    let zplContent: string | null = null;

    if (format === 'pdf') {
      const pdfBuffer = await mlResponse.arrayBuffer();
      // Convert to base64 for direct download
      const uint8Array = new Uint8Array(pdfBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      pdfBase64 = btoa(binary);
    } else {
      // ZPL format - ML returns a ZIP file containing the .txt with ZPL code
      const responseBuffer = await mlResponse.arrayBuffer();
      
      // Check if response is a ZIP file
      if (isZipFile(responseBuffer)) {
        console.log('ZPL response is a ZIP file, extracting...');
        zplContent = await extractZplFromZip(responseBuffer);
      } else {
        // Fallback: treat as plain text if not a ZIP
        console.log('ZPL response is plain text');
        const decoder = new TextDecoder('utf-8');
        zplContent = decoder.decode(responseBuffer);
      }
      
      console.log(`ZPL content extracted, length: ${zplContent.length} chars`);
    }

    // Record success in print queue (audit log only - no file stored)
    await supabaseAdmin.from('meli_print_queue').insert({
      user_id: user.id,
      seller_id: seller_id,
      format: format,
      shipment_ids: validShipmentIds,
      total_labels: validShipmentIds.length,
      status: 'gerada',
      // Don't store file_url or zpl_content - return directly
    });

    console.log(`Labels generated successfully: ${validShipmentIds.length} labels`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        total_labels: validShipmentIds.length,
        pdf_base64: pdfBase64,
        zpl_content: zplContent,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
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
