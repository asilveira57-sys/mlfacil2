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

    // Internal endpoints (no user auth needed, uses service key auth)
    if (path === 'orders/bulk-reimport-continue' || path.startsWith('_internal/')) {
      const internalKey = req.headers.get('x-internal-key');
      if (internalKey !== supabaseServiceKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Internal: calculate costs (called from historical-import)
      if (path === '_internal/calculate') {
        const userId = body.user_id;
        const sellerId = body.seller_id;
        const periodDays = body.period_days || 365;
        if (!userId || !sellerId) {
          return new Response(JSON.stringify({ error: 'user_id and seller_id required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        EdgeRuntime.waitUntil(calculateCosts(supabase, userId, sellerId, periodDays));
        return new Response(JSON.stringify({ status: 'processing', message: 'Internal calculate started' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Default: continue-bulk reimport
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

    let result;
    switch (path) {
      // ---- CATALOG ----
      case 'catalog':
        result = await getCatalog(supabase, user.id, params);
        break;
      case 'catalog/update':
        result = await updateProductCost(supabase, user.id, body);
        break;
      case 'catalog/fetch-erp-cost':
        result = await fetchErpCost(supabase, user.id, body);
        break;

      // ---- ORDERS ----
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

      // ---- CALCULATE ----
      case 'calculate':
        EdgeRuntime.waitUntil(
          calculateCosts(supabase, user.id, body.seller_id, body.period_days || 30)
        );
        result = { status: 'processing', message: 'Cálculo iniciado em background' };
        break;
      case 'calculate-order':
        result = await calculateSingleOrder(supabase, user.id, body.seller_id, body.order_id);
        break;

      // ---- SUMMARY / ABC ----
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

      // ---- PACKAGING V2 ----
      case 'packaging/list':
        result = await listPackaging(supabase, user.id, params);
        break;
      case 'packaging/upsert':
        result = await upsertPackaging(supabase, user.id, body);
        break;
      case 'packaging/toggle':
        result = await togglePackaging(supabase, user.id, body);
        break;
      case 'packaging/link':
        result = await linkPackaging(supabase, user.id, body);
        break;

      // ---- TAX V2 ----
      case 'tax/get':
        result = await getTaxConfig(supabase, user.id, params);
        break;
      case 'tax/update':
        result = await updateTaxConfig(supabase, user.id, body);
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

// ================== HELPER: resolve company_id from seller_id ==================

async function resolveCompanyId(supabase: any, sellerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('marketplace_accounts')
    .select('company_id')
    .eq('external_user_id', sellerId)
    .limit(1)
    .maybeSingle();
  if (data?.company_id) return data.company_id;

  // Fallback: ml_accounts
  const { data: ma } = await supabase
    .from('ml_accounts')
    .select('company_id')
    .eq('ml_user_id', sellerId)
    .limit(1)
    .maybeSingle();
  return ma?.company_id || null;
}

// ================== PACKAGING V2 ==================

async function listPackaging(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  if (!sellerId) throw new Error('seller_id is required');

  const companyId = await resolveCompanyId(supabase, sellerId);
  if (!companyId) return { packaging: [] };

  const data = await fetchAllRows(
    supabase.from('packaging_types')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true })
  );

  // Also get links for this seller
  const links = await fetchAllRows(
    supabase.from('product_packaging_link')
      .select('product_key, packaging_id')
      .eq('company_id', companyId)
      .eq('seller_id', sellerId)
  );

  return { packaging: data, links };
}

async function upsertPackaging(supabase: any, userId: string, body: any) {
  const { seller_id, id, name, height_cm, width_cm, length_cm, cost_value } = body;
  if (!seller_id || !name) throw new Error('seller_id and name are required');

  const companyId = await resolveCompanyId(supabase, seller_id);
  if (!companyId) throw new Error('Company not found for seller');

  if (id) {
    // Update existing
    const { error } = await supabase
      .from('packaging_types')
      .update({ name, height_cm, width_cm, length_cm, cost_value: cost_value || 0 })
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  } else {
    // Insert new
    const { error } = await supabase
      .from('packaging_types')
      .insert({ company_id: companyId, name, height_cm, width_cm, length_cm, cost_value: cost_value || 0 });
    if (error) throw error;
  }

  return { success: true };
}

async function togglePackaging(supabase: any, userId: string, body: any) {
  const { id, is_active } = body;
  if (!id) throw new Error('id is required');

  const { error } = await supabase
    .from('packaging_types')
    .update({ is_active })
    .eq('id', id);
  if (error) throw error;

  return { success: true };
}

async function linkPackaging(supabase: any, userId: string, body: any) {
  const { seller_id, product_key, packaging_id } = body;
  if (!seller_id || !product_key) throw new Error('seller_id and product_key are required');

  const companyId = await resolveCompanyId(supabase, seller_id);
  if (!companyId) throw new Error('Company not found');

  if (!packaging_id) {
    // Remove link
    await supabase
      .from('product_packaging_link')
      .delete()
      .eq('seller_id', seller_id)
      .eq('product_key', product_key);
  } else {
    // Upsert link
    const { error } = await supabase
      .from('product_packaging_link')
      .upsert({
        company_id: companyId,
        seller_id,
        product_key,
        packaging_id,
      }, { onConflict: 'seller_id,product_key' });
    if (error) throw error;
  }

  return { success: true };
}

// ================== TAX V2 ==================

async function getTaxConfig(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  if (!sellerId) throw new Error('seller_id is required');

  const companyId = await resolveCompanyId(supabase, sellerId);
  if (!companyId) return { tax: null };

  const { data } = await supabase
    .from('tax_configuration')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  return { tax: data };
}

async function updateTaxConfig(supabase: any, userId: string, body: any) {
  const { seller_id, das_icms_percent, pis_percent, cofins_percent, irpj_percent, csll_percent, difal_enabled, difal_percent, origin_state } = body;
  if (!seller_id) throw new Error('seller_id is required');

  const companyId = await resolveCompanyId(supabase, seller_id);
  if (!companyId) throw new Error('Company not found');

  const { error } = await supabase
    .from('tax_configuration')
    .upsert({
      company_id: companyId,
      das_icms_percent: das_icms_percent ?? 0,
      pis_percent: pis_percent ?? 0,
      cofins_percent: cofins_percent ?? 0,
      irpj_percent: irpj_percent ?? 0,
      csll_percent: csll_percent ?? 0,
      difal_enabled: difal_enabled ?? false,
      difal_percent: difal_percent ?? 6,
      origin_state: origin_state || null,
    }, { onConflict: 'company_id' });
  if (error) throw error;

  return { success: true };
}

// ================== CATALOG ==================

async function getCatalog(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const search = params.search || '';
  const page = parseInt(params.page || '1');
  const pageSize = parseInt(params.page_size || '50');
  const sortBy = params.sort_by || 'display_name';
  const sortDir = params.sort_dir || 'asc';
  const costFilter = params.cost_filter || 'all'; // all | with | without
  const packagingFilter = params.packaging_filter || 'all'; // all | with | without

  if (!sellerId) throw new Error('seller_id is required');

  // Resolve company for packaging cross-ref
  const companyId = await resolveCompanyId(supabase, sellerId);

  let itemsQuery = supabase
    .from('meli_order_items_cache')
    .select('product_key, item_id, variation_id, sku, title, title_short, thumbnail')
    .eq('seller_id', sellerId)
    .eq('user_id', userId);

  if (search) {
    itemsQuery = itemsQuery.or(
      `title.ilike.%${search}%,title_short.ilike.%${search}%,sku.ilike.%${search}%,item_id.ilike.%${search}%,product_key.ilike.%${search}%`
    );
  }

  const items = await fetchAllRows(itemsQuery);

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
        thumbnail: item.thumbnail || null,
      });
    }
  }

  // Fetch costs
  const costs = await fetchAllRows(
    supabase.from('product_cost_catalog').select('*').eq('seller_id', sellerId).eq('user_id', userId)
  );
  const costMap = new Map<string, any>(costs.map((c: any) => [c.product_key, c]));

  // Fetch packaging links
  let packagingLinkMap = new Map<string, string>();
  if (companyId) {
    const links = await fetchAllRows(
      supabase.from('product_packaging_link')
        .select('product_key, packaging_id')
        .eq('company_id', companyId)
        .eq('seller_id', sellerId)
    );
    for (const l of links) {
      packagingLinkMap.set(l.product_key, l.packaging_id);
    }
  }

  let products = Array.from(productMap.values()).map(p => {
    const costEntry = costMap.get(p.product_key);
    const hasPackaging = packagingLinkMap.has(p.product_key);
    return {
      ...p,
      cost_value: costEntry?.cost_value || 0,
      cost_source: costEntry?.cost_source || 'manual',
      has_cost: !!costEntry && Number(costEntry.cost_value) > 0,
      has_packaging: hasPackaging,
      updated_at: costEntry?.updated_at || null,
    };
  });

  // Apply filters
  if (costFilter === 'with') products = products.filter(p => p.has_cost);
  else if (costFilter === 'without') products = products.filter(p => !p.has_cost);

  if (packagingFilter === 'with') products = products.filter(p => p.has_packaging);
  else if (packagingFilter === 'without') products = products.filter(p => !p.has_packaging);

  // Server-side sorting
  const dir = sortDir === 'desc' ? -1 : 1;
  products.sort((a, b) => {
    switch (sortBy) {
      case 'sku':
        return dir * (a.sku || '').localeCompare(b.sku || '');
      case 'cost_value':
        return dir * ((a.cost_value || 0) - (b.cost_value || 0));
      case 'has_cost':
        return dir * (Number(a.has_cost) - Number(b.has_cost));
      case 'display_name':
      default:
        return dir * (a.display_name || '').localeCompare(b.display_name || '');
    }
  });

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
    missing_count: Array.from(productMap.values()).filter(p => {
      const costEntry = costMap.get(p.product_key);
      return !costEntry || Number(costEntry.cost_value) <= 0;
    }).length,
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
  const status = params.status;
  const profitType = params.profit_type;
  const ecommerceCost = params.ecommerce_cost;
  const shippingFilter = params.shipping_filter;
  const billingFilter = params.billing_filter;
  const orderStatus = params.order_status;
  const search = params.search || '';
  const page = parseInt(params.page || '1');
  const pageSize = parseInt(params.page_size || '50');
  const sortBy = params.sort_by || 'created_at_meli';
  const sortDir = params.sort_dir || 'desc';

  if (!sellerId) throw new Error('seller_id is required');

  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - periodDays);
  const dateFromStr = dateFrom.toISOString();

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
      id: o.order_id, order_id: o.order_id, shipment_id: o.shipment_id,
      revenue_total: o.total_amount || 0, cost_total: 0, cost_fees: 0, cost_shipping: 0, cost_other: 0,
      profit_total: 0, margin_percent: 0, missing_cost_items_count: 0,
      status: 'cancelled', order_status: o.order_status || 'cancelled',
      buyer_nickname: o.buyer_nickname, buyer_name: o.buyer_name, created_at_meli: o.created_at_meli,
      shipping_cost_seller: 0, commission_cost: 0, receita_envio: 0, shipping_balance: 0,
      revenue_net: 0, cost_net: 0, profit_net: 0, margin_net: 0, missing_fields: [], fee_ml_source: 'cancelled',
    }));

    if (search) {
      const searchLower = search.toLowerCase();
      results = results.filter((r: any) =>
        r.order_id?.includes(search) || r.shipment_id?.includes(search) ||
        r.buyer_nickname?.toLowerCase().includes(searchLower) || r.buyer_name?.toLowerCase().includes(searchLower)
      );
    }

    const total = results.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    return { orders: results.slice(offset, offset + pageSize), total, page, page_size: pageSize, total_pages: totalPages };
  }

  let query = supabase
    .from('order_cost_breakdown_cache')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('user_id', userId)
    .gte('created_at_meli', dateFromStr)
    .order('created_at_meli', { ascending: false });

  if (status) query = query.eq('status', status);

  if (orderStatus === 'pending_cost') {
    query = query.in('fee_ml_source', ['pending', 'no_charges']);
  } else if (orderStatus === 'all') {
    // no filter
  } else if (ecommerceCost === 'without') {
    // no filter
  } else if (!billingFilter || billingFilter === 'all') {
    query = query.in('fee_ml_source', ['billing', 'manual']);
  } else if (billingFilter === 'billing') {
    query = query.eq('fee_ml_source', 'billing');
  } else if (billingFilter === 'manual') {
    query = query.eq('fee_ml_source', 'manual');
  }

  if (ecommerceCost === 'with') query = query.gt('cost_other', 0);
  else if (ecommerceCost === 'without') query = query.or('cost_other.is.null,cost_other.eq.0');
  else if (ecommerceCost === 'zero_total') query = query.lte('cost_total', 0);

  if (shippingFilter === 'high') query = query.gte('shipping_cost_seller', 100);
  else if (shippingFilter === 'very_high') query = query.gte('shipping_cost_seller', 300);
  else if (shippingFilter === 'missing') query = query.or('shipping_cost_seller.is.null,shipping_cost_seller.eq.0');

  if (search) query = query.or(`order_id.ilike.%${search}%,shipment_id.ilike.%${search}%,buyer_nickname.ilike.%${search}%`);

  const results_raw = await fetchAllRows(query);

  const orderIds = results_raw.map((r: any) => r.order_id).filter(Boolean);
  let orderStatusMap = new Map<string, string>();
  if (orderIds.length > 0) {
    const statusRows = await fetchWithBatchedIn(
      supabase, 'meli_orders_cache', 'order_id, order_status',
      'order_id', orderIds, [{ column: 'seller_id', value: sellerId }]
    );
    orderStatusMap = new Map(statusRows.map((r: any) => [r.order_id, r.order_status]));
  }

  let results = results_raw.map((r: any) => ({ ...r, order_status: orderStatusMap.get(r.order_id) || 'paid' }));

  if (profitType === 'lucro') results = results.filter((r: any) => r.profit_total >= 0);
  else if (profitType === 'prejuizo') results = results.filter((r: any) => r.profit_total < 0);

  if (shippingFilter === 'missing') {
    results = results.filter((r: any) =>
      r.missing_fields?.includes('sem_frete_cobrado') || (r.shipping_cost_seller === 0 || r.shipping_cost_seller === null)
    );
  }

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

  if (params.ids_only === 'true') {
    return { order_ids: results.map((r: any) => r.order_id), total };
  }

  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  return { orders: results.slice(offset, offset + pageSize), total, page, page_size: pageSize, total_pages: totalPages };
}

