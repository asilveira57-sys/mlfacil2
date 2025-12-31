import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

    const body = await req.json().catch(() => ({}));
    const { seller_id, months = 6 } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ml-sync-billing] Starting billing sync for seller ${seller_id}, last ${months} months`);

    // Get ML account
    const { data: account, error: accountError } = await supabase
      .from('ml_accounts')
      .select('access_token, refresh_token, token_expires_at, ml_user_id')
      .eq('ml_user_id', seller_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: 'ML account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({
        user_id: user.id,
        seller_id,
        job_type: 'billing',
        status: 'processing',
        total_records: 0,
        processed_records: 0,
      })
      .select('id')
      .single();

    if (jobError) {
      console.error('[ml-sync-billing] Failed to create job:', jobError);
      return new Response(JSON.stringify({ error: 'Failed to create job' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Start background processing
    EdgeRuntime.waitUntil(
      processBillingInBackground(supabase, user.id, seller_id, account.access_token, months, job.id)
    );

    return new Response(JSON.stringify({ job_id: job.id, status: 'processing' }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[ml-sync-billing] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processBillingInBackground(
  supabase: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  months: number,
  jobId: string
) {
  console.log(`[ml-sync-billing] Background processing started for job ${jobId}`);

  try {
    // Get billing periods
    const periodsUrl = `https://api.mercadolibre.com/billing/integration/monthly/periods?caller.id=${sellerId}&group=ML&limit=12`;
    const periodsResponse = await fetch(periodsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!periodsResponse.ok) {
      const errorText = await periodsResponse.text();
      console.error('[ml-sync-billing] Failed to fetch periods:', errorText);
      await updateJobStatus(supabase, jobId, 'error', 'Failed to fetch billing periods');
      return;
    }

    const periodsData = await periodsResponse.json();
    const periods = (periodsData.results || []).slice(0, months);

    console.log(`[ml-sync-billing] Found ${periods.length} billing periods`);

    if (periods.length === 0) {
      await updateJobStatus(supabase, jobId, 'done');
      return;
    }

    const allFinancials: any[] = [];
    let processedPeriods = 0;

    for (const period of periods) {
      const periodKey = period.period_id || period.key;
      console.log(`[ml-sync-billing] Processing period: ${periodKey}`);

      try {
        await fetchPeriodDetails(accessToken, sellerId, periodKey, allFinancials);
        processedPeriods++;

        await supabase
          .from('sync_jobs')
          .update({
            total_records: periods.length,
            processed_records: processedPeriods,
          })
          .eq('id', jobId);

      } catch (periodError) {
        console.error(`[ml-sync-billing] Error processing period ${periodKey}:`, periodError);
      }

      // Rate limiting
      await sleep(300);
    }

    console.log(`[ml-sync-billing] Total financials collected: ${allFinancials.length}`);

    // Group by order_id and aggregate
    const orderFinancials = aggregateByOrder(allFinancials, userId, sellerId);
    console.log(`[ml-sync-billing] Aggregated to ${orderFinancials.length} unique orders`);

    // Batch upsert
    const BATCH_SIZE = 100;
    for (let i = 0; i < orderFinancials.length; i += BATCH_SIZE) {
      const batch = orderFinancials.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('meli_order_financials_cache')
        .upsert(batch, { onConflict: 'seller_id,order_id' });

      if (error) {
        console.error('[ml-sync-billing] Upsert error:', error);
      }
    }

    await updateJobStatus(supabase, jobId, 'done');
    console.log(`[ml-sync-billing] Job ${jobId} completed successfully`);

  } catch (error) {
    console.error('[ml-sync-billing] Background processing error:', error);
    await updateJobStatus(supabase, jobId, 'error', String(error));
  }
}

