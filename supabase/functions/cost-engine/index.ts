import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchAllRows, fetchWithBatchedIn } from '../_shared/fetch-all-rows.ts';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

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

    const url = new URL(req.url);
    const path = url.pathname.split('/').filter(Boolean).slice(1).join('/');
    const params = Object.fromEntries(url.searchParams.entries());
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    // Internal continuation endpoint (no user auth needed, uses service key auth)
    if (path === 'orders/bulk-reimport-continue') {
      const internalKey = req.headers.get('x-internal-key');
      if (internalKey !== supabaseServiceKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const result = await continueBulkReimportJob(supabase, body.job_id);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    console.log(`[cost-engine] User ${user.id} requesting: ${path}`, params);

    console.log(`[cost-engine] User ${user.id} requesting: ${path}`, params);

    let result;
    switch (path) {
      case 'settings':
        result = await getSettings(supabase, user.id, params);
        break;
      case 'settings/update':
        result = await updateSettings(supabase, user.id, body);
        break;
      case 'catalog':
        result = await getCatalog(supabase, user.id, params);
        break;
      case 'catalog/update':
        result = await updateProductCost(supabase, user.id, body);
        break;
      case 'orders':
        result = await getOrderCosts(supabase, user.id, params);
        break;
      case 'orders/detail':
        result = await getOrderDetail(supabase, user.id, params);
        break;
      case 'orders/update-extra':
        result = await updateOrderExtra(supabase, user.id, body);
        break;
      case 'orders/no-cost':
        result = await getOrdersNoCost(supabase, user.id, params);
        break;
      case 'orders/update-manual-cost':
        result = await updateManualCost(supabase, user.id, body);
        break;
      case 'orders/reimport':
        result = await reimportOrder(supabase, user.id, body);
        break;
      case 'orders/bulk-reimport':
        result = await startBulkReimportJob(supabase, user.id, body.seller_id, body.order_ids || [], body.job_type || 'reimport');
        break;
      case 'orders/bulk-reimport-status':
        result = await getBulkJobStatus(supabase, user.id, params);
        break;
      case 'calculate':
        // Start background calculation
        EdgeRuntime.waitUntil(
          calculateCosts(supabase, user.id, body.seller_id, body.period_days || 30)
        );
        result = { status: 'processing', message: 'Cálculo iniciado em background' };
        break;
      case 'calculate-order':
        result = await calculateSingleOrder(supabase, user.id, body.seller_id, body.order_id);
        break;
      case 'summary':
        result = await getSummary(supabase, user.id, params);
        break;
      case 'abc':
        result = await getAbcProfit(supabase, user.id, params);
        break;
      case 'abc/calculate':
        EdgeRuntime.waitUntil(
          calculateAbcProfit(supabase, user.id, body.seller_id, body.period_days || 30)
        );
        result = { status: 'processing', message: 'ABC por lucro calculando em background' };
        break;
      case 'trends-margin':
        result = await getTrendsWithMargin(supabase, user.id, params);
        break;
      case 'catalog/fetch-erp-cost':
        result = await fetchErpCost(supabase, user.id, body);
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
    console.error('[cost-engine] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ================== SETTINGS ==================

async function getSettings(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  if (!sellerId) throw new Error('seller_id is required');

  const [{ data: packaging }, { data: fees }] = await Promise.all([
    supabase.from('packaging_cost_settings').select('*').eq('seller_id', sellerId).eq('user_id', userId).maybeSingle(),
    supabase.from('marketplace_fee_rules').select('*').eq('seller_id', sellerId).eq('user_id', userId).maybeSingle(),
  ]);

  return {
    packaging: packaging || { default_packaging_cost: 0, packaging_cost_mode: 'por_pedido' },
    fees: fees || { fee_mode: 'percentual', fee_percent_default: 16, fee_fixed_default: 0 },
  };
}

async function updateSettings(supabase: any, userId: string, body: any) {
  const { seller_id, packaging, fees } = body;
  if (!seller_id) throw new Error('seller_id is required');

  if (packaging) {
    await supabase.from('packaging_cost_settings').upsert({
      user_id: userId,
      seller_id,
      default_packaging_cost: packaging.default_packaging_cost || 0,
      packaging_cost_mode: packaging.packaging_cost_mode || 'por_pedido',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'seller_id,user_id' });
  }

  if (fees) {
    await supabase.from('marketplace_fee_rules').upsert({
      user_id: userId,
      seller_id,
      channel: 'meli',
      fee_mode: fees.fee_mode || 'percentual',
      fee_percent_default: fees.fee_percent_default || 16,
      fee_fixed_default: fees.fee_fixed_default || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'seller_id,user_id,channel' });
  }

  return { success: true };
}

// ================== CATALOG ==================

async function getCatalog(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const onlyMissing = params.only_missing === 'true';
  const search = params.search || '';
  const page = parseInt(params.page || '1');
  const pageSize = parseInt(params.page_size || '50');

  if (!sellerId) throw new Error('seller_id is required');

  // Get unique products from order items cache - apply search at SQL level
  let itemsQuery = supabase
    .from('meli_order_items_cache')
    .select('product_key, item_id, variation_id, sku, title, title_short')
    .eq('seller_id', sellerId)
    .eq('user_id', userId);

  if (search) {
    itemsQuery = itemsQuery.or(
      `title.ilike.%${search}%,title_short.ilike.%${search}%,sku.ilike.%${search}%,item_id.ilike.%${search}%,product_key.ilike.%${search}%`
    );
  }

  const items = await fetchAllRows(itemsQuery);

  // Aggregate unique products
  const productMap = new Map<string, any>();
  for (const item of items || []) {
    const key = item.product_key || `${item.item_id}:${item.variation_id || ''}`;
    if (!productMap.has(key)) {
      productMap.set(key, {
        product_key: key,
        item_id: item.item_id,
        variation_id: item.variation_id,
        sku: item.sku,
        display_name: item.title_short || item.title || item.item_id,
      });
    }
  }

  // Get existing costs
  const costs = await fetchAllRows(
    supabase.from('product_cost_catalog').select('*').eq('seller_id', sellerId).eq('user_id', userId)
  );

  const costMap = new Map<string, any>(costs.map((c: any) => [c.product_key, c]));

  // Merge and filter
  let products = Array.from(productMap.values()).map(p => {
    const costEntry = costMap.get(p.product_key);
    return {
      ...p,
      cost_value: costEntry?.cost_value || 0,
      cost_source: costEntry?.cost_source || 'manual',
      has_cost: !!costEntry && Number(costEntry.cost_value) > 0,
      updated_at: costEntry?.updated_at || null,
    };
  });

  // Apply filters
  if (onlyMissing) {
    products = products.filter(p => !p.has_cost);
  }

  // Search already applied at SQL level - no JS filter needed

  // Sort by display_name
  products.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));

  const total = products.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const paginatedProducts = products.slice(offset, offset + pageSize);

  return {
    products: paginatedProducts,
    total,
    page,
    page_size: pageSize,
    total_pages: totalPages,
    missing_count: products.filter(p => !p.has_cost).length,
  };
}

async function updateProductCost(supabase: any, userId: string, body: any) {
  const { seller_id, product_key, cost_value, display_name } = body;
  if (!seller_id || !product_key) throw new Error('seller_id and product_key are required');

  await supabase.from('product_cost_catalog').upsert({
    user_id: userId,
    seller_id,
    product_key,
    cost_value: cost_value || 0,
    display_name,
    cost_source: 'manual',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'seller_id,product_key' });

  return { success: true };
}

// ================== ORDERS ==================

async function getOrderCosts(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const periodDays = parseInt(params.period_days || '30');
  const status = params.status; // ok, incompleto
  const profitType = params.profit_type; // lucro, prejuizo
  const ecommerceCost = params.ecommerce_cost; // with, without, all
  const shippingFilter = params.shipping_filter; // high, very_high, missing, all
  const billingFilter = params.billing_filter; // billing, pending, all
  const orderStatus = params.order_status; // paid, cancelled, pending_cost, all
  const search = params.search || '';
  const page = parseInt(params.page || '1');
  const pageSize = parseInt(params.page_size || '50');
  const sortBy = params.sort_by || 'created_at_meli';
  const sortDir = params.sort_dir || 'desc';

  if (!sellerId) throw new Error('seller_id is required');

  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - periodDays);
  const dateFromStr = dateFrom.toISOString();

  // Handle cancelled orders separately - they come from meli_orders_cache
  if (orderStatus === 'cancelled') {
    const cancelledOrders = await fetchAllRows(
      supabase.from('meli_orders_cache')
        .select('order_id, shipment_id, total_amount, buyer_nickname, buyer_name, created_at_meli, order_status')
        .eq('seller_id', sellerId)
        .in('order_status', ['cancelled', 'refunded', 'partially_refunded'])
        .gte('created_at_meli', dateFromStr)
        .order('created_at_meli', { ascending: false })
    );

    let results = cancelledOrders.map((o: any) => ({
      id: o.order_id,
      order_id: o.order_id,
      shipment_id: o.shipment_id,
      revenue_total: o.total_amount || 0,
      cost_total: 0,
      cost_fees: 0,
      cost_shipping: 0,
      cost_other: 0,
      profit_total: 0,
      margin_percent: 0,
      missing_cost_items_count: 0,
      status: 'cancelled',
      order_status: o.order_status || 'cancelled',
      buyer_nickname: o.buyer_nickname,
      buyer_name: o.buyer_name,
      created_at_meli: o.created_at_meli,
      shipping_cost_seller: 0,
      commission_cost: 0,
      receita_envio: 0,
      shipping_balance: 0,
      revenue_net: 0,
      cost_net: 0,
      profit_net: 0,
      margin_net: 0,
      missing_fields: [],
      fee_ml_source: 'cancelled',
    }));

    // Apply search
    if (search) {
      const searchLower = search.toLowerCase();
      results = results.filter((r: any) =>
        r.order_id?.includes(search) ||
        r.shipment_id?.includes(search) ||
        r.buyer_nickname?.toLowerCase().includes(searchLower) ||
        r.buyer_name?.toLowerCase().includes(searchLower)
      );
    }

    const total = results.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    const paginatedResults = results.slice(offset, offset + pageSize);

    return {
      orders: paginatedResults,
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages,
    };
  }

  // Get order cost breakdowns - filter by order creation date, not calculation date
  let query = supabase
    .from('order_cost_breakdown_cache')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .gte('created_at_meli', dateFromStr)
    .order('created_at_meli', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  // Filter by billing source based on order status filter
  if (orderStatus === 'pending_cost') {
    // Show only orders without cost data
    query = query.in('fee_ml_source', ['pending', 'no_charges']);
  } else if (orderStatus === 'all') {
    // Show all orders regardless of billing source - no filter
  } else if (ecommerceCost === 'without') {
    // When filtering "sem custo e-commerce", include pending/no_charges too
    // so the user can see ALL orders without e-commerce cost
  } else if (!billingFilter || billingFilter === 'all') {
    // Default: show billing + manual (exclude pending/no_charges)
    query = query.in('fee_ml_source', ['billing', 'manual']);
  } else if (billingFilter === 'billing') {
    query = query.eq('fee_ml_source', 'billing');
  } else if (billingFilter === 'manual') {
    query = query.eq('fee_ml_source', 'manual');
  }

  // Filter by e-commerce cost (cost_other)
  if (ecommerceCost === 'with') {
    query = query.gt('cost_other', 0);
  } else if (ecommerceCost === 'without') {
    query = query.or('cost_other.is.null,cost_other.eq.0');
  } else if (ecommerceCost === 'zero_total') {
    query = query.lte('cost_total', 0);
  }

  // Filter by shipping cost
  if (shippingFilter === 'high') {
    query = query.gte('shipping_cost_seller', 100);
  } else if (shippingFilter === 'very_high') {
    query = query.gte('shipping_cost_seller', 300);
  } else if (shippingFilter === 'missing') {
    query = query.or('shipping_cost_seller.is.null,shipping_cost_seller.eq.0');
  }

  // Search at SQL level using buyer_nickname from breakdown
  if (search) {
    query = query.or(`order_id.ilike.%${search}%,shipment_id.ilike.%${search}%,buyer_nickname.ilike.%${search}%`);
  }

  const results_raw = await fetchAllRows(query);

  // Batch lookup order_status from meli_orders_cache
  const orderIds = results_raw.map((r: any) => r.order_id).filter(Boolean);
  let orderStatusMap = new Map<string, string>();
  if (orderIds.length > 0) {
    const statusRows = await fetchWithBatchedIn(
      supabase, 'meli_orders_cache', 'order_id, order_status',
      'order_id', orderIds,
      [{ column: 'seller_id', value: sellerId }]
    );
    orderStatusMap = new Map(statusRows.map((r: any) => [r.order_id, r.order_status]));
  }

  let results = results_raw.map((r: any) => ({
    ...r,
    order_status: orderStatusMap.get(r.order_id) || 'paid',
  }));

  // Filter by profit type
  if (profitType === 'lucro') {
    results = results.filter((r: any) => r.profit_total >= 0);
  } else if (profitType === 'prejuizo') {
    results = results.filter((r: any) => r.profit_total < 0);
  }

  // Additional filter for missing shipping (check missing_fields array)
  if (shippingFilter === 'missing') {
    results = results.filter((r: any) => 
      r.missing_fields?.includes('sem_frete_cobrado') || 
      (r.shipping_cost_seller === 0 || r.shipping_cost_seller === null)
    );
  }

  // buyer_nickname already in breakdown - no secondary query needed

  // Server-side sorting
  const validSortKeys = ['created_at_meli', 'revenue_total', 'cost_total', 'shipping_cost_seller', 'profit_total', 'margin_percent'];
  if (validSortKeys.includes(sortBy)) {
    results.sort((a: any, b: any) => {
      let aVal: number, bVal: number;
      if (sortBy === 'created_at_meli') {
        aVal = a.created_at_meli ? new Date(a.created_at_meli).getTime() : 0;
        bVal = b.created_at_meli ? new Date(b.created_at_meli).getTime() : 0;
      } else {
        aVal = Number(a[sortBy] || 0);
        bVal = Number(b[sortBy] || 0);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  const total = results.length;

  // ids_only mode: return just order_ids without pagination (for select-all-pages)
  if (params.ids_only === 'true') {
    return {
      order_ids: results.map((r: any) => r.order_id),
      total,
    };
  }

  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const paginatedResults = results.slice(offset, offset + pageSize);

  return {
    orders: paginatedResults,
    total,
    page,
    page_size: pageSize,
    total_pages: totalPages,
  };
}

async function getOrderDetail(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const orderId = params.order_id;

  if (!sellerId || !orderId) throw new Error('seller_id and order_id are required');

  // Get order
  const { data: order } = await supabase
    .from('meli_orders_cache')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId)
    .single();

  // Get items
  const { data: items } = await supabase
    .from('meli_order_items_cache')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId);

  // Get costs for items
  const productKeys = (items || []).map((i: any) => i.product_key || `${i.item_id}:${i.variation_id || ''}`);
  const { data: costs } = await supabase
    .from('product_cost_catalog')
    .select('*')
    .eq('seller_id', sellerId)
    .in('product_key', productKeys);

  const costMap = new Map<string, number>((costs || []).map((c: any) => [c.product_key, Number(c.cost_value) || 0]));

  // Get breakdown
  const { data: breakdown } = await supabase
    .from('order_cost_breakdown_cache')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId)
    .maybeSingle();

  // Build item details
  const itemDetails = (items || []).map((item: any) => {
    const key = item.product_key || `${item.item_id}:${item.variation_id || ''}`;
    const unitCost = costMap.get(key) || 0;
    return {
      ...item,
      product_key: key,
      cost_unit: unitCost,
      cost_total: unitCost * item.quantity,
      has_cost: unitCost > 0,
    };
  });

  return {
    order,
    items: itemDetails,
    breakdown,
    missing_costs: itemDetails.filter((i: any) => !i.has_cost).length,
  };
}

async function updateOrderExtra(supabase: any, userId: string, body: any) {
  const { seller_id, order_id, cost_other, notes } = body;
  if (!seller_id || !order_id) throw new Error('seller_id and order_id are required');

  const { data: existing } = await supabase
    .from('order_cost_breakdown_cache')
    .select('*')
    .eq('seller_id', seller_id)
    .eq('order_id', order_id)
    .maybeSingle();

  if (existing) {
    const newCostOther = cost_other ?? existing.cost_other;
    const newNotes = notes ?? existing.notes;
    const newCostTotal = existing.cost_items_total + existing.cost_packaging + existing.cost_fees + existing.cost_shipping + newCostOther;
    const newProfit = existing.revenue_total - newCostTotal;
    const newMargin = existing.revenue_total > 0 ? (newProfit / existing.revenue_total) * 100 : 0;

    await supabase
      .from('order_cost_breakdown_cache')
      .update({
        cost_other: newCostOther,
        cost_total: newCostTotal,
        profit_total: newProfit,
        margin_percent: newMargin,
        notes: newNotes,
        calculated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  }

  return { success: true };
}

// ================== CALCULATE ==================

async function calculateCosts(supabase: any, userId: string, sellerId: string, periodDays: number) {
  console.log(`[cost-engine] Starting calculation for seller ${sellerId}, period ${periodDays} days`);

  try {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - periodDays);
    const dateFromStr = dateFrom.toISOString();

    // Get settings
    const { data: packaging } = await supabase
      .from('packaging_cost_settings')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .maybeSingle();

    const packagingCost = packaging?.default_packaging_cost || 0;
    const packagingMode = packaging?.packaging_cost_mode || 'por_pedido';

    // Get all paid orders
    const orders = await fetchAllRows(
      supabase.from('meli_orders_cache')
        .select('order_id, shipment_id, total_amount, buyer_nickname, buyer_name, created_at_meli')
        .eq('seller_id', sellerId)
        .eq('user_id', userId)
        .eq('order_status', 'paid')
        .gte('created_at_meli', dateFromStr)
    );

    console.log(`[cost-engine] Found ${orders.length} orders to process`);

    // Get all order items
    const orderIds = orders.map((o: any) => o.order_id);
    const allItems = await fetchWithBatchedIn(
      supabase, 'meli_order_items_cache',
      'order_id, product_key, item_id, variation_id, quantity, unit_price',
      'order_id', orderIds,
      [{ column: 'seller_id', value: sellerId }]
    );

    // Get all product costs
    const costs = await fetchAllRows(
      supabase.from('product_cost_catalog').select('product_key, cost_value').eq('seller_id', sellerId)
    );

    const costMap = new Map<string, number>(costs.map((c: any) => [c.product_key, Number(c.cost_value) || 0]));

    // Get real billing data from ML
    const financials = await fetchWithBatchedIn(
      supabase, 'meli_order_financials_cache',
      'order_id, revenue_products, revenue_shipping, cost_sale_fee, cost_shipping_fee, cost_installment_fee, cost_cancellations',
      'order_id', orderIds,
      [{ column: 'seller_id', value: sellerId }]
    );

    const financialsMap = new Map<string, any>(
      financials.map((f: any) => [f.order_id, f])
    );
    console.log(`[cost-engine] Found ${financials.length} orders with real billing data`);

    // Group items by order
    const itemsByOrder = new Map<string, any[]>();
    for (const item of allItems) {
      const key = item.product_key || `${item.item_id}:${item.variation_id || ''}`;
      const itemWithKey = { ...item, product_key: key };
      if (!itemsByOrder.has(item.order_id)) {
        itemsByOrder.set(item.order_id, []);
      }
      itemsByOrder.get(item.order_id)!.push(itemWithKey);
    }

    // Calculate for each order
    const breakdowns: any[] = [];

    for (const order of orders) {
      const items = itemsByOrder.get(order.order_id) || [];
      const billing = financialsMap.get(order.order_id);
      
      let costItemsTotal = 0;
      let missingCount = 0;

      for (const item of items) {
        const unitCost = costMap.get(item.product_key) || 0;
        costItemsTotal += unitCost * item.quantity;
        if (unitCost === 0) {
          missingCount++;
        }
      }

      const baseRevenue = Number(order.total_amount) || 0;
      const itemCount = items.reduce((sum: number, i: any) => sum + i.quantity, 0);
      const costPackaging = packagingMode === 'por_item' ? packagingCost * itemCount : packagingCost;
      
      // Use real billing data if available, otherwise estimate at 0 (no more manual fee config)
      let costFees = 0;
      let costShipping = 0;
      let revenueShipping = 0;
      let commissionCost = 0;
      let installmentsCost = 0;

      if (billing) {
        // Real data from ML billing API
        commissionCost = billing.cost_sale_fee || 0;
        installmentsCost = billing.cost_installment_fee || 0;
        costFees = commissionCost;
        costShipping = billing.cost_shipping_fee || 0;
        revenueShipping = billing.revenue_shipping || 0;
      }

      // Total revenue includes shipping paid by buyer (for backwards compatibility)
      const revenue = baseRevenue;

      // === NEW SEPARATED CALCULATIONS ===
      // Revenue NET = product revenue only (without shipping revenue)
      const revenueNet = revenue - revenueShipping;
      
      // Cost NET = product costs + commission + packaging (WITHOUT shipping)
      // This is the "real" cost of selling the product
      const costNet = costItemsTotal + costPackaging + commissionCost;
      
      // Profit NET = product profit (not impacted by shipping)
      const profitNet = revenueNet - costNet;
      
      // Margin NET = product margin (not impacted by shipping)
      const marginNet = revenueNet > 0 ? (profitNet / revenueNet) * 100 : 0;
      
      // Shipping balance = what customer paid - what ML charged
      const shippingBalance = revenueShipping - costShipping;
      
      // Track missing fields
      const missingFields: string[] = [];
      if (missingCount > 0) missingFields.push('sem_custo_produto');
      if (!billing) missingFields.push('sem_billing_real');
      if (costShipping === 0 && order.shipment_id) missingFields.push('sem_frete_cobrado');

      // Legacy calculations (for backwards compatibility)
      const costTotal = costItemsTotal + costPackaging + costFees + costShipping;
      const profit = revenue - costTotal;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      breakdowns.push({
        user_id: userId,
        seller_id: sellerId,
        order_id: order.order_id,
        shipment_id: order.shipment_id,
        calculated_at: new Date().toISOString(),
        revenue_total: revenue,
        cost_items_total: costItemsTotal,
        cost_packaging: costPackaging,
        cost_fees: costFees,
        cost_shipping: costShipping,
        cost_other: 0,
        cost_total: costTotal,
        profit_total: profitNet,
        margin_percent: marginNet,
        missing_cost_items_count: missingCount,
        status: missingCount > 0 ? 'incompleto' : (billing ? 'ok' : 'pending'),
        // NEW separated fields
        commission_cost: commissionCost,
        installments_cost: installmentsCost,
        shipping_cost_seller: costShipping,
        receita_envio: revenueShipping,
        shipping_balance: shippingBalance,
        revenue_net: revenueNet,
        cost_net: costNet,
        profit_net: profitNet,
        margin_net: marginNet,
        missing_fields: missingFields,
        // Buyer data for direct lookup (no secondary query)
        buyer_nickname: order.buyer_nickname || null,
        buyer_name: order.buyer_name || null,
        created_at_meli: order.created_at_meli || null,
      });
    }

    // Batch upsert
    const BATCH_SIZE = 100;
    for (let i = 0; i < breakdowns.length; i += BATCH_SIZE) {
      const batch = breakdowns.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('order_cost_breakdown_cache')
        .upsert(batch, { onConflict: 'seller_id,order_id' });

      if (error) {
        console.error(`[cost-engine] Batch upsert error:`, error);
      }
    }

    console.log(`[cost-engine] Calculation completed: ${breakdowns.length} orders processed`);

    // Update product aggregates
    await updateProductAggregates(supabase, userId, sellerId, periodDays);

  } catch (error) {
    console.error('[cost-engine] Calculation error:', error);
  }
}

async function calculateSingleOrder(supabase: any, userId: string, sellerId: string, orderId: string) {
  console.log(`[cost-engine] Calculating single order ${orderId}`);

  // Get settings
  const [{ data: packaging }, { data: fees }] = await Promise.all([
    supabase.from('packaging_cost_settings').select('*').eq('seller_id', sellerId).eq('user_id', userId).maybeSingle(),
    supabase.from('marketplace_fee_rules').select('*').eq('seller_id', sellerId).eq('user_id', userId).maybeSingle(),
  ]);

  const packagingCost = packaging?.default_packaging_cost || 0;
  const packagingMode = packaging?.packaging_cost_mode || 'por_pedido';
  const feeMode = fees?.fee_mode || 'percentual';
  const feePercent = fees?.fee_percent_default || 16;
  const feeFixed = fees?.fee_fixed_default || 0;

  // Get order
  const { data: order } = await supabase
    .from('meli_orders_cache')
    .select('order_id, shipment_id, total_amount')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId)
    .single();

  // Get items
  const { data: items } = await supabase
    .from('meli_order_items_cache')
    .select('product_key, item_id, variation_id, quantity, unit_price')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId);

  // Get costs
  const productKeys = (items || []).map((i: any) => i.product_key || `${i.item_id}:${i.variation_id || ''}`);
  const { data: costs } = await supabase
    .from('product_cost_catalog')
    .select('product_key, cost_value')
    .eq('seller_id', sellerId)
    .in('product_key', productKeys);

  const costMap = new Map<string, number>((costs || []).map((c: any) => [c.product_key, Number(c.cost_value) || 0]));

  let costItemsTotal = 0;
  let missingCount = 0;
  let itemCount = 0;

  for (const item of items || []) {
    const key = item.product_key || `${item.item_id}:${item.variation_id || ''}`;
    const unitCost = costMap.get(key) || 0;
    costItemsTotal += unitCost * item.quantity;
    itemCount += item.quantity;
    if (unitCost === 0) {
      missingCount++;
    }
  }

  const revenue = Number(order.total_amount) || 0;
  const costPackaging = packagingMode === 'por_item' ? packagingCost * itemCount : packagingCost;

  let costFees = 0;
  if (feeMode === 'percentual') {
    costFees = revenue * (feePercent / 100);
  } else if (feeMode === 'fixo') {
    costFees = feeFixed;
  } else if (feeMode === 'misto') {
    costFees = revenue * (feePercent / 100) + feeFixed;
  }

  const costTotal = costItemsTotal + costPackaging + costFees;
  const profit = revenue - costTotal;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  await supabase.from('order_cost_breakdown_cache').upsert({
    user_id: userId,
    seller_id: sellerId,
    order_id: orderId,
    shipment_id: order.shipment_id,
    calculated_at: new Date().toISOString(),
    revenue_total: revenue,
    cost_items_total: costItemsTotal,
    cost_packaging: costPackaging,
    cost_fees: costFees,
    cost_shipping: 0,
    cost_other: 0,
    cost_total: costTotal,
    profit_total: profit,
    margin_percent: margin,
    missing_cost_items_count: missingCount,
    status: missingCount > 0 ? 'incompleto' : 'ok',
  }, { onConflict: 'seller_id,order_id' });

  return { success: true, profit, margin, missing_count: missingCount };
}

async function updateProductAggregates(supabase: any, userId: string, sellerId: string, periodDays: number) {
  console.log(`[cost-engine] Updating product aggregates for period ${periodDays} days`);

  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - periodDays);
  const periodKey = `${periodDays}d`;

  // Get all order breakdowns
  const breakdowns = await fetchAllRows(
    supabase.from('order_cost_breakdown_cache')
      .select('order_id, profit_total, revenue_total, cost_total')
      .eq('seller_id', sellerId)
      .gte('calculated_at', dateFrom.toISOString())
  );

  const orderIds = breakdowns.map((b: any) => b.order_id);

  // Get all items for these orders
  const items = await fetchWithBatchedIn(
    supabase, 'meli_order_items_cache',
    'order_id, product_key, item_id, variation_id, quantity, unit_price, title_short, title',
    'order_id', orderIds,
    [{ column: 'seller_id', value: sellerId }]
  );

  // Get costs
  const costs = await fetchAllRows(
    supabase.from('product_cost_catalog').select('product_key, cost_value').eq('seller_id', sellerId)
  );

  const costMap = new Map<string, number>(costs.map((c: any) => [c.product_key, Number(c.cost_value) || 0]));

  // Aggregate by product
  const productAgg = new Map<string, { 
    revenue: number; 
    cost: number; 
    quantity: number;
    display_name: string;
  }>();

  for (const item of items) {
    const key = item.product_key || `${item.item_id}:${item.variation_id || ''}`;
    const unitCost = costMap.get(key) || 0;
    const itemRevenue = item.quantity * Number(item.unit_price);
    const itemCost = item.quantity * unitCost;

    if (!productAgg.has(key)) {
      productAgg.set(key, { 
        revenue: 0, 
        cost: 0, 
        quantity: 0,
        display_name: item.title_short || item.title || item.item_id,
      });
    }

    const agg = productAgg.get(key)!;
    agg.revenue += itemRevenue;
    agg.cost += itemCost;
    agg.quantity += item.quantity;
  }

  // Create aggregates
  const aggregates = Array.from(productAgg.entries()).map(([key, agg]) => ({
    user_id: userId,
    seller_id: sellerId,
    product_key: key,
    period_key: periodKey,
    period_start: dateFrom.toISOString().split('T')[0],
    period_end: new Date().toISOString().split('T')[0],
    revenue_total: agg.revenue,
    cost_total: agg.cost,
    profit_total: agg.revenue - agg.cost,
    quantity_total: agg.quantity,
    margin_percent: agg.revenue > 0 ? ((agg.revenue - agg.cost) / agg.revenue) * 100 : 0,
    updated_at: new Date().toISOString(),
  }));

  // Batch upsert
  const BATCH_SIZE = 100;
  for (let i = 0; i < aggregates.length; i += BATCH_SIZE) {
    const batch = aggregates.slice(i, i + BATCH_SIZE);
    await supabase
      .from('product_profit_aggregate_cache')
      .upsert(batch, { onConflict: 'seller_id,product_key,period_key' });
  }

  console.log(`[cost-engine] Updated ${aggregates.length} product aggregates`);
}

// ================== SUMMARY ==================

async function getSummary(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const periodDays = parseInt(params.period_days || '30');

  if (!sellerId) throw new Error('seller_id is required');

  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - periodDays);

  const breakdowns = await fetchAllRows(
    supabase.from('order_cost_breakdown_cache')
      .select('revenue_total, cost_total, profit_total, margin_percent, status, missing_cost_items_count')
      .eq('seller_id', sellerId)
      .eq('user_id', userId)
      .gte('created_at_meli', dateFrom.toISOString())
  );

  const data = breakdowns;
  const totalRevenue = data.reduce((sum: number, b: any) => sum + Number(b.revenue_total), 0);
  const totalCost = data.reduce((sum: number, b: any) => sum + Number(b.cost_total), 0);
  const totalProfit = data.reduce((sum: number, b: any) => sum + Number(b.profit_total), 0);
  const avgMargin = data.length > 0 
    ? data.reduce((sum: number, b: any) => sum + Number(b.margin_percent), 0) / data.length 
    : 0;
  const incompleteCount = data.filter((b: any) => b.status === 'incompleto').length;
  const incompletePercent = data.length > 0 ? (incompleteCount / data.length) * 100 : 0;

  // Get cancelled orders count and value
  const cancelledOrders = await fetchAllRows(
    supabase.from('meli_orders_cache')
      .select('order_id, total_amount')
      .eq('seller_id', sellerId)
      .in('order_status', ['cancelled', 'refunded', 'partially_refunded'])
      .gte('created_at_meli', dateFrom.toISOString())
  );

  const cancelledCount = cancelledOrders.length;
  const cancelledVGV = cancelledOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);

  // Top products by profit
  const { data: topProfit } = await supabase
    .from('product_profit_aggregate_cache')
    .select('product_key, profit_total, revenue_total, margin_percent, quantity_total')
    .eq('seller_id', sellerId)
    .eq('period_key', `${periodDays}d`)
    .order('profit_total', { ascending: false })
    .limit(10);

  // Top products by loss
  const { data: topLoss } = await supabase
    .from('product_profit_aggregate_cache')
    .select('product_key, profit_total, revenue_total, margin_percent, quantity_total')
    .eq('seller_id', sellerId)
    .eq('period_key', `${periodDays}d`)
    .order('profit_total', { ascending: true })
    .limit(10);

  return {
    summary: {
      total_revenue: totalRevenue,
      total_cost: totalCost,
      total_profit: totalProfit,
      avg_margin: avgMargin,
      order_count: data.length,
      incomplete_count: incompleteCount,
      incomplete_percent: incompletePercent,
      cancelled_count: cancelledCount,
      cancelled_vgv: cancelledVGV,
    },
    top_profit: topProfit || [],
    top_loss: (topLoss || []).filter((p: any) => p.profit_total < 0),
  };
}

