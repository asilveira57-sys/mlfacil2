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

    const url = new URL(req.url);
    const path = url.pathname.split('/').filter(Boolean).slice(1).join('/');
    const params = Object.fromEntries(url.searchParams.entries());
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    console.log(`[trends-api] User ${user.id} requesting: ${path}`, params);

    // Route handling
    let result;
    switch (path) {
      case 'mercado/trends':
        result = await getMarketTrends(supabase, params);
        break;
      case 'mercado/highlights':
        result = await getMarketHighlights(supabase, params);
        break;
      case 'mercado/historico':
        result = await getMarketHistory(supabase, params);
        break;
      case 'seller/top-visitados':
        result = await getSellerTopVisited(supabase, user.id, params);
        break;
      case 'seller/top-vendidos':
        result = await getSellerTopSold(supabase, user.id, params);
        break;
      case 'seller/historico':
        result = await getSellerHistory(supabase, user.id, params);
        break;
      case 'seller/item-history':
        result = await getSellerItemHistory(supabase, user.id, params);
        break;
      case 'alertas':
        result = await getAlerts(supabase, user.id, params);
        break;
      case 'alertas/mark-read':
        result = await markAlertRead(supabase, user.id, body);
        break;
      case 'alertas/dismiss':
        result = await dismissAlert(supabase, user.id, body);
        break;
      case 'feature-flags':
        result = await getFeatureFlags(supabase, user.id);
        break;
      case 'overview':
        result = await getOverview(supabase, user.id, params);
        break;
      default:
        return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[trends-api] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ================== MARKET ENDPOINTS ==================

async function getMarketTrends(supabase: any, params: Record<string, string>) {
  const siteId = params.site_id || 'MLB';
  const categoryId = params.category_id;

  // Use __ROOT__ for null category to match how trends-collect-public stores it
  const categoryValue = categoryId || '__ROOT__';

  const { data, error } = await supabase
    .from('trend_snapshots')
    .select('*')
    .eq('site_id', siteId)
    .eq('category_id', categoryValue)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.error('[trends-api] Error fetching trends:', error);
    throw error;
  }

  return {
    trends: data?.trends_data || [],
    keywords: data?.keywords_data || [],
    snapshot_date: data?.snapshot_date || null,
    message: !data ? 'Dados ainda não coletados. Aguarde a próxima sincronização.' : null,
  };
}

async function getMarketHighlights(supabase: any, params: Record<string, string>) {
  const siteId = params.site_id || 'MLB';
  const categoryId = params.category_id;
  const fetchAll = params.all === 'true';

  // If no category and not fetching all, return empty
  if (!categoryId && !fetchAll) {
    return { items: [], message: 'Selecione uma categoria' };
  }

  // Fetch all categories - get top items from each category, ranked globally
  if (fetchAll) {
    console.log('[trends-api] market/highlights fetching all categories');
    
    // Get latest snapshots for all categories
    const { data: snapshots, error: snapError } = await supabase
      .from('highlights_snapshots')
      .select('id, snapshot_date, category_id')
      .eq('site_id', siteId)
      .order('snapshot_date', { ascending: false });

    if (snapError) throw snapError;
    if (!snapshots || snapshots.length === 0) {
      return { items: [], message: 'Nenhum dado disponível' };
    }

    // Get the most recent snapshot per category
    const latestByCategory = new Map<string, { id: string; snapshot_date: string }>();
    for (const snap of snapshots) {
      if (!latestByCategory.has(snap.category_id)) {
        latestByCategory.set(snap.category_id, { id: snap.id, snapshot_date: snap.snapshot_date });
      }
    }

    const snapshotIds = Array.from(latestByCategory.values()).map(s => s.id);
    const mostRecentDate = snapshots[0]?.snapshot_date;

    // Fetch items from all these snapshots
    const { data: allItems, error: itemsError } = await supabase
      .from('highlights_items')
      .select('*')
      .in('snapshot_id', snapshotIds)
      .order('rank', { ascending: true });

    if (itemsError) throw itemsError;

    // Deduplicate by item_id (keep the one with best rank) and rank globally
    const seenItems = new Map<string, any>();
    for (const item of allItems || []) {
      const key = item.item_id;
      if (!seenItems.has(key) || item.rank < seenItems.get(key).rank) {
        seenItems.set(key, item);
      }
    }

    // Sort by original rank and take top 20
    const rankedItems = Array.from(seenItems.values())
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 20)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    return {
      items: rankedItems,
      snapshot_date: mostRecentDate,
      is_global: true,
    };
  }

  // Single category flow
  const { data: snapshot, error: snapError } = await supabase
    .from('highlights_snapshots')
    .select('id, snapshot_date, category_id')
    .eq('site_id', siteId)
    .eq('category_id', categoryId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  if (snapError && snapError.code !== 'PGRST116') {
    throw snapError;
  }

  console.log(
    `[trends-api] market/highlights paramCategory=${categoryId} snapshotCategory=${snapshot?.category_id || 'null'}`
  );

  if (!snapshot) {
    return { items: [], message: 'Histórico indisponível antes da ativação do módulo' };
  }

  const { data: items, error: itemsError } = await supabase
    .from('highlights_items')
    .select('*')
    .eq('snapshot_id', snapshot.id)
    .order('rank', { ascending: true });

  if (itemsError) throw itemsError;

  return {
    items: items || [],
    snapshot_date: snapshot.snapshot_date,
  };
}