async function getOrderDetail(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const orderId = params.order_id;
  if (!sellerId || !orderId) throw new Error('seller_id and order_id are required');

  const { data: order } = await supabase.from('meli_orders_cache').select('*').eq('seller_id', sellerId).eq('order_id', orderId).single();
  const { data: items } = await supabase.from('meli_order_items_cache').select('*').eq('seller_id', sellerId).eq('order_id', orderId);
  const productKeys = (items || []).map((i: any) => i.product_key || `${i.item_id}:${i.variation_id || ''}`);
  const { data: costs } = await supabase.from('product_cost_catalog').select('*').eq('seller_id', sellerId).in('product_key', productKeys);
  const costMap = new Map<string, number>((costs || []).map((c: any) => [c.product_key, Number(c.cost_value) || 0]));
  const { data: breakdown } = await supabase.from('order_cost_breakdown_cache').select('*').eq('seller_id', sellerId).eq('order_id', orderId).maybeSingle();

  const itemDetails = (items || []).map((item: any) => {
    const key = item.product_key || `${item.item_id}:${item.variation_id || ''}`;
    const unitCost = costMap.get(key) || 0;
    return { ...item, product_key: key, cost_unit: unitCost, cost_total: unitCost * item.quantity, has_cost: unitCost > 0 };
  });

  return { order, items: itemDetails, breakdown, missing_costs: itemDetails.filter((i: any) => !i.has_cost).length };
}

