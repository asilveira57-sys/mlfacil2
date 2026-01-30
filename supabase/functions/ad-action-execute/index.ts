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

function normalizeAndCleanAttributes(
  sourceAttributes: any[],
  categoryAttributes: CategoryAttribute[],
  removeNotModifiable: boolean = true
): { attrsById: Map<string, NormalizedAttribute>; cleanedAttrs: NormalizedAttribute[]; removedNotModifiable: string[] } {
  const attrsById = new Map<string, NormalizedAttribute>();
  const cleanedAttrs: NormalizedAttribute[] = [];
  const removedNotModifiable: string[] = [];

  // Criar mapa de tipos esperados
  const typeById = new Map<string, string>();
  const tagsById = new Map<string, any>();
  for (const catAttr of categoryAttributes) {
    typeById.set(catAttr.id, catAttr.value_type);
    tagsById.set(catAttr.id, catAttr.tags || {});
  }

  for (const attr of sourceAttributes || []) {
    if (!attr?.id) continue;

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

  console.log(`[ad-action-execute] Normalized ${cleanedAttrs.length} valid attributes from source (removed ${removedNotModifiable.length} not-modifiable)`);
  return { attrsById, cleanedAttrs, removedNotModifiable };
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
              action.checklist
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

async function executeCloneAction(accessToken: string, itemId: string, snapshot: any, checklist: any) {
  let itemData = snapshot;
  let resolvedItemId = itemId;
  let catalogInfo: any = null;

  console.log(`[ad-action-execute] Clone requested for ID: ${itemId}`);
  console.log(`[ad-action-execute] ID type analysis: isRegularItemId=${isRegularItemId(itemId)}, isCatalogId=${isCatalogId(itemId)}`);

  // If no snapshot, we need to fetch item data
  if (!itemData || Object.keys(itemData).length === 0) {
    
    // REGRA OFICIAL: MLB tem prioridade - vai direto para /items
    if (isRegularItemId(itemId)) {
      console.log(`[ad-action-execute] PRIORITY PATH: Regular item ID (MLB) detected - going directly to /items`);
    }
    // FALLBACK RESIDUAL: Somente se for MLBU e não houver MLB
    else if (isCatalogId(itemId)) {
      console.log(`[ad-action-execute] FALLBACK PATH: Catalog ID (MLBU) detected - attempting catalog resolution`);

      const catalogResult = await resolveCatalogItemFallback(accessToken, itemId);
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
      headers: { Authorization: `Bearer ${accessToken}` },
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
  // Isso afeta quais campos podem ser enviados no POST /items
  // =========================================================================
  const catalogDiagnostic = {
    catalog_product_id: itemData.catalog_product_id || null,
    catalog_listing: itemData.catalog_listing ?? null,
    parent_item_id: itemData.parent_item_id || null,
    is_catalog_source: false,
    blocked_fields: [] as string[],
  };

  // Determinar se é item de catálogo
  catalogDiagnostic.is_catalog_source = !!(
    catalogDiagnostic.catalog_product_id ||
    catalogDiagnostic.catalog_listing === true ||
    catalogDiagnostic.parent_item_id
  );

  // Se for catálogo, estes campos são bloqueados pela API
  if (catalogDiagnostic.is_catalog_source) {
    catalogDiagnostic.blocked_fields = ["title", "pictures", "description"];
  }

  console.log(`[ad-action-execute] === CATALOG DIAGNOSTIC ===`);
  console.log(`[ad-action-execute] catalog_product_id: ${catalogDiagnostic.catalog_product_id}`);
  console.log(`[ad-action-execute] catalog_listing: ${catalogDiagnostic.catalog_listing}`);
  console.log(`[ad-action-execute] parent_item_id: ${catalogDiagnostic.parent_item_id}`);
  console.log(`[ad-action-execute] is_catalog_source: ${catalogDiagnostic.is_catalog_source}`);
  console.log(`[ad-action-execute] blocked_fields: ${catalogDiagnostic.blocked_fields.join(", ") || "(none)"}`);

  console.log(`[ad-action-execute] Building clone payload from data:`, JSON.stringify({ 
    title: itemData.title, 
    category_id: itemData.category_id,
    resolved_from_catalog: !!catalogInfo,
    is_catalog_source: catalogDiagnostic.is_catalog_source,
  }));

  // =========================================================================
  // ETAPA 2: Descobrir atributos obrigatórios da categoria
  // =========================================================================
  let categoryAttributes: CategoryAttribute[] = [];
  let requiredIds: string[] = [];

  if (itemData.category_id) {
    const catResult = await fetchCategoryRequiredAttributes(accessToken, itemData.category_id);
    categoryAttributes = catResult.attributes;
    requiredIds = catResult.requiredIds;
  }

  // =========================================================================
  // ETAPA 3: Normalizar atributos do item fonte (removendo not-modifiable)
  // =========================================================================
  const { attrsById: sourceAttrsById, cleanedAttrs, removedNotModifiable } = normalizeAndCleanAttributes(
    itemData.attributes || [],
    categoryAttributes,
    true // removeNotModifiable = true
  );

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
  // BUILD NEW ITEM PAYLOAD (incluindo campos no body raiz)
  // IMPORTANTE: Se is_catalog_source=true, NÃO enviar title, pictures, description
  // IMPORTANTE: Se pictures está bloqueado, NÃO usar listing_type que exige pictures
  // =========================================================================
  const isCatalogSource = catalogDiagnostic.is_catalog_source;
  const blockedFields = catalogDiagnostic.blocked_fields;
  const picturesBlocked = blockedFields.includes("pictures");

  // Determinar se cada campo pode ser incluído
  const canIncludeTitle = !isCatalogSource && checklist?.title !== false;
  const canIncludePictures = !isCatalogSource && checklist?.pictures !== false && itemData.pictures;
  const canIncludeDescription = !isCatalogSource && checklist?.description !== false;

  // =========================================================================
  // ESTRATÉGIA DE listing_type_id PARA CATÁLOGO:
  // Se pictures está bloqueado e listing_type exige pictures (gold_special, etc.):
  // 1ª tentativa: NÃO enviar listing_type_id (deixar ML decidir)
  // 2ª tentativa: usar listing_type seguro (free/bronze)
  // =========================================================================
  let listingTypeStrategy: "omit" | "safe" | "original" = "original";
  let listingTypeToUse: string | undefined = itemData.listing_type_id || "gold_special";

  if (isCatalogSource && picturesBlocked) {
    const originalType = itemData.listing_type_id || "gold_special";
    if (LISTING_TYPES_REQUIRING_PICTURES.has(originalType)) {
      console.log(`[ad-action-execute] CATALOG STRATEGY: listing_type_id "${originalType}" requires pictures but pictures are blocked`);
      console.log(`[ad-action-execute] CATALOG STRATEGY: Will omit listing_type_id to let ML decide`);
      listingTypeStrategy = "omit";
      listingTypeToUse = undefined; // Não enviar - deixar ML decidir
    }
  }

  console.log(`[ad-action-execute] === PAYLOAD FIELD DECISIONS ===`);
  console.log(`[ad-action-execute] is_catalog_source: ${isCatalogSource}`);
  console.log(`[ad-action-execute] pictures_blocked: ${picturesBlocked}`);
  console.log(`[ad-action-execute] listing_type_strategy: ${listingTypeStrategy}`);
  console.log(`[ad-action-execute] listing_type_to_use: ${listingTypeToUse ?? "(omitted)"}`);
  console.log(`[ad-action-execute] canIncludeTitle: ${canIncludeTitle} (blocked: ${blockedFields.includes("title")})`);
  console.log(`[ad-action-execute] canIncludePictures: ${canIncludePictures} (blocked: ${picturesBlocked})`);
  console.log(`[ad-action-execute] canIncludeDescription: ${canIncludeDescription} (blocked: ${blockedFields.includes("description")})`);
  console.log(`[ad-action-execute] removedNotModifiable: ${removedNotModifiable.join(", ") || "(none)"}`);

  let newItem: any = {
    category_id: itemData.category_id,
    currency_id: itemData.currency_id || "BRL",
    condition: itemData.condition || "new",
    price: checklist?.price !== false ? itemData.price : undefined,
    available_quantity: checklist?.quantity !== false ? itemData.available_quantity : 1,
    attributes: finalAttributes.length > 0 ? finalAttributes : undefined,
  };

  // Incluir listing_type_id apenas se não for estratégia "omit"
  if (listingTypeToUse) {
    newItem.listing_type_id = listingTypeToUse;
  }

  // CONDICIONAL: Apenas incluir title se NÃO for catálogo
  if (canIncludeTitle) {
    newItem.title = itemData.title;
  }

  // CONDICIONAL: Apenas incluir pictures se NÃO for catálogo
  if (canIncludePictures) {
    newItem.pictures = itemData.pictures.map((p: any) => ({ source: p.url || p.secure_url }));
  }

  // Se for catálogo, adicionar catalog_product_id ao payload (regra ML)
  if (isCatalogSource && catalogDiagnostic.catalog_product_id) {
    newItem.catalog_product_id = catalogDiagnostic.catalog_product_id;
    console.log(`[ad-action-execute] Added catalog_product_id: ${catalogDiagnostic.catalog_product_id}`);
  }

  // Adicionar body-level fields (family_name, etc.) - GARANTIDO no payload
  for (const [fieldName, fieldValue] of Object.entries(fillResult.bodyLevelFields)) {
    newItem[fieldName] = fieldValue;
    console.log(`[ad-action-execute] Added body-level field: ${fieldName} = "${fieldValue}"`);
  }

  // CONDICIONAL: Add description se NÃO for catálogo
  if (canIncludeDescription && !isCatalogId(itemId)) {
    const descResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}/description`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (descResponse.ok) {
      const descData = await descResponse.json();
      newItem.description = { plain_text: descData.plain_text || descData.text };
    }
  }

  // Validate minimum required fields
  // NOTA: Para catálogo, title é OPCIONAL (bloqueado pela API)
  const needsTitle = !isCatalogSource;
  if ((needsTitle && !newItem.title) || !newItem.category_id) {
    // Se for catálogo e title está faltando, dar erro específico
    if (isCatalogSource && !newItem.title && needsTitle) {
      return {
        success: false,
        error: "CATALOG_CLONE_LIMITATION",
        message: "Este anúncio pertence ao catálogo do Mercado Livre. O título é controlado pelo catálogo e não pode ser clonado diretamente.",
        user_guidance: "Itens de catálogo têm título, fotos e descrição gerenciados pelo Mercado Livre. Tente clonar um anúncio fora do catálogo ou use a opção de cadastrar no catálogo.",
        catalog_info: catalogInfo,
        catalog_diagnostic: catalogDiagnostic,
      };
    }
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
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newItem),
  });

  let createData = await createResponse.json();
  
  // =========================================================================
  // RETRY LOOP: Se falhar com required_fields, extrair e preencher
  // =========================================================================
  if (!createResponse.ok) {
    const extractedMissing = extractMissingFieldsFromApiError(createData);
    
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
      // IMPORTANTE: Usar a mesma estratégia de listing_type determinada anteriormente
      newItem = {
        category_id: itemData.category_id,
        currency_id: itemData.currency_id || "BRL",
        condition: itemData.condition || "new",
        price: checklist?.price !== false ? itemData.price : undefined,
        available_quantity: checklist?.quantity !== false ? itemData.available_quantity : 1,
        attributes: finalAttributes2.length > 0 ? finalAttributes2 : undefined,
      };

      // Incluir listing_type_id apenas se não for estratégia "omit"
      if (listingTypeToUse) {
        newItem.listing_type_id = listingTypeToUse;
      }

      // CONDICIONAL: Apenas incluir title se NÃO for catálogo
      if (canIncludeTitle) {
        newItem.title = itemData.title;
      }

      // CONDICIONAL: Apenas incluir pictures se NÃO for catálogo
      if (canIncludePictures) {
        newItem.pictures = itemData.pictures.map((p: any) => ({ source: p.url || p.secure_url }));
      }

      // Se for catálogo, adicionar catalog_product_id ao payload (regra ML)
      if (isCatalogSource && catalogDiagnostic.catalog_product_id) {
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
          headers: { "Authorization": `Bearer ${accessToken}` },
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
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newItem),
      });

      createData = await createResponse.json();
    }
  }
  
  if (!createResponse.ok) {
    console.error(`[ad-action-execute] Clone ${CREATE_METHOD} ${CREATE_ENDPOINT} FAILED:`, JSON.stringify({
      status: createResponse.status,
      error: createData,
      payload_attributes_count: finalAttributes.length,
      body_level_fields: fillResult.bodyLevelFields,
    }));

    // Verificar se é erro de campos obrigatórios (para logging detalhado)
    const isRequiredFieldError = 
      createData?.cause?.some((c: any) => c.code === "item.attributes.missing_required") ||
      createData?.message?.includes("required_fields") ||
      createData?.message?.includes("body.required_fields");

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
