import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SnapshotRequest {
  item_id: string;
  id_type?: 'MLB' | 'MLBU';
  ml_account_id?: string;
  seller_id?: string;
  source_input_raw?: string;
}

interface CaptureLog {
  pictures_count: number;
  pictures_source: 'api_full' | 'api_thumbnail_fallback' | 'none';
  description_captured: boolean;
  description_source?: 'api_public' | 'api_authenticated' | 'none';
  dimensions_captured: boolean;
  dimensions_source?: 'attributes' | 'none';
  attributes_count: number;
  gtin_found: boolean;
  ean_found: boolean;
  sku_found: boolean;
  errors: string[];
}

// ============================================================================
// AUDIT LOG HELPER
// ============================================================================
async function logStep(supabase: any, params: {
  user_id: string;
  action: string;
  level?: string;
  success?: boolean;
  message: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await supabase.rpc('register_system_log', {
      p_level: params.level || (params.success === false ? 'error' : 'info'),
      p_system_area: 'clone_anuncio',
      p_action: params.action,
      p_user_id: params.user_id,
      p_success: params.success !== false,
      p_message: params.message,
      p_meta_json: params.meta || {},
    });
  } catch (_) {
    // fail-safe
  }
}

// ============================================================================
// ML PUBLIC FETCH — NEVER sends Authorization header
// This is the ONLY function used for load_source reads.
// ============================================================================
async function mlPublicFetch(
  supabase: any,
  userId: string,
  params: {
    attempt: string;
    endpoint: string;
    item_id: string;
    source_input_raw?: string;
    timeout?: number;
  }
): Promise<{ ok: boolean; status: number; data?: any; body_text?: string; elapsed_ms: number }> {
  const t0 = Date.now();
  const method = 'GET';

  // Explicit neutral headers — NO Authorization, NO cookies
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  // === LOG: ml_request_prepare ===
  await logStep(supabase, {
    user_id: userId,
    action: 'ml_request_prepare',
    message: `Preparando ${method} ${params.endpoint}`,
    meta: {
      attempt: params.attempt,
      endpoint: params.endpoint,
      method,
      used_token: false,
      headers_sanitized: { Accept: 'application/json' },
      item_id: params.item_id,
      source_input_raw: params.source_input_raw,
    },
  });

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      // Ensure no credentials are sent
      credentials: 'omit' as any,
    };
    if (params.timeout) {
      fetchOptions.signal = AbortSignal.timeout(params.timeout);
    }

    const response = await fetch(params.endpoint, fetchOptions);
    const elapsed_ms = Date.now() - t0;
    const bodyText = await response.text().catch(() => "");

    let data: any = undefined;
    try { data = JSON.parse(bodyText); } catch { data = undefined; }

    // === LOG: ml_request_result (ALWAYS) ===
    await logStep(supabase, {
      user_id: userId,
      action: 'ml_request_result',
      level: response.ok ? 'info' : 'error',
      success: response.ok,
      message: `${method} ${new URL(params.endpoint).pathname} → ${response.status}`,
      meta: {
        attempt: params.attempt,
        endpoint: params.endpoint,
        method,
        used_token: false,
        http_status: response.status,
        duration_ms: elapsed_ms,
        response_body_snippet: bodyText.slice(0, 2000),
        error: !response.ok,
        item_id: params.item_id,
        source_input_raw: params.source_input_raw,
      },
    });

    return { ok: response.ok, status: response.status, data, body_text: bodyText.slice(0, 2000), elapsed_ms };
  } catch (e: any) {
    const elapsed_ms = Date.now() - t0;
    await logStep(supabase, {
      user_id: userId,
      action: 'ml_request_result',
      level: 'error',
      success: false,
      message: `${method} ${params.endpoint} NETWORK_ERROR`,
      meta: {
        attempt: params.attempt,
        endpoint: params.endpoint,
        method,
        used_token: false,
        http_status: 0,
        duration_ms: elapsed_ms,
        response_body_snippet: e.message,
        error: true,
        item_id: params.item_id,
        source_input_raw: params.source_input_raw,
        stack_trace: e.stack?.slice(0, 2000),
      },
    });
    return { ok: false, status: 0, body_text: e.message, elapsed_ms };
  }
}

