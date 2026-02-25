import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { auditLog } from '../_shared/audit-log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// ANTI-CATALOG: Fields/attributes that MUST be removed
// ============================================
const FORBIDDEN_BODY_FIELDS = new Set([
  'catalog_listing', 'catalog_product_id', 'product_id',
  'parent_item_id', 'family_name',
]);

const FORBIDDEN_ATTRIBUTES = new Set([
  'GTIN', 'EAN', 'UPC', 'ISBN', 'MPN', 'PART_NUMBER',
  'ALPHANUMERIC_MODEL', 'MANUFACTURER_CODE', 'SKU', 'SELLER_SKU',
]);

const DUPLICATE_ATTRIBUTES = new Set([
  'ITEM_CONDITION', 'PACKAGE_HEIGHT', 'PACKAGE_WIDTH', 'PACKAGE_LENGTH', 'PACKAGE_WEIGHT',
]);

function isAttributeSafe(attrId: string): boolean {
  const id = (attrId || '').toUpperCase();
  return !FORBIDDEN_ATTRIBUTES.has(id) && !DUPLICATE_ATTRIBUTES.has(id);
}

// ============================================
// Helpers
// ============================================
async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429) {
        const wait = Math.min(2000 * Math.pow(2, i), 30000);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err as Error;
      const wait = 1000 * Math.pow(2, i);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastError || new Error('Max retries reached');
}

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function logEvent(
  supabase: any,
  userId: string,
  entityType: string,
  entityId: string | null,
  eventName: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  context: Record<string, unknown> = {}
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('mktpfacil_system_logs').insert({
      user_id: userId,
      module: 'anuncios_clonar',
      entity_type: entityType,
      entity_id: entityId,
      level,
      event_name: eventName,
      message,
      context_json: context,
    });
    if (error) {
      console.error('LOG_INSERT_FAILED', { eventName, error: error.message, correlation_id: context.correlation_id });
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.error('LOG_INSERT_FAILED', { eventName, err: msg, correlation_id: context.correlation_id });
    return { ok: false, error: msg };
  }
}

// ============================================
// ACTION: Load source — ISOLATED public fetch (NO token, NO global client)
// ============================================

/**
 * Fetch puro e isolado — NÃO usa mlClient, NÃO usa axios, NÃO usa supabase.functions.invoke.
 * Apenas fetch nativo do Deno, sem nenhum header de autorização.
 */
async function mlPublicFetchItem(itemId: string, supabase: any, userId: string, correlationId: string): Promise<any> {
  const url = `https://api.mercadolibre.com/items/${itemId}?include_attributes=all`;

  // (B) log antes do fetch
  await logEvent(supabase, userId, 'source', itemId, 'ml_request_prepare', 'info',
    `Preparing public fetch for ${itemId}`, {
      correlation_id: correlationId,
      endpoint: url,
      used_token: false,
    });

  const start = Date.now();

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  const body = await response.text();
  const elapsed = Date.now() - start;

  // (C) log depois do fetch
  await logEvent(supabase, userId, 'source', itemId, 'ml_request_result',
    response.ok ? 'info' : 'error',
    `Public fetch ${itemId}: HTTP ${response.status} in ${elapsed}ms`, {
      correlation_id: correlationId,
      endpoint: url,
      used_token: false,
      http_status: response.status,
      elapsed_ms: elapsed,
      response_body_snippet: body.substring(0, 2000),
    });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Anúncio ${itemId} não encontrado. Verifique se o ID está correto. IDs do tipo MLBU (catálogo) não são suportados — use o link completo do anúncio para que o MLB seja extraído automaticamente.`);
    }
    if (response.status === 403) {
      throw new Error(`Anúncio ${itemId} está bloqueado por políticas do Mercado Livre (HTTP 403 via fetch público sem token). Isso pode ser bloqueio por IP do servidor.`);
    }
    throw new Error(`Falha ao buscar item ${itemId} (HTTP ${response.status}). Tente novamente em alguns instantes.`);
  }

  return JSON.parse(body);
}

async function loadSource(itemId: string, supabase: any, userId: string, correlationId: string, sourceInputRaw?: string) {
  let outcome = 'error';
  const logResults: Record<string, boolean> = {};

  try {
    // (A) log de entrada
    const enterLog = await logEvent(supabase, userId, 'source', itemId, 'load_source_enter', 'info',
      `load_source started for ${itemId}`, {
        correlation_id: correlationId,
        item_id: itemId,
        source_input_raw: sourceInputRaw || itemId,
      });
    logResults.load_source_enter = enterLog.ok;

    // 1. Fetch item via fetch público isolado
    const item = await mlPublicFetchItem(itemId, supabase, userId, correlationId);

    // 2. Fetch description (public)
    let description = '';
    try {
      const descRes = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (descRes.ok) {
        const descData = await descRes.json();
        description = descData.plain_text || descData.text || '';
      }
    } catch (_) {}

    // 3. Fetch category name
    let categoryName = '';
    try {
      if (item.category_id) {
        const catRes = await fetch(`https://api.mercadolibre.com/categories/${item.category_id}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        if (catRes.ok) {
          const catData = await catRes.json();
          categoryName = catData.name || '';
        }
      }
    } catch (_) {}

    // 4. Build snapshot
    const snapshot = {
      item_id: item.id,
      title: item.title || '',
      description,
      price: item.price || 0,
      currency_id: item.currency_id || 'BRL',
      available_quantity: item.available_quantity || 0,
      condition: item.condition || 'new',
      category_id: item.category_id || '',
      category_name: categoryName,
      listing_type_id: item.listing_type_id || 'gold_special',
      pictures: (item.pictures || []).map((p: any) => ({
        id: p.id,
        url: p.url || p.secure_url,
        secure_url: p.secure_url || p.url,
      })),
      attributes: (item.attributes || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        value_id: a.value_id,
        value_name: a.value_name,
      })),
      variations: (item.variations || []).map((v: any) => ({
        id: v.id,
        attribute_combinations: (v.attribute_combinations || []).map((ac: any) => ({
          id: ac.id,
          name: ac.name,
          value_id: ac.value_id,
          value_name: ac.value_name,
        })),
        available_quantity: v.available_quantity || 0,
        price: v.price || item.price || 0,
        picture_ids: v.picture_ids || [],
      })),
      seller_id: String(item.seller_id || ''),
      thumbnail: item.thumbnail || item.secure_thumbnail || '',
      catalog_product_id: item.catalog_product_id || null,
      catalog_listing: item.catalog_listing || false,
    };

    outcome = 'success';
    return { snapshot, logResults };
  } finally {
    // (D) log no finally (sempre executa)
    const finallyLog = await logEvent(supabase, userId, 'source', itemId, 'load_source_finally', 'info',
      `load_source finished: ${outcome}`, {
        correlation_id: correlationId,
        outcome,
        log_insert_results: logResults,
      });
    logResults.load_source_finally = finallyLog.ok;
  }
}

