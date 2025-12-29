import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface MLOrder {
  id: number;
  status: string;
  date_created: string;
  buyer: {
    id: number;
    nickname: string;
  };
  total_amount: number;
  shipping?: {
    id: number;
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

    const { seller_id, date_from, date_to, status } = await req.json();
    
    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Syncing orders for seller: ${seller_id}, date_from: ${date_from}, date_to: ${date_to}`);

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

    // Build ML API URL
    let mlUrl = `https://api.mercadolibre.com/orders/search?seller=${seller_id}&sort=date_desc`;
    
    if (date_from) {
      mlUrl += `&order.date_created.from=${date_from}`;
    }
    if (date_to) {
      mlUrl += `&order.date_created.to=${date_to}`;
    }
    if (status && status.length > 0) {
      mlUrl += `&order.status=${status.join(',')}`;
    }

    console.log('Fetching orders from ML:', mlUrl);

    // Fetch orders with pagination
    let allOrders: MLOrder[] = [];
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const paginatedUrl = `${mlUrl}&offset=${offset}&limit=${limit}`;
      const mlResponse = await fetch(paginatedUrl, {
        headers: {
          'Authorization': `Bearer ${mlAccount.access_token}`,
        },
      });

      if (!mlResponse.ok) {
        const errorText = await mlResponse.text();
        console.error('ML API error:', errorText);
        
        if (mlResponse.status === 401) {
          return new Response(
            JSON.stringify({ error: 'ML token expired', code: 'TOKEN_EXPIRED' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: 'Failed to fetch orders from ML' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await mlResponse.json();
      const orders = data.results || [];
      allOrders = [...allOrders, ...orders];

      console.log(`Fetched ${orders.length} orders, total: ${allOrders.length}, paging: ${JSON.stringify(data.paging)}`);

      if (orders.length < limit || allOrders.length >= (data.paging?.total || 0)) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Safety limit
      if (allOrders.length >= 500) {
        console.log('Reached safety limit of 500 orders');
        hasMore = false;
      }
    }

    console.log(`Total orders fetched: ${allOrders.length}`);

    // Upsert orders to cache
    let inserted = 0;
    let updated = 0;

    for (const order of allOrders) {
      const orderData = {
        user_id: user.id,
        seller_id: seller_id,
        order_id: order.id.toString(),
        created_at_meli: order.date_created,
        order_status: order.status,
        shipment_id: order.shipping?.id?.toString() || null,
        buyer_nickname: order.buyer?.nickname || null,
        total_amount: order.total_amount || null,
        last_sync_at: new Date().toISOString(),
      };

      const { data: existing } = await supabaseClient
        .from('meli_orders_cache')
        .select('id')
        .eq('seller_id', seller_id)
        .eq('order_id', order.id.toString())
        .maybeSingle();

      if (existing) {
        await supabaseClient
          .from('meli_orders_cache')
          .update(orderData)
          .eq('id', existing.id);
        updated++;
      } else {
        await supabaseClient
          .from('meli_orders_cache')
          .insert(orderData);
        inserted++;
      }
    }

    console.log(`Sync complete: ${inserted} inserted, ${updated} updated`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        total: allOrders.length,
        inserted,
        updated,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ml-sync-orders:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
