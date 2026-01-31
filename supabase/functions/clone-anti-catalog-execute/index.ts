// Edge Function ISOLADA: clone-anti-catalog-execute
// Cria anúncio NORMAL (fora de catálogo) seguindo regras Anti-Catálogo v3
// SEMPRE retorna HTTP 200 com success:true/false para evitar "non-2xx"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ============================================
// REGRAS ANTI-CATÁLOGO v3
// ============================================

const FORBIDDEN_BODY_FIELDS = new Set([
  "catalog_listing",
  "catalog_product_id",
  "product_id",
  "parent_item_id",
]);

const FORBIDDEN_ATTRIBUTES = new Set([
  "GTIN", "EAN", "UPC", "ISBN", "MPN",
  "PART_NUMBER", "ALPHANUMERIC_MODEL",
  "MANUFACTURER_CODE", "SKU", "SELLER_SKU",
]);

const DUPLICATE_ATTRIBUTES = new Set([
  "ITEM_CONDITION",
  "PACKAGE_HEIGHT", "PACKAGE_WIDTH", "PACKAGE_LENGTH", "PACKAGE_WEIGHT",
]);

// ============================================
// MAPEAMENTO ESTÁTICO DE FAMILY_NAME
// ============================================
const CATEGORY_FAMILY_NAME: Record<string, string> = {
  "MLB1684": "Etiquetas impressas",
  "MLB1499": "Produto de papelaria",
  "MLB1430": "Suprimentos de impressão",
  "MLB1132": "Acessórios para escritório",
  "MLB5672": "Impressoras",
  "MLB1744": "Livros",
};

// ============================================
// SISTEMA DE LOGGING
// ============================================
interface LogEntry {
  ts: string;
  step: string;
  data: Record<string, any>;
}

function createLogger() {
  const logs: LogEntry[] = [];
  
  return {
    add(step: string, data: Record<string, any>) {
      const entry: LogEntry = {
        ts: new Date().toISOString(),
        step,
        data,
      };
      logs.push(entry);
      console.log(`[${entry.ts}] ${step}:`, JSON.stringify(data));
    },
    getLogs() {
      return logs;
    }
  };
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function isAttributeSafe(attrId: string): boolean {
  const id = attrId?.toUpperCase() || "";
  return !FORBIDDEN_ATTRIBUTES.has(id) && !DUPLICATE_ATTRIBUTES.has(id);
}

function filterSafeAttributes(attributes: any[]): any[] {
  if (!attributes || !Array.isArray(attributes)) return [];
  // Filtrar atributos perigosos mas PRESERVAR atributos obrigatórios como BRAND, PAPER_TYPE, PAPER_SIZE
  return attributes.filter((attr) => {
    const id = attr.id?.toUpperCase() || "";
    // Bloquear apenas atributos de catálogo
    if (FORBIDDEN_ATTRIBUTES.has(id)) return false;
    // Bloquear duplicados que serão substituídos por SELLER_PACKAGE_*
    if (DUPLICATE_ATTRIBUTES.has(id)) return false;
    return true;
  });
}

function isRequiredFieldsError(apiError: any, fieldName: string): boolean {
  if (!apiError) return false;

  const causes = apiError.cause || apiError.causes || [];
  for (const c of causes) {
    if (c.code === "body.required_fields" || c.code === "item.required_fields") {
      const references = c.references || [];
      if (references.includes(fieldName)) {
        return true;
      }
    }
  }

  const message = (apiError.message || apiError.error || "").toLowerCase();
  if (message.includes(fieldName.toLowerCase()) && 
      (message.includes("required") || message.includes("obrigatório"))) {
    return true;
  }

  return false;
}

async function fetchFamilyNameFromAPI(
  categoryId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://api.mercadolibre.com/categories/${categoryId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return data?.settings?.catalog_family_name || 
             data?.family_name || 
             data?.name || 
             null;
    }
  } catch (error: any) {
    console.warn(`[ANTI-CATALOG] Failed to fetch category: ${error.message}`);
  }
  return null;
}

// ============================================
// INTERFACE DE RESULTADO
// ============================================
interface CreateResult {
  success: boolean;
  item_id?: string;
  permalink?: string;
  error?: string;
  error_code?: string;
  diagnostic: {
    retry_performed: boolean;
    family_name_included: boolean;
    family_name_source: "static_mapping" | "api_category" | "fallback" | null;
    family_name_value: string | null;
    api_status_attempt_1: number | null;
    api_status_attempt_2: number | null;
    payload_keys_sent_attempt_1: string[];
    payload_keys_sent_attempt_2: string[];
  };
  debug: {
    logs: LogEntry[];
    last_payload_sent: Record<string, any>;
    last_api_response: any;
  };
}