// ================== ABC ==================

async function getAbcProfit(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const periodDays = parseInt(params.period_days || '30');
  const metric = params.metric || 'profit';

  if (!sellerId) throw new Error('seller_id is required');

  const data = await fetchAllRows(
    supabase.from('abc_profit_cache')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('period_key', `${periodDays}d`)
      .eq('metric', metric)
      .order('rank', { ascending: true })
  );

  const results = data;
  const classA = results.filter((r: any) => r.class === 'A');
  const classB = results.filter((r: any) => r.class === 'B');
  const classC = results.filter((r: any) => r.class === 'C');

  return {
    data: results,
    summary: {
      classA: { count: classA.length, total: classA.reduce((s: number, r: any) => s + Number(r.value_total), 0) },
      classB: { count: classB.length, total: classB.reduce((s: number, r: any) => s + Number(r.value_total), 0) },
      classC: { count: classC.length, total: classC.reduce((s: number, r: any) => s + Number(r.value_total), 0) },
    },
  };
}

async function calculateAbcProfit(supabase: any, userId: string, sellerId: string, periodDays: number) {
  console.log(`[cost-engine] Calculating ABC for seller ${sellerId}, period ${periodDays} days`);

  const periodKey = `${periodDays}d`;

  // Get aggregates
  const aggregates = await fetchAllRows(
    supabase.from('product_profit_aggregate_cache')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('period_key', periodKey)
  );

  if (aggregates.length === 0) {
    console.log('[cost-engine] No aggregates found for ABC calculation');
    return;
  }

  // Calculate ABC for profit
  await calculateAbcForMetric(supabase, userId, sellerId, periodKey, 'profit', aggregates);
  
  // Calculate ABC for revenue
  await calculateAbcForMetric(supabase, userId, sellerId, periodKey, 'revenue', aggregates);

  console.log('[cost-engine] ABC calculation completed');
}