// ============================================================================
// AUTHENTICATED FETCH — Only for diagnostic (attempt B) or own-item enrichment
// ============================================================================
async function mlAuthenticatedFetch(
  supabase: any,
  userId: string,
  params: {
    attempt: string;
    endpoint: string;
    accessToken: string;
    item_id: string;
    source_input_raw?: string;
    timeout?: number;
  }
): Promise<{ ok: boolean; status: number; data?: any; body_text?: string; elapsed_ms: number }> {
  const t0 = Date.now();
  const method = 'GET';

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${params.accessToken}`,
  };

  await logStep(supabase, {
    user_id: userId,
    action: 'ml_request_prepare',
    message: `Preparando ${method} ${params.endpoint} (COM TOKEN)`,
    meta: {
      attempt: params.attempt,
      endpoint: params.endpoint,
      method,
      used_token: true,
      headers_sanitized: { Authorization: 'Bearer ***', Accept: 'application/json' },
      item_id: params.item_id,
      source_input_raw: params.source_input_raw,
    },
  });

  try {
    const fetchOptions: RequestInit = { method, headers };
    if (params.timeout) {
      fetchOptions.signal = AbortSignal.timeout(params.timeout);
    }

    const response = await fetch(params.endpoint, fetchOptions);
    const elapsed_ms = Date.now() - t0;
    const bodyText = await response.text().catch(() => "");

    let data: any = undefined;
    try { data = JSON.parse(bodyText); } catch { data = undefined; }

    await logStep(supabase, {
      user_id: userId,
      action: 'ml_request_result',
      level: response.ok ? 'info' : 'error',
      success: response.ok,
      message: `${method} ${new URL(params.endpoint).pathname} → ${response.status} (TOKEN)`,
      meta: {
        attempt: params.attempt,
        endpoint: params.endpoint,
        method,
        used_token: true,
        http_status: response.status,
        duration_ms: elapsed_ms,
        response_body_snippet: bodyText.slice(0, 2000),
        error: !response.ok,
        item_id: params.item_id,
        source_input_raw: params.source_input_raw,
      },
    });

    return { ok: response.ok, status: response.status, data, body_text: bodyText.slice(0, 2000), elapsed_ms };
  } catch (e: any) {
    const elapsed_ms = Date.now() - t0;
    await logStep(supabase, {
      user_id: userId,
      action: 'ml_request_result',
      level: 'error',
      success: false,
      message: `${method} ${params.endpoint} NETWORK_ERROR (TOKEN)`,
      meta: {
        attempt: params.attempt,
        endpoint: params.endpoint,
        method,
        used_token: true,
        http_status: 0,
        duration_ms: elapsed_ms,
        response_body_snippet: e.message,
        error: true,
        item_id: params.item_id,
        source_input_raw: params.source_input_raw,
        stack_trace: e.stack?.slice(0, 2000),
      },
    });
    return { ok: false, status: 0, body_text: e.message, elapsed_ms };
  }
}

// ============================================================================
// RESOLUÇÃO DE MLBU → MLB (always public, no token)
// ============================================================================
async function resolveMLBUtoMLB(
  supabase: any,
  userId: string,
  mlbuId: string
): Promise<{ ok: boolean; itemId?: string; error?: string; productData?: any }> {
  console.log(`[ad-item-snapshot] Resolving MLBU (PUBLIC): ${mlbuId}`);

  // Try /products/{MLBU} — PUBLIC, no token
  const productResult = await mlPublicFetch(supabase, userId, {
    attempt: 'MLBU_resolve_public',
    endpoint: `https://api.mercadolibre.com/products/${mlbuId}`,
    item_id: mlbuId,
  });

  if (productResult.ok && productResult.data?.buy_box_winner?.item_id) {
    return { ok: true, itemId: productResult.data.buy_box_winner.item_id, productData: productResult.data };
  }

  // Try with MLB prefix instead of MLBU
  const numericPart = mlbuId.replace(/^MLBU/i, '');
  const mlbId = `MLB${numericPart}`;
  const mlbResult = await mlPublicFetch(supabase, userId, {
    attempt: 'MLBU_resolve_public_alt',
    endpoint: `https://api.mercadolibre.com/products/${mlbId}`,
    item_id: mlbuId,
  });

  if (mlbResult.ok && mlbResult.data?.buy_box_winner?.item_id) {
    return { ok: true, itemId: mlbResult.data.buy_box_winner.item_id, productData: mlbResult.data };
  }

  // Both failed
  const bestData = productResult.data || mlbResult.data;
  if (bestData?.buy_box_winner === null || bestData?.buy_box_winner === undefined) {
    return { ok: false, error: "Catálogo sem vendedor ativo (buy_box vazio)", productData: bestData };
  }

  return { ok: false, error: `Produto de catálogo não encontrado: ${mlbuId}`, productData: bestData };
}

