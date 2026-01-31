import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExecuteActionRequest {
  action_id: string;
  confirm?: boolean;
}

// ============================================================================
// CACHE DE ATRIBUTOS POR CATEGORIA (em memória, TTL 24h)
// Chave: required_attrs:{categoryId}
// ============================================================================
interface CategoryAttributeCache {
  attributes: CategoryAttribute[];
  requiredIds: string[];
  requiredWithAllowedValues: Map<string, Array<{ id: string; name: string }>>;
  fetchedAt: number;
}

interface CategoryAttribute {
  id: string;
  name: string;
  value_type: string;
  tags?: { required?: boolean; catalog_required?: boolean };
  values?: Array<{ id: string; name: string }>;
  allowed_units?: Array<{ id: string; name: string }>;
}

const categoryAttributesCache = new Map<string, CategoryAttributeCache>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// DEFAULTS DE ATRIBUTOS POR CATEGORIA (tabela interna)
// Chave: (categoryId, attrId) → value_id ou value_name
// ============================================================================
const CATEGORY_ATTRIBUTE_DEFAULTS: Record<string, Record<string, { value_name?: string; value_id?: string }>> = {
  // Defaults genéricos aplicáveis a múltiplas categorias
  "*": {
    "FAMILY_NAME": { value_name: "Produto genérico" },
    "IS_FLAMMABLE": { value_name: "Não" },
    "IS_FRAGILE": { value_name: "Não" },
    "HAS_FRAGRANCE": { value_name: "Não" },
    "CONTAINS_LATEX": { value_name: "Não" },
  },
  // Defaults específicos por categoria (expandir via Admin futuramente)
  "MLB1051": { "FAMILY_NAME": { value_name: "Etiquetas adesivas" } },
  "MLB1684": { "FAMILY_NAME": { value_name: "Etiquetas impressas" } },
  "MLB1953": { "FAMILY_NAME": { value_name: "Impressoras térmicas" } },
};

// ============================================================================
// BODY-LEVEL REQUIRED FIELDS: Campos obrigatórios no body raiz, NÃO em attributes[]
// A API exige que esses campos estejam no root do JSON payload
// ============================================================================
const BODY_LEVEL_REQUIRED_FIELDS: Record<string, { 
  fallbackFromTitle?: boolean;
  defaultValue?: string;
  maxLength?: number;
}> = {
  family_name: { fallbackFromTitle: true, maxLength: 60 },
  // Adicionar outros campos body-level conforme descobertos
};

// Lista de alias (case-insensitive) para cada campo body-level
const BODY_LEVEL_FIELD_ALIASES: Record<string, string[]> = {
  family_name: ["family_name", "FAMILY_NAME"],
};

// Set para lookup rápido (incluindo aliases)
const BODY_LEVEL_FIELDS = new Set<string>(
  Object.values(BODY_LEVEL_FIELD_ALIASES).flat()
);

// Whitelist de campos permitidos no body raiz (sanitizer)
const ALLOWED_BODY_FIELDS = new Set([
  "title", "category_id", "currency_id", "listing_type_id", "condition",
  "pictures", "price", "available_quantity", "attributes", "description",
  "buying_mode", "sale_terms", "shipping", "variations",
  // Para catálogo
  "catalog_product_id",
  // Body-level fields (adicionados dinamicamente)
  "family_name",
]);

// listing_type_id que exigem pictures - não usar em catálogo com pictures bloqueadas
const LISTING_TYPES_REQUIRING_PICTURES = new Set([
  "gold_special",
  "gold_pro",
  "gold",
  "silver",
]);

// listing_type_id seguros para catálogo (não exigem pictures)
const CATALOG_SAFE_LISTING_TYPES = ["free", "bronze"];

// ============================================================================
// DEFAULT LISTING TYPE + FALLBACK STRATEGY
// Quando listing_type_id falha, tenta fallbacks sequencialmente
// REGRA: Nunca usar "free" como default - sempre "gold_special"
// ============================================================================
const DEFAULT_LISTING_TYPE_ID = "gold_special";
const DEFAULT_LISTING_TYPE_FALLBACKS = ["gold_pro", "silver", "bronze"];

// Cache de listing_type_id por categoria (chave: category_id → último tipo que funcionou)
const listingTypeCacheByCategory = new Map<string, string>();

interface ListingTypeResolution {
  listing_type_id: string;
  source: "source_item" | "default" | "fallback" | "cache" | "api_suggested";
  fallback_index?: number;
  suggested_types?: string[];
}

/**
 * extractSuggestedListingTypes - Extrai tipos sugeridos da mensagem de erro da API
 * Exemplo de erro: "Listing type free is not available... You can still post with [gold_pro, gold_special]"
 */
function extractSuggestedListingTypes(apiError: any): string[] {
  const suggestedTypes: string[] = [];
  
  if (!apiError) return suggestedTypes;
  
  // Verificar no cause[]
  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      // Verificar código específico
      if (cause.code === "item.listing_type_id.unavailable" || 
          cause.code?.includes("listing_type")) {
        // Extrair da message: "[gold_pro, gold_special]"
        const match = cause.message?.match(/\[([^\]]+)\]/);
        if (match) {
          const types = match[1].split(",").map((t: string) => t.trim().toLowerCase());
          suggestedTypes.push(...types);
        }
      }
    }
  }
  
  // Verificar na message principal
  if (apiError.message) {
    const match = apiError.message.match(/\[([^\]]+)\]/);
    if (match) {
      const types = match[1].split(",").map((t: string) => t.trim().toLowerCase());
      // Evitar duplicatas
      for (const t of types) {
        if (!suggestedTypes.includes(t)) {
          suggestedTypes.push(t);
        }
      }
    }
  }
  
  console.log(`[ad-action-execute] Extracted suggested listing types: ${suggestedTypes.join(", ") || "(none)"}`);
  return suggestedTypes;
}

/**
 * isListingTypeUnavailableError - Verifica se é erro de listing_type_id.unavailable
 */
function isListingTypeUnavailableError(apiError: any): boolean {
  if (!apiError) return false;

  // Verificar no cause[]
  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      if (cause.code === "item.listing_type_id.unavailable") {
        return true;
      }
    }
  }

  // Verificar na message principal
  if (apiError.message) {
    const msg = apiError.message.toLowerCase();
    if (msg.includes("listing type") && msg.includes("not available")) {
      return true;
    }
  }

  return false;
}

/**
 * resolveListingTypeId - Resolve o listing_type_id com estratégia de fallback
 * PRIORIDADE:
 *   1. Cache da categoria (último tipo que funcionou)
 *   2. Item fonte (se disponível e não é "free")
 *   3. Default do sistema (gold_special)
 *   4. Fallback guiado pela API (se erro ocorreu)
 * 
 * @param sourceListingType - listing_type_id do item fonte (pode ser undefined)
 * @param categoryId - ID da categoria (para cache)
 * @param defaultType - tipo padrão do sistema (gold_special)
 * @param suggestedTypes - tipos sugeridos pela API após erro (ex: [gold_pro, gold_special])
 * @param fallbackIndex - índice do fallback a usar
 */
function resolveListingTypeId(
  sourceListingType: string | undefined,
  categoryId?: string,
  defaultType: string = DEFAULT_LISTING_TYPE_ID,
  suggestedTypes: string[] = [],
  fallbackIndex: number = -1
): ListingTypeResolution {
  // =========================================================================
  // FALLBACK GUIADO PELA API: Usar tipos sugeridos após erro
  // =========================================================================
  if (fallbackIndex >= 0 && suggestedTypes.length > 0) {
    // Priorizar gold_special > gold_pro > resto
    const prioritizedSuggested = [
      ...suggestedTypes.filter(t => t === "gold_special"),
      ...suggestedTypes.filter(t => t === "gold_pro"),
      ...suggestedTypes.filter(t => t !== "gold_special" && t !== "gold_pro"),
    ];
    
    if (fallbackIndex < prioritizedSuggested.length) {
      const selectedType = prioritizedSuggested[fallbackIndex];
      console.log(`[ad-action-execute] FALLBACK: Using API-suggested type [${fallbackIndex}]: ${selectedType}`);
      return {
        listing_type_id: selectedType,
        source: "api_suggested",
        fallback_index: fallbackIndex,
        suggested_types: prioritizedSuggested,
      };
    }
  }

  // Fallback usando lista padrão (se não houver tipos sugeridos)
  if (fallbackIndex >= 0 && fallbackIndex < DEFAULT_LISTING_TYPE_FALLBACKS.length) {
    return {
      listing_type_id: DEFAULT_LISTING_TYPE_FALLBACKS[fallbackIndex],
      source: "fallback",
      fallback_index: fallbackIndex,
    };
  }

  // =========================================================================
  // CACHE DA CATEGORIA: Usar último tipo que funcionou
  // =========================================================================
  if (categoryId) {
    const cachedType = listingTypeCacheByCategory.get(categoryId);
    if (cachedType) {
      console.log(`[ad-action-execute] CACHE HIT: Using cached listing_type_id for category ${categoryId}: ${cachedType}`);
      return {
        listing_type_id: cachedType,
        source: "cache",
      };
    }
  }

  // =========================================================================
  // ITEM FONTE: Usar se disponível e não for "free"
  // REGRA: Nunca usar "free" como default - evitar erro "unavailable"
  // =========================================================================
  if (sourceListingType && sourceListingType.trim() && sourceListingType.trim().toLowerCase() !== "free") {
    return {
      listing_type_id: sourceListingType.trim(),
      source: "source_item",
    };
  }

  // Se fonte é "free", usar default do sistema (gold_special)
  if (sourceListingType && sourceListingType.trim().toLowerCase() === "free") {
    console.log(`[ad-action-execute] Source listing_type is "free" - using default ${defaultType} instead`);
  }

  // =========================================================================
  // DEFAULT DO SISTEMA: gold_special (configurável via Admin futuro)
  // =========================================================================
  return {
    listing_type_id: defaultType,
    source: "default",
  };
}

/**
 * saveListingTypeCacheForCategory - Salva o listing_type_id que funcionou para a categoria
 */
function saveListingTypeCacheForCategory(categoryId: string, listingTypeId: string): void {
  if (!categoryId || !listingTypeId) return;
  listingTypeCacheByCategory.set(categoryId, listingTypeId);
  console.log(`[ad-action-execute] CACHE SAVE: category ${categoryId} → ${listingTypeId}`);
}

/**
 * isListingTypeError - Verifica se o erro da API é relacionado a listing_type_id
 */