async function calculateAbcForMetric(
  supabase: any, 
  userId: string, 
  sellerId: string, 
  periodKey: string, 
  metric: string, 
  aggregates: any[]
) {
  // Sort by metric (descending)
  const sorted = [...aggregates].sort((a, b) => {
    const valueA = metric === 'profit' ? Number(a.profit_total) : Number(a.revenue_total);
    const valueB = metric === 'profit' ? Number(b.profit_total) : Number(b.revenue_total);
    return valueB - valueA;
  });

  // Only consider positive values for ABC
  const positive = sorted.filter(a => {
    const value = metric === 'profit' ? Number(a.profit_total) : Number(a.revenue_total);
    return value > 0;
  });

  const total = positive.reduce((sum, a) => {
    return sum + (metric === 'profit' ? Number(a.profit_total) : Number(a.revenue_total));
  }, 0);

  // Calculate cumulative and assign classes
  let cumulative = 0;
  const abcResults = positive.map((a, index) => {
    const value = metric === 'profit' ? Number(a.profit_total) : Number(a.revenue_total);
    cumulative += value;
    const percent = total > 0 ? (value / total) * 100 : 0;
    const cumulativePercent = total > 0 ? (cumulative / total) * 100 : 0;

    let abcClass = 'C';
    if (cumulativePercent <= 70) abcClass = 'A';
    else if (cumulativePercent <= 90) abcClass = 'B';

    return {
      user_id: userId,
      seller_id: sellerId,
      period_key: periodKey,
      metric,
      product_key: a.product_key,
      display_name: null,
      value_total: value,
      percent,
      cumulative_percent: cumulativePercent,
      class: abcClass,
      rank: index + 1,
      updated_at: new Date().toISOString(),
    };
  });

  // Delete old and insert new
  await supabase
    .from('abc_profit_cache')
    .delete()
    .eq('seller_id', sellerId)
    .eq('period_key', periodKey)
    .eq('metric', metric);

  // Batch insert
  const BATCH_SIZE = 100;
  for (let i = 0; i < abcResults.length; i += BATCH_SIZE) {
    const batch = abcResults.slice(i, i + BATCH_SIZE);
    await supabase.from('abc_profit_cache').insert(batch);
  }
}