async function updateOrderExtra(supabase: any, userId: string, body: any) {
  const { seller_id, order_id, cost_other, notes } = body;
  if (!seller_id || !order_id) throw new Error('seller_id and order_id are required');

  const { data: existing } = await supabase.from('order_cost_breakdown_cache').select('*').eq('seller_id', seller_id).eq('order_id', order_id).maybeSingle();
  if (existing) {
    const newCostOther = cost_other ?? existing.cost_other;
    const newNotes = notes ?? existing.notes;
    const newCostTotal = existing.cost_items_total + existing.cost_packaging + existing.cost_fees + existing.cost_shipping + newCostOther;
    const newProfit = existing.revenue_total - newCostTotal;
    const newMargin = existing.revenue_total > 0 ? (newProfit / existing.revenue_total) * 100 : 0;

    await supabase.from('order_cost_breakdown_cache').update({
      cost_other: newCostOther, cost_total: newCostTotal, profit_total: newProfit, margin_percent: newMargin,
      notes: newNotes, calculated_at: new Date().toISOString(),
    }).eq('id', existing.id);
  }

  return { success: true };
}

// ================== CALCULATE V2 ==================

async function getPackagingForOrder(supabase: any, sellerId: string, companyId: string, productKeys: string[]): Promise<{ total: number; detail: any[] }> {
  if (!companyId || productKeys.length === 0) return { total: 0, detail: [] };

  const links = await fetchWithBatchedIn(
    supabase, 'product_packaging_link', 'product_key, packaging_id',
    'product_key', productKeys,
    [{ column: 'seller_id', value: sellerId }, { column: 'company_id', value: companyId }]
  );

  if (links.length === 0) return { total: 0, detail: [] };

  const packagingIds = [...new Set(links.map((l: any) => l.packaging_id))];
  const { data: packagingRows } = await supabase
    .from('packaging_types')
    .select('id, name, cost_value, is_active')
    .in('id', packagingIds)
    .eq('is_active', true);

  const pkgMap = new Map((packagingRows || []).map((p: any) => [p.id, p]));

  let total = 0;
  const detail: any[] = [];
  const seen = new Set<string>();

  for (const link of links) {
    if (seen.has(link.product_key)) continue;
    seen.add(link.product_key);
    const pkg = pkgMap.get(link.packaging_id);
    if (pkg) {
      total += Number(pkg.cost_value) || 0;
      detail.push({ product_key: link.product_key, packaging_name: pkg.name, cost: Number(pkg.cost_value) || 0 });
    }
  }

  return { total, detail };
}

async function getTaxForCompany(supabase: any, companyId: string): Promise<any> {
  if (!companyId) return null;
  const { data } = await supabase.from('tax_configuration').select('*').eq('company_id', companyId).maybeSingle();
  return data;
}

