import { createClient } from "npm:@supabase/supabase-js@2";
import { logSyncEvent } from "../_shared/sync-audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key, x-cron-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ML_APP_ID = Deno.env.get("ML_APP_ID")!;
const ML_SECRET_KEY = Deno.env.get("ML_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 50;
const DELAY_BETWEEN_REQUESTS_MS = 500;
const DELAY_BETWEEN_PAGES_MS = 2000;
const MAX_RUNTIME_MS = 50000; // 50s to leave margin for 60s timeout
const ORDERS_PER_INVOCATION = 500; // Process up to 500 orders per invocation

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function refreshToken(refreshToken: string) {
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ML_APP_ID,
      client_secret: ML_SECRET_KEY,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) return null;
  return await response.json();
}

const generateProductKey = (itemId: string, variationId: string | null, sku: string | null): string => {
  if (sku && sku.trim()) return sku.trim().toUpperCase();
  return `${itemId}:${variationId || "0"}`;
};

const generateTitleShort = (title: string | null): string => {
  if (!title) return "";
  return title.substring(0, 50).trim();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    let { seller_id, action, job_id, days_back = 30, admin_override = false } = body;

    // Modo Econômico (2026-05): clamp servidor — sellers comuns só podem importar 30 dias.
    // admin_override=true mantém comportamento histórico (uso futuro/admin).
    const MAX_DAYS_BACK_NORMAL = 30;
    if (!admin_override && Number(days_back) > MAX_DAYS_BACK_NORMAL) {
      days_back = MAX_DAYS_BACK_NORMAL;
    }

    // --- STATUS action ---
    if (action === "status") {
      const { data: job } = await supabase
        .from("orders_historical_sync_jobs")
        .select("*")
        .eq("seller_id", seller_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(JSON.stringify({ ok: true, job }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- START action ---
    if (action === "start") {
      if (!seller_id) {
        return new Response(JSON.stringify({ ok: false, error: "seller_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check for existing running job
      const { data: existingJob } = await supabase
        .from("orders_historical_sync_jobs")
        .select("id, status")
        .eq("seller_id", seller_id)
        .in("status", ["pending", "running"])
        .maybeSingle();

      if (existingJob) {
        await logSyncEvent(supabase, {
          action: 'sync_skipped',
          entityType: 'orders_sync',
          entityId: existingJob.id,
          metadata: { module: 'orders_sync', scope: 'last_12m', error_message: 'Job already in progress' },
        });
        return new Response(JSON.stringify({ ok: false, error: "Job already in progress", job_id: existingJob.id }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get user_id from ml_accounts
      const { data: account } = await supabase
        .from("ml_accounts")
        .select("user_id")
        .eq("ml_user_id", seller_id)
        .eq("is_active", true)
        .single();

      if (!account) {
        return new Response(JSON.stringify({ ok: false, error: "Account not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create job
      const { data: newJob } = await supabase
        .from("orders_historical_sync_jobs")
        .insert({
          seller_id,
          user_id: account.user_id,
          job_type: "historical_365d",
          status: "running",
          days_back: days_back,
          started_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
        })
        .select()
        .single();

      // Self-chain to process
      EdgeRuntime.waitUntil(
        fetch(`${SUPABASE_URL}/functions/v1/orders-historical-import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ seller_id, action: "continue", job_id: newJob.id }),
        }).catch(err => console.error("[historical-import] Chain error:", err))
      );

      return new Response(JSON.stringify({ ok: true, job_id: newJob.id, status: "started" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- CONTINUE action (self-chaining) ---
    if (action === "continue") {
      // Validate internal key
      const internalKey = req.headers.get("x-internal-key") || req.headers.get("authorization")?.replace("Bearer ", "");
      
      if (!job_id) {
        return new Response(JSON.stringify({ ok: false, error: "job_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get job
      const { data: job } = await supabase
        .from("orders_historical_sync_jobs")
        .select("*")
        .eq("id", job_id)
        .single();

      if (!job || job.status === "done" || job.status === "error") {
        return new Response(JSON.stringify({ ok: false, error: "Job not found or already completed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get ML account
      const { data: account } = await supabase
        .from("ml_accounts")
        .select("id, user_id, ml_user_id, access_token, refresh_token, token_expires_at")
        .eq("ml_user_id", job.seller_id)
        .eq("is_active", true)
        .single();

      if (!account) {
        await supabase.from("orders_historical_sync_jobs").update({
          status: "error", error_message: "Account not found or inactive",
        }).eq("id", job_id);
        return new Response(JSON.stringify({ ok: false, error: "Account not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let accessToken = account.access_token;

      // Refresh token if needed
      const tokenExpires = account.token_expires_at ? new Date(account.token_expires_at) : null;
      if (!tokenExpires || tokenExpires < new Date()) {
        const tokenData = await refreshToken(account.refresh_token);
        if (tokenData?.access_token) {
          accessToken = tokenData.access_token;
          await supabase.from("ml_accounts").update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString(),
          }).eq("id", account.id);
        } else {
          await supabase.from("orders_historical_sync_jobs").update({
            status: "error", error_message: "Token refresh failed",
          }).eq("id", job_id);
          return new Response(JSON.stringify({ ok: false, error: "Token refresh failed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Calculate date range
      const now = new Date();
      const daysAgo = new Date(now);
      daysAgo.setDate(now.getDate() - job.days_back);

      const formatDate = (d: Date, time: string) =>
        `${d.toISOString().split("T")[0]}T${time}-03:00`;

      const dateFrom = formatDate(daysAgo, "00:00:00.000");
      const dateTo = formatDate(now, "23:59:59.999");

      const startTime = Date.now();
      let offset = job.current_offset || 0;
      let totalProcessed = job.processed_orders || 0;
      let ordersThisInvocation = 0;
      let hasMore = true;

      const baseUrl = `https://api.mercadolibre.com/orders/search?seller=${job.seller_id}&sort=date_asc&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}`;

      console.log(`[historical-import] Continuing job ${job_id} from offset ${offset}`);

      while (hasMore && ordersThisInvocation < ORDERS_PER_INVOCATION) {
        // Check runtime
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          console.log(`[historical-import] Runtime limit reached at offset ${offset}`);
          break;
        }

        const url = `${baseUrl}&offset=${offset}&limit=${BATCH_SIZE}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          if (response.status === 429) {
            console.log("[historical-import] Rate limited, will continue later");
            break;
          }
          if (response.status === 401) {
            const tokenData = await refreshToken(account.refresh_token);
            if (tokenData?.access_token) {
              accessToken = tokenData.access_token;
              await supabase.from("ml_accounts").update({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                token_expires_at: new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString(),
              }).eq("id", account.id);
              continue;
            }
            await supabase.from("orders_historical_sync_jobs").update({
              status: "error", error_message: "Authentication failed",
            }).eq("id", job_id);
            return new Response(JSON.stringify({ ok: false, error: "Auth failed" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.error(`[historical-import] API error: ${response.status}`);
          break;
        }

        const data = await response.json();
        const orders = data.results || [];
        const totalAvailable = data.paging?.total || 0;

        // Update total on first page
        if (offset === 0 || job.total_orders === 0) {
          await supabase.from("orders_historical_sync_jobs").update({
            total_orders: totalAvailable,
          }).eq("id", job_id);
        }

        if (orders.length === 0) {
          hasMore = false;
          break;
        }

        // Collect item IDs
        const uniqueItemIds = new Set<string>();
        for (const order of orders) {
          if (order.order_items) {
            for (const item of order.order_items) {
              if (item.item?.id) uniqueItemIds.add(item.item.id);
            }
          }
        }

        // Fetch item details
        const itemDetailsCache = new Map<string, any>();
        const itemIdsList = Array.from(uniqueItemIds);
        for (let i = 0; i < itemIdsList.length; i += 20) {
          const batchIds = itemIdsList.slice(i, i + 20).join(",");
          try {
            const itemsResponse = await fetch(
              `https://api.mercadolibre.com/items?ids=${batchIds}&attributes=id,permalink,catalog_product_id,thumbnail`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (itemsResponse.ok) {
              const itemsData = await itemsResponse.json();
              for (const result of itemsData) {
                if (result.code === 200 && result.body) {
                  itemDetailsCache.set(result.body.id, result.body);
                }
              }
            }
          } catch (err) {
            console.error("[historical-import] Item details error:", err);
          }
          await sleep(DELAY_BETWEEN_REQUESTS_MS);
        }

        // Build order and item records
        const orderRecords: any[] = [];
        const itemRecords: any[] = [];

        for (const order of orders) {
          const orderId = order.id.toString();
          const shipmentId = order.shipping?.id?.toString() || null;
          const buyerName = order.buyer?.first_name && order.buyer?.last_name
            ? `${order.buyer.first_name} ${order.buyer.last_name}`.trim()
            : order.buyer?.nickname || null;
          let itemCount = 0;

          if (order.order_items) {
            for (const item of order.order_items) {
              const itemId = item.item?.id || "unknown";
              const variationId = item.item?.variation_id?.toString() || "";
              const sku = item.item?.seller_sku || null;
              const title = item.item?.title || "Produto sem título";
              const itemDetails = itemDetailsCache.get(itemId);

              itemRecords.push({
                user_id: account.user_id,
                seller_id: job.seller_id,
                order_id: orderId,
                shipment_id: shipmentId,
                item_id: itemId,
                variation_id: variationId,
                sku: sku,
                title: title,
                title_short: generateTitleShort(title),
                quantity: item.quantity || 1,
                unit_price: item.unit_price || 0,
                currency_id: item.currency_id || "BRL",
                product_key: generateProductKey(itemId, variationId || null, sku),
                created_at_meli: order.date_created,
                last_sync_at: new Date().toISOString(),
                permalink: itemDetails?.permalink || null,
                catalog_product_id: itemDetails?.catalog_product_id || null,
                thumbnail: itemDetails?.thumbnail || null,
              });
              itemCount += item.quantity || 1;
            }
          }

          orderRecords.push({
            user_id: account.user_id,
            seller_id: job.seller_id,
            order_id: orderId,
            pack_id: order.pack_id ? order.pack_id.toString() : null,
            created_at_meli: order.date_created,
            order_status: order.status,
            shipment_id: shipmentId,
            buyer_nickname: order.buyer?.nickname || null,
            buyer_name: buyerName,
            total_amount: order.total_amount || null,
            items_count: itemCount,
            items_synced_at: itemCount > 0 ? new Date().toISOString() : null,
            last_sync_at: new Date().toISOString(),
          });
        }

        // Upsert orders
        for (let i = 0; i < orderRecords.length; i += 100) {
          await supabase.from("meli_orders_cache").upsert(
            orderRecords.slice(i, i + 100),
            { onConflict: "seller_id,order_id" }
          );
        }

        // Upsert items
        for (let i = 0; i < itemRecords.length; i += 100) {
          await supabase.from("meli_order_items_cache").upsert(
            itemRecords.slice(i, i + 100),
            { onConflict: "seller_id,order_id,item_id,variation_id" }
          );
        }

        totalProcessed += orders.length;
        ordersThisInvocation += orders.length;
        offset += orders.length;

        // Heartbeat
        await supabase.from("orders_historical_sync_jobs").update({
          current_offset: offset,
          processed_orders: totalProcessed,
          last_heartbeat_at: new Date().toISOString(),
        }).eq("id", job_id);

        console.log(`[historical-import] Processed ${totalProcessed} orders (offset: ${offset})`);

        if (orders.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          await sleep(DELAY_BETWEEN_PAGES_MS);
        }
      }

      // Check if done or needs another chain
      const totalOrders = (await supabase
        .from("orders_historical_sync_jobs")
        .select("total_orders")
        .eq("id", job_id)
        .single()).data?.total_orders || 0;

      const isDone = !hasMore || (totalOrders > 0 && totalProcessed >= totalOrders);

      if (isDone) {
        await supabase.from("orders_historical_sync_jobs").update({
          status: "done",
          processed_orders: totalProcessed,
          current_offset: offset,
          completed_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
        }).eq("id", job_id);

        console.log(`[historical-import] Job ${job_id} COMPLETED: ${totalProcessed} orders`);

        // Audit: sync_finished
        await logSyncEvent(supabase, {
          action: 'sync_finished',
          entityType: 'orders_sync',
          entityId: job_id,
          userId: account.user_id,
          metadata: {
            module: 'orders_sync',
            scope: 'last_12m',
            job_id,
            seller_id: job.seller_id,
            orders_imported: totalProcessed,
            finished_at: new Date().toISOString(),
          },
        });

        // Gap 18: Reevaluate tenant limits
        try {
          const { data: mlAcc } = await supabase
            .from('ml_accounts')
            .select('company_id')
            .eq('ml_user_id', job.seller_id)
            .maybeSingle();
          if (mlAcc?.company_id) {
            await supabase.rpc('rpc_compute_sales_30d', { p_tenant_id: mlAcc.company_id });
            console.log(`[historical-import] Computed sales 30d for tenant ${mlAcc.company_id}`);
          }
        } catch (err) {
          console.warn('[historical-import] Failed to reevaluate tenant limits:', err);
        }

        // ====== BILLING & COST AUTO-SYNC DISABLED ======
        // All billing/cost calculations are now manual-only to control cloud costs.
        // Users must click "Recalcular" in the Cost module to trigger calculations.
        console.log(`[historical-import] Billing/cost auto-sync DISABLED for ${job.seller_id} — manual-only mode`);

        // Trigger shipment backfill to fill geographic data for ABC cities
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/ml-backfill-shipments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "x-internal-key": SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({ seller_id: job.seller_id, user_id: account.user_id }),
          });
          console.log(`[historical-import] Triggered shipment backfill for ${job.seller_id}`);
        } catch (err) {
          console.error("[historical-import] Failed to trigger shipment backfill:", err);
        }

        return new Response(JSON.stringify({
          ok: true,
          status: "done",
          processed_orders: totalProcessed,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Self-chain for more
      console.log(`[historical-import] Chaining next batch from offset ${offset}`);
      EdgeRuntime.waitUntil(
        fetch(`${SUPABASE_URL}/functions/v1/orders-historical-import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ seller_id: job.seller_id, action: "continue", job_id }),
        }).catch(err => console.error("[historical-import] Chain error:", err))
      );

      return new Response(JSON.stringify({
        ok: true,
        status: "running",
        processed_orders: totalProcessed,
        offset,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[historical-import] Fatal error:", err);
    await logSyncEvent(supabase, {
      action: 'sync_failed',
      entityType: 'orders_sync',
      metadata: { module: 'orders_sync', scope: 'last_12m', error_message: String(err) },
    });
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