// ============================================
// ACTION: Clone (create job + process units)
// ============================================
async function processClone(
  supabase: any,
  userId: string,
  body: Record<string, unknown>
) {
  const {
    item_id,
    source_url,
    destination_account_id,
    settings,
    source_snapshot,
  } = body as any;

  // 1. Get destination account tokens
  const { data: account, error: accErr } = await supabase
    .from('ml_accounts')
    .select('id, ml_user_id, access_token, refresh_token, token_expires_at')
    .eq('id', destination_account_id)
    .single();

  if (accErr || !account) {
    throw new Error('Conta destino não encontrada ou sem permissão');
  }

  // Check token expiry, try refresh if needed
  let accessToken = account.access_token;
  if (new Date(account.token_expires_at) < new Date()) {
    // Try token refresh
    try {
      const refreshRes = await supabase.functions.invoke('ml-token-refresh', {
        body: { account_id: account.id },
      });
      if (refreshRes.data?.access_token) {
        accessToken = refreshRes.data.access_token;
      } else {
        throw new Error('Token expirado e refresh falhou. Reconecte a conta.');
      }
    } catch (err) {
      throw new Error(`Token expirado: ${(err as Error).message}`);
    }
  }

  // 2. Create job
  const { data: job, error: jobErr } = await supabase
    .from('mktpfacil_clone_jobs')
    .insert({
      user_id: userId,
      destination_account_id,
      source_url: source_url || '',
      source_item_id: item_id,
      status: 'running',
      settings_json: settings || {},
      source_snapshot_json: source_snapshot || {},
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (jobErr) throw new Error(`Erro ao criar job: ${jobErr.message}`);

  await logEvent(supabase, userId, 'job', job.id, 'job_created', 'info', `Job criado para ${item_id}`);

  // 3. Generate units (one per variation, or 1 if no variations)
  const snapshot = source_snapshot;
  const variations = snapshot?.variations || [];
  const units: any[] = [];

  if (variations.length === 0) {
    // Single unit (no variations)
    units.push({
      job_id: job.id,
      unit_index: 0,
      source_variation_id: null,
      unit_snapshot_json: {
        title: snapshot.title,
        price: applyPriceSettings(snapshot.price, settings),
        available_quantity: settings?.stock_value || 1,
        condition: snapshot.condition || 'new',
        category_id: snapshot.category_id,
        listing_type_id: resolveListingType(snapshot.listing_type_id, settings),
        description: settings?.description_mode === 'blank' ? '' : (snapshot.description || ''),
        pictures: snapshot.pictures || [],
        attributes: (snapshot.attributes || []).filter((a: any) => isAttributeSafe(a.id)),
        currency_id: snapshot.currency_id || 'BRL',
      },
      status: 'queued',
    });
  } else {
    // One unit per variation
    variations.forEach((v: any, i: number) => {
      const variationPictures = v.picture_ids?.length
        ? (snapshot.pictures || []).filter((p: any) => v.picture_ids.includes(p.id))
        : snapshot.pictures || [];

      units.push({
        job_id: job.id,
        unit_index: i,
        source_variation_id: String(v.id),
        unit_snapshot_json: {
          title: snapshot.title,
          price: applyPriceSettings(v.price || snapshot.price, settings),
          available_quantity: settings?.stock_value || v.available_quantity || 1,
          condition: snapshot.condition || 'new',
          category_id: snapshot.category_id,
          listing_type_id: resolveListingType(snapshot.listing_type_id, settings),
          description: settings?.description_mode === 'blank' ? '' : (snapshot.description || ''),
          pictures: variationPictures,
          attributes: [
            ...(snapshot.attributes || []).filter((a: any) => isAttributeSafe(a.id)),
          ],
          attribute_combinations: (v.attribute_combinations || []).filter((a: any) => isAttributeSafe(a.id)),
          currency_id: snapshot.currency_id || 'BRL',
        },
        status: 'queued',
      });
    });
  }

  // Insert units
  const { error: unitsErr } = await supabase
    .from('mktpfacil_clone_job_units')
    .insert(units);

  if (unitsErr) {
    await logEvent(supabase, userId, 'job', job.id, 'units_insert_error', 'error', unitsErr.message);
    throw new Error(`Erro ao criar unidades: ${unitsErr.message}`);
  }

  await logEvent(supabase, userId, 'job', job.id, 'units_generated', 'info', `${units.length} unidades geradas`);

  // 4. Process each unit
  let createdCount = 0;
  let failedCount = 0;

  for (const unit of units) {
    const unitSnap = unit.unit_snapshot_json;

    // Build POST body for ML API
    const postBody: Record<string, unknown> = {
      title: unitSnap.title,
      category_id: unitSnap.category_id,
      price: unitSnap.price,
      currency_id: unitSnap.currency_id || 'BRL',
      available_quantity: unitSnap.available_quantity,
      buying_mode: 'buy_it_now',
      condition: unitSnap.condition,
      listing_type_id: unitSnap.listing_type_id,
      pictures: (unitSnap.pictures || []).map((p: any) => ({ source: p.secure_url || p.url })),
      attributes: (unitSnap.attributes || []).map((a: any) => {
        const attr: Record<string, unknown> = { id: a.id };
        if (a.value_id) attr.value_id = a.value_id;
        if (a.value_name) attr.value_name = a.value_name;
        return attr;
      }),
    };

    // Add description if available
    if (unitSnap.description) {
      // Description is sent separately after item creation
    }

    // Remove forbidden fields (anti-catalog)
    for (const field of FORBIDDEN_BODY_FIELDS) {
      delete postBody[field];
    }

    // Mark unit as running
    await supabase
      .from('mktpfacil_clone_job_units')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('job_id', job.id)
      .eq('unit_index', unit.unit_index);

    try {
      await logEvent(supabase, userId, 'unit', `${job.id}:${unit.unit_index}`, 'publish_attempt', 'info', `Publicando unidade ${unit.unit_index}`);

      const createRes = await fetchWithRetry(
        `https://api.mercadolibre.com/items`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(postBody),
        }
      );

      const createData = await createRes.json();

      if (!createRes.ok) {
        const errorMsg = createData?.message || createData?.error || JSON.stringify(createData?.cause || createData);
        const errorCode = createData?.error || `HTTP_${createRes.status}`;

        // Check if domain requires catalog
        const isCatalogForced = errorMsg.includes('catalog') || errorMsg.includes('catálogo');

        await supabase
          .from('mktpfacil_clone_job_units')
          .update({
            status: 'failed',
            error_code: errorCode,
            error_message: isCatalogForced
              ? `Domínio exige catálogo; clonagem como anúncio comum indisponível. Detalhe: ${errorMsg}`
              : errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('job_id', job.id)
          .eq('unit_index', unit.unit_index);

        await logEvent(supabase, userId, 'unit', `${job.id}:${unit.unit_index}`, 'publish_failed', 'error', errorMsg, {
          status: createRes.status,
          error_code: errorCode,
        });

        failedCount++;
        continue;
      }

      // Success!
      const newItemId = createData.id;
      const permalink = createData.permalink || '';

      // Send description separately
      if (unitSnap.description) {
        try {
          await fetchWithRetry(
            `https://api.mercadolibre.com/items/${newItemId}/description`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ plain_text: unitSnap.description }),
            }
          );
        } catch (descErr) {
          await logEvent(supabase, userId, 'unit', `${job.id}:${unit.unit_index}`, 'description_failed', 'warn', (descErr as Error).message);
        }
      }

      await supabase
        .from('mktpfacil_clone_job_units')
        .update({
          status: 'created',
          destination_item_id: newItemId,
          destination_permalink: permalink,
          updated_at: new Date().toISOString(),
        })
        .eq('job_id', job.id)
        .eq('unit_index', unit.unit_index);

      await logEvent(supabase, userId, 'unit', `${job.id}:${unit.unit_index}`, 'publish_success', 'info', `Item criado: ${newItemId}`, {
        destination_item_id: newItemId,
        permalink,
      });

      createdCount++;
    } catch (err) {
      const errMsg = (err as Error).message;
      await supabase
        .from('mktpfacil_clone_job_units')
        .update({
          status: 'failed',
          error_code: 'NETWORK_ERROR',
          error_message: errMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('job_id', job.id)
        .eq('unit_index', unit.unit_index);

      await logEvent(supabase, userId, 'unit', `${job.id}:${unit.unit_index}`, 'publish_failed', 'error', errMsg);
      failedCount++;
    }
  }

  // 5. Update job status
  const finalStatus = failedCount === 0 ? 'done' : createdCount === 0 ? 'failed' : 'partial';

  await supabase
    .from('mktpfacil_clone_jobs')
    .update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      summary_json: {
        total_units: units.length,
        created: createdCount,
        failed: failedCount,
      },
    })
    .eq('id', job.id);

  await logEvent(supabase, userId, 'job', job.id, 'job_finished', 'info', `Job finalizado: ${finalStatus}`, {
    total: units.length,
    created: createdCount,
    failed: failedCount,
  });

  return { job_id: job.id, status: finalStatus, created: createdCount, failed: failedCount };
}