async function calculateCosts(supabase: any, userId: string, sellerId: string, periodDays: number) {
  console.log(`[cost-engine] Starting V2 calculation for seller ${sellerId}, period ${periodDays} days`);

  try {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - periodDays);
    const dateFromStr = dateFrom.toISOString();

    const companyId = await resolveCompanyId(supabase, sellerId);
    const taxConfig = companyId ? await getTaxForCompany(supabase, companyId) : null;

    let orders: any[];
    try {
      orders = await fetchAllRows(
        supabase.from('meli_orders_cache')
          .select('order_id, shipment_id, total_amount, buyer_nickname, buyer_name, created_at_meli, shipping_state')
          .eq('seller_id', sellerId)
          .eq('user_id', userId)
          .eq('order_status', 'paid')
          .gte('created_at_meli', dateFromStr)
      );
    } catch (fetchErr: any) {
      console.error('[cost-engine] CRITICAL: Failed to fetch orders, aborting to prevent zero-overwrite:', fetchErr?.message);
      return;
    }

    if (!orders || orders.length === 0) {
      console.log('[cost-engine] No orders found, skipping calculation');
      return;
    }

    console.log(`[cost-engine] Found ${orders.length} orders to process`);

    const orderIds = orders.map((o: any) => o.order_id);
    const allItems = await fetchWithBatchedIn(
      supabase, 'meli_order_items_cache',
      'order_id, product_key, item_id, variation_id, quantity, unit_price',
      'order_id', orderIds,
      [{ column: 'seller_id', value: sellerId }]
    );

    const costs = await fetchAllRows(
      supabase.from('product_cost_catalog').select('product_key, cost_value').eq('seller_id', sellerId)
    );
    const costMap = new Map<string, number>(costs.map((c: any) => [c.product_key, Number(c.cost_value) || 0]));

    const financials = await fetchWithBatchedIn(
      supabase, 'meli_order_financials_cache',
      'order_id, revenue_products, revenue_shipping, cost_sale_fee, cost_shipping_fee, cost_installment_fee, cost_cancellations',
      'order_id', orderIds,
      [{ column: 'seller_id', value: sellerId }]
    );
    const financialsMap = new Map<string, any>(financials.map((f: any) => [f.order_id, f]));

    // Group items by order
    const itemsByOrder = new Map<string, any[]>();
    for (const item of allItems) {
      const key = item.product_key || `${item.item_id}:${item.variation_id || ''}`;
      const itemWithKey = { ...item, product_key: key };
      if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
      itemsByOrder.get(item.order_id)!.push(itemWithKey);
    }

    // Preload all packaging links for this seller (BULK - avoids N+1 queries)
    const allProductKeys = [...new Set(allItems.map((i: any) => i.product_key || `${i.item_id}:${i.variation_id || ''}`))];

    // Bulk preload packaging: 2 queries total instead of N queries
    let packagingLinksByProduct = new Map<string, string>(); // product_key -> packaging_id
    let packagingTypesMap = new Map<string, any>(); // packaging_id -> { name, cost_value }
    if (companyId && allProductKeys.length > 0) {
      const allLinks = await fetchWithBatchedIn(
        supabase, 'product_packaging_link', 'product_key, packaging_id',
        'product_key', allProductKeys,
        [{ column: 'seller_id', value: sellerId }, { column: 'company_id', value: companyId }]
      );
      const seenKeys = new Set<string>();
      for (const link of allLinks) {
        if (!seenKeys.has(link.product_key)) {
          seenKeys.add(link.product_key);
          packagingLinksByProduct.set(link.product_key, link.packaging_id);
        }
      }
      const uniquePkgIds = [...new Set(allLinks.map((l: any) => l.packaging_id))];
      if (uniquePkgIds.length > 0) {
        const pkgRows = await fetchWithBatchedIn(
          supabase, 'packaging_types', 'id, name, cost_value, is_active',
          'id', uniquePkgIds
        );
        for (const p of pkgRows) {
          if (p.is_active) packagingTypesMap.set(p.id, p);
        }
      }
      console.log(`[cost-engine] Preloaded ${allLinks.length} packaging links, ${packagingTypesMap.size} active packaging types`);
    }

    // Helper: get packaging from preloaded maps (0 queries)
    function getPackagingFromCache(productKeys: string[]): { total: number; detail: any[] } {
      let total = 0;
      const detail: any[] = [];
      for (const pk of productKeys) {
        const pkgId = packagingLinksByProduct.get(pk);
        if (!pkgId) continue;
        const pkg = packagingTypesMap.get(pkgId);
        if (pkg) {
          total += Number(pkg.cost_value) || 0;
          detail.push({ product_key: pk, packaging_name: pkg.name, cost: Number(pkg.cost_value) || 0 });
        }
      }
      return { total, detail };
    }

    // Preload existing breakdowns to use as fallback when financials cache is empty
    const existingBreakdowns = await fetchWithBatchedIn(
      supabase, 'order_cost_breakdown_cache',
      'order_id, fee_ml, shipping_cost_seller, installments_cost, commission_cost, cost_shipping, receita_envio',
      'order_id', orderIds,
      [{ column: 'seller_id', value: sellerId }]
    );
    const existingBreakdownMap = new Map<string, any>(existingBreakdowns.map((b: any) => [b.order_id, b]));

    const breakdowns: any[] = [];
    const calcLogs: any[] = [];

    for (const order of orders) {
      const items = itemsByOrder.get(order.order_id) || [];
      const billing = financialsMap.get(order.order_id);
      const existing = existingBreakdownMap.get(order.order_id);
      const orderProductKeys = items.map((i: any) => i.product_key);

      let costItemsTotal = 0;
      let missingCount = 0;
      for (const item of items) {
        const unitCost = costMap.get(item.product_key) || 0;
        costItemsTotal += unitCost * item.quantity;
        if (unitCost === 0) missingCount++;
      }

      const baseRevenue = Number(order.total_amount) || 0;

      // Packaging V2 (from preloaded cache - 0 queries)
      const packaging = companyId
        ? getPackagingFromCache(orderProductKeys)
        : { total: 0, detail: [] };

      // Billing data with fallback to existing breakdown (ml-sync-real-costs values)
      let commissionCost = 0, installmentsCost = 0, costShipping = 0, revenueShipping = 0;
      if (billing) {
        commissionCost = billing.cost_sale_fee || 0;
        installmentsCost = billing.cost_installment_fee || 0;
        costShipping = billing.cost_shipping_fee || 0;
        revenueShipping = billing.revenue_shipping || 0;
      } else if (existing) {
        // Fallback: use values previously synced by ml-sync-real-costs
        commissionCost = Number(existing.fee_ml) || Number(existing.commission_cost) || 0;
        installmentsCost = Number(existing.installments_cost) || 0;
        costShipping = Number(existing.shipping_cost_seller) || Number(existing.cost_shipping) || 0;
        revenueShipping = Number(existing.receita_envio) || 0;
        console.log(`[cost-engine] Fallback for order ${order.order_id}: commission=${commissionCost}, shipping=${costShipping}, installments=${installmentsCost}`);
      }

      // Tax V2
      let taxPercentTotal = 0;
      let taxValue = 0;
      let difalApplied = false;
      if (taxConfig) {
        taxPercentTotal = Number(taxConfig.das_icms_percent || 0) + Number(taxConfig.pis_percent || 0) +
          Number(taxConfig.cofins_percent || 0) + Number(taxConfig.irpj_percent || 0) + Number(taxConfig.csll_percent || 0);

        if (taxConfig.difal_enabled && taxConfig.origin_state) {
          const destState = order.shipping_state || '';
          if (destState && destState !== taxConfig.origin_state) {
            taxPercentTotal += Number(taxConfig.difal_percent || 0);
            difalApplied = true;
          }
        }

        taxValue = baseRevenue * (taxPercentTotal / 100);
      }

      const revenue = baseRevenue;
      const revenueNet = revenue - revenueShipping;
      const costNet = costItemsTotal + packaging.total + commissionCost + taxValue;
      const profitNet = revenueNet - costNet;
      const marginNet = revenueNet > 0 ? (profitNet / revenueNet) * 100 : 0;
      const shippingBalance = revenueShipping - costShipping;

      const missingFields: string[] = [];
      if (missingCount > 0) missingFields.push('sem_custo_produto');
      if (!billing) missingFields.push('sem_billing_real');
      if (costShipping === 0 && order.shipment_id) missingFields.push('sem_frete_cobrado');

      const costTotal = costItemsTotal + packaging.total + commissionCost + costShipping + taxValue;
      const profit = revenue - costTotal;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      breakdowns.push({
        user_id: userId, seller_id: sellerId, order_id: order.order_id, shipment_id: order.shipment_id,
        calculated_at: new Date().toISOString(), revenue_total: revenue,
        cost_items_total: costItemsTotal, cost_packaging: packaging.total, cost_fees: commissionCost,
        cost_shipping: costShipping, cost_other: 0, cost_total: costTotal,
        profit_total: profitNet, margin_percent: marginNet,
        missing_cost_items_count: missingCount, status: missingCount > 0 ? 'incompleto' : (billing ? 'ok' : 'pending'),
        commission_cost: commissionCost, installments_cost: installmentsCost,
        shipping_cost_seller: costShipping, receita_envio: revenueShipping,
        shipping_balance: shippingBalance, revenue_net: revenueNet, cost_net: costNet,
        profit_net: profitNet, margin_net: marginNet, missing_fields: missingFields,
        buyer_nickname: order.buyer_nickname || null, buyer_name: order.buyer_name || null,
        created_at_meli: order.created_at_meli || null,
        // Preserve fee_ml from ml-sync-real-costs
        fee_ml: existing?.fee_ml || commissionCost || null,
        // V2 fields
        cost_packaging_detail: packaging.detail.length > 0 ? packaging.detail : null,
        tax_percent_total: taxPercentTotal, tax_value: taxValue, difal_applied: difalApplied,
        last_recalculated_at: new Date().toISOString(),
      });

      // Log entry
      if (companyId) {
        calcLogs.push({
          company_id: companyId, seller_id: sellerId, order_id: order.order_id,
          receita: revenue, custo_produto: costItemsTotal, embalagem: packaging.total,
          imposto_percent_total: taxPercentTotal, imposto_valor: taxValue,
          difal_enabled: taxConfig?.difal_enabled || false, difal_applied: difalApplied,
          origin_state: taxConfig?.origin_state || null,
          destination_state: order.shipping_state || null,
          lucro_final: profitNet, margem_final: marginNet,
        });
      }
    }

    // Batch upsert breakdowns
    const BATCH_SIZE = 100;
    for (let i = 0; i < breakdowns.length; i += BATCH_SIZE) {
      const batch = breakdowns.slice(i, i + BATCH_SIZE);
      await supabase.from('order_cost_breakdown_cache').upsert(batch, { onConflict: 'seller_id,order_id' });
    }

    // Insert calculation logs
    for (let i = 0; i < calcLogs.length; i += BATCH_SIZE) {
      const batch = calcLogs.slice(i, i + BATCH_SIZE);
      await supabase.from('cost_calculation_logs').insert(batch);
    }

    console.log(`[cost-engine] V2 Calculation completed: ${breakdowns.length} orders, ${calcLogs.length} logs`);

    await updateProductAggregates(supabase, userId, sellerId, periodDays);
  } catch (error) {
    console.error('[cost-engine] Calculation error:', error);
  }
}

