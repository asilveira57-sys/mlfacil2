import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    // Validate JWT locally via signing keys (no network call to GoTrue → avoids
    // intermittent "Auth session missing!" 400s when access tokens are mid-refresh)
    const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      console.error('Auth error:', claimsError?.message ?? 'no claims');
      return new Response(
        JSON.stringify({ error: 'User not authenticated', details: claimsError?.message ?? 'invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = { id: claimsData.claims.sub as string };
    console.log('Authenticated user:', user.id);

    // ML API Access Gate - check trial/subscription
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    
    // Business-rule denials (no_company, no_trial, trial_expired) → return 200 with zeroed data + meta
    // Only gate_error / unexpected_error are real failures
    if (!gate.allowed) {
      const isBusinessRule = !['gate_error', 'unexpected_error'].includes(gate.reason);
      
      if (isBusinessRule) {
        console.log(`[ml-sales-data] Business rule denial (HTTP 200): ${gate.reason}`);
        
        const metaState = gate.reason === 'trial_expired' ? 'BLOCKED' : 'EMPTY';
        const metaReason = gate.reason === 'no_company' ? 'NO_COMPANY'
          : gate.reason === 'no_trial' ? 'NO_TRIAL'
          : gate.reason === 'trial_expired' ? 'TRIAL_EXPIRED'
          : gate.reason === 'no_subscription' ? 'NO_SUBSCRIPTION'
          : gate.reason.toUpperCase();
        
        return new Response(
          JSON.stringify({
            success: true,
            metrics: {
              totalRevenue: 0, totalOrders: 0,
              revenueToday: 0, ordersToday: 0,
              revenueYesterday: 0, ordersYesterday: 0,
              revenue7d: 0, orders7d: 0,
              revenuePrev7d: 0, ordersPrev7d: 0,
              revenue30d: 0, orders30d: 0,
              revenuePrev30d: 0, ordersPrev30d: 0,
              revenuePeriod: 0, ordersPeriod: 0,
              revenuePrevPeriod: 0, ordersPrevPeriod: 0,
              averageTicket: 0, averageTicket30d: 0,
              averageTicketPeriod: 0, averageTicketPrevPeriod: 0,
              cancelledOrders: 0, cancelledRevenue: 0,
              cancelledOrdersPeriod: 0, cancelledRevenuePeriod: 0,
            },
            dailySales: [],
            monthlySales: [],
            monthlyCancelled: [],
            topProducts: [],
            availableMonths: [],
            seller: { nickname: null, email: null },
            meta: { state: metaState, reason: metaReason },
            _debug: { source: 'gate_business_rule', gateReason: gate.reason },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Real technical gate error → keep original error response
      console.error(`[ml-sales-data] Gate technical error: ${gate.reason}`);
      return gate.response!;
    }

    // Parse request body for date filters and optional seller_id/account_id
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    let requestedSellerId: string | null = null;
    let requestedAccountId: string | null = null;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        dateFrom = body.date_from || null;
        dateTo = body.date_to || null;
        requestedSellerId = body.seller_id || null;
        requestedAccountId = body.account_id || null;
        console.log('Request params:', { dateFrom, dateTo, requestedSellerId, requestedAccountId });
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    // Get user's ML account - prioritize account_id, then seller_id, then fallback
    let mlAccount = null;
    
    // Priority 1: Get by account_id (UUID) with ownership validation
    if (requestedAccountId) {
      const { data: accountById, error: accError } = await supabaseAdmin
        .from('ml_accounts')
        .select('*')
        .eq('id', requestedAccountId)
        .eq('user_id', user.id)
        .in('connection_status', ['connected', 'attention'])
        .maybeSingle();
      
      if (accError) {
        console.error('Error fetching ML account by id:', accError);
      }
      mlAccount = accountById;
      console.log('Account lookup by UUID:', requestedAccountId, '-> found:', !!mlAccount);
    }
    
    // Priority 2: Get by seller_id with ownership validation (no is_active filter)
    if (!mlAccount && requestedSellerId) {
      const { data: specificAccount, error: specificError } = await supabaseAdmin
        .from('ml_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('ml_user_id', requestedSellerId)
        .in('connection_status', ['connected', 'attention'])
        .maybeSingle();
      
      if (specificError) {
        console.error('Error fetching specific ML account:', specificError);
      }
      mlAccount = specificAccount;
      console.log('Account lookup by seller_id:', requestedSellerId, '-> found:', !!mlAccount);
    }
    
    // Fallback: get most recently updated connected account
    if (!mlAccount) {
      const { data: accounts, error: accountError } = await supabaseAdmin
        .from('ml_accounts')
        .select('*')
        .eq('user_id', user.id)
        .in('connection_status', ['connected', 'attention'])
        .order('updated_at', { ascending: false })
        .limit(1);

      if (accountError) {
        console.error('Error fetching ML account:', accountError);
        throw new Error('Failed to fetch ML account');
      }
      
      mlAccount = accounts?.[0] ?? null;
      console.log('Account fallback lookup -> found:', !!mlAccount);
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
        p_date_to: dateTo,
        p_user_id: user.id,
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

    // RPC returns { metrics: { snake_case... }, monthly_sales: [...] }
    const m = (metricsData?.metrics ?? {}) as Record<string, unknown>;
    const monthlySales = (metricsData?.monthly_sales ?? []) as Array<{ month: string; orders: number; revenue: number }>;

    const num = (v: unknown) => Number(v) || 0;
    const ticket = (revenue: number, orders: number) => (orders > 0 ? revenue / orders : 0);

    const revenueTotal = num(m.revenue_total);
    const ordersTotal = num(m.orders_total);
    const revenueToday = num(m.revenue_today);
    const ordersToday = num(m.orders_today);
    const revenueYesterday = num(m.revenue_yesterday);
    const ordersYesterday = num(m.orders_yesterday);
    const revenue7d = num(m.revenue_7d);
    const orders7d = num(m.orders_7d);
    const revenuePrev7d = num(m.revenue_prev_7d);
    const ordersPrev7d = num(m.orders_prev_7d);
    const revenue30d = num(m.revenue_30d);
    const orders30d = num(m.orders_30d);
    const revenuePrev30d = num(m.revenue_prev_30d);
    const ordersPrev30d = num(m.orders_prev_30d);
    const revenuePeriod = num(m.revenue_period);
    const ordersPeriod = num(m.orders_period);
    const revenuePrevPeriod = num(m.revenue_prev_period);
    const ordersPrevPeriod = num(m.orders_prev_period);

    console.log('Metrics from RPC:', {
      ordersTotal, revenueTotal, ordersPeriod, revenuePeriod,
      orders7d, orders30d,
      monthsAvailable: monthlySales.length,
    });

    // Cached orders count from the cache table, so the front does NOT trigger
    // a perpetual progressive sync when the cache already has data.
    let cachedOrdersCount = 0;
    try {
      const { count } = await supabaseAdmin
        .from('meli_orders_cache')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', sellerId);
      cachedOrdersCount = count ?? 0;
    } catch (e) {
      console.warn('Failed to count cached orders:', e);
    }

    const availableMonths = monthlySales
      .map((row) => row.month)
      .filter((m): m is string => typeof m === 'string' && m.length > 0)
      .map((m) => ({ key: m, label: m }));

    const response = {
      metrics: {
        totalRevenue: revenueTotal,
        totalOrders: ordersTotal,
        revenueToday,
        ordersToday,
        revenueYesterday,
        ordersYesterday,
        revenue7d,
        orders7d,
        revenuePrev7d,
        ordersPrev7d,
        revenue30d,
        orders30d,
        revenuePrev30d,
        ordersPrev30d,
        revenuePeriod,
        ordersPeriod,
        revenuePrevPeriod,
        ordersPrevPeriod,
        averageTicket: ticket(revenueTotal, ordersTotal),
        averageTicket30d: ticket(revenue30d, orders30d),
        averageTicketPeriod: ticket(revenuePeriod, ordersPeriod),
        averageTicketPrevPeriod: ticket(revenuePrevPeriod, ordersPrevPeriod),
        cancelledOrders: 0,
        cancelledRevenue: 0,
        cancelledOrdersPeriod: 0,
        cancelledRevenuePeriod: 0,
      },
      dailySales: [],
      monthlySales,
      monthlyCancelled: [],
      topProducts: [],
      availableMonths,
      seller: {
        nickname: mlAccount.nickname,
        email: mlAccount.email,
      },
      _debug: {
        cachedOrdersCount,
        cachedItemsCount: 0,
        ordersWithItemsSynced: 0,
        itemsSyncedPercent: 0,
        source: 'rpc_get_sales_metrics',
        dateFrom,
        dateTo,
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