// ============================================================================
// HELPERS
// ============================================================================
function extractPackageDimensions(attributes: any[]) {
  const result: any = { found: false };
  if (!attributes || !Array.isArray(attributes)) return result;
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name ? parseFloat(attr.value_name) : attr.value_struct?.number;
    if (value && !isNaN(value)) {
      if (id === 'SELLER_PACKAGE_HEIGHT' || id === 'PACKAGE_HEIGHT') { result.height = value; result.found = true; }
      else if (id === 'SELLER_PACKAGE_WIDTH' || id === 'PACKAGE_WIDTH') { result.width = value; result.found = true; }
      else if (id === 'SELLER_PACKAGE_LENGTH' || id === 'PACKAGE_LENGTH') { result.length = value; result.found = true; }
      else if (id === 'SELLER_PACKAGE_WEIGHT' || id === 'PACKAGE_WEIGHT') { result.weight = value; result.found = true; }
    }
  }
  return result;
}

function extractIdentifiers(attributes: any[]) {
  const result: { gtin?: string; ean?: string; sku?: string } = {};
  if (!attributes || !Array.isArray(attributes)) return result;
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name || attr.value_id;
    if (!value) continue;
    if (id === 'GTIN') result.gtin = value;
    else if (id === 'EAN') result.ean = value;
    else if (id === 'SELLER_SKU' || id === 'SKU') result.sku = value;
  }
  return result;
}

