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

// Safety timeout for edge function (50s to leave margin)
const SAFETY_TIMEOUT_MS = 50_000;

function parseVisitsValue(itemId: string, payload: any, depth = 0): number {
  if (depth > 3) return 0;
  if (payload == null) return 0;
  if (typeof payload === "number") return Number(payload) || 0;

  if (Array.isArray(payload)) {
    if (payload.length === 0) return 0;

    for (const entry of payload) {
      if (typeof entry === "number") return Number(entry) || 0;
      if (entry?.id === itemId) return parseVisitsValue(itemId, entry, depth + 1);
      if (entry?.body && (entry.body.id === itemId || entry.id === itemId)) {
        return parseVisitsValue(itemId, entry.body, depth + 1);
      }
    }

    return parseVisitsValue(itemId, payload[0], depth + 1);
  }

  if (typeof payload === "object") {
    if (typeof payload[itemId] === "number") return Number(payload[itemId]) || 0;
    if (typeof payload.visits === "number") return Number(payload.visits) || 0;
    if (typeof payload.total_visits === "number") return Number(payload.total_visits) || 0;
    if (typeof payload.value === "number") return Number(payload.value) || 0;
    if (payload.body !== undefined) return parseVisitsValue(itemId, payload.body, depth + 1);
    if (Array.isArray(payload.results)) return parseVisitsValue(itemId, payload.results, depth + 1);
  }

  return 0;
}

async function fetchVisitsForItems(
  token: string,
  itemIds: string[],
  dateFrom: string,
  dateTo: string,
  context: "collection" | "backfill"
) {
  const CONCURRENCY = 8;
  const visitsMap: Record<string, number> = {};
  const failedIds: string[] = [];
  const statusCounts: Record<string, number> = {};
  let validVisitsCount = 0;
  let payloadsReceived = 0;

  for (let i = 0; i < itemIds.length; i += CONCURRENCY) {
    const slice = itemIds.slice(i, i + CONCURRENCY);

    const settled = await Promise.all(
      slice.map(async (itemId) => {
        const url = `https://api.mercadolibre.com/items/visits?ids=${encodeURIComponent(itemId)}&date_from=${dateFrom}&date_to=${dateTo}`;

        let resp = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (resp.status === 429) {
          await sleep(4_000);
          resp = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          return { itemId, ok: false, status: resp.status, body };
        }

        const json = await resp.json();
        const visits = parseVisitsValue(itemId, json);
        return { itemId, ok: true, status: resp.status, visits };
      })
    );

    for (const result of settled) {
      const statusKey = String(result.status);
      statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;

      if (!result.ok) {
        failedIds.push(result.itemId);
        console.warn(
          `[rad-collector] ${context} visit fetch failed for ${result.itemId}: ${result.status} — ${String(result.body || "").slice(0, 160)}`
        );
        continue;
      }

      payloadsReceived += 1;
      visitsMap[result.itemId] = Number(result.visits) || 0;
      validVisitsCount += 1;
    }

    await sleep(180);
  }

  console.log(
    `[rad-collector] ${context} batch summary: ids=${itemIds.join(",")}, http=${JSON.stringify(statusCounts)}, received=${payloadsReceived}, valid=${validVisitsCount}, failed=${failedIds.length}`
  );

  return {
    visitsMap,
    failedIds,
    successIds: Object.keys(visitsMap),
    validVisitsCount,
    payloadsReceived,
  };
}

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

  const expiresAt = acct.token_expires_at ? new Date(acct.token_expires_at) : null;
  if (expiresAt && expiresAt > new Date(Date.now() + 60_000)) {
    return acct.access_token;
  }

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
// SELF-CHAIN (with concurrency guard)
// ============================================================================
function selfChain(sellerId: string | null, action: string, extra: any = {}) {
  try {
    const url = `${SUPABASE_URL}/functions/v1/radiography-collector`;
    const body: any = { action, internal: true, ...extra };
    if (sellerId) body.seller_id = sellerId;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {}
}

// ============================================================================
// FLOW 1 — SYNC ACTIVE LISTINGS
// ============================================================================
async function handleSync(supabase: any, sellerId: string, startTime: number) {
  const logId = await createLog(supabase, sellerId, "sync");
  console.log(`[rad-collector] SYNC started for ${sellerId}`);

  try {
    const token = await getValidToken(supabase, sellerId);
    if (!token) {
      await finishLog(supabase, logId, { status: "failed", error_message: "No valid token", total_items: 0, items_processed: 0, items_failed: 0, duration_ms: Date.now() - startTime });
      return { success: false, error: "No valid ML token" };
    }

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
          if (item.code !== 200 || !item.body) { failed++; continue; }
          const b = item.body;
          const baseData = {
            user_id: userId, seller_id: sellerId, item_id: b.id,
            title: b.title, title_short: b.title?.substring(0, 50),
            permalink: b.permalink, thumbnail: b.thumbnail,
            catalog_product_id: b.catalog_product_id || null,
            category_id: b.category_id, currency_id: b.currency_id,
            condition: b.condition, listing_type_id: b.listing_type_id,
            logistic_type: b.shipping?.logistic_type || null,
            shipping_mode: b.shipping?.mode || null,
            status: b.status, health: b.health || null,
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

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
              ...baseData, variation_id: "",
              sku: b.seller_custom_field || null, price: b.price,
              original_price: b.original_price || null,
              available_quantity: b.available_quantity || 0,
              sold_quantity: b.sold_quantity || 0,
            });
          }
        }

        if (listings.length > 0) {
          const { error } = await supabase
            .from("meli_listings_cache")
            .upsert(listings, { onConflict: "seller_id,item_id,variation_id" });
          if (error) { console.warn(`[rad-collector] Upsert error:`, error.message); failed += listings.length; }
          else { processed += listings.length; }
        }
      } catch (err) {
        console.warn(`[rad-collector] Batch detail error:`, err);
        failed += batch.length;
      }

      await sleep(250);
    }

    const duration = Date.now() - startTime;
    await finishLog(supabase, logId, {
      status: "success", total_items: allItemIds.length,
      items_processed: processed, items_failed: failed,
      duration_ms: duration, metadata_json: { total_from_api: totalFromApi },
    });

    console.log(`[rad-collector] SYNC done: ${processed} processed, ${failed} failed in ${duration}ms`);
    return { success: true, total: allItemIds.length, processed, failed, duration_ms: duration };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await finishLog(supabase, logId, { status: "failed", error_message: msg, duration_ms: Date.now() - startTime });
    console.error(`[rad-collector] SYNC failed:`, err);
    return { success: false, error: msg };
  }
}

