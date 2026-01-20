// @ts-nocheck - Deno types not available in build context
// Force clean redeploy v2
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7/dist/module/index.js?target=deno&no-check";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PERIODS_PER_PAGE = 12;
const DETAILS_PAGE_SIZE = 1000;
const MAX_RUNTIME_MS = 55000;

interface BillingDetail {
  seller_id: string;
  period_key: string;
  detail_id: string;
  order_id: number | null;
  shipment_id: number | null;
  charge_type: string;
  charge_description: string | null;
  gross_amount: number;
  net_amount: number;
  currency_id: string;
  created_at_meli: string | null;
  fetched_at: string;
  raw_data: any;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { seller_id, action, scope } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: "seller_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      return await handleGetStatus(supabase, user.id, seller_id, corsHeaders);
    }

    if (action === "sync") {
      const syncScope = scope || "recent";
      return await handleSync(supabase, user.id, seller_id, syncScope, corsHeaders);
    }

    if (action === "reset") {
      return await handleReset(supabase, user.id, seller_id, corsHeaders);
    }

    return await handleGetStatus(supabase, user.id, seller_id, corsHeaders);
  } catch (err: unknown) {
    console.error("Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleGetStatus(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  // Get sync state
  const { data: syncState } = await supabase
    .from("meli_billing_details_sync_state")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  // PAGINATED COUNT - total billing details
  let totalDetails = 0;
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("meli_billing_details_cache")
      .select("id")
      .eq("seller_id", sellerId)
      .range(offset, offset + PAGE - 1);
    if (error || !data?.length) break;
    totalDetails += data.length;
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // PAGINATED COUNT - unique orders with billing
  const uniqueOrderIds = new Set<number>();
  const uniqueShipmentIds = new Set<number>();
  const uniquePeriodKeys = new Set<string>();
  offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("meli_billing_details_cache")
      .select("order_id, shipment_id, period_key")
      .eq("seller_id", sellerId)
      .range(offset, offset + PAGE - 1);
    if (error || !data?.length) break;
    for (const r of data) {
      if (r.order_id) uniqueOrderIds.add(r.order_id);
      if (r.shipment_id) uniqueShipmentIds.add(r.shipment_id);
      if (r.period_key) uniquePeriodKeys.add(r.period_key);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const sortedPeriods = [...uniquePeriodKeys].sort();
  const oldestPeriod = sortedPeriods[0] || null;
  const newestPeriod = sortedPeriods[sortedPeriods.length - 1] || null;

  // Get most recent sync timestamp
  const { data: latestSync } = await supabase
    .from("meli_billing_details_cache")
    .select("fetched_at")
    .eq("seller_id", sellerId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return new Response(JSON.stringify({
    total_details: totalDetails,
    unique_orders_with_billing: uniqueOrderIds.size,
    unique_shipments_with_billing: uniqueShipmentIds.size,
    periods_count: uniquePeriodKeys.size,
    oldest_period: oldestPeriod,
    newest_period: newestPeriod,
    last_sync_at: latestSync?.fetched_at || null,
    sync_state: syncState || null,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleReset(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  await supabase.from("meli_billing_details_sync_state").delete().eq("seller_id", sellerId).eq("user_id", userId);
  return new Response(JSON.stringify({ message: "Reset complete" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleSync(supabase: any, userId: string, sellerId: string, scope: string, corsHeaders: any) {
  const startTime = Date.now();
  console.log(`[BillingDetails] Starting sync for seller ${sellerId}, scope: ${scope}`);

  // Get or create sync state
  let { data: syncState } = await supabase
    .from("meli_billing_details_sync_state")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  // Check if scope changed - reset if so
  if (syncState && syncState.scope !== scope) {
    console.log(`[BillingDetails] Scope changed from ${syncState.scope} to ${scope}, resetting state`);
    await supabase.from("meli_billing_details_sync_state").delete().eq("seller_id", sellerId);
    syncState = null;
  }

  // Get ML account
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, refresh_token")
    .eq("ml_user_id", sellerId)
    .eq("is_active", true)
    .maybeSingle();

  if (!mlAccount) {
    return new Response(JSON.stringify({ error: "ML account not found" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let accessToken = mlAccount.access_token;
  let totalInserted = 0;
  let periodsProcessed = syncState?.processed_periods || 0;
  let periodsOffset = syncState?.periods_offset || 0;
  let currentPeriodKey = syncState?.period_key_cursor || null;
  let currentDetailsOffset = syncState?.details_offset || 0;
  
  // Initialize or update state
  if (!syncState) {
    const { data: newState } = await supabase.from("meli_billing_details_sync_state").insert({
      user_id: userId,
      seller_id: sellerId,
      status: "running",
      scope: scope,
      periods_offset: 0,
      period_key_cursor: null,
      details_offset: 0,
      total_periods: 0,
      processed_periods: 0,
      total_details: 0,
      processed_details: 0,
      started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }).select().single();
    syncState = newState;
  } else {
    await supabase.from("meli_billing_details_sync_state").update({
      status: "running",
      last_heartbeat_at: new Date().toISOString(),
      last_error: null,
    }).eq("seller_id", sellerId);
  }

  try {
    // Step 1: Fetch ALL available billing periods using pagination with rate limit handling
    console.log(`[BillingDetails] Fetching billing periods starting at offset ${periodsOffset}...`);
    
    let allPeriods: any[] = [];
    let hasMorePeriods = true;
    let tempOffset = 0;
    const MAX_RETRIES = 5;
    
    // Helper function for rate-limited API calls with exponential backoff
    async function fetchWithRateLimitRetry(url: string, token: string, retries = 0): Promise<Response> {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.status === 429) {
        if (retries >= MAX_RETRIES) {
          console.log(`[BillingDetails] Max retries (${MAX_RETRIES}) reached for rate limit`);
          return res; // Return the 429 response after max retries
        }
        // Exponential backoff: 15s, 30s, 60s, 120s, 240s
        const waitSec = Math.min(15 * Math.pow(2, retries), 240);
        console.log(`[BillingDetails] Rate limited, waiting ${waitSec}s before retry ${retries + 1}/${MAX_RETRIES}...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        return fetchWithRateLimitRetry(url, token, retries + 1);
      }
      
      return res;
    }
    
    // First, fetch all periods to know the total
    while (hasMorePeriods && Date.now() - startTime < MAX_RUNTIME_MS) {
      const periodsUrl = `https://api.mercadolibre.com/billing/integration/monthly/periods?group=ML&document_type=BILL&limit=${PERIODS_PER_PAGE}&offset=${tempOffset}`;
      
      let periodsRes = await fetchWithRateLimitRetry(periodsUrl, accessToken);

      if (periodsRes.status === 401) {
        console.log(`[BillingDetails] Token expired, refreshing...`);
        const newToken = await refreshToken(supabase, sellerId, mlAccount.refresh_token);
        if (!newToken) {
          await updateSyncState(supabase, sellerId, { status: "error", last_error: "Token refresh failed" });
          return new Response(JSON.stringify({ error: "Token refresh failed" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        accessToken = newToken;
        periodsRes = await fetchWithRateLimitRetry(periodsUrl, accessToken);
      }
      
      // Handle rate limit after retries exhausted - pause and return
      if (periodsRes.status === 429) {
        console.log(`[BillingDetails] Rate limit persists after retries, pausing sync...`);
        await updateSyncState(supabase, sellerId, {
          status: "paused",
          periods_offset: tempOffset,
          last_error: "Rate limited during periods fetch - retry in 5 minutes",
        });
        return new Response(JSON.stringify({
          success: true,
          status: "paused",
          reason: "rate_limited",
          message: "Rate limited by ML API. Please retry in 5 minutes.",
          periods_found: allPeriods.length,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!periodsRes.ok) {
        const errText = await periodsRes.text();
        console.error(`[BillingDetails] Failed to fetch periods: ${errText}`);
        await updateSyncState(supabase, sellerId, { status: "error", last_error: `API error: ${periodsRes.status}` });
        return new Response(JSON.stringify({ error: "Failed to fetch billing periods", details: errText }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const periodsData = await periodsRes.json();
      const periodsBatch = periodsData.results || [];
      console.log(`[BillingDetails] Fetched ${periodsBatch.length} periods at offset ${tempOffset}`);
      
      allPeriods = [...allPeriods, ...periodsBatch];
      
      if (periodsBatch.length < PERIODS_PER_PAGE) {
        hasMorePeriods = false;
      } else {
        tempOffset += PERIODS_PER_PAGE;
        if (scope === "recent" && tempOffset >= PERIODS_PER_PAGE) {
          hasMorePeriods = false;
        }
      }
      
      // Wait 12s between period fetches to stay under 5 req/min limit
      await new Promise(r => setTimeout(r, 12000));
    }

    console.log(`[BillingDetails] Total periods found: ${allPeriods.length}`);
    
    // Update total periods in state
    await supabase.from("meli_billing_details_sync_state").update({
      total_periods: allPeriods.length,
      last_heartbeat_at: new Date().toISOString(),
    }).eq("seller_id", sellerId);

    // Step 2: Process periods starting from where we left off
    for (let i = periodsOffset; i < allPeriods.length; i++) {
      if (Date.now() - startTime >= MAX_RUNTIME_MS) {
        console.log(`[BillingDetails] Runtime limit reached, pausing at period ${i}...`);
        await updateSyncState(supabase, sellerId, {
          status: "paused",
          periods_offset: i,
          period_key_cursor: null,
          details_offset: 0,
          processed_periods: i,
        });
        return new Response(JSON.stringify({
          success: true,
          status: "paused",
          scope: scope,
          periods_found: allPeriods.length,
          periods_processed: i,
          records_inserted: totalInserted,
          completed: false,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const period = allPeriods[i];
      const periodKey = period.key;
      console.log(`[BillingDetails] Processing period: ${periodKey} (${i + 1}/${allPeriods.length})`);

      // If we're resuming mid-period, start from saved offset
      let offset = (currentPeriodKey === periodKey) ? currentDetailsOffset : 0;
      currentPeriodKey = periodKey;
      let hasMore = true;

      while (hasMore && Date.now() - startTime < MAX_RUNTIME_MS) {
        const detailsUrl = `https://api.mercadolibre.com/billing/integration/periods/key/${periodKey}/group/ML/details?document_type=BILL&limit=${DETAILS_PAGE_SIZE}&offset=${offset}`;
        
        let detailsRes = await fetchWithRateLimitRetry(detailsUrl, accessToken);

        if (detailsRes.status === 401) {
          const newToken = await refreshToken(supabase, sellerId, mlAccount.refresh_token);
          if (!newToken) {
            await updateSyncState(supabase, sellerId, { status: "error", last_error: "Token refresh failed during details fetch" });
            break;
          }
          accessToken = newToken;
          continue;
        }

        if (detailsRes.status === 429) {
          console.log(`[BillingDetails] Rate limited on details after retries, saving state and pausing...`);
          await updateSyncState(supabase, sellerId, {
            status: "paused",
            periods_offset: i,
            period_key_cursor: periodKey,
            details_offset: offset,
            last_error: "Rate limited - will resume in 5 minutes",
          });
          return new Response(JSON.stringify({
            success: true,
            status: "paused",
            reason: "rate_limited",
            message: "Rate limited by ML API. Please retry in 5 minutes.",
            periods_processed: i,
            records_inserted: totalInserted,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (!detailsRes.ok) {
          console.error(`[BillingDetails] Failed to fetch details for ${periodKey}: ${detailsRes.status}`);
          break;
        }

        const detailsData = await detailsRes.json();
        const results = detailsData.results || [];
        console.log(`[BillingDetails] Period ${periodKey} offset ${offset}: ${results.length} records`);

        if (results.length === 0) {
          hasMore = false;
          break;
        }

        // Parse and prepare records - WITH SIGNED AMOUNTS
        const records: BillingDetail[] = [];
        for (const item of results) {
          const chargeInfo = item.charge_info || {};
          const salesInfo = (item.sales_info || [])[0] || {};
          const shippingInfo = item.shipping_info || {};

          // CRITICAL: Keep the original sign of the amount
          const detailAmount = chargeInfo.detail_amount || 0;
          const chargeDesc = chargeInfo.charge_bonified_id 
            ? `Bonified: ${chargeInfo.charge_bonified_id}` 
            : (chargeInfo.transaction_detail || chargeInfo.concept_type || null);

          records.push({
            seller_id: sellerId,
            period_key: periodKey,
            detail_id: String(chargeInfo.detail_id || `${periodKey}-${offset}-${records.length}`),
            order_id: salesInfo.order_id || null,
            shipment_id: shippingInfo.shipping_id || null,
            charge_type: chargeInfo.transaction_detail || chargeInfo.concept_type || "unknown",
            charge_description: chargeDesc,
            gross_amount: detailAmount, // Keep original sign!
            net_amount: detailAmount,   // Keep original sign!
            currency_id: chargeInfo.currency_id || "BRL",
            created_at_meli: item.created_date || null,
            fetched_at: new Date().toISOString(),
            raw_data: item,
          });
        }

        // Upsert to database
        if (records.length > 0) {
          const { error: upsertErr } = await supabase
            .from("meli_billing_details_cache")
            .upsert(records, { onConflict: "seller_id,period_key,detail_id" });

          if (upsertErr) {
            console.error(`[BillingDetails] Upsert error:`, upsertErr);
          } else {
            totalInserted += records.length;
          }
        }

        // Update state periodically
        await supabase.from("meli_billing_details_sync_state").update({
          period_key_cursor: periodKey,
          details_offset: offset + results.length,
          processed_details: (syncState?.processed_details || 0) + results.length,
          last_heartbeat_at: new Date().toISOString(),
        }).eq("seller_id", sellerId);

        offset += results.length;
        hasMore = results.length >= DETAILS_PAGE_SIZE;

        // Wait 12s between details fetches to stay under 5 req/min limit
        await new Promise(r => setTimeout(r, 12000));
      }

      periodsProcessed = i + 1;
      currentDetailsOffset = 0; // Reset for next period
      
      // Update progress
      await supabase.from("meli_billing_details_sync_state").update({
        processed_periods: periodsProcessed,
        periods_offset: periodsProcessed,
        period_key_cursor: null,
        details_offset: 0,
        last_heartbeat_at: new Date().toISOString(),
      }).eq("seller_id", sellerId);
    }

    // All done!
    await updateSyncState(supabase, sellerId, {
      status: "done",
      finished_at: new Date().toISOString(),
      processed_periods: allPeriods.length,
    });

    console.log(`[BillingDetails] Sync complete. Periods: ${periodsProcessed}/${allPeriods.length}, Records: ${totalInserted}`);

    return new Response(JSON.stringify({
      success: true,
      status: "done",
      scope: scope,
      periods_found: allPeriods.length,
      periods_processed: periodsProcessed,
      records_inserted: totalInserted,
      completed: true,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    console.error(`[BillingDetails] Error:`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateSyncState(supabase, sellerId, { status: "error", last_error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

async function updateSyncState(supabase: any, sellerId: string, updates: any) {
  await supabase.from("meli_billing_details_sync_state").update({
    ...updates,
    updated_at: new Date().toISOString(),
    last_heartbeat_at: new Date().toISOString(),
  }).eq("seller_id", sellerId);
}

async function refreshToken(supabase: any, sellerId: string, refreshTokenValue: string): Promise<string | null> {
  try {
    const appId = Deno.env.get("ML_APP_ID");
    const secretKey = Deno.env.get("ML_SECRET_KEY");

    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: appId!,
        client_secret: secretKey!,
        refresh_token: refreshTokenValue,
      }),
    });

    if (!response.ok) {
      console.error(`[BillingDetails] Token refresh failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await supabase
      .from("ml_accounts")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("ml_user_id", sellerId);

    return data.access_token;
  } catch (err) {
    console.error(`[BillingDetails] Token refresh error:`, err);
    return null;
  }
}
