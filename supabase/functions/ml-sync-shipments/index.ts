import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Shipment statuses where labels are typically available
const LABEL_AVAILABLE_STATUSES = [
  'ready_to_ship',
  'shipped',
  'delivered',
  'not_delivered',
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

    const { seller_id, shipment_ids, order_ids } = await req.json();
    
    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Syncing shipments for seller: ${seller_id}`);

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

    // If order_ids provided, get shipment_ids from cache
    let shipmentsToSync: { shipment_id: string; order_id: string }[] = [];

    if (order_ids && order_ids.length > 0) {
      const { data: orders } = await supabaseClient
        .from('meli_orders_cache')
        .select('order_id, shipment_id')
        .eq('seller_id', seller_id)
        .in('order_id', order_ids)
        .not('shipment_id', 'is', null);

      shipmentsToSync = (orders || []).map(o => ({
        shipment_id: o.shipment_id!,
        order_id: o.order_id,
      }));
    } else if (shipment_ids && shipment_ids.length > 0) {
      // Get order_ids for these shipments from cache
      const { data: orders } = await supabaseClient
        .from('meli_orders_cache')
        .select('order_id, shipment_id')
        .eq('seller_id', seller_id)
        .in('shipment_id', shipment_ids);

      shipmentsToSync = (orders || []).map(o => ({
        shipment_id: o.shipment_id!,
        order_id: o.order_id,
      }));
    }

    console.log(`Shipments to sync: ${shipmentsToSync.length}`);

    let synced = 0;
    let errors = 0;

    // Process in batches
    const batchSize = 10;
    for (let i = 0; i < shipmentsToSync.length; i += batchSize) {
      const batch = shipmentsToSync.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async ({ shipment_id, order_id }) => {
        try {
          const mlUrl = `https://api.mercadolibre.com/shipments/${shipment_id}`;
          const response = await fetch(mlUrl, {
            headers: {
              'Authorization': `Bearer ${mlAccount.access_token}`,
            },
          });

          if (!response.ok) {
            console.error(`Failed to fetch shipment ${shipment_id}:`, await response.text());
            errors++;
            return;
          }

          const shipment: MLShipment = await response.json();
          
          // Determine if label is available
          const labelAvailable = LABEL_AVAILABLE_STATUSES.includes(shipment.status) &&
            shipment.logistic_type !== 'cross_docking' &&
            shipment.logistic_type !== 'drop_off';

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
          const { data: existing } = await supabaseClient
            .from('meli_shipments_cache')
            .select('id')
            .eq('seller_id', seller_id)
            .eq('shipment_id', shipment_id)
            .maybeSingle();

          if (existing) {
            await supabaseClient
              .from('meli_shipments_cache')
              .update(shipmentData)
              .eq('id', existing.id);
          } else {
            await supabaseClient
              .from('meli_shipments_cache')
              .insert(shipmentData);
          }

          synced++;
        } catch (err) {
          console.error(`Error syncing shipment ${shipment_id}:`, err);
          errors++;
        }
      }));
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