// ============================================================================
// FLOW 2 — VISIT COLLECTION
// ============================================================================
async function handleCollection(supabase: any, sellerId: string, startTime: number, startIndex = 0) {
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

      if (error) { console.error(`[rad-collector] Fetch items error:`, error); break; }
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

    // Normalize collected_at to minute precision for idempotency
    const now = new Date();
    now.setSeconds(0, 0);
    const collectedAt = now.toISOString();
    const dateTo = now.toISOString().split("T")[0];
    const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const itemIds = items.map(i => i.item_id);

    const VISIT_BATCH = 40;
    let processed = 0;
    let failed = 0;
    const processedItemIds: string[] = [];

    for (let i = startIndex; i < itemIds.length; i += VISIT_BATCH) {
      const batchIds = itemIds.slice(i, i + VISIT_BATCH);

      try {
        const visitResult = await fetchVisitsForItems(token, batchIds, dateFrom, dateTo, "collection");

        if (visitResult.successIds.length === 0) {
          failed += batchIds.length;
          continue;
        }

        const persistResult = await processVisitBatch(
          supabase,
          sellerId,
          visitResult.successIds,
          visitResult.visitsMap,
          items,
          collectedAt
        );

        processed += persistResult.persisted;
        failed += visitResult.failedIds.length + persistResult.failed;
        processedItemIds.push(...persistResult.persistedItemIds);

        if (persistResult.persistedItemIds.length > 0) {
          await supabase
            .from("meli_listings_cache")
            .update({ last_visit_collection_at: collectedAt })
            .eq("seller_id", sellerId)
            .in("item_id", persistResult.persistedItemIds);
        }

        console.log(
          `[rad-collector] collection persist summary: batch=${batchIds.length}, persisted=${persistResult.persisted}, failed=${visitResult.failedIds.length + persistResult.failed}`
        );
      } catch (err) {
        console.warn(`[rad-collector] Visit batch error:`, err);
        failed += batchIds.length;
      }

      await sleep(500);

      if (Date.now() - startTime > SAFETY_TIMEOUT_MS) {
        await finishLog(supabase, logId, {
          status: "success",
          total_items: items.length,
          items_processed: processed,
          items_failed: failed,
          duration_ms: Date.now() - startTime,
          metadata_json: {
            paused: true,
            next_start_index: i + VISIT_BATCH,
            window_days: 7,
            date_from: dateFrom,
            date_to: dateTo,
          },
        });

        selfChain(sellerId, "collection", { start_index: i + VISIT_BATCH });
        return { success: true, paused: true, processed, failed, next_start_index: i + VISIT_BATCH };
      }
    }

    // Detect anomalies only on the processed items (optimized)
    await detectAnomalies(supabase, sellerId, processedItemIds);

    // SEO analysis (after anomalies, using processed items)
    await analyzeSeoForItems(supabase, sellerId, processedItemIds, null);

    const duration = Date.now() - startTime;
    const finalStatus = processed === 0 && failed > 0 ? "failed" : "success";
    await finishLog(supabase, logId, {
      status: finalStatus,
      error_message: finalStatus === "failed" ? `Collection failed for all eligible items (${failed})` : null,
      total_items: items.length,
      items_processed: processed, items_failed: failed,
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

// Fetch sales data for a batch of item_ids from meli_order_items_cache
async function fetchSalesData(
  supabase: any, sellerId: string, itemIds: string[]
): Promise<Record<string, { sales_7d: number; units_7d: number; sales_30d: number; units_30d: number; last_sale_at: string | null }>> {
  const result: Record<string, any> = {};
  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all order items for these item_ids in the last 30 days (batched)
  let allOrderItems: any[] = [];
  for (let i = 0; i < itemIds.length; i += 500) {
    const chunk = itemIds.slice(i, i + 500);
    const { data } = await supabase
      .from("meli_order_items_cache")
      .select("item_id, quantity, created_at_meli")
      .eq("seller_id", sellerId)
      .in("item_id", chunk)
      .gte("created_at_meli", d30);
    allOrderItems = allOrderItems.concat(data || []);
  }

  // Also fetch last sale ever for each item (single query for max date)
  let lastSaleItems: any[] = [];
  for (let i = 0; i < itemIds.length; i += 500) {
    const chunk = itemIds.slice(i, i + 500);
    const { data } = await supabase
      .from("meli_order_items_cache")
      .select("item_id, created_at_meli")
      .eq("seller_id", sellerId)
      .in("item_id", chunk)
      .order("created_at_meli", { ascending: false });
    lastSaleItems = lastSaleItems.concat(data || []);
  }

  // Build last_sale map (first occurrence per item since ordered desc)
  const lastSaleMap = new Map<string, string>();
  for (const row of lastSaleItems) {
    if (!lastSaleMap.has(row.item_id)) {
      lastSaleMap.set(row.item_id, row.created_at_meli);
    }
  }

  // Initialize all items
  for (const id of itemIds) {
    result[id] = { sales_7d: 0, units_7d: 0, sales_30d: 0, units_30d: 0, last_sale_at: lastSaleMap.get(id) || null };
  }

  // Aggregate
  for (const row of allOrderItems) {
    const entry = result[row.item_id];
    if (!entry) continue;
    const qty = row.quantity || 1;
    entry.sales_30d += 1;
    entry.units_30d += qty;
    if (row.created_at_meli >= d7) {
      entry.sales_7d += 1;
      entry.units_7d += qty;
    }
  }

  return result;
}

// Detect changes between previous and new state
function detectChanges(
  prev: any | null,
  newPrice: number | null,
  newVisits: number,
  newStock: number | null,
  newStatus: string,
  newShippingMode: string | null,
  newCatalogListing: boolean
): any[] {
  if (!prev) return [];
  const changes: any[] = [];

  // Price changes
  if (prev.price != null && newPrice != null && prev.price !== newPrice) {
    const pctChange = ((newPrice - prev.price) / prev.price) * 100;
    if (newPrice > prev.price) {
      changes.push({
        type: "price_increased",
        label: "Preço aumentou",
        detail: `R$ ${prev.price.toFixed(2)} → R$ ${newPrice.toFixed(2)} (${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}%)`,
        severity: pctChange > 15 ? "high" : "medium",
        prev_value: prev.price,
        new_value: newPrice,
        pct_change: Number(pctChange.toFixed(1)),
      });
    } else {
      changes.push({
        type: "price_decreased",
        label: "Preço diminuiu",
        detail: `R$ ${prev.price.toFixed(2)} → R$ ${newPrice.toFixed(2)} (${pctChange.toFixed(1)}%)`,
        severity: Math.abs(pctChange) > 15 ? "high" : "medium",
        prev_value: prev.price,
        new_value: newPrice,
        pct_change: Number(pctChange.toFixed(1)),
      });
    }
  }

  // Stock changes
  if (prev.available_quantity != null && newStock != null && prev.available_quantity !== newStock) {
    const diff = newStock - prev.available_quantity;
    if (newStock === 0 && prev.available_quantity > 0) {
      changes.push({ type: "stock_zeroed", label: "Estoque zerou", detail: `${prev.available_quantity} → 0`, severity: "critical", prev_value: prev.available_quantity, new_value: 0 });
    } else if (diff < 0) {
      changes.push({ type: "stock_decreased", label: "Estoque diminuiu", detail: `${prev.available_quantity} → ${newStock} (${diff})`, severity: Math.abs(diff) > 10 ? "medium" : "low", prev_value: prev.available_quantity, new_value: newStock });
    } else {
      changes.push({ type: "stock_increased", label: "Estoque aumentou", detail: `${prev.available_quantity} → ${newStock} (+${diff})`, severity: "info", prev_value: prev.available_quantity, new_value: newStock });
    }
  }

  // Status changes
  if (prev.listing_status && newStatus && prev.listing_status !== newStatus) {
    changes.push({ type: "status_changed", label: "Status mudou", detail: `${prev.listing_status} → ${newStatus}`, severity: newStatus === "paused" || newStatus === "closed" ? "high" : "medium", prev_value: prev.listing_status, new_value: newStatus });
  }

  // Shipping/logistics changes
  if (prev.shipping_mode && newShippingMode && prev.shipping_mode !== newShippingMode) {
    changes.push({ type: "logistics_changed", label: "Logística mudou", detail: `${prev.shipping_mode} → ${newShippingMode}`, severity: "medium", prev_value: prev.shipping_mode, new_value: newShippingMode });
  }

  // Catalog changes
  if (prev.catalog_listing !== null && prev.catalog_listing !== newCatalogListing) {
    changes.push({
      type: newCatalogListing ? "catalog_joined" : "catalog_left",
      label: newCatalogListing ? "Entrou no catálogo" : "Saiu do catálogo",
      detail: newCatalogListing ? "Anúncio vinculado ao catálogo" : "Anúncio desvinculado do catálogo",
      severity: "medium",
      prev_value: prev.catalog_listing,
      new_value: newCatalogListing,
    });
  }

  // Visit trend (significant drop)
  if (prev.visits_last != null && prev.visits_last > 10 && newVisits < prev.visits_last * 0.5) {
    const pctDrop = ((newVisits - prev.visits_last) / prev.visits_last) * 100;
    changes.push({
      type: "visits_dropped",
      label: "Queda de visitas",
      detail: `${prev.visits_last} → ${newVisits} (${pctDrop.toFixed(0)}%)`,
      severity: Math.abs(pctDrop) > 60 ? "high" : "medium",
      prev_value: prev.visits_last,
      new_value: newVisits,
      pct_change: Number(pctDrop.toFixed(1)),
    });
  }

  return changes;
}

async function processVisitBatch(
  supabase: any, sellerId: string, batchIds: string[],
  visitsData: any, allItems: any[], collectedAt: string
) {
  const itemMap = new Map(allItems.map(i => [i.item_id, i]));

  // Fetch sales data for this batch
  const salesData = await fetchSalesData(supabase, sellerId, batchIds);

  // Fetch previous state for change detection (batched)
  const prevStateMap = new Map<string, any>();
  for (let i = 0; i < batchIds.length; i += 500) {
    const chunk = batchIds.slice(i, i + 500);
    const { data: prevRows } = await supabase
      .from("listing_health_current")
      .select("item_id, price, visits_last, available_quantity, listing_status, shipping_mode, catalog_listing")
      .eq("seller_id", sellerId)
      .in("item_id", chunk);
    if (prevRows) {
      for (const row of prevRows) {
        prevStateMap.set(row.item_id, row);
      }
    }
  }

  const healthHistoryRows: any[] = [];
  const healthCurrentRows: any[] = [];

  for (const itemId of batchIds) {
    const visits = typeof visitsData === "object" && visitsData[itemId] !== undefined
      ? Number(visitsData[itemId]) || 0 : 0;
    const item = itemMap.get(itemId);
    const sales = salesData[itemId] || { sales_7d: 0, units_7d: 0, sales_30d: 0, units_30d: 0, last_sale_at: null };

    // Calculate days without sale
    const daysWithoutSale = sales.last_sale_at
      ? Math.floor((Date.now() - new Date(sales.last_sale_at).getTime()) / (24 * 60 * 60 * 1000))
      : null;

    // Conversion rate: sales_7d / visits (if visits > 0)
    const conversionRate7d = visits > 0 ? Number(((sales.sales_7d / visits) * 100).toFixed(3)) : 0;

    const newPrice = item?.price || null;
    const newStock = item?.available_quantity ?? null;
    const newStatus = item?.status || "active";
    const newShippingMode = item?.shipping_mode || item?.logistic_type || null;
    const newCatalogListing = !!item?.catalog_product_id;

    // Detect changes against previous state
    const prevState = prevStateMap.get(itemId);
    const changeFlags = detectChanges(prevState, newPrice, visits, newStock, newStatus, newShippingMode, newCatalogListing);

    healthHistoryRows.push({
      seller_id: sellerId, item_id: itemId, collected_at: collectedAt,
      window_days: 7, visits,
      price: newPrice, available_quantity: newStock,
      listing_status: newStatus,
      listing_type: item?.listing_type_id || null,
      shipping_mode: newShippingMode,
      catalog_listing: newCatalogListing,
      source: "night_collection",
      sales_count: sales.sales_7d,
      units_sold: sales.units_7d,
      days_without_sale: daysWithoutSale,
      last_sale_at: sales.last_sale_at,
    });

    healthCurrentRows.push({
      seller_id: sellerId, item_id: itemId,
      last_collected_at: collectedAt, visits_last: visits,
      price: newPrice, available_quantity: newStock,
      listing_status: newStatus,
      listing_type: item?.listing_type_id || null,
      shipping_mode: newShippingMode,
      catalog_listing: newCatalogListing,
      sales_count_7d: sales.sales_7d,
      units_sold_7d: sales.units_7d,
      sales_count_30d: sales.sales_30d,
      units_sold_30d: sales.units_30d,
      conversion_rate_7d: conversionRate7d,
      days_without_sale: daysWithoutSale,
      last_sale_at: sales.last_sale_at,
      change_flags: changeFlags,
      // Store previous values for next comparison
      prev_price: prevState?.price ?? null,
      prev_visits: prevState?.visits_last ?? null,
      prev_available_quantity: prevState?.available_quantity ?? null,
      prev_listing_status: prevState?.listing_status ?? null,
      prev_shipping_mode: prevState?.shipping_mode ?? null,
      prev_catalog_listing: prevState?.catalog_listing ?? null,
    });
  }

  if (healthHistoryRows.length > 0) {
    const { error } = await supabase
      .from("listing_health_history")
      .upsert(healthHistoryRows, { onConflict: "seller_id,item_id,collected_at,window_days" });
    if (error) throw new Error(`Health history upsert error: ${error.message}`);
  }

  if (healthCurrentRows.length > 0) {
    const { error } = await supabase
      .from("listing_health_current")
      .upsert(healthCurrentRows, { onConflict: "seller_id,item_id" });
    if (error) throw new Error(`Health current upsert error: ${error.message}`);
  }

  const totalChanges = healthCurrentRows.reduce((sum, r) => sum + (r.change_flags?.length || 0), 0);
  if (totalChanges > 0) {
    console.log(`[rad-collector] Changes detected: ${totalChanges} across ${healthCurrentRows.filter(r => r.change_flags?.length > 0).length} items`);
  }

  return {
    persisted: healthHistoryRows.length,
    failed: 0,
    persistedItemIds: batchIds,
    historyRows: healthHistoryRows.length,
    currentRows: healthCurrentRows.length,
    changesDetected: totalChanges,
  };
}

// ============================================================================
// FLOW 3 — BACKFILL HISTORICAL (with safe self-chain)
// ============================================================================
const BACKFILL_WINDOWS = [
  { label: "0-30d", daysStart: 0, daysEnd: 30 },
  { label: "31-60d", daysStart: 31, daysEnd: 60 },
  { label: "61-90d", daysStart: 61, daysEnd: 90 },
  { label: "91-120d", daysStart: 91, daysEnd: 120 },
  { label: "121-150d", daysStart: 121, daysEnd: 150 },
];

// Max self-chain depth to prevent infinite loops
const MAX_BACKFILL_CHAINS = 30; // 5 windows * ~3-4 chunks each max

async function handleBackfill(supabase: any, sellerId: string, chainDepth: number = 0) {
  const startTime = Date.now();
  const logId = await createLog(supabase, sellerId, "backfill");
  console.log(`[rad-collector] BACKFILL started for ${sellerId} (chain depth: ${chainDepth})`);

  // Guard: prevent infinite self-chain
  if (chainDepth > MAX_BACKFILL_CHAINS) {
    console.error(`[rad-collector] BACKFILL exceeded max chain depth (${MAX_BACKFILL_CHAINS}), stopping.`);
    await supabase.from("radiography_backfill_control").update({
      status: "failed", error_message: `Exceeded max chain depth (${MAX_BACKFILL_CHAINS})`,
    }).eq("seller_id", sellerId);
    await finishLog(supabase, logId, { status: "failed", error_message: "Max chain depth exceeded", duration_ms: Date.now() - startTime });
    return { success: false, error: "Max chain depth exceeded" };
  }

  try {
    const { data: ctrl } = await supabase
      .from("radiography_backfill_control")
      .select("*")
      .eq("seller_id", sellerId)
      .maybeSingle();

    if (ctrl?.status === "done") {
      await finishLog(supabase, logId, { status: "success", total_items: 0, items_processed: 0, items_failed: 0, duration_ms: Date.now() - startTime, metadata_json: { message: "Backfill already completed" } });
      return { success: true, message: "Backfill already completed for this seller" };
    }

    // Concurrency guard: only allow if paused/pending/failed or stale running
    if (ctrl?.status === "running") {
      const updatedAt = ctrl.updated_at ? new Date(ctrl.updated_at).getTime() : 0;
      if (Date.now() - updatedAt < 10 * 60 * 1000) {
        await finishLog(supabase, logId, { status: "success", total_items: 0, items_processed: 0, items_failed: 0, duration_ms: Date.now() - startTime, metadata_json: { message: "Backfill already running (not stale)" } });
        return { success: true, message: "Backfill already running" };
      }
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

    const startProgress = ctrl?.progress_percent || 0;
    const startWindowIdx = Math.floor((startProgress / 100) * BACKFILL_WINDOWS.length);
    const lastProcessedItem = ctrl?.last_processed_item_id || null;

    // Mark as running with heartbeat
    await supabase.from("radiography_backfill_control").upsert({
      seller_id: sellerId,
      status: "running",
      started_at: ctrl?.started_at || new Date().toISOString(),
      progress_percent: startProgress,
      error_message: null,
    }, { onConflict: "seller_id" });

    let totalProcessed = 0;
    let totalFailed = 0;
    const VISIT_BATCH = 40;

    for (let wi = startWindowIdx; wi < BACKFILL_WINDOWS.length; wi++) {
      const window = BACKFILL_WINDOWS[wi];
      const now = Date.now();
      const dateFrom = new Date(now - window.daysEnd * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const dateTo = new Date(now - window.daysStart * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      
      // Use the window end date as collected_at (not "now") for proper historical timeline
      const collectedAt = new Date(dateTo + "T12:00:00.000Z").toISOString();

      console.log(`[rad-collector] Backfill window ${window.label}: ${dateFrom} → ${dateTo}`);

      await supabase.from("radiography_backfill_control").update({
        current_window_start: dateFrom,
        current_window_end: dateTo,
      }).eq("seller_id", sellerId);

      let startIdx = 0;
      if (wi === startWindowIdx && lastProcessedItem) {
        const idx = allItemIds.indexOf(lastProcessedItem);
        if (idx >= 0) startIdx = idx + 1;
      }

      for (let i = startIdx; i < allItemIds.length; i += VISIT_BATCH) {
        const batchIds = allItemIds.slice(i, i + VISIT_BATCH);

        try {
          const visitResult = await fetchVisitsForItems(token, batchIds, dateFrom, dateTo, "backfill");

          if (visitResult.successIds.length === 0) {
            totalFailed += batchIds.length;
            continue;
          }

          const rows: any[] = [];
          for (const itemId of visitResult.successIds) {
            const visits = Number(visitResult.visitsMap[itemId]) || 0;
            rows.push({
              seller_id: sellerId, item_id: itemId, collected_at: collectedAt,
              window_days: window.daysEnd - window.daysStart,
              visits, source: "backfill", listing_status: "active",
            });
          }

          if (rows.length > 0) {
            const { error } = await supabase
              .from("listing_health_history")
              .upsert(rows, { onConflict: "seller_id,item_id,collected_at,window_days" });
            if (error) {
              console.warn(`[rad-collector] Backfill history upsert error:`, error.message);
              totalFailed += rows.length;
            }
            else {
              totalProcessed += rows.length;
              totalFailed += visitResult.failedIds.length;
            }

            console.log(
              `[rad-collector] backfill persist summary: batch=${batchIds.length}, persisted=${rows.length}, failed=${visitResult.failedIds.length}`
            );
          }

          // Update checkpoint + heartbeat
          const lastId = batchIds[batchIds.length - 1];
          const progressPct = Math.round(((wi + (i + VISIT_BATCH) / allItemIds.length) / BACKFILL_WINDOWS.length) * 100);
          await supabase.from("radiography_backfill_control").update({
            last_processed_item_id: lastId,
            progress_percent: Math.min(progressPct, 99),
            updated_at: new Date().toISOString(), // heartbeat
          }).eq("seller_id", sellerId);

        } catch (err) {
          console.warn(`[rad-collector] Backfill batch error:`, err);
          totalFailed += batchIds.length;
        }

        await sleep(500);

        // Timeout check → pause and self-chain with incremented depth
        if (Date.now() - startTime > SAFETY_TIMEOUT_MS) {
          console.log(`[rad-collector] Approaching timeout, pausing backfill for continuation (chain ${chainDepth})`);
          const pauseProgress = Math.round(((wi + (i + VISIT_BATCH) / allItemIds.length) / BACKFILL_WINDOWS.length) * 100);
          await supabase.from("radiography_backfill_control").update({
            status: "paused",
            progress_percent: Math.min(pauseProgress, 99),
          }).eq("seller_id", sellerId);

          await finishLog(supabase, logId, {
            status: "success",
            total_items: allItemIds.length * BACKFILL_WINDOWS.length,
            items_processed: totalProcessed, items_failed: totalFailed,
            duration_ms: Date.now() - startTime,
            metadata_json: { paused: true, window: window.label, chain_depth: chainDepth },
          });

          // Self-chain with incremented depth
          selfChain(sellerId, "backfill", { chain_depth: chainDepth + 1 });
          return { success: true, paused: true, processed: totalProcessed, failed: totalFailed };
        }
      }
    }

    // All windows completed
    const backfillFinalStatus = totalProcessed === 0 && totalFailed > 0 ? "failed" : "done";
    await supabase.from("radiography_backfill_control").update({
      status: backfillFinalStatus,
      progress_percent: backfillFinalStatus === "done" ? 100 : ctrl?.progress_percent || 0,
      finished_at: backfillFinalStatus === "done" ? new Date().toISOString() : null,
      error_message: backfillFinalStatus === "failed" ? `Backfill failed for all attempted items (${totalFailed})` : null,
    }).eq("seller_id", sellerId);

    const duration = Date.now() - startTime;
    await finishLog(supabase, logId, {
      status: backfillFinalStatus === "done" ? "success" : "failed",
      error_message: backfillFinalStatus === "failed" ? `Backfill failed for all attempted items (${totalFailed})` : null,
      total_items: allItemIds.length * BACKFILL_WINDOWS.length,
      items_processed: totalProcessed, items_failed: totalFailed,
      duration_ms: duration,
      metadata_json: { completed: true, windows_processed: BACKFILL_WINDOWS.length, chain_depth: chainDepth },
    });

    console.log(`[rad-collector] BACKFILL done: ${totalProcessed} processed, ${totalFailed} failed in ${duration}ms`);
    return { success: true, processed: totalProcessed, failed: totalFailed, duration_ms: duration };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await supabase.from("radiography_backfill_control").update({
      status: "failed", error_message: msg,
    }).eq("seller_id", sellerId);
    await finishLog(supabase, logId, { status: "failed", error_message: msg, duration_ms: Date.now() - startTime });
    return { success: false, error: msg };
  }
}

// ============================================================================
// FLOW 5 — OPTIMIZED ANOMALY DETECTION (scoped to processed items)
// ============================================================================
// Build structured alert with context and explanation
function buildAlert(
  type: string,
  current: any,
  history: any[]
): { type: string; severity: string; title: string; description: string; context: Record<string, any> } | null {
  switch (type) {
    case "zero_visits":
      return {
        type, severity: "high",
        title: "Sem visitas no período",
        description: "Este anúncio não recebeu nenhuma visita na última janela de coleta. Verifique se o anúncio está ativo, se o título está claro e se há problemas de posicionamento.",
        context: { visits: 0, status: current.listing_status },
      };
    case "visit_drop": {
      const latest = history[0]?.visits || 0;
      const previous = history[1]?.visits || 0;
      const pct = previous > 0 ? Math.round(((latest - previous) / previous) * 100) : 0;
      return {
        type, severity: "high",
        title: "Queda acentuada de visitas",
        description: `As visitas caíram ${Math.abs(pct)}% em relação à coleta anterior (de ${previous} para ${latest}). Isso pode indicar perda de posicionamento, mudança de preço ou concorrência.`,
        context: { visits_current: latest, visits_previous: previous, pct_change: pct },
      };
    }
    case "consistent_decline": {
      const v = history.map(h => h.visits || 0);
      return {
        type, severity: "critical",
        title: "Declínio consistente de tráfego",
        description: `As visitas estão em queda contínua nas últimas 3 coletas (${v.reverse().join(" → ")}). Recomenda-se revisar preço, título, fotos e posicionamento competitivo.`,
        context: { visits_sequence: v },
      };
    }
    case "high_stock_low_traction":
      return {
        type, severity: "medium",
        title: "Estoque alto sem tração",
        description: `O anúncio tem ${current.available_quantity} unidades em estoque mas recebeu apenas ${current.visits_last || 0} visitas. Considere revisar preço ou investir em publicidade.`,
        context: { stock: current.available_quantity, visits: current.visits_last },
      };
    case "no_sales_30d":
      return {
        type, severity: "high",
        title: "Sem vendas há mais de 30 dias",
        description: `Este anúncio está há ${current.days_without_sale || "30+"} dias sem venda. Avalie se o preço está competitivo e se o anúncio precisa de atualização.`,
        context: { days_without_sale: current.days_without_sale, last_sale_at: current.last_sale_at },
      };
    case "no_sales_14d":
      return {
        type, severity: "medium",
        title: "Sem vendas há mais de 14 dias",
        description: `Anúncio sem venda há ${current.days_without_sale} dias. Monitore de perto — pode ser sazonal ou indicar necessidade de ajuste.`,
        context: { days_without_sale: current.days_without_sale },
      };
    case "visits_no_conversion":
      return {
        type, severity: "high",
        title: "Visitas sem conversão",
        description: `O anúncio recebeu ${current.visits_last} visitas mas não gerou vendas nos últimos 7 dias. O problema pode estar no preço, fotos, descrição ou reputação.`,
        context: { visits: current.visits_last, sales_7d: current.sales_count_7d },
      };
    case "low_conversion":
      return {
        type, severity: "medium",
        title: "Taxa de conversão muito baixa",
        description: `A taxa de conversão está em ${(current.conversion_rate_7d || 0).toFixed(2)}% (${current.sales_count_7d || 0} vendas de ${current.visits_last} visitas). O ideal é acima de 1%.`,
        context: { conversion_rate: current.conversion_rate_7d, visits: current.visits_last, sales: current.sales_count_7d },
      };
    default:
      return null;
  }
}

async function detectAnomalies(supabase: any, sellerId: string, processedItemIds: string[]) {
  if (!processedItemIds || processedItemIds.length === 0) return [];
  console.log(`[rad-collector] Detecting anomalies for ${sellerId} (${processedItemIds.length} items)`);

  try {
    // Fetch current state only for processed items (batched)
    let allCurrent: any[] = [];
    for (let i = 0; i < processedItemIds.length; i += 500) {
      const chunk = processedItemIds.slice(i, i + 500);
      const { data } = await supabase
        .from("listing_health_current")
        .select("item_id, visits_last, available_quantity, listing_status, sales_count_7d, sales_count_30d, days_without_sale, conversion_rate_7d, last_sale_at, change_flags")
        .eq("seller_id", sellerId)
        .in("item_id", chunk);
      allCurrent = allCurrent.concat(data || []);
    }

    if (allCurrent.length === 0) return [];

    // Batch-fetch last 3 history entries for all processed items
    let allHistory: any[] = [];
    for (let i = 0; i < processedItemIds.length; i += 500) {
      const chunk = processedItemIds.slice(i, i + 500);
      const { data } = await supabase
        .from("listing_health_history")
        .select("item_id, visits, collected_at")
        .eq("seller_id", sellerId)
        .eq("window_days", 7)
        .in("item_id", chunk)
        .order("collected_at", { ascending: false });
      allHistory = allHistory.concat(data || []);
    }

    // Group history by item_id, keep latest 3
    const historyByItem = new Map<string, any[]>();
    for (const h of allHistory) {
      const existing = historyByItem.get(h.item_id) || [];
      if (existing.length < 3) {
        existing.push(h);
        historyByItem.set(h.item_id, existing);
      }
    }

    const anomalies: any[] = [];
    const cleanItemIds: string[] = [];

    for (const current of allCurrent) {
      const flags: string[] = [];
      const alerts: any[] = [];

      // Visit-based anomalies
      if (current.listing_status === "active" && (current.visits_last === 0 || current.visits_last === null)) {
        flags.push("zero_visits");
      }

      if (current.available_quantity > 50 && (current.visits_last || 0) < 10) {
        flags.push("high_stock_low_traction");
      }

      // Sales-based anomalies
      if (current.days_without_sale !== null && current.days_without_sale > 30) {
        flags.push("no_sales_30d");
      } else if (current.days_without_sale !== null && current.days_without_sale > 14) {
        flags.push("no_sales_14d");
      }

      if (current.visits_last > 20 && current.sales_count_7d === 0) {
        flags.push("visits_no_conversion");
      }

      if (current.conversion_rate_7d !== null && current.conversion_rate_7d > 0 && current.conversion_rate_7d < 0.5 && current.visits_last > 30) {
        flags.push("low_conversion");
      }

      // Visit trend anomalies
      const history = historyByItem.get(current.item_id) || [];
      if (history.length >= 2) {
        const latest = history[0].visits || 0;
        const previous = history[1].visits || 0;
        if (previous > 20 && latest < previous * 0.6) flags.push("visit_drop");
        if (history.length >= 3) {
          const oldest = history[2].visits || 0;
          if (oldest > previous && previous > latest && oldest > 0) flags.push("consistent_decline");
        }
      }

      // Build structured alerts for each detected anomaly
      for (const flag of flags) {
        const alert = buildAlert(flag, current, history);
        if (alert) alerts.push(alert);
      }

      // Also add change-based alerts from change_flags
      const changeFlags = current.change_flags || [];
      for (const change of changeFlags) {
        if (change.severity === "critical" || change.severity === "high") {
          alerts.push({
            type: `change_${change.type}`,
            severity: change.severity,
            title: change.label,
            description: change.detail,
            context: { prev_value: change.prev_value, new_value: change.new_value },
          });
        }
      }

      if (flags.length > 0 || alerts.length > 0) {
        anomalies.push({ item_id: current.item_id, flags, alerts });
      } else {
        cleanItemIds.push(current.item_id);
      }
    }

    // Batch update anomaly flags + alerts_json
    for (const anomaly of anomalies) {
      await supabase.from("listing_health_current")
        .update({ anomaly_flags: anomaly.flags, alerts_json: anomaly.alerts })
        .eq("seller_id", sellerId)
        .eq("item_id", anomaly.item_id);
    }

    // Clear flags for clean items (batched)
    for (let i = 0; i < cleanItemIds.length; i += 500) {
      const chunk = cleanItemIds.slice(i, i + 500);
      await supabase.from("listing_health_current")
        .update({ anomaly_flags: [], alerts_json: [] })
        .eq("seller_id", sellerId)
        .in("item_id", chunk);
    }

    console.log(`[rad-collector] Anomalies: ${anomalies.length} flagged (${anomalies.reduce((s, a) => s + a.alerts.length, 0)} alerts), ${cleanItemIds.length} clean`);
    return anomalies;
  } catch (err) {
    console.warn(`[rad-collector] Anomaly detection error:`, err);
    return [];
  }
}

// ============================================================================
// FLOW 6 — SEO ANALYSIS (Two-layer: Structural + Keyword Adherence)
// ============================================================================

const SEO_STOPWORDS = new Set([
  'de','para','com','e','a','o','os','as','do','da','dos','das','em','no','na','nos','nas',
  'um','uma','uns','umas','por','se','que','ao','ou','mais','não','sim','x','mm','cm','kg','ml','un',
]);

const GENERIC_IRRELEVANT_WORDS = new Set([
  'promoção','promocao','barato','qualidade','top','melhor','oferta','super','mega','ultra',
  'premium','original','novo','lançamento','lancamento','desconto','grátis','gratis','frete',
]);

function normalizeText(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(" ").filter(w => w.length > 2 && !SEO_STOPWORDS.has(w));
}

function checkKeywordInText(keyword: string, normalizedTitle: string): boolean {
  const normalizedKw = normalizeText(keyword);
  const kwWords = normalizedKw.split(" ").filter(w => w.length > 2);
  if (kwWords.length === 0) return false;
  const matchCount = kwWords.filter(w => normalizedTitle.includes(w)).length;
  return matchCount / kwWords.length >= 0.7;
}

function assessKeywordRelevance(keyword: string, title: string, categoryName: string | null): "high" | "medium" | "low" {
  const normalizedKw = normalizeText(keyword);
  const normalizedTitle = normalizeText(title);
  const kwWords = normalizedKw.split(" ").filter(w => w.length > 2);
  const titleWords = normalizedTitle.split(" ").filter(w => w.length > 2);
  if (kwWords.length === 0 || titleWords.length === 0) return "low";
  const overlapCount = kwWords.filter(kw => titleWords.some(tw => tw === kw || tw.includes(kw) || kw.includes(tw))).length;
  const overlapRatio = overlapCount / kwWords.length;
  if (overlapRatio >= 0.5) return "high";
  if (overlapRatio >= 0.25) return "medium";
  return "low";
}

// --- 4-LAYER SEO ANALYSIS ---

function computeTitleSeo(title: string, catKeywords: Array<{keyword: string; normalized: string; weight: number}>): { score: number; issues: string[]; suggestions: string[] } {
  let score = 0;
  const issues: string[] = [];
  const suggestions: string[] = [];
  const titleLen = title.length;

  // Length: 50-60 ideal → +30
  if (titleLen >= 50 && titleLen <= 60) { score += 30; }
  else if (titleLen >= 40 && titleLen <= 70) { score += 22; }
  else if (titleLen >= 30) { score += 12; }
  else { issues.push('Título muito curto'); suggestions.push('Expanda o título para 50-60 caracteres com termos relevantes'); }
  if (titleLen > 60) { issues.push(`Título excede 60 caracteres (${titleLen})`); suggestions.push('Reduza o título para no máximo 60 caracteres'); }

  // Keyword presence in title → +40
  const titleTokens = tokenize(title);
  const titleNorm = normalizeText(title);
  let kwFoundCount = 0;
  for (const kw of catKeywords.slice(0, 15)) {
    if (checkKeywordInText(kw.keyword, titleNorm)) kwFoundCount++;
  }
  const kwRatio = catKeywords.length > 0 ? kwFoundCount / Math.min(catKeywords.length, 15) : 0;
  score += Math.round(kwRatio * 40);
  if (kwRatio < 0.2 && catKeywords.length > 0) { issues.push('Baixa presença de palavras-chave da categoria no título'); suggestions.push('Adicione termos mais buscados da categoria'); }

  // Word variety → +20
  const uniqueTokens = new Set(titleTokens);
  if (uniqueTokens.size >= 6) { score += 20; }
  else if (uniqueTokens.size >= 4) { score += 14; }
  else if (uniqueTokens.size >= 2) { score += 7; }
  else { issues.push('Baixa variação semântica no título'); }

  // Repetition penalty
  const wordCount = new Map<string, number>();
  for (const t of titleTokens) wordCount.set(t, (wordCount.get(t) || 0) + 1);
  for (const [w, c] of wordCount) { if (c >= 3) { score -= 10; issues.push(`Palavra "${w}" repetida ${c}x no título`); } }

  // Generic words penalty
  for (const t of titleTokens) { if (GENERIC_IRRELEVANT_WORDS.has(t)) { score -= 5; issues.push(`Termo genérico "${t}" no título`); } }

  return { score: Math.max(0, Math.min(score, 100)), issues, suggestions };
}

function computeDescriptionSeo(description: string | null, title: string, catKeywords: Array<{keyword: string; normalized: string; weight: number}>): { score: number; length: number; density: number; issues: string[]; suggestions: string[] } {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const desc = (description || '').trim();
  const descLen = desc.length;
  let score = 0;

  // Length → +40
  if (descLen >= 500) { score += 40; }
  else if (descLen >= 300) { score += 25; issues.push(`Descrição com ${descLen} caracteres (ideal: 500+)`); suggestions.push('Aumente a descrição para mais de 500 caracteres'); }
  else if (descLen >= 100) { score += 12; issues.push('Descrição muito curta para SEO'); suggestions.push('Expanda a descrição com detalhes do produto, benefícios e especificações'); }
  else if (descLen > 0) { score += 5; issues.push('Descrição extremamente curta'); suggestions.push('Crie uma descrição completa com no mínimo 500 caracteres'); }
  else { issues.push('Sem descrição'); suggestions.push('Adicione uma descrição detalhada do produto'); }

  // Keyword density → +30
  let density = 0;
  if (descLen > 20) {
    const descTokens = tokenize(desc);
    const descNorm = normalizeText(desc);
    let kwFound = 0;
    for (const kw of catKeywords.slice(0, 15)) {
      if (checkKeywordInText(kw.keyword, descNorm)) kwFound++;
    }
    density = descTokens.length > 0 ? kwFound / descTokens.length : 0;
    const densityScore = catKeywords.length > 0 ? kwFound / Math.min(catKeywords.length, 15) : 0;
    if (densityScore >= 0.3) { score += 30; }
    else if (densityScore >= 0.15) { score += 20; }
    else if (densityScore > 0) { score += 10; suggestions.push('Insira palavras-chave naturalmente na descrição'); }
    else if (catKeywords.length > 0) { suggestions.push('Inclua termos relevantes da categoria na descrição'); }
  }

  // Not just title repetition → +15
  if (descLen > 0) {
    const titleNorm = normalizeText(title);
    const descNorm = normalizeText(desc);
    if (descNorm === titleNorm || (descLen < titleNorm.length * 1.5 && descNorm.includes(titleNorm))) {
      issues.push('Descrição é apenas repetição do título');
    } else {
      score += 15;
    }
  }

  // Context coherence → +15
  if (descLen >= 100) { score += 15; }

  return { score: Math.max(0, Math.min(score, 100)), length: descLen, density: Number(density.toFixed(4)), issues, suggestions };
}

function computeAttributesSeo(attributes: any[]): { score: number; missing: string[]; weak: string[]; issues: string[]; suggestions: string[]; total: number; filled: number } {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const missing: string[] = [];
  const weak: string[] = [];

  if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
    return { score: 0, missing: [], weak: [], issues: ['Ficha técnica não disponível'], suggestions: ['Preencha os atributos do anúncio'], total: 0, filled: 0 };
  }

  const total = attributes.length;
  let filled = 0;
  const genericValues = new Set(['outro', 'outros', 'genérico', 'generico', 'não informado', 'nao informado', 'n/a', '-', 'não se aplica', 'na']);

  for (const attr of attributes) {
    const valueName = (attr.value_name || '').trim();
    if (!valueName || valueName === '') {
      missing.push(attr.name || attr.id || 'Unknown');
    } else if (genericValues.has(valueName.toLowerCase())) {
      weak.push(`${attr.name || attr.id}: "${valueName}"`);
      filled++;
    } else {
      filled++;
    }
  }

  let score = 0;
  const ratio = total > 0 ? filled / total : 0;

  // Fill ratio → +60
  if (ratio >= 0.8) { score += 60; }
  else if (ratio >= 0.5) { score += 40; issues.push(`Ficha técnica ${Math.round(ratio * 100)}% preenchida`); suggestions.push('Complete os atributos faltantes para melhorar indexação'); }
  else { score += Math.round(ratio * 50); issues.push(`Ficha técnica apenas ${Math.round(ratio * 100)}% preenchida`); suggestions.push('Preencha pelo menos 80% dos atributos'); }

  // Quality → +25
  if (weak.length === 0 && filled > 0) { score += 25; }
  else if (weak.length <= 2) { score += 15; }
  else { issues.push(`${weak.length} atributos com valores genéricos`); suggestions.push('Substitua valores genéricos por informações específicas'); }

  // Relevance → +15
  if (total >= 10 && filled >= 8) { score += 15; }
  else if (total >= 5 && filled >= 4) { score += 10; }

  return { score: Math.max(0, Math.min(score, 100)), missing: missing.slice(0, 10), weak: weak.slice(0, 10), issues, suggestions, total, filled };
}

function computeModelSeo(attributes: any[]): { score: number; modelValue: string | null; issues: string[]; suggestions: string[] } {
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (!attributes || !Array.isArray(attributes)) {
    return { score: 0, modelValue: null, issues: ['Atributos não disponíveis para verificar modelo'], suggestions: [] };
  }

  // Find model attribute
  const modelAttr = attributes.find((a: any) => {
    const id = (a.id || '').toLowerCase();
    const name = (a.name || '').toLowerCase();
    return id === 'model' || id === 'modelo' || name === 'modelo' || name === 'model';
  });

  const brandAttr = attributes.find((a: any) => {
    const id = (a.id || '').toLowerCase();
    const name = (a.name || '').toLowerCase();
    return id === 'brand' || id === 'marca' || name === 'marca' || name === 'brand';
  });

  let score = 0;
  const modelValue = modelAttr?.value_name || null;
  const brandValue = brandAttr?.value_name || null;

  const genericValues = new Set(['outro', 'outros', 'genérico', 'generico', 'não informado', 'nao informado', 'n/a', '-', 'não se aplica', 'na', 'sem modelo', 'sem marca']);

  // Model evaluation → +60
  if (modelValue && !genericValues.has(modelValue.toLowerCase())) {
    score += 60;
    // Check if model is useful for search (has some specificity)
    if (modelValue.length >= 3 && /[a-zA-Z0-9]/.test(modelValue)) {
      score += 20; // Specific model
    } else {
      issues.push('Modelo pouco específico');
      suggestions.push('Use um modelo mais descritivo para facilitar buscas');
    }
  } else if (modelValue && genericValues.has(modelValue.toLowerCase())) {
    score += 10;
    issues.push('Campo modelo com valor genérico');
    suggestions.push('Substitua o valor genérico por um modelo real do produto');
  } else {
    issues.push('Campo modelo vazio');
    suggestions.push('Adicione o modelo do produto para melhorar a descoberta');
  }

  // Brand bonus → +20
  if (brandValue && !genericValues.has(brandValue.toLowerCase())) {
    score += 20;
  } else {
    suggestions.push('Preencha a marca do produto');
  }

  return { score: Math.max(0, Math.min(score, 100)), modelValue, issues, suggestions };
}

// --- KEYWORD ADHERENCE (Tendências / Sales keywords) ---
function computeKeywordAdherence(
  titleTokens: string[],
  keywords: Array<{ keyword: string; normalized: string; weight: number }>
): {
  score: number;
  coverage_ratio: number;
  found: string[];
  missing: string[];
  irrelevant: string[];
  details: Array<{ keyword: string; found_in_title: boolean; relevance: string; weight: number }>;
} {
  if (keywords.length === 0) return { score: 0, coverage_ratio: 0, found: [], missing: [], irrelevant: [], details: [] };

  let totalWeightedScore = 0;
  let maxPossibleScore = 0;
  const found: string[] = [];
  const missing: string[] = [];
  const details: Array<{ keyword: string; found_in_title: boolean; relevance: string; weight: number }> = [];

  for (const kw of keywords) {
    const kwTokens = kw.normalized.split(" ").filter(w => w.length > 2 && !SEO_STOPWORDS.has(w));
    if (kwTokens.length === 0) continue;
    maxPossibleScore += kw.weight;

    const titleMatch = kwTokens.filter(t => titleTokens.some(tt => tt === t || tt.includes(t) || t.includes(tt))).length / kwTokens.length;
    const foundInTitle = titleMatch >= 0.7;
    if (foundInTitle) { totalWeightedScore += kw.weight; found.push(kw.keyword); }

    const relevance = titleMatch >= 0.5 ? 'high' : titleMatch >= 0.25 ? 'medium' : 'low';
    details.push({ keyword: kw.keyword, found_in_title: foundInTitle, relevance, weight: kw.weight });

    if (!foundInTitle && relevance !== 'low') missing.push(kw.keyword);
  }

  const coverage_ratio = keywords.length > 0 ? found.length / keywords.length : 0;
  const score = maxPossibleScore > 0 ? Math.round((totalWeightedScore / maxPossibleScore) * 100) : 0;

  // Detect irrelevant words in title
  const irrelevant: string[] = [];
  const titleText = titleTokens.join(' ');
  for (const word of GENERIC_IRRELEVANT_WORDS) { if (titleText.includes(normalizeText(word))) irrelevant.push(word); }
  const wordCount = new Map<string, number>();
  for (const t of titleTokens) { wordCount.set(t, (wordCount.get(t) || 0) + 1); }
  for (const [w, c] of wordCount) { if (c >= 3) irrelevant.push(`${w} (${c}x)`); }

  return { score: Math.min(score, 100), coverage_ratio, found, missing, irrelevant, details };
}

// --- REFRESH MARKET KEYWORDS FROM SALES DATA ---
async function handleRefreshMarketKeywords(supabase: any, categoryId?: string) {
  const startTime = Date.now();
  console.log(`[rad-collector] REFRESH_KEYWORDS started${categoryId ? ` for category ${categoryId}` : ' (all active)'}`);

  await supabase.from('seo_analysis_logs').insert({
    status: 'started', action: 'REFRESH_KEYWORDS_STARTED',
    message: `Refreshing keywords${categoryId ? ` for ${categoryId}` : ' for all active categories'}`,
  });

  try {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    let categoryIds: string[] = [];

    if (categoryId) {
      categoryIds = [categoryId];
    } else {
      const { data: cats } = await supabase
        .from('meli_order_items_cache')
        .select('category_id')
        .gte('created_at', cutoff)
        .not('category_id', 'is', null);
      if (cats) categoryIds = [...new Set(cats.map((c: any) => c.category_id).filter(Boolean))];
    }

    console.log(`[rad-collector] KEYWORDS: ${categoryIds.length} categories to process`);
    let totalKeywords = 0;

    for (const catId of categoryIds) {
      if (Date.now() - startTime > SAFETY_TIMEOUT_MS - 5000) break;

      let allTitles: string[] = [];
      let from = 0;
      while (true) {
        const { data: items } = await supabase
          .from('meli_order_items_cache')
          .select('title')
          .eq('category_id', catId)
          .gte('created_at', cutoff)
          .not('title', 'is', null)
          .range(from, from + 999);
        if (!items || items.length === 0) break;
        allTitles.push(...items.map((i: any) => i.title));
        if (items.length < 1000) break;
        from += 1000;
      }

      if (allTitles.length < 3) continue;

      const wordFreq = new Map<string, number>();
      for (const title of allTitles) {
        const tokens = tokenize(title);
        const unique = new Set(tokens);
        for (const w of unique) { wordFreq.set(w, (wordFreq.get(w) || 0) + 1); }
      }

      const totalOccurrences = [...wordFreq.values()].reduce((a, b) => a + b, 0);
      const sorted = [...wordFreq.entries()]
        .map(([word, count]) => ({ word, count, weight: count / totalOccurrences }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);

      if (sorted.length === 0) continue;

      const rows = sorted.map(s => ({
        category_id: catId, keyword: s.word, normalized_keyword: s.word,
        weight: Number(s.weight.toFixed(6)), source: 'sales',
        occurrence_count: s.count, last_updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from('market_keywords_cache')
        .upsert(rows, { onConflict: 'category_id,normalized_keyword' });
      if (error) console.warn(`[rad-collector] KEYWORDS upsert err for ${catId}:`, error.message);
      else totalKeywords += rows.length;
    }

    const dur = Date.now() - startTime;
    await supabase.from('seo_analysis_logs').insert({
      status: 'completed', action: 'REFRESH_KEYWORDS_COMPLETED',
      score: totalKeywords, execution_time_ms: dur,
      message: `${categoryIds.length} categories, ${totalKeywords} keywords`,
    });

    return { success: true, categories: categoryIds.length, keywords: totalKeywords, duration_ms: dur };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    await supabase.from('seo_analysis_logs').insert({ status: 'error', action: 'REFRESH_KEYWORDS_FAILED', message: msg, execution_time_ms: Date.now() - startTime });
    return { success: false, error: msg };
  }
}

// --- FULL SEO ANALYSIS FOR ITEMS (4-layer: Title + Description + Attributes + Model + Keywords) ---
async function analyzeSeoForItems(supabase: any, sellerId: string, itemIds: string[], tenantId?: string | null) {
  if (!itemIds || itemIds.length === 0) return;
  const startTime = Date.now();
  console.log(`[rad-collector] SEO 4-layer analysis for ${sellerId}: ${itemIds.length} items`);

  await supabase.from('seo_analysis_logs').insert({
    seller_id: sellerId, tenant_id: tenantId, status: 'started', action: 'SEO_ANALYSIS_STARTED',
    message: `4-layer analyzing ${itemIds.length} items`,
  });

  try {
    // 1. Get item details from cache
    const itemDetails = new Map<string, { title: string; category_id: string }>();
    for (let i = 0; i < itemIds.length; i += 500) {
      const { data } = await supabase.from("meli_listings_cache")
        .select("item_id, title, category_id").eq("seller_id", sellerId)
        .in("item_id", itemIds.slice(i, i + 500));
      if (data) for (const row of data) if (row.title && row.category_id && !itemDetails.has(row.item_id)) itemDetails.set(row.item_id, { title: row.title, category_id: row.category_id });
    }
    if (itemDetails.size === 0) return;

    // 2. Get ML access token for fetching descriptions/attributes
    const { data: mlAccount } = await supabase.from('ml_accounts')
      .select('access_token, ml_user_id').eq('ml_user_id', sellerId).eq('is_active', true).maybeSingle();
    const accessToken = mlAccount?.access_token || null;
    console.log(`[rad-collector] SEO: ML token ${accessToken ? 'available' : 'NOT available'} for seller ${sellerId}`);

    // 3. Fetch item descriptions + attributes from ML API (batched)
    const itemExtras = new Map<string, { description: string | null; attributes: any[]; }>();
    if (accessToken) {
      const allItemIds = [...itemDetails.keys()];
      // Batch multiget for attributes
      for (let i = 0; i < allItemIds.length; i += 20) {
        if (Date.now() - startTime > SAFETY_TIMEOUT_MS - 15000) break;
        const batch = allItemIds.slice(i, i + 20);
        const idsParam = batch.join(',');
        try {
          const res = await fetch(`https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,attributes`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (res.ok) {
            const results = await res.json();
            for (const r of results) {
              if (r.code === 200 && r.body) {
                itemExtras.set(r.body.id, {
                  description: null,
                  attributes: r.body.attributes || [],
                });
              }
            }
          }
        } catch (e) { console.warn('[rad-collector] SEO multiget error:', e); }
      }

      // Fetch descriptions (individual endpoint — batch 5 at a time to be gentle)
      for (let i = 0; i < allItemIds.length; i += 5) {
        if (Date.now() - startTime > SAFETY_TIMEOUT_MS - 10000) break;
        const batch = allItemIds.slice(i, i + 5);
        const descPromises = batch.map(async (itemId) => {
          try {
            const res = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (res.ok) {
              const desc = await res.json();
              const existing = itemExtras.get(itemId) || { description: null, attributes: [] };
              existing.description = desc.plain_text || desc.text || null;
              itemExtras.set(itemId, existing);
            }
          } catch { /* skip */ }
        });
        await Promise.all(descPromises);
      }
    }
    console.log(`[rad-collector] SEO: Fetched extras for ${itemExtras.size}/${itemDetails.size} items`);

    // 4. Get keywords from market_keywords_cache
    const categories = [...new Set([...itemDetails.values()].map(v => v.category_id))];
    const keywordsByCategory = new Map<string, Array<{ keyword: string; normalized: string; weight: number }>>();
    for (let i = 0; i < categories.length; i += 50) {
      const { data } = await supabase.from('market_keywords_cache')
        .select('category_id, keyword, normalized_keyword, weight')
        .in('category_id', categories.slice(i, i + 50))
        .order('weight', { ascending: false });
      if (data) for (const r of data) {
        const arr = keywordsByCategory.get(r.category_id) || [];
        arr.push({ keyword: r.keyword, normalized: r.normalized_keyword, weight: r.weight });
        keywordsByCategory.set(r.category_id, arr);
      }
    }

    // Fallback: trend_snapshots for categories without sales keywords
    const missingCats = categories.filter(c => !keywordsByCategory.has(c) || (keywordsByCategory.get(c)?.length || 0) === 0);
    if (missingCats.length > 0) {
      const categoryToL1 = new Map<string, string>();
      for (let i = 0; i < missingCats.length; i += 500) {
        const { data } = await supabase.from("account_category_activity")
          .select("category_id, level1_category_id")
          .in("category_id", missingCats.slice(i, i + 500));
        if (data) for (const row of data) if (row.level1_category_id) categoryToL1.set(row.category_id, row.level1_category_id);
      }
      const l1Ids = [...new Set(categoryToL1.values())];
      for (const l1Id of l1Ids) {
        const { data } = await supabase.from("trend_snapshots")
          .select("trends_data").eq("category_id", l1Id)
          .order("snapshot_date", { ascending: false }).limit(1).maybeSingle();
        if (data?.trends_data && Array.isArray(data.trends_data)) {
          for (const [catId, l1] of categoryToL1) {
            if (l1 === l1Id && (!keywordsByCategory.has(catId) || (keywordsByCategory.get(catId)?.length || 0) === 0)) {
              keywordsByCategory.set(catId, data.trends_data.slice(0, 30).map((t: any) => ({
                keyword: t.keyword, normalized: normalizeText(t.keyword), weight: 0.5,
              })));
            }
          }
        }
      }
    }

    console.log(`[rad-collector] SEO: ${itemDetails.size} items, ${keywordsByCategory.size} categories with keywords`);

    // 5. Analyze each item with 4 layers
    let analyzed = 0;
    const seoRows: any[] = [];

    for (const [itemId, detail] of itemDetails) {
      const catKeywords = (keywordsByCategory.get(detail.category_id) || []).slice(0, 30);
      const extras = itemExtras.get(itemId) || { description: null, attributes: [] };

      // Layer 1: Title (40%)
      const titleResult = computeTitleSeo(detail.title, catKeywords);

      // Layer 2: Description (25%)
      const descResult = computeDescriptionSeo(extras.description, detail.title, catKeywords);

      // Layer 3: Attributes (20%)
      const attrResult = computeAttributesSeo(extras.attributes);

      // Layer 4: Model (15%)
      const modelResult = computeModelSeo(extras.attributes);

      // Keyword adherence (for keyword section display)
      const titleTokens = tokenize(detail.title);
      const adherence = computeKeywordAdherence(titleTokens, catKeywords);

      // Final score: weighted average
      const seoScore = Math.round(
        titleResult.score * 0.40 +
        descResult.score * 0.25 +
        attrResult.score * 0.20 +
        modelResult.score * 0.15
      );
      const seoGrade = seoScore >= 85 ? 'A' : seoScore >= 70 ? 'B' : seoScore >= 50 ? 'C' : 'D';

      // Merge all issues & suggestions
      const allIssues = [...titleResult.issues, ...descResult.issues, ...attrResult.issues, ...modelResult.issues];
      if (adherence.coverage_ratio < 0.3 && catKeywords.length > 0) allIssues.push('Baixa cobertura de palavras-chave relevantes');
      if (adherence.irrelevant.length > 0) allIssues.push('Termos genéricos detectados no título');

      const allSuggestions = [...titleResult.suggestions, ...descResult.suggestions, ...attrResult.suggestions, ...modelResult.suggestions];
      if (adherence.missing.length > 0 && catKeywords.length > 0) allSuggestions.push('Adicionar termos mais buscados da categoria no título');

      seoRows.push({ seller_id: sellerId, item_id: itemId, tenant_id: tenantId,
        seo_structural_score: titleResult.score, seo_keyword_score: adherence.score,
        seo_score: seoScore, seo_grade: seoGrade,
        title_score: titleResult.score, description_score: descResult.score,
        attributes_score: attrResult.score, model_score: modelResult.score,
        description_length: descResult.length, keyword_density: descResult.density,
        missing_attributes: attrResult.missing, weak_attributes: attrResult.weak,
        keyword_coverage_ratio: Number(adherence.coverage_ratio.toFixed(4)),
        missing_keywords: adherence.missing.slice(0, 15),
        irrelevant_keywords: adherence.irrelevant.slice(0, 10),
        keywords_relevantes: catKeywords.map(k => k.keyword).slice(0, 30),
        keywords_presentes: adherence.found.slice(0, 20),
        keywords_faltantes: adherence.missing.slice(0, 15),
        issues: allIssues, suggestions: allSuggestions,
        analysis_details: {
          title: { score: titleResult.score, issues: titleResult.issues, suggestions: titleResult.suggestions },
          description: { score: descResult.score, length: descResult.length, density: descResult.density, issues: descResult.issues, suggestions: descResult.suggestions },
          attributes: { score: attrResult.score, total: attrResult.total, filled: attrResult.filled, missing: attrResult.missing, weak: attrResult.weak, issues: attrResult.issues, suggestions: attrResult.suggestions },
          model: { score: modelResult.score, value: modelResult.modelValue, issues: modelResult.issues, suggestions: modelResult.suggestions },
          adherence: { score: adherence.score, coverage_ratio: adherence.coverage_ratio, found_count: adherence.found.length, total_keywords: catKeywords.length },
          analyzed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      });

      // Update listing_health_current
      await supabase.from("listing_health_current").update({
        seo_score: seoScore, seo_grade: seoGrade,
        seo_structural_score: titleResult.score, seo_keyword_score: adherence.score,
        seo_title_score: titleResult.score, seo_description_score: descResult.score,
        seo_attributes_score: attrResult.score, seo_model_score: modelResult.score,
        seo_description_length: descResult.length,
        seo_keywords_found: adherence.found.slice(0, 10), seo_keywords_missing: adherence.missing.slice(0, 10),
        seo_analysis_json: {
          score: seoScore, grade: seoGrade,
          title_score: titleResult.score, description_score: descResult.score,
          attributes_score: attrResult.score, model_score: modelResult.score,
          keyword_score: adherence.score,
          description_length: descResult.length, keyword_density: descResult.density,
          total_keywords: catKeywords.length, found_count: adherence.found.length, coverage_ratio: adherence.coverage_ratio,
          missing_attributes: attrResult.missing.slice(0, 5), weak_attributes: attrResult.weak.slice(0, 5),
          model_value: modelResult.modelValue,
          irrelevant_keywords: adherence.irrelevant.slice(0, 10),
          issues: allIssues, suggestions: allSuggestions,
          details: adherence.details.filter(d => d.relevance !== 'low').slice(0, 15),
          analyzed_at: new Date().toISOString(),
        },
        seo_updated_at: new Date().toISOString(),
      }).eq("seller_id", sellerId).eq("item_id", itemId);

      analyzed++;
    }

    // Persist to listing_seo_analysis
    for (let i = 0; i < seoRows.length; i += 100) {
      const { error } = await supabase.from('listing_seo_analysis')
        .upsert(seoRows.slice(i, i + 100), { onConflict: 'seller_id,item_id' });
      if (error) console.warn(`[rad-collector] SEO listing_seo_analysis upsert err:`, error.message);
    }

    const dur = Date.now() - startTime;
    await supabase.from('seo_analysis_logs').insert({
      seller_id: sellerId, tenant_id: tenantId, status: 'completed', action: 'SEO_ANALYSIS_COMPLETED',
      score: analyzed, execution_time_ms: dur,
      message: `${analyzed} items analyzed (4-layer)`,
      metadata_json: { items_analyzed: analyzed, categories_with_keywords: keywordsByCategory.size, items_with_extras: itemExtras.size },
    });

    console.log(`[rad-collector] SEO 4-layer: ${analyzed} items analyzed, ${dur}ms`);
  } catch (err) {
    console.warn(`[rad-collector] SEO analysis error:`, err);
    await supabase.from('seo_analysis_logs').insert({
      seller_id: sellerId, tenant_id: tenantId, status: 'error', action: 'SEO_ANALYSIS_FAILED',
      message: err instanceof Error ? err.message : 'Unknown', execution_time_ms: Date.now() - startTime,
    });
  }
}
// ============================================================================
// ENRICH SALES — Re-enrich all listing_health_current with sales data
// without re-fetching visits from ML API
// ============================================================================
async function handleEnrichSales(supabase: any, sellerId: string) {
  console.log(`[rad-collector] ENRICH_SALES: Starting for seller ${sellerId}`);
  const startTime = Date.now();

  // 1. Get all item_ids from listing_health_current
  let allItemIds: string[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("listing_health_current")
      .select("item_id")
      .eq("seller_id", sellerId)
      .range(from, from + PAGE - 1);
    if (error) { console.error(`[rad-collector] ENRICH_SALES: fetch error:`, error.message); break; }
    if (!data || data.length === 0) break;
    allItemIds = allItemIds.concat(data.map((r: any) => r.item_id));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (allItemIds.length === 0) {
    console.log(`[rad-collector] ENRICH_SALES: No items found`);
    return { success: true, enriched: 0, message: "No items to enrich" };
  }

  console.log(`[rad-collector] ENRICH_SALES: ${allItemIds.length} items to enrich`);

  // 2. Process in batches of 200
  const BATCH = 200;
  let totalEnriched = 0;
  let totalFailed = 0;

  for (let i = 0; i < allItemIds.length; i += BATCH) {
    const batchIds = allItemIds.slice(i, i + BATCH);

    try {
      const salesData = await fetchSalesData(supabase, sellerId, batchIds);

      // Build update rows
      const updates: any[] = [];
      for (const itemId of batchIds) {
        const sales = salesData[itemId];
        if (!sales) continue;

        const daysWithoutSale = sales.last_sale_at
          ? Math.floor((Date.now() - new Date(sales.last_sale_at).getTime()) / (24 * 60 * 60 * 1000))
          : null;

        updates.push({
          seller_id: sellerId,
          item_id: itemId,
          sales_count_7d: sales.sales_7d,
          units_sold_7d: sales.units_7d,
          sales_count_30d: sales.sales_30d,
          units_sold_30d: sales.units_30d,
          days_without_sale: daysWithoutSale,
          last_sale_at: sales.last_sale_at,
        });
      }

      // Upsert with only sales fields
      if (updates.length > 0) {
        const { error } = await supabase
          .from("listing_health_current")
          .upsert(updates, { onConflict: "seller_id,item_id", ignoreDuplicates: false });
        if (error) {
          console.warn(`[rad-collector] ENRICH_SALES: upsert error batch ${i}:`, error.message);
          totalFailed += updates.length;
        } else {
          totalEnriched += updates.length;
        }
      }

      // Also update conversion_rate_7d
      for (const upd of updates) {
        if (upd.sales_count_7d > 0) {
          // Need visits_last for conversion calc
          const { data: current } = await supabase
            .from("listing_health_current")
            .select("visits_last")
            .eq("seller_id", sellerId)
            .eq("item_id", upd.item_id)
            .maybeSingle();
          
          const visits = current?.visits_last || 0;
          if (visits > 0) {
            const convRate = Number(((upd.sales_count_7d / visits) * 100).toFixed(3));
            await supabase
              .from("listing_health_current")
              .update({ conversion_rate_7d: convRate })
              .eq("seller_id", sellerId)
              .eq("item_id", upd.item_id);
          }
        }
      }

      console.log(`[rad-collector] ENRICH_SALES: batch ${Math.floor(i/BATCH)+1}: enriched=${updates.length}`);
    } catch (err) {
      console.warn(`[rad-collector] ENRICH_SALES: batch error:`, err);
      totalFailed += batchIds.length;
    }

    if (Date.now() - startTime > SAFETY_TIMEOUT_MS) {
      console.log(`[rad-collector] ENRICH_SALES: timeout after ${totalEnriched} enriched`);
      break;
    }
  }

  // 3. Re-run anomaly detection with enriched data
  try {
    await detectAnomalies(supabase, sellerId);
    console.log(`[rad-collector] ENRICH_SALES: anomaly detection completed`);
  } catch (err) {
    console.warn(`[rad-collector] ENRICH_SALES: anomaly detection failed:`, err);
  }

  const duration = Date.now() - startTime;
  console.log(`[rad-collector] ENRICH_SALES: Complete. Enriched=${totalEnriched}, Failed=${totalFailed}, Duration=${duration}ms`);

  // Log
  await createLog(supabase, sellerId, "collection").then(async (logId) => {
    await finishLog(supabase, logId, {
      status: "success",
      total_items: allItemIds.length,
      items_processed: totalEnriched,
      items_failed: totalFailed,
      duration_ms: duration,
      metadata_json: { action: "enrich_sales" },
    });
  }).catch(() => {});

  return { success: true, enriched: totalEnriched, failed: totalFailed, duration_ms: duration };
}

// ============================================================================
// FLOW 7 — INTELLIGENT ANALYSIS ENGINE (Phase 2)
// ============================================================================

const HEALTH_WEIGHTS: Record<string, number> = {
  traffic: 15, conversion: 20, content: 10, stock: 15, logistics: 10, catalog: 5, coverage: 5, seo: 20,
};

function classifyLogisticType(item: any): { isFull: boolean; confirmed: boolean; logisticLabel: string } {
  const lt = (item.logistic_type || '').toLowerCase();
  const sm = (item.shipping_mode || '').toLowerCase();
  if (lt === 'fulfillment' || lt === 'full' || lt.includes('fulfillment'))
    return { isFull: true, confirmed: true, logisticLabel: 'Fulfillment' };
  if (lt === 'cross_docking' || lt === 'xd_drop_off' || lt.includes('cross'))
    return { isFull: false, confirmed: true, logisticLabel: 'Coleta/Crossdocking' };
  if (sm === 'me2' || sm === 'me1')
    return { isFull: false, confirmed: true, logisticLabel: sm.toUpperCase() };
  if (lt || sm)
    return { isFull: false, confirmed: true, logisticLabel: lt || sm };
  return { isFull: false, confirmed: false, logisticLabel: 'Não confirmado' };
}

function classifyCatalog(item: any): { inCatalog: boolean; confirmed: boolean; catalogId: string | null } {
  const cpId = item.catalog_product_id || item.catalog_listing;
  if (typeof cpId === 'string' && cpId.length > 0) return { inCatalog: true, confirmed: true, catalogId: cpId };
  if (cpId === true) return { inCatalog: true, confirmed: true, catalogId: null };
  return { inCatalog: false, confirmed: true, catalogId: null };
}

function computeSubScores(item: any, photos: { count: number; hasVideo: boolean }, titleLen: number, coverageDays: number, visits7d: number, visits30d: number, sales30d: number): Record<string, number> {
  // Traffic base
  let traffic = visits30d >= 300 ? 100 : visits30d >= 150 ? 80 : visits30d >= 50 ? 60 : visits30d >= 15 ? 40 : visits30d > 0 ? 20 : 0;
  
  // RULE 2: ADS active with low visits → reduce penalty (max -5)
  if (item.is_ads_active === true && traffic < 40) {
    traffic = Math.max(traffic, 35); // cap penalty at -5 from baseline 40
  }
  // RULE 3: Promotion active → +5 traffic bonus
  if (item.is_promotion_active === true) {
    traffic = Math.min(traffic + 5, 100);
  }
  // RULE 4: ADS + Promotion → +10 combined bonus (total, not stacked on rule 3)
  if (item.is_ads_active === true && item.is_promotion_active === true) {
    traffic = Math.min(traffic + 5, 100); // +5 extra beyond rule 3's +5 = +10 total
  }
  
  // Conversion
  const convRate = visits30d > 0 ? (sales30d / visits30d) * 100 : 0;
  const conversion = visits30d < 10 ? 50 : convRate >= 5 ? 100 : convRate >= 3 ? 85 : convRate >= 1.5 ? 70 : convRate >= 0.5 ? 50 : convRate > 0 ? 30 : 0;
  // Content (media only, SEO is separate)
  let content = 0;
  if (photos.count >= 6) content += 50; else if (photos.count >= 3) content += 30; else if (photos.count >= 1) content += 15;
  if (photos.hasVideo) content += 25;
  if (titleLen >= 40) content += 25; else if (titleLen >= 20) content += 15;
  content = Math.min(content, 100);
  // SEO as independent dimension
  const seo = item.seo_score || 0;
  // Stock
  const stock = (item.available_quantity ?? null) === null ? 50 : item.available_quantity === 0 ? 0 : item.available_quantity < 3 ? 30 : item.available_quantity >= 10 ? 100 : 70;
  // Logistics
  const logInfo = classifyLogisticType(item);
  let logistics = logInfo.confirmed ? (logInfo.isFull ? 70 : 30) : 50;
  if (item.free_shipping) logistics = Math.min(logistics + 30, 100);
  // Catalog
  const catInfo = classifyCatalog(item);
  const catalog = catInfo.inCatalog ? 100 : 30;
  // Coverage
  const covPct = 30 > 0 ? (coverageDays / 30) * 100 : 0;
  const coverage = covPct >= 80 ? 100 : covPct >= 50 ? 70 : covPct >= 20 ? 40 : 10;

  return { traffic, conversion, content, stock, logistics, catalog, coverage, seo };
}

function computeHealthScore(scores: Record<string, number>): number {
  let total = 0, wSum = 0;
  for (const [k, w] of Object.entries(HEALTH_WEIGHTS)) { total += (scores[k] || 0) * w; wSum += w; }
  return Math.round(total / wSum);
}

function classifyHealthStatus(score: number): string {
  if (score >= 75) return 'healthy';
  if (score >= 60) return 'stable';
  if (score >= 45) return 'observation';
  if (score >= 30) return 'alert';
  return 'critical';
}

function classifyCoverage(daysWithData: number, daysReq: number): string {
  if (daysReq === 0) return 'unknown';
  const pct = (daysWithData / daysReq) * 100;
  return pct >= 70 ? 'reliable' : pct >= 30 ? 'partial' : 'insufficient';
}

function determineMainProblem(scores: Record<string, number>, covStatus: string, visits30d: number, sales30d: number, stock: number | null, item: any = {}): string {
  // NEW PRIORITY ORDER: data_coverage → exposure → traffic → conversion → content/SEO
  
  // 1. Data coverage first
  if (covStatus === 'insufficient') return 'data_coverage';
  
  // 2. Exposure: low visits + no ADS + no promo = exposure problem
  if (visits30d < 15 && item.is_ads_active !== true && item.is_promotion_active !== true) return 'exposure';
  
  // 3. Campaign performance: ADS active but still no traffic
  if (visits30d < 15 && item.is_ads_active === true) return 'campaign_performance';
  
  // 4. Stock
  if (stock === 0) return 'stock';
  
  // 5. Conversion (only if has traffic)
  if (visits30d > 20 && sales30d === 0) return 'conversion';
  
  // 6. Content/SEO/traffic by lowest score
  const candidates = [
    { key: 'discovery', score: scores.traffic },
    { key: 'conversion', score: scores.conversion },
    { key: 'content', score: scores.content },
    { key: 'stock', score: scores.stock },
  ].sort((a, b) => a.score - b.score);
  return candidates[0].score >= 70 ? 'healthy' : candidates[0].key;
}

function generateDiagnosticText(mainProblem: string, item: any, scores: Record<string, number>): string {
  const v30d = item.visits_30d || item.visits_last * 4 || 0;
  switch (mainProblem) {
    case 'exposure':
      return 'O anúncio não possui campanhas ou promoções ativas. A baixa visibilidade pode estar relacionada à falta de estratégias de exposição.';
    case 'campaign_performance':
      return 'O anúncio está em campanha, mas não está gerando tráfego relevante. Isso pode indicar necessidade de ajuste na campanha ou atratividade do anúncio.';
    case 'content':
      if ((item.seo_score || 0) < 40) return 'O título e os atributos não cobrem termos comuns da categoria, o que pode reduzir a descoberta. Conteúdo visual também precisa de atenção.';
      return 'O conteúdo visual do anúncio (fotos, vídeo, título) precisa de melhorias para aumentar a conversão.';
    case 'conversion':
      return `O anúncio recebe ${v30d} visitas mas não converte. Revise preço, fotos, descrição e condições de venda.`;
    case 'discovery':
      return 'O anúncio está com baixa visibilidade orgânica. Considere melhorar o título, investir em ADS ou participar de promoções.';
    case 'stock':
      return 'Estoque zerado ou muito baixo. O anúncio perde posicionamento e não pode vender.';
    case 'data_coverage':
      return 'Dados insuficientes para diagnóstico confiável. Aguarde mais dias de coleta.';
    case 'healthy':
      return 'Anúncio operando de forma saudável. Continue monitorando.';
    default:
      return '';
  }
}

function generateSmartRecs(item: any, scores: Record<string, number>, mainProblem: string, existing: string[]): any[] {
  const recs: any[] = [];
  const has = (t: string) => existing.includes(t);
  const logInfo = classifyLogisticType(item);
  const catInfo = classifyCatalog(item);
  const v30d = item.visits_30d || item.visits_last * 4 || 0;
  const hasTraffic = v30d >= 20;
  const isHealthy = (item.health_score || 0) > 80;

  // EXPOSURE-first recommendations
  if (v30d < 10 && !item.is_ads_active && !has('consider_ads'))
    recs.push({ recommendation_type: 'consider_ads', priority: 'high', title: 'Ativar publicidade (ADS)', description: 'Sem tráfego e sem publicidade ativa. ADS pode acelerar a descoberta.', category: 'exposure', estimated_impact: 'alto' });
  
  if (item.is_ads_active && v30d < 15 && !has('review_campaign'))
    recs.push({ recommendation_type: 'review_campaign', priority: 'high', title: 'Revisar campanha ADS', description: 'ADS ativo mas sem gerar tráfego. Ajuste a campanha ou atratividade do anúncio.', category: 'exposure', estimated_impact: 'alto' });

  // Promo — contextual suggestions
  if (!item.is_promotion_active && scores.conversion >= 60 && hasTraffic && !has('consider_promo'))
    recs.push({ recommendation_type: 'consider_promo', priority: 'low', title: 'Considerar promoção', description: 'Anúncio com boa conversão pode se beneficiar de promoções para escalar vendas.', category: 'exposure', estimated_impact: 'médio' });
  if (item.is_promotion_active && !has('check_more_promos'))
    recs.push({ recommendation_type: 'check_more_promos', priority: 'low', title: 'Promoção ativa — verifique disponibilidade', description: 'Este anúncio já participa de promoção. Verifique se há mais promoções disponíveis para ampliar a exposição.', category: 'exposure', estimated_impact: 'médio' });

  // BLOCK: Content/media suggestions ONLY if has traffic
  if (hasTraffic && scores.content < 60) {
    const pc = item.photos_count || 0;
    if (pc === 0 && !has('add_photos')) recs.push({ recommendation_type: 'add_photos', priority: 'critical', title: 'Adicionar fotos', description: 'Anúncio sem fotos. Adicione pelo menos 6 fotos de qualidade.', category: 'content', estimated_impact: 'alto' });
    else if (pc < 4 && !has('more_photos')) recs.push({ recommendation_type: 'more_photos', priority: isHealthy ? 'low' : 'high', title: 'Adicionar mais fotos', description: `Apenas ${pc} foto(s). Recomendado: pelo menos 6.`, category: 'content', estimated_impact: 'médio' });
    if (!item.has_video && !has('add_video')) recs.push({ recommendation_type: 'add_video', priority: isHealthy ? 'low' : 'medium', title: 'Adicionar vídeo', description: 'Anúncios com vídeo convertem até 20% mais.', category: 'content', estimated_impact: 'médio' });
  }

  // BLOCK: only suggest full if confirmed NOT full
  if (logInfo.confirmed && !logInfo.isFull && !has('consider_full'))
    recs.push({ recommendation_type: 'consider_full', priority: isHealthy ? 'low' : 'medium', title: 'Considerar Fulfillment', description: 'Anúncio não usa Full. Fulfillment melhora conversão.', category: 'logistics', estimated_impact: 'alto' });
  // BLOCK: only suggest catalog if confirmed NOT in catalog
  if (catInfo.confirmed && !catInfo.inCatalog && !has('join_catalog'))
    recs.push({ recommendation_type: 'join_catalog', priority: isHealthy ? 'low' : 'medium', title: 'Vincular ao catálogo', description: 'Anúncio fora do catálogo. Catálogo dá exposição extra.', category: 'catalog', estimated_impact: 'médio' });
  if ((item.available_quantity ?? 0) === 0 && !has('restock'))
    recs.push({ recommendation_type: 'restock', priority: 'critical', title: 'Repor estoque', description: 'Estoque zerado. Anúncio invisível nas buscas.', category: 'stock', estimated_impact: 'crítico' });
  else if ((item.available_quantity ?? 0) < 3 && !has('low_stock_warning'))
    recs.push({ recommendation_type: 'low_stock_warning', priority: 'high', title: 'Estoque baixo', description: `Apenas ${item.available_quantity} un. Reponha para evitar perda.`, category: 'stock', estimated_impact: 'alto' });
  if (scores.traffic < 30 && hasTraffic && !has('improve_seo'))
    recs.push({ recommendation_type: 'improve_seo', priority: 'high', title: 'Melhorar visibilidade', description: 'Poucas visitas. Revise título e considere publicidade.', category: 'traffic', estimated_impact: 'alto' });
  // BLOCK: only suggest conversion improvement if there IS traffic
  if (mainProblem === 'conversion' && hasTraffic && !has('improve_conversion'))
    recs.push({ recommendation_type: 'improve_conversion', priority: 'high', title: 'Melhorar conversão', description: 'Recebe visitas mas não converte. Revise preço, fotos e descrição.', category: 'conversion', estimated_impact: 'alto' });

  // Healthy items → classify as "otimização leve"
  if (isHealthy) {
    recs.forEach(r => { if (r.priority !== 'critical') r.priority = 'low'; });
  }

  return recs;
}

async function handleAnalyze(supabase: any, sellerId: string, itemId?: string) {
  const startTime = Date.now();
  console.log(`[rad-collector] ANALYZE started for ${sellerId}${itemId ? ` item ${itemId}` : ' (all)'}`);

   await supabase.from('listing_health_logs').insert({
    seller_id: sellerId, item_id: itemId || null, log_type: 'analysis', log_level: 'info',
    action: 'analyze_started', message: `Analysis started`, metadata_json: { scope: itemId ? 'single' : 'all' },
  });

  try {
    let query = supabase.from('listing_health_current').select('*').eq('seller_id', sellerId);
    if (itemId) query = query.eq('item_id', itemId);
    const { data: items, error: fetchErr } = await query;
    if (fetchErr) throw new Error(fetchErr.message);
    if (!items || items.length === 0) return { success: true, analyzed: 0 };

    // Coverage data
    const { data: covRows } = await supabase.from('seller_item_visits').select('item_id, visit_date')
      .eq('seller_id', sellerId).gte('visit_date', new Date(Date.now() - 30*86400000).toISOString().split('T')[0]);
    const covByItem = new Map<string, number>();
    if (covRows) {
      const m = new Map<string, Set<string>>();
      for (const r of covRows) { const s = m.get(r.item_id) || new Set(); s.add(r.visit_date); m.set(r.item_id, s); }
      for (const [id, s] of m) covByItem.set(id, s.size);
    }

    // Listing details
    const allIds = items.map((i: any) => i.item_id);
    const detailMap = new Map<string, any>();
    for (let i = 0; i < allIds.length; i += 500) {
      const { data } = await supabase.from('meli_listings_cache').select('item_id, title, thumbnail, permalink, catalog_product_id, logistic_type, shipping_mode')
        .eq('seller_id', sellerId).in('item_id', allIds.slice(i, i + 500));
      if (data) for (const r of data) if (!detailMap.has(r.item_id)) detailMap.set(r.item_id, r);
    }

    // Photos from API
    const token = await getValidToken(supabase, sellerId);
    const photosMap = new Map<string, { count: number; hasVideo: boolean }>();
    if (token) {
      for (let i = 0; i < allIds.length; i += 20) {
        try {
          const resp = await fetch(`https://api.mercadolibre.com/items?ids=${allIds.slice(i,i+20).join(',')}&attributes=id,pictures,video_id`, { headers: { Authorization: `Bearer ${token}` } });
          if (resp.ok) { const d = await resp.json(); for (const e of d) if (e.code===200&&e.body) photosMap.set(e.body.id, { count: Array.isArray(e.body.pictures)?e.body.pictures.length:0, hasVideo: !!e.body.video_id }); }
        } catch {}
        await sleep(200);
        if (Date.now() - startTime > SAFETY_TIMEOUT_MS - 10000) break;
      }
    }

    // Existing recs
    const { data: exRecs } = await supabase.from('listing_health_recommendations').select('item_id, recommendation_type').eq('seller_id', sellerId).eq('status', 'pending');
    const exRecMap = new Map<string, string[]>();
    if (exRecs) for (const r of exRecs) { const a = exRecMap.get(r.item_id) || []; a.push(r.recommendation_type); exRecMap.set(r.item_id, a); }

    // --- EXPOSURE DATA: ADS + PROMOTIONS ---
    // Check which items have active ADS
    const adsActiveSet = new Set<string>();
    const adsStatusMap = new Map<string, string>();
    try {
      let adsFrom = 0;
      while (true) {
        const { data: adsRows } = await supabase
          .from('ads_items')
          .select('item_id, status')
          .eq('seller_id', sellerId)
          .range(adsFrom, adsFrom + 999);
        if (!adsRows || adsRows.length === 0) break;
        for (const r of adsRows) {
          adsStatusMap.set(r.item_id, r.status);
          if (r.status === 'active') adsActiveSet.add(r.item_id);
        }
        if (adsRows.length < 1000) break;
        adsFrom += 1000;
      }
      console.log(`[rad-collector] ANALYZE: ADS data loaded — ${adsActiveSet.size} active, ${adsStatusMap.size} total`);
      await supabase.from('listing_health_logs').insert({ seller_id: sellerId, log_type: 'analysis', log_level: 'info', action: 'ADS_STATUS_DETECTED', message: `ADS: ${adsActiveSet.size} active of ${adsStatusMap.size} total` });
    } catch (adsErr) {
      console.warn(`[rad-collector] ANALYZE: ADS lookup failed:`, adsErr);
      await supabase.from('listing_health_logs').insert({ seller_id: sellerId, log_type: 'analysis', log_level: 'warn', action: 'EXPOSURE_DATA_INSUFFICIENT', message: `ADS lookup failed: ${adsErr}` });
    }

    // Check which items are in active promotions
    const promoActiveSet = new Set<string>();
    const promoStatusMap = new Map<string, string>();
    try {
      // Get active promotion IDs first
      const { data: activePromos } = await supabase
        .from('promotion_snapshots')
        .select('promotion_id, status')
        .eq('seller_id', sellerId)
        .in('status', ['started', 'active']);
      const activePromoIds = (activePromos || []).map((p: any) => p.promotion_id);

      if (activePromoIds.length > 0) {
        // Get items in active promotions
        for (let pi = 0; pi < activePromoIds.length; pi += 50) {
          const promoChunk = activePromoIds.slice(pi, pi + 50);
          const { data: promoItems } = await supabase
            .from('promotion_items_snapshots')
            .select('item_id, item_status')
            .eq('seller_id', sellerId)
            .in('promotion_id', promoChunk);
          if (promoItems) {
            for (const r of promoItems) {
              promoStatusMap.set(r.item_id, r.item_status);
              if (['candidate', 'active', 'started'].includes(r.item_status)) promoActiveSet.add(r.item_id);
            }
          }
        }
      }
      console.log(`[rad-collector] ANALYZE: Promo data loaded — ${promoActiveSet.size} active, ${promoStatusMap.size} total`);
      await supabase.from('listing_health_logs').insert({ seller_id: sellerId, log_type: 'analysis', log_level: 'info', action: 'PROMOTION_STATUS_DETECTED', message: `Promos: ${promoActiveSet.size} active of ${promoStatusMap.size} total` });
    } catch (promoErr) {
      console.warn(`[rad-collector] ANALYZE: Promo lookup failed:`, promoErr);
      await supabase.from('listing_health_logs').insert({ seller_id: sellerId, log_type: 'analysis', log_level: 'warn', action: 'EXPOSURE_DATA_INSUFFICIENT', message: `Promo lookup failed: ${promoErr}` });
    }

    // Tenant
    const { data: acct } = await supabase.from('ml_accounts').select('user_id').eq('ml_user_id', String(sellerId)).eq('is_active', true).maybeSingle();
    let tenantId: string | null = null;
    if (acct?.user_id) { const { data: mem } = await supabase.from('company_members').select('company_id').eq('user_id', acct.user_id).limit(1).maybeSingle(); tenantId = mem?.company_id || null; }

    let analyzed = 0, errCount = 0;
    const newAlerts: any[] = [], newRecs: any[] = [], updateRows: any[] = [], mediaRows: any[] = [];

    for (const item of items) {
      try {
        const listing = detailMap.get(item.item_id) || {};
        const photos = photosMap.get(item.item_id) || { count: item.photos_count || 0, hasVideo: item.has_video || false };
        const covDays = covByItem.get(item.item_id) || 0;
        const title = listing.title || item.title || '';
        const merged = { ...item, ...listing, is_ads_active: adsActiveSet.has(item.item_id) || null, is_promotion_active: promoActiveSet.has(item.item_id) || null };
        const covStatus = classifyCoverage(covDays, 30);

        const v7d = item.visits_7d || item.visits_last || 0;
        const v30d = item.visits_30d || v7d * 4;
        const s30d = item.sales_count_30d || 0;
        const convRate = v30d > 0 ? (s30d / v30d) * 100 : 0;

        const scores = computeSubScores(merged, photos, title.length, covDays, v7d, v30d, s30d);
        const hScore = computeHealthScore(scores);
        const hStatus = classifyHealthStatus(hScore);
        const mainProb = determineMainProblem(scores, covStatus, v30d, s30d, item.available_quantity, merged);
        const diagnosticText = generateDiagnosticText(mainProb, merged, scores);

        // Recommendations with smart blocking
        const recs = generateSmartRecs({ ...merged, photos_count: photos.count, has_video: photos.hasVideo, health_score: hScore }, scores, mainProb, exRecMap.get(item.item_id) || []);
        for (const r of recs) newRecs.push({ seller_id: sellerId, item_id: item.item_id, tenant_id: tenantId, ...r });

        // Alerts
        if (hStatus === 'critical' || hStatus === 'alert') {
          const statusLabel = hStatus === 'critical' ? 'em estado crítico' : 'requer atenção';
          newAlerts.push({
            seller_id: sellerId, item_id: item.item_id, tenant_id: tenantId,
            alert_type: `health_${hStatus}`, severity: hStatus === 'critical' ? 'critical' : 'warning',
            title: `Anúncio ${statusLabel}`,
            message: `Score ${hScore}/100. Problema principal: ${mainProb}. ${covStatus === 'partial' ? 'Dados parciais.' : ''}`,
            data_json: { health_score: hScore, main_problem: mainProb, scores },
          });
        }

        // Media
        mediaRows.push({
          seller_id: sellerId, item_id: item.item_id, tenant_id: tenantId,
          photos_count: photos.count, has_video: photos.hasVideo,
          quality_score: photos.count >= 6 && photos.hasVideo ? 100 : photos.count >= 6 ? 70 : photos.count >= 3 ? 50 : photos.count >= 1 ? 25 : 0,
          analysis_json: { photos_count: photos.count, has_video: photos.hasVideo, title_length: title.length },
          analyzed_at: new Date().toISOString(),
        });

        // Update row
        const logInfo = classifyLogisticType(merged);
        const catInfo = classifyCatalog(merged);
        const isAdsActive = adsStatusMap.has(item.item_id) ? adsActiveSet.has(item.item_id) : null;
        const adsStatus = adsStatusMap.get(item.item_id) || null;
        const isPromoActive = promoStatusMap.has(item.item_id) ? promoActiveSet.has(item.item_id) : null;
        const promoStatus = promoStatusMap.get(item.item_id) || null;
        updateRows.push({
          seller_id: sellerId, item_id: item.item_id, tenant_id: tenantId,
          photos_count: photos.count, has_video: photos.hasVideo,
          thumbnail: listing.thumbnail || item.thumbnail || null,
          title: title || null, permalink: listing.permalink || item.permalink || null,
          logistic_type: logInfo.logisticLabel, catalog_product_id: catInfo.catalogId,
          visits_7d: v7d, visits_30d: v30d, conversion_rate_30d: Number(convRate.toFixed(3)),
          health_score: hScore, health_status: hStatus, main_problem: mainProb,
          diagnostic_text: diagnosticText,
          data_coverage_days: covDays, data_coverage_status: covStatus,
          is_ads_active: isAdsActive, ads_status: adsStatus,
          is_promotion_active: isPromoActive, promotion_status: promoStatus,
        });
        analyzed++;
      } catch (e) { errCount++; console.warn(`[rad-collector] ANALYZE item ${item.item_id} err:`, e); }
    }

    // Persist
    for (let i = 0; i < updateRows.length; i += 100) {
      const { error } = await supabase.from('listing_health_current').upsert(updateRows.slice(i, i+100), { onConflict: 'seller_id,item_id' });
      if (error) console.warn(`[rad-collector] ANALYZE upsert err:`, error.message);
    }
    if (newAlerts.length > 0) { const { error: ae } = await supabase.from('listing_health_alerts').insert(newAlerts); if (ae) console.warn('[rad-collector] alerts insert err:', ae.message); }
    if (newRecs.length > 0) { const { error: re } = await supabase.from('listing_health_recommendations').insert(newRecs); if (re) console.warn('[rad-collector] recs insert err:', re.message); }
    if (mediaRows.length > 0) {
      if (!itemId) await supabase.from('listing_media_analysis').delete().eq('seller_id', sellerId);
      else await supabase.from('listing_media_analysis').delete().eq('seller_id', sellerId).eq('item_id', itemId);
      for (let i = 0; i < mediaRows.length; i += 200) { const { error: me } = await supabase.from('listing_media_analysis').insert(mediaRows.slice(i,i+200)); if (me) console.warn('[rad-collector] media insert err:', me.message); }
    }

    // Run SEO analysis after main analysis
    const allItemIds = items.map((i: any) => i.item_id);
    if (Date.now() - startTime < SAFETY_TIMEOUT_MS - 15000) {
      await analyzeSeoForItems(supabase, sellerId, allItemIds, tenantId);
    } else {
      console.log(`[rad-collector] ANALYZE: skipping SEO (timeout approaching)`);
    }

    const dur = Date.now() - startTime;
    await supabase.from('listing_health_logs').insert({
      seller_id: sellerId, log_type: 'analysis', log_level: 'info', action: 'analyze_finished',
      message: `Done: ${analyzed} items, ${newAlerts.length} alerts, ${newRecs.length} recs`,
      metadata_json: { analyzed, errors: errCount, alerts: newAlerts.length, recs: newRecs.length, media: mediaRows.length },
      duration_ms: dur, items_processed: analyzed, errors_count: errCount,
    });

    console.log(`[rad-collector] ANALYZE done: ${analyzed} items, ${newAlerts.length} alerts, ${newRecs.length} recs, ${dur}ms`);
    return { success: true, analyzed, alerts_generated: newAlerts.length, recommendations_generated: newRecs.length, media_analyzed: mediaRows.length, errors: errCount, duration_ms: dur };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    await supabase.from('listing_health_logs').insert({ seller_id: sellerId, item_id: itemId||null, log_type:'analysis', log_level:'error', action:'analyze_failed', message: msg, duration_ms: Date.now()-startTime });
    return { success: false, error: msg };
  }
}

// ============================================================================
// NIGHTLY CRON — with seller cursor and self-chain for continuation
// ============================================================================
async function handleNightlyCron(supabase: any, lastProcessedSellerId?: string, skipSync?: boolean) {
  console.log(`[rad-collector] NIGHTLY CRON started (cursor: ${lastProcessedSellerId || "start"}, skipSync: ${!!skipSync})`);
  const startTime = Date.now();

  const { data: accounts } = await supabase
    .from("ml_accounts")
    .select("ml_user_id")
    .eq("is_active", true)
    .order("ml_user_id", { ascending: true });

  if (!accounts || accounts.length === 0) {
    console.log(`[rad-collector] No active accounts found`);
    return { success: true, message: "No active accounts" };
  }

  const sellerIds = [...new Set(accounts.map((a: any) => a.ml_user_id))].sort();
  
  // Find starting point from cursor
  let startIdx = 0;
  if (lastProcessedSellerId) {
    const idx = sellerIds.indexOf(lastProcessedSellerId);
    if (idx >= 0) startIdx = idx + 1;
  }

  console.log(`[rad-collector] Processing sellers ${startIdx + 1}–${sellerIds.length} of ${sellerIds.length}`);

  const results: any[] = [];
  let lastProcessed: string | null = null;

  for (let si = startIdx; si < sellerIds.length; si++) {
    const sellerId = sellerIds[si];
    const sellerStart = Date.now();

    try {
      // AJUSTE #5: Sync only if not skipped and last_sync_at is old (> 7 days)
      if (!skipSync) {
        const { data: lastSyncRow } = await supabase
          .from("meli_listings_cache")
          .select("last_sync_at")
          .eq("seller_id", sellerId)
          .order("last_sync_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastSyncAt = lastSyncRow?.last_sync_at ? new Date(lastSyncRow.last_sync_at).getTime() : 0;
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

        if (Date.now() - lastSyncAt > sevenDaysMs) {
          console.log(`[rad-collector] Seller ${sellerId}: sync needed (last sync > 7 days)`);
          await handleSync(supabase, sellerId, sellerStart);
        } else {
          console.log(`[rad-collector] Seller ${sellerId}: sync skipped (recent)`);
        }
      }

      // Collection always runs (eligibility is per-item)
      const collResult = await handleCollection(supabase, sellerId, Date.now());

      // Trigger backfill if needed
      const { data: backfillCtrl } = await supabase
        .from("radiography_backfill_control")
        .select("status")
        .eq("seller_id", sellerId)
        .maybeSingle();

      if (!backfillCtrl || backfillCtrl.status === "pending" || backfillCtrl.status === "paused") {
        selfChain(sellerId, "backfill", { chain_depth: 0 });
      }

      // Run intelligent analysis after collection
      selfChain(sellerId, "analyze");

      results.push({ seller_id: sellerId, collection: collResult });
      lastProcessed = sellerId;
    } catch (err) {
      console.error(`[rad-collector] Error processing seller ${sellerId}:`, err);
      results.push({ seller_id: sellerId, error: String(err) });
      lastProcessed = sellerId;
    }

    // Timeout check → self-chain nightly with cursor
    if (Date.now() - startTime > SAFETY_TIMEOUT_MS) {
      console.log(`[rad-collector] Nightly timeout, chaining from seller ${lastProcessed}`);
      selfChain(null, "nightly", { last_processed_seller_id: lastProcessed, skip_sync: true });
      return {
        success: true, partial: true,
        sellers_processed: results.length, total_sellers: sellerIds.length,
        last_processed_seller_id: lastProcessed,
        results,
      };
    }
  }

  console.log(`[rad-collector] NIGHTLY CRON complete: ${results.length}/${sellerIds.length} sellers`);
  return { success: true, sellers_processed: results.length, total_sellers: sellerIds.length, results };
}

// ============================================================================
// FLOW 9 — SAVE KEYWORD FEEDBACK
// ============================================================================
async function handleSaveKeywordFeedback(supabase: any, sellerId: string, itemId: string, keyword: string, isRelevant: boolean, tenantId?: string) {
  const { error } = await supabase.from('listing_keyword_feedback')
    .upsert({
      seller_id: sellerId, listing_id: itemId, keyword: normalizeText(keyword),
      is_relevant: isRelevant, source: 'manual', tenant_id: tenantId || null,
    }, { onConflict: 'seller_id,listing_id,keyword' });
  if (error) return { success: false, error: error.message };
  return { success: true, keyword, is_relevant: isRelevant };
}

// ============================================================================
// FLOW 10 — GENERATE TITLE SUGGESTIONS (60 char limit)
// ============================================================================
const MAX_TITLE_LENGTH = 60;
const TITLE_CONNECTORS = new Set(['de', 'para', 'com', 'e', 'a', 'o', 'em', 'no', 'na', 'do', 'da', 'por']);

function scoreTitleSuggestion(title: string, keywords: Array<{keyword: string; normalized: string; weight: number}>, variationAttrs: string[]): {score: number; breakdown: Record<string, number>} {
  const len = title.length;
  const normalizedTitle = normalizeText(title);
  const titleTokens = tokenize(title);

  let lengthScore = 0;
  if (len >= 50 && len <= 60) lengthScore = 20;
  else if (len >= 40 && len <= 60) lengthScore = 15;
  else if (len >= 30) lengthScore = 10;
  else lengthScore = 5;

  let kwFound = 0;
  for (const kw of keywords) {
    const kwTokens = kw.normalized.split(" ").filter(w => w.length > 2 && !SEO_STOPWORDS.has(w));
    if (kwTokens.length === 0) continue;
    const match = kwTokens.filter(t => titleTokens.some(tt => tt === t || tt.includes(t) || t.includes(tt))).length / kwTokens.length;
    if (match >= 0.7) kwFound++;
  }
  const kwScore = keywords.length > 0 ? Math.round((kwFound / Math.min(keywords.length, 10)) * 25) : 15;

  let adhScore = 0;
  let totalW = 0, matchW = 0;
  for (const kw of keywords.slice(0, 15)) {
    totalW += kw.weight;
    if (normalizedTitle.includes(kw.normalized)) matchW += kw.weight;
  }
  adhScore = totalW > 0 ? Math.round((matchW / totalW) * 20) : 10;

  let clarityScore = 15;
  for (const word of GENERIC_IRRELEVANT_WORDS) {
    if (normalizedTitle.includes(normalizeText(word))) clarityScore -= 3;
  }
  clarityScore = Math.max(0, clarityScore);

  let repScore = 10;
  const wordCount = new Map<string, number>();
  for (const t of titleTokens) wordCount.set(t, (wordCount.get(t) || 0) + 1);
  for (const [, c] of wordCount) { if (c >= 2) repScore -= 3; }
  repScore = Math.max(0, repScore);

  const unique = new Set(titleTokens);
  const semScore = unique.size >= 6 ? 10 : unique.size >= 4 ? 7 : unique.size >= 2 ? 4 : 2;

  const score = Math.min(100, lengthScore + kwScore + adhScore + clarityScore + repScore + semScore);
  return { score, breakdown: { length: lengthScore, keywords: kwScore, adherence: adhScore, clarity: clarityScore, repetition: repScore, semantic: semScore } };
}

function compressTitle(words: string[], maxLen: number): string {
  let title = words.join(' ');
  if (title.length <= maxLen) return title;
  while (title.length > maxLen && words.length > 1) {
    const last = words[words.length - 1].toLowerCase();
    if (TITLE_CONNECTORS.has(last)) { words.pop(); title = words.join(' '); } else break;
  }
  if (title.length <= maxLen) return title;
  while (title.length > maxLen && words.length > 2) { words.pop(); title = words.join(' '); }
  return title.slice(0, maxLen).trim();
}

async function handleGenerateTitle(supabase: any, sellerId: string, itemId: string, tenantId?: string) {
  const startTime = Date.now();
  console.log(`[rad-collector] GENERATE_TITLE: ${itemId} for seller ${sellerId}`);

  await supabase.from('title_suggestion_logs').insert({
    seller_id: sellerId, listing_id: itemId, tenant_id: tenantId || null,
    status: 'started', action: 'TITLE_GENERATION_STARTED',
  });

  try {
    const { data: listing, error: listingErr } = await supabase.from('meli_listings_cache')
      .select('item_id, title, category_id')
      .eq('item_id', itemId).eq('seller_id', sellerId).maybeSingle();
    if (listingErr) console.error('[rad-collector] GENERATE_TITLE listing fetch error:', listingErr);
    if (!listing?.title) return { success: false, error: 'Item not found in listings cache' };

    const currentTitle = listing.title;
    const categoryId = listing.category_id;

    // Variation attributes not available in meli_listings_cache - skip variation filtering
    // Future: fetch from API or analyzed_items if needed

    const { data: feedback } = await supabase.from('listing_keyword_feedback')
      .select('keyword, is_relevant').eq('seller_id', sellerId).eq('listing_id', itemId);
    const feedbackMap = new Map<string, boolean>();
    if (feedback) for (const f of feedback) feedbackMap.set(f.keyword, f.is_relevant);

    let keywords: Array<{keyword: string; normalized: string; weight: number}> = [];
    if (categoryId) {
      const { data: kws } = await supabase.from('market_keywords_cache')
        .select('keyword, normalized_keyword, weight')
        .eq('category_id', categoryId).order('weight', { ascending: false }).limit(30);
      if (kws) keywords = kws.map((k: any) => ({ keyword: k.keyword, normalized: k.normalized_keyword, weight: k.weight }));
    }

    const filteredKeywords = keywords.filter(kw => feedbackMap.get(kw.normalized) !== false);
    const validKeywords = filteredKeywords.filter(kw => {
      if (GENERIC_IRRELEVANT_WORDS.has(kw.keyword)) return false;
      return true;
    });

    const currentTokens = tokenize(currentTitle);
    const currentTokensClean = currentTokens.filter(t => {
      if (GENERIC_IRRELEVANT_WORDS.has(t)) return false;
      return true;
    });

    const wordPool: Array<{word: string; weight: number; source: string}> = [];
    const added = new Set<string>();
    for (const t of currentTokensClean) {
      if (!added.has(t) && t.length > 2 && !SEO_STOPWORDS.has(t)) {
        const kw = validKeywords.find(k => k.normalized === t || k.normalized.includes(t));
        wordPool.push({ word: t, weight: kw?.weight || 0.3, source: 'current' });
        added.add(t);
      }
    }
    for (const kw of validKeywords) {
      const kwTokens = kw.normalized.split(' ').filter(w => w.length > 2 && !SEO_STOPWORDS.has(w));
      for (const t of kwTokens) {
        if (!added.has(t)) { wordPool.push({ word: t, weight: kw.weight, source: 'category' }); added.add(t); }
      }
    }
    wordPool.sort((a, b) => b.weight - a.weight);

    const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
    const suggestions: Array<{title: string; score: number; length: number; breakdown: Record<string, number>}> = [];

    // Variation 1: Clean current
    const v1 = compressTitle(currentTokensClean.map(capitalize), MAX_TITLE_LENGTH);
    if (v1.length >= 10) { const r = scoreTitleSuggestion(v1, validKeywords, variationAttrs); suggestions.push({ title: v1, ...r, length: v1.length }); }

    // Variation 2: Keywords-first
    const v2 = compressTitle(wordPool.slice(0, 12).map(w => capitalize(w.word)), MAX_TITLE_LENGTH);
    if (v2.length >= 10) { const r = scoreTitleSuggestion(v2, validKeywords, variationAttrs); suggestions.push({ title: v2, ...r, length: v2.length }); }

    // Variation 3: Mixed
    const v3Words = [...currentTokensClean.slice(0, 5), ...wordPool.filter(w => w.source === 'category').slice(0, 5).map(m => m.word)];
    const v3 = compressTitle([...new Set(v3Words)].map(capitalize), MAX_TITLE_LENGTH);
    if (v3.length >= 10) { const r = scoreTitleSuggestion(v3, validKeywords, variationAttrs); suggestions.push({ title: v3, ...r, length: v3.length }); }

    // Variation 4: Compact
    const v4 = compressTitle(wordPool.slice(0, 8).map(w => capitalize(w.word)), MAX_TITLE_LENGTH);
    if (v4.length >= 10) { const r = scoreTitleSuggestion(v4, validKeywords, variationAttrs); suggestions.push({ title: v4, ...r, length: v4.length }); }

    // Variation 5: Original + top missing
    const topMissing = wordPool.filter(w => w.source === 'category' && !currentTokensClean.includes(w.word)).slice(0, 3);
    const v5 = compressTitle([...new Set([...currentTokensClean, ...topMissing.map(m => m.word)])].map(capitalize), MAX_TITLE_LENGTH);
    if (v5.length >= 10) { const r = scoreTitleSuggestion(v5, validKeywords, variationAttrs); suggestions.push({ title: v5, ...r, length: v5.length }); }

    const uniqueSuggestions = [...new Map(suggestions.map(s => [normalizeText(s.title), s])).values()]
      .sort((a, b) => b.score - a.score).slice(0, 5);
    const best = uniqueSuggestions[0] || null;

    const issues: string[] = [];
    if (currentTitle.length > 60) issues.push(`Título excede 60 caracteres (${currentTitle.length})`);
    if (currentTitle.length < 30) issues.push('Título muito curto — subutiliza o espaço disponível');
    const currentNormalized = normalizeText(currentTitle);
    for (const word of GENERIC_IRRELEVANT_WORDS) { if (currentNormalized.includes(normalizeText(word))) issues.push(`Termo genérico: "${word}"`); }
    for (const va of variationAttrs) { if (currentNormalized.includes(va) && va.length > 2) issues.push(`Variação no título: "${va}"`); }
    const missingImportant = validKeywords.filter(kw => !currentNormalized.includes(kw.normalized)).slice(0, 5);
    if (missingImportant.length > 0) issues.push(`Falta keyword: ${missingImportant.map(k => k.keyword).join(', ')}`);

    await supabase.from('title_suggestion_analysis').upsert({
      seller_id: sellerId, listing_id: itemId, tenant_id: tenantId || null,
      current_title: currentTitle, current_length: currentTitle.length,
      best_suggestion: best?.title || null, best_score: best?.score || 0,
      suggestions_json: uniqueSuggestions, issues_json: issues,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'seller_id,listing_id' });

    const dur = Date.now() - startTime;
    await supabase.from('title_suggestion_logs').insert({
      seller_id: sellerId, listing_id: itemId, tenant_id: tenantId || null,
      status: 'completed', action: 'TITLE_GENERATION_COMPLETED',
      score: best?.score || 0, execution_time_ms: dur,
      message: `${uniqueSuggestions.length} suggestions`,
      metadata_json: { current_length: currentTitle.length, best_length: best?.title?.length, keywords_used: validKeywords.length },
    });

    return { success: true, current_title: currentTitle, current_length: currentTitle.length, best, suggestions: uniqueSuggestions, issues, keywords_used: validKeywords.length, variation_attrs_excluded: variationAttrs, duration_ms: dur };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    await supabase.from('title_suggestion_logs').insert({
      seller_id: sellerId, listing_id: itemId, tenant_id: tenantId || null,
      status: 'error', action: 'TITLE_GENERATION_FAILED', message: msg, execution_time_ms: Date.now() - startTime,
    });
    return { success: false, error: msg };
  }
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
    const { seller_id, action, internal, chain_depth, last_processed_seller_id, skip_sync, start_index } = body;

    // Auth check
    if (!internal) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader && !authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    console.log(`[rad-collector] Action: ${action}, Seller: ${seller_id || "all"}`);
    const startTime = Date.now();
    let result: any;

    switch (action) {
      case "sync":
        if (!seller_id) return new Response(JSON.stringify({ error: "seller_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = await handleSync(supabase, seller_id, startTime);
        break;

      case "collection":
        if (!seller_id) return new Response(JSON.stringify({ error: "seller_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = await handleCollection(supabase, seller_id, startTime, start_index || 0);
        break;

      case "backfill":
        if (!seller_id) return new Response(JSON.stringify({ error: "seller_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = await handleBackfill(supabase, seller_id, chain_depth || 0);
        break;

      case "nightly":
        result = await handleNightlyCron(supabase, last_processed_seller_id, skip_sync);
        break;

      case "full":
        if (!seller_id) return new Response(JSON.stringify({ error: "seller_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const syncRes = await handleSync(supabase, seller_id, startTime);
        const collRes = await handleCollection(supabase, seller_id, Date.now(), 0);
        selfChain(seller_id, "backfill", { chain_depth: 0 });
        // Chain analyze to compute scores, media, catalog after collection
        selfChain(seller_id, "analyze");
        result = { sync: syncRes, collection: collRes, backfill: "triggered_async", analyze: "triggered_async" };
        break;

      case "enrich_sales":
        if (!seller_id) return new Response(JSON.stringify({ error: "seller_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = await handleEnrichSales(supabase, seller_id);
        break;

      case "analyze":
        if (!seller_id) return new Response(JSON.stringify({ error: "seller_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = await handleAnalyze(supabase, seller_id, body.item_id);
        break;

      case "refresh_keywords":
        result = await handleRefreshMarketKeywords(supabase, body.category_id);
        break;

      case "generate_title":
        if (!seller_id || !body.item_id) return new Response(JSON.stringify({ error: "seller_id and item_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = await handleGenerateTitle(supabase, seller_id, body.item_id, body.tenant_id);
        break;

      case "save_keyword_feedback":
        if (!seller_id || !body.item_id || !body.keyword) return new Response(JSON.stringify({ error: "seller_id, item_id, keyword required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = await handleSaveKeywordFeedback(supabase, seller_id, body.item_id, body.keyword, body.is_relevant ?? true, body.tenant_id);
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}. Use: sync, collection, backfill, nightly, full, enrich_sales, analyze, refresh_keywords, generate_title, save_keyword_feedback` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[rad-collector] Fatal error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
