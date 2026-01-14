import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PERIODS = 12;
const PAGE_SIZE = 500;
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
    const { seller_id, action } = body;

    if (!seller_id) {
      return new Response(JSON.stringify({ error: "seller_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      return await handleGetStatus(supabase, seller_id, corsHeaders);
    }

    if (action === "sync") {
      return await handleSync(supabase, user.id, seller_id, corsHeaders);
    }

    return await handleGetStatus(supabase, seller_id, corsHeaders);
  } catch (err: unknown) {
    console.error("Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleGetStatus(supabase: any, sellerId: string, corsHeaders: any) {
  // Count total billing details
  const { count: totalDetails } = await supabase
    .from("meli_billing_details_cache")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId);

  // Count unique orders with billing
  const { data: orderCount } = await supabase
    .from("meli_billing_details_cache")
    .select("order_id")
    .eq("seller_id", sellerId)
    .not("order_id", "is", null);

  const uniqueOrders = new Set((orderCount || []).map((r: any) => r.order_id)).size;

  // Get most recent period synced
  const { data: latestPeriod } = await supabase
    .from("meli_billing_details_cache")
    .select("period_key, fetched_at")
    .eq("seller_id", sellerId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return new Response(JSON.stringify({
    total_details: totalDetails || 0,
    unique_orders_with_billing: uniqueOrders,
    latest_period: latestPeriod?.period_key || null,
    last_sync_at: latestPeriod?.fetched_at || null,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleSync(supabase: any, userId: string, sellerId: string, corsHeaders: any) {
  const startTime = Date.now();
  console.log(`[BillingDetails] Starting sync for seller ${sellerId}`);

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
  let periodsProcessed = 0;

  try {
    // Step 1: Fetch available billing periods (with token refresh retry)
    console.log(`[BillingDetails] Fetching billing periods...`);
    const periodsUrl = `https://api.mercadolibre.com/billing/integration/monthly/periods?group=ML&limit=${MAX_PERIODS}`;
    
    let periodsRes = await fetch(periodsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // If 401, refresh token and RETRY the request
    if (periodsRes.status === 401) {
      console.log(`[BillingDetails] Token expired, refreshing...`);
      const newToken = await refreshToken(supabase, sellerId, mlAccount.refresh_token);
      if (!newToken) {
        return new Response(JSON.stringify({ error: "Token refresh failed. Please reconnect your Mercado Livre account." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accessToken = newToken;
      
      // RETRY with new token
      periodsRes = await fetch(periodsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (!periodsRes.ok) {
      const errText = await periodsRes.text();
      console.error(`[BillingDetails] Failed to fetch periods: ${errText}`);
      return new Response(JSON.stringify({ error: "Failed to fetch billing periods", details: errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const periodsData = await periodsRes.json();
    const periods = periodsData.results || [];
    console.log(`[BillingDetails] Found ${periods.length} periods`);

    // Step 2: Process each period
    for (const period of periods) {
      if (Date.now() - startTime >= MAX_RUNTIME_MS) {
        console.log(`[BillingDetails] Runtime limit reached, pausing...`);
        break;
      }

      const periodKey = period.key; // e.g., "2026-01-01"
      console.log(`[BillingDetails] Processing period: ${periodKey}`);

      let offset = 0;
      let hasMore = true;

      while (hasMore && Date.now() - startTime < MAX_RUNTIME_MS) {
        const detailsUrl = `https://api.mercadolibre.com/billing/integration/periods/key/${periodKey}/group/ML/details?limit=${PAGE_SIZE}&offset=${offset}`;
        
        const detailsRes = await fetch(detailsUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (detailsRes.status === 401) {
          accessToken = await refreshToken(supabase, sellerId, mlAccount.refresh_token);
          if (!accessToken) break;
          continue; // Retry with new token
        }

        if (detailsRes.status === 429) {
          console.log(`[BillingDetails] Rate limited, waiting 2s...`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
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

        // Parse and prepare records
        const records: BillingDetail[] = [];
        for (const item of results) {
          const chargeInfo = item.charge_info || {};
          const salesInfo = (item.sales_info || [])[0] || {};
          const shippingInfo = item.shipping_info || {};

          records.push({
            seller_id: sellerId,
            period_key: periodKey,
            detail_id: String(chargeInfo.detail_id || `${periodKey}-${offset}-${records.length}`),
            order_id: salesInfo.order_id || null,
            shipment_id: shippingInfo.shipping_id || null,
            charge_type: chargeInfo.transaction_detail || chargeInfo.concept_type || "unknown",
            charge_description: chargeInfo.charge_bonified_id ? `Bonified: ${chargeInfo.charge_bonified_id}` : null,
            gross_amount: Math.abs(chargeInfo.detail_amount || 0),
            net_amount: Math.abs(chargeInfo.detail_amount || 0),
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

        offset += results.length;
        hasMore = results.length >= PAGE_SIZE;

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      }

      periodsProcessed++;
    }

    console.log(`[BillingDetails] Sync complete. Periods: ${periodsProcessed}, Records: ${totalInserted}`);

    return new Response(JSON.stringify({
      success: true,
      periods_processed: periodsProcessed,
      records_inserted: totalInserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    console.error(`[BillingDetails] Error:`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

async function refreshToken(supabase: any, sellerId: string, refreshToken: string): Promise<string | null> {
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
        refresh_token: refreshToken,
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