function processAllPictures(pictures: any[], thumbnail?: string) {
  if (!pictures || !Array.isArray(pictures) || pictures.length === 0) {
    if (thumbnail) {
      const secureUrl = thumbnail.replace(/^http:\/\//i, 'https://');
      return { processed: [{ id: 'thumb', url: secureUrl, secure_url: secureUrl }], source: 'api_thumbnail_fallback' as const };
    }
    return { processed: [] as any[], source: 'none' as const };
  }
  const processed = pictures
    .map((p: any, index: number) => {
      const secureUrl = (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://');
      return { id: p.id || `pic_${index}`, url: secureUrl, secure_url: secureUrl };
    })
    .filter((p) => p.url && p.url.length > 0);
  return { processed, source: 'api_full' as const };
}

function buildFinalReason(attempt: string, status: number, bodySnippet?: string): string {
  let hint = '';
  if (bodySnippet) {
    if (/PolicyAgent/i.test(bodySnippet)) hint = '_PolicyAgent';
    else if (/resource not found/i.test(bodySnippet)) hint = '_NotFound';
    else if (/unauthorized/i.test(bodySnippet)) hint = '_Unauthorized';
    else if (/item not found/i.test(bodySnippet)) hint = '_ItemNotFound';
  }
  return `${attempt}_${status}${hint}`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as SnapshotRequest;
    const { item_id, id_type, ml_account_id, seller_id, source_input_raw } = body;

    if (!item_id) {
      return new Response(JSON.stringify({ success: false, error: "item_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const t0Global = Date.now();
    const captureLog: CaptureLog = {
      pictures_count: 0, pictures_source: 'none', description_captured: false,
      dimensions_captured: false, attributes_count: 0, gtin_found: false, ean_found: false, sku_found: false, errors: [],
    };

    let normalizedId = item_id.replace(/-/g, '').toUpperCase();
    let resolvedItemId = normalizedId;
    let catalogResolution: any = null;

    // === LOG: load_source_start ===
    await logStep(supabase, {
      user_id: user.id,
      action: 'load_source_start',
      message: 'Iniciando leitura do anúncio de origem (PÚBLICO, sem token)',
      meta: {
        source_input_raw: source_input_raw || item_id,
        item_id: normalizedId,
        source_product_id: id_type === 'MLBU' || /^MLBU/i.test(normalizedId) ? normalizedId : undefined,
        site_id: 'MLB',
        used_token_expected: false,
        timestamp: new Date().toISOString(),
      },
    });

    // =========================================================================
    // ETAPA 1: Resolver MLBU para MLB (PUBLIC — sem token)
    // =========================================================================
    if (id_type === 'MLBU' || /^MLBU/i.test(normalizedId)) {
      const resolution = await resolveMLBUtoMLB(supabase, user.id, normalizedId);
      if (!resolution.ok) {
        await logStep(supabase, {
          user_id: user.id, action: 'load_source_error', level: 'error', success: false,
          message: 'Falha ao carregar anúncio',
          meta: {
            item_id: normalizedId, final_reason: 'MLBU_resolution_failed',
            final_http_status: 404, final_endpoint: `/products/${normalizedId}`,
            used_token: false,
            elapsed_ms: Date.now() - t0Global,
          },
        });
        return new Response(JSON.stringify({
          success: false, error: "CATALOG_RESOLUTION_FAILED",
          message: resolution.error || "Não foi possível resolver o link de catálogo",
          user_guidance: "Cole o link de um anúncio específico (MLB) em vez do link de catálogo (/up/MLBU...).",
          original_id: normalizedId, catalog_data: resolution.productData,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      resolvedItemId = resolution.itemId!;
      catalogResolution = {
        original_catalog_id: normalizedId, resolved_item_id: resolvedItemId,
        product_name: resolution.productData?.name,
      };
    }

    // =========================================================================
    // ETAPA 2: Buscar credenciais ML (para tentativa B diagnóstica apenas)
    // =========================================================================
    let mlAccount: { access_token: string | null; ml_user_id: string } | null = null;
    if (ml_account_id) {
      const { data } = await supabase.from("ml_accounts").select("access_token, ml_user_id")
        .eq("ml_user_id", ml_account_id).maybeSingle();
      mlAccount = data;
    }
    if (!mlAccount?.access_token && seller_id) {
      const { data } = await supabase.from("ml_accounts").select("access_token, ml_user_id")
        .eq("ml_user_id", String(seller_id)).eq("user_id", user.id).maybeSingle();
      mlAccount = data;
    }
    if (!mlAccount?.access_token) {
      const { data } = await supabase.from("ml_accounts").select("access_token, ml_user_id")
        .eq("user_id", user.id).not("access_token", "is", null).limit(1).maybeSingle();
      mlAccount = data;
    }

    // =========================================================================
    // ETAPA 3: NOVA ESTRATÉGIA — Multi-get + Search + Fallbacks
    // Ordem: A) Multi-get autenticado, B) Multi-get público, C) Search,
    //        D) Single-get público legado, E) Cache
    // =========================================================================
    const multiGetEndpoint = `https://api.mercadolibre.com/items?ids=${resolvedItemId}&attributes=all`;
    const descEndpoint = `https://api.mercadolibre.com/items/${resolvedItemId}/description`;
    const searchEndpoint = `https://api.mercadolibre.com/sites/MLB/search?q=${resolvedItemId}&limit=1`;
    const singleGetEndpoint = `https://api.mercadolibre.com/items/${resolvedItemId}`;

    let itemData: any = null;
    let description: string | undefined;
    let descriptionSource: 'api_public' | 'api_authenticated' | 'none' = 'none';
    let fetchMethod: 'public' | 'authenticated' | 'cache' | 'multi_get' | 'search' = 'public';
    let bestAttemptStatus = 0;
    let bestAttemptBody = '';
    let bestAttemptName = 'none';

    // --- A) Multi-get autenticado ---
    if (mlAccount?.access_token) {
      const attemptA = await mlAuthenticatedFetch(supabase, user.id, {
        attempt: 'A_multiget_auth', endpoint: multiGetEndpoint,
        accessToken: mlAccount.access_token, item_id: resolvedItemId,
        source_input_raw: source_input_raw || item_id,
      });

      if (attemptA.ok && Array.isArray(attemptA.data) && attemptA.data[0]?.code === 200 && attemptA.data[0]?.body) {
        itemData = attemptA.data[0].body;
        fetchMethod = 'multi_get';
        bestAttemptName = 'A_multiget_auth';
      } else if (attemptA.ok && attemptA.data && !Array.isArray(attemptA.data) && attemptA.data.id) {
        itemData = attemptA.data;
        fetchMethod = 'multi_get';
        bestAttemptName = 'A_multiget_auth';
      } else {
        bestAttemptStatus = attemptA.data?.[0]?.code || attemptA.status;
        bestAttemptBody = attemptA.body_text || '';
        bestAttemptName = 'A_multiget_auth';
        console.log(`[ad-item-snapshot] Attempt A (multi-get auth) failed: ${bestAttemptStatus}`);
      }
    }

    // --- B) Multi-get público ---
    if (!itemData) {
      const attemptB = await mlPublicFetch(supabase, user.id, {
        attempt: 'B_multiget_public', endpoint: multiGetEndpoint,
        item_id: resolvedItemId, source_input_raw: source_input_raw || item_id,
      });

      if (attemptB.ok && Array.isArray(attemptB.data) && attemptB.data[0]?.code === 200 && attemptB.data[0]?.body) {
        itemData = attemptB.data[0].body;
        fetchMethod = 'multi_get';
        bestAttemptName = 'B_multiget_public';
      } else if (attemptB.ok && attemptB.data && !Array.isArray(attemptB.data) && attemptB.data.id) {
        itemData = attemptB.data;
        fetchMethod = 'multi_get';
        bestAttemptName = 'B_multiget_public';
      } else {
        if (attemptB.status > 0) {
          bestAttemptStatus = attemptB.data?.[0]?.code || attemptB.status;
          bestAttemptBody = attemptB.body_text || '';
          bestAttemptName = 'B_multiget_public';
        }
        console.log(`[ad-item-snapshot] Attempt B (multi-get public) failed: ${bestAttemptStatus}`);
      }
    }

    // --- C) Search fallback ---
    if (!itemData) {
      const attemptC = mlAccount?.access_token
        ? await mlAuthenticatedFetch(supabase, user.id, {
            attempt: 'C_search_auth', endpoint: searchEndpoint,
            accessToken: mlAccount.access_token, item_id: resolvedItemId,
            source_input_raw: source_input_raw || item_id,
          })
        : await mlPublicFetch(supabase, user.id, {
            attempt: 'C_search_public', endpoint: searchEndpoint,
            item_id: resolvedItemId, source_input_raw: source_input_raw || item_id,
          });

      if (attemptC.ok && attemptC.data?.results?.[0]?.id === resolvedItemId) {
        itemData = attemptC.data.results[0];
        fetchMethod = 'search';
        bestAttemptName = 'C_search';
        console.log(`[ad-item-snapshot] Search fallback found item`);
      } else {
        if (attemptC.status > 0) {
          bestAttemptStatus = attemptC.status;
          bestAttemptBody = attemptC.body_text || '';
          bestAttemptName = 'C_search';
        }
        console.log(`[ad-item-snapshot] Attempt C (search) failed`);
      }
    }

    // --- D) Single-get público legado ---
    if (!itemData) {
      console.log(`[ad-item-snapshot] Trying D_legacy_single_get`);
      const attemptD = await mlPublicFetch(supabase, user.id, {
        attempt: 'D_legacy_public', endpoint: singleGetEndpoint,
        item_id: resolvedItemId, source_input_raw: source_input_raw || item_id,
      });

      if (attemptD.ok && attemptD.data) {
        itemData = attemptD.data;
        fetchMethod = 'public';
        bestAttemptName = 'D_legacy_public';
      } else {
        if (attemptD.status > 0) {
          bestAttemptStatus = attemptD.status;
          bestAttemptBody = attemptD.body_text || '';
          bestAttemptName = 'D_legacy_public';
        }
      }
    }

    // --- E) Cache fallback ---
    if (!itemData) {
      console.log(`[ad-item-snapshot] All API attempts failed, trying E_cache_fallback`);
      const { data: cachedItem } = await supabase
        .from("meli_listings_cache").select("*")
        .eq("item_id", resolvedItemId).single();

      if (cachedItem) {
        await logStep(supabase, {
          user_id: user.id, action: 'ml_request_result', message: 'Cache fallback hit',
          meta: { attempt: 'E_cache_fallback', item_id: resolvedItemId, cache_found: true },
        });
        itemData = {
          id: cachedItem.item_id, title: cachedItem.title, price: cachedItem.price,
          thumbnail: cachedItem.thumbnail, status: cachedItem.status,
          available_quantity: cachedItem.available_quantity, sold_quantity: cachedItem.sold_quantity,
          category_id: cachedItem.category_id, seller_id: cachedItem.seller_id,
          pictures: [], attributes: [],
        };
        fetchMethod = 'cache';
        bestAttemptName = 'E_cache_fallback';
        captureLog.errors.push('Using cache fallback - limited data (no pictures/attributes)');
      }
    }

    // --- Fetch description (separate endpoint, not affected by PolicyAgent) ---
    if (itemData) {
      const descResult = await mlPublicFetch(supabase, user.id, {
        attempt: `${bestAttemptName}_desc_public`, endpoint: descEndpoint,
        item_id: resolvedItemId, timeout: 10000,
      });
      if (descResult.ok && descResult.data) {
        description = descResult.data.plain_text || descResult.data.text || '';
        descriptionSource = 'api_public';
      } else if (mlAccount?.access_token) {
        const descAuth = await mlAuthenticatedFetch(supabase, user.id, {
          attempt: `${bestAttemptName}_desc_auth`, endpoint: descEndpoint,
          accessToken: mlAccount.access_token, item_id: resolvedItemId,
        });
        if (descAuth.ok && descAuth.data) {
          description = descAuth.data.plain_text || descAuth.data.text || '';
          descriptionSource = 'api_authenticated';
        }
      }
      captureLog.description_captured = !!description;
      captureLog.description_source = descriptionSource;
    }

    // =========================================================================
    // ALL ATTEMPTS FAILED
    // =========================================================================
    if (!itemData) {
      const finalReason = buildFinalReason(bestAttemptName, bestAttemptStatus, bestAttemptBody);

      await logStep(supabase, {
        user_id: user.id, action: 'load_source_error', level: 'error', success: false,
        message: 'Falha ao carregar anúncio',
        meta: {
          item_id: resolvedItemId,
          final_reason: finalReason,
          final_http_status: bestAttemptStatus,
          final_endpoint: itemEndpoint,
          best_error_body_snippet: bestAttemptBody?.slice(0, 2000),
          used_token: bestAttemptName.includes('B_token'),
          elapsed_ms: Date.now() - t0Global,
          source_input_raw: source_input_raw || item_id,
          stack_trace: null,
        },
      });

      let uiMessage = `Falha ao carregar (HTTP ${bestAttemptStatus})`;
      if (bestAttemptBody) {
        try {
          const parsed = JSON.parse(bestAttemptBody);
          if (parsed.message) uiMessage = `Falha ao carregar (HTTP ${bestAttemptStatus}): ${parsed.message}`;
          else if (parsed.error) uiMessage = `Falha ao carregar (HTTP ${bestAttemptStatus}): ${parsed.error}`;
        } catch {
          uiMessage = `Falha ao carregar (HTTP ${bestAttemptStatus}): ${bestAttemptBody.slice(0, 200)}`;
        }
      }

      return new Response(JSON.stringify({
        success: false,
        error: "ITEM_LOAD_FAILED",
        message: uiMessage,
        item_id: resolvedItemId,
        http_status: bestAttemptStatus,
        error_body_snippet: bestAttemptBody?.slice(0, 2000),
        load_mode: bestAttemptName,
        final_reason: finalReason,
        capture_log: captureLog,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // =========================================================================
    // ETAPA 4: Processar dados
    // =========================================================================
    const { processed: processedPictures, source: picturesSource } = processAllPictures(
      itemData.pictures, itemData.thumbnail
    );
    captureLog.pictures_count = processedPictures.length;
    captureLog.pictures_source = picturesSource;

    const dimensions = extractPackageDimensions(itemData.attributes || []);
    captureLog.dimensions_captured = dimensions.found;
    captureLog.dimensions_source = dimensions.found ? 'attributes' : 'none';

    const identifiers = extractIdentifiers(itemData.attributes || []);
    captureLog.gtin_found = !!identifiers.gtin;
    captureLog.ean_found = !!identifiers.ean;
    captureLog.sku_found = !!identifiers.sku;
    captureLog.attributes_count = (itemData.attributes || []).length;

    // Detect catalog ONLY from real API data
    const isCatalogSource = !!(
      itemData.catalog_product_id ||
      itemData.catalog_listing === true ||
      itemData.parent_item_id
    );

    // =========================================================================
    // ETAPA 5: Build response
    // =========================================================================
    const response = {
      success: true,
      source: fetchMethod,
      resolved_item_id: resolvedItemId,
      catalog_resolution: catalogResolution,
      capture_log: captureLog,
      item: {
        id: itemData.id, title: itemData.title, subtitle: itemData.subtitle,
        price: itemData.price, currency_id: itemData.currency_id,
        available_quantity: itemData.available_quantity, sold_quantity: itemData.sold_quantity,
        condition: itemData.condition, listing_type_id: itemData.listing_type_id,
        category_id: itemData.category_id, thumbnail: itemData.thumbnail,
        pictures: processedPictures, attributes: itemData.attributes || [],
        seller_id: itemData.seller_id, status: itemData.status, permalink: itemData.permalink,
        description: description || '',
        catalog_product_id: itemData.catalog_product_id,
        catalog_listing: itemData.catalog_listing,
        parent_item_id: itemData.parent_item_id,
        is_catalog_source: isCatalogSource,
        seller_package_height: dimensions.height, seller_package_width: dimensions.width,
        seller_package_length: dimensions.length, seller_package_weight: dimensions.weight,
        captured_gtin: identifiers.gtin || identifiers.ean,
        captured_ean: identifiers.ean, captured_sku: identifiers.sku,
        shipping: itemData.shipping, sale_terms: itemData.sale_terms,
        variations: itemData.variations,
      },
      user_seller_id: mlAccount?.ml_user_id,
      is_own_item: mlAccount?.ml_user_id ? String(itemData.seller_id) === String(mlAccount.ml_user_id) : false,
    };

    // === LOG: load_source_success ===
    await logStep(supabase, {
      user_id: user.id, action: 'load_source_success',
      message: `Anúncio carregado com sucesso via ${fetchMethod}`,
      meta: {
        item_id: resolvedItemId,
        fetch_method: fetchMethod,
        used_token: fetchMethod === 'authenticated',
        pictures: captureLog.pictures_count,
        description_captured: captureLog.description_captured,
        dimensions_captured: captureLog.dimensions_captured,
        is_catalog: isCatalogSource,
        elapsed_ms: Date.now() - t0Global,
      },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`[ad-item-snapshot] Error:`, error);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      await logStep(sb, {
        user_id: 'unknown',
        action: 'load_source_error',
        level: 'error',
        success: false,
        message: `Erro não tratado: ${error?.message || String(error)}`,
        meta: {
          stack_trace: error?.stack?.slice(0, 2000),
          error_message: error?.message || String(error),
        },
      });
    } catch (_) { /* fail-safe */ }
    return new Response(JSON.stringify({
      success: false, error: error?.message || String(error),
      http_status: 500,
      stack_trace: error?.stack?.slice(0, 2000),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