// ================== TRENDS WITH MARGIN ==================

async function getTrendsWithMargin(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const periodDays = parseInt(params.period_days || '30');

  if (!sellerId) throw new Error('seller_id is required');

  // Get product aggregates
  const { data: aggregates } = await supabase
    .from('product_profit_aggregate_cache')
    .select('product_key, profit_total, revenue_total, margin_percent, quantity_total')
    .eq('seller_id', sellerId)
    .eq('period_key', `${periodDays}d`);

  // Get ABC classification
  const { data: abcData } = await supabase
    .from('abc_profit_cache')
    .select('product_key, class')
    .eq('seller_id', sellerId)
    .eq('period_key', `${periodDays}d`)
    .eq('metric', 'profit');

  const abcMap = new Map((abcData || []).map((a: any) => [a.product_key, a.class]));

  // Merge data
  const results = (aggregates || []).map((a: any) => ({
    ...a,
    abc_class: abcMap.get(a.product_key) || 'N/A',
    alert: getMarginAlert(a.margin_percent, a.quantity_total),
  }));

  // Sort by quantity (as proxy for "trending")
  results.sort((a: any, b: any) => b.quantity_total - a.quantity_total);

  return { products: results.slice(0, 50) };
}

function getMarginAlert(margin: number, quantity: number): string | null {
  if (quantity >= 5) {
    if (margin < 0) return 'cresce_mas_prejuizo';
    if (margin >= 20) return 'cresce_margem_boa';
  }
  return null;
}