function isListingTypeError(apiError: any): boolean {
  if (!apiError) return false;

  // Verificar no cause[]
  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      if (
        cause.code === "body.required_fields" ||
        cause.code === "item.invalid_listing_type" ||
        cause.code?.includes("listing_type") ||
        (cause.message && cause.message.toLowerCase().includes("listing_type"))
      ) {
        // Verificar se menciona listing_type_id especificamente
        if (
          cause.message?.includes("listing_type_id") ||
          cause.references?.includes("listing_type_id")
        ) {
          return true;
        }
      }
    }
  }

  // Verificar na message principal
  if (apiError.message) {
    const msg = apiError.message.toLowerCase();
    if (msg.includes("listing_type_id") && (msg.includes("required") || msg.includes("invalid"))) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// REGRA OFICIAL DE RESOLUÇÃO:
// 1. PRIORIDADE MÁXIMA: item_id já é MLB → usar direto
// 2. MLBU é apenas camada de apresentação - fallback residual
// ============================================================================

function isCatalogId(id: string): boolean {
  return /^MLBU/i.test((id || "").trim());
}

function isRegularItemId(id: string): boolean {
  return /^MLB\d+$/i.test((id || "").trim());
}

type ResolveCatalogResult = {
  ok: true;
  itemId: string;
  productData?: any;
  resolvedBy: "products:MLBU";
} | {
  ok: false;
  error: string;
  productData?: any;
  userGuidance: string;
  tried: Array<{ productId: string; status?: number; body?: string }>;
};

async function resolveCatalogItemFallback(
  accessToken: string,
  catalogIdRaw: string
): Promise<ResolveCatalogResult> {
  const catalogId = (catalogIdRaw || "").trim();
  const tried: Array<{ productId: string; status?: number; body?: string }> = [];

  console.log(`[ad-action-execute] FALLBACK: Attempting catalog resolution for ${catalogId}`);

  const res = await fetch(`https://api.mercadolibre.com/products/${catalogId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.ok) {
    const product = await res.json();
    if (!product?.buy_box_winner?.item_id) {
      return {
        ok: false,
        error: "Catálogo sem vendedor ativo",
        userGuidance: "Este produto está em catálogo, mas não possui um vendedor ativo no momento. Cole o link de um anúncio específico (MLB) para continuar.",
        productData: product,
        tried: [{ productId: catalogId, status: res.status }],
      };
    }

    const realItemId = product.buy_box_winner.item_id;
    console.log(`[ad-action-execute] buy_box_winner.item_id resolved: ${realItemId}`);
    return {
      ok: true,
      itemId: realItemId,
      productData: product,
      resolvedBy: "products:MLBU",
    };
  } else {
    const body = await res.text().catch(() => "");
    tried.push({ productId: catalogId, status: res.status, body });
  }

  return {
    ok: false,
    error: `Produto de catálogo não encontrado (${catalogId})`,
    userGuidance: "A clonagem funciona a partir do anúncio base (MLB). Links públicos de catálogo podem exigir o link do anúncio do vendedor.",
    tried,
  };
}

// ============================================================================
// ETAPA 2: CategoryRequiredResolver - Descobrir obrigatórios da categoria
// ============================================================================
interface CategoryRequiredInfo {
  attributes: CategoryAttribute[];
  requiredIds: string[];
  requiredWithAllowedValues: Map<string, Array<{ id: string; name: string }>>;
}

async function fetchCategoryRequiredAttributes(
  accessToken: string,
  categoryId: string
): Promise<CategoryRequiredInfo> {
  // 2.1 Verificar cache
  const cached = categoryAttributesCache.get(categoryId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.log(`[ad-action-execute] Category ${categoryId}: using cached attributes (${cached.requiredIds.length} required)`);
    return { 
      attributes: cached.attributes, 
      requiredIds: cached.requiredIds,
      requiredWithAllowedValues: cached.requiredWithAllowedValues,
    };
  }

  // 2.2 Buscar da API - fonte de verdade
  console.log(`[ad-action-execute] Category ${categoryId}: fetching attributes from ML API`);
  
  const response = await fetch(
    `https://api.mercadolibre.com/categories/${categoryId}/attributes`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    console.warn(`[ad-action-execute] Failed to fetch category attributes: ${response.status}`);
    return { attributes: [], requiredIds: [], requiredWithAllowedValues: new Map() };
  }

  const allAttributes: CategoryAttribute[] = await response.json();
  
  // Filtrar obrigatórios e mapear valores permitidos
  const requiredIds: string[] = [];
  const requiredWithAllowedValues = new Map<string, Array<{ id: string; name: string }>>();

  for (const attr of allAttributes) {
    if (attr.tags?.required === true || attr.tags?.catalog_required === true) {
      requiredIds.push(attr.id);
      if (attr.values && attr.values.length > 0) {
        requiredWithAllowedValues.set(attr.id, attr.values);
      }
    }
  }

  console.log(`[ad-action-execute] Category ${categoryId}: found ${allAttributes.length} total, ${requiredIds.length} required`);
  console.log(`[ad-action-execute] Required IDs: ${requiredIds.join(", ") || "(none)"}`);

  // Guardar em cache
  categoryAttributesCache.set(categoryId, {
    attributes: allAttributes,
    requiredIds,
    requiredWithAllowedValues,
    fetchedAt: Date.now(),
  });

  return { attributes: allAttributes, requiredIds, requiredWithAllowedValues };
}

// ============================================================================
// ETAPA 3: Normalizar atributos atuais do payload
// ============================================================================
interface NormalizedAttribute {
  id: string;
  value_id?: string;
  value_name?: string;
  value_struct?: any;
}

// ============================================================================
// ATRIBUTOS PROIBIDOS EM CLONE "NORMAL" (forçam vinculação a catálogo)
// Se estes atributos forem enviados, a API do ML bloqueia a edição de título/fotos
// e retorna "body.invalid_fields" para title
// ============================================================================
const CATALOG_FORCING_ATTRIBUTES = new Set([
  "GTIN",
  "EAN",
  "UPC",
  "ISBN",
  "MPN", // Manufacturer Part Number também pode forçar catálogo
]);

// ============================================================================
// HELPER: Detecta erro 401 (token expirado/inválido)
// ============================================================================
function is401Error(response: Response): boolean {
  return response.status === 401;
}

// ============================================================================
// HELPER: Detecta erro body.invalid_fields para title
// ============================================================================
function isTitleInvalidFieldsError(apiError: any): boolean {
  if (!apiError) return false;
  
  // Verificar no cause[]
  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      if (cause.code === "body.invalid_fields" || cause.code === "item.title.invalid") {
        if (cause.message?.toLowerCase().includes("title")) {
          return true;
        }
      }
    }
  }
  
  // Verificar na message principal
  if (apiError.message) {
    const msg = apiError.message.toLowerCase();
    if (msg.includes("body.invalid_fields") && msg.includes("title")) {
      return true;
    }
    if (msg.includes("fields [title] are invalid")) {
      return true;
    }
  }
  
  return false;
}

// ============================================================================
// HELPER: Extrai campos inválidos de body.invalid_fields
// ============================================================================
function extractInvalidFields(apiError: any): string[] {
  const invalidFields: string[] = [];
  if (!apiError) return invalidFields;
  
  // Padrão: "The fields [title] are invalid"
  const msgMatch = apiError.message?.match(/fields \[([^\]]+)\]/i);
  if (msgMatch) {
    const fields = msgMatch[1].split(",").map((f: string) => f.trim().toLowerCase());
    invalidFields.push(...fields);
  }
  
  // Verificar no cause[]
  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      const causeMatch = cause.message?.match(/fields \[([^\]]+)\]/i);
      if (causeMatch) {
        const fields = causeMatch[1].split(",").map((f: string) => f.trim().toLowerCase());
        for (const f of fields) {
          if (!invalidFields.includes(f)) invalidFields.push(f);
        }
      }
    }
  }
  
  return invalidFields;
}

