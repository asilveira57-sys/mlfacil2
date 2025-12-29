import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface MLOrder {
  id: number;
  date_created: string;
  status: string;
  total_amount: number;
  currency_id: string;
  order_items: Array<{
    item: {
      id: string;
      title: string;
    };
    quantity: number;
    unit_price: number;
  }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from authorization header
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

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching ML account for user:', user.id);

    // Get user's ML account (pega a conta ativa mais recente)
    const { data: accounts, error: accountError } = await supabaseClient
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

    console.log('ML Account found:', mlAccount.ml_user_id);

    // Check if token is expired and refresh if needed
    let accessToken = mlAccount.access_token;
    const tokenExpires = new Date(mlAccount.token_expires_at);
    
    if (tokenExpires <= new Date()) {
      console.log('Token expired, refreshing...');
      
      const refreshResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: Deno.env.get('ML_APP_ID') ?? '',
          client_secret: Deno.env.get('ML_SECRET_KEY') ?? '',
          refresh_token: mlAccount.refresh_token,
        }),
      });

      if (refreshResponse.ok) {
        const tokenData = await refreshResponse.json();
        accessToken = tokenData.access_token;
        
        // Update tokens in database
        await supabaseClient
          .from('ml_accounts')
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          })
          .eq('id', mlAccount.id);
          
        console.log('Token refreshed successfully');
      } else {
        console.error('Failed to refresh token');
        throw new Error('Failed to refresh ML token');
      }
    }

    // Fetch orders from ML API
    const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${mlAccount.ml_user_id}&sort=date_desc&limit=50`;
    console.log('Fetching orders from:', ordersUrl);
    
    const ordersResponse = await fetch(ordersUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      console.error('ML API error:', errorText);
      throw new Error(`ML API error: ${ordersResponse.status}`);
    }

    const ordersData = await ordersResponse.json();
    const orders: MLOrder[] = ordersData.results || [];
    
    console.log('Orders fetched:', orders.length);

    // Process orders to generate metrics
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Calculate metrics
    let totalRevenue = 0;
    let totalOrders = 0;
    let revenue7d = 0;
    let orders7d = 0;
    let revenue30d = 0;
    let orders30d = 0;
    let revenueToday = 0;
    let ordersToday = 0;

    const dailySales: Record<string, { date: string; revenue: number; orders: number }> = {};
    const productSales: Record<string, { title: string; quantity: number; revenue: number }> = {};

    for (const order of orders) {
      if (order.status !== 'paid' && order.status !== 'shipped' && order.status !== 'delivered') {
        continue;
      }

      const orderDate = new Date(order.date_created);
      const dateKey = orderDate.toISOString().split('T')[0];
      
      totalRevenue += order.total_amount;
      totalOrders++;

      // Daily aggregation
      if (!dailySales[dateKey]) {
        dailySales[dateKey] = { date: dateKey, revenue: 0, orders: 0 };
      }
      dailySales[dateKey].revenue += order.total_amount;
      dailySales[dateKey].orders++;

      // Product aggregation
      for (const item of order.order_items || []) {
        const itemId = item.item?.id || 'unknown';
        if (!productSales[itemId]) {
          productSales[itemId] = { 
            title: item.item?.title || 'Produto sem título', 
            quantity: 0, 
            revenue: 0 
          };
        }
        productSales[itemId].quantity += item.quantity;
        productSales[itemId].revenue += item.unit_price * item.quantity;
      }

      // Period metrics
      if (orderDate >= today) {
        revenueToday += order.total_amount;
        ordersToday++;
      }
      if (orderDate >= last7Days) {
        revenue7d += order.total_amount;
        orders7d++;
      }
      if (orderDate >= last30Days) {
        revenue30d += order.total_amount;
        orders30d++;
      }
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

    console.log('Metrics calculated:', metrics);

    return new Response(
      JSON.stringify({
        metrics,
        dailySales: dailySalesArray,
        topProducts,
        seller: {
          nickname: mlAccount.nickname,
          email: mlAccount.email,
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