// ================== ORDERS NO COST ==================

async function getOrdersNoCost(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const periodDays = parseInt(params.period_days || '30');
  const search = params.search || '';
  const page = parseInt(params.page || '1');
  const pageSize = parseInt(params.page_size || '50');

  if (!sellerId) throw new Error('seller_id is required');

  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - periodDays);

  let query = supabase
    .from('order_cost_breakdown_cache')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .in('fee_ml_source', ['pending', 'no_charges'])
    .gte('created_at_meli', dateFrom.toISOString())
    .order('created_at_meli', { ascending: false });

  if (search) {
    query = query.or(`order_id.ilike.%${search}%,shipment_id.ilike.%${search}%,buyer_nickname.ilike.%${search}%`);
  }

  const { data: orders, error } = await query;
  if (error) throw error;

  const results = orders || [];
  const pendingTotal = results.filter((o: any) => o.fee_ml_source === 'pending').length;
  const noChargesTotal = results.filter((o: any) => o.fee_ml_source === 'no_charges').length;

  const total = results.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const paginatedResults = results.slice(offset, offset + pageSize);

  return {
    orders: paginatedResults,
    total,
    page,
    page_size: pageSize,
    total_pages: totalPages,
    pending_total: pendingTotal,
    no_charges_total: noChargesTotal,
  };
}

