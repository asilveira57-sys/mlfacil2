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
    .replace(/[^a-z0-9x\s]/g, " ")  // keep 'x' for measurements like 30x15
    .replace(/\s+/g, " ")
    .trim();
}

// Measurement pattern: digits+x+digits (e.g. 30x15, 110x74, 2x1)
const MEASUREMENT_RE = /^\d+x\d+$/;

function tokenize(text: string): string[] {
  return normalizeText(text).split(" ").filter(w => {
    if (SEO_STOPWORDS.has(w)) return false;
    if (MEASUREMENT_RE.test(w)) return true;  // keep measurements regardless of length
    return w.length > 2;
  });
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

// --- CONTEXTUAL KEYWORD FILTER: only keep keywords relevant to the product ---
function filterKeywordsByProductContext(
  catKeywords: Array<{ keyword: string; normalized: string; weight: number }>,
  productTokens: Set<string>,
): { filtered: Array<{ keyword: string; normalized: string; weight: number }>; discarded: string[] } {
  const filtered: Array<{ keyword: string; normalized: string; weight: number }> = [];
  const discarded: string[] = [];

  for (const kw of catKeywords) {
    const kwTokens = kw.normalized.split(" ").filter(w => {
      if (SEO_STOPWORDS.has(w)) return false;
      if (MEASUREMENT_RE.test(w)) return true;
      return w.length > 2;
    });
    if (kwTokens.length === 0) { discarded.push(kw.keyword); continue; }

    // A keyword is relevant if at least 1 of its tokens overlaps with any product token
    const hasOverlap = kwTokens.some(kt =>
      [...productTokens].some(pt => pt === kt || pt.includes(kt) || kt.includes(pt))
    );

    if (hasOverlap) {
      filtered.push(kw);
    } else {
      discarded.push(kw.keyword);
    }
  }

  return { filtered: filtered.slice(0, 20), discarded };
}

// Build product context tokens from all available fields
function buildProductTokens(title: string, description: string | null, attributes: any[], model?: string): Set<string> {
  const parts: string[] = [];
  parts.push(title);
  if (description) parts.push(description);
  for (const a of attributes) {
    if (a.value_name) parts.push(a.value_name);
    if (a.name) parts.push(a.name);
  }
  if (model) parts.push(model);
  const combined = parts.join(' ');
  const tokens = tokenize(combined);
  return new Set(tokens);
}

// --- 4-LAYER SEO ANALYSIS ---

function computeTitleSeo(title: string, catKeywords: Array<{keyword: string; normalized: string; weight: number}>): {
  score: number; issues: string[]; suggestions: string[];
  positives: string[]; negatives: string[]; improvement_actions: string[]; summary: string;
  length: number; limit_status: string; matched_keywords: string[]; missing_keywords: string[];
} {
  let score = 0;
  const issues: string[] = [];
  const suggestions: string[] = [];
  const positives: string[] = [];
  const negatives: string[] = [];
  const improvement_actions: string[] = [];
  const matched_keywords: string[] = [];
  const missing_keywords: string[] = [];
  const titleLen = title.length;
  let limit_status = 'ok';

  // Length: 50-60 ideal → +30
  if (titleLen >= 50 && titleLen <= 60) {
    score += 30;
    positives.push(`Título com ${titleLen} caracteres — dentro da faixa ideal (50-60)`);
  } else if (titleLen >= 40 && titleLen <= 70) {
    score += 22;
    if (titleLen > 60) {
      limit_status = 'above_limit';
      negatives.push(`Título com ${titleLen} caracteres — excede o limite de 60`);
      improvement_actions.push(`Reduza ${titleLen - 60} caracteres do título para ficar no limite ideal`);
    } else {
      limit_status = 'short';
      negatives.push(`Título com ${titleLen} caracteres — abaixo da faixa ideal de 50-60`);
      improvement_actions.push(`Adicione mais ${50 - titleLen} caracteres com termos relevantes`);
    }
  } else if (titleLen >= 30) {
    score += 12;
    limit_status = 'short';
    negatives.push(`Título com apenas ${titleLen} caracteres — muito curto para SEO`);
    improvement_actions.push('Expanda o título para 50-60 caracteres com termos relevantes da categoria');
  } else {
    limit_status = 'very_short';
    issues.push('Título muito curto');
    negatives.push(`Título com apenas ${titleLen} caracteres — prejudica a descoberta do anúncio`);
    suggestions.push('Expanda o título para 50-60 caracteres com termos relevantes');
    improvement_actions.push('Expanda o título para 50-60 caracteres usando palavras-chave da categoria');
  }
  if (titleLen > 60) { issues.push(`Título excede 60 caracteres (${titleLen})`); suggestions.push('Reduza o título para no máximo 60 caracteres'); }

  // Keyword presence in title → +40
  const titleTokens = tokenize(title);
  const titleNorm = normalizeText(title);
  let kwFoundCount = 0;
  for (const kw of catKeywords.slice(0, 15)) {
    if (checkKeywordInText(kw.keyword, titleNorm)) {
      kwFoundCount++;
      matched_keywords.push(kw.keyword);
    } else {
      missing_keywords.push(kw.keyword);
    }
  }
  const kwRatio = catKeywords.length > 0 ? kwFoundCount / Math.min(catKeywords.length, 15) : 0;
  score += Math.round(kwRatio * 40);

  if (kwRatio >= 0.5) {
    positives.push(`Boa presença de palavras-chave da categoria (${kwFoundCount} de ${Math.min(catKeywords.length, 15)} encontradas)`);
  } else if (kwRatio >= 0.2) {
    negatives.push(`Cobertura parcial de palavras-chave (${kwFoundCount} de ${Math.min(catKeywords.length, 15)})`);
    if (missing_keywords.length > 0) {
      improvement_actions.push(`Inclua palavras-chave importantes como: ${missing_keywords.slice(0, 3).join(', ')}`);
    }
  } else if (catKeywords.length > 0) {
    issues.push('Baixa presença de palavras-chave da categoria no título');
    negatives.push(`Apenas ${kwFoundCount} palavra(s)-chave da categoria encontrada(s) no título`);
    suggestions.push('Adicione termos mais buscados da categoria');
    if (missing_keywords.length > 0) {
      improvement_actions.push(`Priorize incluir: ${missing_keywords.slice(0, 4).join(', ')}`);
    }
  }

  // Word variety → +20
  const uniqueTokens = new Set(titleTokens);
  if (uniqueTokens.size >= 6) {
    score += 20;
    positives.push(`Boa variedade semântica no título (${uniqueTokens.size} termos únicos)`);
  } else if (uniqueTokens.size >= 4) {
    score += 14;
  } else if (uniqueTokens.size >= 2) {
    score += 7;
    negatives.push('Baixa variedade de termos no título');
  } else {
    issues.push('Baixa variação semântica no título');
    negatives.push('Título com poucos termos — dificulta a descoberta');
  }

  // Repetition penalty
  const wordCount = new Map<string, number>();
  for (const t of titleTokens) wordCount.set(t, (wordCount.get(t) || 0) + 1);
  for (const [w, c] of wordCount) {
    if (c >= 3) {
      score -= 10;
      issues.push(`Palavra "${w}" repetida ${c}x no título`);
      negatives.push(`Repetição excessiva de "${w}" (${c}x) — penaliza o SEO`);
      improvement_actions.push(`Remova repetições de "${w}" e substitua por sinônimos ou termos complementares`);
    }
  }

  // Generic words penalty
  for (const t of titleTokens) {
    if (GENERIC_IRRELEVANT_WORDS.has(t)) {
      score -= 5;
      issues.push(`Termo genérico "${t}" no título`);
      negatives.push(`Termo "${t}" é genérico e não contribui para buscas`);
      improvement_actions.push(`Substitua "${t}" por um termo mais específico da categoria`);
    }
  }

  const finalScore = Math.max(0, Math.min(score, 100));

  // Summary
  let summary = '';
  if (finalScore >= 70) summary = 'Título bem otimizado, com boa cobertura de palavras-chave e aproveitamento do espaço.';
  else if (finalScore >= 40) summary = `Título acima do básico, mas ainda pode melhorar ${titleLen > 60 ? 'reduzindo caracteres e' : ''} ${kwFoundCount < 3 ? 'incluindo mais palavras-chave relevantes' : 'otimizando a escolha de termos'}.`;
  else summary = 'Título fraco para SEO — precisa de revisão significativa nos termos e no aproveitamento do espaço.';

  return { score: finalScore, issues, suggestions, positives, negatives, improvement_actions, summary, length: titleLen, limit_status, matched_keywords, missing_keywords };
}

function computeDescriptionSeo(description: string | null, title: string, catKeywords: Array<{keyword: string; normalized: string; weight: number}>): {
  score: number; length: number; density: number; issues: string[]; suggestions: string[];
  positives: string[]; negatives: string[]; improvement_actions: string[]; summary: string;
  length_status: string; matched_keywords: string[]; missing_keywords: string[];
  description_preview: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const positives: string[] = [];
  const negatives: string[] = [];
  const improvement_actions: string[] = [];
  const matched_keywords: string[] = [];
  const missing_keywords: string[] = [];
  const desc = (description || '').trim();
  const descLen = desc.length;
  let score = 0;
  let length_status = 'empty';

  // Length → +40
  if (descLen >= 500) {
    score += 40;
    length_status = 'strong';
    positives.push(`Descrição com ${descLen} caracteres — boa extensão para SEO`);
  } else if (descLen >= 300) {
    score += 25;
    length_status = 'acceptable';
    issues.push(`Descrição com ${descLen} caracteres (ideal: 500+)`);
    negatives.push(`Descrição com ${descLen} caracteres — aceitável, mas abaixo do ideal de 500+`);
    suggestions.push('Aumente a descrição para mais de 500 caracteres');
    improvement_actions.push(`Adicione mais ${500 - descLen} caracteres com detalhes sobre uso, material e aplicação do produto`);
  } else if (descLen >= 100) {
    score += 12;
    length_status = 'short';
    issues.push('Descrição muito curta para SEO');
    negatives.push(`Descrição com apenas ${descLen} caracteres — muito curta para indexação`);
    suggestions.push('Expanda a descrição com detalhes do produto, benefícios e especificações');
    improvement_actions.push('Crie uma descrição completa com no mínimo 500 caracteres incluindo especificações, benefícios e aplicações');
  } else if (descLen > 0) {
    score += 5;
    length_status = 'very_short';
    issues.push('Descrição extremamente curta');
    negatives.push(`Descrição com apenas ${descLen} caracteres — praticamente inexistente para SEO`);
    suggestions.push('Crie uma descrição completa com no mínimo 500 caracteres');
    improvement_actions.push('Reescreva a descrição com pelo menos 500 caracteres, incluindo detalhes técnicos, benefícios e aplicações');
  } else {
    length_status = 'empty';
    issues.push('Sem descrição');
    negatives.push('Anúncio sem descrição — impacto negativo forte no SEO');
    suggestions.push('Adicione uma descrição detalhada do produto');
    improvement_actions.push('Crie uma descrição completa com no mínimo 500 caracteres');
  }

  // Keyword density → +30
  let density = 0;
  if (descLen > 20) {
    const descTokens = tokenize(desc);
    const descNorm = normalizeText(desc);
    let kwFound = 0;
    for (const kw of catKeywords.slice(0, 15)) {
      if (checkKeywordInText(kw.keyword, descNorm)) {
        kwFound++;
        matched_keywords.push(kw.keyword);
      } else {
        missing_keywords.push(kw.keyword);
      }
    }
    density = descTokens.length > 0 ? kwFound / descTokens.length : 0;
    const densityScore = catKeywords.length > 0 ? kwFound / Math.min(catKeywords.length, 15) : 0;
    if (densityScore >= 0.3) {
      score += 30;
      positives.push(`Boa cobertura de palavras-chave na descrição (${kwFound} termos encontrados)`);
    } else if (densityScore >= 0.15) {
      score += 20;
      negatives.push(`Cobertura parcial de palavras-chave na descrição (${kwFound} de ${Math.min(catKeywords.length, 15)})`);
      if (missing_keywords.length > 0) {
        improvement_actions.push(`Inclua naturalmente na descrição: ${missing_keywords.slice(0, 3).join(', ')}`);
      }
    } else if (densityScore > 0) {
      score += 10;
      negatives.push(`Poucas palavras-chave da categoria na descrição (apenas ${kwFound})`);
      suggestions.push('Insira palavras-chave naturalmente na descrição');
      if (missing_keywords.length > 0) {
        improvement_actions.push(`Adicione termos relevantes como: ${missing_keywords.slice(0, 4).join(', ')}`);
      }
    } else if (catKeywords.length > 0) {
      negatives.push('Nenhuma palavra-chave relevante encontrada na descrição');
      suggestions.push('Inclua termos relevantes da categoria na descrição');
      improvement_actions.push('Reescreva a descrição incorporando as palavras-chave mais buscadas da categoria');
    }
  }

  // Not just title repetition → +15
  if (descLen > 0) {
    const titleNorm = normalizeText(title);
    const descNorm = normalizeText(desc);
    if (descNorm === titleNorm || (descLen < titleNorm.length * 1.5 && descNorm.includes(titleNorm))) {
      issues.push('Descrição é apenas repetição do título');
      negatives.push('Descrição repete o título sem acrescentar informação');
      improvement_actions.push('Diferencie a descrição do título — adicione especificações, benefícios e contexto de uso');
    } else {
      score += 15;
      positives.push('Descrição diferente do título — bom para indexação');
    }
  }

  // Context coherence → +15
  if (descLen >= 100) {
    score += 15;
    if (descLen >= 300) positives.push('Descrição com contexto suficiente para indexação');
  }

  const finalScore = Math.max(0, Math.min(score, 100));

  let summary = '';
  if (finalScore >= 70) summary = `Descrição com boa base de texto (${descLen} chars) e cobertura razoável de palavras-chave.`;
  else if (finalScore >= 40) summary = `Descrição existe mas ${descLen < 500 ? 'ainda precisa ser expandida' : 'falta cobertura de palavras-chave relevantes da categoria'}.`;
  else summary = descLen === 0 ? 'Sem descrição — impacto significativo no SEO do anúncio.' : `Descrição muito curta (${descLen} chars) e com pouca relevância para buscas.`;

  return {
    score: finalScore, length: descLen, density: Number(density.toFixed(4)), issues, suggestions,
    positives, negatives, improvement_actions, summary, length_status,
    matched_keywords, missing_keywords,
    description_preview: desc.slice(0, 500),
  };
}

function computeAttributesSeo(attributes: any[]): {
  score: number; missing: string[]; weak: string[]; issues: string[]; suggestions: string[]; total: number; filled: number;
  positives: string[]; negatives: string[]; improvement_actions: string[]; summary: string;
  strong_attributes: string[]; weak_attributes_detail: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const positives: string[] = [];
  const negatives: string[] = [];
  const improvement_actions: string[] = [];
  const missing: string[] = [];
  const weak: string[] = [];
  const strong_attributes: string[] = [];
  const weak_attributes_detail: string[] = [];

  if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
    return { score: 0, missing: [], weak: [], issues: ['Ficha técnica não disponível'], suggestions: ['Preencha os atributos do anúncio'], total: 0, filled: 0, positives: [], negatives: ['Ficha técnica sem dados — impossível avaliar'], improvement_actions: ['Preencha a ficha técnica do anúncio com todos os atributos disponíveis'], summary: 'Ficha técnica indisponível — impacta negativamente o SEO.', strong_attributes: [], weak_attributes_detail: [] };
  }

  const total = attributes.length;
  let filled = 0;
  const genericValues = new Set(['outro', 'outros', 'genérico', 'generico', 'não informado', 'nao informado', 'n/a', '-', 'não se aplica', 'na']);
  const importantAttrs = new Set(['marca', 'brand', 'modelo', 'model', 'material', 'tipo', 'type', 'cor', 'color', 'tamanho', 'size', 'peso', 'weight', 'voltagem', 'voltage', 'compatibilidade', 'uso', 'aplicação', 'acabamento', 'dimensão', 'tecnologia']);

  for (const attr of attributes) {
    const valueName = (attr.value_name || '').trim();
    const attrName = attr.name || attr.id || 'Unknown';
    const attrId = (attr.id || '').toLowerCase();
    const isImportant = importantAttrs.has(attrId) || importantAttrs.has((attr.name || '').toLowerCase());

    if (!valueName || valueName === '') {
      missing.push(attrName);
      if (isImportant) {
        improvement_actions.push(`Preencha o atributo "${attrName}" — é relevante para buscas`);
      }
    } else if (genericValues.has(valueName.toLowerCase())) {
      weak.push(`${attrName}: "${valueName}"`);
      weak_attributes_detail.push(`${attrName} → "${valueName}" (valor genérico)`);
      filled++;
      if (isImportant) {
        improvement_actions.push(`Substitua o valor genérico de "${attrName}" por um valor específico e pesquisável`);
      }
    } else {
      filled++;
      if (isImportant) {
        strong_attributes.push(`${attrName}: ${valueName}`);
      }
    }
  }

  let score = 0;
  const ratio = total > 0 ? filled / total : 0;

  // Fill ratio → +60
  if (ratio >= 0.8) {
    score += 60;
    positives.push(`Ficha técnica ${Math.round(ratio * 100)}% preenchida (${filled}/${total} atributos)`);
  } else if (ratio >= 0.5) {
    score += 40;
    issues.push(`Ficha técnica ${Math.round(ratio * 100)}% preenchida`);
    negatives.push(`Ficha técnica com ${Math.round(ratio * 100)}% de preenchimento — pode melhorar`);
    suggestions.push('Complete os atributos faltantes para melhorar indexação');
    improvement_actions.push(`Preencha os ${missing.length} atributos faltantes para melhorar a indexação`);
  } else {
    score += Math.round(ratio * 50);
    issues.push(`Ficha técnica apenas ${Math.round(ratio * 100)}% preenchida`);
    negatives.push(`Ficha técnica com apenas ${Math.round(ratio * 100)}% de preenchimento — impacto negativo`);
    suggestions.push('Preencha pelo menos 80% dos atributos');
    improvement_actions.push('Priorize preencher os atributos mais relevantes para buscas: marca, material, tipo, dimensão');
  }

  // Quality → +25
  if (weak.length === 0 && filled > 0) {
    score += 25;
    positives.push('Nenhum atributo com valor genérico — boa qualidade');
  } else if (weak.length <= 2) {
    score += 15;
    negatives.push(`${weak.length} atributo(s) com valor genérico`);
  } else {
    issues.push(`${weak.length} atributos com valores genéricos`);
    negatives.push(`${weak.length} atributos com valores genéricos — reduz qualidade da ficha`);
    suggestions.push('Substitua valores genéricos por informações específicas');
  }

  // Relevance → +15
  if (total >= 10 && filled >= 8) {
    score += 15;
    positives.push('Quantidade robusta de atributos preenchidos');
  } else if (total >= 5 && filled >= 4) { score += 10; }

  if (strong_attributes.length > 0) positives.push(`Atributos fortes: ${strong_attributes.slice(0, 5).join(', ')}`);

  const finalScore = Math.max(0, Math.min(score, 100));
  let summary = '';
  if (finalScore >= 80) summary = `Ficha técnica bem preenchida (${Math.round(ratio * 100)}%), sem lacunas relevantes identificadas.`;
  else if (finalScore >= 50) summary = `Ficha técnica com base razoável, mas ${missing.length > 0 ? `faltam ${missing.length} atributos` : `${weak.length} atributos têm valores genéricos`}.`;
  else summary = `Ficha técnica fraca — ${missing.length > 0 ? `${missing.length} atributos vazios` : 'dados insuficientes'} prejudicam a indexação.`;

  return { score: finalScore, missing: missing.slice(0, 10), weak: weak.slice(0, 10), issues, suggestions, total, filled, positives, negatives, improvement_actions, summary, strong_attributes: strong_attributes.slice(0, 10), weak_attributes_detail: weak_attributes_detail.slice(0, 10) };
}