async function calculateSingleOrder(supabase: any, userId: string, sellerId: string, orderId: string) {
  console.log(`[cost-engine] Calculating single order ${orderId} (V2)`);

  const companyId = await resolveCompanyId(supabase, sellerId);
  const taxConfig = companyId ? await getTaxForCompany(supabase, companyId) : null;

  const { data: order, error: orderError } = await supabase
    .from('meli_orders_cache')
    .select('order_id, shipment_id, total_amount, buyer_nickname, buyer_name, created_at_meli, shipping_state')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId)
    .single();

  if (orderError || !order) {
    console.error(`[cost-engine] Failed to fetch order ${orderId}, aborting to prevent zero-overwrite:`, orderError?.message);
    return { success: false, error: 'order_fetch_failed', message: orderError?.message || 'Order not found' };
  }

  const { data: items } = await supabase
    .from('meli_order_items_cache')
    .select('product_key, item_id, variation_id, quantity, unit_price')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId);

  const productKeys = (items || []).map((i: any) => i.product_key || `${i.item_id}:${i.variation_id || ''}`);
  const { data: costs } = await supabase
    .from('product_cost_catalog')
    .select('product_key, cost_value')
    .eq('seller_id', sellerId)
    .in('product_key', productKeys);

  const costMap = new Map<string, number>((costs || []).map((c: any) => [c.product_key, Number(c.cost_value) || 0]));

  let costItemsTotal = 0, missingCount = 0;
  for (const item of items || []) {
    const key = item.product_key || `${item.item_id}:${item.variation_id || ''}`;
    const unitCost = costMap.get(key) || 0;
    costItemsTotal += unitCost * item.quantity;
    if (unitCost === 0) missingCount++;
  }

  const revenue = Number(order.total_amount) || 0;

  // Packaging V2
  const packaging = companyId
    ? await getPackagingForOrder(supabase, sellerId, companyId, productKeys)
    : { total: 0, detail: [] };

  // Get real billing if available
  const { data: billing } = await supabase
    .from('meli_order_financials_cache')
    .select('cost_sale_fee, cost_shipping_fee, cost_installment_fee, revenue_shipping')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId)
    .maybeSingle();

  // Get existing breakdown for fallback (preserve ml-sync-real-costs values)
  const { data: existingBreakdown } = await supabase
    .from('order_cost_breakdown_cache')
    .select('fee_ml, shipping_cost_seller, installments_cost, commission_cost, cost_shipping, receita_envio')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId)
    .maybeSingle();

  let commissionCost = 0, costShipping = 0, revenueShipping = 0, installmentsCost = 0;
  if (billing) {
    commissionCost = billing.cost_sale_fee || 0;
    costShipping = billing.cost_shipping_fee || 0;
    revenueShipping = billing.revenue_shipping || 0;
    installmentsCost = billing.cost_installment_fee || 0;
  } else if (existingBreakdown) {
    // Fallback: use values previously synced by ml-sync-real-costs
    commissionCost = Number(existingBreakdown.fee_ml) || Number(existingBreakdown.commission_cost) || 0;
    installmentsCost = Number(existingBreakdown.installments_cost) || 0;
    costShipping = Number(existingBreakdown.shipping_cost_seller) || Number(existingBreakdown.cost_shipping) || 0;
    revenueShipping = Number(existingBreakdown.receita_envio) || 0;
    console.log(`[cost-engine] Single order fallback for ${orderId}: commission=${commissionCost}, shipping=${costShipping}`);
  }

  // Tax V2
  let taxPercentTotal = 0, taxValue = 0, difalApplied = false;
  if (taxConfig) {
    taxPercentTotal = Number(taxConfig.das_icms_percent || 0) + Number(taxConfig.pis_percent || 0) +
      Number(taxConfig.cofins_percent || 0) + Number(taxConfig.irpj_percent || 0) + Number(taxConfig.csll_percent || 0);

    if (taxConfig.difal_enabled && taxConfig.origin_state) {
      const destState = order.shipping_state || '';
      if (destState && destState !== taxConfig.origin_state) {
        taxPercentTotal += Number(taxConfig.difal_percent || 0);
        difalApplied = true;
      }
    }
    taxValue = revenue * (taxPercentTotal / 100);
  }

  const revenueNet = revenue - revenueShipping;
  const costNet = costItemsTotal + packaging.total + commissionCost + taxValue;
  const profitNet = revenueNet - costNet;
  const marginNet = revenueNet > 0 ? (profitNet / revenueNet) * 100 : 0;
  const shippingBalance = revenueShipping - costShipping;
  const costTotal = costItemsTotal + packaging.total + commissionCost + costShipping + taxValue;

  const missingFields: string[] = [];
  if (missingCount > 0) missingFields.push('sem_custo_produto');
  if (!billing) missingFields.push('sem_billing_real');
  if (costShipping === 0 && order.shipment_id) missingFields.push('sem_frete_cobrado');

  await supabase.from('order_cost_breakdown_cache').upsert({
    user_id: userId, seller_id: sellerId, order_id: orderId, shipment_id: order.shipment_id,
    calculated_at: new Date().toISOString(), revenue_total: revenue,
    cost_items_total: costItemsTotal, cost_packaging: packaging.total, cost_fees: commissionCost,
    cost_shipping: costShipping, cost_other: 0, cost_total: costTotal,
    profit_total: profitNet, margin_percent: marginNet,
    missing_cost_items_count: missingCount, status: missingCount > 0 ? 'incompleto' : (billing ? 'ok' : 'pending'),
    commission_cost: commissionCost, installments_cost: installmentsCost,
    shipping_cost_seller: costShipping, receita_envio: revenueShipping,
    shipping_balance: shippingBalance, revenue_net: revenueNet, cost_net: costNet,
    profit_net: profitNet, margin_net: marginNet, missing_fields: missingFields,
    buyer_nickname: order.buyer_nickname || null, buyer_name: order.buyer_name || null,
    created_at_meli: order.created_at_meli || null,
    cost_packaging_detail: packaging.detail.length > 0 ? packaging.detail : null,
    tax_percent_total: taxPercentTotal, tax_value: taxValue, difal_applied: difalApplied,
    last_recalculated_at: new Date().toISOString(),
  }, { onConflict: 'seller_id,order_id' });

  // Log
  if (companyId) {
    await supabase.from('cost_calculation_logs').insert({
      company_id: companyId, seller_id: sellerId, order_id: orderId,
      receita: revenue, custo_produto: costItemsTotal, embalagem: packaging.total,
      imposto_percent_total: taxPercentTotal, imposto_valor: taxValue,
      difal_enabled: taxConfig?.difal_enabled || false, difal_applied: difalApplied,
      origin_state: taxConfig?.origin_state || null, destination_state: order.shipping_state || null,
      lucro_final: profitNet, margem_final: marginNet,
    });
  }

  return { success: true, profit: profitNet, margin: marginNet, missing_count: missingCount, tax_value: taxValue, packaging_cost: packaging.total };
}

