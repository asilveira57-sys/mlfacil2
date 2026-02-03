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

    // Parse request body for date filters and optional seller_id
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    let requestedSellerId: string | null = null;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        dateFrom = body.date_from || null;
        dateTo = body.date_to || null;
        requestedSellerId = body.seller_id || null;
        console.log('Request params:', { dateFrom, dateTo, requestedSellerId });
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    // Get user's ML account
    // If seller_id is provided, use that specific account; otherwise get most recently updated
    let mlAccount = null;
    
    if (requestedSellerId) {
      // Get specific account by seller_id
      const { data: specificAccount, error: specificError } = await supabaseAdmin
        .from('ml_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('ml_user_id', requestedSellerId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (specificError) {
        console.error('Error fetching specific ML account:', specificError);
      }
      mlAccount = specificAccount;
    }
    
    // Fallback: get most recently updated account
    if (!mlAccount) {
      const { data: accounts, error: accountError } = await supabaseAdmin
        .from('ml_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (accountError) {
        console.error('Error fetching ML account:', accountError);
        throw new Error('Failed to fetch ML account');
      }
      
      mlAccount = accounts?.[0] ?? null;
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

    // Call RPC with date filters
    const { data: metricsData, error: rpcError } = await supabaseAdmin
      .rpc('get_sales_metrics', { 
        p_seller_id: sellerId,
        p_date_from: dateFrom,
        p_date_to: dateTo
      });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      throw new Error(`Failed to get sales metrics: ${rpcError.message}`);
    }

    if (!metricsData) {
      console.log('No metrics data returned from RPC');
      return new Response(
        JSON.stringify({
          metrics: {
            totalRevenue: 0,
            totalOrders: 0,
            revenueToday: 0,
            ordersToday: 0,
            revenue7d: 0,
            orders7d: 0,
            revenue30d: 0,
            orders30d: 0,
            revenuePeriod: 0,
            ordersPeriod: 0,
            averageTicket: 0,
            averageTicket30d: 0,
            averageTicketPeriod: 0,
            cancelledOrders: 0,
            cancelledRevenue: 0,
            cancelledOrdersPeriod: 0,
            cancelledRevenuePeriod: 0,
          },
          dailySales: [],
          topProducts: [],
          availableMonths: [],
          seller: {
            nickname: mlAccount.nickname,
            email: mlAccount.email,
          },
          _debug: {
            cachedOrdersCount: 0,
            cachedItemsCount: 0,
            ordersWithItemsSynced: 0,
            itemsSyncedPercent: 0,
            source: 'rpc_empty',
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Metrics from RPC:', {
      ordersTotal: metricsData.ordersTotal,
      revenueTotal: metricsData.revenueTotal,
      ordersPeriod: metricsData.ordersPeriod,
      revenuePeriod: metricsData.revenuePeriod,
      cancelledOrders: metricsData.cancelledOrders,
      availableMonths: metricsData.availableMonths?.length || 0,
    });

    // Build response in expected format
    const response = {
      metrics: {
        totalRevenue: Number(metricsData.revenueTotal) || 0,
        totalOrders: Number(metricsData.ordersTotal) || 0,
        revenueToday: Number(metricsData.revenueToday) || 0,
        ordersToday: Number(metricsData.ordersToday) || 0,
        revenueYesterday: Number(metricsData.revenueYesterday) || 0,
        ordersYesterday: Number(metricsData.ordersYesterday) || 0,
        revenue7d: Number(metricsData.revenue7d) || 0,
        orders7d: Number(metricsData.orders7d) || 0,
        revenuePrev7d: Number(metricsData.revenuePrev7d) || 0,
        ordersPrev7d: Number(metricsData.ordersPrev7d) || 0,
        revenue30d: Number(metricsData.revenue30d) || 0,
        orders30d: Number(metricsData.orders30d) || 0,
        revenuePrev30d: Number(metricsData.revenuePrev30d) || 0,
        ordersPrev30d: Number(metricsData.ordersPrev30d) || 0,
        revenuePeriod: Number(metricsData.revenuePeriod) || 0,
        ordersPeriod: Number(metricsData.ordersPeriod) || 0,
        revenuePrevPeriod: Number(metricsData.revenuePrevPeriod) || 0,
        ordersPrevPeriod: Number(metricsData.ordersPrevPeriod) || 0,
        averageTicket: Number(metricsData.averageTicket) || 0,
        averageTicket30d: Number(metricsData.averageTicket30d) || 0,
        averageTicketPeriod: Number(metricsData.averageTicketPeriod) || 0,
        averageTicketPrevPeriod: Number(metricsData.averageTicketPrevPeriod) || 0,
        cancelledOrders: Number(metricsData.cancelledOrders) || 0,
        cancelledRevenue: Number(metricsData.cancelledRevenue) || 0,
        cancelledOrdersPeriod: Number(metricsData.cancelledOrdersPeriod) || 0,
        cancelledRevenuePeriod: Number(metricsData.cancelledRevenuePeriod) || 0,
      },
      dailySales: metricsData.dailySales || [],
      monthlySales: metricsData.monthlySales || [],
      monthlyCancelled: metricsData.monthlyCancelled || [],
      topProducts: metricsData.topProducts || [],
      availableMonths: metricsData.availableMonths || [],
      seller: {
        nickname: mlAccount.nickname,
        email: mlAccount.email,
      },
      _debug: {
        cachedOrdersCount: metricsData._debug?.cachedOrdersCount || 0,
        cachedItemsCount: metricsData._debug?.cachedItemsCount || 0,
        ordersWithItemsSynced: metricsData._debug?.ordersWithItemsSynced || 0,
        itemsSyncedPercent: metricsData._debug?.itemsSyncedPercent || 0,
        source: metricsData._debug?.source || 'rpc_get_sales_metrics',
        dateFrom: metricsData._debug?.dateFrom || null,
        dateTo: metricsData._debug?.dateTo || null,
      },
    };

    return new Response(
      JSON.stringify(response),
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
