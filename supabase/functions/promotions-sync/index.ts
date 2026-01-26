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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { workspace_id, account_id, ml_account_id, access_token } = await req.json();

    if (!workspace_id || !account_id) {
      return new Response(
        JSON.stringify({ error: 'workspace_id and account_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[promotions-sync] Starting sync for workspace=${workspace_id}, account=${account_id}`);

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

    // In a real implementation, this would call ML API
    // For now, we'll simulate the structure
    const promotions: Promotion[] = [];
    
    // If we have access token, we would fetch from ML API:
    // const response = await fetch(`https://api.mercadolibre.com/seller-promotions/promotions?seller_id=${ml_account_id}`, {
    //   headers: { 'Authorization': `Bearer ${access_token}` }
    // });

    const eventsToCreate: {
      workspace_id: string;
      account_id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }[] = [];

    const now = new Date();
    const hours48FromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    for (const promo of promotions) {
      const promoEndDate = new Date(promo.finish_date);
      const existing = existingMap.get(promo.id);
      const existingItemStatuses = existingItemsMap.get(promo.id) || new Map();

      // Upsert promotion snapshot
      await supabase
        .from('promotion_snapshots')
        .upsert({
          workspace_id,
          account_id,
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

      // Process items
      const pendingItems: string[] = [];
      const ineligibleItems: { item_id: string; error: string }[] = [];
      const startedItems: string[] = [];

      for (const item of promo.items || []) {
        const previousStatus = existingItemStatuses.get(item.item_id);
        
        // Upsert item snapshot
        await supabase
          .from('promotion_items_snapshots')
          .upsert({
            workspace_id,
            account_id,
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

    console.log(`[promotions-sync] Completed. Promotions: ${promotions.length}, Events: ${eventsToCreate.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        promotions_synced: promotions.length,
        events_created: eventsToCreate.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[promotions-sync] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
