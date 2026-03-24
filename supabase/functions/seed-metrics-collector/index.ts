import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchAllRows } from '../_shared/fetch-all-rows.ts';
import { auditLog } from '../_shared/audit-log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;
const RATE_LIMIT_DELAY = 600; // ms between ML API calls
const BATCH_SIZE = 10; // items per batch before checking timeout
const MAX_EXECUTION_MS = 50000; // 50s safety margin

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { seller_id, offset = 0 } = body;

    // Auth: internal chaining or user auth
    const internalKey = req.headers.get('x-internal-key');
    let userId: string;

    if (internalKey === supabaseServiceKey) {
      // Internal chaining call
      userId = body.user_id;
      if (!userId || !seller_id) {
        return new Response(JSON.stringify({ error: 'Missing user_id or seller_id for internal call' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // User auth
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing authorization' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[seed-metrics] Starting for seller=${seller_id}, offset=${offset}`);

    // 1. Get ML account token
    const { data: account, error: accError } = await supabase
      .from('ml_accounts')
      .select('access_token, refresh_token, token_expires_at, user_id')
      .eq('ml_user_id', seller_id.toString())
      .eq('is_active', true)
      .single();

    if (accError || !account) {
      console.error('[seed-metrics] No ML account found for seller:', seller_id);
      return new Response(JSON.stringify({ error: 'ML account not found', processed: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh token if expired
    let accessToken = account.access_token;
    if (new Date(account.token_expires_at) < new Date()) {
      accessToken = await refreshToken(supabase, seller_id, account.user_id, account.refresh_token);
      if (!accessToken) {
        return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 2. Fetch ALL planted items (no limit)
    const allPlantedItems = await fetchAllRows<any>(
      supabase.from('send_planted_items')
        .select('*')
        .eq('user_id', userId)
        .eq('seller_id', seller_id)
        .order('planted_at', { ascending: true })
    );

    console.log(`[seed-metrics] Total planted items: ${allPlantedItems.length}, processing from offset ${offset}`);

    if (allPlantedItems.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, total: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Build SKU→MLB mapping for all items
    const skuToMlbMap = new Map<string, string[]>();
    const allItemIds = allPlantedItems.map(p => p.item_id);
    
    // Separate MLB IDs from SKUs
    const directMlbIds: string[] = [];
    const skuIds: string[] = [];
    for (const id of allItemIds) {
      if (id.startsWith('MLB')) {
        directMlbIds.push(id.split(':')[0]); // handle MLB5414834542:0
      } else {
        skuIds.push(id);
      }
    }

    // Resolve SKU→MLB IDs via meli_order_items_cache
    if (skuIds.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < skuIds.length; i += BATCH) {
        const batch = skuIds.slice(i, i + BATCH);
        const { data: mappings } = await supabase
          .from('meli_order_items_cache')
          .select('product_key, item_id')
          .eq('seller_id', seller_id)
          .in('product_key', batch);

        for (const m of (mappings || [])) {
          const existing = skuToMlbMap.get(m.product_key) || [];
          if (!existing.includes(m.item_id)) {
            existing.push(m.item_id);
            skuToMlbMap.set(m.product_key, existing);
          }
        }
      }
    }

    // Also handle MLB-based IDs with variant suffix
    for (const id of allItemIds) {
      if (id.startsWith('MLB') && id.includes(':')) {
        const baseId = id.split(':')[0];
        skuToMlbMap.set(id, [baseId]);
      }
    }

    console.log(`[seed-metrics] SKU mappings resolved: ${skuToMlbMap.size} SKUs → MLB IDs`);

    // 4. Process items in batches from offset
    const itemsToProcess = allPlantedItems.slice(offset);
    let processed = 0;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    for (const item of itemsToProcess) {
      // Check timeout
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        console.log(`[seed-metrics] Timeout approaching, processed ${processed} items. Chaining...`);
        // Auto-chain to continue processing
        await chainContinue(supabaseUrl, supabaseServiceKey, {
          seller_id, user_id: userId, offset: offset + processed,
        });
        return new Response(JSON.stringify({ 
          success: true, processed, total: allPlantedItems.length, 
          status: 'chaining', next_offset: offset + processed,
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        await processPlantedItem(supabase, item, userId, seller_id, accessToken, skuToMlbMap, today, now);
        processed++;
      } catch (err) {
        console.error(`[seed-metrics] Error processing item ${item.item_id}:`, err);
        processed++; // Count as processed to advance
      }
    }

    console.log(`[seed-metrics] Completed: ${processed}/${allPlantedItems.length} items processed in ${Date.now() - startTime}ms`);

    await auditLog(supabase, {
      level: 'info', area: 'seed', action: 'metrics_collected',
      userId, success: true,
      message: `Seed metrics collected for ${processed} items`,
      meta: { seller_id, processed, total: allPlantedItems.length, duration_ms: Date.now() - startTime },
    });

    return new Response(JSON.stringify({ 
      success: true, processed, total: allPlantedItems.length, 
      duration_ms: Date.now() - startTime,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[seed-metrics] Fatal error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Process a single planted item ──────────────────────────────────────────────

async function processPlantedItem(
  supabase: any,
  item: any,
  userId: string,
  sellerId: string,
  accessToken: string,
  skuToMlbMap: Map<string, string[]>,
  today: string,
  now: Date,
) {
  const itemId = item.item_id;
  const plantedAt = new Date(item.planted_at);
  const daysDiff = Math.floor((now.getTime() - plantedAt.getTime()) / (1000 * 60 * 60 * 24));

  // Resolve MLB IDs for this item
  const mlbIds = getMlbIds(itemId, skuToMlbMap);

  // ── Fetch visits from ML API ──────────────────────────────────────────────
  let visits7d = 0;
  let visits30d = 0;
  const dailyVisits: { date: string; count: number }[] = [];

  for (const mlbId of mlbIds) {
    try {
      await sleep(RATE_LIMIT_DELAY);
      
      // 30-day visits
      const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await fetch(
        `https://api.mercadolibre.com/items/${mlbId}/visits/time_window?last=30&unit=day`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 429) {
        console.warn(`[seed-metrics] Rate limited on visits for ${mlbId}, waiting...`);
        await sleep(5000);
        continue;
      }

      if (!response.ok) {
        console.warn(`[seed-metrics] Visits API error for ${mlbId}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      if (data.results && Array.isArray(data.results)) {
        const visitsToUpsert: any[] = [];
        
        for (const dayData of data.results) {
          const visitDate = dayData.date?.split('T')[0];
          const dailyCount = dayData.total || 0;
          
          if (visitDate) {
            visits30d += dailyCount;
            dailyVisits.push({ date: visitDate, count: dailyCount });

            // Store in seller_item_visits for historical tracking
            visitsToUpsert.push({
              user_id: userId,
              seller_id: sellerId,
              item_id: mlbId,
              visit_date: visitDate,
              visits_count: dailyCount,
            });

            // Check if within last 7 days
            const dayDate = new Date(visitDate);
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            if (dayDate >= sevenDaysAgo) {
              visits7d += dailyCount;
            }
          }
        }

        // Batch upsert visits for historical tracking
        if (visitsToUpsert.length > 0) {
          const { error: upsertErr } = await supabase
            .from('seller_item_visits')
            .upsert(visitsToUpsert, { onConflict: 'seller_id,item_id,visit_date' });
          if (upsertErr) {
            console.warn(`[seed-metrics] Failed to upsert visits for ${mlbId}:`, upsertErr.message);
          }
        }
      }
    } catch (err) {
      console.warn(`[seed-metrics] Error fetching visits for ${mlbId}:`, err);
    }
  }

  // ── Count sales from order cache ──────────────────────────────────────────
  const sales7d = await countSales(supabase, sellerId, userId, itemId, mlbIds, 7, now);
  const sales30d = await countSales(supabase, sellerId, userId, itemId, mlbIds, 30, now);

  // ── Calculate metrics ─────────────────────────────────────────────────────
  const conversionRate = visits30d > 0 ? (sales30d / visits30d) * 100 : null;
  
  // Visit trend: compare last 7d visits to previous 7d
  let visitTrend: number | null = null;
  if (dailyVisits.length > 0) {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    let recentVisits = 0;
    let previousVisits = 0;
    
    for (const dv of dailyVisits) {
      const d = new Date(dv.date);
      if (d >= sevenDaysAgo) recentVisits += dv.count;
      else if (d >= fourteenDaysAgo) previousVisits += dv.count;
    }
    
    if (previousVisits > 0) {
      visitTrend = ((recentVisits - previousVisits) / previousVisits) * 100;
    }
  }

  // Average sales interval
  let avgSalesIntervalHours: number | null = null;
  if (sales30d > 1) {
    avgSalesIntervalHours = (30 * 24) / sales30d;
  }

  // Sales stability (coefficient of variation-based)
  const salesStability = sales30d > 0 ? Math.min(100, Math.round((sales7d / (sales30d / 4.28)) * 100)) : 0;

  // ── Determine health status ───────────────────────────────────────────────
  const oldHealth = item.health_status;
  let newHealth: string;
  
  if (sales7d > 0 && (visitTrend === null || visitTrend >= -30)) {
    newHealth = 'healthy';
  } else if (sales7d === 0 && sales30d > 0) {
    newHealth = 'stagnant';
  } else if (sales7d > 0 && visitTrend !== null && visitTrend < -30) {
    newHealth = 'weakening';
  } else if (sales30d === 0) {
    newHealth = 'dormant';
  } else {
    newHealth = 'stagnant';
  }

  // ── Determine growth stage ────────────────────────────────────────────────
  const oldStage = item.growth_stage;
  let newStage: string;
  
  if (daysDiff >= 90) newStage = 'fruiting';
  else if (daysDiff >= 45) newStage = 'mature';
  else if (daysDiff >= 21) newStage = 'growing';
  else if (daysDiff >= 7) newStage = 'sprout';
  else newStage = 'seed';

  // ── Maturity score (0-100) ────────────────────────────────────────────────
  const daysScore = Math.min(30, daysDiff) / 30 * 25; // max 25 pts
  const salesScore = Math.min(50, sales30d) / 50 * 25; // max 25 pts
  const visitsScore = Math.min(500, visits30d) / 500 * 25; // max 25 pts
  const convScore = conversionRate ? Math.min(10, conversionRate) / 10 * 25 : 0; // max 25 pts
  const maturityScore = Math.round(daysScore + salesScore + visitsScore + convScore);

  // Growth velocity
  const growthVelocity = daysDiff > 0 ? Math.round((maturityScore / daysDiff) * 10) / 10 : 0;

  // ── Insert snapshot ───────────────────────────────────────────────────────
  const { error: snapErr } = await supabase
    .from('send_metrics_snapshots')
    .upsert({
      planted_item_id: item.id,
      user_id: userId,
      seller_id: sellerId,
      item_id: itemId,
      snapshot_date: today,
      sales_count_7d: sales7d,
      sales_count_30d: sales30d,
      avg_sales_interval_hours: avgSalesIntervalHours,
      sales_stability_score: salesStability,
      visits_7d: visits7d,
      visits_30d: visits30d,
      visit_trend: visitTrend,
      conversion_rate: conversionRate,
      conversion_trend: null, // TODO: compare with previous snapshot
      maturity_score: maturityScore,
      growth_velocity: growthVelocity,
    }, { onConflict: 'planted_item_id,snapshot_date' });

  if (snapErr) {
    console.warn(`[seed-metrics] Snapshot upsert error for ${itemId}:`, snapErr.message);
  }

  // ── Log history changes ───────────────────────────────────────────────────
  const historyEvents: any[] = [];

  if (oldHealth !== newHealth) {
    historyEvents.push({
      user_id: userId, seller_id: sellerId, item_id: itemId,
      event_type: 'health_changed',
      event_data: { from: oldHealth, to: newHealth, sales_7d: sales7d, visits_7d: visits7d },
    });
  }

  if (oldStage !== newStage) {
    historyEvents.push({
      user_id: userId, seller_id: sellerId, item_id: itemId,
      event_type: 'stage_changed',
      event_data: { from: oldStage, to: newStage, days_planted: daysDiff },
    });
  }

  // Milestone: first sale, conversion rate > 5%, etc
  if (sales7d > 0 && item.last_metrics_at === null) {
    historyEvents.push({
      user_id: userId, seller_id: sellerId, item_id: itemId,
      event_type: 'milestone',
      event_data: { type: 'first_metrics', sales_7d: sales7d, visits_7d: visits7d, conversion_rate: conversionRate },
    });
  }

  if (historyEvents.length > 0) {
    const { error: histErr } = await supabase.from('send_item_history').insert(historyEvents);
    if (histErr) console.warn(`[seed-metrics] History insert error for ${itemId}:`, histErr.message);
  }

  // ── Hydrate missing thumbnail/title ────────────────────────────────────────
  const updateFields: Record<string, any> = {
    days_planted: daysDiff,
    health_status: newHealth,
    growth_stage: newStage,
    last_metrics_at: now.toISOString(),
    last_health_check_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  if (!item.item_thumbnail || !item.item_title) {
    const searchIds = mlbIds.length > 0 ? mlbIds : [itemId.split(':')[0]];
    const { data: listingHit } = await supabase
      .from('meli_listings_cache')
      .select('thumbnail, title')
      .in('item_id', searchIds)
      .not('thumbnail', 'is', null)
      .limit(1)
      .maybeSingle();

    if (listingHit) {
      if (!item.item_thumbnail && listingHit.thumbnail) {
        updateFields.item_thumbnail = listingHit.thumbnail;
        console.log(`[seed-metrics] THUMBNAIL_HYDRATED: ${itemId} → ${listingHit.thumbnail}`);
      }
      if (!item.item_title && listingHit.title) {
        updateFields.item_title = listingHit.title;
        console.log(`[seed-metrics] TITLE_HYDRATED: ${itemId} → ${listingHit.title}`);
      }
    } else {
      // Fallback: try order items cache
      const { data: orderHit } = await supabase
        .from('meli_order_items_cache')
        .select('item_title, item_thumbnail')
        .eq('seller_id', sellerId)
        .or(searchIds.map(id => `item_id.eq.${id}`).join(','))
        .not('item_thumbnail', 'is', null)
        .limit(1)
        .maybeSingle();

      if (orderHit) {
        if (!item.item_thumbnail && orderHit.item_thumbnail) {
          updateFields.item_thumbnail = orderHit.item_thumbnail;
          console.log(`[seed-metrics] THUMBNAIL_HYDRATED_FROM_ORDERS: ${itemId}`);
        }
        if (!item.item_title && orderHit.item_title) {
          updateFields.item_title = orderHit.item_title;
          console.log(`[seed-metrics] TITLE_HYDRATED_FROM_ORDERS: ${itemId}`);
        }
      }
    }
  }

  // ── Update planted item ───────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('send_planted_items')
    .update(updateFields)
    .eq('id', item.id);

  if (updateErr) {
    console.warn(`[seed-metrics] Update planted item error for ${itemId}:`, updateErr.message);
  }

  console.log(`[seed-metrics] ${itemId}: days=${daysDiff} health=${newHealth} stage=${newStage} sales7d=${sales7d} sales30d=${sales30d} visits7d=${visits7d} visits30d=${visits30d} conv=${conversionRate?.toFixed(2)}%`);
}

// ── Helper: get MLB IDs for an item ────────────────────────────────────────────

function getMlbIds(itemId: string, skuToMlbMap: Map<string, string[]>): string[] {
  if (itemId.startsWith('MLB')) {
    const base = itemId.split(':')[0];
    return [base];
  }
  return skuToMlbMap.get(itemId) || [];
}

// ── Helper: count sales ────────────────────────────────────────────────────────

async function countSales(
  supabase: any,
  sellerId: string,
  userId: string,
  itemId: string,
  mlbIds: string[],
  days: number,
  now: Date,
): Promise<number> {
  const dateFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  // Query by product_key (SKU) for SKU-based items
  const { count: skuCount } = await supabase
    .from('meli_order_items_cache')
    .select('*', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .eq('product_key', itemId)
    .gte('created_at_meli', dateFrom);

  let mlbCount = 0;
  if (mlbIds.length > 0 && !itemId.startsWith('MLB')) {
    // Also count by item_id for MLB IDs (in case product_key doesn't match)
    const { count } = await supabase
      .from('meli_order_items_cache')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', sellerId)
      .in('item_id', mlbIds)
      .gte('created_at_meli', dateFrom);
    mlbCount = count || 0;
  }

  // For MLB-based items, count by item_id directly
  if (itemId.startsWith('MLB')) {
    const baseId = itemId.split(':')[0];
    const { count } = await supabase
      .from('meli_order_items_cache')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', sellerId)
      .eq('item_id', baseId)
      .gte('created_at_meli', dateFrom);
    return count || 0;
  }

  return Math.max(skuCount || 0, mlbCount);
}

// ── Token refresh ──────────────────────────────────────────────────────────────

async function refreshToken(supabase: any, sellerId: string, userId: string, refreshTokenStr: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshTokenStr,
      }),
    });

    if (!response.ok) {
      console.error('[seed-metrics] Token refresh failed:', response.status);
      return null;
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await supabase
      .from('ml_accounts')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('ml_user_id', sellerId)
      .eq('user_id', userId);

    return data.access_token;
  } catch (err) {
    console.error('[seed-metrics] Token refresh error:', err);
    return null;
  }
}

// ── Auto-chaining ──────────────────────────────────────────────────────────────

async function chainContinue(supabaseUrl: string, serviceKey: string, params: any) {
  try {
    const fnUrl = `${supabaseUrl}/functions/v1/seed-metrics-collector`;
    await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'x-internal-key': serviceKey,
      },
      body: JSON.stringify(params),
    });
    console.log(`[seed-metrics] Chained continuation at offset=${params.offset}`);
  } catch (err) {
    console.error('[seed-metrics] Chain error:', err);
  }
}
