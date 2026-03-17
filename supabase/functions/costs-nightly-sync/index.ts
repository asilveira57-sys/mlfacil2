// @ts-nocheck - Deno types not available in build context
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithBatchedIn } from "../_shared/fetch-all-rows.ts";
import { classifyBillingCharge } from "../_shared/ml-billing-classifier.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-job-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const JOB_SECRET_KEY = Deno.env.get('CRON_JOB_SECRET') || 'default-cron-secret';

const JOB_NAME = 'costs-nightly-sync';
const LOCK_TTL_MINUTES = 90;
const MAX_RUNTIME_MS = 55000;
const BILLING_BATCH_SIZE = 100;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Token refresh function
async function refreshMercadoLibreToken(supabase: any, sellerId: string, refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.error(`[costs-nightly] Token refresh failed for ${sellerId}`);
      return null;
    }

    const data = await response.json();
    
    await supabase
      .from('ml_accounts')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: new Date(Date.now() + (data.expires_in || 21600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('ml_user_id', sellerId);

    return data.access_token;
  } catch (error) {
    console.error(`[costs-nightly] Token refresh error for ${sellerId}:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Validate cron secret for automated calls, or allow manual with auth
  const jobKey = req.headers.get('x-job-key');
  const authHeader = req.headers.get('Authorization');
  
  const isAuthorized = jobKey === JOB_SECRET_KEY || authHeader?.startsWith('Bearer ');
  
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log(`[costs-nightly] Starting at ${new Date().toISOString()}`);

    // Check/create scheduler entry
    let { data: scheduler } = await supabase
      .from('sync_scheduler')
      .select('*')
      .eq('job_name', JOB_NAME)
      .maybeSingle();

    if (!scheduler) {
      // Create scheduler entry if it doesn't exist
      const { data: newScheduler } = await supabase
        .from('sync_scheduler')
        .insert({
          job_name: JOB_NAME,
          status: 'idle',
          enabled: true,
          interval_hours: 24,
          next_run_at: new Date().toISOString(),
        })
        .select()
        .single();
      scheduler = newScheduler;
    }

    // Check if locked
    if (scheduler?.status === 'running' && scheduler.lock_expires_at) {
      const lockExpires = new Date(scheduler.lock_expires_at);
      if (lockExpires > new Date()) {
        console.log('[costs-nightly] Job already running, skipping');
        return new Response(JSON.stringify({ 
          status: 'skipped', 
          reason: 'Job already running',
          lock_expires_at: scheduler.lock_expires_at 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Acquire lock
    const lockExpiresAt = new Date(Date.now() + LOCK_TTL_MINUTES * 60 * 1000);
    await supabase
      .from('sync_scheduler')
      .update({
        status: 'running',
        lock_expires_at: lockExpiresAt.toISOString(),
        locked_by: 'costs-nightly-job',
        error_message: null,
      })
      .eq('job_name', JOB_NAME);

    // Get all active ML accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('ml_accounts')
      .select('id, user_id, ml_user_id, access_token, refresh_token, token_expires_at, nickname')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    console.log(`[costs-nightly] Found ${accounts?.length || 0} active accounts`);

    const stats = {
      accounts_processed: 0,
      accounts_failed: 0,
      billing_synced: 0,
      backfill_created: 0,
      costs_processed: 0,
      started_at: new Date().toISOString(),
      finished_at: null as string | null,
      duration_ms: 0,
    };

    // Process each account
    for (const account of accounts || []) {
      if (Date.now() - startTime >= MAX_RUNTIME_MS) {
        console.log('[costs-nightly] Runtime limit reached, will continue next run');
        break;
      }

      const sellerId = account.ml_user_id;
      const userId = account.user_id;
      
      try {
        console.log(`[costs-nightly] Processing account ${account.nickname || sellerId}`);

        // Step 1: Ensure valid token
        let accessToken = account.access_token;
        const tokenExpires = account.token_expires_at ? new Date(account.token_expires_at) : null;
        
        if (!tokenExpires || tokenExpires < new Date()) {
          console.log(`[costs-nightly] Token expired for ${sellerId}, refreshing...`);
          accessToken = await refreshMercadoLibreToken(supabase, sellerId, account.refresh_token);
          if (!accessToken) {
            console.error(`[costs-nightly] Token refresh failed for ${sellerId}, skipping`);
            stats.accounts_failed++;
            continue;
          }
        }

        // Step 2: Check billing sync state and resume if needed
        const { data: billingState } = await supabase
          .from('meli_billing_details_sync_state')
          .select('*')
          .eq('seller_id', sellerId)
          .maybeSingle();

        // ALWAYS re-execute billing sync: when done, fetch recent periods; when paused/error, resume
        const shouldSyncBilling = !billingState || billingState.status === 'paused' || billingState.status === 'error' || billingState.status === 'done';
        if (shouldSyncBilling) {
          const syncScope = billingState?.status === 'done' ? 'recent' : (billingState?.scope || 'recent');
          console.log(`[costs-nightly] Triggering billing sync for ${sellerId} (state: ${billingState?.status || 'none'}, scope: ${syncScope})`);
          
          // Call billing sync with service role (no user auth needed)
          await processBillingSync(supabase, userId, sellerId, accessToken, syncScope);
          stats.billing_synced++;
        }

        // Step 3: Always run backfill to check for recent orders without breakdown
        // This is necessary because count comparisons can be misleading (orders may change status)
        console.log(`[costs-nightly] Running backfill check for ${sellerId}`);
        const backfillResult = await processBackfill(supabase, userId, sellerId);
        if (backfillResult && backfillResult > 0) {
          stats.backfill_created++;
        }

        // Step 4: Check real costs state and resume if needed
        const { data: realCostsState } = await supabase
          .from('meli_real_costs_sync_state')
          .select('*')
          .eq('seller_id', sellerId)
          .maybeSingle();

        // Check for pending billing orders
        const { count: pendingBilling } = await supabase
          .from('order_cost_breakdown_cache')
          .select('*', { count: 'exact', head: true })
          .eq('seller_id', sellerId)
          .eq('fee_ml_source', 'pending');

        // Check if stuck (running but no heartbeat for > 5 minutes)
        const isStuck = realCostsState?.status === 'running' && 
          realCostsState.last_heartbeat_at && 
          (Date.now() - new Date(realCostsState.last_heartbeat_at).getTime() > 5 * 60 * 1000);

        if (realCostsState?.status === 'paused' || realCostsState?.status === 'error' || isStuck) {
          console.log(`[costs-nightly] Resuming ${isStuck ? 'stuck' : realCostsState?.status} real costs sync for ${sellerId}`);
          await processRealCosts(supabase, userId, sellerId, accessToken, 'continue');
          stats.costs_processed++;
        } else if ((pendingBilling || 0) > 0 && (!realCostsState || realCostsState.status === 'idle' || realCostsState.status === 'done')) {
          console.log(`[costs-nightly] Found ${pendingBilling} pending billing orders for ${sellerId}`);
          await processRealCosts(supabase, userId, sellerId, accessToken, 'reprocess');
          stats.costs_processed++;
        } else if ((pendingBilling || 0) > 0) {
          // Even if status is running, still process pending to make progress
          console.log(`[costs-nightly] Processing ${pendingBilling} pending billing orders for ${sellerId} (status: ${realCostsState?.status})`);
          await processRealCosts(supabase, userId, sellerId, accessToken, 'reprocess');
          stats.costs_processed++;
        }

        stats.accounts_processed++;

        // Small delay between accounts
        await sleep(1000);

      } catch (accountError) {
        console.error(`[costs-nightly] Error processing account ${sellerId}:`, accountError);
        stats.accounts_failed++;
      }
    }

    // Update scheduler with completion
    const duration = Date.now() - startTime;
    stats.finished_at = new Date().toISOString();
    stats.duration_ms = duration;

    // Calculate next run (2:30 AM BRT = 5:30 UTC next day)
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(5, 30, 0, 0);
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    await supabase
      .from('sync_scheduler')
      .update({
        status: 'idle',
        last_run_at: new Date().toISOString(),
        next_run_at: nextRun.toISOString(),
        lock_expires_at: null,
        locked_by: null,
        stats: stats,
        error_message: stats.accounts_failed > 0 ? `${stats.accounts_failed} accounts failed` : null,
      })
      .eq('job_name', JOB_NAME);

    console.log(`[costs-nightly] Completed in ${duration}ms:`, stats);

    return new Response(JSON.stringify({
      success: true,
      stats,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[costs-nightly] Fatal error:', error);

    await supabase
      .from('sync_scheduler')
      .update({
        status: 'error',
        lock_expires_at: null,
        locked_by: null,
        error_message: String(error),
      })
      .eq('job_name', JOB_NAME);

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Process billing sync directly (without HTTP call)
async function processBillingSync(supabase: any, userId: string, sellerId: string, accessToken: string, scope: string) {
  const startTime = Date.now();
  const MAX_BILLING_RUNTIME_MS = 20000;
  
  try {
    // Update state to running
    await supabase.from('meli_billing_details_sync_state').upsert({
      user_id: userId,
      seller_id: sellerId,
      status: 'running',
      scope: scope,
      last_heartbeat_at: new Date().toISOString(),
    }, { onConflict: 'seller_id' });

    // Fetch periods
    const periodsUrl = `https://api.mercadolibre.com/billing/integration/monthly/periods?group=ML&document_type=BILL&limit=12&offset=0`;
    const periodsRes = await fetch(periodsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!periodsRes.ok) {
      if (periodsRes.status === 429) {
        await supabase.from('meli_billing_details_sync_state').update({
          status: 'paused',
          last_error: 'Rate limited - will retry',
        }).eq('seller_id', sellerId);
        return;
      }
      throw new Error(`Billing API error: ${periodsRes.status}`);
    }

    const periodsData = await periodsRes.json();
    const periods = periodsData.results || [];

    let totalInserted = 0;

    for (const period of periods) {
      if (Date.now() - startTime >= MAX_BILLING_RUNTIME_MS) {
        await supabase.from('meli_billing_details_sync_state').update({
          status: 'paused',
          last_error: null,
        }).eq('seller_id', sellerId);
        break;
      }

      const periodKey = period.key;
      let offset = 0;
      const PAGE_LIMIT = 1000;

      // Paginated loop — fetch ALL billing details for this period
      while (true) {
        if (Date.now() - startTime >= MAX_BILLING_RUNTIME_MS) {
          await supabase.from('meli_billing_details_sync_state').update({
            status: 'paused',
            last_error: null,
          }).eq('seller_id', sellerId);
          break;
        }

        const detailsUrl = `https://api.mercadolibre.com/billing/integration/periods/key/${periodKey}/group/ML/details?document_type=BILL&limit=${PAGE_LIMIT}&offset=${offset}`;
        
        await sleep(12000); // Rate limit: 5 req/min
        
        const detailsRes = await fetch(detailsUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!detailsRes.ok) break;

        const detailsData = await detailsRes.json();
        const results = detailsData.results || [];

        if (results.length === 0) break;

        const records = results.map((item: any) => {
          const chargeInfo = item.charge_info || {};
          const salesInfo = (item.sales_info || [])[0] || {};
          const shippingInfo = item.shipping_info || {};

          return {
            seller_id: sellerId,
            period_key: periodKey,
            detail_id: String(chargeInfo.detail_id || `${periodKey}-${Math.random()}`),
            order_id: salesInfo.order_id || null,
            shipment_id: shippingInfo.shipping_id || null,
            charge_type: chargeInfo.transaction_detail || chargeInfo.concept_type || 'unknown',
            charge_description: chargeInfo.charge_bonified_id ? `Bonified: ${chargeInfo.charge_bonified_id}` : null,
            gross_amount: chargeInfo.detail_amount || 0,
            net_amount: chargeInfo.detail_amount || 0,
            currency_id: chargeInfo.currency_id || 'BRL',
            created_at_meli: item.created_date || null,
            fetched_at: new Date().toISOString(),
            raw_data: item,
          };
        });

        if (records.length > 0) {
          await supabase
            .from('meli_billing_details_cache')
            .upsert(records, { onConflict: 'seller_id,period_key,detail_id' });
          totalInserted += records.length;
        }

        console.log(`[costs-nightly] Period ${periodKey}: fetched page at offset=${offset}, got ${results.length} records`);

        // If we got fewer than PAGE_LIMIT, this is the last page
        if (results.length < PAGE_LIMIT) break;
        offset += results.length;
      }
    }

    await supabase.from('meli_billing_details_sync_state').update({
      status: 'done',
      finished_at: new Date().toISOString(),
      last_error: null,
    }).eq('seller_id', sellerId);

    console.log(`[costs-nightly] Billing sync for ${sellerId}: ${totalInserted} records`);
  } catch (error) {
    console.error(`[costs-nightly] Billing sync error for ${sellerId}:`, error);
    await supabase.from('meli_billing_details_sync_state').update({
      status: 'error',
      last_error: String(error),
    }).eq('seller_id', sellerId);
  }
}

// Process backfill directly - returns count of backfilled orders
async function processBackfill(supabase: any, userId: string, sellerId: string): Promise<number> {
  const MAX_BACKFILL = 200;
  
  try {
    // Get orders without breakdown
    const { data: ordersWithoutBreakdown } = await supabase
      .from('meli_orders_cache')
      .select('order_id, shipment_id, total_amount, created_at_meli')
      .eq('seller_id', sellerId)
      .eq('order_status', 'paid')
      .order('created_at_meli', { ascending: false })
      .limit(MAX_BACKFILL);

    if (!ordersWithoutBreakdown?.length) {
      console.log(`[costs-nightly] No orders to backfill for ${sellerId}`);
      return 0;
    }

    // Check which already have breakdown
    const orderIds = ordersWithoutBreakdown.map((o: any) => o.order_id);
    const existing = await fetchWithBatchedIn(
      supabase, 'order_cost_breakdown_cache', 'order_id',
      'order_id', orderIds,
      [{ column: 'seller_id', value: sellerId }]
    );

    const existingIds = new Set(existing.map((e: any) => e.order_id));
    const missing = ordersWithoutBreakdown.filter((o: any) => !existingIds.has(o.order_id));

    if (missing.length === 0) {
      console.log(`[costs-nightly] All orders already have breakdown for ${sellerId}`);
      return 0;
    }

    // Create breakdown records
    const records = missing.map((order: any) => ({
      user_id: userId,
      seller_id: sellerId,
      order_id: order.order_id,
      shipment_id: order.shipment_id,
      revenue_total: order.total_amount || 0,
      created_at_meli: order.created_at_meli,
      fee_ml: 0,
      fee_ml_source: 'pending',
      cost_items_total: 0,
      cost_packaging: 0,
      cost_shipping: 0,
      cost_fees: 0,
      cost_total: 0,
      profit_total: order.total_amount || 0,
      margin_percent: 100,
      calculated_at: new Date().toISOString(),
      last_writer: 'costs-nightly-sync:backfill',
    }));

    await supabase
      .from('order_cost_breakdown_cache')
      .upsert(records, { onConflict: 'seller_id,order_id', ignoreDuplicates: true });

    console.log(`[costs-nightly] Backfilled ${records.length} orders for ${sellerId}`);

    // Update backfill state
    await supabase.from('meli_backfill_sync_state').upsert({
      user_id: userId,
      seller_id: sellerId,
      status: 'done',
      processed_orders: records.length,
      last_heartbeat_at: new Date().toISOString(),
    }, { onConflict: 'seller_id' });

    return records.length;
  } catch (error) {
    console.error(`[costs-nightly] Backfill error for ${sellerId}:`, error);
    return 0;
  }
}

// Process real costs
async function processRealCosts(supabase: any, userId: string, sellerId: string, accessToken: string, action: string) {
  const MAX_ORDERS = 100;
  
  try {
    // Get orders with pending billing
    const { data: pendingOrders } = await supabase
      .from('order_cost_breakdown_cache')
      .select('order_id, shipment_id, revenue_total, created_at_meli, cost_items_total, cost_packaging')
      .eq('seller_id', sellerId)
      .eq('fee_ml_source', 'pending')
      .order('created_at_meli', { ascending: false })
      .limit(MAX_ORDERS);

    if (!pendingOrders?.length) {
      console.log(`[costs-nightly] No pending orders for ${sellerId}`);
      return;
    }

    const orderIds = pendingOrders.map((o: any) => o.order_id);
    const shipmentIds = pendingOrders.map((o: any) => o.shipment_id).filter(Boolean);

    // Get billing data
    const billingData = await fetchWithBatchedIn(
      supabase, 'meli_billing_details_cache',
      'order_id, shipment_id, charge_type, gross_amount',
      'order_id', orderIds,
      [{ column: 'seller_id', value: sellerId }]
    );

    // Aggregate billing by order
    const billingByOrder = new Map<string, { fee_ml: number; shipping: number; installments: number; adjustments: number }>();
    
    for (const detail of billingData) {
      const orderId = String(detail.order_id);
      if (!billingByOrder.has(orderId)) {
        billingByOrder.set(orderId, { fee_ml: 0, shipping: 0, installments: 0, adjustments: 0 });
      }
      
      const entry = billingByOrder.get(orderId)!;
      const category = classifyBillingCharge(detail.charge_type || '');
      const amount = detail.gross_amount || 0;

      switch (category) {
        case 'commission': entry.fee_ml += amount; break;
        case 'shipping': entry.shipping += amount; break;
        case 'installments': entry.installments += amount; break;
        case 'adjustments': entry.adjustments += amount; break;
        case 'unknown':
          if (amount > 0) entry.fee_ml += amount;
          break;
      }
    }

    // Update orders with billing
    let updatedCount = 0;
    const ORDER_AGE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

    for (const order of pendingOrders) {
      const billing = billingByOrder.get(order.order_id);
      const orderAge = order.created_at_meli ? Date.now() - new Date(order.created_at_meli).getTime() : 0;
      const isOldOrder = orderAge > ORDER_AGE_THRESHOLD_MS;
      
      let feeML = 0, feeMLSource = 'pending', shippingCost = 0, installmentsCost = 0, adjustments = 0;

      if (billing && (billing.fee_ml !== 0 || billing.shipping !== 0)) {
        feeML = billing.fee_ml;
        feeMLSource = 'billing';
        shippingCost = billing.shipping;
        installmentsCost = billing.installments;
        adjustments = billing.adjustments;
        updatedCount++;
      } else if (isOldOrder) {
        feeMLSource = 'no_charges';
        updatedCount++;
      } else {
        continue; // Still pending
      }

      const costFees = feeML + adjustments;
      const costTotal = (order.cost_items_total || 0) + (order.cost_packaging || 0) + costFees + shippingCost;
      const revenueTotal = order.revenue_total || 0;
      const profitTotal = revenueTotal - costTotal;
      const marginPercent = revenueTotal > 0 ? Math.round((profitTotal / revenueTotal) * 100) : 0;

      await supabase
        .from('order_cost_breakdown_cache')
        .update({
          fee_ml: feeML,
          fee_ml_source: feeMLSource,
          cost_shipping: shippingCost,
          cost_fees: costFees,
          commission_cost: feeML,
          shipping_cost_seller: shippingCost,
          installments_cost: installmentsCost,
          adjustments: adjustments,
          total_marketplace_cost: feeML + shippingCost + adjustments,
          cost_total: costTotal,
          profit_total: profitTotal,
          margin_percent: marginPercent,
          has_real_financial: feeMLSource === 'billing',
          real_cost_synced_at: new Date().toISOString(),
          last_writer: 'costs-nightly-sync:billing',
        })
        .eq('seller_id', sellerId)
        .eq('order_id', order.order_id);
    }

    console.log(`[costs-nightly] Updated ${updatedCount} orders with billing for ${sellerId}`);

    // Update state
    await supabase.from('meli_real_costs_sync_state').upsert({
      user_id: userId,
      seller_id: sellerId,
      status: 'done',
      processed: updatedCount,
      last_heartbeat_at: new Date().toISOString(),
    }, { onConflict: 'seller_id' });

  } catch (error) {
    console.error(`[costs-nightly] Real costs error for ${sellerId}:`, error);
  }
}
