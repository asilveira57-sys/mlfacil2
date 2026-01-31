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
  };

  // Verificar se já sabemos que essa categoria exige family_name
  if (familyNameRequiredCache.get(categoryId)) {
    console.log(`[ANTI-CATALOG-V3] Category ${categoryId} known to require family_name, adding preemptively`);
    const familyNameData = await getFamilyName(categoryId, accessToken);
    const familyNameValue = familyNameData.value || deriveFamilyNameFromTitle(title);
    itemPayload.family_name = familyNameValue;
    result.diagnostic.family_name_included = true;
    result.diagnostic.family_name_source = familyNameData.source || "title_fallback";
    result.diagnostic.family_name_value = familyNameValue;
    result.diagnostic.payload_keys_sent = Object.keys(itemPayload);
  }

  console.log("[ANTI-CATALOG-V3] First attempt payload keys:", Object.keys(itemPayload));
  console.log("[ANTI-CATALOG-V3] First attempt payload:", JSON.stringify(itemPayload, null, 2));

  // ============================================
  // PRIMEIRA TENTATIVA
  // ============================================
  let createResponse = await fetch(CREATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(itemPayload),
  });

  let createData = await createResponse.json();
  result.retry_info.retry_count = 1;

  console.log("[ANTI-CATALOG-V3] First attempt response:", createResponse.status, JSON.stringify(createData));

  // Se sucesso na primeira tentativa
  if (createResponse.ok) {
    result.success = true;
    result.item_id = createData.id;
    result.permalink = createData.permalink;
    return result;
  }

  // ============================================
  // VERIFICAR SE PRECISA DE RETRY POR family_name
  // ============================================
  if (isRequiredFieldsError(createData, "family_name") && !result.diagnostic.family_name_included) {
    console.log("[ANTI-CATALOG-V3] API requires family_name, initiating retry...");
    
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
      console.warn(`[ANTI-CATALOG-V3] WARNING: Using title fallback for family_name: "${familyNameValue}"`);
    }

    // Atualizar diagnóstico
    result.diagnostic.family_name_included = true;
    result.diagnostic.family_name_source = familyNameSource;
    result.diagnostic.family_name_value = familyNameValue;

    // Criar payload de retry COM family_name no nível raiz
    const retryPayload = {
      ...itemPayload,
      family_name: familyNameValue,
    };

    result.diagnostic.payload_keys_sent = Object.keys(retryPayload);

    console.log("[ANTI-CATALOG-V3] Retry payload with family_name:", JSON.stringify(retryPayload, null, 2));

    // ============================================
    // SEGUNDA TENTATIVA (RETRY)
    // ============================================
    createResponse = await fetch(CREATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(retryPayload),
    });

    createData = await createResponse.json();
    result.retry_info.retry_count = 2;

    console.log("[ANTI-CATALOG-V3] Retry response:", createResponse.status, JSON.stringify(createData));

    if (createResponse.ok) {
      result.success = true;
      result.item_id = createData.id;
      result.permalink = createData.permalink;
      result.retry_info.success_on_retry = true;
      return result;
    }
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

  result.error = errorMessage;
  result.error_code = errorCode;
  result.api_status = createResponse.status;
  result.api_error = createData;

  console.log("[ANTI-CATALOG-V3] Final error:", errorCode, errorMessage);

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

  try {
    // Autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // Parse body
    const body = await req.json();
    const {
      ml_account_id,
      source_item_id,
      category_id,
      currency_id,
      payload,
    } = body;

    if (!ml_account_id || !payload) {
      return new Response(
        JSON.stringify({ success: false, error: "Parâmetros obrigatórios faltando" }),
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
          debug: { ml_account_id, userId, dbError: accError?.message }
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
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ============================================
    // MONTAR PAYLOAD ANTI-CATÁLOGO
    // ============================================

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

    // ============================================
    // EXECUTAR CRIAÇÃO COM RETRY AUTOMÁTICO
    // ============================================
    const createResult = await createItemWithFamilyNameRetry(
      itemPayload,
      category_id,
      accessToken,
      payload.title
    );

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
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