// ============================================
// FUNÇÃO PRINCIPAL DE CRIAÇÃO (2 tentativas máximo)
// ============================================
async function createItemAntiCatalog(
  basePayload: Record<string, any>,
  categoryId: string,
  accessToken: string
): Promise<CreateResult> {
  const logger = createLogger();
  const CREATE_ENDPOINT = "https://api.mercadolibre.com/items";
  
  // Resultado
  const result: CreateResult = {
    success: false,
    diagnostic: {
      retry_performed: false,
      family_name_included: false,
      family_name_source: null,
      family_name_value: null,
      api_status_attempt_1: null,
      api_status_attempt_2: null,
      payload_keys_sent_attempt_1: [],
      payload_keys_sent_attempt_2: [],
    },
    debug: {
      logs: [],
      last_payload_sent: {},
      last_api_response: null,
    },
  };

  // ============================================
  // TENTATIVA 1: Sem family_name
  // ============================================
  const payload1 = { ...basePayload };
  // Garantir que family_name NÃO está no primeiro payload (anti-catálogo)
  delete payload1.family_name;
  
  logger.add("attempt_1_payload", {
    category_id: categoryId,
    title: payload1.title?.substring(0, 50),
    price: payload1.price,
    has_family_name: false,
    payload_keys: Object.keys(payload1),
    attributes_ids: (payload1.attributes || []).map((a: any) => a.id),
  });

  result.diagnostic.payload_keys_sent_attempt_1 = Object.keys(payload1);
  result.debug.last_payload_sent = payload1;

  let response1: Response;
  let data1: any;

  try {
    response1 = await fetch(CREATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload1),
    });
    data1 = await response1.json();
  } catch (err: any) {
    logger.add("attempt_1_network_error", { error: err.message });
    result.error = `Erro de rede: ${err.message}`;
    result.error_code = "NETWORK_ERROR";
    result.debug.logs = logger.getLogs();
    return result;
  }

  result.diagnostic.api_status_attempt_1 = response1.status;
  result.debug.last_api_response = data1;

  logger.add("attempt_1_response", {
    status: response1.status,
    ok: response1.ok,
    has_id: !!data1?.id,
    error: data1?.error,
    message: data1?.message,
    cause: data1?.cause,
  });

  // SUCESSO na tentativa 1
  if (response1.ok && data1?.id) {
    logger.add("success", {
      item_id: data1.id,
      attempt: 1,
    });
    result.success = true;
    result.item_id = data1.id;
    result.permalink = data1.permalink;
    result.debug.logs = logger.getLogs();
    return result;
  }

  // ============================================
  // VERIFICAR SE PRECISA RETRY POR family_name
  // ============================================
  const needsFamilyName = isRequiredFieldsError(data1, "family_name");
  
  logger.add("attempt_1_error_analysis", {
    needs_family_name: needsFamilyName,
    full_error: data1,
  });

  if (!needsFamilyName) {
    // Erro diferente de family_name - retorna erro
    logger.add("final_error", {
      reason: "Erro não relacionado a family_name",
      api_status: response1.status,
    });
    result.error = data1?.message || data1?.error || "Erro desconhecido";
    result.error_code = response1.status === 401 ? "AUTH_EXPIRED" : 
                        response1.status === 403 ? "ACCESS_DENIED" : "CREATE_FAILED";
    result.debug.logs = logger.getLogs();
    return result;
  }

  // ============================================
  // BUSCAR family_name
  // ============================================
  logger.add("family_name_lookup_start", { category_id: categoryId });

  let familyNameValue: string;
  let familyNameSource: "static_mapping" | "api_category" | "fallback";

  // 1. Tentar mapeamento estático
  const staticFamilyName = CATEGORY_FAMILY_NAME[categoryId];
  if (staticFamilyName) {
    familyNameValue = staticFamilyName;
    familyNameSource = "static_mapping";
    logger.add("family_name_found", {
      source: "static_mapping",
      value: familyNameValue,
    });
  } else {
    // 2. Tentar API de categorias
    const apiFamilyName = await fetchFamilyNameFromAPI(categoryId, accessToken);
    if (apiFamilyName) {
      familyNameValue = apiFamilyName;
      familyNameSource = "api_category";
      logger.add("family_name_found", {
        source: "api_category",
        value: familyNameValue,
      });
    } else {
      // 3. Fallback seguro
      familyNameValue = "Produto";
      familyNameSource = "fallback";
      logger.add("family_name_found", {
        source: "fallback",
        value: familyNameValue,
      });
    }
  }

  // Atualizar diagnóstico
  result.diagnostic.family_name_value = familyNameValue;
  result.diagnostic.family_name_source = familyNameSource;

  // ============================================
  // TENTATIVA 2: Com family_name NO NÍVEL RAIZ
  // ============================================
  result.diagnostic.retry_performed = true;

  // IMPORTANTE: Criar NOVO payload com family_name
  const payload2: Record<string, any> = {
    ...basePayload,
    family_name: familyNameValue, // <- NO NÍVEL RAIZ
  };
  // Garantir que NÃO está em attributes
  delete payload2.family_name_in_attributes; // safety

  logger.add("attempt_2_payload", {
    category_id: categoryId,
    title: payload2.title?.substring(0, 50),
    price: payload2.price,
    family_name: payload2.family_name, // <- EXPLÍCITO
    has_family_name: true,
    payload_keys: Object.keys(payload2),
    attributes_ids: (payload2.attributes || []).map((a: any) => a.id),
    full_payload: JSON.stringify(payload2),
  });

  result.diagnostic.payload_keys_sent_attempt_2 = Object.keys(payload2);
  result.diagnostic.family_name_included = true;
  result.debug.last_payload_sent = payload2;

  let response2: Response;
  let data2: any;

  try {
    response2 = await fetch(CREATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload2),
    });
    data2 = await response2.json();
  } catch (err: any) {
    logger.add("attempt_2_network_error", { error: err.message });
    result.error = `Erro de rede no retry: ${err.message}`;
    result.error_code = "NETWORK_ERROR";
    result.debug.logs = logger.getLogs();
    result.debug.last_api_response = null;
    return result;
  }

  result.diagnostic.api_status_attempt_2 = response2.status;
  result.debug.last_api_response = data2;

  logger.add("attempt_2_response", {
    status: response2.status,
    ok: response2.ok,
    has_id: !!data2?.id,
    error: data2?.error,
    message: data2?.message,
    cause: data2?.cause,
  });

  // SUCESSO na tentativa 2
  if (response2.ok && data2?.id) {
    logger.add("success", {
      item_id: data2.id,
      attempt: 2,
      family_name_used: familyNameValue,
    });
    result.success = true;
    result.item_id = data2.id;
    result.permalink = data2.permalink;
    result.debug.logs = logger.getLogs();
    return result;
  }

  // FALHA na tentativa 2
  logger.add("attempt_2_final_error", {
    api_status: response2.status,
    full_error: data2,
  });

  result.error = data2?.message || data2?.error || "Erro desconhecido no retry";
  result.error_code = response2.status === 401 ? "AUTH_EXPIRED" : 
                      response2.status === 403 ? "ACCESS_DENIED" : "CREATE_FAILED";
  result.debug.logs = logger.getLogs();
  return result;
}