function applyPriceSettings(basePrice: number, settings: any): number {
  if (!settings) return basePrice;
  if (settings.price_mode === 'percent') return basePrice * (1 + (settings.price_percent || 0) / 100);
  if (settings.price_mode === 'fixed' && settings.price_fixed > 0) return settings.price_fixed;
  return basePrice;
}

function resolveListingType(sourceType: string, settings: any): string {
  if (!settings || settings.listing_type === 'keep') return sourceType || 'gold_special';
  return settings.listing_type || sourceType || 'gold_special';
}

// ============================================
// Main handler
// ============================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return respond({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return respond({ error: 'Token inválido' }, 401);
    }
    const userId = claimsData.claims.sub as string;

    // Parse body
    const body = await req.json();
    const { action } = body;

    if (action === 'load_source') {
      const { item_id, correlation_id, source_input_raw } = body;
      if (!item_id) return respond({ error: 'item_id é obrigatório' }, 400);
      const corrId = correlation_id || crypto.randomUUID().substring(0, 8);

      try {
        const { snapshot, logResults } = await loadSource(item_id, supabase, userId, corrId, source_input_raw);
        await logEvent(supabase, userId, 'source', item_id, 'source_loaded', 'info', `Item ${item_id} carregado`, {
          correlation_id: corrId,
          pictures_count: snapshot.pictures?.length || 0,
          variations_count: snapshot.variations?.length || 0,
          has_catalog: !!snapshot.catalog_product_id,
        });

        return respond({ snapshot, correlation_id: corrId, log_insert_results: logResults });
      } catch (loadErr) {
        const errMsg = (loadErr as Error).message;
        await auditLog(supabase, { level: 'error', area: 'clone_anuncio', action: 'load_source_error', userId, success: false, message: errMsg, meta: { item_id, correlation_id: corrId } });
        await logEvent(supabase, userId, 'source', item_id, 'source_load_error', 'error', errMsg, { correlation_id: corrId });
        return respond({ error: errMsg, correlation_id: corrId }, 200);
      }
    }

    if (action === 'clone') {
      const result = await processClone(supabase, userId, body);
      return respond(result);
    }

    return respond({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error('[mktpfacil-clone] Error:', err);
    // Try to log to central audit table (best-effort, no supabase client available here in some cases)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const svc = createClient(supabaseUrl, supabaseKey);
      await auditLog(svc, { level: 'error', area: 'clone_anuncio', action: 'clone_unhandled_error', userId: null, success: false, message: errMsg, meta: {} });
    } catch (_) { /* fail-safe */ }
    return respond({ error: errMsg }, 200);
  }
});
