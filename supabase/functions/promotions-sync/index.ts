import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  error?: string;
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
    
    // Handle empty response
    const text = await response.text();
    console.log(`[${context}] Status: ${status}, Content-Type: ${contentType}, Body length: ${text?.length || 0}`);
    
    if (!text || text.trim() === '') {
      // Empty response with success status = no data (valid for promotions API)
      if (status >= 200 && status < 300) {
        console.log(`[${context}] Empty response with success status - treating as empty array`);
        return { data: null, error: null, status, isEmpty: true };
      }
      return { data: null, error: `Empty response with status ${status}`, status, isEmpty: true };
    }
    
    // Parse JSON safely
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
      .select('id, access_token, ml_user_id')
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

    const mlAccountId = (mlAccount as { id: string }).id;
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
    const { data: existingSnapshots } = await supabase
      .from('promotion_snapshots')
      .select('promotion_id, status')
      .eq('workspace_id', workspaceId)
      .eq('account_id', accountId);

    const existingMap = new Map(
      (existingSnapshots || []).map(s => [s.promotion_id, s])
    );

    // Fetch existing items for comparison
    const { data: existingItems } = await supabase
      .from('promotion_items_snapshots')
      .select('promotion_id, item_id, item_status')
      .eq('workspace_id', workspaceId)
      .eq('account_id', accountId);

    const existingItemsMap = new Map<string, Map<string, string>>();
    for (const item of existingItems || []) {
      if (!existingItemsMap.has(item.promotion_id)) {
        existingItemsMap.set(item.promotion_id, new Map());
      }
      existingItemsMap.get(item.promotion_id)!.set(item.item_id, item.item_status);
    }

    // Fetch promotions from ML API with safe JSON handling
    // Mercado Livre Promotions API (v2)
    // Docs: /seller-promotions/users/{user_id}?app_version=v2
    const mlUrl = `https://api.mercadolibre.com/seller-promotions/users/${mlAccount.ml_user_id}?app_version=v2`;
    const mlHeaders: Record<string, string> = {
      'Authorization': `Bearer ${(mlAccount as { access_token: string }).access_token}`,
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

    // Check for actual API errors (not just empty data)
    if (mlApiError && !isEmpty) {
      console.error(`${logPrefix} ML API error:`, mlApiError);
      await updateSyncLog(supabase, logId, 'error', startTime, { error_message: mlApiError });
      return errorResponse('ML_API_ERROR', mlApiError, 502);
    }

    // Handle empty or null response as "no promotions" (valid scenario)
    // ML API can return: { results: [...] } or [] or null/empty body
    let rawPromotions: Record<string, unknown>[] = [];
    
    if (isEmpty) {
      console.log(`${logPrefix} ML API returned empty response - treating as 0 promotions`);
    } else if (mlData) {
      if (Array.isArray(mlData)) {
        // Direct array response
        rawPromotions = mlData;
      } else if (Array.isArray((mlData as { results?: unknown[] }).results)) {
        // Wrapped response { results: [...] }
        rawPromotions = (mlData as { results: Record<string, unknown>[] }).results;
      }
    }

    console.log(`${logPrefix} ML API returned ${rawPromotions.length} promotions`);

    // Parse promotions (be defensive with schema differences)
    const promotions: Promotion[] = rawPromotions
      .filter((p) => !!(p.id || p.promotion_id))
      .map((p) => {
        const id = (p.id as string) || (p.promotion_id as string);
        const type = ((p.type as string) || (p.promotion_type as string) || (p.kind as string) || 'DEAL').toString();
        const name = (p.name as string) || (p.title as string) || (p.promotion_name as string);
        const status = ((p.status as string) || (p.state as string) || 'unknown').toString();
        const startDate = (p.start_date as string) || (p.start_at as string) || (p.startDate as string) || null;
        const finishDate = (p.finish_date as string) || (p.end_date as string) || (p.end_at as string) || (p.finishDate as string) || null;
        return {
          id,
          type,
          name,
          status,
          start_date: startDate,
          finish_date: finishDate,
          items: [],
        };
      });

    console.log(`${logPrefix} Fetched ${promotions.length} promotions from ML`);

    // Fetch items for each promotion
    for (const promo of promotions) {
      // Docs: /seller-promotions/promotions/{promotion_id}/items?promotion_type=...&app_version=v2
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
        promo.items = rawItems.map((i) => ({
          item_id: (i.item_id as string) || (i.id as string),
          status: i.status as string,
          original_price: i.original_price as number,
          deal_price: i.deal_price as number,
          error: (i.error_message as string) || (i.error as string),
        }));
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

        // Upsert item snapshot
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
            error_reason: item.error,
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

      // Generate events based on operational impact
      if (ineligibleItems.length > 0) {
        eventsToCreate.push({
          workspace_id: workspaceId,
          account_id: accountId,
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
          account_id: accountId,
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
            account_id: accountId,
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
          account_id: accountId,
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
          account_id: accountId,
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

    // Insert events
    if (eventsToCreate.length > 0) {
      const { error: eventsError } = await supabase
        .from('system_events')
        .insert(eventsToCreate);

      if (eventsError) {
        console.error(`${logPrefix} Error inserting events:`, eventsError);
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
      ml_account_id: (mlAccount as { id: string }).id,
      status: 'success',
      elapsed_ms: elapsed,
      promotions_fetched: promotions.length,
      promotions_synced: promotionsSynced,
      items_synced: itemsSynced,
      events_created: eventsToCreate.length,
      ts: new Date().toISOString(),
    }));

    const result: SyncResult = {
      promotions_fetched: promotions.length,
      promotions_synced: promotionsSynced,
      items_synced: itemsSynced,
      events_created: eventsToCreate.length,
      log_id: logId,
    };

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
