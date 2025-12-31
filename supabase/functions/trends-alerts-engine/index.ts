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
    const visitsThreshold = settings?.visits_spike_threshold || 100;

    // Calculate date ranges
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    const todayStr = today.toISOString().split('T')[0];
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

    // Get sales for current period (7d)
    const { data: currentSales } = await supabase
      .from('seller_item_sales_daily')
      .select('item_id, quantity_sold, revenue')
      .eq('seller_id', seller_id)
      .eq('user_id', user.id)
      .gte('sale_date', sevenDaysAgoStr);

    // Get sales for previous period (7-14d)
    const { data: previousSales } = await supabase
      .from('seller_item_sales_daily')
      .select('item_id, quantity_sold, revenue')
      .eq('seller_id', seller_id)
      .eq('user_id', user.id)
      .gte('sale_date', fourteenDaysAgoStr)
      .lt('sale_date', sevenDaysAgoStr);

    // Aggregate by item
    const aggregateSales = (data: any[]) => {
      const result: Record<string, { quantity: number; revenue: number }> = {};
      for (const row of data || []) {
        if (!result[row.item_id]) {
          result[row.item_id] = { quantity: 0, revenue: 0 };
        }
        result[row.item_id].quantity += row.quantity_sold;
        result[row.item_id].revenue += Number(row.revenue);
      }
      return result;
    };

    const currentAgg = aggregateSales(currentSales || []);
    const previousAgg = aggregateSales(previousSales || []);

    // Find spikes and drops
    const alertsToCreate: any[] = [];
    const allItems = new Set([...Object.keys(currentAgg), ...Object.keys(previousAgg)]);

    for (const itemId of allItems) {
      const curr = currentAgg[itemId] || { quantity: 0, revenue: 0 };
      const prev = previousAgg[itemId] || { quantity: 0, revenue: 0 };

      // Sales spike
      if (prev.quantity > 0) {
        const changePercent = ((curr.quantity - prev.quantity) / prev.quantity) * 100;
        
        if (changePercent >= salesThreshold) {
          alertsToCreate.push({
            user_id: user.id,
            seller_id,
            alert_type: 'sales_spike',
            item_id: itemId,
            title: `Vendas dispararam: +${changePercent.toFixed(0)}%`,
            message: `${curr.quantity} vendas nos últimos 7 dias vs ${prev.quantity} no período anterior`,
            severity: changePercent >= 100 ? 'critical' : 'warning',
            alert_data: { current: curr.quantity, previous: prev.quantity, change_percent: changePercent },
          });
        } else if (changePercent <= -salesThreshold) {
          alertsToCreate.push({
            user_id: user.id,
            seller_id,
            alert_type: 'sales_drop',
            item_id: itemId,
            title: `Vendas caíram: ${changePercent.toFixed(0)}%`,
            message: `${curr.quantity} vendas nos últimos 7 dias vs ${prev.quantity} no período anterior`,
            severity: changePercent <= -70 ? 'critical' : 'warning',
            alert_data: { current: curr.quantity, previous: prev.quantity, change_percent: changePercent },
          });
        }
      } else if (curr.quantity >= 5) {
        // New product with significant sales
        alertsToCreate.push({
          user_id: user.id,
          seller_id,
          alert_type: 'sales_spike',
          item_id: itemId,
          title: `Novo produto vendendo bem`,
          message: `${curr.quantity} vendas nos últimos 7 dias`,
          severity: 'info',
          alert_data: { current: curr.quantity, previous: 0 },
        });
      }
    }

    // Insert new alerts (avoid duplicates)
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
          console.log(`[trends-alerts-engine] Created ${newAlerts.length} new alerts`);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      alerts_checked: allItems.size,
      alerts_created: alertsToCreate.length,
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
