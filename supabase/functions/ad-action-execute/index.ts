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
// CACHE DE REGRAS ANTI-CATÁLOGO POR CATEGORIA
// Quando a API exige family_name, salvamos para já incluir no próximo POST
// ============================================================================
interface AntiCatalogCategoryRule {
  family_name_required: boolean;
  default_family_name?: string;
  last_updated: number;
}

const antiCatalogCategoryRulesCache = new Map<string, AntiCatalogCategoryRule>();

// ============================================================================
// DEFAULTS DE ATRIBUTOS POR CATEGORIA (tabela interna)
// Chave: (categoryId, attrId) → value_id ou value_name
// NOTA: family_name é enviado SOMENTE se a API retornar body.required_fields pedindo
// ============================================================================
const CATEGORY_ATTRIBUTE_DEFAULTS: Record<string, Record<string, { value_name?: string; value_id?: string }>> = {
  // Defaults genéricos aplicáveis a múltiplas categorias
  "*": {
    "IS_FLAMMABLE": { value_name: "Não" },
    "IS_FRAGILE": { value_name: "Não" },
    "HAS_FRAGRANCE": { value_name: "Não" },
    "CONTAINS_LATEX": { value_name: "Não" },
  },
  // Defaults específicos por categoria (expandir via Admin futuramente)
  "MLB1051": { },
  "MLB1684": { },
  "MLB1953": { },
};

