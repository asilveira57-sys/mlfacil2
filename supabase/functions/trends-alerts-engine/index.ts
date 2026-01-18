import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { seller_id } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[trends-alerts-engine] Running for seller ${seller_id}`);

    // Get module settings
    const { data: settings } = await supabase
      .from('trend_module_settings')
      .select('*')
      .eq('seller_id', seller_id)
      .eq('user_id', user.id)
      .single();

    const salesThreshold = settings?.sales_spike_threshold || 50;

    // Calculate date ranges
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    const sevenDaysAgoStr = sevenDaysAgo.toISOString();
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString();

    // Get all paid orders from last 14 days from meli_orders_cache
    const { data: orders, error: ordersError } = await supabase
      .from('meli_orders_cache')
      .select('order_id, created_at_meli')
      .eq('seller_id', seller_id)
      .eq('user_id', user.id)
      .eq('order_status', 'paid')
      .gte('created_at_meli', fourteenDaysAgoStr);

    if (ordersError) {
      console.error('[trends-alerts-engine] Failed to fetch orders:', ordersError);
      return new Response(JSON.stringify({ error: 'Failed to fetch orders' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!orders?.length) {
      console.log('[trends-alerts-engine] No orders found for analysis');
      return new Response(JSON.stringify({ 
        success: true, 
        alerts_checked: 0, 
        alerts_created: 0,
        message: 'No orders to analyze'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Split orders into current (0-7d) and previous (7-14d) periods
    const currentOrderIds: string[] = [];
    const previousOrderIds: string[] = [];

    for (const order of orders) {
      const orderDate = new Date(order.created_at_meli);
      if (orderDate >= sevenDaysAgo) {
        currentOrderIds.push(order.order_id);
      } else {
        previousOrderIds.push(order.order_id);
      }
    }

    console.log(`[trends-alerts-engine] Current period orders: ${currentOrderIds.length}, Previous: ${previousOrderIds.length}`);

    // Function to get and aggregate items for a list of orders
    async function getItemsForOrders(orderIds: string[], userId: string) {
      if (orderIds.length === 0) return {};
      
      const { data: items, error } = await supabase
        .from('meli_order_items_cache')
        .select('item_id, quantity, unit_price, title, thumbnail')
        .eq('seller_id', seller_id)
        .eq('user_id', userId)
        .in('order_id', orderIds);

      if (error) {
        console.error('[trends-alerts-engine] Failed to fetch items:', error);
        return {};
      }

      const aggregated: Record<string, { quantity: number; revenue: number; title?: string; thumbnail?: string }> = {};
      for (const item of items || []) {
        if (!aggregated[item.item_id]) {
          aggregated[item.item_id] = { quantity: 0, revenue: 0, title: item.title, thumbnail: item.thumbnail };
        }
        aggregated[item.item_id].quantity += item.quantity;
        aggregated[item.item_id].revenue += item.quantity * Number(item.unit_price);
      }
      return aggregated;
    }

    const currentAgg = await getItemsForOrders(currentOrderIds, user.id);
    const previousAgg = await getItemsForOrders(previousOrderIds, user.id);

    // Find spikes and drops
    const alertsToCreate: any[] = [];
    const allItems = new Set([...Object.keys(currentAgg), ...Object.keys(previousAgg)]);

    console.log(`[trends-alerts-engine] Analyzing ${allItems.size} unique items`);

    for (const itemId of allItems) {
      const curr = currentAgg[itemId] || { quantity: 0, revenue: 0 };
      const prev = previousAgg[itemId] || { quantity: 0, revenue: 0 };
      const itemTitle = curr.title || prev.title || itemId;

      // Sales spike/drop detection
      if (prev.quantity > 0) {
        const changePercent = ((curr.quantity - prev.quantity) / prev.quantity) * 100;
        
        if (changePercent >= salesThreshold) {
          alertsToCreate.push({
            user_id: user.id,
            seller_id,
            alert_type: 'sales_spike',
            item_id: itemId,
            title: `Vendas dispararam: +${changePercent.toFixed(0)}%`,
            message: `${itemTitle.substring(0, 50)}... - ${curr.quantity} vendas (7d) vs ${prev.quantity} (anterior)`,
            severity: changePercent >= 100 ? 'critical' : 'warning',
            alert_data: { 
              current: curr.quantity, 
              previous: prev.quantity, 
              change_percent: changePercent,
              item_title: itemTitle
            },
          });
        } else if (changePercent <= -salesThreshold) {
          alertsToCreate.push({
            user_id: user.id,
            seller_id,
            alert_type: 'sales_drop',
            item_id: itemId,
            title: `Vendas caíram: ${changePercent.toFixed(0)}%`,
            message: `${itemTitle.substring(0, 50)}... - ${curr.quantity} vendas (7d) vs ${prev.quantity} (anterior)`,
            severity: changePercent <= -70 ? 'critical' : 'warning',
            alert_data: { 
              current: curr.quantity, 
              previous: prev.quantity, 
              change_percent: changePercent,
              item_title: itemTitle
            },
          });
        }
      } else if (curr.quantity >= 5) {
        // New product with significant sales
        alertsToCreate.push({
          user_id: user.id,
          seller_id,
          alert_type: 'sales_spike',
          item_id: itemId,
          title: `Novo produto vendendo bem!`,
          message: `${itemTitle.substring(0, 50)}... - ${curr.quantity} vendas nos últimos 7 dias`,
          severity: curr.quantity >= 10 ? 'warning' : 'info',
          alert_data: { 
            current: curr.quantity, 
            previous: 0,
            item_title: itemTitle
          },
        });
      }
    }

    // Insert new alerts (avoid duplicates)
    let alertsCreated = 0;
    if (alertsToCreate.length > 0) {
      // Check for existing similar alerts in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: existingAlerts } = await supabase
        .from('trend_alerts')
        .select('item_id, alert_type')
        .eq('seller_id', seller_id)
        .eq('user_id', user.id)
        .gte('triggered_at', oneDayAgo);

      const existingSet = new Set(
        (existingAlerts || []).map(a => `${a.item_id}:${a.alert_type}`)
      );

      const newAlerts = alertsToCreate.filter(
        a => !existingSet.has(`${a.item_id}:${a.alert_type}`)
      );

      if (newAlerts.length > 0) {
        const { error: insertError } = await supabase
          .from('trend_alerts')
          .insert(newAlerts);

        if (insertError) {
          console.error('[trends-alerts-engine] Failed to insert alerts:', insertError);
        } else {
          alertsCreated = newAlerts.length;
          console.log(`[trends-alerts-engine] Created ${newAlerts.length} new alerts`);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      alerts_checked: allItems.size,
      alerts_created: alertsCreated,
      message: alertsCreated > 0 ? `Created ${alertsCreated} alerts` : 'No new alerts'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[trends-alerts-engine] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
