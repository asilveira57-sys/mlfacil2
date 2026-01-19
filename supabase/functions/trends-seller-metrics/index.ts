/**
 * trends-seller-metrics
 * Job pessoal do seller para cálculo de métricas reais por categoria.
 * Roda sob demanda ou via onboarding.
 * 
 * Calcula:
 * - Quantidade vendida real
 * - Receita real
 * - Ticket médio real
 * - Margem (se disponível)
 * - Por categoria derivada do histórico de pedidos
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const logPrefix = '[trends-seller-metrics]';

  try {
    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    const body = await req.json().catch(() => ({}));
    const sellerId = body.seller_id;
    const periodKey = body.period_key || 'last_30d'; // 'last_30d', 'last_90d', '2025-01', etc.

    if (!sellerId) {
      return new Response(JSON.stringify({ error: 'seller_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`${logPrefix} Calculating metrics for seller=${sellerId} period=${periodKey}`);

    // Determine date range
    let dateFrom: Date;
    let dateTo = new Date();
    
    if (periodKey === 'last_30d') {
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);
    } else if (periodKey === 'last_90d') {
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 90);
    } else if (/^\d{4}-\d{2}$/.test(periodKey)) {
      // Monthly period like '2025-01'
      const [year, month] = periodKey.split('-').map(Number);
      dateFrom = new Date(year, month - 1, 1);
      dateTo = new Date(year, month, 0); // Last day of month
    } else {
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);
    }

    // Get order items with category info from the period
    const { data: orderItems, error: itemsError } = await supabase
      .from('meli_order_items_cache')
      .select(`
        item_id,
        quantity,
        unit_price,
        catalog_product_id,
        seller_id,
        order_id,
        created_at_meli
      `)
      .eq('seller_id', sellerId)
      .gte('created_at_meli', dateFrom.toISOString())
      .lte('created_at_meli', dateTo.toISOString());

    if (itemsError) {
      console.error(`${logPrefix} Error fetching order items:`, itemsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch order items' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`${logPrefix} Found ${orderItems?.length || 0} order items`);

    if (!orderItems || orderItems.length === 0) {
      return new Response(JSON.stringify({ 
        status: 'ok',
        message: 'No order items found for this period',
        categories: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get category info for items from listings cache
    const itemIds = [...new Set(orderItems.map(i => i.item_id))];
    const { data: listings, error: listingsError } = await supabase
      .from('meli_listings_cache')
      .select('item_id, category_id')
      .eq('seller_id', sellerId)
      .in('item_id', itemIds);

    if (listingsError) {
      console.log(`${logPrefix} Error fetching listings:`, listingsError);
    }

    // Create item -> category map
    const itemCategoryMap = new Map<string, string>();
    for (const listing of listings || []) {
      if (listing.category_id) {
        itemCategoryMap.set(listing.item_id, listing.category_id);
      }
    }

    // Aggregate by category
    const categoryMetrics = new Map<string, {
      quantity: number;
      revenue: number;
      orders: Set<string>;
      items: Set<string>;
    }>();

    for (const item of orderItems) {
      const categoryId = itemCategoryMap.get(item.item_id) || 'unknown';
      
      if (!categoryMetrics.has(categoryId)) {
        categoryMetrics.set(categoryId, {
          quantity: 0,
          revenue: 0,
          orders: new Set(),
          items: new Set(),
        });
      }
      
      const metrics = categoryMetrics.get(categoryId)!;
      metrics.quantity += item.quantity || 1;
      metrics.revenue += (item.quantity || 1) * (item.unit_price || 0);
      metrics.orders.add(item.order_id);
      metrics.items.add(item.item_id);
    }

    // Get profit data if available
    const { data: profitData } = await supabase
      .from('order_cost_breakdown_cache')
      .select('order_id, margin_percent')
      .eq('seller_id', sellerId)
      .gte('created_at_meli', dateFrom.toISOString())
      .lte('created_at_meli', dateTo.toISOString());

    const orderMarginMap = new Map<string, number>();
    for (const profit of profitData || []) {
      if (profit.margin_percent != null) {
        orderMarginMap.set(profit.order_id, profit.margin_percent);
      }
    }

    // Calculate average margin per category
    const categoryMargins = new Map<string, number[]>();
    for (const item of orderItems) {
      const categoryId = itemCategoryMap.get(item.item_id) || 'unknown';
      const margin = orderMarginMap.get(item.order_id);
      
      if (margin != null) {
        if (!categoryMargins.has(categoryId)) {
          categoryMargins.set(categoryId, []);
        }
        categoryMargins.get(categoryId)!.push(margin);
      }
    }

    // Prepare upsert data
    const upsertRows = [];
    const resultCategories = [];

    for (const [categoryId, metrics] of categoryMetrics) {
      const avgTicket = metrics.orders.size > 0 ? metrics.revenue / metrics.orders.size : 0;
      const margins = categoryMargins.get(categoryId) || [];
      const avgMargin = margins.length > 0 
        ? margins.reduce((a, b) => a + b, 0) / margins.length 
        : null;

      const row = {
        user_id: userId,
        seller_id: sellerId,
        category_id: categoryId,
        period_key: periodKey,
        quantity_sold: metrics.quantity,
        revenue: metrics.revenue,
        avg_ticket: avgTicket,
        margin_percent: avgMargin,
        items_count: metrics.items.size,
        orders_count: metrics.orders.size,
        calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      upsertRows.push(row);
      resultCategories.push({
        category_id: categoryId,
        quantity_sold: metrics.quantity,
        revenue: metrics.revenue,
        avg_ticket: avgTicket,
        margin_percent: avgMargin,
        items_count: metrics.items.size,
        orders_count: metrics.orders.size,
      });
    }

    // Upsert to seller_category_metrics
    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('seller_category_metrics')
        .upsert(upsertRows, { 
          onConflict: 'seller_id,category_id,period_key',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error(`${logPrefix} Error upserting metrics:`, upsertError);
      }
    }

    console.log(`${logPrefix} Calculated metrics for ${resultCategories.length} categories`);

    return new Response(JSON.stringify({
      status: 'ok',
      period: periodKey,
      date_from: dateFrom.toISOString(),
      date_to: dateTo.toISOString(),
      categories_count: resultCategories.length,
      categories: resultCategories.sort((a, b) => b.revenue - a.revenue),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