async function fetchPeriodDetails(
  accessToken: string,
  sellerId: string,
  periodKey: string,
  allFinancials: any[]
) {
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const detailsUrl = `https://api.mercadolibre.com/billing/integration/periods/key/${periodKey}/group/ML/details?caller.id=${sellerId}&offset=${offset}&limit=${limit}`;
    
    const response = await fetch(detailsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ml-sync-billing] Failed to fetch details for ${periodKey}:`, errorText);
      break;
    }

    const data = await response.json();
    const results = data.results || [];

    for (const item of results) {
      // Extract order_id from sales_info or detail
      const orderId = extractOrderId(item);
      if (!orderId) continue;

      // Extract financial values
      const financial = extractFinancialValues(item, orderId, periodKey);
      allFinancials.push(financial);
    }

    hasMore = results.length === limit;
    offset += limit;

    // Rate limiting
    await sleep(200);
  }
}

function extractOrderId(item: any): string | null {
  // Try different locations where order_id might be
  if (item.sales_info?.length > 0) {
    return item.sales_info[0].order_id?.toString() || null;
  }
  if (item.order_id) {
    return item.order_id.toString();
  }
  if (item.detail?.order_id) {
    return item.detail.order_id.toString();
  }
  if (item.reference_id && item.reference_type === 'order') {
    return item.reference_id.toString();
  }
  return null;
}

function extractFinancialValues(item: any, orderId: string, periodKey: string): any {
  // Map charge types to our categories
  const chargeType = item.charge_info?.type || item.type || '';
  const amount = item.charge_info?.detail_amount || item.amount || 0;
  const positiveAmount = Math.abs(amount);

  // Determine category based on charge type
  const result: any = {
    order_id: orderId,
    billing_period_key: periodKey,
    revenue_products: 0,
    revenue_shipping: 0,
    cost_sale_fee: 0,
    cost_shipping_fee: 0,
    cost_installment_fee: 0,
    cost_cancellations: 0,
  };

  const lowerType = chargeType.toLowerCase();

  // Revenue types
  if (lowerType.includes('venta') || lowerType.includes('sale') || lowerType === 'items') {
    if (amount > 0) {
      result.revenue_products = positiveAmount;
    }
  } else if (lowerType.includes('envío') || lowerType.includes('shipping') || lowerType.includes('flete')) {
    if (amount > 0) {
      result.revenue_shipping = positiveAmount;
    } else {
      result.cost_shipping_fee = positiveAmount;
    }
  }
  // Cost types (negative amounts or specific fee types)
  else if (lowerType.includes('tarifa') || lowerType.includes('comisión') || lowerType.includes('fee')) {
    if (lowerType.includes('cuota') || lowerType.includes('installment') || lowerType.includes('financiamiento')) {
      result.cost_installment_fee = positiveAmount;
    } else if (lowerType.includes('envío') || lowerType.includes('shipping')) {
      result.cost_shipping_fee = positiveAmount;
    } else {
      result.cost_sale_fee = positiveAmount;
    }
  }
  else if (lowerType.includes('cancelación') || lowerType.includes('cancel') || lowerType.includes('reembolso')) {
    result.cost_cancellations = positiveAmount;
  }
  // Default: if negative, it's a cost
  else if (amount < 0) {
    result.cost_sale_fee = positiveAmount;
  }

  return result;
}

function aggregateByOrder(financials: any[], userId: string, sellerId: string): any[] {
  const orderMap = new Map<string, any>();

  for (const f of financials) {
    const existing = orderMap.get(f.order_id);

    if (existing) {
      existing.revenue_products += f.revenue_products || 0;
      existing.revenue_shipping += f.revenue_shipping || 0;
      existing.cost_sale_fee += f.cost_sale_fee || 0;
      existing.cost_shipping_fee += f.cost_shipping_fee || 0;
      existing.cost_installment_fee += f.cost_installment_fee || 0;
      existing.cost_cancellations += f.cost_cancellations || 0;
      // Keep most recent period key
      existing.billing_period_key = f.billing_period_key;
    } else {
      orderMap.set(f.order_id, {
        user_id: userId,
        seller_id: sellerId,
        order_id: f.order_id,
        billing_period_key: f.billing_period_key,
        revenue_products: f.revenue_products || 0,
        revenue_shipping: f.revenue_shipping || 0,
        cost_sale_fee: f.cost_sale_fee || 0,
        cost_shipping_fee: f.cost_shipping_fee || 0,
        cost_installment_fee: f.cost_installment_fee || 0,
        cost_cancellations: f.cost_cancellations || 0,
        synced_at: new Date().toISOString(),
      });
    }
  }

  return Array.from(orderMap.values());
}

async function updateJobStatus(supabase: any, jobId: string, status: string, errorMessage?: string) {
  await supabase
    .from('sync_jobs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      error_message: errorMessage || null,
    })
    .eq('id', jobId);
}