// ================== PRODUCT AGGREGATES ==================

async function updateProductAggregates(supabase: any, userId: string, sellerId: string, periodDays: number) {
  console.log(`[cost-engine] Updating product aggregates for period ${periodDays} days`);

  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - periodDays);
  const periodKey = `${periodDays}d`;

  const breakdowns = await fetchAllRows(
    supabase.from('order_cost_breakdown_cache')
      .select('order_id, profit_total, revenue_total, cost_total')
      .eq('seller_id', sellerId)
      .gte('calculated_at', dateFrom.toISOString())
  );

  const orderIds = breakdowns.map((b: any) => b.order_id);
  const items = await fetchWithBatchedIn(
    supabase, 'meli_order_items_cache',
    'order_id, product_key, item_id, variation_id, quantity, unit_price, title_short, title',
    'order_id', orderIds,
    [{ column: 'seller_id', value: sellerId }]
  );

  const costs = await fetchAllRows(
    supabase.from('product_cost_catalog').select('product_key, cost_value').eq('seller_id', sellerId)
  );
  const costMap = new Map<string, number>(costs.map((c: any) => [c.product_key, Number(c.cost_value) || 0]));

  const productAgg = new Map<string, { revenue: number; cost: number; quantity: number; display_name: string }>();
  for (const item of items) {
    const key = item.product_key || `${item.item_id}:${item.variation_id || ''}`;
    const unitCost = costMap.get(key) || 0;
    const itemRevenue = item.quantity * Number(item.unit_price);
    const itemCost = item.quantity * unitCost;
    if (!productAgg.has(key)) productAgg.set(key, { revenue: 0, cost: 0, quantity: 0, display_name: item.title_short || item.title || item.item_id });
    const agg = productAgg.get(key)!;
    agg.revenue += itemRevenue;
    agg.cost += itemCost;
    agg.quantity += item.quantity;
  }

  const aggregates = Array.from(productAgg.entries()).map(([key, agg]) => ({
    user_id: userId, seller_id: sellerId, product_key: key, period_key: periodKey,
    period_start: dateFrom.toISOString().split('T')[0], period_end: new Date().toISOString().split('T')[0],
    revenue_total: agg.revenue, cost_total: agg.cost, profit_total: agg.revenue - agg.cost,
    quantity_total: agg.quantity, margin_percent: agg.revenue > 0 ? ((agg.revenue - agg.cost) / agg.revenue) * 100 : 0,
    updated_at: new Date().toISOString(),
  }));

  const BATCH_SIZE = 100;
  for (let i = 0; i < aggregates.length; i += BATCH_SIZE) {
    const batch = aggregates.slice(i, i + BATCH_SIZE);
    await supabase.from('product_profit_aggregate_cache').upsert(batch, { onConflict: 'seller_id,product_key,period_key' });
  }
}

// ================== SUMMARY ==================

async function getSummary(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const periodDays = parseInt(params.period_days || '30');
  if (!sellerId) throw new Error('seller_id is required');

  // Support date_from/date_to params for custom date ranges
  const dateFrom = params.date_from || (() => {
    const d = new Date();
    d.setDate(d.getDate() - periodDays);
    return d.toISOString();
  })();
  const dateTo = params.date_to || new Date().toISOString();

  // Use server-side aggregation RPCs for speed (single query instead of fetching all rows)
  const [costResult, cancelledResult] = await Promise.all([
    supabase.rpc('get_cost_summary', {
      p_seller_id: sellerId,
      p_user_id: userId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    }),
    supabase.rpc('get_cancelled_orders_summary', {
      p_seller_id: sellerId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    }),
  ]);

  if (costResult.error) throw costResult.error;
  if (cancelledResult.error) throw cancelledResult.error;

  const s = costResult.data || {};
  const c = cancelledResult.data || {};

  // ABC summary from cache
  const { data: abcData } = await supabase
    .from('abc_profit_cache')
    .select('class')
    .eq('seller_id', sellerId)
    .eq('period_key', `${periodDays}d`)
    .eq('metric', 'profit');
  const abcTotal = (abcData || []).length;
  const abcACount = (abcData || []).filter((r: any) => r.class === 'A').length;
  const abcBCount = (abcData || []).filter((r: any) => r.class === 'B').length;
  const abcCCount = (abcData || []).filter((r: any) => r.class === 'C').length;

  return {
    summary: {
      total_revenue: s.total_revenue || 0,
      total_cost: s.total_cost || 0,
      total_profit: s.total_profit || 0,
      total_tax: s.total_tax || 0,
      total_packaging: s.total_packaging || 0,
      total_cost_product: s.total_cost_product || 0,
      total_cost_shipping: s.total_cost_shipping || 0,
      total_cost_marketplace: s.total_cost_marketplace || 0,
      total_installments: s.total_installments || 0,
      total_cost_other: s.total_cost_other || 0,
      total_receita_produtos: s.total_receita_produtos || 0,
      total_receita_envio: s.total_receita_envio || 0,
      avg_margin: s.avg_margin || 0,
      order_count: s.order_count || 0,
      incomplete_count: s.incomplete_count || 0,
      incomplete_percent: s.incomplete_percent || 0,
      missing_cost_count: s.missing_cost_count || 0,
      cancelled_count: c.cancelled_count || 0,
      cancelled_vgv: c.cancelled_vgv || 0,
      abc_a_percent: abcTotal > 0 ? (abcACount / abcTotal) * 100 : 0,
      abc_b_percent: abcTotal > 0 ? (abcBCount / abcTotal) * 100 : 0,
      abc_c_percent: abcTotal > 0 ? (abcCCount / abcTotal) * 100 : 0,
    },
  };
}

// ================== ABC ==================