// ============================================================================
// BODY-LEVEL FIELDS: Campos que podem ir no body raiz
// family_name: NUNCA enviar por padrão. Só enviar se a API pedir após erro.
// catalog_listing: NUNCA enviar (v3)
// ============================================================================
const BODY_LEVEL_REQUIRED_FIELDS: Record<string, { 
  fallbackFromTitle?: boolean;
  defaultValue?: string;
  maxLength?: number;
}> = {
  // family_name REMOVIDO do padrão - só será adicionado via retry se API exigir
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
// REMOVIDO: catalog_listing, family_name - nunca enviar por padrão (v3)
const ALLOWED_BODY_FIELDS = new Set([
  "title", "category_id", "currency_id", "listing_type_id", "condition",
  "pictures", "price", "available_quantity", "attributes", "description",
  "buying_mode", "sale_terms", "shipping", "variations", "status",
  // family_name: só adicionado dinamicamente via retry ou cache
  // REMOVIDO: "catalog_product_id" - anti-catálogo
  // REMOVIDO: "catalog_listing" - v3 anti-catálogo não envia este campo
]);

// CAMPOS PROIBIDOS NO ANTI-CATÁLOGO v3 (nunca enviar)
const ANTI_CATALOG_V3_FORBIDDEN_BODY_FIELDS = new Set([
  "catalog_listing",
  "catalog_product_id",
  "parent_item_id",
  "product_id",
  // family_name é adicionado dinamicamente - não proibido de forma absoluta
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
 */
function resolveListingTypeId(
  sourceListingType: string | undefined,
  categoryId?: string,
  defaultType: string = DEFAULT_LISTING_TYPE_ID,
  suggestedTypes: string[] = [],
  fallbackIndex: number = -1
): ListingTypeResolution {
  // FALLBACK GUIADO PELA API
  if (fallbackIndex >= 0 && suggestedTypes.length > 0) {
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

  if (fallbackIndex >= 0 && fallbackIndex < DEFAULT_LISTING_TYPE_FALLBACKS.length) {
    return {
      listing_type_id: DEFAULT_LISTING_TYPE_FALLBACKS[fallbackIndex],
      source: "fallback",
      fallback_index: fallbackIndex,
    };
  }

  // CACHE DA CATEGORIA
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

  // ITEM FONTE
  if (sourceListingType && sourceListingType.trim() && sourceListingType.trim().toLowerCase() !== "free") {
    return {
      listing_type_id: sourceListingType.trim(),
      source: "source_item",
    };
  }

  if (sourceListingType && sourceListingType.trim().toLowerCase() === "free") {
    console.log(`[ad-action-execute] Source listing_type is "free" - using default ${defaultType} instead`);
  }

  return {
    listing_type_id: defaultType,
    source: "default",
  };
}

function saveListingTypeCacheForCategory(categoryId: string, listingTypeId: string): void {
  if (!categoryId || !listingTypeId) return;
  listingTypeCacheByCategory.set(categoryId, listingTypeId);
  console.log(`[ad-action-execute] CACHE SAVE: category ${categoryId} → ${listingTypeId}`);
}

function isListingTypeError(apiError: any): boolean {
  if (!apiError) return false;

  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      if (
        cause.code === "body.required_fields" ||
        cause.code === "item.invalid_listing_type" ||
        cause.code?.includes("listing_type") ||
        (cause.message && cause.message.toLowerCase().includes("listing_type"))
      ) {
        if (
          cause.message?.includes("listing_type_id") ||
          cause.references?.includes("listing_type_id")
        ) {
          return true;
        }
      }
    }
  }

  if (apiError.message) {
    const msg = apiError.message.toLowerCase();
    if (msg.includes("listing_type_id") && (msg.includes("required") || msg.includes("invalid"))) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// REGRA OFICIAL DE RESOLUÇÃO DE CATÁLOGO
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
// ============================================================================
const CATALOG_FORCING_ATTRIBUTES = new Set([
  "GTIN",
  "EAN", 
  "UPC",
  "ISBN",
  "MPN",
  "PART_NUMBER",
  "ALPHANUMERIC_MODEL",
  "MANUFACTURER_CODE",
  // Não remover SKU/SELLER_SKU aqui - controlado via checklist
]);

// ATRIBUTOS ESSENCIAIS: Sempre copiar do item de origem se existirem
const ESSENTIAL_ATTRIBUTES = new Set([
  "BRAND",
  "MODEL",
  "FINISH",
  "GRAMMAGE",
  "PAPER_SIZE",
  "PAPER_TYPE",
  "PAPER_FORMAT",
  "PAPER_WEIGHT",
  "SHEETS_NUMBER",
  "UNITS_PER_PACKAGE",
  // Adicionar outros conforme necessário
]);

/**
 * normalizeAndCleanAttributes - Normaliza e filtra atributos
 * REGRA v3: Remover ITEM_CONDITION, PACKAGE_*, e identificadores de catálogo
 */
function normalizeAndCleanAttributes(
  rawAttributes: any[],
  categoryAttributes: CategoryAttribute[],
  removeNotModifiable: boolean = true,
  removeCatalogForcing: boolean = true
): { 
  attrsById: Map<string, NormalizedAttribute>; 
  cleanedAttrs: NormalizedAttribute[];
  removedNotModifiable: string[];
  removedCatalogForcing: string[];
} {
  const attrsById = new Map<string, NormalizedAttribute>();
  const cleanedAttrs: NormalizedAttribute[] = [];
  const removedNotModifiable: string[] = [];
  const removedCatalogForcing: string[] = [];

  // Mapa de atributos da categoria para verificar tags
  const catAttrById = new Map<string, CategoryAttribute>();
  for (const attr of categoryAttributes) {
    catAttrById.set(attr.id, attr);
  }

  for (const attr of rawAttributes || []) {
    if (!attr?.id) continue;

    const attrIdUpper = attr.id.toUpperCase();

    // ITEM_CONDITION: Sempre remover (conflita com body.condition)
    if (attrIdUpper === "ITEM_CONDITION") {
      removedNotModifiable.push(attr.id);
      continue;
    }

    // PACKAGE_*: Sempre remover (conflita com SELLER_PACKAGE_*)
    if (attrIdUpper.startsWith("PACKAGE_") && !attrIdUpper.startsWith("SELLER_PACKAGE")) {
      removedNotModifiable.push(attr.id);
      continue;
    }

    // Remover not-modifiable se solicitado
    if (removeNotModifiable) {
      const catAttr = catAttrById.get(attr.id);
      if ((catAttr?.tags as any)?.not_modifiable === true) {
        removedNotModifiable.push(attr.id);
        continue;
      }
    }

    // Remover atributos que forçam catálogo
    if (removeCatalogForcing && CATALOG_FORCING_ATTRIBUTES.has(attrIdUpper)) {
      removedCatalogForcing.push(attr.id);
      continue;
    }

    // Normalizar
    const normalized: NormalizedAttribute = { id: attr.id };
    
    // Priorizar value_id se existir
    if (attr.value_id && attr.value_id !== "-1") {
      normalized.value_id = attr.value_id;
    }
    if (attr.value_name) {
      normalized.value_name = attr.value_name;
    }
    if (attr.value_struct) {
      normalized.value_struct = attr.value_struct;
    }

    // Só adicionar se tiver algum valor
    if (normalized.value_id || normalized.value_name || normalized.value_struct) {
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
  requiredBodyFieldKeys: string[];
  filledBodyByFallback: string[];
  filledBodyByDefaults: string[];
}

interface FillEngineInput {
  requiredIds: string[];
  extraBodyFields?: string[]; // Campos body-level adicionais (ex: extraídos do erro da API)
  categoryAttributes: CategoryAttribute[];
  sourceAttrsById: Map<string, NormalizedAttribute>;
  itemData: any;
  categoryId: string;
}

/**
 * Motor único de preenchimento - pode ser chamado múltiplas vezes
 * (preflight validation → fill → second validation)
 * 
 * MUDANÇA v3: NÃO preencher family_name por padrão
 * Só preencher se vier em extraBodyFields (após erro da API)
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
  // FASE 1: Campos body-level - SOMENTE SE VIERAM EM extraBodyFields
  // v3: Não preencher family_name automaticamente
  // =========================================================================
  for (const fieldKey of extraBodyFields) {
    const fieldKeyLower = fieldKey.toLowerCase();
    requiredBodyFieldKeys.push(fieldKeyLower);
    
    let resolvedValue: string | undefined;
    let source = "";

    // 1. Tentar buscar do snapshot/item fonte
    const aliases = BODY_LEVEL_FIELD_ALIASES[fieldKeyLower] || [fieldKey, fieldKey.toUpperCase()];
    for (const alias of aliases) {
      const sourceAttr = sourceAttrsById.get(alias);
      if (sourceAttr?.value_name) {
        resolvedValue = sourceAttr.value_name;
        source = "snapshot:attribute";
        break;
      }
      const rawAttr = itemData.attributes?.find((a: any) => a.id === alias);
      if (rawAttr?.value_name) {
        resolvedValue = rawAttr.value_name;
        source = "snapshot:raw";
        break;
      }
    }

    // 2. Verificar cache de regras anti-catálogo por categoria
    if (!resolvedValue && fieldKeyLower === "family_name") {
      const categoryRule = antiCatalogCategoryRulesCache.get(categoryId);
      if (categoryRule?.default_family_name) {
        resolvedValue = categoryRule.default_family_name;
        source = "cache:categoria";
      }
    }

    // 3. Fallback baseado no título (para family_name)
    if (!resolvedValue && fieldKeyLower === "family_name" && itemData.title) {
      const cleanTitle = itemData.title
        .replace(/\s*[-–]\s*\d+\s*(unidades?|pcs?|un)?\s*$/i, "")
        .replace(/\s*\d{4,}\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      
      let fallbackValue = cleanTitle.split(" ").slice(0, 5).join(" ");
      if (fallbackValue.length > 60) {
        fallbackValue = fallbackValue.substring(0, 60).replace(/\s+\S*$/, "");
      }
      
      resolvedValue = fallbackValue || itemData.title.split(" ").slice(0, 4).join(" ");
      source = "fallback:titulo_limpo";
      filledBodyByFallback.push(fieldKeyLower);
    }

    // 4. Fallback neutro baseado na categoria
    if (!resolvedValue) {
      resolvedValue = "Produto";
      source = "fallback:neutro";
      filledBodyByFallback.push(fieldKeyLower);
      console.warn(`[ad-action-execute] WARNING: Using neutral fallback for ${fieldKeyLower}. Consider adding category-specific default.`);
    }

    bodyLevelFields[fieldKeyLower] = resolvedValue;
    log.push({ attrId: fieldKeyLower, source, value: resolvedValue, target: "body" });
    console.log(`[ad-action-execute] Body field ${fieldKeyLower}: ✓ ${source} = "${resolvedValue}"`);
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

    if (resolvedValue || resolvedValueId) {
      const filledAttr: NormalizedAttribute = {
        id: reqId,
        value_id: resolvedValueId,
        value_name: resolvedValue,
      };
      filled.push(filledAttr);
      log.push({ attrId: reqId, source, value: resolvedValue || resolvedValueId, target: "attributes" });
      console.log(`[ad-action-execute] Attr ${reqId}: ✓ ${source} = ${resolvedValueId || `"${resolvedValue}"`}`);
    } else {
      missing.push(reqId);
      console.log(`[ad-action-execute] Attr ${reqId}: ✗ MISSING`);
    }
  }

  return {
    filled,
    missing,
    bodyLevelFields,
    log,
    requiredBodyFieldKeys,
    filledBodyByFallback,
    filledBodyByDefaults,
  };
}

// ============================================================================
// ETAPA 5: Construir payload final de atributos
// v3: Obrigatórios + Essenciais (não todos)
// ============================================================================
function buildFinalAttributesPayload(
  filledRequired: NormalizedAttribute[],
  sourceAttrs: NormalizedAttribute[],
  requiredIds: string[],
  essentialOnlyMode: boolean = true
): NormalizedAttribute[] {
  const finalAttrs: NormalizedAttribute[] = [];
  const addedIds = new Set<string>();
  const requiredSet = new Set(requiredIds);

  // 1. Adicionar obrigatórios preenchidos
  for (const attr of filledRequired) {
    if (!addedIds.has(attr.id)) {
      finalAttrs.push(attr);
      addedIds.add(attr.id);
    }
  }

  // 2. Adicionar essenciais do item de origem
  for (const attr of sourceAttrs) {
    if (!addedIds.has(attr.id)) {
      const attrIdUpper = attr.id.toUpperCase();
      
      // Se é obrigatório (não preenchido acima), adicionar
      if (requiredSet.has(attr.id)) {
        finalAttrs.push(attr);
        addedIds.add(attr.id);
        continue;
      }
      
      // Se é essencial (BRAND, PAPER_*, etc.), adicionar
      if (ESSENTIAL_ATTRIBUTES.has(attrIdUpper)) {
        finalAttrs.push(attr);
        addedIds.add(attr.id);
        continue;
      }
      
      // v3: Só adicionar não-essenciais se essentialOnlyMode=false
      if (!essentialOnlyMode) {
        finalAttrs.push(attr);
        addedIds.add(attr.id);
      }
    }
  }

  // Remover duplicatas finais
  const uniqueAttrs = Array.from(
    new Map(finalAttrs.map(a => [a.id, a])).values()
  );

  console.log(`[ad-action-execute] Final payload: ${uniqueAttrs.length} attributes (${filledRequired.length} required, essentialOnly=${essentialOnlyMode})`);
  return uniqueAttrs;
}

// ============================================================================
// HELPERS PARA DETECÇÃO DE ERROS
// ============================================================================

function extractMissingFieldsFromApiError(apiError: any): { 
  bodyFields: string[]; 
  attributeFields: string[];
} {
  const bodyFields: string[] = [];
  const attributeFields: string[] = [];

  if (!apiError) return { bodyFields, attributeFields };

  // Verificar no cause[]
  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      if (cause.code === "body.required_fields") {
        // Campos body-level
        const refs = cause.references || [];
        for (const ref of refs) {
          if (typeof ref === "string") {
            bodyFields.push(ref);
          }
        }
      } else if (cause.code === "item.attributes.missing_required") {
        // Atributos
        const refs = cause.references || [];
        for (const ref of refs) {
          if (typeof ref === "string") {
            attributeFields.push(ref);
          }
        }
      }
    }
  }

  return { bodyFields, attributeFields };
}

function isTitleInvalidFieldsError(apiError: any): boolean {
  if (!apiError) return false;

  // Verificar no cause[]
  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      if (
        cause.code === "body.invalid_fields" &&
        cause.message?.toLowerCase().includes("title")
      ) {
        return true;
      }
    }
  }

  // Verificar na message principal
  if (apiError.message) {
    const msg = apiError.message.toLowerCase();
    if (msg.includes("invalid_fields") && msg.includes("title")) {
      return true;
    }
  }

  return false;
}

function extractInvalidFields(apiError: any): string[] {
  const fields: string[] = [];

  if (!apiError) return fields;

  if (apiError.cause && Array.isArray(apiError.cause)) {
    for (const cause of apiError.cause) {
      if (cause.code === "body.invalid_fields") {
        // Extrair campos da mensagem
        const match = cause.message?.match(/\[([^\]]+)\]/);
        if (match) {
          const extracted = match[1].split(",").map((f: string) => f.trim());
          fields.push(...extracted);
        }
      }
    }
  }

  return fields;
}

function is401Error(response: Response): boolean {
  return response.status === 401;
}

// ============================================================================
// TOKEN REFRESH HELPERS
// ============================================================================

async function tryRefreshToken(
  supabase: any,
  mlAccountId: string
): Promise<{ success: boolean; newAccessToken?: string; error?: string }> {
  try {
    console.log(`[ad-action-execute] Attempting token refresh for account ${mlAccountId}`);
    
    const ML_APP_ID = Deno.env.get('ML_APP_ID') || '';
    const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY') || '';
    
    // Buscar refresh_token da conta
    const { data: account, error: accountError } = await supabase
      .from('ml_accounts')
      .select('refresh_token, ml_user_id')
      .eq('id', mlAccountId)
      .single();
    
    if (accountError || !account) {
      console.error(`[ad-action-execute] Account not found for refresh: ${accountError?.message}`);
      return { success: false, error: 'Account not found' };
    }
    
    if (!account.refresh_token) {
      console.error(`[ad-action-execute] No refresh token for account ${mlAccountId}`);
      return { success: false, error: 'No refresh token' };
    }
    
    // Chamar API do ML para refresh
    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: account.refresh_token,
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`[ad-action-execute] Token refresh failed: ${tokenResponse.status} ${errorText}`);
      
      // Marcar conta como revogada se invalid_grant
      if (errorText.includes('invalid_grant')) {
        await supabase
          .from('ml_accounts')
          .update({
            connection_status: 'revoked',
            is_active: false,
            last_api_error_code: 'invalid_grant',
            last_api_error_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', mlAccountId);
      }
      
      return { success: false, error: 'Token refresh failed' };
    }
    
    const tokenData = await tokenResponse.json();
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
    const now = new Date().toISOString();
    
    // Atualizar tokens na conta
    await supabase
      .from('ml_accounts')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        connection_status: 'connected',
        is_active: true,
        last_token_refresh_at: now,
        last_api_ok_at: now,
        last_api_error_code: null,
        last_api_error_at: null,
        consecutive_failures: 0,
        updated_at: now,
      })
      .eq('id', mlAccountId);
    
    console.log(`[ad-action-execute] Token refreshed successfully for account ${mlAccountId}`);
    return { success: true, newAccessToken: tokenData.access_token };
  } catch (err: any) {
    console.error(`[ad-action-execute] Token refresh exception: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function validateAndRefreshTokenIfNeeded(
  accessToken: string,
  supabase: any,
  mlAccountId: string
): Promise<{ valid: boolean; accessToken?: string }> {
  // Testar token atual
  const testResponse = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (testResponse.ok) {
    return { valid: true, accessToken };
  }
  
  if (testResponse.status === 401) {
    // Tentar refresh
    const refreshResult = await tryRefreshToken(supabase, mlAccountId);
    if (refreshResult.success && refreshResult.newAccessToken) {
      return { valid: true, accessToken: refreshResult.newAccessToken };
    }
  }
  
  return { valid: false };
}

// ============================================================================
// SANITIZER DE PAYLOAD
// v3: Remover campos proibidos, permitir family_name se adicionado via retry
// ============================================================================

function sanitizePayload(payload: any, allowFamilyName: boolean = false): any {
  const sanitized: any = {};
  
  // Campos dinamicamente permitidos (via retry)
  const dynamicAllowed = new Set(ALLOWED_BODY_FIELDS);
  if (allowFamilyName) {
    dynamicAllowed.add("family_name");
  }
  
  for (const [key, value] of Object.entries(payload)) {
    // v3: Remover campos proibidos no anti-catálogo
    if (ANTI_CATALOG_V3_FORBIDDEN_BODY_FIELDS.has(key)) {
      continue;
    }
    
    if (dynamicAllowed.has(key) && value !== undefined) {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
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
              supabase,
              action.ml_account_id
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
  supabase?: any,
  mlAccountId?: string
) {
  let currentAccessToken = accessToken;
  let itemData = snapshot;
  let resolvedItemId = itemId;
  let catalogInfo: any = null;

  console.log(`[ad-action-execute] Clone requested for ID: ${itemId}`);
  console.log(`[ad-action-execute] ID type analysis: isRegularItemId=${isRegularItemId(itemId)}, isCatalogId=${isCatalogId(itemId)}`);

  // =========================================================================
  // GUARD DE AUTENTICAÇÃO
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
      };
    }
    
    currentAccessToken = authCheck.accessToken!;
    console.log(`[ad-action-execute] AUTH GUARD: Token validated/refreshed successfully`);
  }

  // If no snapshot, we need to fetch item data
  if (!itemData || Object.keys(itemData).length === 0) {
    
    if (isRegularItemId(itemId)) {
      console.log(`[ad-action-execute] PRIORITY PATH: Regular item ID (MLB) detected`);
    } else if (isCatalogId(itemId)) {
      console.log(`[ad-action-execute] FALLBACK PATH: Catalog ID (MLBU) detected`);

      const catalogResult = await resolveCatalogItemFallback(currentAccessToken, itemId);
      if (!catalogResult.ok) {
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
      };

      console.log(`[ad-action-execute] Catalog resolved to item: ${resolvedItemId}`);
    }

    // Fetch real item (MLB)
    console.log(`[ad-action-execute] Fetching item data: ${resolvedItemId}`);
    const getResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}`, {
      headers: { Authorization: `Bearer ${currentAccessToken}` },
    });

    if (!getResponse.ok) {
      const errBody = await getResponse.text().catch(() => "");
      return {
        success: false,
        error: getResponse.status === 404 ? "NOT_FOUND" : "FETCH_FAILED",
        message: `Falha ao buscar item ${resolvedItemId}`,
        api_status: getResponse.status,
        api_error: errBody,
      };
    }

    itemData = await getResponse.json();
  }

  // =========================================================================
  // DIAGNÓSTICO DE CATÁLOGO
  // =========================================================================
  const sourceIsCatalog = !!(
    itemData.catalog_product_id ||
    itemData.catalog_listing === true ||
    itemData.parent_item_id
  );

  console.log(`[ad-action-execute] === CATALOG DIAGNOSTIC ===`);
  console.log(`[ad-action-execute] source_is_catalog: ${sourceIsCatalog}`);
  console.log(`[ad-action-execute] catalog_product_id: ${itemData.catalog_product_id || "(none)"}`);

  // =========================================================================
  // ETAPA 2: Descobrir atributos obrigatórios da categoria
  // =========================================================================
  let categoryAttributes: CategoryAttribute[] = [];
  let requiredIds: string[] = [];
  const categoryId = itemData.category_id || "";

  if (categoryId) {
    const catResult = await fetchCategoryRequiredAttributes(currentAccessToken, categoryId);
    categoryAttributes = catResult.attributes;
    requiredIds = catResult.requiredIds;
  }

  // =========================================================================
  // VERIFICAR CACHE DE REGRAS ANTI-CATÁLOGO
  // Se já sabemos que esta categoria exige family_name, adicionar ao preflight
  // =========================================================================
  const categoryRule = antiCatalogCategoryRulesCache.get(categoryId);
  const preflightBodyFields: string[] = [];
  
  if (categoryRule?.family_name_required) {
    console.log(`[ad-action-execute] CACHE HIT: Category ${categoryId} requires family_name (cached)`);
    preflightBodyFields.push("family_name");
  }

  // =========================================================================
  // ETAPA 3: Normalizar atributos (remover ITEM_CONDITION, PACKAGE_*, identificadores de catálogo)
  // =========================================================================
  const { attrsById: sourceAttrsById, cleanedAttrs, removedNotModifiable, removedCatalogForcing } = normalizeAndCleanAttributes(
    itemData.attributes || [],
    categoryAttributes,
    true, // removeNotModifiable
    true  // removeCatalogForcing
  );

  // =========================================================================
  // ETAPA 4: PREFLIGHT - Validar e completar obrigatórios (1ª passagem)
  // v3: NÃO preencher family_name por padrão (exceto se cache indica necessidade)
  // =========================================================================
  console.log(`[ad-action-execute] === PREFLIGHT VALIDATION (Pass 1) ===`);
  
  let fillResult = validateAndFillRequiredAttributes({
    requiredIds,
    extraBodyFields: preflightBodyFields, // Inclui family_name se cache indicar
    categoryAttributes,
    sourceAttrsById,
    itemData,
    categoryId,
  });

  console.log(`[ad-action-execute] === REQUIRED CHECK SUMMARY (Pass 1) ===`);
  console.log(`[ad-action-execute] requiredIds: ${requiredIds.join(", ") || "(none)"}`);
  console.log(`[ad-action-execute] missingAfterFill: ${fillResult.missing.join(", ") || "(none)"}`);
  console.log(`[ad-action-execute] bodyFieldsFromCache: ${preflightBodyFields.join(", ") || "(none)"}`);

  if (fillResult.missing.length > 0) {
    return {
      success: false,
      error: "MISSING_REQUIRED_ATTRIBUTES",
      message: `Campos obrigatórios faltando: ${fillResult.missing.join(", ")}`,
      missing_required_attributes: fillResult.missing,
      category_id: categoryId,
    };
  }

  // =========================================================================
  // ETAPA 5: Montagem do payload
  // v3: Enviar obrigatórios + essenciais (BRAND, PAPER_*, etc.)
  // =========================================================================
  const essentialOnlyMode = true; // v3: sempre obrigatórios + essenciais
  
  const finalAttributes = buildFinalAttributesPayload(
    fillResult.filled,
    cleanedAttrs,
    requiredIds,
    essentialOnlyMode
  );

  // =========================================================================
  // LISTING TYPE RESOLUTION
  // =========================================================================
  let listingTypeResolution = resolveListingTypeId(
    itemData.listing_type_id,
    categoryId,
    DEFAULT_LISTING_TYPE_ID,
    [],
    -1
  );

  let listingTypeToUse = listingTypeResolution.listing_type_id;

  console.log(`[ad-action-execute] listing_type_id resolution: ${listingTypeToUse} (source: ${listingTypeResolution.source})`);

  // =========================================================================
  // SELLER_PACKAGE_* ATTRIBUTES
  // =========================================================================
  const sellerPackageAttributes: NormalizedAttribute[] = [];
  
  if (checklist?.seller_package_height && checklist.seller_package_height > 0) {
    sellerPackageAttributes.push({
      id: "SELLER_PACKAGE_HEIGHT",
      value_name: `${checklist.seller_package_height} cm`,
    });
  }
  if (checklist?.seller_package_width && checklist.seller_package_width > 0) {
    sellerPackageAttributes.push({
      id: "SELLER_PACKAGE_WIDTH",
      value_name: `${checklist.seller_package_width} cm`,
    });
  }
  if (checklist?.seller_package_length && checklist.seller_package_length > 0) {
    sellerPackageAttributes.push({
      id: "SELLER_PACKAGE_LENGTH",
      value_name: `${checklist.seller_package_length} cm`,
    });
  }
  if (checklist?.seller_package_weight && checklist.seller_package_weight > 0) {
    sellerPackageAttributes.push({
      id: "SELLER_PACKAGE_WEIGHT",
      value_name: `${checklist.seller_package_weight} g`,
    });
  }

  console.log(`[ad-action-execute] seller_package_* from checklist: ${sellerPackageAttributes.map(a => a.id).join(", ") || "(none)"}`);

  // =========================================================================
  // FILTRO FINAL DE ATRIBUTOS (GTIN/SKU conforme checkboxes)
  // =========================================================================
  const gtinIdentifiers = new Set(['GTIN', 'EAN', 'UPC', 'ISBN']);
  const skuIdentifiers = new Set(['SKU', 'SELLER_SKU']);
  
  const includeGtin = checklist?.include_gtin === true;
  const includeSku = checklist?.include_sku === true;
  
  const removedAttributes: string[] = [];
  
  // Mesclar seller_package_* com finalAttributes
  const packageAttrIds = new Set(sellerPackageAttributes.map(a => a.id));
  const attributesWithPackage = [
    ...sellerPackageAttributes,
    ...finalAttributes.filter(a => !packageAttrIds.has(a.id)),
  ];
  
  const filteredAttributes = attributesWithPackage.filter((attr: NormalizedAttribute) => {
    const attrIdUpper = attr.id?.toUpperCase() || '';
    
    // Controle de GTIN
    if (gtinIdentifiers.has(attrIdUpper) && !includeGtin) {
      removedAttributes.push(attr.id);
      return false;
    }
    
    // Controle de SKU
    if (skuIdentifiers.has(attrIdUpper) && !includeSku) {
      removedAttributes.push(attr.id);
      return false;
    }
    
    return true;
  });

  console.log(`[ad-action-execute] === ANTI-CATALOG ATTRIBUTE FILTER ===`);
  console.log(`[ad-action-execute] include_gtin: ${includeGtin}`);
  console.log(`[ad-action-execute] include_sku: ${includeSku}`);
  console.log(`[ad-action-execute] attributes_removed: [${removedAttributes.join(', ')}]`);
  console.log(`[ad-action-execute] attributes_after_filter: ${filteredAttributes.length}`);

  // =========================================================================
  // BUILD PAYLOAD - v3 Anti-catálogo
  // REMOVIDO: catalog_listing, catalog_product_id, product_id
  // family_name: só adicionar se cache indicar ou via retry
  // =========================================================================
  let newItem: any = {
    title: checklist?.final_title || checklist?.override_title || itemData.title,
    category_id: categoryId,
    currency_id: itemData.currency_id || "BRL",
    listing_type_id: listingTypeToUse,
    condition: itemData.condition || "new",
    price: checklist?.final_price ?? checklist?.override_price ?? itemData.price,
    available_quantity: checklist?.final_quantity ?? checklist?.override_quantity ?? itemData.available_quantity ?? 1,
    attributes: filteredAttributes.length > 0 ? filteredAttributes : undefined,
  };

  // Adicionar family_name se veio do preflight (cache)
  if (fillResult.bodyLevelFields.family_name) {
    newItem.family_name = fillResult.bodyLevelFields.family_name;
    console.log(`[ad-action-execute] family_name added from preflight: "${newItem.family_name}"`);
  }

  // FOTOS
  const picturesSource = checklist?.final_pictures || itemData.pictures;
  if (picturesSource && Array.isArray(picturesSource) && picturesSource.length > 0) {
    newItem.pictures = picturesSource.map((p: any) => ({ 
      source: p.secure_url || p.url || p.source 
    }));
    console.log(`[ad-action-execute] Pictures: ${newItem.pictures.length} images`);
  }

  // STATUS
  if (checklist?.create_paused === true) {
    newItem.status = "paused";
    console.log(`[ad-action-execute] Status: paused (user selected)`);
  }

  // DESCRIÇÃO
  if (checklist?.final_description || checklist?.override_description) {
    newItem.description = { plain_text: checklist.final_description || checklist.override_description };
    console.log(`[ad-action-execute] Description: from checklist`);
  } else {
    // Buscar descrição do item fonte
    try {
      const descResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}/description`, {
        headers: { Authorization: `Bearer ${currentAccessToken}` },
      });
      if (descResponse.ok) {
        const descData = await descResponse.json();
        newItem.description = { plain_text: descData.plain_text || descData.text };
        console.log(`[ad-action-execute] Description: from source item`);
      }
    } catch (e) {
      console.warn(`[ad-action-execute] Failed to fetch description: ${e}`);
    }
  }

  // Flag para controle de family_name no sanitizer
  let allowFamilyNameInPayload = !!newItem.family_name;

  // Sanitize - remove campos proibidos
  newItem = sanitizePayload(newItem, allowFamilyNameInPayload);

  // =========================================================================
  // DIAGNÓSTICO DETALHADO (para log e retorno)
  // =========================================================================
  const antiCatalogDiagnostic = {
    include_gtin: includeGtin,
    include_sku: includeSku,
    attributes_removed: [...removedNotModifiable, ...removedCatalogForcing, ...removedAttributes],
    attributes_ids_sent: (newItem.attributes || []).map((a: any) => a.id),
    payload_keys_sent: Object.keys(newItem),
    removed_fields: ["catalog_listing", "catalog_product_id", "product_id"],
    family_name_included: !!newItem.family_name,
    family_name_source: fillResult.bodyLevelFields.family_name 
      ? (preflightBodyFields.includes("family_name") ? "cache:categoria" : "retry") 
      : null,
  };
  
  console.log(`[ad-action-execute] === ANTI-CATALOG v3 DIAGNOSTIC ===`);
  console.log(JSON.stringify(antiCatalogDiagnostic, null, 2));

  // =========================================================================
  // CREATE ITEM - POST /items
  // =========================================================================
  const CREATE_ENDPOINT = "https://api.mercadolibre.com/items";
  const CREATE_METHOD = "POST";

  // =========================================================================
  // FAMILY_NAME HARDCODED - Categorias conhecidas que exigem este campo
  // =========================================================================
  const CATEGORY_FAMILY_NAME: Record<string, string> = {
    "MLB1684": "Etiquetas impressas",
  };

  if (newItem.category_id && CATEGORY_FAMILY_NAME[newItem.category_id] && !newItem.family_name) {
    newItem.family_name = CATEGORY_FAMILY_NAME[newItem.category_id];
    console.log(`[ad-action-execute] ✅ family_name adicionado para categoria ${newItem.category_id}: ${newItem.family_name}`);
  }

  console.log(`[ad-action-execute] === API REQUEST (1st attempt) ===`);
  console.log(`[ad-action-execute] method=${CREATE_METHOD}`);
  console.log(`[ad-action-execute] endpoint=${CREATE_ENDPOINT}`);
  console.log(`[ad-action-execute] payload_keys: ${Object.keys(newItem).join(", ")}`);
  console.log(`[ad-action-execute] family_name_present: ${!!newItem.family_name}`);

  let createResponse = await fetch(CREATE_ENDPOINT, {
    method: CREATE_METHOD,
    headers: {
      Authorization: `Bearer ${currentAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newItem),
  });

  let createData = await createResponse.json();

  // =========================================================================
  // TRATAMENTO 401 - TOKEN EXPIRADO
  // =========================================================================
  if (is401Error(createResponse) && supabase && mlAccountId) {
    console.warn(`[ad-action-execute] 401 UNAUTHORIZED - Attempting token refresh...`);
    
    const refreshResult = await tryRefreshToken(supabase, mlAccountId);
    if (refreshResult.success && refreshResult.newAccessToken) {
      currentAccessToken = refreshResult.newAccessToken;
      
      createResponse = await fetch(CREATE_ENDPOINT, {
        method: CREATE_METHOD,
        headers: {
          Authorization: `Bearer ${currentAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newItem),
      });
      createData = await createResponse.json();
    }
    
    if (is401Error(createResponse)) {
      return {
        success: false,
        error: "AUTH_EXPIRED",
        message: "Token expirado. Reconecte a conta do Mercado Livre.",
        requires_reconnection: true,
        api_error: createData,
      };
    }
  }

  // =========================================================================
  // RETRY: Se API pedir body.required_fields (ex: family_name)
  // Regra v3: Retry automático 1x, com telemetria e cache
  // =========================================================================
  let retryInfo: any = null;
  
  if (!createResponse.ok) {
    const extractedMissing = extractMissingFieldsFromApiError(createData);
    
    // Se API pediu campos body-level (ex: family_name), tentar preencher e reenviar
    if (extractedMissing.bodyFields.length > 0) {
      console.warn(`[ad-action-execute] API requires body fields: ${extractedMissing.bodyFields.join(", ")}`);
      
      retryInfo = {
        required_fields: extractedMissing.bodyFields,
        retry_count: 1,
        category_id: categoryId,
      };
      
      // Preencher campos body-level que a API exigiu
      const retryFillResult = validateAndFillRequiredAttributes({
        requiredIds,
        extraBodyFields: extractedMissing.bodyFields,
        categoryAttributes,
        sourceAttrsById,
        itemData,
        categoryId,
      });
      
      // Adicionar campos body ao payload
      for (const [fieldName, fieldValue] of Object.entries(retryFillResult.bodyLevelFields)) {
        newItem[fieldName] = fieldValue;
        console.log(`[ad-action-execute] [RETRY] Added body field: ${fieldName} = "${fieldValue}"`);
        
        // Salvar no cache de regras anti-catálogo
        if (fieldName === "family_name") {
          antiCatalogCategoryRulesCache.set(categoryId, {
            family_name_required: true,
            default_family_name: fieldValue,
            last_updated: Date.now(),
          });
          console.log(`[ad-action-execute] [CACHE] Saved family_name_required=true for category ${categoryId}`);
          
          retryInfo.family_name_used = fieldValue;
        }
      }
      
      // Re-sanitize com family_name permitido
      newItem = sanitizePayload(newItem, true);
      
      // Retry
      console.log(`[ad-action-execute] === API REQUEST (RETRY with body fields) ===`);
      console.log(`[ad-action-execute] payload_keys: ${Object.keys(newItem).join(", ")}`);
      
      createResponse = await fetch(CREATE_ENDPOINT, {
        method: CREATE_METHOD,
        headers: {
          Authorization: `Bearer ${currentAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newItem),
      });
      createData = await createResponse.json();
    }
    
    // Se API pediu listing_type_id fallback
    if (!createResponse.ok && isListingTypeUnavailableError(createData)) {
      const suggestedTypes = extractSuggestedListingTypes(createData);
      
      if (suggestedTypes.length > 0) {
        const fallbackResolution = resolveListingTypeId(
          undefined,
          categoryId,
          DEFAULT_LISTING_TYPE_ID,
          suggestedTypes,
          0
        );
        
        newItem.listing_type_id = fallbackResolution.listing_type_id;
        console.log(`[ad-action-execute] [RETRY] listing_type_id fallback: ${fallbackResolution.listing_type_id}`);
        
        createResponse = await fetch(CREATE_ENDPOINT, {
          method: CREATE_METHOD,
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newItem),
        });
        createData = await createResponse.json();
      }
    }
  }

  // =========================================================================
  // RESULTADO FINAL
  // v3: Não mascarar erro de title - retornar diagnóstico claro
  // =========================================================================
  if (!createResponse.ok) {
    console.error(`[ad-action-execute] Clone FAILED:`, JSON.stringify(createData));
    
    // Verificar se é erro de título inválido
    const isTitleBlocked = isTitleInvalidFieldsError(createData);
    const invalidFields = extractInvalidFields(createData);
    
    // Extrair informações detalhadas do erro
    const errorDetails = {
      api_status: createResponse.status,
      api_error: createData,
      invalid_fields: invalidFields,
      is_title_error: isTitleBlocked,
      retry_info: retryInfo,
    };
    
    return {
      success: false,
      error: isTitleBlocked ? "TITLE_BLOCKED_BY_CATALOG" : (createData.error || createData.message || "CLONE_FAILED"),
      message: isTitleBlocked 
        ? "O Mercado Livre bloqueou o campo 'título'. Isso indica que a categoria ou produto está forçando catálogo automaticamente. Tente criar diretamente no painel do ML ou use outra categoria."
        : (createData.message || "Erro ao criar anúncio"),
      ...errorDetails,
      payload_sent: newItem,
      anti_catalog_diagnostic: {
        ...antiCatalogDiagnostic,
        family_name_included: !!newItem.family_name,
        retry_performed: !!retryInfo,
      },
    };
  }

  console.log(`[ad-action-execute] Clone SUCCESS: ${createData.id}`);

  // Cache do listing_type_id que funcionou
  if (categoryId && newItem.listing_type_id) {
    saveListingTypeCacheForCategory(categoryId, newItem.listing_type_id);
  }

  return {
    success: true,
    message: "Anúncio criado com sucesso",
    new_item_id: createData.id,
    permalink: createData.permalink,
    anti_catalog_diagnostic: {
      ...antiCatalogDiagnostic,
      family_name_included: !!newItem.family_name,
      retry_performed: !!retryInfo,
    },
    retry_info: retryInfo,
    catalog_info: catalogInfo,
    listing_type_used: newItem.listing_type_id,
  };
}
