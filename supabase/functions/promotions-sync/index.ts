import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  start_date: string;
  finish_date: string;
  items?: PromotionItem[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let logId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { workspace_id, account_id, sync_source = 'manual' } = await req.json();

    if (!workspace_id || !account_id) {
      return new Response(
        JSON.stringify({ error: 'workspace_id and account_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[promotions-sync] Starting sync for workspace=${workspace_id}, account=${account_id}`);

    // Create sync log entry
    const { data: syncLog, error: logError } = await supabase
      .from('promotion_sync_logs')
      .insert({
        workspace_id,
        account_id,
        status: 'running',
        sync_source,
      })
      .select('id')
      .single();

    if (logError) {
      console.error('[promotions-sync] Error creating sync log:', logError);
    } else {
      logId = syncLog.id;
    }

    // Fetch ML account credentials
    const { data: mlAccount, error: mlError } = await supabase
      .from('ml_accounts')
      .select('access_token, ml_user_id')
      .eq('ml_user_id', account_id)
      .eq('is_active', true)
      .single();

    if (mlError || !mlAccount) {
      const errorMsg = 'ML account not found or not active';
      console.error('[promotions-sync]', errorMsg);
      
      if (logId) {
        await updateSyncLog(supabase, logId, 'error', startTime, { error_message: errorMsg });
      }
      
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch existing promotions snapshot for comparison
    const { data: existingSnapshots } = await supabase
      .from('promotion_snapshots')
      .select('promotion_id, status, items_count')
      .eq('workspace_id', workspace_id)
      .eq('account_id', account_id);

    const existingMap = new Map(
      (existingSnapshots || []).map(s => [s.promotion_id, s])
    );

    // Fetch existing items for comparison
    const { data: existingItems } = await supabase
      .from('promotion_items_snapshots')
      .select('promotion_id, item_id, item_status')
      .eq('workspace_id', workspace_id)
      .eq('account_id', account_id);

    const existingItemsMap = new Map<string, Map<string, string>>();
    for (const item of existingItems || []) {
      if (!existingItemsMap.has(item.promotion_id)) {
        existingItemsMap.set(item.promotion_id, new Map());
      }
      existingItemsMap.get(item.promotion_id)!.set(item.item_id, item.item_status);
    }

    // Fetch promotions from ML API
    let promotions: Promotion[] = [];
    let fetchError: string | null = null;
    
    try {
      const mlResponse = await fetch(
        `https://api.mercadolibre.com/seller-promotions/promotions?seller_id=${mlAccount.ml_user_id}`,
        {
          headers: {
            'Authorization': `Bearer ${mlAccount.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!mlResponse.ok) {
        if (mlResponse.status === 401) {
          fetchError = 'Token expired - reauthorization required';
        } else {
          fetchError = `ML API error: ${mlResponse.status}`;
        }
        console.error('[promotions-sync] ML API error:', await mlResponse.text());
      } else {
        const mlData = await mlResponse.json();
        promotions = (mlData.results || mlData || []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          type: p.type as string || 'deal',
          name: p.name as string || p.title as string,
          status: p.status as string,
          start_date: p.start_date as string,
          finish_date: p.finish_date as string,
          items: [], // Items need separate fetch
        }));

        // Fetch items for each promotion
        for (const promo of promotions) {
          try {
            const itemsResponse = await fetch(
              `https://api.mercadolibre.com/seller-promotions/promotions/${promo.id}/items?seller_id=${mlAccount.ml_user_id}`,
              {
                headers: {
                  'Authorization': `Bearer ${mlAccount.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (itemsResponse.ok) {
              const itemsData = await itemsResponse.json();
              promo.items = (itemsData.results || itemsData || []).map((i: Record<string, unknown>) => ({
                item_id: i.item_id as string || i.id as string,
                status: i.status as string,
                original_price: i.original_price as number,
                deal_price: i.deal_price as number,
                error: i.error_message as string || i.error as string,
              }));
            }
          } catch (itemErr) {
            console.error(`[promotions-sync] Error fetching items for promo ${promo.id}:`, itemErr);
          }
        }
      }
    } catch (apiErr) {
      fetchError = `API call failed: ${String(apiErr)}`;
      console.error('[promotions-sync] ML API call failed:', apiErr);
    }

    // If fetch failed completely, update log and return
    if (fetchError && promotions.length === 0) {
      if (logId) {
        await updateSyncLog(supabase, logId, 'error', startTime, { error_message: fetchError });
      }
      return new Response(
        JSON.stringify({ error: fetchError, success: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      const promoEndDate = new Date(promo.finish_date);
      const existing = existingMap.get(promo.id);
      const existingItemStatuses = existingItemsMap.get(promo.id) || new Map();

      // Upsert promotion snapshot
      const { error: promoError } = await supabase
        .from('promotion_snapshots')
        .upsert({
          workspace_id,
          account_id,
          seller_id: account_id,
          promotion_id: promo.id,
          promotion_type: promo.type,
          promotion_name: promo.name,
          status: promo.status,
          start_at: promo.start_date,
          end_at: promo.finish_date,
          items_count: promo.items?.length || 0,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'workspace_id,account_id,promotion_id',
        });

      if (!promoError) promotionsSynced++;

      // Process items
      const pendingItems: string[] = [];
      const ineligibleItems: { item_id: string; error: string }[] = [];
      const startedItems: string[] = [];

      for (const item of promo.items || []) {
        const previousStatus = existingItemStatuses.get(item.item_id);
        
        // Upsert item snapshot
        const { error: itemError } = await supabase
          .from('promotion_items_snapshots')
          .upsert({
            workspace_id,
            account_id,
            seller_id: account_id,
            promotion_id: promo.id,
            item_id: item.item_id,
            item_status: item.status,
            original_price: item.original_price,
            promo_price: item.deal_price,
            discount_percent: item.original_price && item.deal_price 
              ? ((item.original_price - item.deal_price) / item.original_price) * 100 
              : null,
            error_reason: item.error,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'workspace_id,promotion_id,item_id',
          });

        if (!itemError) itemsSynced++;

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

      // Event: Ineligible items (high priority - needs action)
      if (ineligibleItems.length > 0) {
        eventsToCreate.push({
          workspace_id,
          account_id,
          event_type: 'promotion.items_ineligible',
          payload: {
            promotion_id: promo.id,
            promotion_name: promo.name,
            item_ids: ineligibleItems.map(i => i.item_id),
            error_reasons: ineligibleItems.map(i => i.error),
            count: ineligibleItems.length,
            seller_id: account_id,
          },
        });
      }

      // Event: Many pending items (needs attention)
      const PENDING_THRESHOLD = 5;
      if (pendingItems.length >= PENDING_THRESHOLD) {
        eventsToCreate.push({
          workspace_id,
          account_id,
          event_type: 'promotion.items_pending',
          payload: {
            promotion_id: promo.id,
            promotion_name: promo.name,
            item_ids: pendingItems,
            items_count: pendingItems.length,
            seller_id: account_id,
          },
        });
      }

      // Event: Promotion ends soon (alert only, not task)
      if (promo.status === 'started' && promoEndDate <= hours48FromNow && promoEndDate > now) {
        const wasNotEndingSoon = existing?.status !== 'started' || !existing;
        if (wasNotEndingSoon) {
          eventsToCreate.push({
            workspace_id,
            account_id,
            event_type: 'promotion.ends_soon',
            payload: {
              promotion_id: promo.id,
              promotion_name: promo.name,
              end_at: promo.finish_date,
              items_count: promo.items?.length || 0,
              seller_id: account_id,
            },
          });
        }
      }

      // Event: Promotion finished (post-campaign review)
      if (promo.status === 'finished' && existing?.status !== 'finished') {
        eventsToCreate.push({
          workspace_id,
          account_id,
          event_type: 'promotion.finished',
          payload: {
            promotion_id: promo.id,
            promotion_name: promo.name,
            items_count: promo.items?.length || 0,
            seller_id: account_id,
          },
        });
      }

      // Event: Items started (for history, not task)
      if (startedItems.length > 0) {
        eventsToCreate.push({
          workspace_id,
          account_id,
          event_type: 'promotion.items_started',
          payload: {
            promotion_id: promo.id,
            promotion_name: promo.name,
            item_ids: startedItems,
            count: startedItems.length,
            seller_id: account_id,
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
        console.error('[promotions-sync] Error inserting events:', eventsError);
      }
    }

    // Update sync log as success
    if (logId) {
      await updateSyncLog(supabase, logId, fetchError ? 'partial' : 'success', startTime, {
        promotions_fetched: promotions.length,
        promotions_synced: promotionsSynced,
        items_synced: itemsSynced,
        events_created: eventsToCreate.length,
        error_message: fetchError,
      });
    }

    console.log(`[promotions-sync] Completed. Promotions: ${promotionsSynced}, Items: ${itemsSynced}, Events: ${eventsToCreate.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        promotions_fetched: promotions.length,
        promotions_synced: promotionsSynced,
        items_synced: itemsSynced,
        events_created: eventsToCreate.length,
        log_id: logId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[promotions-sync] Error:', error);
    
    // Update log as error if we have a log ID
    if (logId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await updateSyncLog(supabase, logId, 'error', startTime, {
        error_message: String(error),
        error_details: { stack: (error as Error)?.stack },
      });
    }
    
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper to update sync log
async function updateSyncLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  logId: string,
  status: string,
  startTime: number,
  data: Record<string, unknown>
) {
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
