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
    await analyzeSeoForItems(supabase, sellerId, processedItemIds);

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
      
      // Normalize collected_at per window for idempotency
      const windowCollectedAt = new Date();
      windowCollectedAt.setSeconds(0, 0);
      const collectedAt = windowCollectedAt.toISOString();

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
// FLOW 6 — SEO ANALYSIS (cross-reference with Trends keywords)
// ============================================================================

function normalizeText(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkKeywordInText(keyword: string, normalizedTitle: string): boolean {
  const normalizedKw = normalizeText(keyword);
  // Check if all words of the keyword appear in the title
  const kwWords = normalizedKw.split(" ").filter(w => w.length > 2);
  if (kwWords.length === 0) return false;
  const matchCount = kwWords.filter(w => normalizedTitle.includes(w)).length;
  // At least 70% of keyword words must appear
  return matchCount / kwWords.length >= 0.7;
}

function assessKeywordRelevance(keyword: string, title: string, categoryName: string | null): "high" | "medium" | "low" {
  const normalizedKw = normalizeText(keyword);
  const normalizedTitle = normalizeText(title);
  const kwWords = normalizedKw.split(" ").filter(w => w.length > 2);
  const titleWords = normalizedTitle.split(" ").filter(w => w.length > 2);
  
  if (kwWords.length === 0 || titleWords.length === 0) return "low";
  
  // How many keyword words overlap with title words?
  const overlapCount = kwWords.filter(kw => titleWords.some(tw => tw === kw || tw.includes(kw) || kw.includes(tw))).length;
  const overlapRatio = overlapCount / kwWords.length;
  
  if (overlapRatio >= 0.5) return "high";
  if (overlapRatio >= 0.25) return "medium";
  return "low";
}

async function analyzeSeoForItems(supabase: any, sellerId: string, itemIds: string[]) {
  if (!itemIds || itemIds.length === 0) return;
  console.log(`[rad-collector] SEO analysis for ${sellerId}: ${itemIds.length} items`);

  try {
    // 1. Get item details from meli_listings_cache (title + category_id)
    const itemDetails = new Map<string, { title: string; category_id: string }>();
    for (let i = 0; i < itemIds.length; i += 500) {
      const chunk = itemIds.slice(i, i + 500);
      const { data } = await supabase
        .from("meli_listings_cache")
        .select("item_id, title, category_id")
        .eq("seller_id", sellerId)
        .in("item_id", chunk);
      if (data) {
        for (const row of data) {
          if (row.title && row.category_id && !itemDetails.has(row.item_id)) {
            itemDetails.set(row.item_id, { title: row.title, category_id: row.category_id });
          }
        }
      }
    }

    if (itemDetails.size === 0) {
      console.log(`[rad-collector] SEO: No items with title+category found`);
      return;
    }

    // 2. Get unique leaf categories and map to level1 via account_category_activity
    const leafCategories = [...new Set([...itemDetails.values()].map(v => v.category_id))];
    const categoryToL1 = new Map<string, { l1_id: string; l1_name: string; cat_name: string }>();
    
    for (let i = 0; i < leafCategories.length; i += 500) {
      const chunk = leafCategories.slice(i, i + 500);
      const { data } = await supabase
        .from("account_category_activity")
        .select("category_id, level1_category_id, level1_category_name, category_name")
        .in("category_id", chunk);
      if (data) {
        for (const row of data) {
          if (row.level1_category_id) {
            categoryToL1.set(row.category_id, {
              l1_id: row.level1_category_id,
              l1_name: row.level1_category_name || "",
              cat_name: row.category_name || "",
            });
          }
        }
      }
    }

    // 3. Get trending keywords from trend_snapshots for these L1 categories
    const l1Ids = [...new Set([...categoryToL1.values()].map(v => v.l1_id))];
    const keywordsByL1 = new Map<string, Array<{ keyword: string; url: string }>>();

    if (l1Ids.length > 0) {
      // Get the most recent snapshot for each L1 category
      for (const l1Id of l1Ids) {
        const { data } = await supabase
          .from("trend_snapshots")
          .select("trends_data")
          .eq("category_id", l1Id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (data?.trends_data && Array.isArray(data.trends_data)) {
          keywordsByL1.set(l1Id, data.trends_data.slice(0, 30)); // Top 30 keywords
        }
      }
    }

    console.log(`[rad-collector] SEO: ${itemDetails.size} items, ${categoryToL1.size} categories mapped, ${keywordsByL1.size} L1s with keywords`);

    // 4. Analyze each item
    let analyzed = 0;
    for (const [itemId, detail] of itemDetails) {
      const mapping = categoryToL1.get(detail.category_id);
      if (!mapping) continue;

      const trendKeywords = keywordsByL1.get(mapping.l1_id);
      if (!trendKeywords || trendKeywords.length === 0) continue;

      const normalizedTitle = normalizeText(detail.title);
      const found: string[] = [];
      const missing: string[] = [];
      const analysisDetails: Array<{
        keyword: string;
        found_in_title: boolean;
        relevance: "high" | "medium" | "low";
      }> = [];

      // Check top 15 keywords for SEO coverage
      const topKeywords = trendKeywords.slice(0, 15);
      for (const kw of topKeywords) {
        const foundInTitle = checkKeywordInText(kw.keyword, normalizedTitle);
        const relevance = assessKeywordRelevance(kw.keyword, detail.title, mapping.cat_name);

        analysisDetails.push({
          keyword: kw.keyword,
          found_in_title: foundInTitle,
          relevance,
        });

        if (foundInTitle) {
          found.push(kw.keyword);
        } else if (relevance !== "low") {
          // Only suggest missing keywords that are at least medium relevance
          missing.push(kw.keyword);
        }
      }

      // Calculate SEO score (0-100)
      const relevantKeywords = analysisDetails.filter(a => a.relevance !== "low");
      const totalRelevant = relevantKeywords.length || 1;
      const foundRelevant = relevantKeywords.filter(a => a.found_in_title).length;
      const seoScore = Math.round((foundRelevant / totalRelevant) * 100);

      // Update listing_health_current
      await supabase
        .from("listing_health_current")
        .update({
          seo_score: seoScore,
          seo_keywords_found: found.slice(0, 10),
          seo_keywords_missing: missing.slice(0, 10),
          seo_analysis_json: {
            category_name: mapping.cat_name,
            l1_category_name: mapping.l1_name,
            total_trending_keywords: trendKeywords.length,
            analyzed_keywords: analysisDetails.length,
            relevant_keywords: totalRelevant,
            found_count: foundRelevant,
            score: seoScore,
            details: analysisDetails,
            analyzed_at: new Date().toISOString(),
          },
        })
        .eq("seller_id", sellerId)
        .eq("item_id", itemId);

      analyzed++;
    }

    console.log(`[rad-collector] SEO: ${analyzed} items analyzed`);
  } catch (err) {
    console.warn(`[rad-collector] SEO analysis error:`, err);
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
        result = { sync: syncRes, collection: collRes, backfill: "triggered_async" };
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}. Use: sync, collection, backfill, nightly, full` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[rad-collector] Fatal error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
