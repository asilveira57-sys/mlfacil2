// @ts-nocheck - Deno types not available in build context
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Substatus that indicate seller can/should print the label
const SELLER_PRINTABLE_SUBSTATUSES = ['ready_to_print', 'printed'];

// Logistic types that are FULL (Mercado Livre handles shipping - seller doesn't print)
const FULL_LOGISTIC_TYPES = ['fulfillment', 'cross_docking'];

interface MLShipment {
  id: number;
  status: string;
  substatus: string | null;
  tracking_number: string | null;
  logistic_type: string;
  receiver_address?: {
    receiver_name?: string;
    address_line?: string;
    city?: { name?: string };
    state?: { name?: string };
    zip_code?: string;
  };
}

// Sleep helper for yielding
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Background processing function
async function processShipmentsInBackground(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  sellerId: string,
  accessToken: string,
  shipmentIds: string[],
  shipmentToOrderMap: Map<string, string>,
  jobId: string
) {
  try {
    console.log(`[Job ${jobId}] Starting background shipments sync: ${shipmentIds.length} shipments`);

    let synced = 0;
    let errors = 0;
    const BATCH_SIZE = 20;

    for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
      const batch = shipmentIds.slice(i, i + BATCH_SIZE);
      console.log(`[Job ${jobId}] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} shipments`);
      
      await Promise.all(batch.map(async (shipment_id: string) => {
        try {
          const order_id = shipmentToOrderMap.get(shipment_id);
          if (!order_id) {
            console.warn(`[Job ${jobId}] No order_id found for shipment ${shipment_id}`);
            errors++;
            return;
          }

          const mlUrl = `https://api.mercadolibre.com/shipments/${shipment_id}`;
          const response = await fetch(mlUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            console.error(`[Job ${jobId}] Failed to fetch shipment ${shipment_id}: HTTP ${response.status}`);
            errors++;
            return;
          }

          const shipment: MLShipment = await response.json();
          
          // Label is available ONLY if:
          // 1. Substatus is ready_to_print or printed
          // 2. AND it's NOT a FULL logistic (fulfillment, cross_docking)
          const isFullLogistic = FULL_LOGISTIC_TYPES.includes(shipment.logistic_type);
          const isPrintableSubstatus = SELLER_PRINTABLE_SUBSTATUSES.includes(shipment.substatus || '');
          const labelAvailable = isPrintableSubstatus && !isFullLogistic;

          // Build address string
          const addr = shipment.receiver_address;
          const addressParts = [
            addr?.address_line,
            addr?.city?.name,
            addr?.state?.name,
            addr?.zip_code,
          ].filter(Boolean);
          const receiverAddress = addressParts.join(', ') || null;

          const shipmentData = {
            user_id: userId,
            seller_id: sellerId,
            order_id: order_id,
            shipment_id: shipment_id,
            shipment_status: shipment.status,
            shipment_substatus: shipment.substatus,
            tracking_number: shipment.tracking_number,
            label_available: labelAvailable,
            logistic_type: shipment.logistic_type,
            receiver_name: addr?.receiver_name || null,
            receiver_address: receiverAddress,
            last_sync_at: new Date().toISOString(),
          };

          const { error: upsertError } = await supabaseAdmin
            .from('meli_shipments_cache')
            .upsert(shipmentData, {
              onConflict: 'seller_id,shipment_id',
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(`[Job ${jobId}] Upsert error for shipment ${shipment_id}:`, upsertError);
            errors++;
          } else {
            synced++;
          }
        } catch (err) {
          console.error(`[Job ${jobId}] Error syncing shipment ${shipment_id}:`, err);
          errors++;
        }
      }));

      // Update progress
      await supabaseAdmin.from('sync_jobs').update({
        processed_records: synced + errors,
      }).eq('id', jobId);

      // Small yield between batches
      if (i + BATCH_SIZE < shipmentIds.length) {
        await sleep(50);
      }
    }

    console.log(`[Job ${jobId}] Shipments sync complete: ${synced} synced, ${errors} errors`);

    // Mark job as done
    await supabaseAdmin.from('sync_jobs').update({
      status: errors > 0 && synced === 0 ? 'error' : 'done',
      processed_records: synced,
      error_message: errors > 0 ? `${errors} shipments failed` : null,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

  } catch (error) {
    console.error(`[Job ${jobId}] Background processing error:`, error);
    await supabaseAdmin.from('sync_jobs').update({
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
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

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { seller_id, shipment_ids } = await req.json();
    
    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!shipment_ids || shipment_ids.length === 0) {
      return new Response(
        JSON.stringify({ accepted: true, job_id: null, message: 'No shipments to sync' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting sync for ${shipment_ids.length} shipments, seller: ${seller_id}`);

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

    // Get order_id mapping for shipment_ids
    const { data: ordersMapping } = await supabaseAdmin
      .from('meli_orders_cache')
      .select('order_id, shipment_id')
      .eq('seller_id', seller_id)
      .in('shipment_id', shipment_ids);

    const shipmentToOrderMap = new Map(
      (ordersMapping || []).map(o => [o.shipment_id, o.order_id])
    );

    // Create job record
    const jobId = crypto.randomUUID();
    await supabaseAdmin.from('sync_jobs').insert({
      id: jobId,
      user_id: user.id,
      seller_id: seller_id,
      job_type: 'shipments',
      status: 'processing',
      total_records: shipment_ids.length,
      processed_records: 0,
    });

    // Start background processing
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(
        processShipmentsInBackground(
          supabaseAdmin,
          user.id,
          seller_id,
          mlAccount.access_token,
          shipment_ids,
          shipmentToOrderMap,
          jobId
        )
      );
    } else {
      processShipmentsInBackground(
        supabaseAdmin,
        user.id,
        seller_id,
        mlAccount.access_token,
        shipment_ids,
        shipmentToOrderMap,
        jobId
      ).catch(err => console.error('Background processing failed:', err));
    }

    // Return immediately
    return new Response(
      JSON.stringify({ 
        accepted: true,
        job_id: jobId,
        message: 'Shipments sync started in background',
        total: shipment_ids.length,
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ml-sync-shipments:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