// ============================================================================
// HELPER: Tentar refresh do token de acesso
// ============================================================================
async function tryRefreshToken(
  supabase: any,
  mlAccountId: string
): Promise<{ success: boolean; newAccessToken?: string; error?: string }> {
  try {
    console.log(`[ad-action-execute] Attempting token refresh for account ${mlAccountId}`);
    
    // Buscar refresh_token
    const { data: account, error: fetchError } = await supabase
      .from("ml_accounts")
      .select("refresh_token, ml_user_id")
      .eq("id", mlAccountId)
      .single();
    
    if (fetchError || !account?.refresh_token) {
      console.error(`[ad-action-execute] No refresh_token available for account ${mlAccountId}`);
      return { success: false, error: "NO_REFRESH_TOKEN" };
    }
    
    // Chamar API do ML para refresh
    const ML_APP_ID = Deno.env.get("ML_APP_ID") || "";
    const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET") || "";
    
    if (!ML_APP_ID || !ML_CLIENT_SECRET) {
      console.error(`[ad-action-execute] ML_APP_ID or ML_CLIENT_SECRET not configured`);
      return { success: false, error: "ML_CREDENTIALS_NOT_CONFIGURED" };
    }
    
    const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ML_APP_ID,
        client_secret: ML_CLIENT_SECRET,
        refresh_token: account.refresh_token,
      }),
    });
    
    if (!refreshResponse.ok) {
      const errBody = await refreshResponse.text().catch(() => "");
      console.error(`[ad-action-execute] Token refresh failed: ${refreshResponse.status} - ${errBody}`);
      return { success: false, error: "REFRESH_FAILED" };
    }
    
    const tokenData = await refreshResponse.json();
    
    // Atualizar tokens no banco
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    const { error: updateError } = await supabase
      .from("ml_accounts")
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || account.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mlAccountId);
    
    if (updateError) {
      console.error(`[ad-action-execute] Failed to save refreshed token: ${updateError.message}`);
      return { success: false, error: "TOKEN_SAVE_FAILED" };
    }
    
    console.log(`[ad-action-execute] Token refreshed successfully for account ${mlAccountId}`);
    return { success: true, newAccessToken: tokenData.access_token };
  } catch (err: any) {
    console.error(`[ad-action-execute] Token refresh exception: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// GUARD DE AUTENTICAÇÃO: Validar e renovar token ANTES de qualquer operação
// Retorna token válido ou erro de reconexão
// ============================================================================
interface TokenValidationResult {
  valid: boolean;
  accessToken?: string;
  error?: string;
  requires_reconnection?: boolean;
}

async function validateAndRefreshTokenIfNeeded(
  accessToken: string,
  supabase: any,
  mlAccountId: string
): Promise<TokenValidationResult> {
  // 1. Testar token atual com chamada leve (GET /users/me)
  console.log(`[ad-action-execute] AUTH GUARD: Testing token validity...`);
  
  const testResponse = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  // 2. Se token válido, retornar sucesso imediato
  if (testResponse.ok) {
    console.log(`[ad-action-execute] AUTH GUARD: Token is valid`);
    return { valid: true, accessToken };
  }
  
  // 3. Se não for 401, é outro tipo de erro (rede, etc)
  if (testResponse.status !== 401) {
    console.warn(`[ad-action-execute] AUTH GUARD: Unexpected status ${testResponse.status}`);
    // Continuar tentando usar o token
    return { valid: true, accessToken };
  }
  
  // 4. Token inválido (401) - tentar refresh UMA VEZ
  console.warn(`[ad-action-execute] AUTH GUARD: Token invalid (401) - attempting refresh...`);
  
  const refreshResult = await tryRefreshToken(supabase, mlAccountId);
  
  if (refreshResult.success && refreshResult.newAccessToken) {
    console.log(`[ad-action-execute] AUTH GUARD: Token refreshed successfully`);
    return { valid: true, accessToken: refreshResult.newAccessToken };
  }
  
  // 5. Refresh falhou - exigir reconexão
  console.error(`[ad-action-execute] AUTH GUARD: Token refresh failed - reconnection required`);
  return {
    valid: false,
    error: "AUTH_EXPIRED",
    requires_reconnection: true,
  };
}

function normalizeAndCleanAttributes(
  sourceAttributes: any[],
  categoryAttributes: CategoryAttribute[],
  removeNotModifiable: boolean = true,
  createAsNormal: boolean = true // NOVO: se true, remove atributos que forçam catálogo
): { attrsById: Map<string, NormalizedAttribute>; cleanedAttrs: NormalizedAttribute[]; removedNotModifiable: string[]; removedCatalogForcing: string[] } {
  const attrsById = new Map<string, NormalizedAttribute>();
  const cleanedAttrs: NormalizedAttribute[] = [];
  const removedNotModifiable: string[] = [];
  const removedCatalogForcing: string[] = [];

  // Criar mapa de tipos esperados
  const typeById = new Map<string, string>();
  const tagsById = new Map<string, any>();
  for (const catAttr of categoryAttributes) {
    typeById.set(catAttr.id, catAttr.value_type);
    tagsById.set(catAttr.id, catAttr.tags || {});
  }

  for (const attr of sourceAttributes || []) {
    if (!attr?.id) continue;

    const attrIdUpper = attr.id.toUpperCase();

    // REGRA CRÍTICA: Ao criar como anúncio normal, REMOVER atributos que forçam catálogo
    // Isso evita o erro "body.invalid_fields" para title
    if (createAsNormal && CATALOG_FORCING_ATTRIBUTES.has(attrIdUpper)) {
      console.log(`[ad-action-execute] Attr ${attr.id}: REMOVED (forces catalog binding in normal clone)`);
      removedCatalogForcing.push(attr.id);
      continue;
    }

    // Verificar se o atributo é "not modifiable" (read-only) - remover para reduzir warnings
    if (removeNotModifiable) {
      const attrTags = tagsById.get(attr.id) || {};
      // Atributos com read_only ou variation_attribute não devem ser copiados
      if (attrTags.read_only === true || attrTags.hidden === true) {
        console.log(`[ad-action-execute] Attr ${attr.id}: skipped (not modifiable/hidden)`);
        removedNotModifiable.push(attr.id);
        continue;
      }
    }

    // 3.1 Limpar atributos inválidos
    const hasValidValue = 
      (attr.value_name && attr.value_name.trim() !== "") ||
      attr.value_id ||
      attr.value_struct;

    if (!hasValidValue) {
      console.log(`[ad-action-execute] Attr ${attr.id}: skipped (empty value)`);
      continue;
    }

    // Verificar tipo numérico sem valor
    const expectedType = typeById.get(attr.id);
    if (expectedType === "number" || expectedType === "number_unit") {
      if (!attr.value_struct?.number && !attr.value_name) {
        console.log(`[ad-action-execute] Attr ${attr.id}: skipped (numeric without value)`);
        continue;
      }
    }

    const normalized: NormalizedAttribute = {
      id: attr.id,
      value_id: attr.value_id,
      value_name: attr.value_name,
      value_struct: attr.value_struct,
    };

    // 3.2 Evitar duplicados por id (manter o último/mais completo)
    if (!attrsById.has(attr.id)) {
      attrsById.set(attr.id, normalized);
      cleanedAttrs.push(normalized);
    }
  }

  console.log(`[ad-action-execute] Normalized ${cleanedAttrs.length} valid attributes from source (removed ${removedNotModifiable.length} not-modifiable, ${removedCatalogForcing.length} catalog-forcing)`);
  return { attrsById, cleanedAttrs, removedNotModifiable, removedCatalogForcing };
}

// ============================================================================
// ETAPA 4: Motor único de preenchimento de campos obrigatórios
// Fluxo: validate → fill → validate (incluindo body-level fields)
// ============================================================================
interface AttributeFillResult {
  filled: NormalizedAttribute[];
  missing: string[];
  bodyLevelFields: Record<string, string>; // Campos que vão no body raiz
  log: Array<{ attrId: string; source: string; value?: string; target: "attributes" | "body" }>;
  requiredBodyFieldKeys: string[]; // Lista de campos body-level que são required
  filledBodyByFallback: string[]; // Campos body preenchidos por fallback
  filledBodyByDefaults: string[]; // Campos body preenchidos por defaults
}

interface FillEngineInput {
  requiredIds: string[]; // IDs de atributos obrigatórios da categoria
  extraBodyFields?: string[]; // Campos body-level adicionais (ex: extraídos do erro da API)
  categoryAttributes: CategoryAttribute[];
  sourceAttrsById: Map<string, NormalizedAttribute>;
  itemData: any;
  categoryId: string;
}

/**
 * Motor único de preenchimento - pode ser chamado múltiplas vezes
 * (preflight validation → fill → second validation)
 */
function validateAndFillRequiredAttributes(input: FillEngineInput): AttributeFillResult {
  const { requiredIds, extraBodyFields = [], categoryAttributes, sourceAttrsById, itemData, categoryId } = input;
  
  const filled: NormalizedAttribute[] = [];
  const missing: string[] = [];
  const bodyLevelFields: Record<string, string> = {};
  const log: Array<{ attrId: string; source: string; value?: string; target: "attributes" | "body" }> = [];
  const requiredBodyFieldKeys: string[] = [];
  const filledBodyByFallback: string[] = [];
  const filledBodyByDefaults: string[] = [];

  // Mapa de atributos da categoria para acesso rápido
  const catAttrById = new Map<string, CategoryAttribute>();
  for (const attr of categoryAttributes) {
    catAttrById.set(attr.id, attr);
  }

  // =========================================================================
  // FASE 1: Garantir campos body-level (family_name, etc.)
  // São tratados PRIMEIRO porque a API os exige no root
  // =========================================================================
  const allBodyFieldKeys = new Set<string>([
    ...Object.keys(BODY_LEVEL_REQUIRED_FIELDS),
    ...extraBodyFields.map(f => f.toLowerCase()),
  ]);

  for (const fieldKey of allBodyFieldKeys) {
    requiredBodyFieldKeys.push(fieldKey);
    
    const config = BODY_LEVEL_REQUIRED_FIELDS[fieldKey] || {};
    let resolvedValue: string | undefined;
    let source = "";

    // Tentar buscar do item fonte (body-level pode estar nos attributes também)
    const aliases = BODY_LEVEL_FIELD_ALIASES[fieldKey] || [fieldKey, fieldKey.toUpperCase()];
    for (const alias of aliases) {
      const sourceAttr = sourceAttrsById.get(alias);
      if (sourceAttr?.value_name) {
        resolvedValue = sourceAttr.value_name;
        source = "item_fonte";
        break;
      }
      // Tentar buscar diretamente dos atributos raw do item
      const rawAttr = itemData.attributes?.find((a: any) => a.id === alias);
      if (rawAttr?.value_name) {
        resolvedValue = rawAttr.value_name;
        source = "item_fonte:raw";
        break;
      }
    }

    // Tentar defaults do sistema
    if (!resolvedValue) {
      const categoryDefaults = CATEGORY_ATTRIBUTE_DEFAULTS[categoryId] || {};
      const globalDefaults = CATEGORY_ATTRIBUTE_DEFAULTS["*"] || {};
      for (const alias of aliases) {
        const specificDefault = categoryDefaults[alias];
        const globalDefault = globalDefaults[alias];
        const defaultValue = specificDefault || globalDefault;
        if (defaultValue?.value_name) {
          resolvedValue = defaultValue.value_name;
          source = specificDefault ? "default:categoria" : "default:global";
          filledBodyByDefaults.push(fieldKey);
          break;
        }
      }
    }

    // Fallback dinâmico (baseado em título para family_name)
    if (!resolvedValue && config.fallbackFromTitle && itemData.title) {
      const cleanTitle = itemData.title
        .replace(/\s*[-–]\s*\d+\s*(unidades?|pcs?|un)?\s*$/i, "")
        .replace(/\s*\d{4,}\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      
      const maxLen = config.maxLength || 60;
      let fallbackValue = cleanTitle.split(" ").slice(0, 5).join(" ");
      if (fallbackValue.length > maxLen) {
        fallbackValue = fallbackValue.substring(0, maxLen).replace(/\s+\S*$/, "");
      }
      
      resolvedValue = fallbackValue || itemData.title.split(" ").slice(0, 4).join(" ");
      source = "fallback:titulo_limpo";
      filledBodyByFallback.push(fieldKey);
    }

    // Fallback genérico
    if (!resolvedValue && config.defaultValue) {
      resolvedValue = config.defaultValue;
      source = "fallback:generico";
      filledBodyByFallback.push(fieldKey);
    }

    if (!resolvedValue) {
      resolvedValue = "Produto";
      source = "fallback:ultimo_recurso";
      filledBodyByFallback.push(fieldKey);
    }

    // Aplicar no body
    bodyLevelFields[fieldKey] = resolvedValue;
    log.push({ attrId: fieldKey, source, value: resolvedValue, target: "body" });
    console.log(`[ad-action-execute] Body field ${fieldKey}: ✓ ${source} = "${resolvedValue}"`);
  }

  // =========================================================================
  // FASE 2: Garantir atributos obrigatórios da categoria (attributes[])
  // =========================================================================
  for (const reqId of requiredIds) {
    // Ignorar se já tratado como body-level
    if (BODY_LEVEL_FIELDS.has(reqId) || BODY_LEVEL_FIELDS.has(reqId.toLowerCase())) {
      continue;
    }

    const catAttr = catAttrById.get(reqId);
    let resolvedValue: string | undefined;
    let resolvedValueId: string | undefined;
    let source = "";

    // 1. Se já existe no source e tem valor válido
    const sourceAttr = sourceAttrsById.get(reqId);
    if (sourceAttr && (sourceAttr.value_id || sourceAttr.value_name || sourceAttr.value_struct)) {
      resolvedValue = sourceAttr.value_name;
      resolvedValueId = sourceAttr.value_id;
      source = "item_fonte";
    }

    // 2. Copiar do item fonte (atributos raw não processados)
    if (!resolvedValue && !resolvedValueId && itemData.attributes) {
      const itemAttr = itemData.attributes.find((a: any) => a.id === reqId);
      if (itemAttr && (itemAttr.value_name || itemAttr.value_id)) {
        resolvedValue = itemAttr.value_name;
        resolvedValueId = itemAttr.value_id;
        source = "item_fonte:raw";
      }
    }

    // 3. Resolver via defaults do sistema
    if (!resolvedValue && !resolvedValueId) {
      const categoryDefaults = CATEGORY_ATTRIBUTE_DEFAULTS[categoryId] || {};
      const globalDefaults = CATEGORY_ATTRIBUTE_DEFAULTS["*"] || {};
      const specificDefault = categoryDefaults[reqId];
      const globalDefault = globalDefaults[reqId];
      const defaultValue = specificDefault || globalDefault;

      if (defaultValue) {
        resolvedValue = defaultValue.value_name;
        resolvedValueId = defaultValue.value_id;
        source = specificDefault ? "default:categoria" : "default:global";
      }
    }

    // 4. Valores permitidos da categoria (primeiro valor)
    if (!resolvedValue && !resolvedValueId && catAttr?.values && catAttr.values.length > 0) {
      const defaultVal = catAttr.values[0];
      resolvedValueId = defaultVal.id;
      resolvedValue = defaultVal.name;
      source = "categoria:primeiro_valor";
    }

    // 5. Inferências específicas
    if (!resolvedValue && !resolvedValueId && catAttr) {
      if (reqId === "ITEM_CONDITION" && itemData.condition) {
        resolvedValue = itemData.condition === "new" ? "Novo" : "Usado";
        source = "inferencia:condition";
      }
    }

    // 6. Fallback genérico para tipos conhecidos
    if (!resolvedValue && !resolvedValueId && catAttr) {
      if (catAttr.value_type === "string") {
        resolvedValue = "-";
        source = "fallback:string_generico";
      } else if (catAttr.value_type === "boolean") {
        resolvedValue = "Não";
        source = "fallback:boolean";
      }
    }

    // Registrar resultado
    if (resolvedValue || resolvedValueId) {
      const displayValue = resolvedValue || resolvedValueId || "(struct)";
      
      const filledAttr: NormalizedAttribute = { id: reqId };
      if (resolvedValueId) filledAttr.value_id = resolvedValueId;
      if (resolvedValue) filledAttr.value_name = resolvedValue;
      
      filled.push(filledAttr);
      log.push({ attrId: reqId, source, value: displayValue, target: "attributes" });
      console.log(`[ad-action-execute] Required ${reqId}: ✓ ${source} = "${displayValue}"`);
    } else {
      missing.push(reqId);
      log.push({ attrId: reqId, source: "MISSING", target: "attributes" });
      console.warn(`[ad-action-execute] Required ${reqId}: ✗ NO VALUE AVAILABLE`);
    }
  }

  return { filled, missing, bodyLevelFields, log, requiredBodyFieldKeys, filledBodyByFallback, filledBodyByDefaults };
}

// ============================================================================
// Extrator de campos faltantes do erro da API do Mercado Livre
// ============================================================================
interface ExtractedMissingFields {
  bodyFields: string[];
  attributeFields: string[];
  raw: any;
}

function extractMissingFieldsFromApiError(apiError: any): ExtractedMissingFields {
  const bodyFields: string[] = [];
  const attributeFields: string[] = [];

  if (!apiError) return { bodyFields, attributeFields, raw: apiError };

  // Padrão 1: cause[].code === "item.attributes.missing_required"
  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      if (cause.code === "item.attributes.missing_required" || cause.code === "body.required_fields") {
        // Tentar extrair field names do message
        const match = cause.message?.match(/properties \[([^\]]+)\]/i);
        if (match) {
          const fields = match[1].split(",").map((f: string) => f.trim().toLowerCase());
          for (const field of fields) {
            if (BODY_LEVEL_REQUIRED_FIELDS[field] || BODY_LEVEL_FIELD_ALIASES[field]) {
              bodyFields.push(field);
            } else {
              attributeFields.push(field);
            }
          }
        }
        // Tentar extrair do references
        if (cause.references && Array.isArray(cause.references)) {
          for (const ref of cause.references) {
            const field = (ref as string).toLowerCase();
            if (BODY_LEVEL_REQUIRED_FIELDS[field] || BODY_LEVEL_FIELD_ALIASES[field]) {
              bodyFields.push(field);
            } else {
              attributeFields.push(field);
            }
          }
        }
      }
    }
  }

  // Padrão 2: message contém "body.required_fields" ou "properties [...]"
  if (apiError.message) {
    const match = apiError.message.match(/properties \[([^\]]+)\]/i);
    if (match) {
      const fields = match[1].split(",").map((f: string) => f.trim().toLowerCase());
      for (const field of fields) {
        if (BODY_LEVEL_REQUIRED_FIELDS[field] || BODY_LEVEL_FIELD_ALIASES[field]) {
          if (!bodyFields.includes(field)) bodyFields.push(field);
        } else {
          if (!attributeFields.includes(field)) attributeFields.push(field);
        }
      }
    }
  }

  return { bodyFields, attributeFields, raw: apiError };
}

// ============================================================================
// Sanitizer: garante que apenas campos permitidos vão no body final
// ============================================================================
function sanitizePayload(payload: any): any {
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(payload)) {
    // Permitir apenas campos na whitelist ou body-level fields
    if (ALLOWED_BODY_FIELDS.has(key) || BODY_LEVEL_REQUIRED_FIELDS[key]) {
      sanitized[key] = value;
    } else {
      console.warn(`[ad-action-execute] Sanitizer: removed unexpected field "${key}"`);
    }
  }
  
  return sanitized;
}

// ============================================================================
// ETAPA E: Montagem final do payload de atributos
// ============================================================================
function buildFinalAttributesPayload(
  filledRequired: NormalizedAttribute[],
  cleanedSource: NormalizedAttribute[],
  includeNonRequired: boolean
): NormalizedAttribute[] {
  const finalAttrs: NormalizedAttribute[] = [];
  const includedIds = new Set<string>();

  // Primeiro: todos os obrigatórios preenchidos
  for (const attr of filledRequired) {
    if (!includedIds.has(attr.id)) {
      finalAttrs.push(attr);
      includedIds.add(attr.id);
    }
  }

  // Depois: atributos não-obrigatórios do item fonte (se permitido)
  if (includeNonRequired) {
    for (const attr of cleanedSource) {
      if (!includedIds.has(attr.id)) {
        finalAttrs.push(attr);
        includedIds.add(attr.id);
      }
    }
  }

  // Remover duplicatas finais (por segurança)
  const uniqueAttrs = Array.from(
    new Map(finalAttrs.map(a => [a.id, a])).values()
  );

  console.log(`[ad-action-execute] Final payload: ${uniqueAttrs.length} attributes (${filledRequired.length} required)`);
  return uniqueAttrs;
}

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
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action_id, confirm } = await req.json() as ExecuteActionRequest;

    if (!action_id) {
      return new Response(JSON.stringify({ error: "action_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the action
    const { data: action, error: actionError } = await supabase
      .from("ad_lifecycle_actions")
      .select("*")
      .eq("id", action_id)
      .single();

    if (actionError || !action) {
      return new Response(JSON.stringify({ error: "Action not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check action status
    if (action.action_status !== "DRAFT" && action.action_status !== "QUEUED") {
      return new Response(JSON.stringify({ 
        error: "Action cannot be executed",
        reason: `Current status is ${action.action_status}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get safety settings
    const { data: settings } = await supabase
      .from("ad_timeline_settings")
      .select("action_safety")
      .eq("workspace_id", action.workspace_id)
      .maybeSingle();

    const safety = settings?.action_safety || { require_confirmation: true, daily_limit: 50 };

    // Check confirmation requirement
    if (safety.require_confirmation && !confirm) {
      return new Response(JSON.stringify({ 
        requires_confirmation: true,
        message: "This action requires confirmation. Call again with confirm: true",
        action_type: action.action_type,
        item_id: action.item_id,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check daily limit
    const today = new Date().toISOString().split("T")[0];
    const { count: todayCount } = await supabase
      .from("ad_lifecycle_actions")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", action.workspace_id)
      .eq("ml_account_id", action.ml_account_id)
      .in("action_status", ["SUCCESS", "RUNNING"])
      .gte("updated_at", `${today}T00:00:00Z`);

    if ((todayCount || 0) >= safety.daily_limit) {
      return new Response(JSON.stringify({ 
        error: "Daily action limit reached",
        limit: safety.daily_limit,
        executed_today: todayCount,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to RUNNING
    await supabase
      .from("ad_lifecycle_actions")
      .update({ action_status: "RUNNING", updated_at: new Date().toISOString() })
      .eq("id", action_id);

    console.log(`[ad-action-execute] Executing ${action.action_type} for item ${action.item_id}`);

    // Get ML account credentials
    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    let mlAccount: { access_token: string | null; ml_user_id: string } | null = null;

    if (isUuid(action.ml_account_id)) {
      const { data } = await supabase
        .from("ml_accounts")
        .select("access_token, ml_user_id")
        .eq("id", action.ml_account_id)
        .maybeSingle();
      mlAccount = (data as any) ?? null;
    } else {
      const { data } = await supabase
        .from("ml_accounts")
        .select("access_token, ml_user_id")
        .eq("ml_user_id", action.ml_account_id)
        .maybeSingle();
      mlAccount = (data as any) ?? null;
    }

    console.log(
      `[ad-action-execute] mlAccount lookup`,
      JSON.stringify({
        action_id,
        ml_account_id: action.ml_account_id,
        is_uuid: isUuid(action.ml_account_id),
        found: !!mlAccount,
        has_access_token: !!mlAccount?.access_token,
      })
    );

    let result: any;

    if (!mlAccount) {
      result = {
        success: false,
        error: "ML_ACCOUNT_NOT_FOUND",
        message: "Conta do Mercado Livre não encontrada para esta ação",
      };
    } else if (!mlAccount.access_token) {
      result = {
        success: false,
        error: "ML_ACCOUNT_MISSING_TOKEN",
        message: "Conta do Mercado Livre desconectada (sem token). Reconecte e tente novamente.",
      };
    } else {
      try {
        switch (action.action_type) {
          case "END":
            result = await executeEndAction(mlAccount.access_token, action.item_id);
            break;
          case "RELIST":
            result = await executeRelistAction(mlAccount.access_token, action.item_id);
            break;
          case "CLONE":
            result = await executeCloneAction(
              mlAccount.access_token,
              action.item_id,
              action.source_snapshot,
              action.checklist,
              supabase, // Passar supabase para refresh token
              action.ml_account_id // Passar ID da conta para refresh token
            );
            break;
          default:
            result = { success: false, error: "UNKNOWN_ACTION", message: `Unknown action type: ${action.action_type}` };
        }
      } catch (e: any) {
        result = { success: false, error: e?.message || String(e) };
      }
    }

    // Update action with result
    const finalStatus = result.success ? "SUCCESS" : "FAILED";
    await supabase
      .from("ad_lifecycle_actions")
      .update({ 
        action_status: finalStatus, 
        result,
        updated_at: new Date().toISOString() 
      })
      .eq("id", action_id);

    // Create event
    await supabase.from("ad_timeline_events").insert({
      workspace_id: action.workspace_id,
      ml_account_id: action.ml_account_id,
      item_id: action.item_id,
      event_type: "ACTION_EXECUTED",
      occurred_at: new Date().toISOString(),
      payload: {
        action_id,
        action_type: action.action_type,
        status: finalStatus,
        result,
      },
    });

    // If clone/relist succeeded, create experiment
    if (result.success && (action.action_type === "CLONE" || action.action_type === "RELIST") && result.new_item_id) {
      await supabase.from("ad_lifecycle_experiments").insert({
        workspace_id: action.workspace_id,
        ml_account_id: action.ml_account_id,
        source_item_id: action.item_id,
        new_item_id: result.new_item_id,
        method: action.action_type,
        baseline: action.source_snapshot || {},
      });
    }

    return new Response(JSON.stringify({
      success: result.success,
      action_id,
      action_type: action.action_type,
      status: finalStatus,
      result,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`[ad-action-execute] Error:`, error);
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper functions for ML API calls
async function executeEndAction(accessToken: string, itemId: string) {
  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "closed" }),
  });

  const data = await response.json();
  if (!response.ok) {
    return { success: false, error: data.message || "Failed to close item", api_error: data };
  }
  return { success: true, message: "Item closed successfully" };
}

async function executeRelistAction(accessToken: string, itemId: string) {
  const response = await fetch(`https://api.mercadolibre.com/items/${itemId}/relist`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const data = await response.json();
  if (!response.ok) {
    return { success: false, error: data.message || "Failed to relist item", api_error: data };
  }
  return { success: true, message: "Item relisted successfully", new_item_id: data.id };
}

async function executeCloneAction(
  accessToken: string,
  itemId: string,
  snapshot: any,
  checklist: any,
  supabase?: any, // Para refresh token
  mlAccountId?: string // Para refresh token
) {
  // Variável para token atual (pode ser atualizado após refresh)
  let currentAccessToken = accessToken;
  let itemData = snapshot;
  let resolvedItemId = itemId;
  let catalogInfo: any = null;

  console.log(`[ad-action-execute] Clone requested for ID: ${itemId}`);
  console.log(`[ad-action-execute] ID type analysis: isRegularItemId=${isRegularItemId(itemId)}, isCatalogId=${isCatalogId(itemId)}`);

  // =========================================================================
  // GUARD DE AUTENTICAÇÃO: Validar token ANTES de qualquer operação
  // Evita gastar recursos com requests que vão falhar por auth
  // =========================================================================
  if (supabase && mlAccountId) {
    console.log(`[ad-action-execute] === AUTH GUARD: Pre-validating token ===`);
    const authCheck = await validateAndRefreshTokenIfNeeded(currentAccessToken, supabase, mlAccountId);
    
    if (!authCheck.valid) {
      console.error(`[ad-action-execute] AUTH GUARD: Token validation failed - reconnection required`);
      return {
        success: false,
        error: "AUTH_EXPIRED",
        message: "Token expirado ou inválido. Reconecte sua conta do Mercado Livre para continuar.",
        user_guidance: "Clique em 'Reconectar Mercado Livre' para renovar a autorização da sua conta.",
        requires_reconnection: true,
        api_request: {
          request_kind: "auth_validation",
          http_method: "GET",
          endpoint_url: "https://api.mercadolibre.com/users/me",
        },
      };
    }
    
    // Usar token atualizado (pode ter sido renovado)
    currentAccessToken = authCheck.accessToken!;
    console.log(`[ad-action-execute] AUTH GUARD: Token validated/refreshed successfully`);
  } else {
    console.warn(`[ad-action-execute] AUTH GUARD: Skipped (no supabase or mlAccountId provided)`);
  }

  // If no snapshot, we need to fetch item data
  if (!itemData || Object.keys(itemData).length === 0) {
    
    // REGRA OFICIAL: MLB tem prioridade - vai direto para /items
    if (isRegularItemId(itemId)) {
      console.log(`[ad-action-execute] PRIORITY PATH: Regular item ID (MLB) detected - going directly to /items`);
    }
    // FALLBACK RESIDUAL: Somente se for MLBU e não houver MLB
    else if (isCatalogId(itemId)) {
      console.log(`[ad-action-execute] FALLBACK PATH: Catalog ID (MLBU) detected - attempting catalog resolution`);

      const catalogResult = await resolveCatalogItemFallback(currentAccessToken, itemId);
      if (!catalogResult.ok) {
        console.error(`[ad-action-execute] Catalog resolve failed for ${itemId}`, catalogResult.tried);
        return {
          success: false,
          error: catalogResult.error,
          user_guidance: catalogResult.userGuidance,
          is_catalog: true,
          catalog_id: itemId,
          tried: catalogResult.tried,
        };
      }

      resolvedItemId = catalogResult.itemId;
      catalogInfo = {
        original_catalog_id: itemId,
        buy_box_winner_id: resolvedItemId,
        resolved_by: catalogResult.resolvedBy,
        product_name: catalogResult.productData?.name,
      };

      console.log(`[ad-action-execute] Catalog resolved to item: ${resolvedItemId}`);
    } else {
      console.log(`[ad-action-execute] Unknown ID format: ${itemId} - attempting as regular item`);
    }

    // Fetch real item (MLB)
    console.log(`[ad-action-execute] Fetching item data: ${resolvedItemId}`);
    const getResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}`, {
      headers: { Authorization: `Bearer ${currentAccessToken}` },
    });

    const responseStatus = getResponse.status;
    console.log(`[ad-action-execute] /items/${resolvedItemId} response status: ${responseStatus}`);

    if (!getResponse.ok) {
      const errBody = await getResponse.text().catch(() => "");
      
      console.error(`[ad-action-execute] /items/${resolvedItemId} FAILED`, JSON.stringify({
        status: responseStatus,
        body_preview: errBody?.slice(0, 500),
        item_id: resolvedItemId,
        original_id: itemId,
      }));

      let errorType = "UNKNOWN";
      let userMessage = `Falha ao buscar detalhes do anúncio ${resolvedItemId}`;
      
      if (responseStatus === 403) {
        errorType = "ACCESS_DENIED";
        userMessage = `Sem permissão para acessar o anúncio ${resolvedItemId}. Este anúncio pode pertencer a outro vendedor.`;
      } else if (responseStatus === 404) {
        errorType = "NOT_FOUND";
        userMessage = `Anúncio ${resolvedItemId} não encontrado. Pode ter sido excluído ou o ID está incorreto.`;
      } else if (responseStatus === 401) {
        errorType = "UNAUTHORIZED";
        userMessage = `Token expirado ou inválido. Reconecte sua conta do Mercado Livre.`;
      } else if (responseStatus >= 500) {
        errorType = "ML_SERVER_ERROR";
        userMessage = `Erro temporário no Mercado Livre (${responseStatus}). Tente novamente em alguns minutos.`;
      }

      let parsedError: any = null;
      try {
        parsedError = JSON.parse(errBody);
      } catch {
        // Not JSON
      }

      return {
        success: false,
        error: errorType,
        message: userMessage,
        api_status: responseStatus,
        api_error: parsedError || errBody,
        catalog_info: catalogInfo,
      };
    }

    itemData = await getResponse.json();
  }

  // =========================================================================
  // ETAPA 1.5: DIAGNÓSTICO DE CATÁLOGO - Detectar se o item fonte é de catálogo
  // REGRA NOVA: SEMPRE criar como anúncio NORMAL (não catálogo)
  // Isso permite edição de título, fotos e descrição
  // =========================================================================
  const catalogDiagnostic = {
    catalog_product_id: itemData.catalog_product_id || null,
    catalog_listing: itemData.catalog_listing ?? null,
    parent_item_id: itemData.parent_item_id || null,
    is_catalog_source: false, // Origem do item
    create_as_normal: true, // SEMPRE criar como normal
    blocked_fields: [] as string[],
  };

  // Determinar se o ITEM FONTE é de catálogo (para logging)
  const sourceIsCatalog = !!(
    catalogDiagnostic.catalog_product_id ||
    itemData.catalog_listing === true ||
    catalogDiagnostic.parent_item_id
  );
  catalogDiagnostic.is_catalog_source = sourceIsCatalog;

  // REGRA: Criar SEMPRE como anúncio normal (não catálogo)
  // Não bloquear campos - usuário pode editar tudo
  const createAsNormal = checklist?.create_as_normal !== false; // Default: true
  
  if (createAsNormal) {
    catalogDiagnostic.blocked_fields = []; // Nenhum campo bloqueado
  } else if (sourceIsCatalog) {
    // Modo legado (não usado mais): bloquear campos se for catálogo
    catalogDiagnostic.blocked_fields = ["title", "pictures", "description"];
  }

  console.log(`[ad-action-execute] === CATALOG DIAGNOSTIC ===`);
  console.log(`[ad-action-execute] source_is_catalog: ${sourceIsCatalog}`);
  console.log(`[ad-action-execute] create_as_normal: ${createAsNormal}`);
  console.log(`[ad-action-execute] catalog_product_id: ${catalogDiagnostic.catalog_product_id}`);
  console.log(`[ad-action-execute] blocked_fields: ${catalogDiagnostic.blocked_fields.join(", ") || "(none - creating as normal)"}`);

  console.log(`[ad-action-execute] Building clone payload from data:`, JSON.stringify({ 
    title: itemData.title, 
    category_id: itemData.category_id,
    resolved_from_catalog: !!catalogInfo,
    source_is_catalog: sourceIsCatalog,
    create_as_normal: createAsNormal,
  }));

  // =========================================================================
  // ETAPA 2: Descobrir atributos obrigatórios da categoria
  // =========================================================================
  let categoryAttributes: CategoryAttribute[] = [];
  let requiredIds: string[] = [];

  if (itemData.category_id) {
    const catResult = await fetchCategoryRequiredAttributes(currentAccessToken, itemData.category_id);
    categoryAttributes = catResult.attributes;
    requiredIds = catResult.requiredIds;
  }

  // =========================================================================
  // ETAPA 3: Normalizar atributos do item fonte (removendo not-modifiable e catalog-forcing)
  // REGRA: Quando createAsNormal=true, remover GTIN/EAN/UPC/ISBN para evitar erro "title invalid"
  // =========================================================================
  const { attrsById: sourceAttrsById, cleanedAttrs, removedNotModifiable, removedCatalogForcing } = normalizeAndCleanAttributes(
    itemData.attributes || [],
    categoryAttributes,
    true, // removeNotModifiable = true
    createAsNormal // NOVO: remover atributos que forçam catálogo
  );

  if (removedCatalogForcing.length > 0) {
    console.log(`[ad-action-execute] Removed catalog-forcing attributes: ${removedCatalogForcing.join(", ")}`);
    (catalogDiagnostic as any).removed_catalog_forcing = removedCatalogForcing;
  }

  // =========================================================================
  // ETAPA 4: PREFLIGHT - Validar e completar obrigatórios (1ª passagem)
  // Fluxo: validate → fill → validate → create
  // =========================================================================
  console.log(`[ad-action-execute] === PREFLIGHT VALIDATION (Pass 1) ===`);
  
  let fillResult = validateAndFillRequiredAttributes({
    requiredIds,
    extraBodyFields: [], // Primeira passagem sem campos extras
    categoryAttributes,
    sourceAttrsById,
    itemData,
    categoryId: itemData.category_id || "",
  });

  // =========================================================================
  // ETAPA 5: Log obrigatório expandido (para debug detalhado)
  // =========================================================================
  let requiredCheck = {
    categoryId: itemData.category_id,
    requiredAttributeIds: requiredIds,
    requiredBodyFieldKeys: fillResult.requiredBodyFieldKeys,
    missingRequiredBeforeFill: requiredIds.filter(id => !sourceAttrsById.has(id)),
    filledByItemSource: fillResult.log.filter(l => l.source.startsWith("item_fonte")).map(l => l.attrId),
    filledByDefaults: fillResult.log.filter(l => l.source.startsWith("default:")).map(l => l.attrId),
    filledByFallback: fillResult.log.filter(l => l.source.startsWith("fallback:")).map(l => l.attrId),
    filledByCategoria: fillResult.log.filter(l => l.source.startsWith("categoria:")).map(l => l.attrId),
    filledByInferencia: fillResult.log.filter(l => l.source.startsWith("inferencia:")).map(l => l.attrId),
    filledBodyByFallback: fillResult.filledBodyByFallback,
    filledBodyByDefaults: fillResult.filledBodyByDefaults,
    missingAfterFill: fillResult.missing,
    bodyLevelFields: fillResult.bodyLevelFields,
  };

  console.log(`[ad-action-execute] === REQUIRED CHECK SUMMARY (Pass 1) ===`);
  console.log(`[ad-action-execute] ${JSON.stringify(requiredCheck, null, 2)}`);
  
  for (const entry of fillResult.log) {
    console.log(`[ad-action-execute]   - ${entry.attrId}: ${entry.source} → ${entry.target}${entry.value ? ` = "${entry.value}"` : ""}`);
  }

  // Se faltar obrigatório após primeira passagem → erro controlado
  if (fillResult.missing.length > 0) {
    console.error(`[ad-action-execute] CLONE BLOCKED: Missing required attributes: ${fillResult.missing.join(", ")}`);
    
    return {
      success: false,
      error: "MISSING_REQUIRED_ATTRIBUTES",
      message: `O Mercado Livre exige campos obrigatórios adicionais para esta categoria: ${fillResult.missing.join(", ")}. Ajuste e tente novamente.`,
      user_guidance: "Este produto exige um dado obrigatório definido pelo Mercado Livre. Complete os campos do anúncio e tente novamente.",
      missing_required_attributes: fillResult.missing,
      category_id: itemData.category_id,
      item_id: resolvedItemId,
      required_check: requiredCheck,
      catalog_info: catalogInfo,
    };
  }

  // =========================================================================
  // ETAPA E: Montagem final do payload
  // =========================================================================
  const includeNonRequired = checklist?.attributes !== false;
  const finalAttributes = buildFinalAttributesPayload(
    fillResult.filled,
    cleanedAttrs,
    includeNonRequired
  );

  // Validação final: sem duplicatas
  const attrIdCounts = new Map<string, number>();
  for (const attr of finalAttributes) {
    attrIdCounts.set(attr.id, (attrIdCounts.get(attr.id) || 0) + 1);
  }
  const duplicates = Array.from(attrIdCounts.entries()).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    console.warn(`[ad-action-execute] WARNING: Duplicate attributes detected: ${duplicates.map(([id]) => id).join(", ")}`);
  }

  // =========================================================================
  // ESTRATÉGIA DE listing_type_id - OBRIGATÓRIO EM TODA CHAMADA POST /items
  // Usar resolveListingTypeId() com fallback automático se necessário
  // =========================================================================
  const isCatalogSource = catalogDiagnostic.is_catalog_source;
  const blockedFields = catalogDiagnostic.blocked_fields;
  const picturesBlocked = blockedFields.includes("pictures");

  // Resolver listing_type_id inicial - com cache por categoria
  const categoryIdForCache = itemData.category_id || "";
  let listingTypeResolution = resolveListingTypeId(
    itemData.listing_type_id,
    categoryIdForCache,
    DEFAULT_LISTING_TYPE_ID,
    [], // sem sugestões da API ainda
    -1  // sem fallback ainda
  );
  let listingTypeToUse = listingTypeResolution.listing_type_id;
  let listingTypeStrategy: "source" | "default" | "fallback" | "catalog_safe" | "cache" | "api_suggested" | "user_override" = 
    listingTypeResolution.source === "source_item" ? "source" : 
    listingTypeResolution.source === "cache" ? "cache" : "default";
  
  // Tipos sugeridos pela API (preenchidos após erro)
  let apiSuggestedTypes: string[] = [];

  // NOVO FLUXO: Como criamos SEMPRE como anúncio normal, não precisamos verificar pictures bloqueadas
  // A menos que explicitamente configurado para criar como catálogo (modo legado)
  if (!createAsNormal && sourceIsCatalog && picturesBlocked) {
    if (LISTING_TYPES_REQUIRING_PICTURES.has(listingTypeToUse)) {
      console.log(`[ad-action-execute] CATALOG STRATEGY: listing_type_id "${listingTypeToUse}" requires pictures but pictures are blocked`);
      listingTypeToUse = CATALOG_SAFE_LISTING_TYPES[0] || "bronze";
      listingTypeStrategy = "catalog_safe";
      console.log(`[ad-action-execute] CATALOG STRATEGY: Switched to catalog-safe listing_type_id: ${listingTypeToUse}`);
    }
  }

  console.log(`[ad-action-execute] === LISTING_TYPE_ID RESOLUTION ===`);
  console.log(`[ad-action-execute] source_listing_type: ${itemData.listing_type_id || "(none)"}`);
  console.log(`[ad-action-execute] resolved_listing_type: ${listingTypeToUse}`);
  console.log(`[ad-action-execute] resolution_source: ${listingTypeResolution.source}`);
  console.log(`[ad-action-execute] final_strategy: ${listingTypeStrategy}`);

  // =========================================================================
  // REGRA NOVA: Como criamos SEMPRE como anúncio normal, TODOS os campos são permitidos
  // =========================================================================
  const canIncludeTitle = checklist?.title !== false; // SEMPRE permitido (criando como normal)
  const canIncludePictures = checklist?.pictures !== false && itemData.pictures; // SEMPRE permitido
  const canIncludeDescription = checklist?.description !== false; // SEMPRE permitido

  console.log(`[ad-action-execute] === PAYLOAD FIELD DECISIONS (create_as_normal=${createAsNormal}) ===`);
  console.log(`[ad-action-execute] source_is_catalog: ${sourceIsCatalog}`);
  console.log(`[ad-action-execute] canIncludeTitle: ${canIncludeTitle}`);
  console.log(`[ad-action-execute] canIncludePictures: ${canIncludePictures}`);
  console.log(`[ad-action-execute] canIncludeDescription: ${canIncludeDescription}`);
  console.log(`[ad-action-execute] removedNotModifiable: ${removedNotModifiable.join(", ") || "(none)"}`);

  // =========================================================================
  // PRE-VALIDATION: Garantir campos obrigatórios antes do POST
  // =========================================================================
  const preValidation = {
    listing_type_id: checklist?.override_listing_type || listingTypeToUse, // Priorizar override do usuário
    currency_id: itemData.currency_id || "BRL",
    has_category: !!itemData.category_id,
    has_price: !!(checklist?.override_price ?? itemData.price),
  };

  // Se usuário escolheu listing_type diferente, usar
  if (checklist?.override_listing_type) {
    listingTypeToUse = checklist.override_listing_type;
    listingTypeStrategy = "user_override";
    console.log(`[ad-action-execute] User override listing_type_id: ${listingTypeToUse}`);
  }

  console.log(`[ad-action-execute] === PRE-VALIDATION ===`);
  console.log(`[ad-action-execute] ${JSON.stringify(preValidation)}`);

  // =========================================================================
  // ETAPA X: Incluir seller_package_* obrigatórios do checklist
  // Estes campos são OBRIGATÓRIOS para evitar erro item.attribute.missing.seller.package.dimensions
  // =========================================================================
  const sellerPackageAttributes: NormalizedAttribute[] = [];
  
  if (checklist?.seller_package_height && checklist.seller_package_height > 0) {
    sellerPackageAttributes.push({
      id: "SELLER_PACKAGE_HEIGHT",
      value_name: String(checklist.seller_package_height),
    });
  }
  if (checklist?.seller_package_width && checklist.seller_package_width > 0) {
    sellerPackageAttributes.push({
      id: "SELLER_PACKAGE_WIDTH",
      value_name: String(checklist.seller_package_width),
    });
  }
  if (checklist?.seller_package_length && checklist.seller_package_length > 0) {
    sellerPackageAttributes.push({
      id: "SELLER_PACKAGE_LENGTH",
      value_name: String(checklist.seller_package_length),
    });
  }
  if (checklist?.seller_package_weight && checklist.seller_package_weight > 0) {
    sellerPackageAttributes.push({
      id: "SELLER_PACKAGE_WEIGHT",
      value_name: String(checklist.seller_package_weight),
    });
  }

  console.log(`[ad-action-execute] seller_package_* from checklist: ${sellerPackageAttributes.map(a => a.id).join(", ") || "(none)"}`);

  // Mesclar seller_package_* com finalAttributes (prioridade para checklist)
  const packageAttrIds = new Set(sellerPackageAttributes.map(a => a.id));
  const attributesWithPackage = [
    ...sellerPackageAttributes,
    ...finalAttributes.filter(a => !packageAttrIds.has(a.id)),
  ];

  // =========================================================================
  // BUILD NEW ITEM PAYLOAD - SEMPRE como anúncio NORMAL (sem catalog_product_id)
  // =========================================================================
  let newItem: any = {
    category_id: itemData.category_id,
    currency_id: preValidation.currency_id,
    listing_type_id: listingTypeToUse, // OBRIGATÓRIO - SEMPRE PRESENTE
    condition: itemData.condition || "new",
    price: checklist?.override_price ?? (checklist?.price !== false ? itemData.price : undefined),
    available_quantity: checklist?.override_quantity ?? (checklist?.quantity !== false ? itemData.available_quantity : 1),
    attributes: attributesWithPackage.length > 0 ? attributesWithPackage : undefined,
  };

  // TÍTULO: Usar override do usuário se disponível, senão usar do item fonte
  if (canIncludeTitle) {
    newItem.title = checklist?.override_title || itemData.title;
    console.log(`[ad-action-execute] Title: ${checklist?.override_title ? "user_override" : "source_item"} = "${newItem.title?.substring(0, 40)}..."`);
  }

  // FOTOS: Sempre incluir quando criando como normal
  if (canIncludePictures) {
    newItem.pictures = itemData.pictures.map((p: any) => ({ source: p.url || p.secure_url }));
    console.log(`[ad-action-execute] Pictures: ${newItem.pictures.length} images`);
  }

  // IMPORTANTE: NÃO incluir catalog_product_id quando criando como normal
  // Isso permite que o anúncio seja editável (título, fotos, descrição)
  if (!createAsNormal && sourceIsCatalog && catalogDiagnostic.catalog_product_id) {
    newItem.catalog_product_id = catalogDiagnostic.catalog_product_id;
    console.log(`[ad-action-execute] [LEGACY MODE] Added catalog_product_id: ${catalogDiagnostic.catalog_product_id}`);
  } else {
    console.log(`[ad-action-execute] catalog_product_id: OMITTED (creating as normal listing)`);
  }

  // =========================================================================
  // STATUS: Criar pausado ou ativo conforme seleção do usuário
  // =========================================================================
  if (checklist?.create_paused === true) {
    newItem.status = "paused";
    console.log(`[ad-action-execute] Status: paused (user selected)`);
  } else {
    // Por padrão, não definir status - o ML cria como "active"
    console.log(`[ad-action-execute] Status: active (default)`);
  }

  // Adicionar body-level fields (family_name, etc.) - GARANTIDO no payload
  for (const [fieldName, fieldValue] of Object.entries(fillResult.bodyLevelFields)) {
    newItem[fieldName] = fieldValue;
    console.log(`[ad-action-execute] Added body-level field: ${fieldName} = "${fieldValue}"`);
  }

  // DESCRIÇÃO: Usar override do usuário se disponível
  if (canIncludeDescription) {
    if (checklist?.override_description) {
      newItem.description = { plain_text: checklist.override_description };
      console.log(`[ad-action-execute] Description: user_override`);
    } else {
      // Buscar descrição do item fonte
      const descResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}/description`, {
        headers: { "Authorization": `Bearer ${currentAccessToken}` },
      });
      if (descResponse.ok) {
        const descData = await descResponse.json();
        newItem.description = { plain_text: descData.plain_text || descData.text };
        console.log(`[ad-action-execute] Description: source_item`);
      }
    }
  }

  // Validate minimum required fields
  if (!newItem.title || !newItem.category_id) {
    return {
      success: false,
      error: "INSUFFICIENT_DATA",
      message: "Dados insuficientes para clonagem. Título ou categoria não encontrados.",
      missing: { title: !newItem.title, category_id: !newItem.category_id },
      catalog_info: catalogInfo,
      catalog_diagnostic: catalogDiagnostic,
    };
  }

  // =========================================================================
  // SANITIZE: Garantir que apenas campos permitidos vão no body
  // =========================================================================
  newItem = sanitizePayload(newItem);

  console.log(`[ad-action-execute] Sending clone request with ${finalAttributes.length} attributes`);
  console.log(`[ad-action-execute] Body-level fields in payload: ${JSON.stringify(fillResult.bodyLevelFields)}`);
  console.log(`[ad-action-execute] Payload keys: ${Object.keys(newItem).join(", ")}`);

  // =========================================================================
  // CLONE SEMPRE USA: POST /items (criar novo anúncio)
  // NUNCA usar PUT /items/{id} para clone - isso é para update
  // =========================================================================
  const CREATE_ENDPOINT = "https://api.mercadolibre.com/items";
  const CREATE_METHOD = "POST";
  
  // Log obrigatório: request_kind, method, endpoint
  console.log(`[ad-action-execute] === API REQUEST (Pass 1) ===`);
  console.log(`[ad-action-execute] request_kind=create`);
  console.log(`[ad-action-execute] method=${CREATE_METHOD}`);
  console.log(`[ad-action-execute] endpoint=${CREATE_ENDPOINT}`);
  
  let createResponse = await fetch(CREATE_ENDPOINT, {
    method: CREATE_METHOD,
    headers: {
      "Authorization": `Bearer ${currentAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newItem),
  });

  let createData = await createResponse.json();
  
  // =========================================================================
  // TRATAMENTO 401 - TOKEN EXPIRADO: Tentar refresh automático
  // =========================================================================
  if (is401Error(createResponse) && supabase && mlAccountId) {
    console.warn(`[ad-action-execute] 401 UNAUTHORIZED - Attempting token refresh...`);
    
    const refreshResult = await tryRefreshToken(supabase, mlAccountId);
    if (refreshResult.success && refreshResult.newAccessToken) {
      currentAccessToken = refreshResult.newAccessToken;
      console.log(`[ad-action-execute] Token refreshed successfully - retrying request`);
      
      // Retry com novo token
      createResponse = await fetch(CREATE_ENDPOINT, {
        method: CREATE_METHOD,
        headers: {
          "Authorization": `Bearer ${currentAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newItem),
      });
      createData = await createResponse.json();
      
      // Se ainda for 401 após refresh, retornar erro de reconexão
      if (is401Error(createResponse)) {
        console.error(`[ad-action-execute] Still 401 after token refresh - account needs reconnection`);
        return {
          success: false,
          error: "AUTH_EXPIRED",
          message: "Token expirado. Reconecte a conta do Mercado Livre para continuar.",
          user_guidance: "Clique em 'Reconectar Mercado Livre' para renovar a autorização da sua conta.",
          requires_reconnection: true,
          api_error: createData,
          api_request: {
            request_kind: "create",
            http_method: CREATE_METHOD,
            endpoint_url: CREATE_ENDPOINT,
          },
        };
      }
    } else {
      // Refresh falhou - retornar erro de reconexão
      console.error(`[ad-action-execute] Token refresh failed: ${refreshResult.error}`);
      return {
        success: false,
        error: "AUTH_EXPIRED",
        message: "Token expirado. Reconecte a conta do Mercado Livre para continuar.",
        user_guidance: "Clique em 'Reconectar Mercado Livre' para renovar a autorização da sua conta.",
        requires_reconnection: true,
        refresh_error: refreshResult.error,
        api_error: createData,
        api_request: {
          request_kind: "create",
          http_method: CREATE_METHOD,
          endpoint_url: CREATE_ENDPOINT,
        },
      };
    }
  }
  
  // =========================================================================
  // RETRY LOOP: Se falhar, tentar recovery de campos e fallback de listing_type
  // ESTRATÉGIA GUIADA PELA API: Extrair tipos sugeridos da mensagem de erro
  // NOVA ESTRATÉGIA: CATALOG_FALLBACK - Retry sem title se bloqueado
  // =========================================================================
  let currentFallbackIndex = -1; // -1 = sem fallback ainda
  let listingTypeFallbackUsed = false;
  let lastListingTypeAttempted = listingTypeToUse;
  let listingTypeFallbackChain: string[] = [];
  const MAX_LISTING_TYPE_FALLBACKS = 2;
  
  // Variáveis para CATALOG_FALLBACK
  let titleFallbackAttempted = false;
  let fallbackRemovedFields: string[] = [];
  let originalTitle: string | undefined = newItem.title;
  let postCreateTitleUpdate: string | undefined;
  let createdWithoutTitle = false;

  while (!createResponse.ok && currentFallbackIndex < MAX_LISTING_TYPE_FALLBACKS) {
    // Verificar se é erro de listing_type_id.unavailable (ex: "free is not available")
    const isListingTypeUnavailable = isListingTypeUnavailableError(createData);
    const isListingTypeIssue = isListingTypeError(createData) || isListingTypeUnavailable;
    const extractedMissing = extractMissingFieldsFromApiError(createData);
    
    // =========================================================================
    // CATALOG_FALLBACK: Se erro body.invalid_fields para title, remover title e reenviar
    // Aplicável quando: item é de catálogo E API bloqueia title
    // =========================================================================
    const isTitleBlocked = isTitleInvalidFieldsError(createData);
    if (isTitleBlocked && !titleFallbackAttempted) {
      console.warn(`[ad-action-execute] === CATALOG_FALLBACK: Title blocked - removing title and retrying ===`);
      console.warn(`[ad-action-execute] isCatalogSource=${isCatalogSource}, original_title="${originalTitle?.substring(0, 40)}..."`);
      
      titleFallbackAttempted = true;
      
      // Extrair quais campos estão inválidos
      const invalidFieldsExtracted = extractInvalidFields(createData);
      console.warn(`[ad-action-execute] Invalid fields extracted: ${invalidFieldsExtracted.join(", ") || "(none)"}`);
      
      // Remover title do payload
      delete newItem.title;
      fallbackRemovedFields.push("title");
      
      // Tentar criar sem title
      console.log(`[ad-action-execute] === API REQUEST (CATALOG_FALLBACK - without title) ===`);
      console.log(`[ad-action-execute] request_kind=create`);
      console.log(`[ad-action-execute] method=${CREATE_METHOD}`);
      console.log(`[ad-action-execute] fallback_removed_fields=${fallbackRemovedFields.join(", ")}`);
      
      createResponse = await fetch(CREATE_ENDPOINT, {
        method: CREATE_METHOD,
        headers: {
          "Authorization": `Bearer ${currentAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newItem),
      });
      
      createData = await createResponse.json();
      
      // Se sucesso, marcar que criou sem título
      if (createResponse.ok) {
        createdWithoutTitle = true;
        console.log(`[ad-action-execute] CATALOG_FALLBACK SUCCESS: Item created without title`);
      }
      
      continue;
    }
    
    // Se for erro de listing_type_id, tentar fallback GUIADO PELA API
    if (isListingTypeIssue && currentFallbackIndex < MAX_LISTING_TYPE_FALLBACKS - 1) {
      currentFallbackIndex++;
      
      // Extrair tipos sugeridos da resposta da API (ex: [gold_pro, gold_special])
      if (apiSuggestedTypes.length === 0) {
        apiSuggestedTypes = extractSuggestedListingTypes(createData);
      }
      
      // Resolver com base nos tipos sugeridos ou fallback padrão
      const fallbackResolution = resolveListingTypeId(
        undefined,
        categoryIdForCache,
        DEFAULT_LISTING_TYPE_ID,
        apiSuggestedTypes,
        currentFallbackIndex
      );
      
      listingTypeToUse = fallbackResolution.listing_type_id;
      listingTypeStrategy = fallbackResolution.source === "api_suggested" ? "api_suggested" : "fallback";
      listingTypeFallbackUsed = true;
      lastListingTypeAttempted = listingTypeToUse;
      listingTypeFallbackChain.push(listingTypeToUse);

      console.warn(`[ad-action-execute] LISTING_TYPE FALLBACK [${currentFallbackIndex + 1}/${MAX_LISTING_TYPE_FALLBACKS}]:`);
      console.warn(`[ad-action-execute]   → Trying: ${listingTypeToUse}`);
      console.warn(`[ad-action-execute]   → Source: ${fallbackResolution.source}`);
      console.warn(`[ad-action-execute]   → API suggested: ${apiSuggestedTypes.join(", ") || "(none)"}`);

      // Reconstruir payload com novo listing_type_id
      newItem.listing_type_id = listingTypeToUse;

      console.log(`[ad-action-execute] === API REQUEST (Fallback ${currentFallbackIndex + 1}) ===`);
      console.log(`[ad-action-execute] listing_type_id=${listingTypeToUse}`);
      
      createResponse = await fetch(CREATE_ENDPOINT, {
        method: CREATE_METHOD,
        headers: {
          "Authorization": `Bearer ${currentAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newItem),
      });

      createData = await createResponse.json();
      continue;
    }

    // Se há campos faltantes (não listing_type), tentar preencher
    if (extractedMissing.bodyFields.length > 0 || extractedMissing.attributeFields.length > 0) {
      console.warn(`[ad-action-execute] API returned missing fields - attempting recovery`);
      console.warn(`[ad-action-execute] Extracted body fields: ${extractedMissing.bodyFields.join(", ") || "(none)"}`);
      console.warn(`[ad-action-execute] Extracted attribute fields: ${extractedMissing.attributeFields.join(", ") || "(none)"}`);

      // =========================================================================
      // PREFLIGHT (Pass 2): Reexecutar motor de preenchimento com campos extras
      // =========================================================================
      console.log(`[ad-action-execute] === PREFLIGHT VALIDATION (Pass 2 - Recovery) ===`);
      
      fillResult = validateAndFillRequiredAttributes({
        requiredIds: [...requiredIds, ...extractedMissing.attributeFields.map(f => f.toUpperCase())],
        extraBodyFields: extractedMissing.bodyFields,
        categoryAttributes,
        sourceAttrsById,
        itemData,
        categoryId: itemData.category_id || "",
      });

      // Atualizar requiredCheck com informações da segunda passagem
      requiredCheck = {
        ...requiredCheck,
        requiredBodyFieldKeys: fillResult.requiredBodyFieldKeys,
        filledBodyByFallback: fillResult.filledBodyByFallback,
        filledBodyByDefaults: fillResult.filledBodyByDefaults,
        bodyLevelFields: fillResult.bodyLevelFields,
        missingAfterFill: fillResult.missing,
        recoveryAttempt: true,
        recoveryExtractedFields: extractedMissing,
      } as any;

      // Reconstruir payload com novos campos
      const finalAttributes2 = buildFinalAttributesPayload(
        fillResult.filled,
        cleanedAttrs,
        includeNonRequired
      );

      // Reconstruir payload com novos campos - RESPEITANDO REGRAS DE CATÁLOGO
      // IMPORTANTE: listing_type_id SEMPRE presente
      newItem = {
        category_id: itemData.category_id,
        currency_id: itemData.currency_id || "BRL",
        listing_type_id: listingTypeToUse, // OBRIGATÓRIO - SEMPRE PRESENTE
        condition: itemData.condition || "new",
        price: checklist?.override_price ?? (checklist?.price !== false ? itemData.price : undefined),
        available_quantity: checklist?.override_quantity ?? (checklist?.quantity !== false ? itemData.available_quantity : 1),
        attributes: finalAttributes2.length > 0 ? finalAttributes2 : undefined,
      };

      // TÍTULO: Usar override do usuário se disponível, senão usar do item fonte
      if (canIncludeTitle) {
        newItem.title = checklist?.override_title || itemData.title;
      }

      // FOTOS: Sempre incluir quando criando como normal
      if (canIncludePictures) {
        newItem.pictures = itemData.pictures.map((p: any) => ({ source: p.url || p.secure_url }));
      }

      // IMPORTANTE: NÃO incluir catalog_product_id quando criando como normal
      if (!createAsNormal && sourceIsCatalog && catalogDiagnostic.catalog_product_id) {
        newItem.catalog_product_id = catalogDiagnostic.catalog_product_id;
      }

      // Adicionar body-level fields (novos após retry)
      for (const [fieldName, fieldValue] of Object.entries(fillResult.bodyLevelFields)) {
        newItem[fieldName] = fieldValue;
        console.log(`[ad-action-execute] [RETRY] Added body-level field: ${fieldName} = "${fieldValue}"`);
      }

      // CONDICIONAL: Re-adicionar description se NÃO for catálogo
      if (canIncludeDescription && !isCatalogId(itemId)) {
      const descResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}/description`, {
          headers: { "Authorization": `Bearer ${currentAccessToken}` },
        });
        if (descResponse.ok) {
          const descData = await descResponse.json();
          newItem.description = { plain_text: descData.plain_text || descData.text };
        }
      }

      // Sanitize novamente
      newItem = sanitizePayload(newItem);

      console.log(`[ad-action-execute] [RETRY] Sending clone request with ${finalAttributes2.length} attributes`);
      console.log(`[ad-action-execute] [RETRY] Body-level fields: ${JSON.stringify(fillResult.bodyLevelFields)}`);
      console.log(`[ad-action-execute] [RETRY] listing_type_id: ${listingTypeToUse}`);

      // =========================================================================
      // CREATE ITEM (2ª tentativa) - SEMPRE POST /items
      // =========================================================================
      console.log(`[ad-action-execute] === API REQUEST (Pass 2 - RETRY) ===`);
      console.log(`[ad-action-execute] request_kind=create`);
      console.log(`[ad-action-execute] method=${CREATE_METHOD}`);
      console.log(`[ad-action-execute] endpoint=${CREATE_ENDPOINT}`);
      
      createResponse = await fetch(CREATE_ENDPOINT, {
        method: CREATE_METHOD,
        headers: {
          "Authorization": `Bearer ${currentAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newItem),
      });

      createData = await createResponse.json();
    }

    // Se chegamos aqui e ainda falhou, sair do loop para evitar loop infinito
    break;
  }
  
  if (!createResponse.ok) {
    console.error(`[ad-action-execute] Clone ${CREATE_METHOD} ${CREATE_ENDPOINT} FAILED:`, JSON.stringify({
      status: createResponse.status,
      error: createData,
      payload_attributes_count: finalAttributes.length,
      body_level_fields: fillResult.bodyLevelFields,
      listing_type_used: listingTypeToUse,
      listing_type_fallback_used: listingTypeFallbackUsed,
      listing_type_fallback_chain: listingTypeFallbackChain,
      api_suggested_types: apiSuggestedTypes,
    }));

    // Verificar se é erro de campos obrigatórios (para logging detalhado)
    const isRequiredFieldError = 
      createData?.cause?.some((c: any) => c.code === "item.attributes.missing_required") ||
      createData?.message?.includes("required_fields") ||
      createData?.message?.includes("body.required_fields");

    // Verificar se é erro específico de listing_type_id (required ou unavailable)
    const isListingTypeRequiredError = isListingTypeError(createData);
    const isListingTypeUnavailable = isListingTypeUnavailableError(createData);

    if (isListingTypeRequiredError || isListingTypeUnavailable) {
      console.error(`[ad-action-execute] LISTING_TYPE_ID ERROR: All fallbacks exhausted`);
      console.error(`[ad-action-execute]   → Fallback chain: ${listingTypeFallbackChain.join(" → ") || "(none)"}`);
      console.error(`[ad-action-execute]   → API suggested types: ${apiSuggestedTypes.join(", ") || "(none)"}`);
      
      return {
        success: false,
        error: isListingTypeUnavailable ? "LISTING_TYPE_UNAVAILABLE" : "LISTING_TYPE_VALIDATION_FAILED",
        message: `Não foi possível publicar com os tipos de anúncio disponíveis para essa categoria. Verifique o tipo de anúncio permitido e preferências de envio da conta.`,
        user_guidance: isListingTypeUnavailable 
          ? `O tipo de anúncio selecionado não está disponível para sua conta. Tipos sugeridos: ${apiSuggestedTypes.join(", ") || "não identificados"}.`
          : "O tipo de anúncio não é compatível com esta categoria. Tente novamente ou entre em contato com o suporte.",
        api_error: createData,
        listing_type_resolution: {
          original_source: listingTypeResolution.source,
          last_attempted: lastListingTypeAttempted,
          fallback_used: listingTypeFallbackUsed,
          fallback_chain: listingTypeFallbackChain,
          api_suggested_types: apiSuggestedTypes,
          fallback_index: currentFallbackIndex,
        },
        payload_sent: newItem,
        catalog_info: catalogInfo,
        api_request: {
          request_kind: "create",
          http_method: CREATE_METHOD,
          endpoint_url: CREATE_ENDPOINT,
        },
      };
    }

    if (isRequiredFieldError) {
      console.error(`[ad-action-execute] ML still reports missing required fields despite validation!`);
      console.error(`[ad-action-execute] This may indicate the category has additional unlisted requirements`);
      
      // Última tentativa de extração para diagnóstico
      const finalExtracted = extractMissingFieldsFromApiError(createData);
      (requiredCheck as any).finalExtractedMissing = finalExtracted;
    }

    // Verificar se é erro de requiresPictures (listing_type exige fotos mas não enviamos)
    const requiresPicturesError = createData?.cause?.some((c: any) => 
      c.code === "item.pictures.required" ||
      c.code === "pictures.required" ||
      c.message?.includes("pictures") ||
      c.message?.includes("requiresPictures")
    ) || createData?.message?.toLowerCase().includes("picture");

    if (requiresPicturesError && isCatalogSource && picturesBlocked) {
      console.warn(`[ad-action-execute] CATALOG PICTURES CONFLICT: ML requires pictures but they are blocked for catalog items`);
      return {
        success: false,
        error: "CATALOG_PICTURES_BLOCKED",
        message: "Este produto de catálogo exige fotos para o tipo de anúncio, mas fotos são gerenciadas pelo catálogo. Não é possível clonar este item diretamente.",
        user_guidance: "Itens de catálogo têm fotos gerenciadas pelo Mercado Livre. O tipo de anúncio selecionado exige fotos próprias. Tente usar a opção de cadastrar no catálogo diretamente pelo painel do Mercado Livre.",
        api_error: createData,
        catalog_diagnostic: { 
          ...catalogDiagnostic, 
          listing_type_strategy: listingTypeStrategy,
          listing_type_attempted: listingTypeToUse,
          listing_type_fallback_used: listingTypeFallbackUsed,
          pictures_blocked: picturesBlocked,
        },
        catalog_info: catalogInfo,
        api_request: {
          request_kind: "create",
          http_method: CREATE_METHOD,
          endpoint_url: CREATE_ENDPOINT,
        },
      };
    }

    // Se for erro de invalid_fields com title e for catálogo, dar mensagem amigável
    const hasInvalidTitle = createData?.cause?.some((c: any) => 
      c.code === "item.invalid_title" || 
      (c.code?.includes("invalid_fields") && c.message?.includes("title"))
    ) || createData?.message?.includes("title");

    if (hasInvalidTitle && isCatalogSource) {
      return {
        success: false,
        error: "CATALOG_TITLE_BLOCKED",
        message: "Este anúncio pertence ao catálogo do Mercado Livre. O campo 'título' é controlado pelo catálogo e não pode ser modificado.",
        user_guidance: "Itens de catálogo têm título, fotos e descrição gerenciados pelo Mercado Livre. Esta é uma limitação da plataforma, não uma falha do sistema.",
        api_error: createData,
        catalog_diagnostic: {
          ...catalogDiagnostic,
          listing_type_strategy: listingTypeStrategy,
          listing_type_attempted: listingTypeToUse,
        },
        catalog_info: catalogInfo,
        api_request: {
          request_kind: "create",
          http_method: CREATE_METHOD,
          endpoint_url: CREATE_ENDPOINT,
        },
      };
    }

    return { 
      success: false, 
      error: createData.message || "Failed to create cloned item", 
      api_error: createData,
      payload_sent: newItem,
      attributes_sent: (newItem.attributes || []).map((a: any) => ({ id: a.id, value: a.value_name || a.value_id })),
      required_check: requiredCheck,
      catalog_info: catalogInfo,
      catalog_diagnostic: {
        ...catalogDiagnostic,
        listing_type_strategy: listingTypeStrategy,
        listing_type_attempted: listingTypeToUse,
        listing_type_fallback_used: listingTypeFallbackUsed,
        removed_not_modifiable: removedNotModifiable,
      },
      // Log detalhado da chamada
      api_request: {
        request_kind: "create",
        http_method: CREATE_METHOD,
        endpoint_url: CREATE_ENDPOINT,
      },
    };
  }

  console.log(`[ad-action-execute] Clone SUCCESS: ${createData.id}`);
  console.log(`[ad-action-execute] === FINAL API CALL SUMMARY ===`);
  console.log(`[ad-action-execute] request_kind=create | method=${CREATE_METHOD} | endpoint=${CREATE_ENDPOINT} | result=SUCCESS`);
  console.log(`[ad-action-execute] listing_type_id=${listingTypeToUse} | fallback_used=${listingTypeFallbackUsed}`);
  console.log(`[ad-action-execute] title_fallback_used=${createdWithoutTitle} | removed_fields=${fallbackRemovedFields.join(",") || "none"}`);

  // =========================================================================
  // POST-CREATE TITLE UPDATE: Se criou sem título, tentar PATCH com título
  // Aplicável quando: CATALOG_FALLBACK removeu título e usuário forneceu override
  // =========================================================================
  if (createdWithoutTitle && originalTitle) {
    const newItemId = createData.id;
    console.log(`[ad-action-execute] === CATALOG_FALLBACK: Attempting post-create title update via PATCH ===`);
    console.log(`[ad-action-execute] new_item_id=${newItemId}, title="${originalTitle.substring(0, 40)}..."`);
    
    try {
      const patchResponse = await fetch(`https://api.mercadolibre.com/items/${newItemId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${currentAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: originalTitle }),
      });
      
      if (patchResponse.ok) {
        console.log(`[ad-action-execute] CATALOG_FALLBACK: Title updated successfully via PATCH`);
        postCreateTitleUpdate = "success";
      } else {
        const patchError = await patchResponse.json().catch(() => ({}));
        console.warn(`[ad-action-execute] CATALOG_FALLBACK: Title PATCH blocked - ${patchResponse.status}`, patchError);
        postCreateTitleUpdate = "blocked_or_not_allowed";
      }
    } catch (patchErr: any) {
      console.warn(`[ad-action-execute] CATALOG_FALLBACK: Title PATCH exception - ${patchErr.message}`);
      postCreateTitleUpdate = "exception";
    }
  }

  // =========================================================================
  // CACHE: Salvar listing_type_id que funcionou para a categoria
  // Próximas clonagens da mesma categoria usarão este tipo primeiro
  // =========================================================================
  if (categoryIdForCache && listingTypeToUse) {
    saveListingTypeCacheForCategory(categoryIdForCache, listingTypeToUse);
  }

  // =========================================================================
  // WARNINGS: Processar warnings não críticos (ex: shipping.lost_me1_by_user)
  // Estes warnings NÃO devem bloquear a operação, apenas registrar em log
  // =========================================================================
  const warnings: string[] = [];
  if (createData.warnings && Array.isArray(createData.warnings)) {
    for (const warning of createData.warnings) {
      const warningCode = typeof warning === "string" ? warning : warning.code || warning.message || JSON.stringify(warning);
      console.warn(`[ad-action-execute] WARNING (non-blocking): ${warningCode}`);
      warnings.push(warningCode);
    }
  }

  return { 
    success: true, 
    message: catalogInfo 
      ? "Item clonado com sucesso a partir do catálogo" 
      : "Item cloned successfully", 
    new_item_id: createData.id,
    permalink: createData.permalink,
    attributes_filled: fillResult.log.filter(l => l.source !== "item_fonte").map(l => l.attrId),
    body_level_fields: fillResult.bodyLevelFields,
    required_check: requiredCheck,
    listing_type_resolution: {
      listing_type_used: listingTypeToUse,
      source: listingTypeResolution.source,
      strategy: listingTypeStrategy,
      fallback_used: listingTypeFallbackUsed,
      fallback_chain: listingTypeFallbackChain,
      api_suggested_types: apiSuggestedTypes.length > 0 ? apiSuggestedTypes : undefined,
      fallback_index: listingTypeFallbackUsed ? currentFallbackIndex : undefined,
    },
    // CATALOG_FALLBACK info
    catalog_fallback: createdWithoutTitle ? {
      title_fallback_used: true,
      fallback_removed_fields: fallbackRemovedFields,
      original_title: originalTitle,
      post_create_title_update: postCreateTitleUpdate,
    } : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    catalog_info: catalogInfo,
    catalog_diagnostic: {
      ...catalogDiagnostic,
      listing_type_strategy: listingTypeStrategy,
      listing_type_used: listingTypeToUse,
      removed_not_modifiable: removedNotModifiable,
    },
    // Log detalhado da chamada
    api_request: {
      request_kind: "create",
      http_method: CREATE_METHOD,
      endpoint_url: CREATE_ENDPOINT,
    },
  };
}
