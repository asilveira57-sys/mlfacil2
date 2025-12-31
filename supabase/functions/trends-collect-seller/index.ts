import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const RATE_LIMIT_DELAY = 200; // ms between API calls

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { seller_id, collect_type = 'all' } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[trends-collect-seller] Starting collection for seller ${seller_id}, type: ${collect_type}`);

    // Get account tokens
    const { data: account, error: accError } = await supabase
      .from('ml_accounts')
      .select('access_token, refresh_token, token_expires_at')
      .eq('ml_user_id', seller_id)
      .eq('user_id', user.id)
      .single();

    if (accError || !account) {
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh token if needed
    let accessToken = account.access_token;
    if (new Date(account.token_expires_at) < new Date()) {
      const refreshed = await refreshToken(supabase, seller_id, user.id, account.refresh_token);
      if (!refreshed) {
        return new Response(JSON.stringify({ error: 'Failed to refresh token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      accessToken = refreshed;
    }

    // Return immediately and process in background
    const responseData = { 
      status: 'processing', 
      message: 'Collection started in background' 
    };

    EdgeRuntime.waitUntil(
      processCollection(supabase, user.id, seller_id, accessToken, collect_type)
    );

    return new Response(JSON.stringify(responseData), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[trends-collect-seller] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function refreshToken(supabase: any, sellerId: string, userId: string, refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.error('[trends-collect-seller] Token refresh failed');
      return null;
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await supabase
      .from('ml_accounts')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('ml_user_id', sellerId)
      .eq('user_id', userId);

    return data.access_token;
  } catch (error) {
    console.error('[trends-collect-seller] Token refresh error:', error);
    return null;
  }
}

async function processCollection(
  supabase: any, 
  userId: string, 
  sellerId: string, 
  accessToken: string,
  collectType: string
) {
  try {
    const today = new Date().toISOString().split('T')[0];

    if (collectType === 'all' || collectType === 'visits') {
      await collectItemVisits(supabase, userId, sellerId, accessToken, today);
    }

    if (collectType === 'all' || collectType === 'sales') {
      await collectItemSales(supabase, userId, sellerId, today);
    }

    console.log(`[trends-collect-seller] Collection completed for seller ${sellerId}`);
  } catch (error) {
    console.error('[trends-collect-seller] Background processing error:', error);
  }
}

async function collectItemVisits(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  today: string
) {
  try {
    // Get unique items from order items cache (more reliable than analyzed_items)
    const { data: items, error: itemsError } = await supabase
      .from('meli_order_items_cache')
      .select('item_id')
      .eq('seller_id', sellerId)
      .eq('user_id', userId);

    if (itemsError || !items?.length) {
      console.log('[trends-collect-seller] No items found in order items cache');
      return;
    }

    // Get unique item IDs
    const uniqueItemIds = [...new Set(items.map((i: any) => i.item_id))];
    console.log(`[trends-collect-seller] Collecting visits for ${uniqueItemIds.length} unique items`);

    const visitsToUpsert: any[] = [];

    for (const itemId of uniqueItemIds) {
      try {
        await sleep(RATE_LIMIT_DELAY);

        const response = await fetch(
          `https://api.mercadolibre.com/items/${itemId}/visits/time_window?last=7&unit=day`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (response.status === 429) {
          console.warn('[trends-collect-seller] Rate limited, waiting...');
          await sleep(5000);
          continue;
        }

        if (!response.ok) {
          console.warn(`[trends-collect-seller] Failed to get visits for ${itemId}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const totalVisits = data.total_visits || 0;

        visitsToUpsert.push({
          user_id: userId,
          seller_id: sellerId,
          item_id: itemId,
          visit_date: today,
          visits_count: totalVisits,
        });
      } catch (error) {
        console.error(`[trends-collect-seller] Error collecting visits for ${itemId}:`, error);
      }
    }

    if (visitsToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('seller_item_visits')
        .upsert(visitsToUpsert, {
          onConflict: 'seller_id,item_id,visit_date',
        });

      if (upsertError) {
        console.error('[trends-collect-seller] Failed to upsert visits:', upsertError);
      } else {
        console.log(`[trends-collect-seller] Upserted ${visitsToUpsert.length} visit records`);
      }
    }
  } catch (error) {
    console.error('[trends-collect-seller] Error in collectItemVisits:', error);
  }
}

async function collectItemSales(
  supabase: any,
  userId: string,
  sellerId: string,
  today: string
) {
  try {
    // First get paid orders for today
    const { data: orders, error: ordersError } = await supabase
      .from('meli_orders_cache')
      .select('order_id')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .eq('order_status', 'paid')
      .gte('created_at_meli', `${today}T00:00:00`)
      .lte('created_at_meli', `${today}T23:59:59`);

    if (ordersError) {
      console.error('[trends-collect-seller] Failed to query orders:', ordersError);
      return;
    }

    if (!orders?.length) {
      console.log('[trends-collect-seller] No paid orders for today');
      return;
    }

    const orderIds = orders.map((o: any) => o.order_id);
    console.log(`[trends-collect-seller] Found ${orderIds.length} paid orders for today`);

    // Get items for these orders
    const { data: salesData, error: itemsError } = await supabase
      .from('meli_order_items_cache')
      .select('item_id, quantity, unit_price')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .in('order_id', orderIds);

    if (itemsError) {
      console.error('[trends-collect-seller] Failed to query order items:', itemsError);
      return;
    }

    if (!salesData?.length) {
      console.log('[trends-collect-seller] No items found for today orders');
      return;
    }

    // Aggregate by item
    const aggregated: Record<string, { quantity: number; revenue: number }> = {};
    for (const row of salesData) {
      const itemId = row.item_id;
      if (!aggregated[itemId]) {
        aggregated[itemId] = { quantity: 0, revenue: 0 };
      }
      aggregated[itemId].quantity += row.quantity;
      aggregated[itemId].revenue += row.quantity * Number(row.unit_price);
    }

    const salesToUpsert = Object.entries(aggregated).map(([item_id, { quantity, revenue }]) => ({
      user_id: userId,
      seller_id: sellerId,
      item_id,
      sale_date: today,
      quantity_sold: quantity,
      revenue,
    }));

    const { error: upsertError } = await supabase
      .from('seller_item_sales_daily')
      .upsert(salesToUpsert, {
        onConflict: 'seller_id,item_id,sale_date',
      });

    if (upsertError) {
      console.error('[trends-collect-seller] Failed to upsert sales:', upsertError);
    } else {
      console.log(`[trends-collect-seller] Upserted ${salesToUpsert.length} sales records`);
    }
  } catch (error) {
    console.error('[trends-collect-seller] Error in collectItemSales:', error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
