import { createClient } from 'npm:@supabase/supabase-js@2';
import { auditLog } from '../_shared/audit-log.ts';
import { ensureFreshToken } from '../_shared/ml-token.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

interface ActionItem {
  item_id: string;
  price?: number;
  offer_id?: string;
}

interface ActionRequest {
  action: 'adhere' | 'remove' | 'enrich';
  workspace_id?: string;
  seller_id?: string;
  promotion_id?: string;
  promotion_type?: string;
  items: ActionItem[];
}

interface ItemResult {
  item_id: string;
  success: boolean;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: ActionRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'INVALID_REQUEST', message: 'Invalid JSON' } }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { action, workspace_id, seller_id, promotion_id, promotion_type, items } = body;

    if (!action || !items?.length) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'MISSING_PARAMS', message: 'action and items are required' } }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ===== ENRICH route: fetch title/thumbnail from ML API using seller's token =====
    if (action === 'enrich') {
      console.log(`[promotions-action] enrich ${items.length} items, seller_id=${seller_id}`);
      const enrichResult: Record<string, { title: string | null; thumbnail: string | null; permalink: string | null }> = {};
      const itemIds = items.map(i => i.item_id);

      // Get seller's access token for authenticated requests (with refresh if expired)
      let authHeaders: Record<string, string> = {};
      if (seller_id) {
        const { data: mlAcc } = await supabase
          .from('ml_accounts')
          .select('id, access_token, refresh_token, ml_user_id, token_expires_at')
          .eq('ml_user_id', seller_id)
          .eq('is_active', true)
          .maybeSingle();
        if (mlAcc) {
          const token = await ensureFreshToken(supabase, mlAcc as any, '[promotions-action]');
          if (token) authHeaders = { 'Authorization': `Bearer ${token}` };
        }
      }

      // Use multiget with auth token (batches of 20)
      const mlBatchSize = 20;
      for (let i = 0; i < itemIds.length; i += mlBatchSize) {
        const batch = itemIds.slice(i, i + mlBatchSize);
        try {
          const idsParam = batch.join(',');
          const res = await fetch(`https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,thumbnail,permalink`, {
            headers: authHeaders,
          });
          if (res.ok) {
            const results = await res.json() as { code: number; body: { id: string; title: string; thumbnail: string; permalink: string } }[];
            for (const r of results) {
              if (r.code === 200 && r.body) {
                enrichResult[r.body.id] = {
                  title: r.body.title || null,
                  thumbnail: r.body.thumbnail || null,
                  permalink: r.body.permalink || null,
                };
              }
            }
          } else {
            console.warn(`[promotions-action] enrich multiget status: ${res.status}`);
          }
        } catch (err) {
          console.warn('[promotions-action] enrich batch error:', err);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, data: enrichResult }),
        { status: 200, headers: corsHeaders }
      );
    }

    // For adhere/remove, all params are required
    if (!workspace_id || !seller_id || !promotion_id || !promotion_type) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'MISSING_PARAMS', message: 'workspace_id, seller_id, promotion_id, promotion_type are required for adhere/remove' } }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (action !== 'adhere' && action !== 'remove') {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'INVALID_ACTION', message: 'action must be "adhere", "remove", or "enrich"' } }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[promotions-action] ${action} ${items.length} items for promo ${promotion_id} (type: ${promotion_type})`);

    // Fetch ML account credentials
    const { data: mlAccount, error: mlError } = await supabase
      .from('ml_accounts')
      .select('id, access_token, ml_user_id')
      .eq('ml_user_id', seller_id)
      .eq('is_active', true)
      .maybeSingle();

    if (mlError || !mlAccount) {
      console.error('[promotions-action] ML account not found:', mlError);
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'NO_CONNECTED_ACCOUNT', message: 'Conta ML não encontrada ou inativa' } }),
        { status: 400, headers: corsHeaders }
      );
    }

    const accessToken = (mlAccount as { access_token: string }).access_token;
    const mlUserId = (mlAccount as { ml_user_id: string }).ml_user_id;

    // Pre-fetch offer_ids from DB for items that don't have one (SMART/PRICE_MATCHING)
    const needsOfferId = (promotion_type === 'SMART' || promotion_type === 'PRICE_MATCHING') && action === 'adhere';
    let offerIdMap: Map<string, string> = new Map();

    if (needsOfferId) {
      const itemsWithoutOfferId = items.filter(i => !i.offer_id).map(i => i.item_id);
      if (itemsWithoutOfferId.length > 0) {
        const { data: rawRows } = await supabase
          .from('promotion_items_snapshots')
          .select('item_id, raw_item_data')
          .eq('workspace_id', workspace_id)
          .eq('promotion_id', promotion_id)
          .in('item_id', itemsWithoutOfferId);

        if (rawRows) {
          for (const row of rawRows) {
            const raw = row.raw_item_data as Record<string, unknown> | null;
            const oid = raw?.offer_id as string | undefined;
            if (oid) {
              offerIdMap.set(row.item_id, oid);
            }
          }
        }
      }
    }

    const results: ItemResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const item of items) {
      try {
        const response = await callMeliApi({
          action,
          promotionType: promotion_type,
          promotionId: promotion_id,
          itemId: item.item_id,
          sellerId: mlUserId,
          accessToken,
          price: item.price,
          offerId: item.offer_id || offerIdMap.get(item.item_id),
        });

        const status = response.status;
        let responseBody: Record<string, unknown> | null = null;
        try {
          const text = await response.text();
          if (text) responseBody = JSON.parse(text);
        } catch { /* ignore */ }

        if (status >= 200 && status < 300) {
          results.push({ item_id: item.item_id, success: true });
          successCount++;
          console.log(`[promotions-action] ${action} OK for item ${item.item_id}`);
        } else {
          const errorMsg = responseBody?.message || responseBody?.error || `HTTP ${status}`;
          results.push({ item_id: item.item_id, success: false, error: String(errorMsg) });
          failedCount++;
          console.warn(`[promotions-action] ${action} FAILED for item ${item.item_id}: ${errorMsg}`, JSON.stringify(responseBody));
        }
      } catch (err) {
        results.push({ item_id: item.item_id, success: false, error: String(err) });
        failedCount++;
        console.error(`[promotions-action] ${action} ERROR for item ${item.item_id}:`, err);
      }
    }

    // Update item statuses in the database for successful operations
    for (const result of results) {
      if (!result.success) continue;
      const newStatus = action === 'adhere' ? 'started' : 'candidate';
      await supabase
        .from('promotion_items_snapshots')
        .update({ item_status: newStatus, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspace_id)
        .eq('promotion_id', promotion_id)
        .eq('item_id', result.item_id);
    }

    // Update items_count in promotion_snapshots
    if (successCount > 0) {
      const { count } = await supabase
        .from('promotion_items_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspace_id)
        .eq('promotion_id', promotion_id);

      if (count !== null) {
        await supabase
          .from('promotion_snapshots')
          .update({ items_count: count, updated_at: new Date().toISOString() })
          .eq('workspace_id', workspace_id)
          .eq('promotion_id', promotion_id);
      }
    }

    console.log(`[promotions-action] Done: ${successCount} success, ${failedCount} failed`);
    if (failedCount > 0) {
      await auditLog(supabase, { level: 'warn', area: 'promotions', action: `${action}_partial`, userId: null, success: false, message: `${action}: ${successCount} ok, ${failedCount} falhas`, meta: { seller_id, promotion_id, success_count: successCount, failed_count: failedCount } });
    } else {
      await auditLog(supabase, { level: 'info', area: 'promotions', action: `${action}_completed`, userId: null, success: true, message: `${action}: ${successCount} itens processados`, meta: { seller_id, promotion_id, success_count: successCount } });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: { success_count: successCount, failed_count: failedCount, results },
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[promotions-action] Unhandled error:', error);
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const svc = createClient(supabaseUrl, supabaseServiceKey);
      await auditLog(svc, { level: 'error', area: 'promotions', action: 'unhandled_error', userId: null, success: false, message: String(error), meta: {} });
    } catch (_) { /* fail-safe */ }
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: String(error) } }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// ===== Helper: Build and execute the correct ML API call =====
interface MeliApiParams {
  action: 'adhere' | 'remove';
  promotionType: string;
  promotionId: string;
  itemId: string;
  sellerId: string;
  accessToken: string;
  price?: number;
  offerId?: string;
}

async function callMeliApi(params: MeliApiParams): Promise<Response> {
  const { action, promotionType, promotionId, itemId, sellerId, accessToken, price, offerId } = params;
  const baseUrl = 'https://api.mercadolibre.com/seller-promotions';

  if (action === 'remove') {
    // DELETE: same endpoint for all types
    const url = `${baseUrl}/items/${itemId}?app_version=v2`;
    return fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        promotion_id: promotionId,
        promotion_type: promotionType,
      }),
    });
  }

  // ADHERE
  if (promotionType === 'SMART' || promotionType === 'PRICE_MATCHING') {
    // SMART / PRICE_MATCHING: POST /seller-promotions/items/{item_id}?app_version=v2
    const url = `${baseUrl}/items/${itemId}?app_version=v2`;
    const body: Record<string, unknown> = {
      promotion_id: promotionId,
      promotion_type: promotionType,
    };
    if (offerId) body.offer_id = offerId;
    if (price) body.price = price;

    console.log(`[promotions-action] SMART adhere URL: ${url}, body:`, JSON.stringify(body));

    return fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  // DEAL and other types: POST /seller-promotions/items/{item_id}?user_id={seller_id}&app_version=v2
  const url = `${baseUrl}/items/${itemId}?user_id=${sellerId}&app_version=v2`;
  const body: Record<string, unknown> = {
    promotion_id: promotionId,
    promotion_type: promotionType,
  };
  if (price) body.deal_price = price;

  console.log(`[promotions-action] DEAL adhere URL: ${url}, body:`, JSON.stringify(body));

  return fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
