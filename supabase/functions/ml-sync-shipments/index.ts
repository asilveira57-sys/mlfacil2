import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Shipment statuses where labels are typically available
// Removed restrictive filtering - most shipments with valid status have labels
const LABEL_UNAVAILABLE_STATUSES = [
  'cancelled',
  'returned',
  'not_verified',
];

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
        JSON.stringify({ success: true, synced: 0, errors: 0, message: 'No shipments to sync' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Syncing ${shipment_ids.length} shipments for seller: ${seller_id}`);

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

    let synced = 0;
    let errors = 0;

    // Process shipments (already batched by frontend, but add internal batch processing)
    const INTERNAL_BATCH = 10;
    for (let i = 0; i < shipment_ids.length; i += INTERNAL_BATCH) {
      const batch = shipment_ids.slice(i, i + INTERNAL_BATCH);
      
      await Promise.all(batch.map(async (shipment_id: string) => {
        try {
          const order_id = shipmentToOrderMap.get(shipment_id);
          if (!order_id) {
            console.warn(`No order_id found for shipment ${shipment_id}`);
            errors++;
            return;
          }

          const mlUrl = `https://api.mercadolibre.com/shipments/${shipment_id}`;
          const response = await fetch(mlUrl, {
            headers: {
              'Authorization': `Bearer ${mlAccount.access_token}`,
            },
          });

          if (!response.ok) {
            console.error(`Failed to fetch shipment ${shipment_id}:`, response.status);
            errors++;
            return;
          }

          const shipment: MLShipment = await response.json();
          
          // Label is available if status is not in the unavailable list
          const labelAvailable = !LABEL_UNAVAILABLE_STATUSES.includes(shipment.status);

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
            user_id: user.id,
            seller_id: seller_id,
            order_id: order_id,
            shipment_id: shipment_id,
            shipment_status: shipment.status,
            shipment_substatus: shipment.substatus,
            tracking_number: shipment.tracking_number,
            label_available: labelAvailable,
            receiver_name: addr?.receiver_name || null,
            receiver_address: receiverAddress,
            last_sync_at: new Date().toISOString(),
          };

          // Upsert
          const { data: existing } = await supabaseAdmin
            .from('meli_shipments_cache')
            .select('id')
            .eq('seller_id', seller_id)
            .eq('shipment_id', shipment_id)
            .maybeSingle();

          if (existing) {
            await supabaseAdmin
              .from('meli_shipments_cache')
              .update(shipmentData)
              .eq('id', existing.id);
          } else {
            await supabaseAdmin
              .from('meli_shipments_cache')
              .insert(shipmentData);
          }

          synced++;
        } catch (err) {
          console.error(`Error syncing shipment ${shipment_id}:`, err);
          errors++;
        }
      }));

      // Yield between internal batches
      if (i + INTERNAL_BATCH < shipment_ids.length) {
        await sleep(100);
      }
    }

    console.log(`Sync complete: ${synced} synced, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
