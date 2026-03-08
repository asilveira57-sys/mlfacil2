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
  'parent_item_id',
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

function withFallbackFamilyName(payload: Record<string, unknown>): Record<string, unknown> {
  const fn = payload.family_name as string | undefined;
  if (!fn || (typeof fn === 'string' && !fn.trim())) {
    const title = payload.title as string | undefined;
    if (title && title.trim()) {
      payload.family_name = title.trim().substring(0, 120);
    }
  }
  return payload;
}

function normalizeTitleForMl(title: string): string {
  // Remove accents (NFD decompose + strip combining marks)
  let t = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Remove special characters not accepted by ML
  // Keep: letters, digits, spaces, and basic punctuation: , . - / ( ) & + ! : # % @ ' "
  t = t.replace(/[^a-zA-Z0-9 ,.\-\/()&+!:#%@'"]/g, '');
  // Collapse multiple spaces and trim
  t = t.trim().replace(/\s{2,}/g, ' ');
  // Limit to 60 chars, avoid cutting mid-word
  if (t.length > 60) {
    t = t.substring(0, 60);
    const lastSpace = t.lastIndexOf(' ');
    if (lastSpace > 40) t = t.substring(0, lastSpace);
  }
  return t.trim();
}

function buildFallbackTitle(payload: Record<string, unknown>): string {
  // Try family_name first
  const fn = payload.family_name as string | undefined;
  if (fn && typeof fn === 'string' && fn.trim()) {
    const normalized = normalizeTitleForMl(fn.trim());
    if (normalized) return normalized;
  }
  // Fallback to "Produto <category_id>"
  const catId = payload.category_id as string | undefined;
  if (catId && typeof catId === 'string' && catId.trim()) {
    return `Produto ${catId.trim()}`.substring(0, 60);
  }
  // Final fallback
  return 'Produto Mercado Livre';
}

function sanitizePayloadTitle(payload: Record<string, unknown>): Record<string, unknown> {
  const title = payload.title as string | undefined;
  if (!title || typeof title !== 'string' || !title.trim()) {
    // No title at all — use fallback
    payload.title = buildFallbackTitle(payload);
    return payload;
  }
  const sanitized = normalizeTitleForMl(title);
  if (sanitized) {
    payload.title = sanitized;
  } else {
    // Normalization emptied the title — use fallback
    payload.title = buildFallbackTitle(payload);
  }
  return payload;
}

function hasTitleInvalidFieldError(errorBody: Record<string, unknown>): boolean {
  const msg = String(errorBody?.message || '').toLowerCase();
  const err = String(errorBody?.error || '').toLowerCase();
  const combined = msg + ' ' + err;
  if (!combined.includes('invalid_fields') && !combined.includes('invalid')) return false;
  if (combined.includes('title')) return true;
  const causes = (errorBody?.cause as any[]) || [];
  for (const c of causes) {
    const refs = JSON.stringify(c?.references || c?.code || c?.message || '').toLowerCase();
    if (refs.includes('title')) return true;
  }
  return false;
}

async function createMlItemWithRetry(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<{ response: Response; data: any; usedTitleFallback: boolean }> {
  // Pre-sanitize title before first attempt
  const originalTitle = payload.title as string | undefined;
  sanitizePayloadTitle(payload);
  const preSanitized = payload.title !== originalTitle;

  const res1 = await fetchWithRetry('https://api.mercadolibre.com/items', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data1 = await res1.json();

  if (!res1.ok && hasTitleInvalidFieldError(data1)) {
    // Retry with fallback title
    const fallbackTitle = buildFallbackTitle(payload);
    if (fallbackTitle && fallbackTitle !== payload.title) {
      const retryPayload = { ...payload, title: fallbackTitle };
      const res2 = await fetchWithRetry('https://api.mercadolibre.com/items', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(retryPayload),
      });
      const data2 = await res2.json();
      return { response: res2, data: data2, usedTitleFallback: true };
    }
  }

  return { response: res1, data: data1, usedTitleFallback: preSanitized };
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

const CLONE_RUNTIME_VERSION = Deno.env.get('MKTPS_CLONE_RUNTIME_VERSION') || '2025-07-04-fallback-v2';

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
// MLB Extraction from raw input (URLs, catalog links, etc.)
// ============================================

/**
 * Extracts a real MLB item ID from various URL formats:
 * - Direct: MLB1234567890
 * - URL path: /MLB-1234567890-...
 * - pdp_filters: item_id:MLB1234567890 or item_id%3AMLB1234567890
 * - Query param: item_id=MLB1234567890
 * - Encoded content
 */
function extractMLBFromInput(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // Normalize: add protocol if missing
  let input = raw.trim();
  if (input.startsWith('www.')) input = 'https://' + input;

  // Try decoding first (handles %3A etc)
  let decoded = input;
  try { decoded = decodeURIComponent(input); } catch (_) {}

  // Pattern 1: pdp_filters=item_id:MLBnnn or item_id%3AMLBnnn
  const pdpMatch = decoded.match(/item_id[:%3A]+(MLB\d{8,})/i);
  if (pdpMatch) return pdpMatch[1].toUpperCase();

  // Pattern 2: query param ?item_id=MLBnnn
  const paramMatch = decoded.match(/[?&]item_id=(MLB\d{8,})/i);
  if (paramMatch) return paramMatch[1].toUpperCase();

  // Pattern 3: URL path /MLB-1234567890 or /MLB1234567890
  const pathMatch = decoded.match(/\/(MLB)-?(\d{8,})/i);
  if (pathMatch) return `MLB${pathMatch[2]}`;

  // Pattern 4: standalone MLB ID anywhere in string (word boundary)
  const standaloneMatch = decoded.match(/\b(MLB\d{8,})\b/i);
  if (standaloneMatch) return standaloneMatch[1].toUpperCase();

  return null;
}

// ============================================
// ML Public API helper (with optional auth token)
// ============================================

async function mlRequest(
  endpoint: string,
  supabase: any,
  userId: string,
  correlationId: string,
  label: string,
  accessToken?: string,
): Promise<{ ok: boolean; status: number; data: any; usedToken: boolean }> {
  const url = `https://api.mercadolibre.com${endpoint}`;
  const start = Date.now();
  const usedToken = !!accessToken;

  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  await logEvent(supabase, userId, 'source', label, 'ml_request_prepare', 'info',
    `Preparing ${usedToken ? 'authenticated' : 'public'} fetch: ${endpoint}`, { correlation_id: correlationId, endpoint: url, used_token: usedToken });

  let response: Response;
  try {
    response = await fetchWithRetry(url, { method: 'GET', headers });
  } catch (err) {
    const elapsed = Date.now() - start;
    await logEvent(supabase, userId, 'source', label, 'ml_request_result', 'error',
      `Fetch failed: ${(err as Error).message} in ${elapsed}ms`, { correlation_id: correlationId, endpoint: url, elapsed_ms: elapsed, error: (err as Error).message, used_token: usedToken });
    throw err;
  }

  const body = await response.text();
  const elapsed = Date.now() - start;

  await logEvent(supabase, userId, 'source', label, 'ml_request_result',
    response.ok ? 'info' : 'error',
    `Fetch ${label}: HTTP ${response.status} in ${elapsed}ms`, {
      correlation_id: correlationId, endpoint: url, used_token: usedToken,
      http_status: response.status, elapsed_ms: elapsed,
      response_body_snippet: body.substring(0, 2000),
    });

  let data: any = null;
  try { data = JSON.parse(body); } catch (_) { data = body; }

  return { ok: response.ok, status: response.status, data, usedToken };
}

// ============================================
// Authenticated fallback: try user's ML tokens on 403
// Prioritizes preferredSellerId if provided.
// ============================================

async function getValidTokenForRead(
  supabase: any,
  userId: string,
  correlationId: string,
  preferredSellerId?: string | null,
): Promise<string | null> {
  // Fetch all active ML accounts for this user
  const { data: accounts, error } = await supabase
    .from('ml_accounts')
    .select('id, ml_user_id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error || !accounts || accounts.length === 0) {
    await logEvent(supabase, userId, 'source', 'auth_fallback', 'no_ml_accounts', 'warn',
      'No active ML accounts found for authenticated fallback', { correlation_id: correlationId, preferred_seller_id: preferredSellerId });
    return null;
  }

  // Sort: preferred seller first
  const sorted = preferredSellerId
    ? [...accounts].sort((a: any, b: any) => {
        const aMatch = String(a.ml_user_id) === String(preferredSellerId) ? 0 : 1;
        const bMatch = String(b.ml_user_id) === String(preferredSellerId) ? 0 : 1;
        return aMatch - bMatch;
      })
    : accounts;

  await logEvent(supabase, userId, 'source', 'auth_fallback', 'token_selection_order', 'info',
    `Will try ${sorted.length} accounts, preferred=${preferredSellerId || 'none'}`, {
      correlation_id: correlationId,
      preferred_seller_id: preferredSellerId,
      account_order: sorted.map((a: any) => a.ml_user_id),
    });

  if (error || !accounts || accounts.length === 0) {
    await logEvent(supabase, userId, 'source', 'auth_fallback', 'no_ml_accounts', 'warn',
      'No active ML accounts found for authenticated fallback', { correlation_id: correlationId });
    return null;
  }

  for (const account of sorted) {
    let token = account.access_token;

    // Check if token is expired and try refresh
    if (new Date(account.token_expires_at) < new Date()) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const svcClient = createClient(supabaseUrl, serviceKey);

        const refreshRes = await svcClient.functions.invoke('ml-token-refresh', {
          body: { account_id: account.id },
        });
        if (refreshRes.data?.access_token) {
          token = refreshRes.data.access_token;
          await logEvent(supabase, userId, 'source', 'auth_fallback', 'token_refreshed', 'info',
            `Token refreshed for account ${account.ml_user_id}`, { correlation_id: correlationId, account_id: account.id });
        } else {
          await logEvent(supabase, userId, 'source', 'auth_fallback', 'token_refresh_failed', 'warn',
            `Token refresh failed for ${account.ml_user_id}, skipping`, { correlation_id: correlationId, account_id: account.id });
          continue;
        }
      } catch (err) {
        await logEvent(supabase, userId, 'source', 'auth_fallback', 'token_refresh_error', 'warn',
          `Refresh error for ${account.ml_user_id}: ${(err as Error).message}`, { correlation_id: correlationId, account_id: account.id });
        continue;
      }
    }

    // Quick validation: try a lightweight call
    try {
      const testRes = await fetch(`https://api.mercadolibre.com/users/me`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      const testBody = await testRes.text();
      if (testRes.ok) {
        await logEvent(supabase, userId, 'source', 'auth_fallback', 'token_valid', 'info',
          `Valid token found for ${account.ml_user_id}`, { correlation_id: correlationId, account_id: account.id });
        return token;
      }
      // 401/403 means this token is bad
      await logEvent(supabase, userId, 'source', 'auth_fallback', 'token_invalid', 'warn',
        `Token for ${account.ml_user_id} returned ${testRes.status}`, { correlation_id: correlationId, account_id: account.id, status: testRes.status });
    } catch (_) {
      // Network error, try next
    }
  }

  return null;
}

// ============================================
// ACTION: Load source — ISOLATED public fetch (NO token, NO global client)
// ============================================

async function loadSource(itemId: string, supabase: any, userId: string, correlationId: string, sourceInputRaw?: string, preferredSellerId?: string | null) {
  const totalStart = Date.now();

  // === STEP 0: Validate/normalize item ID ===
  let effectiveItemId = itemId;

  // If the item_id looks like MLBU or catalog, try to extract MLB from raw input immediately
  if (effectiveItemId && !effectiveItemId.toUpperCase().startsWith('MLB')) {
    const extracted = extractMLBFromInput(sourceInputRaw);
    if (extracted) {
      await logEvent(supabase, userId, 'source', effectiveItemId, 'source_item_id_recovered', 'info',
        `Replaced non-MLB ID "${effectiveItemId}" with extracted "${extracted}" from raw input`, {
          correlation_id: correlationId, original_id: effectiveItemId, recovered_id: extracted, source_input_raw: sourceInputRaw?.substring(0, 500),
        });
      effectiveItemId = extracted;
    }
  }

  // === STEP 1: Diagnostic — site + item check ===
  let siteStatus = 0;
  let siteSnippet = '';
  let itemStatus = 0;
  let itemSnippet = '';

  try {
    const siteRes = await fetch('https://api.mercadolibre.com/sites/MLB', { method: 'GET', headers: { 'Accept': 'application/json' } });
    siteStatus = siteRes.status;
    siteSnippet = (await siteRes.text()).substring(0, 200);
  } catch (e) { siteSnippet = `FETCH_ERROR: ${(e as Error).message}`; }

  try {
    const itemRes = await fetch(`https://api.mercadolibre.com/items/${effectiveItemId}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
    itemStatus = itemRes.status;
    itemSnippet = (await itemRes.text()).substring(0, 400);
  } catch (e) { itemSnippet = `FETCH_ERROR: ${(e as Error).message}`; }

  const elapsedDiag = Date.now() - totalStart;

  await logEvent(supabase, userId, 'source', effectiveItemId, 'load_source_diag', 'info',
    `Diag: site=${siteStatus} item=${itemStatus} elapsed=${elapsedDiag}ms`, {
      correlation_id: correlationId, item_id: effectiveItemId, original_item_id: itemId,
      source_input_raw: sourceInputRaw?.substring(0, 500),
      site_status: siteStatus, site_snippet: siteSnippet,
      item_status: itemStatus, item_snippet: itemSnippet,
      used_token: false, elapsed_ms_total: elapsedDiag,
    });

  // === STEP 1.5: If item fetch failed, try MLB recovery from raw input ===
  if (itemStatus !== 200 && sourceInputRaw) {
    const recoveredId = extractMLBFromInput(sourceInputRaw);
    if (recoveredId && recoveredId !== effectiveItemId) {
      await logEvent(supabase, userId, 'source', effectiveItemId, 'source_item_id_recovered', 'info',
        `Item ${effectiveItemId} failed (HTTP ${itemStatus}), recovered "${recoveredId}" from raw input`, {
          correlation_id: correlationId, original_id: effectiveItemId, recovered_id: recoveredId,
          source_input_raw: sourceInputRaw.substring(0, 500),
        });

      // Re-check the recovered ID
      const recheckRes = await fetch(`https://api.mercadolibre.com/items/${recoveredId}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (recheckRes.ok) {
        effectiveItemId = recoveredId;
        itemStatus = recheckRes.status;
        itemSnippet = (await recheckRes.text()).substring(0, 400);
      } else {
        // Recovery also failed
        await logEvent(supabase, userId, 'source', recoveredId, 'source_recovery_also_failed', 'warn',
          `Recovered ID ${recoveredId} also failed (HTTP ${recheckRes.status})`, { correlation_id: correlationId });
      }
    }
  }

  // If still failing after recovery, try authenticated fallback for 403
  if (itemStatus === 403) {
     await logEvent(supabase, userId, 'source', effectiveItemId, 'load_source_403_auth_fallback', 'info',
      `Public fetch returned 403 (PolicyAgent), attempting authenticated fallback with preferred=${preferredSellerId || 'none'}`, {
        correlation_id: correlationId, preferred_seller_id: preferredSellerId });

    const authToken = await getValidTokenForRead(supabase, userId, correlationId, preferredSellerId);
    if (authToken) {
      try {
        const authItemRes = await fetch(`https://api.mercadolibre.com/items/${effectiveItemId}`, {
          method: 'GET', headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${authToken}` },
        });
        if (authItemRes.ok) {
          itemStatus = authItemRes.status;
          itemSnippet = (await authItemRes.text()).substring(0, 400);
          await logEvent(supabase, userId, 'source', effectiveItemId, 'load_source_403_auth_success', 'info',
            `Authenticated fallback succeeded for ${effectiveItemId}`, { correlation_id: correlationId });
        } else {
          const authBody = await authItemRes.text();
          await logEvent(supabase, userId, 'source', effectiveItemId, 'load_source_403_auth_failed', 'warn',
            `Authenticated fallback also failed: HTTP ${authItemRes.status}`, { correlation_id: correlationId, status: authItemRes.status, snippet: authBody.substring(0, 300) });
        }
      } catch (authErr) {
        await logEvent(supabase, userId, 'source', effectiveItemId, 'load_source_403_auth_error', 'error',
          `Auth fallback fetch error: ${(authErr as Error).message}`, { correlation_id: correlationId });
      }
    }
  }

  if (itemStatus !== 200) {
    throw new Error(`Falha ao carregar anúncio (HTTP ${itemStatus}). ID tentado: ${effectiveItemId}. Verifique se o link é de um anúncio válido do Mercado Livre.`);
  }

  // Determine if we need an auth token for subsequent requests (attributes, description)
  let readToken: string | undefined;
  // If the diagnostic item fetch needed auth OR returned 403 initially, use auth for all subsequent calls
  const needsAuth = itemSnippet.includes('PolicyAgent') || siteSnippet.includes('PolicyAgent');
  if (needsAuth) {
    const token = await getValidTokenForRead(supabase, userId, correlationId, preferredSellerId);
    if (token) readToken = token;
  }

  // === STEP 2: Full fetch with attributes ===
  const fullResult = await mlRequest(`/items/${effectiveItemId}?include_attributes=all`, supabase, userId, correlationId, effectiveItemId, readToken);
  if (!fullResult.ok) {
    // If 403 on full fetch and no token yet, try auth
    if (fullResult.status === 403 && !readToken) {
      const fallbackToken = await getValidTokenForRead(supabase, userId, correlationId, preferredSellerId);
      if (fallbackToken) {
        const retryResult = await mlRequest(`/items/${effectiveItemId}?include_attributes=all`, supabase, userId, correlationId, effectiveItemId, fallbackToken);
        if (retryResult.ok) {
          readToken = fallbackToken;
          // Continue with retryResult below
          const item = retryResult.data;
          return await buildSnapshot(item, effectiveItemId, supabase, userId, correlationId, readToken);
        }
      }
    }
    throw new Error(`Falha ao carregar detalhes (HTTP ${fullResult.status})`);
  }
  const item = fullResult.data;

  return await buildSnapshot(item, effectiveItemId, supabase, userId, correlationId, readToken);
}

// Build snapshot from item data
async function buildSnapshot(item: any, effectiveItemId: string, supabase: any, userId: string, correlationId: string, readToken?: string) {
  // Fetch description (best-effort)
  let description = '';
  try {
    const descResult = await mlRequest(`/items/${effectiveItemId}/description`, supabase, userId, correlationId, `${effectiveItemId}/desc`, readToken);
    if (descResult.ok) {
      description = descResult.data.plain_text || descResult.data.text || '';
    }
  } catch (_) {}

  // Fetch category name (best-effort)
  let categoryName = '';
  try {
    if (item.category_id) {
      const catResult = await mlRequest(`/categories/${item.category_id}`, supabase, userId, correlationId, item.category_id);
      if (catResult.ok) categoryName = catResult.data.name || '';
    }
  } catch (_) {}

  // Build snapshot
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
      id: a.id, name: a.name, value_id: a.value_id, value_name: a.value_name,
    })),
    variations: (item.variations || []).map((v: any) => ({
      id: v.id,
      attribute_combinations: (v.attribute_combinations || []).map((ac: any) => ({
        id: ac.id, name: ac.name, value_id: ac.value_id, value_name: ac.value_name,
      })),
      available_quantity: v.available_quantity || 0,
      price: v.price || item.price || 0,
      picture_ids: v.picture_ids || [],
    })),
    seller_id: String(item.seller_id || ''),
    thumbnail: item.thumbnail || item.secure_thumbnail || '',
    catalog_product_id: item.catalog_product_id || null,
    catalog_listing: item.catalog_listing || false,
    family_name: item.family_name || null,
  };

  const logResults = { load_source_diag: true };
  return { snapshot, logResults };
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
        family_name: snapshot.family_name || undefined,
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

    // Add family_name if present
    if (unitSnap.family_name) {
      postBody.family_name = unitSnap.family_name;
    }

    // Fallback: family_name from title if missing
    withFallbackFamilyName(postBody);

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

      const { response: createRes, data: createData, usedTitleFallback } = await createMlItemWithRetry(accessToken, postBody);

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
          used_title_fallback: usedTitleFallback,
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
        used_title_fallback: usedTitleFallback,
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
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return respond({ error: 'Token inválido' }, 401);
    }
    const userId = user.id as string;

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

        return respond({ snapshot, correlation_id: corrId, runtime_version: CLONE_RUNTIME_VERSION, log_insert_results: logResults });
      } catch (loadErr) {
        const errMsg = (loadErr as Error).message;
        await auditLog(supabase, { level: 'error', area: 'clone_anuncio', action: 'load_source_error', userId, success: false, message: errMsg, meta: { item_id, correlation_id: corrId } });
        await logEvent(supabase, userId, 'source', item_id, 'source_load_error', 'error', errMsg, { correlation_id: corrId });
        return respond({ error: errMsg, correlation_id: corrId, runtime_version: CLONE_RUNTIME_VERSION }, 200);
      }
    }

    if (action === 'clone') {
      const result = await processClone(supabase, userId, body);
      return respond(result);
    }

    if (action === 'publish_item') {
      const { destination_account_id, payload, correlation_id: corrId, source_item_id, draft_id } = body;
      if (!destination_account_id || !payload) return respond({ error: 'destination_account_id e payload são obrigatórios' }, 400);

      await logEvent(supabase, userId, 'publish', source_item_id || 'unknown', 'publish_item_attempt', 'info', 'Publicação direta iniciada', { correlation_id: corrId });

      // Get token
      const { data: account, error: accErr } = await supabase
        .from('ml_accounts')
        .select('id, ml_user_id, access_token, refresh_token, token_expires_at')
        .eq('id', destination_account_id)
        .single();

      if (accErr || !account) {
        return respond({ error: 'Conta destino não encontrada', status: 'error', correlation_id: corrId });
      }

      let accessToken = account.access_token;
      if (new Date(account.token_expires_at) < new Date()) {
        try {
          const refreshRes = await supabase.functions.invoke('ml-token-refresh', { body: { account_id: account.id } });
          if (refreshRes.data?.access_token) accessToken = refreshRes.data.access_token;
          else throw new Error('Refresh falhou');
        } catch (err) {
          return respond({ error: `Token expirado: ${(err as Error).message}`, status: 'error', correlation_id: corrId });
        }
      }

      // Fallback family_name from title + remove forbidden fields
      const cleanPayload = withFallbackFamilyName({ ...payload });
      for (const field of FORBIDDEN_BODY_FIELDS) {
        delete cleanPayload[field];
      }

      // POST to ML with title retry
      try {
        const { response: createRes, data: createData, usedTitleFallback } = await createMlItemWithRetry(accessToken, cleanPayload);

        if (!createRes.ok) {
          await logEvent(supabase, userId, 'publish', source_item_id || 'unknown', 'publish_item_error', 'error',
            `POST /items falhou: HTTP ${createRes.status}`, { correlation_id: corrId, http_status: createRes.status, error_body: createData, used_title_fallback: usedTitleFallback });

          return respond({
            status: 'error',
            error: createData?.message || createData?.error || 'Erro na publicação',
            error_body: createData,
            http_status: createRes.status,
            correlation_id: corrId,
          });
        }

        // Success - set description if available
        const newItemId = createData.id;
        if (cleanPayload.description?.plain_text) {
          try {
            await fetchWithRetry(`https://api.mercadolibre.com/items/${newItemId}/description`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ plain_text: cleanPayload.description.plain_text }),
            });
          } catch (_) { /* description is optional */ }
        }

        await logEvent(supabase, userId, 'publish', newItemId, 'publish_item_success', 'info',
          `Item publicado: ${newItemId}`, { correlation_id: corrId, item_id: newItemId, permalink: createData.permalink, used_title_fallback: usedTitleFallback });

        return respond({
          status: 'success',
          item_id: newItemId,
          id: newItemId,
          permalink: createData.permalink,
          correlation_id: corrId,
        });

      } catch (publishErr) {
        const errMsg = (publishErr as Error).message;
        await logEvent(supabase, userId, 'publish', source_item_id || 'unknown', 'publish_item_network_error', 'error', errMsg, { correlation_id: corrId });
        return respond({ error: errMsg, status: 'error', correlation_id: corrId });
      }
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
