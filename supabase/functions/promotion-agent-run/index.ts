import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

interface AgentConfig {
  is_enabled: boolean;
  max_seller_discount: number;
  min_total_discount: number | null;
  require_copart: boolean;
  scope_type: string;
  scope_items: string[];
  scope_categories: string[];
  exclude_items: string[];
  accepted_types: string[];
  accept_unknown_type: boolean;
  min_stock: number;
  min_margin: number | null;
  allow_when_margin_unknown: boolean;
}

interface CandidateItem {
  item_id: string;
  promotion_id: string;
  item_status: string;
  original_price: number | null;
  promo_price: number | null;
  raw_item_data: Record<string, unknown> | null;
}

interface PromotionInfo {
  promotion_id: string;
  promotion_type: string;
  promotion_name: string | null;
  status: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
    }

    const workspaceId = body.workspace_id as string;
    const sellerId = body.seller_id as string;
    const triggeredBy = (body.triggered_by as string) || 'manual';
    const runId = (body.run_id as string) || `${triggeredBy}-${Date.now()}-${sellerId}`;

    if (!workspaceId || !sellerId) {
      return new Response(JSON.stringify({ ok: false, error: 'workspace_id and seller_id required' }), { status: 400, headers: corsHeaders });
    }

    const log = (msg: string, data?: unknown) => {
      console.log(JSON.stringify({ tag: 'promotion-agent-run', run_id: runId, workspace_id: workspaceId, seller_id: sellerId, msg, data, ts: new Date().toISOString() }));
    };

    log('Starting agent run', { triggered_by: triggeredBy });

    // Idempotency check
    const { data: existingLog } = await supabase
      .from('promotion_agent_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('run_id', runId)
      .maybeSingle();

    if (existingLog) {
      log('Run already exists, returning cached result');
      return new Response(JSON.stringify({ ok: true, data: existingLog, cached: true }), { headers: corsHeaders });
    }

    // Fetch config
    const { data: configRow, error: configError } = await supabase
      .from('promotion_agent_config')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('seller_id', sellerId)
      .maybeSingle();

    if (configError) {
      log('Error fetching config', configError);
      return new Response(JSON.stringify({ ok: false, error: 'Config fetch failed' }), { status: 500, headers: corsHeaders });
    }

    if (!configRow || !configRow.is_enabled) {
      log('Agent disabled or no config');
      await insertLog(supabase, workspaceId, sellerId, runId, triggeredBy, 0, 0, 0, 0, { reason: 'skipped_disabled' });
      return new Response(JSON.stringify({ ok: true, data: { skipped: true, reason: 'disabled' } }), { headers: corsHeaders });
    }

    const config = configRow as unknown as AgentConfig;
    log('Config loaded', { max_seller_discount: config.max_seller_discount, scope_type: config.scope_type });

    // Fetch ML credentials
    const { data: mlAccount } = await supabase
      .from('ml_accounts')
      .select('id, access_token, ml_user_id, token_expires_at')
      .eq('ml_user_id', sellerId)
      .eq('is_active', true)
      .maybeSingle();

    if (!mlAccount) {
      log('No ML account found');
      await insertLog(supabase, workspaceId, sellerId, runId, triggeredBy, 0, 0, 0, 0, { reason: 'no_ml_account' });
      return new Response(JSON.stringify({ ok: true, data: { skipped: true, reason: 'no_ml_account' } }), { headers: corsHeaders });
    }

    let accessToken = mlAccount.access_token;

    // Refresh token if expired
    if (mlAccount.token_expires_at && new Date(mlAccount.token_expires_at) <= new Date()) {
      log('Token expired, refreshing');
      try {
        const refreshRes = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ account_id: mlAccount.id, seller_id: mlAccount.ml_user_id }),
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.access_token) {
            accessToken = refreshData.access_token;
            log('Token refreshed');
          }
        }
      } catch (err) {
        log('Token refresh failed', String(err));
      }
    }

    // Fetch candidates
    const { data: candidates, error: candError } = await supabase
      .from('promotion_items_snapshots')
      .select('item_id, promotion_id, item_status, original_price, promo_price, raw_item_data')
      .eq('workspace_id', workspaceId)
      .eq('account_id', sellerId)
      .eq('item_status', 'candidate');

    if (candError) {
      log('Error fetching candidates', candError);
      await insertLog(supabase, workspaceId, sellerId, runId, triggeredBy, 0, 0, 0, 0, { reason: 'candidate_fetch_error', error: String(candError) });
      return new Response(JSON.stringify({ ok: false, error: 'Failed to fetch candidates' }), { status: 500, headers: corsHeaders });
    }

    if (!candidates || candidates.length === 0) {
      log('No candidates found');
      await insertLog(supabase, workspaceId, sellerId, runId, triggeredBy, 0, 0, 0, 0, { reason: 'no_candidates' });
      return new Response(JSON.stringify({ ok: true, data: { items_adhered: 0, reason: 'no_candidates' } }), { headers: corsHeaders });
    }

    log('Candidates found', { count: candidates.length });

    // Fetch promotion info for each unique promotion_id
    const promoIds = [...new Set(candidates.map(c => c.promotion_id))];
    const { data: promoRows } = await supabase
      .from('promotion_snapshots')
      .select('promotion_id, promotion_type, promotion_name, status')
      .eq('workspace_id', workspaceId)
      .in('promotion_id', promoIds);

    const promoMap = new Map<string, PromotionInfo>();
    for (const p of (promoRows || [])) {
      promoMap.set(p.promotion_id, p as PromotionInfo);
    }

    // Evaluate each candidate
    const approved: { candidate: CandidateItem; promo: PromotionInfo }[] = [];
    const skipped: { item_id: string; reason: string }[] = [];

    for (const cand of candidates as CandidateItem[]) {
      const promo = promoMap.get(cand.promotion_id);
      if (!promo) {
        skipped.push({ item_id: cand.item_id, reason: 'promo_not_found' });
        continue;
      }

      const raw = cand.raw_item_data || {};
      const sellerPct = (raw.seller_percentage as number) || 0;
      const meliPct = (raw.meli_percentage as number) || 0;

      // Rule 1: Seller discount cap
      if (sellerPct > config.max_seller_discount) {
        skipped.push({ item_id: cand.item_id, reason: `seller_pct_${sellerPct}_exceeds_max_${config.max_seller_discount}` });
        continue;
      }

      // Rule 2: Min total discount
      if (config.min_total_discount !== null && (sellerPct + meliPct) < config.min_total_discount) {
        skipped.push({ item_id: cand.item_id, reason: `total_discount_${sellerPct + meliPct}_below_min_${config.min_total_discount}` });
        continue;
      }

      // Rule 3: Coparticipation
      if (config.require_copart && meliPct <= 0) {
        skipped.push({ item_id: cand.item_id, reason: 'no_coparticipation' });
        continue;
      }

      // Rule 4: Accepted types
      const promoType = promo.promotion_type || 'unknown';
      if (!config.accepted_types.includes(promoType) && !config.accept_unknown_type) {
        skipped.push({ item_id: cand.item_id, reason: `type_${promoType}_not_accepted` });
        continue;
      }

      // Rule 5: Scope
      if (config.scope_type === 'items' && config.scope_items.length > 0 && !config.scope_items.includes(cand.item_id)) {
        skipped.push({ item_id: cand.item_id, reason: 'not_in_scope_items' });
        continue;
      }

      // Rule 6: Exclusions
      if (config.exclude_items.includes(cand.item_id)) {
        skipped.push({ item_id: cand.item_id, reason: 'excluded' });
        continue;
      }

      // Rule 7: Min stock
      if (config.min_stock > 0) {
        const stock = (raw.available_quantity as number) || (raw.stock as number) || 0;
        if (stock < config.min_stock) {
          skipped.push({ item_id: cand.item_id, reason: `stock_${stock}_below_min_${config.min_stock}` });
          continue;
        }
      }

      approved.push({ candidate: cand, promo });
    }

    log('Evaluation complete', { approved: approved.length, skipped: skipped.length });

    // Non-manual runs: suggest only, never adhere automatically
    if (triggeredBy !== 'manual') {
      const suggested = approved.map(({ candidate, promo }) => ({
        item_id: candidate.item_id,
        promotion_id: promo.promotion_id,
        promotion_name: promo.promotion_name,
        promotion_type: promo.promotion_type,
        promo_price: candidate.promo_price,
        original_price: candidate.original_price,
      }));

      const suggestedPromotions = new Set(approved.map(a => a.promo.promotion_id)).size;
      await insertLog(supabase, workspaceId, sellerId, runId, triggeredBy, suggestedPromotions, 0, 0, skipped.length, {
        reason: 'suggested_pending_confirmation',
        suggested,
        skipped,
        duration_ms: Date.now() - startTime,
      });

      if (approved.length > 0) {
        // target_seller_id MUST be set — this is a per-seller notification, never global
        const targetSellerId = sellerId;
        if (!targetSellerId) {
          log('ERROR: sellerId is empty, skipping announcement to prevent global leak');
        } else {
          try {
            const { error: annErr } = await supabase.from('mktpfacil_announcements').insert({
              title: `🤖 Agente encontrou ${approved.length} produto(s) elegíveis para promoção`,
              content: 'Revise e confirme em Promoções',
              priority: 1,
              is_active: true,
              plan_target: 'all',
              target_seller_id: targetSellerId,
              published_at: new Date().toISOString(),
            });
            if (annErr) {
              log('Failed to create notification: ' + JSON.stringify(annErr));
            } else {
              log(`Suggestion notification created for seller ${targetSellerId}`);
            }
          } catch (err) {
            log('Failed to create notification', String(err));
          }
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        data: { items_adhered: 0, items_suggested: approved.length, items_skipped: skipped.length, reason: 'suggested_pending_confirmation' },
      }), { headers: corsHeaders });
    }

    // Execute adhesion for approved items
    let adhered = 0;
    let failed = 0;
    const results: { item_id: string; promotion_id: string; success: boolean; error?: string }[] = [];

    for (const { candidate, promo } of approved) {
      try {
        const raw = candidate.raw_item_data || {};
        const offerId = raw.offer_id as string | undefined;
        const price = candidate.promo_price || candidate.original_price || undefined;

        const res = await callMeliApi({
          action: 'adhere',
          promotionType: promo.promotion_type,
          promotionId: promo.promotion_id,
          itemId: candidate.item_id,
          sellerId: mlAccount.ml_user_id,
          accessToken,
          price: price ?? undefined,
          offerId,
        });

        const status = res.status;
        let resBody: Record<string, unknown> | null = null;
        try {
          const text = await res.text();
          if (text) resBody = JSON.parse(text);
        } catch { /* ignore */ }

        if (status >= 200 && status < 300) {
          adhered++;
          results.push({ item_id: candidate.item_id, promotion_id: promo.promotion_id, success: true });

          // Update item status
          await supabase
            .from('promotion_items_snapshots')
            .update({ item_status: 'started', updated_at: new Date().toISOString() })
            .eq('workspace_id', workspaceId)
            .eq('promotion_id', promo.promotion_id)
            .eq('item_id', candidate.item_id);
        } else {
          failed++;
          const errMsg = (resBody?.message || resBody?.error || `HTTP ${status}`) as string;
          results.push({ item_id: candidate.item_id, promotion_id: promo.promotion_id, success: false, error: errMsg });
        }
      } catch (err) {
        failed++;
        results.push({ item_id: candidate.item_id, promotion_id: promo.promotion_id, success: false, error: String(err) });
      }
    }

    log('Adhesion complete', { adhered, failed });

    // Save log
    const promotionsAffected = new Set(approved.map(a => a.promo.promotion_id)).size;
    await insertLog(supabase, workspaceId, sellerId, runId, triggeredBy, promotionsAffected, adhered, failed, skipped.length, {
      results,
      skipped,
      duration_ms: Date.now() - startTime,
    });

    // Create notification if items were adhered
    if (adhered > 0) {
      const campaignSummary = [...new Set(approved.filter((_, i) => results[i]?.success).map(a => a.promo.promotion_name || a.promo.promotion_id))];
      // target_seller_id MUST be set — this is a per-seller notification, never global
      const targetSellerId = sellerId; // ml_user_id string e.g. "66043362"
      if (!targetSellerId) {
        log('ERROR: sellerId is empty, skipping announcement to prevent global leak');
      } else {
        try {
          const { error: annErr } = await supabase.from('mktpfacil_announcements').insert({
            title: `🤖 Agente aderiu automaticamente a ${adhered} produto${adhered !== 1 ? 's' : ''}`,
            content: `Campanhas: ${campaignSummary.slice(0, 5).join(', ')}${campaignSummary.length > 5 ? ` e mais ${campaignSummary.length - 5}` : ''}\nTotal aderidos: ${adhered} | Falhas: ${failed} | Ignorados: ${skipped.length}`,
            priority: 1,
            is_active: true,
            plan_target: 'all',
            target_seller_id: targetSellerId,
            published_at: new Date().toISOString(),
          });
          if (annErr) {
            log('Failed to create notification: ' + JSON.stringify(annErr));
          } else {
            log(`Notification created for seller ${targetSellerId}`);
          }
        } catch (err) {
          log('Failed to create notification', String(err));
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      data: { items_adhered: adhered, items_failed: failed, items_skipped: skipped.length, promotions_affected: promotionsAffected },
    }), { headers: corsHeaders });

  } catch (error) {
    console.error('[promotion-agent-run] Unhandled error:', error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: corsHeaders });
  }
});

