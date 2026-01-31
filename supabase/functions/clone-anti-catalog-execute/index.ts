// Edge Function ISOLADA: clone-anti-catalog-execute
// Cria anúncio NORMAL (fora de catálogo) seguindo regras Anti-Catálogo v3
// NÃO depende de nenhuma outra edge function de clonagem

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ============================================
// REGRAS ANTI-CATÁLOGO v3
// ============================================

// Campos que NUNCA podem ser enviados no POST /items (exceto family_name via retry)
const FORBIDDEN_BODY_FIELDS = new Set([
  "catalog_listing",
  "catalog_product_id",
  "product_id",
  "parent_item_id",
]);

// Atributos que NUNCA podem ser enviados (forçam catálogo)
const FORBIDDEN_ATTRIBUTES = new Set([
  "GTIN",
  "EAN",
  "UPC",
  "ISBN",
  "MPN",
  "PART_NUMBER",
  "ALPHANUMERIC_MODEL",
  "MANUFACTURER_CODE",
  "SKU",
  "SELLER_SKU",
]);

// Atributos duplicados (já existem como campos raiz)
const DUPLICATE_ATTRIBUTES = new Set([
  "ITEM_CONDITION",
  "PACKAGE_HEIGHT",
  "PACKAGE_WIDTH",
  "PACKAGE_LENGTH",
  "PACKAGE_WEIGHT",
]);

// ============================================
// MAPEAMENTO ESTÁTICO DE FAMILY_NAME POR CATEGORIA
// ============================================
const FAMILY_NAME_BY_CATEGORY: Record<string, string> = {
  "MLB1684": "Etiquetas impressas",
  "MLB1499": "Produto de papelaria",
  "MLB1430": "Suprimentos de impressão",
  "MLB1132": "Acessórios para escritório",
};

// Cache dinâmico de categorias que exigem family_name (persistido em memória)
const familyNameRequiredCache = new Map<string, boolean>();

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function isAttributeSafe(attrId: string): boolean {
  const id = attrId?.toUpperCase() || "";
  return !FORBIDDEN_ATTRIBUTES.has(id) && !DUPLICATE_ATTRIBUTES.has(id);
}

function filterSafeAttributes(attributes: any[]): any[] {
  if (!attributes || !Array.isArray(attributes)) return [];
  return attributes.filter((attr) => isAttributeSafe(attr.id));
}

/**
 * Verifica se o erro da API é do tipo "body.required_fields" contendo um campo específico
 */
function isRequiredFieldsError(apiError: any, fieldName: string): boolean {
  if (!apiError) return false;

  // Verifica em cause/causes
  const causes = apiError.cause || apiError.causes || [];
  for (const c of causes) {
    if (c.code === "body.required_fields" || c.code === "item.required_fields") {
      const references = c.references || [];
      if (references.includes(fieldName)) {
        return true;
      }
    }
  }

  // Verifica na mensagem
  const message = apiError.message || apiError.error || "";
  if (message.toLowerCase().includes(fieldName.toLowerCase())) {
    // Verifica se parece ser um erro de campo obrigatório
    if (message.includes("required") || message.includes("obrigatório")) {
      return true;
    }
  }

  return false;
}

/**
 * Busca o family_name para uma categoria
 * 1. Primeiro verifica mapeamento estático
 * 2. Se não encontrar, consulta API de categorias do ML
 */
async function getFamilyName(
  categoryId: string,
  accessToken: string
): Promise<{ value: string | null; source: "static_mapping" | "api_category" | "title_fallback" | null }> {
  // 1. Verificar mapeamento estático
  const staticValue = FAMILY_NAME_BY_CATEGORY[categoryId];
  if (staticValue) {
    console.log(`[ANTI-CATALOG-V3] family_name from static mapping: "${staticValue}"`);
    return { value: staticValue, source: "static_mapping" };
  }

  // 2. Consultar API de categorias com timeout de 5 segundos
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
      
      // Tentar extrair family_name de diferentes locais
      const familyName = 
        data?.settings?.catalog_family_name ||
        data?.family_name ||
        data?.name;
      
      if (familyName) {
        console.log(`[ANTI-CATALOG-V3] family_name from API: "${familyName}"`);
        return { value: familyName, source: "api_category" };
      }
    }
  } catch (error: any) {
    console.warn(`[ANTI-CATALOG-V3] Failed to fetch category: ${error.message}`);
  }

  return { value: null, source: null };
}

