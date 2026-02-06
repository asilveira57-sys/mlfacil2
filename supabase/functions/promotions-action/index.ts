import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

interface ActionItem {
  item_id: string;
  price?: number;
}

interface ActionRequest {
  action: 'adhere' | 'remove';
  workspace_id: string;
  seller_id: string;
  promotion_id: string;
  promotion_type: string;
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

    // Validate
    if (!action || !workspace_id || !seller_id || !promotion_id || !promotion_type || !items?.length) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'MISSING_PARAMS', message: 'action, workspace_id, seller_id, promotion_id, promotion_type, and items are required' } }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (action !== 'adhere' && action !== 'remove') {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'INVALID_ACTION', message: 'action must be "adhere" or "remove"' } }),
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
    const results: ItemResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const item of items) {
      try {
        const baseUrl = `https://api.mercadolibre.com/seller-promotions/promotions/${promotion_id}/items/${item.item_id}`;
        const queryParams = `?promotion_type=${encodeURIComponent(promotion_type)}&app_version=v2&seller_id=${mlUserId}`;
        const url = `${baseUrl}${queryParams}`;

        let response: Response;

        if (action === 'adhere') {
          // POST to adhere item to promotion
          const requestBody: Record<string, unknown> = {};
          if (item.price) {
            requestBody.price = item.price;
          }
          
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
        } else {
          // DELETE to remove item from promotion
          response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          });
        }

        const status = response.status;
        let responseBody: Record<string, unknown> | null = null;
        
        try {
          const text = await response.text();
          if (text) {
            responseBody = JSON.parse(text);
          }
        } catch {
          // ignore parse errors for empty responses
        }

        if (status >= 200 && status < 300) {
          results.push({ item_id: item.item_id, success: true });
          successCount++;
          console.log(`[promotions-action] ${action} OK for item ${item.item_id}`);
        } else {
          const errorMsg = responseBody?.message || responseBody?.error || `HTTP ${status}`;
          results.push({ item_id: item.item_id, success: false, error: String(errorMsg) });
          failedCount++;
          console.warn(`[promotions-action] ${action} FAILED for item ${item.item_id}: ${errorMsg}`);
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
        .update({ 
          item_status: newStatus, 
          updated_at: new Date().toISOString() 
        })
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

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          success_count: successCount,
          failed_count: failedCount,
          results,
        },
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('[promotions-action] Unhandled error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: String(error) } }),
      { status: 500, headers: corsHeaders }
    );
  }
});