async function insertLog(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  sellerId: string,
  runId: string,
  triggeredBy: string,
  promotionsAffected: number,
  itemsAdhered: number,
  itemsFailed: number,
  itemsSkipped: number,
  details: Record<string, unknown>,
) {
  const { error } = await supabase.from('promotion_agent_logs').insert({
    workspace_id: workspaceId,
    seller_id: sellerId,
    run_id: runId,
    triggered_by: triggeredBy,
    promotions_affected: promotionsAffected,
    items_adhered: itemsAdhered,
    items_failed: itemsFailed,
    items_skipped: itemsSkipped,
    details,
  });
  if (error) console.error('[promotion-agent-run] Failed to insert log:', error);
}

// Reuse same ML API call logic from promotions-action
interface MeliApiParams {
  action: 'adhere';
  promotionType: string;
  promotionId: string;
  itemId: string;
  sellerId: string;
  accessToken: string;
  price?: number;
  offerId?: string;
}

async function callMeliApi(params: MeliApiParams): Promise<Response> {
  const { promotionType, promotionId, itemId, sellerId, accessToken, price, offerId } = params;
  const baseUrl = 'https://api.mercadolibre.com/seller-promotions';

  if (promotionType === 'SMART' || promotionType === 'PRICE_MATCHING') {
    const url = `${baseUrl}/items/${itemId}?app_version=v2`;
    const body: Record<string, unknown> = { promotion_id: promotionId, promotion_type: promotionType };
    if (offerId) body.offer_id = offerId;
    if (price) body.price = price;
    return fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // DEAL and other types
  const url = `${baseUrl}/items/${itemId}?user_id=${sellerId}&app_version=v2`;
  const body: Record<string, unknown> = { promotion_id: promotionId, promotion_type: promotionType };
  if (price) body.deal_price = price;
  return fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
}