async function getAbcProfit(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const periodDays = parseInt(params.period_days || '30');
  const metric = params.metric || 'profit';
  if (!sellerId) throw new Error('seller_id is required');

  const data = await fetchAllRows(
    supabase.from('abc_profit_cache').select('*')
      .eq('seller_id', sellerId).eq('period_key', `${periodDays}d`).eq('metric', metric)
      .order('rank', { ascending: true })
  );

  const classA = data.filter((r: any) => r.class === 'A');
  const classB = data.filter((r: any) => r.class === 'B');
  const classC = data.filter((r: any) => r.class === 'C');

  return {
    data,
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

  const aggregates = await fetchAllRows(
    supabase.from('product_profit_aggregate_cache').select('*').eq('seller_id', sellerId).eq('period_key', periodKey)
  );

  if (aggregates.length === 0) return;

  await calculateAbcForMetric(supabase, userId, sellerId, periodKey, 'profit', aggregates);
  await calculateAbcForMetric(supabase, userId, sellerId, periodKey, 'revenue', aggregates);
}

async function calculateAbcForMetric(supabase: any, userId: string, sellerId: string, periodKey: string, metric: string, aggregates: any[]) {
  // Build display_name map from product_costs and order items
  const productKeys = aggregates.map((a: any) => a.product_key);
  const displayNameMap = new Map<string, string>();

  // Try product_costs first (user-defined names)
  const { data: costs } = await supabase
    .from('product_costs')
    .select('product_key, display_name')
    .eq('seller_id', sellerId)
    .in('product_key', productKeys.slice(0, 500));
  for (const c of (costs || [])) {
    if (c.display_name) displayNameMap.set(c.product_key, c.display_name);
  }

  // Fill gaps from order items cache
  const missingKeys = productKeys.filter(k => !displayNameMap.has(k));
  if (missingKeys.length > 0) {
    const { data: items } = await supabase
      .from('meli_order_items_cache')
      .select('product_key, title_short, title, item_id')
      .eq('seller_id', sellerId)
      .in('product_key', missingKeys.slice(0, 500))
      .limit(500);
    for (const item of (items || [])) {
      if (!displayNameMap.has(item.product_key)) {
        displayNameMap.set(item.product_key, item.title_short || item.title || item.item_id || item.product_key);
      }
    }
  }

  const sorted = [...aggregates].sort((a, b) => {
    const valueA = metric === 'profit' ? Number(a.profit_total) : Number(a.revenue_total);
    const valueB = metric === 'profit' ? Number(b.profit_total) : Number(b.revenue_total);
    return valueB - valueA;
  });

  const positive = sorted.filter(a => (metric === 'profit' ? Number(a.profit_total) : Number(a.revenue_total)) > 0);
  const total = positive.reduce((sum, a) => sum + (metric === 'profit' ? Number(a.profit_total) : Number(a.revenue_total)), 0);

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
      user_id: userId, seller_id: sellerId, period_key: periodKey, metric,
      product_key: a.product_key, display_name: displayNameMap.get(a.product_key) || a.product_key, value_total: value,
      percent, cumulative_percent: cumulativePercent, class: abcClass,
      rank: index + 1, updated_at: new Date().toISOString(),
    };
  });

  await supabase.from('abc_profit_cache').delete().eq('seller_id', sellerId).eq('period_key', periodKey).eq('metric', metric);

  const BATCH_SIZE = 100;
  for (let i = 0; i < abcResults.length; i += BATCH_SIZE) {
    await supabase.from('abc_profit_cache').insert(abcResults.slice(i, i + BATCH_SIZE));
  }
}

// ================== TRENDS WITH MARGIN ==================

async function getTrendsWithMargin(supabase: any, userId: string, params: Record<string, string>) {
  const sellerId = params.seller_id;
  const periodDays = parseInt(params.period_days || '30');
  if (!sellerId) throw new Error('seller_id is required');

  const { data: aggregates } = await supabase
    .from('product_profit_aggregate_cache')
    .select('product_key, profit_total, revenue_total, margin_percent, quantity_total')
    .eq('seller_id', sellerId).eq('period_key', `${periodDays}d`);

  const { data: abcData } = await supabase
    .from('abc_profit_cache')
    .select('product_key, class')
    .eq('seller_id', sellerId).eq('period_key', `${periodDays}d`).eq('metric', 'profit');

  const abcMap = new Map((abcData || []).map((a: any) => [a.product_key, a.class]));

  const results = (aggregates || []).map((a: any) => ({
    ...a, abc_class: abcMap.get(a.product_key) || 'N/A',
    alert: a.quantity_total >= 5 ? (a.margin_percent < 0 ? 'cresce_mas_prejuizo' : (a.margin_percent >= 20 ? 'cresce_margem_boa' : null)) : null,
  }));

  results.sort((a: any, b: any) => b.quantity_total - a.quantity_total);
  return { products: results.slice(0, 50) };
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

  let query = supabase.from('order_cost_breakdown_cache').select('*')
    .eq('seller_id', sellerId).eq('user_id', userId)
    .in('fee_ml_source', ['pending', 'no_charges'])
    .gte('created_at_meli', dateFrom.toISOString())
    .order('created_at_meli', { ascending: false });

  if (search) query = query.or(`order_id.ilike.%${search}%,shipment_id.ilike.%${search}%,buyer_nickname.ilike.%${search}%`);

  const { data: orders, error } = await query;
  if (error) throw error;

  const results = orders || [];
  const total = results.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;

  return {
    orders: results.slice(offset, offset + pageSize), total, page, page_size: pageSize, total_pages: totalPages,
    pending_total: results.filter((o: any) => o.fee_ml_source === 'pending').length,
    no_charges_total: results.filter((o: any) => o.fee_ml_source === 'no_charges').length,
  };
}

// ================== UPDATE MANUAL COST ==================

async function updateManualCost(supabase: any, userId: string, body: any) {
  const { seller_id, order_id, commission_cost, shipping_cost, notes } = body;
  if (!seller_id || !order_id) throw new Error('seller_id and order_id are required');

  const { data: existing } = await supabase.from('order_cost_breakdown_cache').select('*').eq('seller_id', seller_id).eq('order_id', order_id).maybeSingle();
  if (!existing) throw new Error('Order not found');

  const newCommission = commission_cost ?? existing.commission_cost ?? 0;
  const newShipping = shipping_cost ?? existing.shipping_cost_seller ?? 0;
  const costFees = newCommission + (existing.installments_cost || 0);
  const costTotal = (existing.cost_items_total || 0) + (existing.cost_packaging || 0) + costFees + newShipping + (existing.cost_other || 0) + (existing.tax_value || 0);
  const profitTotal = (existing.revenue_total || 0) - costTotal;
  const marginPercent = existing.revenue_total > 0 ? (profitTotal / existing.revenue_total) * 100 : 0;

  await supabase.from('order_cost_breakdown_cache').update({
    commission_cost: newCommission, shipping_cost_seller: newShipping,
    cost_fees: costFees, cost_shipping: newShipping, cost_total: costTotal,
    profit_total: profitTotal, margin_percent: marginPercent,
    fee_ml_source: 'manual', notes: notes || existing.notes,
    has_real_financial: true, calculated_at: new Date().toISOString(),
  }).eq('id', existing.id);

  return { success: true, profit_total: profitTotal, margin_percent: marginPercent };
}

// ================== REIMPORT ORDER ==================

async function reimportOrder(supabase: any, userId: string, body: any) {
  const { seller_id, order_id } = body;
  if (!seller_id || !order_id) throw new Error('seller_id and order_id are required');

  await supabase.from('order_cost_breakdown_cache').delete().eq('seller_id', seller_id).eq('order_id', order_id);
  await supabase.from('meli_order_financials_cache').delete().eq('seller_id', seller_id).eq('order_id', order_id);
  await supabase.from('meli_billing_details_cache').delete().eq('seller_id', seller_id).eq('order_id', order_id);

  try { await calculateSingleOrder(supabase, userId, seller_id, order_id); } catch (e) {
    console.error(`[cost-engine] Error recalculating after reimport:`, e);
  }

  return { success: true, message: `Pedido ${order_id} reimportado com sucesso` };
}