// ================== UPDATE MANUAL COST ==================

async function updateManualCost(supabase: any, userId: string, body: any) {
  const { seller_id, order_id, commission_cost, shipping_cost, notes } = body;
  if (!seller_id || !order_id) throw new Error('seller_id and order_id are required');

  const { data: existing } = await supabase
    .from('order_cost_breakdown_cache')
    .select('*')
    .eq('seller_id', seller_id)
    .eq('order_id', order_id)
    .maybeSingle();

  if (!existing) throw new Error('Order not found');

  const newCommission = commission_cost ?? existing.commission_cost ?? 0;
  const newShipping = shipping_cost ?? existing.shipping_cost_seller ?? 0;
  const costFees = newCommission + (existing.installments_cost || 0);
  const costTotal = (existing.cost_items_total || 0) + (existing.cost_packaging || 0) + costFees + newShipping + (existing.cost_other || 0);
  const profitTotal = (existing.revenue_total || 0) - costTotal;
  const marginPercent = existing.revenue_total > 0 ? (profitTotal / existing.revenue_total) * 100 : 0;

  await supabase
    .from('order_cost_breakdown_cache')
    .update({
      commission_cost: newCommission,
      shipping_cost_seller: newShipping,
      cost_fees: costFees,
      cost_shipping: newShipping,
      cost_total: costTotal,
      profit_total: profitTotal,
      margin_percent: marginPercent,
      fee_ml_source: 'manual',
      notes: notes || existing.notes,
      has_real_financial: true,
      calculated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  return { success: true, profit_total: profitTotal, margin_percent: marginPercent };
}

// ================== REIMPORT ORDER ==================

async function reimportOrder(supabase: any, userId: string, body: any) {
  const { seller_id, order_id } = body;
  if (!seller_id || !order_id) throw new Error('seller_id and order_id are required');

  console.log(`[cost-engine] Reimporting order ${order_id} for seller ${seller_id}`);

  // 1. Delete the cost breakdown
  await supabase
    .from('order_cost_breakdown_cache')
    .delete()
    .eq('seller_id', seller_id)
    .eq('order_id', order_id);

  // 2. Delete the financials cache
  await supabase
    .from('meli_order_financials_cache')
    .delete()
    .eq('seller_id', seller_id)
    .eq('order_id', order_id);

  // 3. Delete billing details cache
  await supabase
    .from('meli_billing_details_cache')
    .delete()
    .eq('seller_id', seller_id)
    .eq('order_id', order_id);

  // 4. Recalculate the order
  try {
    await calculateSingleOrder(supabase, userId, seller_id, order_id);
  } catch (e) {
    console.error(`[cost-engine] Error recalculating after reimport:`, e);
  }

  return { success: true, message: `Pedido ${order_id} reimportado com sucesso` };
}

// ================== BULK REIMPORT JOB (self-chaining) ==================

const CHUNK_SIZE = 10;
const CHUNK_DELAY_MS = 600;

async function startBulkReimportJob(supabase: any, userId: string, sellerId: string, orderIds: string[], jobType: string = 'reimport') {
  if (!sellerId || !orderIds.length) throw new Error('seller_id and order_ids are required');

  console.log(`[cost-engine] Starting bulk ${jobType} job: ${orderIds.length} orders for seller ${sellerId}`);

  // Create job record
  const { data: job, error: jobError } = await supabase
    .from('cost_bulk_jobs')
    .insert({
      seller_id: sellerId,
      user_id: userId,
      job_type: jobType,
      status: 'running',
      order_ids: orderIds,
      total_orders: orderIds.length,
      chunk_size: CHUNK_SIZE,
    })
    .select()
    .single();

  if (jobError) throw new Error(`Failed to create job: ${jobError.message}`);

  // For reimport: delete all caches upfront in batches of 50
  if (jobType === 'reimport') {
    const BATCH = 50;
    for (let i = 0; i < orderIds.length; i += BATCH) {
      const batch = orderIds.slice(i, i + BATCH);
      await Promise.all([
        supabase.from('order_cost_breakdown_cache').delete().eq('seller_id', sellerId).in('order_id', batch),
        supabase.from('meli_order_financials_cache').delete().eq('seller_id', sellerId).in('order_id', batch),
        supabase.from('meli_billing_details_cache').delete().eq('seller_id', sellerId).in('order_id', batch),
      ]);
    }
    console.log(`[cost-engine] Bulk reimport: caches deleted for ${orderIds.length} orders`);
  }

  // Process first chunk inline, then self-invoke for rest
  await processChunkAndContinue(supabase, job.id);

  return { 
    status: 'processing', 
    job_id: job.id, 
    total: orderIds.length, 
    message: `Job iniciado em background. ${orderIds.length} pedidos serão processados.` 
  };
}

async function getBulkJobStatus(supabase: any, userId: string, params: any) {
  const jobId = params.job_id;
  if (!jobId) throw new Error('job_id is required');

  const { data, error } = await supabase
    .from('cost_bulk_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single();

  if (error) throw new Error('Job not found');
  return data;
}

async function continueBulkReimportJob(supabase: any, jobId: string) {
  if (!jobId) throw new Error('job_id is required');

  // Fetch job
  const { data: job, error } = await supabase
    .from('cost_bulk_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !job) throw new Error('Job not found');
  if (job.status !== 'running') return { status: job.status, message: 'Job is not running' };

  await processChunkAndContinue(supabase, jobId);
  return { status: 'continuing', job_id: jobId };
}

async function processChunkAndContinue(supabase: any, jobId: string) {
  // Re-fetch job to get current state
  const { data: job } = await supabase
    .from('cost_bulk_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (!job || job.status !== 'running') return;

  const orderIds = job.order_ids as string[];
  const offset = job.current_offset as number;
  const chunkSize = job.chunk_size as number;

  if (offset >= orderIds.length) {
    // Done!
    await supabase
      .from('cost_bulk_jobs')
      .update({ status: 'done' })
      .eq('id', jobId);
    console.log(`[cost-engine] Bulk job ${jobId} completed: ${job.success_count} ok, ${job.error_count} errors`);
    return;
  }

  const chunk = orderIds.slice(offset, offset + chunkSize);
  let successCount = job.success_count;
  let errorCount = job.error_count;
  let lastError = job.last_error;

  // Process chunk
  for (let i = 0; i < chunk.length; i++) {
    const orderId = chunk[i];
    try {
      if (job.job_type === 'reimport') {
        await calculateSingleOrder(supabase, job.user_id, job.seller_id, orderId);
      } else {
        // resync: use the same resync logic
        await calculateSingleOrder(supabase, job.user_id, job.seller_id, orderId);
      }
      successCount++;
    } catch (e) {
      errorCount++;
      lastError = `${orderId}: ${e instanceof Error ? e.message : 'Unknown error'}`;
      console.error(`[cost-engine] Bulk job error for ${orderId}:`, e);
    }

    // Rate limit delay between orders within chunk
    if (i < chunk.length - 1) {
      await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
    }
  }

  const newOffset = offset + chunk.length;
  const processedCount = newOffset;

  // Update job progress
  await supabase
    .from('cost_bulk_jobs')
    .update({
      current_offset: newOffset,
      processed_count: processedCount,
      success_count: successCount,
      error_count: errorCount,
      last_error: lastError,
      status: newOffset >= orderIds.length ? 'done' : 'running',
    })
    .eq('id', jobId);

  console.log(`[cost-engine] Bulk job ${jobId} progress: ${processedCount}/${orderIds.length}`);

  // If more to process, self-invoke for next chunk
  if (newOffset < orderIds.length) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fire-and-forget self-invocation
    EdgeRuntime.waitUntil(
      fetch(`${supabaseUrl}/functions/v1/cost-engine/orders/bulk-reimport-continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': serviceKey,
        },
        body: JSON.stringify({ job_id: jobId }),
      }).then(res => {
        console.log(`[cost-engine] Self-invocation for job ${jobId} chunk at offset ${newOffset}: ${res.status}`);
      }).catch(err => {
        console.error(`[cost-engine] Self-invocation failed for job ${jobId}:`, err);
      })
    );
  }
}

// ================== FETCH ERP COST ==================

async function fetchErpCost(supabase: any, userId: string, body: any) {
  const { seller_id, product_key, sku, item_id } = body;
  if (!seller_id) throw new Error('seller_id is required');
  if (!product_key) throw new Error('product_key is required');

  // Find company_id from seller_id via marketplace_accounts
  const { data: maData } = await supabase
    .from('marketplace_accounts')
    .select('company_id')
    .eq('external_user_id', seller_id)
    .limit(1)
    .single();

  if (!maData?.company_id) {
    throw new Error('Conta marketplace não encontrada para este seller');
  }

  // Get ERP integration for this company
  const { data: erpData } = await supabase
    .from('erp_integrations')
    .select('provider, api_key, status')
    .eq('company_id', maData.company_id)
    .limit(1)
    .single();

  if (!erpData) {
    return { success: false, error: 'no_erp', message: 'É necessário configurar a API Key do ERP em Configurações > Empresas para atualizar custos.' };
  }

  if (!erpData.api_key) {
    return { success: false, error: 'no_api_key', message: 'É necessário configurar a API Key do ERP em Configurações > Empresas para atualizar custos.' };
  }

  const searchTerm = sku || item_id || product_key;
  let costValue: number | null = null;
  let costSource = erpData.provider;

  if (erpData.provider === 'olist') {
    // Olist (Tiny ERP) API
    costValue = await fetchOlistCost(erpData.api_key, searchTerm);
  } else if (erpData.provider === 'bling') {
    // Bling API v3
    costValue = await fetchBlingCost(erpData.api_key, searchTerm);
  } else {
    return { success: false, error: 'unsupported_provider', message: `Provedor ERP "${erpData.provider}" não suportado para busca de custos.` };
  }

  if (costValue === null) {
    return { success: false, error: 'not_found', message: `Produto não encontrado no ${erpData.provider === 'olist' ? 'Olist (Tiny)' : 'Bling'} com o termo "${searchTerm}".` };
  }

  // Save the cost to the catalog
  await supabase.from('product_cost_catalog').upsert({
    user_id: userId,
    seller_id,
    product_key,
    cost_value: costValue,
    cost_source: costSource,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'seller_id,product_key' });

  return { success: true, cost_value: costValue, cost_source: costSource };
}

async function fetchOlistCost(apiKey: string, searchTerm: string): Promise<number | null> {
  try {
    const url = `https://api.tiny.com.br/api2/produtos.pesquisa.php`;
    const params = new URLSearchParams({
      token: apiKey,
      pesquisa: searchTerm,
      formato: 'JSON',
    });

    const response = await fetch(`${url}?${params}`);
    const data = await response.json();

    console.log('[cost-engine] Olist search result:', JSON.stringify({
      searchTerm,
      status: data.retorno?.status,
      found: data.retorno?.produtos?.length || 0,
      firstProduct: data.retorno?.produtos?.[0]?.produto?.codigo,
    }));

    if (data.retorno?.status !== 'OK' || !data.retorno?.produtos?.length) {
      return null;
    }

    // Get the first matching product
    const product = data.retorno.produtos[0]?.produto;
    if (!product) return null;

    // Prefer preco_custo > preco_custo_medio > preco (sale price as last resort)
    // Use explicit checks because parseFloat('0') returns 0 which is falsy
    const precoCusto = parseFloat(product.preco_custo);
    const precoCustoMedio = parseFloat(product.preco_custo_medio);
    const precoVenda = parseFloat(product.preco);

    const cost = (precoCusto > 0 ? precoCusto : null)
      ?? (precoCustoMedio > 0 ? precoCustoMedio : null)
      ?? (precoVenda > 0 ? precoVenda : null);

    console.log('[cost-engine] Olist cost extraction:', JSON.stringify({
      searchTerm,
      codigo: product.codigo,
      preco_custo: product.preco_custo,
      preco_custo_medio: product.preco_custo_medio,
      preco: product.preco,
      selectedCost: cost,
    }));

    return cost ?? null;
  } catch (error) {
    console.error('[cost-engine] Olist API error:', error);
    return null;
  }
}

async function fetchBlingCost(apiKey: string, searchTerm: string): Promise<number | null> {
  try {
    const url = `https://api.bling.com.br/Api/v3/produtos`;
    const params = new URLSearchParams({
      codigo: searchTerm,
      limite: '1',
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[cost-engine] Bling API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const product = data.data?.[0];
    if (!product) return null;

    // Bling returns precoCusto
    const cost = parseFloat(product.precoCusto) || parseFloat(product.preco) || null;
    return cost && cost > 0 ? cost : null;
  } catch (error) {
    console.error('[cost-engine] Bling API error:', error);
    return null;
  }
}