async function getMarketHistory(supabase: any, params: Record<string, string>) {
  const siteId = params.site_id || 'MLB';
  const categoryId = params.category_id;
  const fromDate = params.from_date;
  const toDate = params.to_date;

  let query = supabase
    .from('trend_snapshots')
    .select('snapshot_date, trends_data, keywords_data')
    .eq('site_id', siteId)
    .order('snapshot_date', { ascending: false });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }
  if (fromDate) {
    query = query.gte('snapshot_date', fromDate);
  }
  if (toDate) {
    query = query.lte('snapshot_date', toDate);
  }

  const { data, error } = await query.limit(365);

  if (error) throw error;

  return {
    snapshots: data || [],
    message: data?.length === 0 ? 'Histórico indisponível antes da ativação do módulo' : null,
  };
}

// ================== SELLER ENDPOINTS ==================

async function getSellerTopVisited(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const days = parseInt(params.days || '7', 10);

  console.log(`[trends-api] seller/top-visitados days=${days} seller=${sellerId}`);

  if (!sellerId) {
    return { items: [], message: 'Seller não selecionado' };
  }

  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - days);
  const fromDateStr = fromDate.toISOString().split('T')[0];
  const toDateStr = today.toISOString().split('T')[0];

  console.log(`[trends-api] seller/top-visitados date range: ${fromDateStr} to ${toDateStr}`);

  const { data, error } = await supabase
    .from('seller_item_visits')
    .select('item_id, visits_count, visit_date')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .gte('visit_date', fromDateStr);

  if (error) throw error;

  console.log(`[trends-api] seller/top-visitados found ${data?.length || 0} visit records`);

  // Aggregate by item
  const aggregated: Record<string, number> = {};
  for (const row of data || []) {
    aggregated[row.item_id] = (aggregated[row.item_id] || 0) + row.visits_count;
  }

  const items = Object.entries(aggregated)
    .map(([item_id, visits]) => ({ item_id, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 20);

  // Enrich with item details from meli_order_items_cache (has actual data)
  const itemIds = items.map(i => i.item_id);
  const { data: itemDetails } = await supabase
    .from('meli_order_items_cache')
    .select('item_id, title, thumbnail, created_at_meli')
    .in('item_id', itemIds)
    .order('created_at_meli', { ascending: false });

  // Build map, preferring entries with thumbnails
  const detailsMap = new Map<string, { item_id: string; title: string | null; thumbnail: string | null }>();
  for (const item of itemDetails || []) {
    const existing = detailsMap.get(item.item_id);
    if (!existing) {
      detailsMap.set(item.item_id, item);
    } else if (!existing.thumbnail && item.thumbnail) {
      detailsMap.set(item.item_id, item);
    }
  }

  return {
    items: items.map(i => {
      const detail = detailsMap.get(i.item_id);
      return {
        ...i,
        title: detail?.title || i.item_id,
        thumbnail: detail?.thumbnail || null,
      };
    }),
    period_days: days,
    data_range: { from: fromDateStr, to: toDateStr },
  };
}

async function getSellerTopSold(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const days = parseInt(params.days || '7', 10);

  console.log(`[trends-api] seller/top-vendidos days=${days} seller=${sellerId}`);

  if (!sellerId) {
    return { items: [], message: 'Seller não selecionado' };
  }

  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - days);
  const fromDateStr = fromDate.toISOString().split('T')[0];
  const toDateStr = today.toISOString().split('T')[0];

  console.log(`[trends-api] seller/top-vendidos date range: ${fromDateStr} to ${toDateStr}`);

  const { data, error } = await supabase
    .from('seller_item_sales_daily')
    .select('item_id, quantity_sold, revenue, sale_date')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .gte('sale_date', fromDateStr);

  if (error) throw error;

  console.log(`[trends-api] seller/top-vendidos found ${data?.length || 0} sale records`);

  // Aggregate by item
  const aggregated: Record<string, { quantity: number; revenue: number }> = {};
  for (const row of data || []) {
    if (!aggregated[row.item_id]) {
      aggregated[row.item_id] = { quantity: 0, revenue: 0 };
    }
    aggregated[row.item_id].quantity += row.quantity_sold;
    aggregated[row.item_id].revenue += Number(row.revenue);
  }

  const items = Object.entries(aggregated)
    .map(([item_id, { quantity, revenue }]) => ({ item_id, quantity, revenue }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 20);

  // Enrich with item details from meli_order_items_cache (has actual data)
  const itemIds = items.map(i => i.item_id);
  const { data: itemDetails } = await supabase
    .from('meli_order_items_cache')
    .select('item_id, title, thumbnail, created_at_meli')
    .in('item_id', itemIds)
    .order('created_at_meli', { ascending: false });

  // Build map, preferring entries with thumbnails
  const detailsMap = new Map<string, { item_id: string; title: string | null; thumbnail: string | null }>();
  for (const item of itemDetails || []) {
    const existing = detailsMap.get(item.item_id);
    if (!existing) {
      detailsMap.set(item.item_id, item);
    } else if (!existing.thumbnail && item.thumbnail) {
      detailsMap.set(item.item_id, item);
    }
  }

  return {
    items: items.map(i => {
      const detail = detailsMap.get(i.item_id);
      return {
        ...i,
        title: detail?.title || i.item_id,
        thumbnail: detail?.thumbnail || null,
      };
    }),
    period_days: days,
    data_range: { from: fromDateStr, to: toDateStr },
  };
}

async function getSellerHistory(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const itemId = params.item_id;
  const fromMonth = params.from_month; // YYYY-MM format

  if (!sellerId) {
    return { months: [], message: 'Seller não selecionado' };
  }

  let query = supabase
    .from('seller_item_sales_monthly')
    .select('item_id, sale_month, quantity_sold, revenue')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .order('sale_month', { ascending: false });

  if (itemId) {
    query = query.eq('item_id', itemId);
  }

  if (fromMonth) {
    query = query.gte('sale_month', `${fromMonth}-01`);
  }

  const { data, error } = await query.limit(500);

  if (error) throw error;

  return {
    months: data || [],
    message: data?.length === 0 ? 'Dados disponíveis a partir de jan/2025' : null,
  };
}

async function getSellerItemHistory(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const itemId = params.item_id;

  if (!sellerId || !itemId) {
    return { visits: [], sales: [], totals: { visits_7d: 0, visits_30d: 0, sales_7d: 0, sales_30d: 0, revenue_7d: 0, revenue_30d: 0 } };
  }

  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  // Fetch visits for last 30 days
  const { data: visitsData, error: visitsError } = await supabase
    .from('seller_item_visits')
    .select('visit_date, visits_count')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .gte('visit_date', thirtyDaysAgoStr)
    .order('visit_date', { ascending: true });

  if (visitsError) throw visitsError;

  // Fetch sales for last 30 days
  const { data: salesData, error: salesError } = await supabase
    .from('seller_item_sales_daily')
    .select('sale_date, quantity_sold, revenue')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .gte('sale_date', thirtyDaysAgoStr)
    .order('sale_date', { ascending: true });

  if (salesError) throw salesError;

  // Calculate totals
  let visits7d = 0, visits30d = 0, sales7d = 0, sales30d = 0, revenue7d = 0, revenue30d = 0;

  for (const row of visitsData || []) {
    visits30d += row.visits_count;
    if (row.visit_date >= sevenDaysAgoStr) {
      visits7d += row.visits_count;
    }
  }

  for (const row of salesData || []) {
    sales30d += row.quantity_sold;
    revenue30d += Number(row.revenue);
    if (row.sale_date >= sevenDaysAgoStr) {
      sales7d += row.quantity_sold;
      revenue7d += Number(row.revenue);
    }
  }

  return {
    visits: (visitsData || []).map((row: any) => ({
      date: row.visit_date,
      visits: row.visits_count,
    })),
    sales: (salesData || []).map((row: any) => ({
      date: row.sale_date,
      quantity: row.quantity_sold,
      revenue: Number(row.revenue),
    })),
    totals: {
      visits_7d: visits7d,
      visits_30d: visits30d,
      sales_7d: sales7d,
      sales_30d: sales30d,
      revenue_7d: revenue7d,
      revenue_30d: revenue30d,
    },
  };
}

// ================== ALERTS ENDPOINTS ==================

async function getAlerts(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const includeRead = params.include_read === 'true';
  const includeDismissed = params.include_dismissed === 'true';

  let query = supabase
    .from('trend_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('triggered_at', { ascending: false });

  if (sellerId) {
    query = query.eq('seller_id', sellerId);
  }
  if (!includeRead) {
    query = query.eq('is_read', false);
  }
  if (!includeDismissed) {
    query = query.eq('is_dismissed', false);
  }

  const { data, error } = await query.limit(50);

  if (error) throw error;

  return {
    alerts: data || [],
    unread_count: (data || []).filter((a: any) => !a.is_read).length,
  };
}

async function markAlertRead(supabase: any, userId: string, body: any) {
  const { alert_id } = body;

  const { error } = await supabase
    .from('trend_alerts')
    .update({ is_read: true })
    .eq('id', alert_id)
    .eq('user_id', userId);

  if (error) throw error;

  return { success: true };
}

async function dismissAlert(supabase: any, userId: string, body: any) {
  const { alert_id } = body;

  const { error } = await supabase
    .from('trend_alerts')
    .update({ is_dismissed: true })
    .eq('id', alert_id)
    .eq('user_id', userId);

  if (error) throw error;

  return { success: true };
}

// ================== FEATURE FLAGS ==================

async function getFeatureFlags(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_feature_flags')
    .select('feature_key, enabled')
    .eq('user_id', userId)
    .like('feature_key', 'tendencias.%');

  if (error) throw error;

  const flags: Record<string, boolean> = {
    'tendencias.view_market': true,
    'tendencias.view_seller': true,
    'tendencias.view_revenue': true,
    'tendencias.manage_accounts': true,
  };

  for (const row of data || []) {
    flags[row.feature_key] = row.enabled;
  }

  return { flags };
}

// ================== OVERVIEW ==================

async function getOverview(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;

  // Get unread alerts count
  const { count: alertsCount } = await supabase
    .from('trend_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .eq('is_dismissed', false);

  // Get latest market trend snapshot date
  const { data: latestTrend } = await supabase
    .from('trend_snapshots')
    .select('snapshot_date')
    .eq('site_id', 'MLB')
    .is('category_id', null)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  // Get seller stats if seller_id provided
  let sellerStats = null;
  if (sellerId) {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const twentyEightDaysAgo = new Date(today);
    twentyEightDaysAgo.setDate(today.getDate() - 28);

    const { data: visits7d } = await supabase
      .from('seller_item_visits')
      .select('visits_count')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .gte('visit_date', sevenDaysAgo.toISOString().split('T')[0]);

    const { data: visits28d } = await supabase
      .from('seller_item_visits')
      .select('visits_count')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .gte('visit_date', twentyEightDaysAgo.toISOString().split('T')[0]);

    const { data: sales7d } = await supabase
      .from('seller_item_sales_daily')
      .select('quantity_sold')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .gte('sale_date', sevenDaysAgo.toISOString().split('T')[0]);

    const { data: sales28d } = await supabase
      .from('seller_item_sales_daily')
      .select('quantity_sold')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .gte('sale_date', twentyEightDaysAgo.toISOString().split('T')[0]);

    const totalVisits7d = (visits7d || []).reduce((sum: number, r: any) => sum + r.visits_count, 0);
    const totalVisits28d = (visits28d || []).reduce((sum: number, r: any) => sum + r.visits_count, 0);
    const totalSales7d = (sales7d || []).reduce((sum: number, r: any) => sum + r.quantity_sold, 0);
    const totalSales28d = (sales28d || []).reduce((sum: number, r: any) => sum + r.quantity_sold, 0);

    sellerStats = {
      visits_7d: totalVisits7d,
      visits_28d: totalVisits28d,
      sales_7d: totalSales7d,
      sales_28d: totalSales28d,
      growth_7d_vs_28d: totalSales28d > 0 ? ((totalSales7d * 4 - totalSales28d) / totalSales28d * 100).toFixed(1) : null,
    };
  }

  return {
    alerts_count: alertsCount || 0,
    latest_trend_date: latestTrend?.snapshot_date || null,
    seller_stats: sellerStats,
    market_available: !!latestTrend,
  };
}
