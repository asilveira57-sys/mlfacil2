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

    console.log(`[trends-build-history] Building monthly history for seller ${seller_id}`);

    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Get all daily sales for aggregation
    const { data: dailySales, error: salesError } = await supabase
      .from('seller_item_sales_daily')
      .select('item_id, sale_date, quantity_sold, revenue')
      .eq('seller_id', seller_id)
      .eq('user_id', user.id);

    if (salesError) {
      throw salesError;
    }

    if (!dailySales || dailySales.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        message: 'No daily sales data to aggregate',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Aggregate by month and item
    const monthlyAgg: Record<string, Record<string, { quantity: number; revenue: number }>> = {};

    for (const row of dailySales) {
      const saleDate = new Date(row.sale_date);
      const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-01`;
      
      if (!monthlyAgg[monthKey]) {
        monthlyAgg[monthKey] = {};
      }
      
      if (!monthlyAgg[monthKey][row.item_id]) {
        monthlyAgg[monthKey][row.item_id] = { quantity: 0, revenue: 0 };
      }
      
      monthlyAgg[monthKey][row.item_id].quantity += row.quantity_sold;
      monthlyAgg[monthKey][row.item_id].revenue += Number(row.revenue);
    }

    // Prepare upsert data
    const monthlyRecords: any[] = [];
    
    for (const [monthKey, items] of Object.entries(monthlyAgg)) {
      for (const [itemId, data] of Object.entries(items)) {
        monthlyRecords.push({
          user_id: user.id,
          seller_id,
          item_id: itemId,
          sale_month: monthKey,
          quantity_sold: data.quantity,
          revenue: data.revenue,
        });
      }
    }

    // Upsert monthly records in batches
    const BATCH_SIZE = 100;
    let upsertedCount = 0;

    for (let i = 0; i < monthlyRecords.length; i += BATCH_SIZE) {
      const batch = monthlyRecords.slice(i, i + BATCH_SIZE);
      
      const { error: upsertError } = await supabase
        .from('seller_item_sales_monthly')
        .upsert(batch, {
          onConflict: 'seller_id,item_id,sale_month',
        });

      if (upsertError) {
        console.error('[trends-build-history] Upsert error:', upsertError);
      } else {
        upsertedCount += batch.length;
      }
    }

    // Build monthly rankings
    const rankingTypes = ['sales_quantity', 'sales_revenue'];
    
    for (const [monthKey, items] of Object.entries(monthlyAgg)) {
      for (const rankingType of rankingTypes) {
        const sortedItems = Object.entries(items)
          .map(([item_id, data]) => ({
            item_id,
            value: rankingType === 'sales_quantity' ? data.quantity : data.revenue,
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 20);

        await supabase
          .from('monthly_rankings')
          .upsert({
            user_id: user.id,
            seller_id,
            ranking_month: monthKey,
            ranking_type: rankingType,
            rankings: sortedItems,
          }, {
            onConflict: 'seller_id,ranking_month,ranking_type',
          });
      }
    }

    console.log(`[trends-build-history] Completed: ${upsertedCount} monthly records`);

    return new Response(JSON.stringify({ 
      success: true,
      months_processed: Object.keys(monthlyAgg).length,
      records_upserted: upsertedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[trends-build-history] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