// ============================================
// HANDLER PRINCIPAL - SEMPRE RETORNA 200
// ============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Sempre retornar 200 para o front conseguir ler o erro
  const respond = (data: any) => {
    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  };

  const logger = createLogger();

  try {
    logger.add("request_received", { method: req.method });

    // Autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({
        success: false,
        error: "Não autorizado",
        error_code: "UNAUTHORIZED",
        debug: { logs: logger.getLogs() },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      logger.add("auth_error", { error: userError?.message });
      return respond({
        success: false,
        error: "Token inválido",
        error_code: "INVALID_TOKEN",
        debug: { logs: logger.getLogs() },
      });
    }

    const userId = userData.user.id;
    logger.add("user_authenticated", { userId });

    // Parse body
    const body = await req.json();
    const { ml_account_id, source_item_id, category_id, currency_id, payload } = body;

    logger.add("request_body", {
      ml_account_id,
      source_item_id,
      category_id,
      has_payload: !!payload,
    });

    if (!ml_account_id || !payload) {
      return respond({
        success: false,
        error: "Parâmetros obrigatórios faltando",
        error_code: "MISSING_PARAMS",
        debug: { logs: logger.getLogs() },
      });
    }

    // Buscar conta ML
    const { data: account, error: accError } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, access_token, refresh_token, token_expires_at, connection_status")
      .eq("id", ml_account_id)
      .eq("user_id", userId)
      .single();

    logger.add("account_lookup", {
      found: !!account,
      error: accError?.message,
      hasToken: !!account?.access_token,
      status: account?.connection_status,
    });

    if (accError || !account) {
      return respond({
        success: false,
        error: "Conta ML não encontrada",
        error_code: "ACCOUNT_NOT_FOUND",
        debug: { logs: logger.getLogs(), db_error: accError?.message },
      });
    }

    if (!account.access_token) {
      return respond({
        success: false,
        error: "Conta ML sem token. Reconecte a conta.",
        error_code: "NO_ACCESS_TOKEN",
        debug: { logs: logger.getLogs() },
      });
    }

    // Verificar expiração e refresh
    let accessToken = account.access_token;
    const expiresAt = account.token_expires_at ? new Date(account.token_expires_at) : null;
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt && expiresAt < fiveMinutesFromNow) {
      logger.add("token_refresh_needed", { expires_at: expiresAt.toISOString() });

      if (!account.refresh_token) {
        return respond({
          success: false,
          error: "Token expirado. Reconecte a conta.",
          error_code: "AUTH_EXPIRED",
          debug: { logs: logger.getLogs() },
        });
      }

      const ML_APP_ID = Deno.env.get("ML_APP_ID") || "";
      const ML_SECRET_KEY = Deno.env.get("ML_SECRET_KEY") || "";

      try {
        const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: ML_APP_ID,
            client_secret: ML_SECRET_KEY,
            refresh_token: account.refresh_token,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          logger.add("token_refresh_failed", { status: tokenResponse.status, error: errorText });

          await supabase
            .from("ml_accounts")
            .update({
              connection_status: "revoked",
              is_active: false,
              last_api_error_code: "invalid_grant",
              last_api_error_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", ml_account_id);

          return respond({
            success: false,
            error: "Token expirado. Reconecte a conta.",
            error_code: "AUTH_EXPIRED",
            debug: { logs: logger.getLogs() },
          });
        }

        const tokenData = await tokenResponse.json();
        const newExpiresAt = new Date();
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + tokenData.expires_in);

        await supabase
          .from("ml_accounts")
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: newExpiresAt.toISOString(),
            connection_status: "connected",
            is_active: true,
            last_token_refresh_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", ml_account_id);

        accessToken = tokenData.access_token;
        logger.add("token_refreshed", { new_expires_at: newExpiresAt.toISOString() });
      } catch (refreshError: any) {
        logger.add("token_refresh_error", { error: refreshError.message });
        return respond({
          success: false,
          error: "Erro ao renovar token.",
          error_code: "REFRESH_ERROR",
          debug: { logs: logger.getLogs() },
        });
      }
    }

    // ============================================
    // MONTAR PAYLOAD ANTI-CATÁLOGO
    // ============================================
    logger.add("building_payload", { category_id });

    const safeAttributes = filterSafeAttributes(payload.attributes || []);

    // Dimensões de envio - IMPORTANTE: Adicionar unidade de medida (cm para dimensões, g para peso)
    const sellerPackageAttrs: any[] = [];
    if (payload.package_height > 0) {
      sellerPackageAttrs.push({ id: "SELLER_PACKAGE_HEIGHT", value_name: `${payload.package_height} cm` });
    }
    if (payload.package_width > 0) {
      sellerPackageAttrs.push({ id: "SELLER_PACKAGE_WIDTH", value_name: `${payload.package_width} cm` });
    }
    if (payload.package_length > 0) {
      sellerPackageAttrs.push({ id: "SELLER_PACKAGE_LENGTH", value_name: `${payload.package_length} cm` });
    }
    if (payload.package_weight > 0) {
      sellerPackageAttrs.push({ id: "SELLER_PACKAGE_WEIGHT", value_name: `${payload.package_weight} g` });
    }

    const finalAttributes = [...safeAttributes, ...sellerPackageAttrs];

    const basePayload: Record<string, any> = {
      title: payload.title,
      category_id: category_id,
      price: payload.price,
      currency_id: currency_id || "BRL",
      available_quantity: payload.available_quantity,
      condition: payload.condition || "new",
      listing_type_id: payload.listing_type_id || "gold_special",
      pictures: payload.pictures,
      attributes: finalAttributes,
    };

    if (payload.description) {
      basePayload.description = { plain_text: payload.description };
    }

    // Remover campos proibidos
    for (const field of FORBIDDEN_BODY_FIELDS) {
      delete basePayload[field];
    }

    logger.add("payload_ready", {
      title: basePayload.title?.substring(0, 50),
      category_id: basePayload.category_id,
      price: basePayload.price,
      attributes_count: finalAttributes.length,
    });

    // ============================================
    // EXECUTAR CRIAÇÃO
    // ============================================
    const createResult = await createItemAntiCatalog(
      basePayload,
      category_id,
      accessToken
    );

    logger.add("create_result", {
      success: createResult.success,
      item_id: createResult.item_id,
      error_code: createResult.error_code,
      retry_performed: createResult.diagnostic.retry_performed,
      family_name_included: createResult.diagnostic.family_name_included,
    });

    // Mesclar logs
    createResult.debug.logs = [...logger.getLogs(), ...createResult.debug.logs];

    return respond(createResult);

  } catch (error: any) {
    logger.add("unexpected_error", { 
      message: error.message, 
      stack: error.stack 
    });

    return respond({
      success: false,
      error: error.message || "Erro interno",
      error_code: "INTERNAL_ERROR",
      debug: { logs: logger.getLogs() },
    });
  }
});
