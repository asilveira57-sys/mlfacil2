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
// BODY-LEVEL FIELDS: Campos que vão no body raiz, NÃO em attributes[]
// ============================================================================
const BODY_LEVEL_FIELDS = new Set(["family_name", "FAMILY_NAME"]);

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
  categoryAttributes: CategoryAttribute[]
): { attrsById: Map<string, NormalizedAttribute>; cleanedAttrs: NormalizedAttribute[] } {
  const attrsById = new Map<string, NormalizedAttribute>();
  const cleanedAttrs: NormalizedAttribute[] = [];

  // Criar mapa de tipos esperados
  const typeById = new Map<string, string>();
  for (const catAttr of categoryAttributes) {
    typeById.set(catAttr.id, catAttr.value_type);
  }

  for (const attr of sourceAttributes || []) {
    if (!attr?.id) continue;

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

  console.log(`[ad-action-execute] Normalized ${cleanedAttrs.length} valid attributes from source`);
  return { attrsById, cleanedAttrs };
}

// ============================================================================
// ETAPA 4: Garantir obrigatórios (motor genérico)
// ============================================================================
interface AttributeFillResult {
  filled: NormalizedAttribute[];
  missing: string[];
  bodyLevelFields: Record<string, string>; // Campos que vão no body raiz
  log: Array<{ attrId: string; source: string; value?: string; target: "attributes" | "body" }>;
}

function validateAndFillRequiredAttributes(
  requiredIds: string[],
  categoryAttributes: CategoryAttribute[],
  sourceAttrsById: Map<string, NormalizedAttribute>,
  itemData: any,
  categoryId: string
): AttributeFillResult {
  const filled: NormalizedAttribute[] = [];
  const missing: string[] = [];
  const bodyLevelFields: Record<string, string> = {};
  const log: Array<{ attrId: string; source: string; value?: string; target: "attributes" | "body" }> = [];

  // Mapa de atributos da categoria para acesso rápido
  const catAttrById = new Map<string, CategoryAttribute>();
  for (const attr of categoryAttributes) {
    catAttrById.set(attr.id, attr);
  }

  for (const reqId of requiredIds) {
    const catAttr = catAttrById.get(reqId);
    let resolvedValue: string | undefined;
    let resolvedValueId: string | undefined;
    let source = "";
    const isBodyLevel = BODY_LEVEL_FIELDS.has(reqId);

    // 4.1 Se já existe e tem valor válido
    const sourceAttr = sourceAttrsById.get(reqId);
    if (sourceAttr && (sourceAttr.value_id || sourceAttr.value_name || sourceAttr.value_struct)) {
      resolvedValue = sourceAttr.value_name;
      resolvedValueId = sourceAttr.value_id;
      source = "item_fonte";
    }

    // 4.2(A) Copiar do item fonte (atributos não processados acima)
    if (!resolvedValue && !resolvedValueId && itemData.attributes) {
      const itemAttr = itemData.attributes.find((a: any) => a.id === reqId);
      if (itemAttr && (itemAttr.value_name || itemAttr.value_id)) {
        resolvedValue = itemAttr.value_name;
        resolvedValueId = itemAttr.value_id;
        source = "item_fonte:raw";
      }
    }

    // 4.2(B) Resolver via defaults do sistema (tabela interna)
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

    // 4.2 Adicional: Valores permitidos da categoria (primeiro valor)
    if (!resolvedValue && !resolvedValueId && catAttr?.values && catAttr.values.length > 0) {
      const defaultVal = catAttr.values[0];
      resolvedValueId = defaultVal.id;
      resolvedValue = defaultVal.name;
      source = "categoria:primeiro_valor";
    }

    // Inferências específicas
    if (!resolvedValue && !resolvedValueId && catAttr) {
      // ITEM_CONDITION → condition do item
      if (reqId === "ITEM_CONDITION" && itemData.condition) {
        resolvedValue = itemData.condition === "new" ? "Novo" : "Usado";
        source = "inferencia:condition";
      }
    }

    // =========================================================================
    // ETAPA 5: Regra específica para family_name
    // =========================================================================
    if (!resolvedValue && !resolvedValueId && (reqId === "FAMILY_NAME" || reqId.toLowerCase() === "family_name")) {
      // 5.2 Gerar fallback seguro: versão "limpa" do título
      if (itemData.title) {
        // Limpar: remover SKU, números grandes, variação - objetivo é "nome de família"
        const cleanTitle = itemData.title
          .replace(/\s*[-–]\s*\d+\s*(unidades?|pcs?|un)?\s*$/i, "") // Remove "- 100 unidades"
          .replace(/\s*\d{4,}\s*/g, " ") // Remove números grandes (códigos/SKUs)
          .replace(/\s+/g, " ")
          .trim();
        
        // Limitar a 60 chars e pegar palavras completas
        let familyName = cleanTitle.split(" ").slice(0, 5).join(" ");
        if (familyName.length > 60) {
          familyName = familyName.substring(0, 60).replace(/\s+\S*$/, "");
        }
        
        resolvedValue = familyName || itemData.title.split(" ").slice(0, 4).join(" ");
        source = "fallback:titulo_limpo";
      } else {
        resolvedValue = "Produto";
        source = "fallback:generico";
      }
    }

    // Fallback genérico para tipos conhecidos
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
      
      // 5.3 Onde colocar: body raiz ou attributes[]
      if (isBodyLevel) {
        bodyLevelFields[reqId.toLowerCase()] = resolvedValue || resolvedValueId || "";
        log.push({ attrId: reqId, source, value: displayValue, target: "body" });
        console.log(`[ad-action-execute] Required ${reqId}: ✓ ${source} → BODY.${reqId.toLowerCase()} = "${displayValue}"`);
      } else {
        const filledAttr: NormalizedAttribute = { id: reqId };
        if (resolvedValueId) filledAttr.value_id = resolvedValueId;
        if (resolvedValue) filledAttr.value_name = resolvedValue;
        
        filled.push(filledAttr);
        log.push({ attrId: reqId, source, value: displayValue, target: "attributes" });
        console.log(`[ad-action-execute] Required ${reqId}: ✓ ${source} → attributes = "${displayValue}"`);
      }
    } else {
      missing.push(reqId);
      log.push({ attrId: reqId, source: "MISSING", target: isBodyLevel ? "body" : "attributes" });
      console.warn(`[ad-action-execute] Required ${reqId}: ✗ NO VALUE AVAILABLE`);
    }
  }

  return { filled, missing, bodyLevelFields, log };
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

  console.log(`[ad-action-execute] Building clone payload from data:`, JSON.stringify({ 
    title: itemData.title, 
    category_id: itemData.category_id,
    resolved_from_catalog: !!catalogInfo,
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
  // ETAPA 3: Normalizar atributos do item fonte
  // =========================================================================
  const { attrsById: sourceAttrsById, cleanedAttrs } = normalizeAndCleanAttributes(
    itemData.attributes || [],
    categoryAttributes
  );

  // =========================================================================
  // ETAPA 4: Validar e completar obrigatórios
  // =========================================================================
  const fillResult = validateAndFillRequiredAttributes(
    requiredIds,
    categoryAttributes,
    sourceAttrsById,
    itemData,
    itemData.category_id || ""
  );

  // =========================================================================
  // ETAPA 6: Log obrigatório (para debug detalhado)
  // =========================================================================
  const requiredCheck = {
    categoryId: itemData.category_id,
    requiredAttributeIds: requiredIds,
    missingRequiredBeforeFill: requiredIds.filter(id => !sourceAttrsById.has(id)),
    filledByItemSource: fillResult.log.filter(l => l.source.startsWith("item_fonte")).map(l => l.attrId),
    filledByDefaults: fillResult.log.filter(l => l.source.startsWith("default:")).map(l => l.attrId),
    filledByFallback: fillResult.log.filter(l => l.source.startsWith("fallback:")).map(l => l.attrId),
    filledByCategoria: fillResult.log.filter(l => l.source.startsWith("categoria:")).map(l => l.attrId),
    filledByInferencia: fillResult.log.filter(l => l.source.startsWith("inferencia:")).map(l => l.attrId),
    missingAfterFill: fillResult.missing,
    bodyLevelFields: fillResult.bodyLevelFields,
  };

  console.log(`[ad-action-execute] === REQUIRED CHECK SUMMARY ===`);
  console.log(`[ad-action-execute] ${JSON.stringify(requiredCheck, null, 2)}`);
  
  for (const entry of fillResult.log) {
    console.log(`[ad-action-execute]   - ${entry.attrId}: ${entry.source} → ${entry.target}${entry.value ? ` = "${entry.value}"` : ""}`);
  }

  // 4.2(C) Se não conseguiu preencher obrigatórios → erro controlado
  if (fillResult.missing.length > 0) {
    console.error(`[ad-action-execute] CLONE BLOCKED: Missing required attributes: ${fillResult.missing.join(", ")}`);
    
    // UX final (quando faltar obrigatório impossível)
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
  // =========================================================================
  const newItem: any = {
    title: checklist?.title !== false ? itemData.title : undefined,
    category_id: itemData.category_id,
    currency_id: itemData.currency_id || "BRL",
    listing_type_id: itemData.listing_type_id || "gold_special",
    condition: itemData.condition || "new",
    pictures: checklist?.pictures !== false && itemData.pictures 
      ? itemData.pictures.map((p: any) => ({ source: p.url || p.secure_url }))
      : undefined,
    price: checklist?.price !== false ? itemData.price : undefined,
    available_quantity: checklist?.quantity !== false ? itemData.available_quantity : 1,
    attributes: finalAttributes.length > 0 ? finalAttributes : undefined,
  };

  // 5.3 Adicionar body-level fields (family_name, etc.)
  for (const [fieldName, fieldValue] of Object.entries(fillResult.bodyLevelFields)) {
    newItem[fieldName] = fieldValue;
    console.log(`[ad-action-execute] Added body-level field: ${fieldName} = "${fieldValue}"`);
  }

  // Add description if included (fetch separately - only for regular items)
  if (checklist?.description !== false && !isCatalogId(itemId)) {
    const descResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}/description`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (descResponse.ok) {
      const descData = await descResponse.json();
      newItem.description = { plain_text: descData.plain_text || descData.text };
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
    };
  }

  console.log(`[ad-action-execute] Sending clone request with ${finalAttributes.length} attributes`);
  console.log(`[ad-action-execute] Body-level fields: ${JSON.stringify(fillResult.bodyLevelFields)}`);

  // Create new item
  const createResponse = await fetch(`https://api.mercadolibre.com/items`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newItem),
  });

  const createData = await createResponse.json();
  
  if (!createResponse.ok) {
    console.error(`[ad-action-execute] Clone POST failed:`, JSON.stringify({
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
    }

    return { 
      success: false, 
      error: createData.message || "Failed to create cloned item", 
      api_error: createData,
      payload_sent: newItem,
      attributes_sent: finalAttributes.map(a => ({ id: a.id, value: a.value_name || a.value_id })),
      required_check: requiredCheck,
      catalog_info: catalogInfo,
    };
  }

  console.log(`[ad-action-execute] Clone SUCCESS: ${createData.id}`);

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
  };
}