// ================== BULK REIMPORT JOB ==================

const CHUNK_SIZE = 10;
const CHUNK_DELAY_MS = 600;

async function startBulkReimportJob(supabase: any, userId: string, sellerId: string, orderIds: string[], jobType: string = 'reimport') {
  if (!sellerId || !orderIds.length) throw new Error('seller_id and order_ids are required');

  const { data: job, error: jobError } = await supabase.from('cost_bulk_jobs').insert({
    seller_id: sellerId, user_id: userId, job_type: jobType, status: 'running',
    order_ids: orderIds, total_orders: orderIds.length, chunk_size: CHUNK_SIZE,
  }).select().single();
  if (jobError) throw new Error(`Failed to create job: ${jobError.message}`);

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
  }

  await processChunkAndContinue(supabase, job.id);
  return { status: 'processing', job_id: job.id, total: orderIds.length, message: `Job iniciado. ${orderIds.length} pedidos serão processados.` };
}

async function getBulkJobStatus(supabase: any, userId: string, params: any) {
  const jobId = params.job_id;
  if (!jobId) throw new Error('job_id is required');
  const { data, error } = await supabase.from('cost_bulk_jobs').select('*').eq('id', jobId).eq('user_id', userId).single();
  if (error) throw new Error('Job not found');
  return data;
}

async function continueBulkReimportJob(supabase: any, jobId: string) {
  if (!jobId) throw new Error('job_id is required');
  const { data: job, error } = await supabase.from('cost_bulk_jobs').select('*').eq('id', jobId).single();
  if (error || !job) throw new Error('Job not found');
  if (job.status !== 'running') return { status: job.status, message: 'Job is not running' };
  await processChunkAndContinue(supabase, jobId);
  return { status: 'continuing', job_id: jobId };
}

async function processChunkAndContinue(supabase: any, jobId: string) {
  const { data: job } = await supabase.from('cost_bulk_jobs').select('*').eq('id', jobId).single();
  if (!job || job.status !== 'running') return;

  const orderIds = job.order_ids as string[];
  const offset = job.current_offset as number;
  const chunkSize = job.chunk_size as number;

  if (offset >= orderIds.length) {
    await supabase.from('cost_bulk_jobs').update({ status: 'done' }).eq('id', jobId);
    return;
  }

  const chunk = orderIds.slice(offset, offset + chunkSize);
  let successCount = job.success_count;
  let errorCount = job.error_count;
  let lastError = job.last_error;

  for (let i = 0; i < chunk.length; i++) {
    try {
      await calculateSingleOrder(supabase, job.user_id, job.seller_id, chunk[i]);
      successCount++;
    } catch (e) {
      errorCount++;
      lastError = `${chunk[i]}: ${e instanceof Error ? e.message : 'Unknown error'}`;
    }
    if (i < chunk.length - 1) await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
  }

  const newOffset = offset + chunk.length;
  await supabase.from('cost_bulk_jobs').update({
    current_offset: newOffset, processed_count: newOffset,
    success_count: successCount, error_count: errorCount, last_error: lastError,
    status: newOffset >= orderIds.length ? 'done' : 'running',
  }).eq('id', jobId);

  if (newOffset < orderIds.length) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    EdgeRuntime.waitUntil(
      fetch(`${supabaseUrl}/functions/v1/cost-engine/orders/bulk-reimport-continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceKey },
        body: JSON.stringify({ job_id: jobId }),
      }).catch(err => console.error(`[cost-engine] Self-invocation failed:`, err))
    );
  }
}

// ================== FETCH ERP COST ==================

async function fetchErpCost(supabase: any, userId: string, body: any) {
  const { seller_id, product_key, sku, item_id } = body;
  if (!seller_id) throw new Error('seller_id is required');
  if (!product_key) throw new Error('product_key is required');

  const { data: maData } = await supabase.from('ml_accounts').select('company_id').eq('ml_user_id', seller_id).limit(1).single();
  if (!maData?.company_id) throw new Error('Conta marketplace não encontrada para este seller');

  const { data: erpData } = await supabase.from('erp_integrations').select('provider, api_key, status').eq('company_id', maData.company_id).limit(1).single();
  if (!erpData) return { success: false, error: 'no_erp', message: 'É necessário configurar a API Key do ERP em Configurações > Empresas para atualizar custos.' };
  if (!erpData.api_key) return { success: false, error: 'no_api_key', message: 'É necessário configurar a API Key do ERP em Configurações > Empresas para atualizar custos.' };

  const searchTerms: string[] = [];
  const addTerm = (t: string | undefined | null) => { if (t && t.trim() && !searchTerms.includes(t.trim())) searchTerms.push(t.trim()); };
  addTerm(sku); addTerm(item_id); addTerm(product_key);
  if (sku) {
    const partial = sku.replace(/[^a-zA-Z0-9]/g, '');
    addTerm(partial);
    if (partial.length > 6) addTerm(partial.substring(0, Math.ceil(partial.length * 0.6)));
  }

  let costValue: number | null = null;
  let costSource = erpData.provider;

  if (erpData.provider === 'olist') {
    for (const term of searchTerms) {
      costValue = await fetchOlistCost(erpData.api_key, term);
      if (costValue !== null) break;
    }
  } else if (erpData.provider === 'bling') {
    costValue = await fetchBlingCost(erpData.api_key, searchTerms[0] || product_key);
  } else {
    return { success: false, error: 'unsupported_provider', message: `Provedor ERP "${erpData.provider}" não suportado.` };
  }

  if (costValue === null) {
    return { success: false, error: 'not_found', message: `Produto não encontrado no ERP com os termos: ${searchTerms.join(', ')}` };
  }

  await supabase.from('product_cost_catalog').upsert({
    user_id: userId, seller_id: seller_id, product_key, cost_value: costValue,
    cost_source: costSource, updated_at: new Date().toISOString(),
  }, { onConflict: 'seller_id,product_key' });

  return { success: true, cost_value: costValue, cost_source: costSource };
}

async function fetchOlistCost(apiKey: string, searchTerm: string): Promise<number | null> {
  try {
    const response = await fetch('https://api.tiny.com.br/api2/produtos.pesquisa.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: apiKey, pesquisa: searchTerm, formato: 'JSON' }).toString(),
    });
    const data = await response.json();
    if (data.retorno?.status !== 'OK' || !data.retorno?.produtos?.length) return null;
    const product = data.retorno.produtos[0]?.produto;
    if (!product) return null;
    const precoCusto = parseFloat(product.preco_custo);
    const precoCustoMedio = parseFloat(product.preco_custo_medio);
    const precoVenda = parseFloat(product.preco);
    return (precoCusto > 0 ? precoCusto : null) ?? (precoCustoMedio > 0 ? precoCustoMedio : null) ?? (precoVenda > 0 ? precoVenda : null) ?? null;
  } catch { return null; }
}

async function fetchBlingCost(apiKey: string, searchTerm: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(searchTerm)}&limite=1`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const product = data.data?.[0];
    if (!product) return null;
    const cost = parseFloat(product.precoCusto) || parseFloat(product.preco) || null;
    return cost && cost > 0 ? cost : null;
  } catch { return null; }
}
