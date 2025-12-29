import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface ValidationError {
  shipment_id: string;
  reason: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: mlAccount, error: mlError } = await adminClient
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
    const { data: shipments } = await supabaseClient
      .from('meli_shipments_cache')
      .select('shipment_id, order_id, label_available')
      .eq('seller_id', seller_id)
      .in('shipment_id', shipment_ids);

    const shipmentMap = new Map((shipments || []).map(s => [s.shipment_id, s]));

    // Get invoice cache data
    const orderIds = (shipments || []).map(s => s.order_id);
    const { data: invoices } = await supabaseClient
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
      // Record error in print queue
      await supabaseClient.from('meli_print_queue').insert({
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

      // Record error in print queue
      await supabaseClient.from('meli_print_queue').insert({
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

    let fileUrl: string | null = null;
    let zplContent: string | null = null;

    if (format === 'pdf') {
      // Save PDF to storage
      const pdfBuffer = await mlResponse.arrayBuffer();
      const now = new Date();
      const path = `${user.id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/labels_${now.getTime()}.pdf`;

      const { error: uploadError } = await supabaseClient.storage
        .from('meli-labels')
        .upload(path, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        
        await supabaseClient.from('meli_print_queue').insert({
          user_id: user.id,
          seller_id: seller_id,
          format: format,
          shipment_ids: validShipmentIds,
          total_labels: validShipmentIds.length,
          status: 'erro',
          error_log: `Storage error: ${uploadError.message}`,
        });

        return new Response(
          JSON.stringify({ error: 'Failed to save PDF' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate signed URL (1 hour expiry)
      const { data: signedUrlData } = await supabaseClient.storage
        .from('meli-labels')
        .createSignedUrl(path, 3600);

      fileUrl = signedUrlData?.signedUrl || null;
    } else {
      // ZPL format - return text content
      zplContent = await mlResponse.text();
    }

    // Record success in print queue
    await supabaseClient.from('meli_print_queue').insert({
      user_id: user.id,
      seller_id: seller_id,
      format: format,
      shipment_ids: validShipmentIds,
      total_labels: validShipmentIds.length,
      status: 'gerada',
      file_url: fileUrl,
      zpl_content: zplContent,
    });

    console.log(`Labels generated successfully: ${validShipmentIds.length} labels`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        total_labels: validShipmentIds.length,
        file_url: fileUrl,
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
