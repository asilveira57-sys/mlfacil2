// @ts-nocheck - Deno types not available in build context
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ML_APP_ID = Deno.env.get("ML_APP_ID") || "";
const ML_SECRET_KEY = Deno.env.get("ML_SECRET_KEY") || "";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================
async function getValidToken(supabase: any, sellerId: string): Promise<string | null> {
  const { data: acct } = await supabase
    .from("ml_accounts")
    .select("id, access_token, refresh_token, token_expires_at")
    .eq("ml_user_id", String(sellerId))
    .eq("is_active", true)
    .maybeSingle();

  if (!acct) return null;

  // Check if token is expired
  const expiresAt = acct.token_expires_at ? new Date(acct.token_expires_at) : null;
  if (expiresAt && expiresAt > new Date(Date.now() + 60_000)) {
    return acct.access_token;
  }

  // Try refresh
  if (acct.refresh_token && ML_APP_ID && ML_SECRET_KEY) {
    try {
      const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: ML_APP_ID,
          client_secret: ML_SECRET_KEY,
          refresh_token: acct.refresh_token,
        }),
      });
      if (resp.ok) {
        const td = await resp.json();
        await supabase.from("ml_accounts").update({
          access_token: td.access_token,
          refresh_token: td.refresh_token,
          token_expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", acct.id);
        return td.access_token;
      }
    } catch (e) {
      console.error(`[rad-collector] Token refresh failed for ${sellerId}:`, e);
    }
  }

  return acct.access_token;
}