/**
 * Deriva um family_name de fallback baseado no título
 */
function deriveFamilyNameFromTitle(title: string): string {
  if (title) {
    const words = title.split(/\s+/).slice(0, 4).join(" ");
    if (words.length > 0) return words;
  }
  return "Produto";
}

// ============================================
// INTERFACE DE RESULTADO
// ============================================
interface CreateItemResult {
  success: boolean;
  item_id?: string;
  permalink?: string;
  error?: string;
  error_code?: string;
  api_status?: number;
  api_error?: any;
  retry_info: {
    attempted: boolean;
    retry_count: number;
    field_added?: string;
    success_on_retry?: boolean;
  };
  diagnostic: {
    payload_keys_sent: string[];
    attributes_ids_sent: string[];
    removed_fields: string[];
    family_name_included: boolean;
    family_name_source: "static_mapping" | "api_category" | "title_fallback" | null;
    family_name_value: string | null;
  };
  // Novos campos para debug detalhado
  execution_logs: string[];
  last_payload_sent: Record<string, any>;
  last_api_response: any;
}

// ============================================
// FUNÇÃO PRINCIPAL DE CRIAÇÃO COM RETRY
// ============================================
async function createItemWithFamilyNameRetry(
  itemPayload: Record<string, any>,
  categoryId: string,
  accessToken: string,
  title: string
): Promise<CreateItemResult> {
  const CREATE_ENDPOINT = "https://api.mercadolibre.com/items";
  
  // ============================================
  // SISTEMA DE LOGGING
  // ============================================
  const executionLogs: string[] = [];
  let lastPayloadSent: Record<string, any> = {};
  let lastApiResponse: any = null;

  function addLog(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = data 
      ? `[${timestamp}] ${message} ${JSON.stringify(data)}`
      : `[${timestamp}] ${message}`;
    executionLogs.push(logEntry);
    console.log(logEntry);
  }

  // Resultado inicial
  const result: CreateItemResult = {
    success: false,
    retry_info: {
      attempted: false,
      retry_count: 0,
      success_on_retry: false,
    },
    diagnostic: {
      payload_keys_sent: Object.keys(itemPayload),
      attributes_ids_sent: (itemPayload.attributes || []).map((a: any) => a.id),
      removed_fields: [...FORBIDDEN_BODY_FIELDS],
      family_name_included: false,
      family_name_source: null,
      family_name_value: null,
    },
    execution_logs: [],
    last_payload_sent: {},
    last_api_response: null,
  };

  // Verificar se já sabemos que essa categoria exige family_name
  if (familyNameRequiredCache.get(categoryId)) {
    addLog('📦 [MERCADOLIVRE] Categoria conhecida por exigir family_name, adicionando preventivamente', { categoryId });
    const familyNameData = await getFamilyName(categoryId, accessToken);
    const familyNameValue = familyNameData.value || deriveFamilyNameFromTitle(title);
    itemPayload.family_name = familyNameValue;
    result.diagnostic.family_name_included = true;
    result.diagnostic.family_name_source = familyNameData.source || "title_fallback";
    result.diagnostic.family_name_value = familyNameValue;
    result.diagnostic.payload_keys_sent = Object.keys(itemPayload);
  }

  // ============================================
  // PRIMEIRA TENTATIVA
  // ============================================
  addLog('🚀 [MERCADOLIVRE] Tentativa 1 - Payload inicial', {
    category_id: itemPayload.category_id,
    title: itemPayload.title?.substring(0, 50),
    price: itemPayload.price,
    has_family_name: !!itemPayload.family_name,
    payload_keys: Object.keys(itemPayload),
    attributes_ids: (itemPayload.attributes || []).map((a: any) => a.id),
    attributes_count: itemPayload.attributes?.length || 0
  });

  // Guardar payload enviado
  lastPayloadSent = { ...itemPayload };

  let createResponse = await fetch(CREATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(itemPayload),
  });

  let createData = await createResponse.json();
  lastApiResponse = createData;
  result.retry_info.retry_count = 1;

  addLog('📡 [MERCADOLIVRE] Resposta da tentativa 1', {
    status: createResponse.status,
    ok: createResponse.ok,
    has_id: !!createData?.id,
    error: createData?.error,
    message: createData?.message
  });

  // Se sucesso na primeira tentativa
  if (createResponse.ok) {
    addLog('✅ [MERCADOLIVRE] Anúncio criado com sucesso na tentativa 1', {
      item_id: createData.id,
      permalink: createData.permalink
    });
    
    result.success = true;
    result.item_id = createData.id;
    result.permalink = createData.permalink;
    result.execution_logs = executionLogs;
    result.last_payload_sent = lastPayloadSent;
    result.last_api_response = lastApiResponse;
    return result;
  }

  // Log detalhado do erro
  addLog('❌ [MERCADOLIVRE] Erro na tentativa 1', {
    status: createResponse.status,
    error_code: createData?.error,
    message: createData?.message,
    cause: createData?.cause,
    full_error: createData
  });

  // ============================================
  // VERIFICAR SE PRECISA DE RETRY POR family_name
  // ============================================
  if (isRequiredFieldsError(createData, "family_name") && !result.diagnostic.family_name_included) {
    addLog('🔄 [MERCADOLIVRE] Detectado erro required_fields para family_name, iniciando retry...');
    
    result.retry_info.attempted = true;
    result.retry_info.field_added = "family_name";

    // Salvar no cache para próximas criações
    familyNameRequiredCache.set(categoryId, true);

    // Buscar family_name
    const familyNameData = await getFamilyName(categoryId, accessToken);
    let familyNameValue: string;
    let familyNameSource: "static_mapping" | "api_category" | "title_fallback";

    if (familyNameData.value) {
      familyNameValue = familyNameData.value;
      familyNameSource = familyNameData.source!;
    } else {
      // Fallback: usar primeiras palavras do título
      familyNameValue = deriveFamilyNameFromTitle(title);
      familyNameSource = "title_fallback";
    }

    addLog('📋 [MERCADOLIVRE] family_name obtido', {
      category_id: categoryId,
      family_name: familyNameValue,
      source: familyNameSource
    });

    // Atualizar diagnóstico
    result.diagnostic.family_name_included = true;
    result.diagnostic.family_name_source = familyNameSource;
    result.diagnostic.family_name_value = familyNameValue;

    // Criar payload de retry COM family_name no nível raiz
    const retryPayload: Record<string, any> = {
      ...itemPayload,
      family_name: familyNameValue,
    };

    result.diagnostic.payload_keys_sent = Object.keys(retryPayload);

    // ============================================
    // SEGUNDA TENTATIVA (RETRY)
    // ============================================
    addLog('🚀 [MERCADOLIVRE] Tentativa 2 - Payload COM family_name', {
      category_id: retryPayload.category_id,
      family_name: retryPayload.family_name,
      title: retryPayload.title?.substring(0, 50),
      payload_keys: Object.keys(retryPayload),
      attributes_ids: (retryPayload.attributes || []).map((a: any) => a.id)
    });

    // Guardar payload enviado
    lastPayloadSent = { ...retryPayload };

    createResponse = await fetch(CREATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(retryPayload),
    });

    createData = await createResponse.json();
    lastApiResponse = createData;
    result.retry_info.retry_count = 2;

    addLog('📡 [MERCADOLIVRE] Resposta da tentativa 2', {
      status: createResponse.status,
      ok: createResponse.ok,
      has_id: !!createData?.id,
      error: createData?.error,
      message: createData?.message
    });

    if (createResponse.ok) {
      addLog('✅ [MERCADOLIVRE] Anúncio criado com sucesso no retry', {
        item_id: createData.id,
        retry_count: 2,
        family_name_used: familyNameValue
      });
      
      result.success = true;
      result.item_id = createData.id;
      result.permalink = createData.permalink;
      result.retry_info.success_on_retry = true;
      result.execution_logs = executionLogs;
      result.last_payload_sent = lastPayloadSent;
      result.last_api_response = lastApiResponse;
      return result;
    }

    // Log detalhado do erro no retry
    addLog('❌ [MERCADOLIVRE] Erro na tentativa 2 (retry)', {
      status: createResponse.status,
      error_code: createData?.error,
      message: createData?.message,
      cause: createData?.cause,
      full_error: createData
    });
  }

  // ============================================
  // TRATAR ERRO FINAL
  // ============================================
  const errorMessage = createData?.message || createData?.error || "Erro desconhecido";
  const errorCause = createData?.cause || [];

  let errorCode = "CREATE_FAILED";
  if (errorCause.some((c: any) => c.code?.includes("title"))) {
    errorCode = "TITLE_BLOCKED_BY_CATALOG";
  } else if (createResponse.status === 401) {
    errorCode = "AUTH_EXPIRED";
  } else if (createResponse.status === 403) {
    errorCode = "ACCESS_DENIED";
  }

  addLog('🛑 [MERCADOLIVRE] Erro final', {
    error_code: errorCode,
    message: errorMessage,
    api_status: createResponse.status,
    retry_count: result.retry_info.retry_count
  });

  result.error = errorMessage;
  result.error_code = errorCode;
  result.api_status = createResponse.status;
  result.api_error = createData;
  result.execution_logs = executionLogs;
  result.last_payload_sent = lastPayloadSent;
  result.last_api_response = lastApiResponse;

  return result;
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Log de início da requisição
  console.log('🔵 [ANTI-CATALOG-V3] Nova requisição recebida');

  try {
    // Autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log('❌ [ANTI-CATALOG-V3] Sem header de autorização');
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado", execution_logs: ['Sem header de autorização'] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      console.log('❌ [ANTI-CATALOG-V3] Token inválido:', userError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Token inválido", execution_logs: [`Token inválido: ${userError?.message}`] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    console.log('✅ [ANTI-CATALOG-V3] Usuário autenticado:', userId);

    // Parse body
    const body = await req.json();
    const {
      ml_account_id,
      source_item_id,
      category_id,
      currency_id,
      payload,
    } = body;

    console.log('📦 [ANTI-CATALOG-V3] Dados recebidos:', {
      ml_account_id,
      source_item_id,
      category_id,
      has_payload: !!payload
    });

    if (!ml_account_id || !payload) {
      console.log('❌ [ANTI-CATALOG-V3] Parâmetros faltando');
      return new Response(
        JSON.stringify({ success: false, error: "Parâmetros obrigatórios faltando", execution_logs: ['ml_account_id ou payload faltando'] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar token ML
    console.log("[ANTI-CATALOG-V3] Looking up ML account:", ml_account_id, "for user:", userId);
    
    const { data: account, error: accError } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, access_token, refresh_token, token_expires_at, connection_status")
      .eq("id", ml_account_id)
      .eq("user_id", userId)
      .single();

    console.log("[ANTI-CATALOG-V3] Account lookup result:", { 
      found: !!account, 
      error: accError?.message,
      hasToken: !!account?.access_token,
      status: account?.connection_status 
    });

    if (accError || !account) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Conta ML não encontrada para este usuário",
          error_code: "ACCOUNT_NOT_FOUND",
          debug: { ml_account_id, userId, dbError: accError?.message },
          execution_logs: [`Conta não encontrada: ${accError?.message}`]
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!account.access_token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Conta ML não possui token de acesso. Por favor, reconecte a conta.",
          error_code: "NO_ACCESS_TOKEN",
          execution_logs: ['Conta sem access_token']
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se o token está expirado e tentar refresh
    let accessToken = account.access_token;
    const expiresAt = account.token_expires_at ? new Date(account.token_expires_at) : null;
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt && expiresAt < fiveMinutesFromNow) {
      console.log("[ANTI-CATALOG-V3] Token expired or expiring soon, attempting refresh...");
      
      if (!account.refresh_token) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Token expirado e não há refresh token. Por favor, reconecte a conta.",
            error_code: "AUTH_EXPIRED",
            execution_logs: ['Token expirado sem refresh_token']
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Tentar refresh do token
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
          console.error("[ANTI-CATALOG-V3] Token refresh failed:", tokenResponse.status, errorText);
          
          // Marcar conta como revogada
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

          return new Response(
            JSON.stringify({
              success: false,
              error: "Token expirado e refresh falhou. Por favor, reconecte a conta.",
              error_code: "AUTH_EXPIRED",
              execution_logs: [`Refresh falhou: ${tokenResponse.status} - ${errorText}`]
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const tokenData = await tokenResponse.json();
        const newExpiresAt = new Date();
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + tokenData.expires_in);

        // Atualizar tokens no banco
        await supabase
          .from("ml_accounts")
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: newExpiresAt.toISOString(),
            connection_status: "connected",
            is_active: true,
            last_token_refresh_at: now.toISOString(),
            last_api_ok_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", ml_account_id);

        accessToken = tokenData.access_token;
        console.log("[ANTI-CATALOG-V3] Token refreshed successfully");
      } catch (refreshError: any) {
        console.error("[ANTI-CATALOG-V3] Token refresh error:", refreshError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Erro ao renovar token. Por favor, reconecte a conta.",
            error_code: "REFRESH_ERROR",
            execution_logs: [`Erro no refresh: ${refreshError.message}`]
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ============================================
    // MONTAR PAYLOAD ANTI-CATÁLOGO
    // ============================================
    console.log('🔧 [ANTI-CATALOG-V3] Montando payload anti-catálogo');

    // Filtrar atributos seguros
    const safeAttributes = filterSafeAttributes(payload.attributes || []);

    // Montar dimensões de envio
    const sellerPackageAttrs: any[] = [];
    if (payload.package_height > 0) {
      sellerPackageAttrs.push({
        id: "SELLER_PACKAGE_HEIGHT",
        value_name: String(payload.package_height),
      });
    }
    if (payload.package_width > 0) {
      sellerPackageAttrs.push({
        id: "SELLER_PACKAGE_WIDTH",
        value_name: String(payload.package_width),
      });
    }
    if (payload.package_length > 0) {
      sellerPackageAttrs.push({
        id: "SELLER_PACKAGE_LENGTH",
        value_name: String(payload.package_length),
      });
    }
    if (payload.package_weight > 0) {
      sellerPackageAttrs.push({
        id: "SELLER_PACKAGE_WEIGHT",
        value_name: String(payload.package_weight),
      });
    }

    // Combinar atributos
    const finalAttributes = [...safeAttributes, ...sellerPackageAttrs];

    // Payload base (SEM campos proibidos, SEM family_name inicial)
    const itemPayload: Record<string, any> = {
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

    // Adicionar descrição se existir
    if (payload.description) {
      itemPayload.description = { plain_text: payload.description };
    }

    // Remover qualquer campo proibido que possa ter vazado
    for (const field of FORBIDDEN_BODY_FIELDS) {
      delete itemPayload[field];
    }

    console.log('📋 [ANTI-CATALOG-V3] Payload montado:', {
      title: itemPayload.title?.substring(0, 50),
      category_id: itemPayload.category_id,
      price: itemPayload.price,
      attributes_count: finalAttributes.length,
      safe_attributes_count: safeAttributes.length,
      seller_package_attrs_count: sellerPackageAttrs.length
    });

    // ============================================
    // EXECUTAR CRIAÇÃO COM RETRY AUTOMÁTICO
    // ============================================
    const createResult = await createItemWithFamilyNameRetry(
      itemPayload,
      category_id,
      accessToken,
      payload.title
    );

    console.log('🏁 [ANTI-CATALOG-V3] Resultado final:', {
      success: createResult.success,
      item_id: createResult.item_id,
      error_code: createResult.error_code,
      retry_count: createResult.retry_info.retry_count,
      logs_count: createResult.execution_logs.length
    });

    // Retornar resultado
    return new Response(
      JSON.stringify(createResult),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[ANTI-CATALOG-V3] Unexpected error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Erro interno",
        error_code: "INTERNAL_ERROR",
        execution_logs: [`Erro interno: ${error.message}`, error.stack || '']
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
