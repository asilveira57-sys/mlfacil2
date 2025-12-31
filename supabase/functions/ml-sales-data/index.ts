import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '');
    
    // Create admin client with service role for ALL operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Validate JWT and get user using admin client
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError) {
      console.error('Auth error:', userError.message, 'Status:', userError.status);
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: userError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!user) {
      console.error('No user found for token');
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Get user's ML account (pega a conta ativa mais recente)
    const { data: accounts, error: accountError } = await supabaseAdmin
      .from('ml_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    const mlAccount = accounts?.[0] ?? null;

    if (accountError) {
      console.error('Error fetching ML account:', accountError);
      throw new Error('Failed to fetch ML account');
    }

    if (!mlAccount) {
      return new Response(
        JSON.stringify({ 
          error: 'No ML account connected',
          salesData: null,
          metrics: null 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sellerId = mlAccount.ml_user_id;
    console.log('ML Account found:', sellerId);

    // ====== BUSCAR DADOS DO CACHE LOCAL ======
    
    // 1. Buscar todos os pedidos pagos do cache
    const { data: cachedOrders, error: ordersError } = await supabaseAdmin
      .from('meli_orders_cache')
      .select('order_id, created_at_meli, total_amount, order_status')
      .eq('seller_id', sellerId)
      .eq('order_status', 'paid')
      .order('created_at_meli', { ascending: false });

    if (ordersError) {
      console.error('Error fetching cached orders:', ordersError);
      throw new Error('Failed to fetch cached orders');
    }

    console.log('Cached orders found:', cachedOrders?.length || 0);

    // 2. Buscar items dos pedidos para top produtos
    const { data: cachedItems, error: itemsError } = await supabaseAdmin
      .from('meli_order_items_cache')
      .select('item_id, title, quantity, unit_price, created_at_meli')
      .eq('seller_id', sellerId);

    if (itemsError) {
      console.error('Error fetching cached items:', itemsError);
      // Não é erro fatal, apenas log
    }

    console.log('Cached items found:', cachedItems?.length || 0);

    // ====== CALCULAR MÉTRICAS DO CACHE ======
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    let totalRevenue = 0;
    let totalOrders = 0;
    let revenue7d = 0;
    let orders7d = 0;
    let revenue30d = 0;
    let orders30d = 0;
    let revenueToday = 0;
    let ordersToday = 0;

    const dailySales: Record<string, { date: string; revenue: number; orders: number }> = {};

    for (const order of cachedOrders || []) {
      const amount = Number(order.total_amount) || 0;
      const orderDate = new Date(order.created_at_meli);
      const dateKey = orderDate.toISOString().split('T')[0];

      totalRevenue += amount;
      totalOrders++;

      // Daily aggregation
      if (!dailySales[dateKey]) {
        dailySales[dateKey] = { date: dateKey, revenue: 0, orders: 0 };
      }
      dailySales[dateKey].revenue += amount;
      dailySales[dateKey].orders++;

      // Period metrics
      if (orderDate >= today) {
        revenueToday += amount;
        ordersToday++;
      }
      if (orderDate >= last7Days) {
        revenue7d += amount;
        orders7d++;
      }
      if (orderDate >= last30Days) {
        revenue30d += amount;
        orders30d++;
      }
    }

    // ====== CALCULAR TOP PRODUTOS DO CACHE DE ITEMS ======
    const productSales: Record<string, { title: string; quantity: number; revenue: number }> = {};

    for (const item of cachedItems || []) {
      const itemId = item.item_id;
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unit_price) || 0;

      if (!productSales[itemId]) {
        productSales[itemId] = { 
          title: item.title || 'Produto sem título', 
          quantity: 0, 
          revenue: 0 
        };
      }
      productSales[itemId].quantity += qty;
      productSales[itemId].revenue += price * qty;
    }

    // Convert to arrays and sort
    const dailySalesArray = Object.values(dailySales)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30); // Last 30 days

    const topProducts = Object.entries(productSales)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const metrics = {
      totalRevenue,
      totalOrders,
      revenueToday,
      ordersToday,
      revenue7d,
      orders7d,
      revenue30d,
      orders30d,
      averageTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      averageTicket30d: orders30d > 0 ? revenue30d / orders30d : 0,
    };

    console.log('Metrics calculated from cache:', {
      totalOrders: metrics.totalOrders,
      totalRevenue: metrics.totalRevenue,
      orders30d: metrics.orders30d,
      revenue30d: metrics.revenue30d,
      topProductsCount: topProducts.length,
    });

    return new Response(
      JSON.stringify({
        metrics,
        dailySales: dailySalesArray,
        topProducts,
        seller: {
          nickname: mlAccount.nickname,
          email: mlAccount.email,
        },
        _debug: {
          cachedOrdersCount: cachedOrders?.length || 0,
          cachedItemsCount: cachedItems?.length || 0,
          source: 'local_cache',
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ml-sales-data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