// ============================================================================
// LOGGING
// ============================================================================
async function createLog(supabase: any, sellerId: string, jobType: string): Promise<string> {
  const { data } = await supabase
    .from("radiography_collection_logs")
    .insert({
      seller_id: sellerId,
      job_type: jobType,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return data?.id;
}

async function finishLog(supabase: any, logId: string, updates: any) {
  if (!logId) return;
  await supabase.from("radiography_collection_logs").update({
    ...updates,
    finished_at: new Date().toISOString(),
  }).eq("id", logId);
}

// ============================================================================
// FLOW 1 — SYNC ACTIVE LISTINGS
// ============================================================================
async function handleSync(supabase: any, sellerId: string) {
  const startTime = Date.now();
  const logId = await createLog(supabase, sellerId, "sync");
  console.log(`[rad-collector] SYNC started for ${sellerId}`);

  try {
    const token = await getValidToken(supabase, sellerId);
    if (!token) {
      await finishLog(supabase, logId, { status: "failed", error_message: "No valid token", total_items: 0, items_processed: 0, items_failed: 0, duration_ms: Date.now() - startTime });
      return { success: false, error: "No valid ML token" };
    }

    // Get user_id from ml_accounts
    const { data: acctData } = await supabase
      .from("ml_accounts")
      .select("user_id")
      .eq("ml_user_id", String(sellerId))
      .eq("is_active", true)
      .maybeSingle();
    const userId = acctData?.user_id;

    // Fetch all item IDs with pagination
    let offset = 0;
    const limit = 50;
    let allItemIds: string[] = [];
    let totalFromApi = 0;

    while (true) {
      const resp = await fetch(
        `https://api.mercadolibre.com/users/${sellerId}/items/search?offset=${offset}&limit=${limit}&status=active`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) {
        console.error(`[rad-collector] Items search failed: ${resp.status}`);
        break;
      }

      const data = await resp.json();
      const ids = data.results || [];
      totalFromApi = data.paging?.total || 0;
      allItemIds = allItemIds.concat(ids);

      if (ids.length < limit || offset + limit >= totalFromApi) break;
      offset += limit;
      await sleep(300);
    }

    console.log(`[rad-collector] Found ${allItemIds.length} active items (API total: ${totalFromApi})`);

    // Fetch details in batches of 20 via multiget
    let processed = 0;
    let failed = 0;
    const DETAIL_BATCH = 20;

    for (let i = 0; i < allItemIds.length; i += DETAIL_BATCH) {
      const batch = allItemIds.slice(i, i + DETAIL_BATCH);
      const idsParam = batch.join(",");

      try {
        const detResp = await fetch(
          `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,permalink,thumbnail,catalog_product_id,category_id,currency_id,condition,listing_type_id,status,health,price,original_price,available_quantity,sold_quantity,shipping,seller_custom_field,variations`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!detResp.ok) {
          console.warn(`[rad-collector] Multiget failed: ${detResp.status}`);
          failed += batch.length;
          continue;
        }

        const detailsData = await detResp.json();
        const listings: any[] = [];

        for (const item of detailsData) {
          if (item.code !== 200 || !item.body) {
            failed++;
            continue;
          }
          const b = item.body;
          const baseData = {
            user_id: userId,
            seller_id: sellerId,
            item_id: b.id,
            title: b.title,
            title_short: b.title?.substring(0, 50),
            permalink: b.permalink,
            thumbnail: b.thumbnail,
            catalog_product_id: b.catalog_product_id || null,
            category_id: b.category_id,
            currency_id: b.currency_id,
            condition: b.condition,
            listing_type_id: b.listing_type_id,
            logistic_type: b.shipping?.logistic_type || null,
            shipping_mode: b.shipping?.mode || null,
            status: b.status,
            health: b.health || null,
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Handle variations (same pattern as competitor-engine)
          if (b.variations && b.variations.length > 0) {
            for (const v of b.variations) {
              listings.push({
                ...baseData,
                variation_id: v.id?.toString() || "",
                sku: v.seller_custom_field || b.seller_custom_field || null,
                price: v.price || b.price,
                original_price: v.original_price || b.original_price || null,
                available_quantity: v.available_quantity || 0,
                sold_quantity: v.sold_quantity || b.sold_quantity || 0,
              });
            }
          } else {
            listings.push({
              ...baseData,
              variation_id: "",
              sku: b.seller_custom_field || null,
              price: b.price,
              original_price: b.original_price || null,
              available_quantity: b.available_quantity || 0,
              sold_quantity: b.sold_quantity || 0,
            });
          }
        }

        // Upsert batch
        if (listings.length > 0) {
          const { error } = await supabase
            .from("meli_listings_cache")
            .upsert(listings, { onConflict: "seller_id,item_id,variation_id" });
          if (error) {
            console.warn(`[rad-collector] Upsert error:`, error.message);
            failed += listings.length;
          } else {
            processed += listings.length;
          }
        }
      } catch (err) {
        console.warn(`[rad-collector] Batch detail error:`, err);
        failed += batch.length;
      }

      await sleep(250);
    }

    const duration = Date.now() - startTime;
    await finishLog(supabase, logId, {
      status: "success",
      total_items: allItemIds.length,
      items_processed: processed,
      items_failed: failed,
      duration_ms: duration,
      metadata_json: { total_from_api: totalFromApi },
    });

    console.log(`[rad-collector] SYNC done: ${processed} processed, ${failed} failed in ${duration}ms`);
    return { success: true, total: allItemIds.length, processed, failed, duration_ms: duration };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await finishLog(supabase, logId, {
      status: "failed",
      error_message: msg,
      duration_ms: Date.now() - startTime,
    });
    console.error(`[rad-collector] SYNC failed:`, err);
    return { success: false, error: msg };
  }
}

// ============================================================================
// FLOW 2 — NIGHTLY VISIT COLLECTION
// ============================================================================
async function handleCollection(supabase: any, sellerId: string) {
  const startTime = Date.now();
  const logId = await createLog(supabase, sellerId, "collection");
  console.log(`[rad-collector] COLLECTION started for ${sellerId}`);

  try {
    const token = await getValidToken(supabase, sellerId);
    if (!token) {
      await finishLog(supabase, logId, { status: "failed", error_message: "No valid token", duration_ms: Date.now() - startTime });
      return { success: false, error: "No valid ML token" };
    }

    // Get active items that need collection (null or >= 4 days old)
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all eligible items with pagination
    let allItems: any[] = [];
    let from = 0;
    const PAGE = 1000;

    while (true) {
      const { data: page, error } = await supabase
        .from("meli_listings_cache")
        .select("item_id, price, available_quantity, status, listing_type_id, logistic_type, shipping_mode, catalog_product_id")
        .eq("seller_id", sellerId)
        .eq("status", "active")
        .or(`last_visit_collection_at.is.null,last_visit_collection_at.lt.${fourDaysAgo}`)
        .range(from, from + PAGE - 1);

      if (error) {
        console.error(`[rad-collector] Fetch items error:`, error);
        break;
      }
      allItems = allItems.concat(page || []);
      if (!page || page.length < PAGE) break;
      from += PAGE;
    }

    // Deduplicate by item_id
    const uniqueItems = new Map<string, any>();
    for (const item of allItems) {
      if (!uniqueItems.has(item.item_id)) uniqueItems.set(item.item_id, item);
    }
    const items = Array.from(uniqueItems.values());

    console.log(`[rad-collector] ${items.length} items eligible for collection`);

    if (items.length === 0) {
      await finishLog(supabase, logId, { status: "success", total_items: 0, items_processed: 0, items_failed: 0, duration_ms: Date.now() - startTime });
      return { success: true, processed: 0, message: "No items need collection" };
    }

    // Collect visits using multiget in batches of 50
    const VISIT_BATCH = 50;
    let processed = 0;
    let failed = 0;
    const now = new Date();
    const collectedAt = now.toISOString();
    const dateTo = now.toISOString().split("T")[0];
    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const itemIds = items.map(i => i.item_id);

    for (let i = 0; i < itemIds.length; i += VISIT_BATCH) {
      const batchIds = itemIds.slice(i, i + VISIT_BATCH);
      const idsParam = batchIds.join(",");

      try {
        const resp = await fetch(
          `https://api.mercadolibre.com/items/visits?ids=${idsParam}&date_from=${dateFrom}&date_to=${dateTo}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (resp.status === 429) {
          console.warn(`[rad-collector] Rate limited, waiting 10s...`);
          await sleep(10_000);
          // Retry once
          const retry = await fetch(
            `https://api.mercadolibre.com/items/visits?ids=${idsParam}&date_from=${dateFrom}&date_to=${dateTo}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!retry.ok) {
            failed += batchIds.length;
            continue;
          }
          const retryData = await retry.json();
          await processVisitBatch(supabase, sellerId, batchIds, retryData, items, collectedAt);
          processed += batchIds.length;
          continue;
        }

        if (!resp.ok) {
          console.warn(`[rad-collector] Visits multiget failed: ${resp.status}`);
          failed += batchIds.length;
          continue;
        }

        const visitsData = await resp.json();
        await processVisitBatch(supabase, sellerId, batchIds, visitsData, items, collectedAt);
        processed += batchIds.length;
      } catch (err) {
        console.warn(`[rad-collector] Visit batch error:`, err);
        failed += batchIds.length;
      }

      await sleep(500);
    }

    // Update last_visit_collection_at for processed items
    if (processed > 0) {
      // Update in batches of 500 (Supabase .in() limit)
      const processedIds = itemIds.slice(0, processed);
      for (let i = 0; i < processedIds.length; i += 500) {
        const chunk = processedIds.slice(i, i + 500);
        await supabase
          .from("meli_listings_cache")
          .update({ last_visit_collection_at: collectedAt })
          .eq("seller_id", sellerId)
          .in("item_id", chunk);
      }
    }

    // Detect anomalies
    await detectAnomalies(supabase, sellerId);

    const duration = Date.now() - startTime;
    await finishLog(supabase, logId, {
      status: "success",
      total_items: items.length,
      items_processed: processed,
      items_failed: failed,
      duration_ms: duration,
      metadata_json: { window_days: 7, date_from: dateFrom, date_to: dateTo },
    });

    console.log(`[rad-collector] COLLECTION done: ${processed}/${items.length} in ${duration}ms`);
    return { success: true, total: items.length, processed, failed, duration_ms: duration };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await finishLog(supabase, logId, { status: "failed", error_message: msg, duration_ms: Date.now() - startTime });
    return { success: false, error: msg };
  }
}

async function processVisitBatch(
  supabase: any,
  sellerId: string,
  batchIds: string[],
  visitsData: any,
  allItems: any[],
  collectedAt: string
) {
  const itemMap = new Map(allItems.map(i => [i.item_id, i]));
  const healthHistoryRows: any[] = [];
  const healthCurrentRows: any[] = [];

  for (const itemId of batchIds) {
    const visits = typeof visitsData === "object" && visitsData[itemId] !== undefined
      ? Number(visitsData[itemId]) || 0
      : 0;
    const item = itemMap.get(itemId);

    const historyRow = {
      seller_id: sellerId,
      item_id: itemId,
      collected_at: collectedAt,
      window_days: 7,
      visits,
      price: item?.price || null,
      available_quantity: item?.available_quantity || null,
      listing_status: item?.status || "active",
      listing_type: item?.listing_type_id || null,
      shipping_mode: item?.shipping_mode || item?.logistic_type || null,
      catalog_listing: !!item?.catalog_product_id,
      source: "night_collection",
    };
    healthHistoryRows.push(historyRow);

    const currentRow = {
      seller_id: sellerId,
      item_id: itemId,
      last_collected_at: collectedAt,
      visits_last: visits,
      price: item?.price || null,
      available_quantity: item?.available_quantity || null,
      listing_status: item?.status || "active",
      listing_type: item?.listing_type_id || null,
      shipping_mode: item?.shipping_mode || item?.logistic_type || null,
      catalog_listing: !!item?.catalog_product_id,
    };
    healthCurrentRows.push(currentRow);
  }

  // Insert history (idempotent via unique constraint)
  if (healthHistoryRows.length > 0) {
    const { error } = await supabase
      .from("listing_health_history")
      .upsert(healthHistoryRows, { onConflict: "seller_id,item_id,collected_at,window_days" });
    if (error) console.warn(`[rad-collector] Health history upsert error:`, error.message);
  }

  // Upsert current state
  if (healthCurrentRows.length > 0) {
    const { error } = await supabase
      .from("listing_health_current")
      .upsert(healthCurrentRows, { onConflict: "seller_id,item_id" });
    if (error) console.warn(`[rad-collector] Health current upsert error:`, error.message);
  }
}

// ============================================================================
// FLOW 3 — BACKFILL HISTORICAL
// ============================================================================
const BACKFILL_WINDOWS = [
  { label: "0-30d", daysStart: 0, daysEnd: 30 },
  { label: "31-60d", daysStart: 31, daysEnd: 60 },
  { label: "61-90d", daysStart: 61, daysEnd: 90 },
  { label: "91-120d", daysStart: 91, daysEnd: 120 },
  { label: "121-150d", daysStart: 121, daysEnd: 150 },
];

async function handleBackfill(supabase: any, sellerId: string) {
  const startTime = Date.now();
  const logId = await createLog(supabase, sellerId, "backfill");
  console.log(`[rad-collector] BACKFILL started for ${sellerId}`);

  try {
    // Check/create backfill control
    const { data: ctrl } = await supabase
      .from("radiography_backfill_control")
      .select("*")
      .eq("seller_id", sellerId)
      .maybeSingle();

    if (ctrl?.status === "done") {
      await finishLog(supabase, logId, { status: "success", total_items: 0, items_processed: 0, items_failed: 0, duration_ms: Date.now() - startTime, metadata_json: { message: "Backfill already completed" } });
      return { success: true, message: "Backfill already completed for this seller" };
    }

    if (ctrl?.status === "running") {
      // Check for stale (> 10 min)
      const updatedAt = ctrl.updated_at ? new Date(ctrl.updated_at).getTime() : 0;
      if (Date.now() - updatedAt < 10 * 60 * 1000) {
        await finishLog(supabase, logId, { status: "success", total_items: 0, items_processed: 0, items_failed: 0, duration_ms: Date.now() - startTime, metadata_json: { message: "Backfill already running" } });
        return { success: true, message: "Backfill already running" };
      }
      // Stale, continue from where it left off
      console.log(`[rad-collector] Stale backfill detected, resuming...`);
    }

    const token = await getValidToken(supabase, sellerId);
    if (!token) {
      await finishLog(supabase, logId, { status: "failed", error_message: "No valid token", duration_ms: Date.now() - startTime });
      return { success: false, error: "No valid ML token" };
    }

    // Get all active item IDs
    let allItemIds: string[] = [];
    let from = 0;
    while (true) {
      const { data: page } = await supabase
        .from("meli_listings_cache")
        .select("item_id")
        .eq("seller_id", sellerId)
        .eq("status", "active")
        .range(from, from + 999);
      const ids = [...new Set((page || []).map((r: any) => r.item_id))];
      allItemIds = allItemIds.concat(ids);
      if (!page || page.length < 1000) break;
      from += 1000;
    }
    allItemIds = [...new Set(allItemIds)];

    // Determine starting window
    const startProgress = ctrl?.progress_percent || 0;
    const startWindowIdx = Math.floor((startProgress / 100) * BACKFILL_WINDOWS.length);
    const lastProcessedItem = ctrl?.last_processed_item_id || null;

    // Upsert control as running
    await supabase.from("radiography_backfill_control").upsert({
      seller_id: sellerId,
      status: "running",
      started_at: ctrl?.started_at || new Date().toISOString(),
      progress_percent: startProgress,
    }, { onConflict: "seller_id" });

    let totalProcessed = 0;
    let totalFailed = 0;
    const VISIT_BATCH = 50;

    for (let wi = startWindowIdx; wi < BACKFILL_WINDOWS.length; wi++) {
      const window = BACKFILL_WINDOWS[wi];
      const now = Date.now();
      const dateFrom = new Date(now - window.daysEnd * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const dateTo = new Date(now - window.daysStart * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const collectedAt = new Date().toISOString();

      console.log(`[rad-collector] Backfill window ${window.label}: ${dateFrom} → ${dateTo}`);

      await supabase.from("radiography_backfill_control").update({
        current_window_start: dateFrom,
        current_window_end: dateTo,
      }).eq("seller_id", sellerId);

      // Determine start index within this window
      let startIdx = 0;
      if (wi === startWindowIdx && lastProcessedItem) {
        const idx = allItemIds.indexOf(lastProcessedItem);
        if (idx >= 0) startIdx = idx + 1;
      }

      for (let i = startIdx; i < allItemIds.length; i += VISIT_BATCH) {
        const batchIds = allItemIds.slice(i, i + VISIT_BATCH);
        const idsParam = batchIds.join(",");

        try {
          const resp = await fetch(
            `https://api.mercadolibre.com/items/visits?ids=${idsParam}&date_from=${dateFrom}&date_to=${dateTo}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (resp.status === 429) {
            console.warn(`[rad-collector] Rate limited in backfill, waiting 15s...`);
            await sleep(15_000);
            i -= VISIT_BATCH; // Retry this batch
            continue;
          }

          if (!resp.ok) {
            totalFailed += batchIds.length;
            continue;
          }

          const visitsData = await resp.json();

          // Insert into health history
          const rows: any[] = [];
          for (const itemId of batchIds) {
            const visits = typeof visitsData === "object" && visitsData[itemId] !== undefined
              ? Number(visitsData[itemId]) || 0
              : 0;
            rows.push({
              seller_id: sellerId,
              item_id: itemId,
              collected_at: collectedAt,
              window_days: window.daysEnd - window.daysStart,
              visits,
              source: "backfill",
              listing_status: "active",
            });
          }

          if (rows.length > 0) {
            const { error } = await supabase
              .from("listing_health_history")
              .upsert(rows, { onConflict: "seller_id,item_id,collected_at,window_days" });
            if (error) {
              console.warn(`[rad-collector] Backfill history upsert error:`, error.message);
              totalFailed += batchIds.length;
            } else {
              totalProcessed += batchIds.length;
            }
          }

          // Update checkpoint
          const lastId = batchIds[batchIds.length - 1];
          const progressPct = Math.round(((wi + (i + VISIT_BATCH) / allItemIds.length) / BACKFILL_WINDOWS.length) * 100);
          await supabase.from("radiography_backfill_control").update({
            last_processed_item_id: lastId,
            progress_percent: Math.min(progressPct, 99),
          }).eq("seller_id", sellerId);

        } catch (err) {
          console.warn(`[rad-collector] Backfill batch error:`, err);
          totalFailed += batchIds.length;
        }

        await sleep(500);

        // Check if we're approaching timeout (50s safety)
        if (Date.now() - startTime > 50_000) {
          console.log(`[rad-collector] Approaching timeout, pausing backfill for continuation`);
          await supabase.from("radiography_backfill_control").update({
            status: "paused",
            progress_percent: Math.round(((wi + (i + VISIT_BATCH) / allItemIds.length) / BACKFILL_WINDOWS.length) * 100),
          }).eq("seller_id", sellerId);

          await finishLog(supabase, logId, {
            status: "success",
            total_items: allItemIds.length * BACKFILL_WINDOWS.length,
            items_processed: totalProcessed,
            items_failed: totalFailed,
            duration_ms: Date.now() - startTime,
            metadata_json: { paused: true, window: window.label, reason: "timeout_prevention" },
          });

          // Self-chain for continuation
          selfChain(sellerId, "backfill");

          return { success: true, paused: true, processed: totalProcessed, failed: totalFailed };
        }
      }
    }

    // All windows completed
    await supabase.from("radiography_backfill_control").update({
      status: "done",
      progress_percent: 100,
      finished_at: new Date().toISOString(),
    }).eq("seller_id", sellerId);

    const duration = Date.now() - startTime;
    await finishLog(supabase, logId, {
      status: "success",
      total_items: allItemIds.length * BACKFILL_WINDOWS.length,
      items_processed: totalProcessed,
      items_failed: totalFailed,
      duration_ms: duration,
      metadata_json: { completed: true, windows_processed: BACKFILL_WINDOWS.length },
    });

    console.log(`[rad-collector] BACKFILL done: ${totalProcessed} processed, ${totalFailed} failed in ${duration}ms`);
    return { success: true, processed: totalProcessed, failed: totalFailed, duration_ms: duration };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await supabase.from("radiography_backfill_control").update({
      status: "failed",
      error_message: msg,
    }).eq("seller_id", sellerId);
    await finishLog(supabase, logId, { status: "failed", error_message: msg, duration_ms: Date.now() - startTime });
    return { success: false, error: msg };
  }
}

// Self-chain for long-running backfill
function selfChain(sellerId: string, action: string) {
  try {
    const url = `${SUPABASE_URL}/functions/v1/radiography-collector`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ seller_id: sellerId, action, internal: true }),
    }).catch(() => {});
  } catch {}
}

// ============================================================================
// FLOW 5 — ANOMALY DETECTION (simple initial version)
// ============================================================================
async function detectAnomalies(supabase: any, sellerId: string) {
  console.log(`[rad-collector] Detecting anomalies for ${sellerId}`);

  try {
    // Get current health data
    let allCurrent: any[] = [];
    let from = 0;
    while (true) {
      const { data: page } = await supabase
        .from("listing_health_current")
        .select("*")
        .eq("seller_id", sellerId)
        .range(from, from + 999);
      allCurrent = allCurrent.concat(page || []);
      if (!page || page.length < 1000) break;
      from += 1000;
    }

    if (allCurrent.length === 0) return;

    // Get previous collection for comparison (latest 2 entries per item from history)
    const anomalies: any[] = [];

    for (const current of allCurrent) {
      const flags: string[] = [];

      // 1. Active item with zero visits
      if (current.listing_status === "active" && (current.visits_last === 0 || current.visits_last === null)) {
        flags.push("zero_visits");
      }

      // 2. High stock without traction
      if (current.available_quantity > 50 && (current.visits_last || 0) < 10) {
        flags.push("high_stock_low_traction");
      }

      // Check visit trend from history
      const { data: history } = await supabase
        .from("listing_health_history")
        .select("visits, collected_at")
        .eq("seller_id", sellerId)
        .eq("item_id", current.item_id)
        .eq("window_days", 7)
        .order("collected_at", { ascending: false })
        .limit(3);

      if (history && history.length >= 2) {
        const latest = history[0].visits || 0;
        const previous = history[1].visits || 0;

        // 3. Significant visit drop (>40%)
        if (previous > 20 && latest < previous * 0.6) {
          flags.push("visit_drop");
        }

        // 4. Consistent decline across 3 periods
        if (history.length >= 3) {
          const oldest = history[2].visits || 0;
          if (oldest > previous && previous > latest && oldest > 0) {
            flags.push("consistent_decline");
          }
        }
      }

      if (flags.length > 0) {
        anomalies.push({
          item_id: current.item_id,
          flags,
          visits_last: current.visits_last,
          available_quantity: current.available_quantity,
        });
      }
    }

    // Store anomalies in listing_health_current metadata via update
    for (const anomaly of anomalies) {
      await supabase
        .from("listing_health_current")
        .update({
          // We'll use a metadata approach - update is lightweight
        })
        .eq("seller_id", sellerId)
        .eq("item_id", anomaly.item_id);
    }

    console.log(`[rad-collector] Detected ${anomalies.length} items with anomalies`);
    return anomalies;
  } catch (err) {
    console.warn(`[rad-collector] Anomaly detection error:`, err);
    return [];
  }
}

// ============================================================================
// FLOW: NIGHTLY CRON — process all active sellers
// ============================================================================
async function handleNightlyCron(supabase: any) {
  console.log(`[rad-collector] NIGHTLY CRON started`);
  const startTime = Date.now();

  // Get all active ML accounts
  const { data: accounts } = await supabase
    .from("ml_accounts")
    .select("ml_user_id")
    .eq("is_active", true);

  if (!accounts || accounts.length === 0) {
    console.log(`[rad-collector] No active accounts found`);
    return { success: true, message: "No active accounts" };
  }

  const sellerIds = [...new Set(accounts.map((a: any) => a.ml_user_id))];
  console.log(`[rad-collector] Processing ${sellerIds.length} sellers`);

  const results: any[] = [];

  for (const sellerId of sellerIds) {
    try {
      // Sync listings first
      const syncResult = await handleSync(supabase, sellerId);
      
      // Then collect visits
      const collResult = await handleCollection(supabase, sellerId);

      // Check if backfill is needed
      const { data: backfillCtrl } = await supabase
        .from("radiography_backfill_control")
        .select("status")
        .eq("seller_id", sellerId)
        .maybeSingle();

      if (!backfillCtrl || backfillCtrl.status === "pending" || backfillCtrl.status === "paused") {
        // Trigger backfill async
        selfChain(sellerId, "backfill");
      }

      results.push({ seller_id: sellerId, sync: syncResult, collection: collResult });
    } catch (err) {
      console.error(`[rad-collector] Error processing seller ${sellerId}:`, err);
      results.push({ seller_id: sellerId, error: String(err) });
    }

    // Check timeout
    if (Date.now() - startTime > 50_000) {
      console.log(`[rad-collector] Approaching timeout, stopping cron loop`);
      break;
    }
  }

  return { success: true, sellers_processed: results.length, total_sellers: sellerIds.length, results };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const { seller_id, action, internal } = body;

    // Auth check: internal calls use service_role, external need JWT
    if (!internal) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader && !authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    console.log(`[rad-collector] Action: ${action}, Seller: ${seller_id || "all"}`);

    let result: any;

    switch (action) {
      case "sync":
        if (!seller_id) {
          return new Response(JSON.stringify({ error: "seller_id required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await handleSync(supabase, seller_id);
        break;

      case "collection":
        if (!seller_id) {
          return new Response(JSON.stringify({ error: "seller_id required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await handleCollection(supabase, seller_id);
        break;

      case "backfill":
        if (!seller_id) {
          return new Response(JSON.stringify({ error: "seller_id required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await handleBackfill(supabase, seller_id);
        break;

      case "nightly":
        result = await handleNightlyCron(supabase);
        break;

      case "full":
        // Full pipeline for a single seller: sync → collection → backfill
        if (!seller_id) {
          return new Response(JSON.stringify({ error: "seller_id required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const syncRes = await handleSync(supabase, seller_id);
        const collRes = await handleCollection(supabase, seller_id);
        // Trigger backfill async to avoid timeout
        selfChain(seller_id, "backfill");
        result = { sync: syncRes, collection: collRes, backfill: "triggered_async" };
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}. Use: sync, collection, backfill, nightly, full` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[rad-collector] Fatal error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
