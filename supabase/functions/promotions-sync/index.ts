import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchAllRows } from '../_shared/fetch-all-rows.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// ========== Type Definitions ==========
interface PromotionItem {
  item_id: string;
  status: string;
  original_price?: number;
  deal_price?: number;
  effective_price?: number | null;
  net_proceeds_amount?: number | null;
  net_proceeds_currency?: string | null;
  suggested_price?: number | null;
  max_discounted_price?: number | null;
  min_discounted_price?: number | null;
  error?: string;
  raw?: Record<string, unknown>;
}

interface Promotion {
  id: string;
  type: string;
  name?: string;
  status: string;
  start_date: string | null;
  finish_date: string | null;
  items?: PromotionItem[];
}

interface SyncResult {
  promotions_fetched: number;
  promotions_synced: number;
  items_synced: number;
  events_created: number;
  expired_marked: number;
  log_id: string | null;
}

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// ========== Response Helpers ==========
function jsonResponse(data: { ok: boolean; data?: unknown; error?: ApiError }, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function successResponse(data: unknown): Response {
  return jsonResponse({ ok: true, data });
}

function errorResponse(code: string, message: string, status = 400, details?: unknown): Response {
  return jsonResponse({ ok: false, error: { code, message, details } }, status);
}

// ========== Safe JSON Fetch ==========
async function safeFetchJson<T>(
  url: string, 
  options: RequestInit,
  context: string
): Promise<{ data: T | null; error: string | null; status: number; isEmpty: boolean }> {
  try {
    const response = await fetch(url, options);
    const status = response.status;
    const contentType = response.headers.get('content-type') || '';
    
    const text = await response.text();
    console.log(`[${context}] Status: ${status}, Content-Type: ${contentType}, Body length: ${text?.length || 0}`);
    
    if (!text || text.trim() === '') {
      if (status >= 200 && status < 300) {
        console.log(`[${context}] Empty response with success status - treating as empty array`);
        return { data: null, error: null, status, isEmpty: true };
      }
      return { data: null, error: `Empty response with status ${status}`, status, isEmpty: true };
    }
    
    try {
      const data = JSON.parse(text) as T;
      if (!response.ok) {
        const errMsg = (data as Record<string, unknown>)?.message || 
                       (data as Record<string, unknown>)?.error || 
                       `HTTP ${status}`;
        return { data: null, error: String(errMsg), status, isEmpty: false };
      }
      return { data, error: null, status, isEmpty: false };
    } catch (parseErr) {
      console.error(`[${context}] JSON parse error:`, parseErr, 'Raw:', text.substring(0, 200));
      return { data: null, error: `Invalid JSON: ${String(parseErr)}`, status, isEmpty: false };
    }
  } catch (fetchErr) {
    console.error(`[${context}] Fetch error:`, fetchErr);
    return { data: null, error: `Network error: ${String(fetchErr)}`, status: 0, isEmpty: false };
  }
}

// ========== Main Handler ==========
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let logId: string | null = null;
  let workspaceId: string | undefined;
  let accountId: string | undefined;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body safely
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid JSON in request body', 400);
    }

    workspaceId = body.workspace_id as string;
    accountId = body.account_id as string;
    const syncSource = (body.sync_source as string) || 'manual';

    // Validate required fields
    if (!workspaceId || !accountId) {
      return errorResponse('MISSING_PARAMS', 'workspace_id and account_id are required', 400);
    }

    const logPrefix = `[promotions-sync] ws=${workspaceId} acc=${accountId}`;
    console.log(JSON.stringify({
      tag: 'promotions-sync',
      route: 'promotions-sync',
      workspace_id: workspaceId,
      seller_id: accountId,
      ml_account_id: null,
      status: 'starting',
      sync_source: syncSource,
      ts: new Date().toISOString(),
    }));

    // Create sync log entry
    const { data: syncLog, error: logError } = await supabase
      .from('promotion_sync_logs')
      .insert({
        workspace_id: workspaceId,
        account_id: accountId,
        status: 'running',
        sync_source: syncSource,
      })
      .select('id')
      .single();

    if (logError) {
      console.error(`${logPrefix} Error creating sync log:`, logError);
    } else {
      logId = syncLog.id;
    }

    // Fetch ML account credentials
    const { data: mlAccount, error: mlError } = await supabase
      .from('ml_accounts')
      .select('id, access_token, ml_user_id, token_expires_at')
      .eq('ml_user_id', accountId)
      .eq('is_active', true)
      .maybeSingle();

    if (mlError) {
      console.error(`${logPrefix} DB error fetching ML account:`, mlError);
      await updateSyncLog(supabase, logId, 'error', startTime, { error_message: 'Database error' });
      return errorResponse('DB_ERROR', 'Failed to fetch account credentials', 500);
    }

    if (!mlAccount) {
      console.warn(`${logPrefix} ML account not found or inactive`);
      await updateSyncLog(supabase, logId, 'error', startTime, { error_message: 'ML account not found' });
      return errorResponse('NO_CONNECTED_ACCOUNT', 'Nenhuma conta do Mercado Livre conectada para esta seleção. Conecte uma conta para sincronizar promoções.', 400, {
        workspace_id: workspaceId,
        seller_id: accountId,
      });
    }

    // Resolve workspace_accounts.id for system_events FK
    const mlAccountId = (mlAccount as { id: string }).id;
    let wsAccountId: string | null = null;
    {
      const { data: wsAcc } = await supabase
        .from('workspace_accounts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('marketplace', 'ml')
        .eq('is_active', true)
        .maybeSingle();
      wsAccountId = wsAcc?.id || null;
    }
    let accessToken = (mlAccount as { access_token: string }).access_token;

    // Refresh token if expired
    const tokenExpiresAt = (mlAccount as { token_expires_at: string | null }).token_expires_at;
    if (tokenExpiresAt && new Date(tokenExpiresAt) <= new Date()) {
      console.log(`${logPrefix} Token expired, attempting refresh...`);
      const authHeader = req.headers.get('Authorization') || `Bearer ${supabaseServiceKey}`;
      try {
        const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ account_id: mlAccountId, seller_id: (mlAccount as { ml_user_id: string }).ml_user_id }),
        });
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          if (refreshData.access_token) {
            accessToken = refreshData.access_token;
            console.log(`${logPrefix} Token refreshed successfully`);
          } else {
            console.error(`${logPrefix} Token refresh returned no access_token`);
            await updateSyncLog(supabase, logId, 'error', startTime, { error_message: 'Token refresh failed' });
            return errorResponse('TOKEN_REFRESH_FAILED', 'Não foi possível renovar o token. Reconecte sua conta do Mercado Livre.', 401);
          }
        } else {
          const errText = await refreshResponse.text();
          console.error(`${logPrefix} Token refresh failed: ${refreshResponse.status} ${errText}`);
          await updateSyncLog(supabase, logId, 'error', startTime, { error_message: 'Token refresh failed' });
          return errorResponse('TOKEN_REFRESH_FAILED', 'Não foi possível renovar o token. Reconecte sua conta do Mercado Livre.', 401);
        }
      } catch (refreshErr) {
        console.error(`${logPrefix} Token refresh error:`, refreshErr);
        await updateSyncLog(supabase, logId, 'error', startTime, { error_message: 'Token refresh error' });
        return errorResponse('TOKEN_REFRESH_FAILED', 'Erro ao renovar token. Tente novamente.', 500);
      }
    }

    console.log(JSON.stringify({
      tag: 'promotions-sync',
      route: 'promotions-sync',
      workspace_id: workspaceId,
      seller_id: accountId,
      ml_account_id: mlAccountId,
      status: 'ml_account_ok',
      ts: new Date().toISOString(),
    }));

    // Fetch existing snapshots for comparison
    const existingSnapshots = await fetchAllRows(
      supabase.from('promotion_snapshots')
        .select('promotion_id, status, end_at')
        .eq('workspace_id', workspaceId)
        .eq('account_id', accountId)
    );

    const existingMap = new Map(
      existingSnapshots.map(s => [s.promotion_id, s])
    );

    // Fetch existing items for comparison
    const existingItems = await fetchAllRows(
      supabase.from('promotion_items_snapshots')
        .select('promotion_id, item_id, item_status')
        .eq('workspace_id', workspaceId)
        .eq('account_id', accountId)
    );

    const existingItemsMap = new Map<string, Map<string, string>>();
    for (const item of existingItems) {
      if (!existingItemsMap.has(item.promotion_id)) {
        existingItemsMap.set(item.promotion_id, new Map());
      }
      existingItemsMap.get(item.promotion_id)!.set(item.item_id, item.item_status);
    }

    // Fetch promotions from ML API
    const mlUrl = `https://api.mercadolibre.com/seller-promotions/users/${mlAccount.ml_user_id}?app_version=v2`;
    const mlHeaders: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    };

    const { data: mlData, error: mlApiError, status: mlStatus, isEmpty } = await safeFetchJson<{
      results?: Record<string, unknown>[];
      paging?: Record<string, unknown>;
    } | Record<string, unknown>[]>(mlUrl, { headers: mlHeaders }, 'ML-Promotions');

    // Handle ML API errors
    if (mlStatus === 401) {
      console.error(`${logPrefix} Token expired`);
      await updateSyncLog(supabase, logId, 'error', startTime, { error_message: 'Token expired' });
      return errorResponse('TOKEN_EXPIRED', 'Token expirado. Reconecte sua conta do Mercado Livre.', 401);
    }

    if (mlApiError && !isEmpty) {
      console.error(`${logPrefix} ML API error:`, mlApiError);
      await updateSyncLog(supabase, logId, 'error', startTime, { error_message: mlApiError });
      return errorResponse('ML_API_ERROR', mlApiError, 502);
    }

    // Parse promotions
    let rawPromotions: Record<string, unknown>[] = [];
    
    if (isEmpty) {
      console.log(`${logPrefix} ML API returned empty response - treating as 0 promotions`);
    } else if (mlData) {
      if (Array.isArray(mlData)) {
        rawPromotions = mlData;
      } else if (Array.isArray((mlData as { results?: unknown[] }).results)) {
        rawPromotions = (mlData as { results: Record<string, unknown>[] }).results;
      }
    }

    console.log(`${logPrefix} ML API returned ${rawPromotions.length} promotions`);

    const promotions: Promotion[] = rawPromotions
      .filter((p) => !!(p.id || p.promotion_id))
      .map((p) => {
        const id = (p.id as string) || (p.promotion_id as string);
        const type = ((p.type as string) || (p.promotion_type as string) || (p.kind as string) || 'DEAL').toString();
        const name = (p.name as string) || (p.title as string) || (p.promotion_name as string);
        const status = ((p.status as string) || (p.state as string) || 'unknown').toString();
        const startDate = (p.start_date as string) || (p.start_at as string) || (p.startDate as string) || null;
        const finishDate = (p.finish_date as string) || (p.end_date as string) || (p.end_at as string) || (p.finishDate as string) || null;
        return { id, type, name, status, start_date: startDate, finish_date: finishDate, items: [] };
      });

    console.log(`${logPrefix} Parsed ${promotions.length} promotions from ML`);

    // Fetch items for each promotion
    for (const promo of promotions) {
      const itemsUrl = `https://api.mercadolibre.com/seller-promotions/promotions/${promo.id}/items?promotion_type=${encodeURIComponent(promo.type)}&app_version=v2&seller_id=${mlAccount.ml_user_id}`;
      const { data: itemsData, error: itemsError } = await safeFetchJson<{
        results?: Record<string, unknown>[];
      }>(itemsUrl, { headers: mlHeaders }, `ML-Items-${promo.id}`);

      if (itemsError) {
        console.warn(`${logPrefix} Failed to fetch items for promo ${promo.id}:`, itemsError);
        continue;
      }

      if (itemsData) {
        const rawItems = itemsData.results || [];
        promo.items = rawItems.map((i) => {
          const netProceeds = i.net_proceeds as Record<string, unknown> | undefined;
          return {
            item_id: (i.item_id as string) || (i.id as string),
            status: i.status as string,
            original_price: i.original_price as number,
            deal_price: i.deal_price as number,
            effective_price: (i.price as number) || null,
            net_proceeds_amount: netProceeds?.amount as number || null,
            net_proceeds_currency: netProceeds?.currency_id as string || null,
            suggested_price: (i.suggested_discounted_price as number) || null,
            max_discounted_price: (i.max_discounted_price as number) || null,
            min_discounted_price: (i.min_discounted_price as number) || null,
            error: (i.error_message as string) || (i.error as string),
            raw: i,
          };
        });
      }
    }

    // Process promotions and create events
    const eventsToCreate: {
      workspace_id: string;
      account_id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }[] = [];

    const now = new Date();
    const hours48FromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    let promotionsSynced = 0;
    let itemsSynced = 0;

    // Track which promo IDs came from the API
    const apiPromoIds = new Set(promotions.map(p => p.id));

    for (const promo of promotions) {
      const promoEndDate = promo.finish_date ? new Date(promo.finish_date) : null;
      const existing = existingMap.get(promo.id);
      const existingItemStatuses = existingItemsMap.get(promo.id) || new Map();

      // Upsert promotion snapshot
      const { error: promoError } = await supabase
        .from('promotion_snapshots')
        .upsert({
          workspace_id: workspaceId,
          account_id: accountId,
          seller_id: accountId,
          promotion_id: promo.id,
          promotion_type: promo.type,
          promotion_name: promo.name,
          status: promo.status,
          start_at: promo.start_date,
          end_at: promo.finish_date,
          items_count: promo.items?.length || 0, // FIX #1: Update items_count
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'workspace_id,account_id,promotion_id',
        });

      if (promoError) {
        console.error(`${logPrefix} Upsert promotion snapshot failed:`, promoError);
      } else {
        promotionsSynced++;
      }

      // Track items for events
      const pendingItems: string[] = [];
      const ineligibleItems: { item_id: string; error: string }[] = [];
      const startedItems: string[] = [];

      for (const item of promo.items || []) {
        const previousStatus = existingItemStatuses.get(item.item_id);

        // Calculate discount_percent with fallbacks
        let discountPercent: number | null = null;
        if (item.original_price && item.original_price > 0) {
          if (item.deal_price) {
            discountPercent = Math.round((1 - item.deal_price / item.original_price) * 100);
          } else if (item.effective_price && item.effective_price !== item.original_price) {
            discountPercent = Math.round((1 - item.effective_price / item.original_price) * 100);
          }
        }

        // Upsert item snapshot with enriched data
        const { error: itemError } = await supabase
          .from('promotion_items_snapshots')
          .upsert({
            workspace_id: workspaceId,
            account_id: accountId,
            seller_id: accountId,
            promotion_id: promo.id,
            item_id: item.item_id,
            item_status: item.status,
            original_price: item.original_price,
            promo_price: item.deal_price,
            effective_price: item.effective_price,
            net_proceeds_amount: item.net_proceeds_amount,
            net_proceeds_currency: item.net_proceeds_currency,
            suggested_price: item.suggested_price,
            max_discounted_price: item.max_discounted_price,
            min_discounted_price: item.min_discounted_price,
            discount_percent: discountPercent,
            error_reason: item.error,
            raw_item_data: item.raw || null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'workspace_id,promotion_id,item_id',
          });

        if (itemError) {
          console.error(`${logPrefix} Upsert item snapshot failed:`, itemError);
        } else {
          itemsSynced++;
        }

        // Track status for events
        if (item.status === 'candidate' || item.status === 'pending') {
          pendingItems.push(item.item_id);
        } else if (item.status === 'ineligible' && previousStatus !== 'ineligible') {
          ineligibleItems.push({ item_id: item.item_id, error: item.error || 'Unknown' });
        } else if (item.status === 'started' && previousStatus !== 'started') {
          startedItems.push(item.item_id);
        }
      }

      // === Enrich missing items in meli_listings_cache ===
      const promoItemIds = (promo.items || []).map(i => i.item_id).filter(Boolean);
      if (promoItemIds.length > 0) {
        // Check which are already cached
        const { data: cachedRows } = await supabase
          .from('meli_listings_cache')
          .select('item_id')
          .eq('seller_id', accountId)
          .in('item_id', promoItemIds);

        const cachedSet = new Set((cachedRows || []).map(r => r.item_id));
        const uncachedIds = promoItemIds.filter(id => !cachedSet.has(id));

        if (uncachedIds.length > 0) {
          console.log(`${logPrefix} Enriching ${uncachedIds.length} uncached items for promo ${promo.id}`);
          const enrichBatchSize = 20;
          for (let ei = 0; ei < uncachedIds.length; ei += enrichBatchSize) {
            const batch = uncachedIds.slice(ei, ei + enrichBatchSize);
            try {
              const idsParam = batch.join(',');
              const enrichRes = await fetch(`https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,thumbnail,permalink`, {
                headers: mlHeaders,
              });
              if (enrichRes.ok) {
                const enrichResults = await enrichRes.json() as { code: number; body: { id: string; title: string; thumbnail: string; permalink: string } }[];
                const toUpsert = enrichResults
                  .filter(r => r.code === 200 && r.body)
                  .map(r => ({
                    item_id: r.body.id,
                    seller_id: accountId,
                    title: r.body.title || null,
                    thumbnail: r.body.thumbnail || null,
                    permalink: r.body.permalink || null,
                    updated_at: new Date().toISOString(),
                  }));

                if (toUpsert.length > 0) {
                  const { error: upsertErr } = await supabase
                    .from('meli_listings_cache')
                    .upsert(toUpsert, { onConflict: 'seller_id,item_id' });
                  if (upsertErr) {
                    console.warn(`${logPrefix} Failed to upsert enriched listings:`, upsertErr);
                  }
                }
              } else {
                console.warn(`${logPrefix} ML multiget status: ${enrichRes.status}`);
              }
            } catch (enrichErr) {
              console.warn(`${logPrefix} ML public API enrich failed:`, enrichErr);
            }
          }
        }
      }

      // Use wsAccountId (workspace_accounts FK) for all events
      if (ineligibleItems.length > 0) {
        eventsToCreate.push({
          workspace_id: workspaceId,
          account_id: wsAccountId,
          event_type: 'promotion.items_ineligible',
          payload: {
            promotion_id: promo.id,
            promotion_name: promo.name,
            item_ids: ineligibleItems.map(i => i.item_id),
            error_reasons: ineligibleItems.map(i => i.error),
            count: ineligibleItems.length,
            seller_id: accountId,
          },
        });
      }

      const PENDING_THRESHOLD = 5;
      if (pendingItems.length >= PENDING_THRESHOLD) {
        eventsToCreate.push({
          workspace_id: workspaceId,
          account_id: wsAccountId,
          event_type: 'promotion.items_pending',
          payload: {
            promotion_id: promo.id,
            promotion_name: promo.name,
            item_ids: pendingItems,
            items_count: pendingItems.length,
            seller_id: accountId,
          },
        });
      }

      if (promo.status === 'started' && promoEndDate && promoEndDate <= hours48FromNow && promoEndDate > now) {
        const wasNotEndingSoon = existing?.status !== 'started' || !existing;
        if (wasNotEndingSoon) {
          eventsToCreate.push({
            workspace_id: workspaceId,
            account_id: mlAccountId,
            event_type: 'promotion.ends_soon',
            payload: {
              promotion_id: promo.id,
              promotion_name: promo.name,
              end_at: promo.finish_date,
              items_count: promo.items?.length || 0,
              seller_id: accountId,
            },
          });
        }
      }

      if (promo.status === 'finished' && existing?.status !== 'finished') {
        eventsToCreate.push({
          workspace_id: workspaceId,
          account_id: mlAccountId,
          event_type: 'promotion.finished',
          payload: {
            promotion_id: promo.id,
            promotion_name: promo.name,
            items_count: promo.items?.length || 0,
            seller_id: accountId,
          },
        });
      }

      if (startedItems.length > 0) {
        eventsToCreate.push({
          workspace_id: workspaceId,
          account_id: mlAccountId,
          event_type: 'promotion.items_started',
          payload: {
            promotion_id: promo.id,
            promotion_name: promo.name,
            item_ids: startedItems,
            count: startedItems.length,
            seller_id: accountId,
          },
        });
      }
    }

    // FIX #4: Mark expired promotions as finished
    let expiredMarked = 0;
    for (const [promoId, existing] of existingMap) {
      if (!apiPromoIds.has(promoId) && existing.status === 'started') {
        const endAt = existing.end_at ? new Date(existing.end_at) : null;
        if (endAt && endAt < now) {
          console.log(`${logPrefix} Marking expired promotion as finished: ${promoId} (ended ${endAt.toISOString()})`);
          const { error: updateError } = await supabase
            .from('promotion_snapshots')
            .update({ 
              status: 'finished', 
              updated_at: new Date().toISOString() 
            })
            .eq('workspace_id', workspaceId)
            .eq('account_id', accountId)
            .eq('promotion_id', promoId);

          if (updateError) {
            console.error(`${logPrefix} Failed to mark promotion ${promoId} as finished:`, updateError);
          } else {
            expiredMarked++;
            // Create event for this transition
            eventsToCreate.push({
              workspace_id: workspaceId,
              account_id: mlAccountId,
              event_type: 'promotion.finished',
              payload: {
                promotion_id: promoId,
                promotion_name: null,
                reason: 'expired_not_in_api',
                seller_id: accountId,
              },
            });
          }
        }
      }
    }

    if (expiredMarked > 0) {
      console.log(`${logPrefix} Marked ${expiredMarked} expired promotions as finished`);
    }

    // Insert events
    if (eventsToCreate.length > 0) {
      const { error: eventsError } = await supabase
        .from('system_events')
        .insert(eventsToCreate);

      if (eventsError) {
        console.error(`${logPrefix} Error inserting events:`, eventsError);
      } else {
        console.log(`${logPrefix} Successfully created ${eventsToCreate.length} events`);
      }
    }

    // Update sync log as success
    const elapsed = Date.now() - startTime;
    await updateSyncLog(supabase, logId, 'success', startTime, {
      promotions_fetched: promotions.length,
      promotions_synced: promotionsSynced,
      items_synced: itemsSynced,
      events_created: eventsToCreate.length,
    });

    console.log(JSON.stringify({
      tag: 'promotions-sync',
      route: 'promotions-sync',
      workspace_id: workspaceId,
      seller_id: accountId,
      ml_account_id: mlAccountId,
      status: 'success',
      elapsed_ms: elapsed,
      promotions_fetched: promotions.length,
      promotions_synced: promotionsSynced,
      items_synced: itemsSynced,
      events_created: eventsToCreate.length,
      expired_marked: expiredMarked,
      ts: new Date().toISOString(),
    }));

    const result: SyncResult = {
      promotions_fetched: promotions.length,
      promotions_synced: promotionsSynced,
      items_synced: itemsSynced,
      events_created: eventsToCreate.length,
      expired_marked: expiredMarked,
      log_id: logId,
    };

    // Chain promotion-agent-run after successful sync
    try {
      const agentRunId = `sync-${logId || Date.now()}-${accountId}`;
      console.log(`${logPrefix} Triggering promotion-agent-run (run_id=${agentRunId})`);
      const agentRes = await fetch(`${supabaseUrl}/functions/v1/promotion-agent-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ workspace_id: workspaceId, seller_id: accountId, triggered_by: 'promotions-sync', run_id: agentRunId }),
      });
      const agentText = await agentRes.text();
      console.log(`${logPrefix} promotion-agent-run response: ${agentRes.status} ${agentText.substring(0, 200)}`);
    } catch (agentErr) {
      console.warn(`${logPrefix} promotion-agent-run chain failed (non-blocking):`, agentErr);
    }

    return successResponse(result);

  } catch (error) {
    console.error('[promotions-sync] Unhandled error:', error);

    if (logId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await updateSyncLog(supabase, logId, 'error', startTime, {
        error_message: String(error),
        error_details: { stack: (error as Error)?.stack },
      });
    }

     return errorResponse('INTERNAL_ERROR', 'Erro interno do servidor', 500, {
      message: String(error),
    });
  }
});

// Helper to update sync log
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateSyncLog(
  supabase: any,
  logId: string | null,
  status: string,
  startTime: number,
  data: Record<string, unknown>
) {
  if (!logId) return;

  const duration = Date.now() - startTime;

  await supabase
    .from('promotion_sync_logs')
    .update({
      status,
      ended_at: new Date().toISOString(),
      duration_ms: duration,
      ...data,
    })
    .eq('id', logId);
}