function computeModelSeo(attributes: any[]): {
  score: number; modelValue: string | null; issues: string[]; suggestions: string[];
  positives: string[]; negatives: string[]; improvement_actions: string[]; summary: string;
  brand_value: string | null; is_search_friendly: boolean;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const positives: string[] = [];
  const negatives: string[] = [];
  const improvement_actions: string[] = [];

  if (!attributes || !Array.isArray(attributes)) {
    return { score: 0, modelValue: null, issues: ['Atributos não disponíveis para verificar modelo'], suggestions: [], positives: [], negatives: ['Dados de atributos indisponíveis'], improvement_actions: [], summary: 'Não foi possível avaliar o campo modelo — dados indisponíveis.', brand_value: null, is_search_friendly: false };
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
  let is_search_friendly = false;

  const genericValues = new Set(['outro', 'outros', 'genérico', 'generico', 'não informado', 'nao informado', 'n/a', '-', 'não se aplica', 'na', 'sem modelo', 'sem marca']);

  // Model evaluation → +60
  if (modelValue && !genericValues.has(modelValue.toLowerCase())) {
    // Check length and specificity — short models are weak
    const modelLen = modelValue.trim().length;
    if (modelLen >= 15 && /[a-zA-Z0-9]/.test(modelValue)) {
      score += 60;
      score += 20; // search friendly bonus
      is_search_friendly = true;
      positives.push(`Modelo "${modelValue}" — específico e pesquisável (${modelLen} caracteres)`);
    } else if (modelLen >= 8 && /[a-zA-Z0-9]/.test(modelValue)) {
      score += 45;
      is_search_friendly = true;
      positives.push(`Modelo "${modelValue}" — razoável, mas pode ser mais descritivo`);
      suggestions.push('Aproveite melhor o campo modelo — adicione palavras-chave relevantes para busca');
      improvement_actions.push(`O campo modelo suporta até 60 caracteres. Você está usando ${modelLen}. Aproveite o espaço para incluir termos de busca relevantes.`);
    } else if (modelLen >= 3) {
      score += 25;
      issues.push('Modelo muito curto');
      negatives.push(`Modelo "${modelValue}" é curto (${modelLen} caracteres) — pouco aproveitamento do espaço`);
      suggestions.push('Amplie o campo modelo com termos pesquisáveis relacionados ao produto');
      improvement_actions.push(`O campo modelo aceita até 60 caracteres. Você está usando apenas ${modelLen}. Insira mais palavras-chave relevantes.`);
    } else {
      score += 10;
      issues.push('Modelo muito curto e pouco útil');
      negatives.push(`Modelo "${modelValue}" é muito curto para gerar descoberta em buscas`);
      suggestions.push('Use um modelo mais descritivo para facilitar buscas');
      improvement_actions.push('Informe um modelo mais específico que os compradores possam pesquisar');
    }
  } else if (modelValue && genericValues.has(modelValue.toLowerCase())) {
    score += 10;
    issues.push('Campo modelo com valor genérico');
    negatives.push(`Campo modelo preenchido com "${modelValue}" — valor genérico que não ajuda na busca`);
    suggestions.push('Substitua o valor genérico por um modelo real do produto');
    improvement_actions.push('Preencha com o modelo real do produto (ex: código do fabricante, referência comercial)');
  } else {
    // EMPTY MODEL = cannot be 100
    issues.push('Campo modelo vazio');
    negatives.push('Campo modelo vazio — oportunidade perdida de ser encontrado por modelo');
    suggestions.push('Adicione o modelo do produto para melhorar a descoberta');
    improvement_actions.push('Preencha com o modelo real e pesquisável do produto. O campo aceita até 60 caracteres — use-os!');
  }

  // Brand bonus → +20
  if (brandValue && !genericValues.has(brandValue.toLowerCase())) {
    score += 20;
    positives.push(`Marca "${brandValue}" — preenchida e específica`);
  } else {
    negatives.push(brandValue ? `Marca "${brandValue}" é genérica` : 'Campo marca vazio');
    suggestions.push('Preencha a marca do produto');
    improvement_actions.push('Informe a marca real do produto — compradores buscam por marca');
  }

  const finalScore = Math.max(0, Math.min(score, 100));
  let summary = '';
  if (finalScore >= 70) summary = 'Modelo e marca bem preenchidos — contribuem positivamente para a descoberta do anúncio.';
  else if (finalScore >= 40) summary = `Campo modelo ${modelValue ? 'preenchido mas pode ser mais específico' : 'precisa ser preenchido'} para melhorar a indexação.`;
  else summary = `Campo modelo ${modelValue ? `com valor "${modelValue}" — insuficiente` : 'vazio'} — prejudica a descoberta do anúncio em buscas.`;

  return { score: finalScore, modelValue, issues, suggestions, positives, negatives, improvement_actions, summary, brand_value: brandValue, is_search_friendly };
}

// --- KEYWORD ADHERENCE (multi-field: title + description + attributes) ---
function computeKeywordAdherenceMultiField(
  titleText: string,
  descriptionText: string | null,
  attributeTexts: string[],
  keywords: Array<{ keyword: string; normalized: string; weight: number }>
): {
  score: number;
  coverage_ratio: number;
  found: string[];
  missing: string[];
  irrelevant: string[];
  details: Array<{ keyword: string; weight: number; matched_in_title: boolean; matched_in_description: boolean; matched_in_attributes: boolean; matched_overall: boolean }>;
} {
  if (keywords.length === 0) return { score: 0, coverage_ratio: 0, found: [], missing: [], irrelevant: [], details: [] };

  const titleNorm = normalizeText(titleText);
  const titleTokens = tokenize(titleText);
  const descNorm = descriptionText ? normalizeText(descriptionText) : '';
  const attrNorm = attributeTexts.map(a => normalizeText(a)).join(' ');

  let totalWeightedScore = 0;
  let maxPossibleScore = 0;
  const found: string[] = [];
  const missing: string[] = [];
  const details: Array<{ keyword: string; weight: number; matched_in_title: boolean; matched_in_description: boolean; matched_in_attributes: boolean; matched_overall: boolean }> = [];

  for (const kw of keywords) {
    const kwTokens = kw.normalized.split(" ").filter(w => {
      if (SEO_STOPWORDS.has(w)) return false;
      if (MEASUREMENT_RE.test(w)) return true;
      return w.length > 2;
    });
    if (kwTokens.length === 0) continue;
    maxPossibleScore += kw.weight;

    // Mode A: token match (partial — each token of the keyword checked individually)
    const titleMatchRatio = kwTokens.filter(t => titleTokens.some(tt => tt === t || tt.includes(t) || t.includes(tt))).length / kwTokens.length;
    const matchedInTitle = titleMatchRatio >= 0.7;

    // Mode B: also check description and attributes for compound terms
    const matchedInDesc = descNorm ? checkKeywordInText(kw.keyword, descNorm) : false;
    const matchedInAttrs = attrNorm ? checkKeywordInText(kw.keyword, attrNorm) : false;
    const matchedOverall = matchedInTitle || matchedInDesc || matchedInAttrs;

    // Weighted scoring: title match = full weight, desc/attrs = partial
    if (matchedOverall) {
      const fieldWeight = matchedInTitle ? 1.0 : matchedInDesc ? 0.7 : 0.5;
      totalWeightedScore += kw.weight * fieldWeight;
      found.push(kw.keyword);
    }

    details.push({ keyword: kw.keyword, weight: kw.weight, matched_in_title: matchedInTitle, matched_in_description: matchedInDesc, matched_in_attributes: matchedInAttrs, matched_overall: matchedOverall });

    if (!matchedOverall) missing.push(kw.keyword);
  }

  const coverage_ratio = keywords.length > 0 ? found.length / keywords.length : 0;
  const score = maxPossibleScore > 0 ? Math.round((totalWeightedScore / maxPossibleScore) * 100) : 0;

  // Detect irrelevant words in title
  const irrelevant: string[] = [];
  const titleJoined = titleTokens.join(' ');
  for (const word of GENERIC_IRRELEVANT_WORDS) { if (titleJoined.includes(normalizeText(word))) irrelevant.push(word); }
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
      const rawCatKeywords = (keywordsByCategory.get(detail.category_id) || []).slice(0, 50);
      const extras = itemExtras.get(itemId) || { description: null, attributes: [] };

      // Build product context tokens from all available fields
      const modelAttr = (extras.attributes || []).find((a: any) => a.id === 'MODEL' || a.id === 'ALPHANUMERIC_MODEL');
      const productTokens = buildProductTokens(detail.title, extras.description, extras.attributes || [], modelAttr?.value_name || '');

      // Filter keywords by product context — only keep relevant ones
      const { filtered: catKeywords, discarded: discardedKeywords } = filterKeywordsByProductContext(rawCatKeywords, productTokens);
      console.log(`[rad-collector] SEO item ${itemId}: ${rawCatKeywords.length} raw kws → ${catKeywords.length} relevant, ${discardedKeywords.length} discarded`);

      // Layer 1: Title (40%)
      const titleResult = computeTitleSeo(detail.title, catKeywords);

      // Layer 2: Description (25%)
      const descResult = computeDescriptionSeo(extras.description, detail.title, catKeywords);

      // Layer 3: Attributes (20%)
      const attrResult = computeAttributesSeo(extras.attributes);

      // Layer 4: Model (15%)
      const modelResult = computeModelSeo(extras.attributes);

      // Keyword adherence (multi-field: title + description + attributes)
      const attrTexts = (extras.attributes || []).map((a: any) => `${a.name || ''} ${a.value_name || ''}`);
      const adherence = computeKeywordAdherenceMultiField(detail.title, extras.description, attrTexts, catKeywords);

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

      // Category keyword details with match locations
      const categoryKeywordDetails = adherence.details.map(d => ({
        keyword: d.keyword,
        weight: d.weight,
        matched_in_title: d.matched_in_title,
        matched_in_description: d.matched_in_description,
        matched_in_attributes: d.matched_in_attributes,
        matched_overall: d.matched_overall,
      }));

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
          title: {
            score: titleResult.score, length: titleResult.length, limit_status: titleResult.limit_status,
            matched_keywords: titleResult.matched_keywords, missing_keywords: titleResult.missing_keywords,
            positives: titleResult.positives, negatives: titleResult.negatives,
            improvement_actions: titleResult.improvement_actions, summary: titleResult.summary,
            issues: titleResult.issues, suggestions: titleResult.suggestions,
          },
          description: {
            score: descResult.score, length: descResult.length, density: descResult.density, length_status: descResult.length_status,
            matched_keywords: descResult.matched_keywords, missing_keywords: descResult.missing_keywords,
            positives: descResult.positives, negatives: descResult.negatives,
            improvement_actions: descResult.improvement_actions, summary: descResult.summary,
            description_preview: descResult.description_preview,
            issues: descResult.issues, suggestions: descResult.suggestions,
          },
          attributes: {
            score: attrResult.score, total: attrResult.total, filled: attrResult.filled,
            missing: attrResult.missing, weak: attrResult.weak,
            strong_attributes: attrResult.strong_attributes, weak_attributes_detail: attrResult.weak_attributes_detail,
            positives: attrResult.positives, negatives: attrResult.negatives,
            improvement_actions: attrResult.improvement_actions, summary: attrResult.summary,
            issues: attrResult.issues, suggestions: attrResult.suggestions,
          },
          model: {
            score: modelResult.score, value: modelResult.modelValue, brand_value: modelResult.brand_value,
            is_search_friendly: modelResult.is_search_friendly,
            positives: modelResult.positives, negatives: modelResult.negatives,
            improvement_actions: modelResult.improvement_actions, summary: modelResult.summary,
            issues: modelResult.issues, suggestions: modelResult.suggestions,
          },
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
          details: categoryKeywordDetails,
          title_analysis: {
            score: titleResult.score, length: titleResult.length, limit_status: titleResult.limit_status,
            matched_keywords: titleResult.matched_keywords.slice(0, 10), missing_keywords: titleResult.missing_keywords.slice(0, 10),
            positives: titleResult.positives, negatives: titleResult.negatives,
            improvement_actions: titleResult.improvement_actions, summary: titleResult.summary,
          },
          description_analysis: {
            score: descResult.score, length: descResult.length, density: descResult.density, length_status: descResult.length_status,
            matched_keywords: descResult.matched_keywords.slice(0, 10), missing_keywords: descResult.missing_keywords.slice(0, 10),
            positives: descResult.positives, negatives: descResult.negatives,
            improvement_actions: descResult.improvement_actions, summary: descResult.summary,
            description_preview: descResult.description_preview,
          },
          attributes_analysis: {
            score: attrResult.score, filled_ratio: attrResult.total > 0 ? (attrResult.filled / attrResult.total) : 0,
            total: attrResult.total, filled: attrResult.filled,
            strong_attributes: attrResult.strong_attributes.slice(0, 8), weak_attributes_detail: attrResult.weak_attributes_detail.slice(0, 5),
            missing: attrResult.missing.slice(0, 5),
            positives: attrResult.positives, negatives: attrResult.negatives,
            improvement_actions: attrResult.improvement_actions, summary: attrResult.summary,
          },
          model_analysis: {
            score: modelResult.score, current_value: modelResult.modelValue, brand_value: modelResult.brand_value,
            is_search_friendly: modelResult.is_search_friendly,
            positives: modelResult.positives, negatives: modelResult.negatives,
            improvement_actions: modelResult.improvement_actions, summary: modelResult.summary,
          },
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
  traffic: 15, conversion: 15, content: 10, stock: 15, logistics: 10, catalog: 5, coverage: 5, seo: 15, wholesale: 10,
};

// --- WHOLESALE ANALYSIS ---
interface WholesaleAnalysis {
  score: number;
  account_type: 'cpf' | 'cnpj' | 'unknown';
  is_eligible: boolean;
  has_wholesale_layer: boolean;
  has_valid_ranges: boolean;
  ranges_count: number;
  is_linked_to_listing: boolean;
  status: 'not_eligible' | 'not_configured' | 'partial' | 'active';
  summary: string;
  positives: string[];
  negatives: string[];
  improvement_actions: string[];
  cta_available: boolean;
}

async function detectAccountType(supabase: any, token: string | null, sellerId: string): Promise<'cpf' | 'cnpj' | 'unknown'> {
  if (!token) return 'unknown';
  try {
    const resp = await fetch(`https://api.mercadolibre.com/users/${sellerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return 'unknown';
    const user = await resp.json();
    const idType = (user?.identification?.type || '').toUpperCase();
    if (idType === 'CNPJ') return 'cnpj';
    if (idType === 'CPF') return 'cpf';
    // Also check company info
    if (user?.company?.corporate_name || user?.company?.brand_name) return 'cnpj';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function analyzeWholesaleForItem(
  supabase: any,
  itemId: string,
  sellerId: string,
  accountType: 'cpf' | 'cnpj' | 'unknown',
  tenantId: string | null,
  token: string | null,
): Promise<WholesaleAnalysis> {
  // CPF → not eligible
  if (accountType === 'cpf') {
    return {
      score: 0, account_type: 'cpf', is_eligible: false,
      has_wholesale_layer: false, has_valid_ranges: false, ranges_count: 0, is_linked_to_listing: false,
      status: 'not_eligible',
      summary: 'Preço por atacado disponível apenas para contas CNPJ.',
      positives: [], negatives: ['Sua conta não permite configuração de preço por quantidade.'],
      improvement_actions: ['Para utilizar atacado, é necessário operar com conta CNPJ verificada.'],
      cta_available: false,
    };
  }

  // Unknown → treat as potentially eligible but no data
  if (accountType === 'unknown') {
    return {
      score: 0, account_type: 'unknown', is_eligible: false,
      has_wholesale_layer: false, has_valid_ranges: false, ranges_count: 0, is_linked_to_listing: false,
      status: 'not_eligible',
      summary: 'Não foi possível identificar o tipo da conta. Atualize os dados para verificar elegibilidade.',
      positives: [], negatives: ['Tipo de conta não identificado.'],
      improvement_actions: ['Atualize os dados para verificar se sua conta é CNPJ.'],
      cta_available: false,
    };
  }

  // CNPJ → check ML API for PxQ (price by quantity) first, then internal tables
  try {
    // 1. Check ML API for wholesale/PxQ config on this item
    let hasMLWholesale = false;
    let mlRangesCount = 0;
    let detectionSource = 'none';
    if (token) {
      try {
        // Strategy 1: Check item tags for standard_price_by_quantity
        const resp = await fetch(`https://api.mercadolibre.com/items/${itemId}?attributes=id,sale_terms,tags`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const itemData = await resp.json();
          
          // Check tags for PxQ indicator
          const tags = Array.isArray(itemData.tags) ? itemData.tags : [];
          if (tags.includes('standard_price_by_quantity')) {
            hasMLWholesale = true;
            detectionSource = 'tag:standard_price_by_quantity';
            console.log(`[rad-collector] Wholesale: ${itemId} detected via tag standard_price_by_quantity`);
          }
          
          // Check sale_terms for WHOLESALE or QUANTITY_DISCOUNTS
          if (!hasMLWholesale) {
            const saleTerms = Array.isArray(itemData.sale_terms) ? itemData.sale_terms : [];
            for (const term of saleTerms) {
              if (term.id === 'WHOLESALE' || term.id === 'QUANTITY_DISCOUNTS') {
                hasMLWholesale = true;
                detectionSource = `sale_term:${term.id}`;
                if (Array.isArray(term.values)) mlRangesCount = term.values.length;
                break;
              }
            }
          }
        }
        
        // Strategy 2: Check /items/{id}/prices for standard prices with min_purchase_unit
        if (!hasMLWholesale || mlRangesCount === 0) {
          try {
            const priceResp = await fetch(`https://api.mercadolibre.com/items/${itemId}/prices`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (priceResp.ok) {
              const priceData = await priceResp.json();
              const prices = Array.isArray(priceData.prices) ? priceData.prices : [];
              // PxQ uses type="standard" with conditions.context_restrictions containing user_type_business
              // or conditions.min_purchase_unit
              const pxqPrices = prices.filter((p: any) => {
                if (!p.conditions) return false;
                // Check min_purchase_unit > 1
                if (p.conditions.min_purchase_unit && p.conditions.min_purchase_unit > 1) return true;
                // Check context_restrictions for business user
                if (Array.isArray(p.conditions.context_restrictions)) {
                  return p.conditions.context_restrictions.some((r: any) => r === 'user_type_business' || r?.user_type === 'business');
                }
                return false;
              });
              if (pxqPrices.length > 0) {
                hasMLWholesale = true;
                mlRangesCount = Math.max(mlRangesCount, pxqPrices.length);
                if (detectionSource === 'none') detectionSource = 'prices_api:pxq';
              }
              // Also check for bulk type as legacy fallback
              if (!hasMLWholesale) {
                const bulkPrices = prices.filter((p: any) => p.type === 'bulk');
                if (bulkPrices.length > 0) {
                  hasMLWholesale = true;
                  mlRangesCount = bulkPrices.length;
                  detectionSource = 'prices_api:bulk';
                }
              }
            }
          } catch {}
        }
      } catch (mlErr) {
        console.warn(`[rad-collector] Wholesale ML API check failed for ${itemId}:`, mlErr);
      }
    }

    console.log(`[rad-collector] Wholesale: ${itemId} result: detected=${hasMLWholesale}, source=${detectionSource}, ranges=${mlRangesCount}`);

    // If ML has wholesale configured → return active
    if (hasMLWholesale) {
      return {
        score: mlRangesCount >= 2 ? 100 : 80, account_type: 'cnpj', is_eligible: true,
        has_wholesale_layer: true, has_valid_ranges: mlRangesCount >= 2, ranges_count: mlRangesCount, is_linked_to_listing: true,
        status: 'active',
        summary: 'Preço por atacado ativo no Mercado Livre.',
        positives: ['Anúncio preparado para vendas em volume.', 'Estratégia comercial mais competitiva.', ...(mlRangesCount > 0 ? [`${mlRangesCount} faixa(s) de preço configurada(s).`] : [])],
        negatives: [],
        improvement_actions: [],
        cta_available: false,
      };
    }

    // 2. Fallback: check internal tables
    if (!tenantId) {
      return {
        score: 0, account_type: 'cnpj', is_eligible: true,
        has_wholesale_layer: false, has_valid_ranges: false, ranges_count: 0, is_linked_to_listing: false,
        status: 'not_configured',
        summary: 'Preço de atacado não configurado neste anúncio.',
        positives: [], negatives: ['Nenhuma faixa de preço por quantidade encontrada.'],
        improvement_actions: ['Criar faixas de preço para compras em maior volume.', 'Configurar política de atacado para aumentar competitividade.'],
        cta_available: true,
      };
    }

    // Check if item has a wholesale override
    const { data: override } = await supabase
      .from('wholesale_product_overrides')
      .select('id, override_mode, custom_tiers, is_excluded, profile_id')
      .eq('company_id', tenantId)
      .eq('item_id', itemId)
      .maybeSingle();

    // If excluded, treat as not configured
    if (override?.is_excluded) {
      return {
        score: 0, account_type: 'cnpj', is_eligible: true,
        has_wholesale_layer: false, has_valid_ranges: false, ranges_count: 0, is_linked_to_listing: false,
        status: 'not_configured',
        summary: 'Este anúncio foi excluído da política de atacado.',
        positives: [], negatives: ['Anúncio excluído da política de atacado.'],
        improvement_actions: ['Remova a exclusão se deseja ativar preço por quantidade.'],
        cta_available: true,
      };
    }

    // Check for active profile
    const { data: settings } = await supabase
      .from('wholesale_seller_settings')
      .select('default_profile_id, strategy_mode')
      .eq('company_id', tenantId)
      .maybeSingle();

    const profileId = override?.profile_id || settings?.default_profile_id;

    if (!profileId) {
      return {
        score: 0, account_type: 'cnpj', is_eligible: true,
        has_wholesale_layer: false, has_valid_ranges: false, ranges_count: 0, is_linked_to_listing: false,
        status: 'not_configured',
        summary: 'Preço de atacado não configurado neste anúncio.',
        positives: [], negatives: ['Nenhuma faixa de preço por quantidade encontrada.'],
        improvement_actions: ['Criar faixas de preço para compras em maior volume.', 'Configurar política de atacado para aumentar competitividade.'],
        cta_available: true,
      };
    }

    // Check profile tiers
    let tiers: any[] = [];
    if (override?.override_mode === 'custom' && Array.isArray(override?.custom_tiers)) {
      tiers = override.custom_tiers;
    } else {
      const { data: profileTiers } = await supabase
        .from('wholesale_profile_tiers')
        .select('*')
        .eq('profile_id', profileId)
        .eq('is_enabled', true)
        .order('tier_index');
      tiers = profileTiers || [];
    }

    const rangesCount = tiers.length;
    const hasValidRanges = rangesCount >= 2;
    const hasLayer = rangesCount > 0;

    if (!hasLayer) {
      return {
        score: 0, account_type: 'cnpj', is_eligible: true,
        has_wholesale_layer: false, has_valid_ranges: false, ranges_count: 0, is_linked_to_listing: false,
        status: 'not_configured',
        summary: 'Preço de atacado não configurado neste anúncio.',
        positives: [], negatives: ['Nenhuma faixa de preço por quantidade encontrada.'],
        improvement_actions: ['Criar faixas de preço para compras em maior volume.'],
        cta_available: true,
      };
    }

    if (!hasValidRanges) {
      return {
        score: 40, account_type: 'cnpj', is_eligible: true,
        has_wholesale_layer: true, has_valid_ranges: false, ranges_count: rangesCount, is_linked_to_listing: true,
        status: 'partial',
        summary: 'Configuração de atacado incompleta.',
        positives: ['Política de atacado iniciada.'],
        negatives: ['Faixas de preço insuficientes ou inconsistentes.'],
        improvement_actions: ['Revisar faixas de quantidade.', 'Adicionar mais faixas para volume.'],
        cta_available: true,
      };
    }

    return {
      score: 100, account_type: 'cnpj', is_eligible: true,
      has_wholesale_layer: true, has_valid_ranges: true, ranges_count: rangesCount, is_linked_to_listing: true,
      status: 'active',
      summary: 'Preço por atacado ativo e bem configurado.',
      positives: ['Anúncio preparado para vendas em volume.', 'Estratégia comercial mais competitiva.', `${rangesCount} faixas de preço configuradas.`],
      negatives: [],
      improvement_actions: [],
      cta_available: false,
    };
  } catch (err) {
    console.warn(`[rad-collector] Wholesale analysis failed for ${itemId}:`, err);
    return {
      score: 0, account_type: 'cnpj', is_eligible: true,
      has_wholesale_layer: false, has_valid_ranges: false, ranges_count: 0, is_linked_to_listing: false,
      status: 'not_configured',
      summary: 'Não foi possível verificar a política de atacado.',
      positives: [], negatives: ['Erro ao consultar dados de atacado.'],
      improvement_actions: ['Atualize os dados para verificar.'],
      cta_available: false,
    };
  }
}

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

    // Photos from API — capture per-image resolution
    const token = await getValidToken(supabase, sellerId);
    const photosMap = new Map<string, { count: number; hasVideo: boolean; images: Array<{ url: string; width: number; height: number }> }>();
    const variationMap = new Map<string, Set<string>>();
    if (token) {
      for (let i = 0; i < allIds.length; i += 20) {
        try {
          const resp = await fetch(`https://api.mercadolibre.com/items?ids=${allIds.slice(i,i+20).join(',')}&attributes=id,pictures,video_id,variations,title`, { headers: { Authorization: `Bearer ${token}` } });
          if (resp.ok) {
            const d = await resp.json();
            for (const e of d) {
              if (e.code === 200 && e.body) {
                const pics = Array.isArray(e.body.pictures) ? e.body.pictures : [];
                const images = pics.map((p: any) => ({
                  url: p.secure_url || p.url || '',
                  width: p.max_size ? parseInt(String(p.max_size).split('x')[0]) || 0 : 0,
                  height: p.max_size ? parseInt(String(p.max_size).split('x')[1]) || 0 : 0,
                }));
                photosMap.set(e.body.id, { count: pics.length, hasVideo: !!e.body.video_id, images });
                
                // Extract variation attribute values for title cleaning
                const variations = Array.isArray(e.body.variations) ? e.body.variations : [];
                if (variations.length > 0) {
                  const varAttrs = new Set<string>();
                  for (const v of variations) {
                    const combos = Array.isArray(v.attribute_combinations) ? v.attribute_combinations : [];
                    for (const c of combos) {
                      if (c.value_name) varAttrs.add(c.value_name);
                    }
                  }
                  if (varAttrs.size > 0) variationMap.set(e.body.id, varAttrs);
                }
              }
            }
          }
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

    // Detect account type for wholesale analysis
    const accountType = await detectAccountType(supabase, token, sellerId);
    console.log(`[rad-collector] ANALYZE: Account type for ${sellerId}: ${accountType}`);
    await supabase.from('listing_health_logs').insert({ seller_id: sellerId, log_type: 'analysis', log_level: 'info', action: 'WHOLESALE_ACCOUNT_TYPE_DETECTED', message: `Account type: ${accountType}` });

    let analyzed = 0, errCount = 0;
    const newAlerts: any[] = [], newRecs: any[] = [], updateRows: any[] = [], mediaRows: any[] = [];

    for (const item of items) {
      try {
        const listing = detailMap.get(item.item_id) || {};
        const photos = photosMap.get(item.item_id) || { count: item.photos_count || 0, hasVideo: item.has_video || false, images: [] };
        const covDays = covByItem.get(item.item_id) || 0;
        // Clean title: strip variation attribute suffixes
        let title = listing.title || item.title || '';
        const varAttrs = variationMap.get(item.item_id);
        if (varAttrs && varAttrs.size > 0) {
          for (const va of varAttrs) {
            // Remove variation value from end of title (e.g., "...Branco Nenhum" → "...")
            const regex = new RegExp(`\\s+${va.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
            title = title.replace(regex, '');
          }
          // Second pass for remaining values
          for (const va of varAttrs) {
            const regex = new RegExp(`\\s+${va.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
            title = title.replace(regex, '');
          }
          title = title.trim();
        }
        const merged = { ...item, ...listing, is_ads_active: adsActiveSet.has(item.item_id) || null, is_promotion_active: promoActiveSet.has(item.item_id) || null };
        const covStatus = classifyCoverage(covDays, 30);

        const v7d = item.visits_7d || item.visits_last || 0;
        const v30d = item.visits_30d || v7d * 4;
        const s30d = item.sales_count_30d || 0;
        const convRate = v30d > 0 ? (s30d / v30d) * 100 : 0;

        const scores = computeSubScores(merged, photos, title.length, covDays, v7d, v30d, s30d);

        // Wholesale analysis
        const wholesaleResult = await analyzeWholesaleForItem(supabase, item.item_id, sellerId, accountType, tenantId, token);
        // Add wholesale to scores; if not eligible, remove weight from calculation
        if (wholesaleResult.is_eligible) {
          scores.wholesale = wholesaleResult.score;
        } else {
          // Remove wholesale weight — computeHealthScore will just skip it
          delete scores.wholesale;
        }

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

        // Per-image resolution analysis
        const imageAnalysis = (photos.images || []).map((img: any, idx: number) => {
          const w = img.width || 0;
          const h = img.height || 0;
          const is1200 = w >= 1200 && h >= 1200;
          const isSquare = w > 0 && h > 0 && Math.abs(w - h) < 50;
          return {
            image_index: idx + 1,
            width: w, height: h,
            is_square: isSquare,
            is_1200x1200: is1200,
            is_primary: idx === 0,
            resolution_status: w === 0 ? 'unknown' : is1200 ? 'ok' : 'review',
            recommendation: w === 0 ? 'Dimensão indisponível' : is1200 ? null : 'Recomenda-se ajustar para 1200x1200 px',
          };
        });
        const imagesAt1200 = imageAnalysis.filter((i: any) => i.is_1200x1200).length;
        const totalImages = imageAnalysis.length;
        const resolutionRatio = totalImages > 0 ? imagesAt1200 / totalImages : 0;

        // Media quality score with resolution component
        let mediaQuality = 0;
        if (photos.count >= 6) mediaQuality += 35; else if (photos.count >= 3) mediaQuality += 20; else if (photos.count >= 1) mediaQuality += 10;
        if (photos.hasVideo) mediaQuality += 25;
        if (resolutionRatio >= 1) mediaQuality += 30; else if (resolutionRatio >= 0.7) mediaQuality += 20; else if (resolutionRatio >= 0.3) mediaQuality += 10;
        if (totalImages > 0 && imageAnalysis[0]?.is_1200x1200) mediaQuality += 10;
        mediaQuality = Math.min(mediaQuality, 100);

        // Media
        mediaRows.push({
          seller_id: sellerId, item_id: item.item_id, tenant_id: tenantId,
          photos_count: photos.count, has_video: photos.hasVideo,
          quality_score: mediaQuality,
          analysis_json: {
            photos_count: photos.count, has_video: photos.hasVideo,
            images_at_1200: imagesAt1200, total_images: totalImages,
            resolution_ratio: Number(resolutionRatio.toFixed(2)),
            per_image: imageAnalysis,
          },
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
          wholesale_score: wholesaleResult.is_eligible ? wholesaleResult.score : null,
          wholesale_analysis_json: wholesaleResult,
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
    // Try meli_listings_cache first, then listing_health_current as fallback
    let listing: any = null;
    const { data: cacheRow, error: listingErr } = await supabase.from('meli_listings_cache')
      .select('item_id, title, category_id')
      .eq('item_id', itemId).eq('seller_id', sellerId).maybeSingle();
    if (listingErr) console.error('[rad-collector] GENERATE_TITLE listing fetch error:', listingErr);
    listing = cacheRow;
    
    // Fallback to listing_health_current
    if (!listing?.title) {
      const { data: healthRow } = await supabase.from('listing_health_current')
        .select('item_id, title')
        .eq('item_id', itemId).eq('seller_id', sellerId).maybeSingle();
      if (healthRow?.title) {
        listing = { item_id: itemId, title: healthRow.title, category_id: null };
      }
    }
    
    if (!listing?.title) return { success: false, error: 'Anúncio não encontrado no cache local. Atualize os dados para gerar a análise.' };

    // Fetch variation attributes from ML API to strip from title
    const variationAttrs: string[] = [];
    const token = await getValidToken(supabase, sellerId);
    if (token) {
      try {
        const resp = await fetch(`https://api.mercadolibre.com/items/${itemId}?attributes=id,variations,title`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const itemData = await resp.json();
          const vars = Array.isArray(itemData.variations) ? itemData.variations : [];
          for (const v of vars) {
            const combos = Array.isArray(v.attribute_combinations) ? v.attribute_combinations : [];
            for (const c of combos) {
              if (c.value_name && !variationAttrs.includes(normalizeText(c.value_name))) {
                variationAttrs.push(normalizeText(c.value_name));
              }
            }
          }
        }
      } catch (varErr) {
        console.warn(`[rad-collector] GENERATE_TITLE: variation fetch failed:`, varErr);
      }
    }

    // Clean title by stripping variation suffixes
    let currentTitle = listing.title;
    if (variationAttrs.length > 0) {
      for (const va of variationAttrs) {
        const original = currentTitle;
        // Try to remove the variation value from the end of the title
        const tokens = currentTitle.split(/\s+/);
        const vaTokens = va.split(/\s+/);
        // Check if last N tokens match variation
        if (tokens.length > vaTokens.length) {
          const lastTokens = tokens.slice(-vaTokens.length).map(t => normalizeText(t));
          if (lastTokens.every((t, i) => t === vaTokens[i])) {
            currentTitle = tokens.slice(0, -vaTokens.length).join(' ').trim();
          }
        }
      }
    }
    const categoryId = listing.category_id;

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
