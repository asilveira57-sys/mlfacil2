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
// ============================================================================
interface CategoryAttributeCache {
  attributes: CategoryAttribute[];
  requiredIds: string[];
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
// DEFAULTS DE ATRIBUTOS POR CATEGORIA (family_name e outros)
// ============================================================================
const CATEGORY_ATTRIBUTE_DEFAULTS: Record<string, Record<string, { value_name?: string; value_id?: string }>> = {
  // Defaults genéricos aplicáveis a múltiplas categorias
  "*": {
    "FAMILY_NAME": { value_name: "Produto genérico" },
    "IS_FLAMMABLE": { value_name: "Não" },
    "IS_FRAGILE": { value_name: "Não" },
  },
  // Exemplos de defaults específicos por categoria (podem ser expandidos via Admin)
  "MLB1051": { // Etiquetas
    "FAMILY_NAME": { value_name: "Etiquetas adesivas" },
  },
  "MLB1953": { // Impressoras
    "FAMILY_NAME": { value_name: "Impressoras térmicas" },
  },
};

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
// ETAPA A: DESCOBRIR ATRIBUTOS OBRIGATÓRIOS DA CATEGORIA (COM CACHE)
// ============================================================================
async function fetchCategoryRequiredAttributes(
  accessToken: string,
  categoryId: string
): Promise<{ attributes: CategoryAttribute[]; requiredIds: string[] }> {
  // A1) Verificar cache
  const cached = categoryAttributesCache.get(categoryId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.log(`[ad-action-execute] Category ${categoryId}: using cached attributes (${cached.requiredIds.length} required)`);
    return { attributes: cached.attributes, requiredIds: cached.requiredIds };
  }

  // A2) Buscar da API
  console.log(`[ad-action-execute] Category ${categoryId}: fetching attributes from ML API`);
  
  const response = await fetch(
    `https://api.mercadolibre.com/categories/${categoryId}/attributes`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    console.warn(`[ad-action-execute] Failed to fetch category attributes: ${response.status}`);
    return { attributes: [], requiredIds: [] };
  }

  const allAttributes: CategoryAttribute[] = await response.json();
  
  // Filtrar obrigatórios (required ou catalog_required)
  const requiredIds = allAttributes
    .filter(attr => attr.tags?.required === true || attr.tags?.catalog_required === true)
    .map(attr => attr.id);

  console.log(`[ad-action-execute] Category ${categoryId}: found ${allAttributes.length} total, ${requiredIds.length} required`);
  console.log(`[ad-action-execute] Required IDs: ${requiredIds.join(", ") || "(none)"}`);

  // Guardar em cache
  categoryAttributesCache.set(categoryId, {
    attributes: allAttributes,
    requiredIds,
    fetchedAt: Date.now(),
  });

  return { attributes: allAttributes, requiredIds };
}

// ============================================================================
// ETAPA B: NORMALIZAR ATRIBUTOS DO PAYLOAD
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

    // B2) Limpar atributos inválidos
    const hasValidValue = 
      (attr.value_name && attr.value_name.trim() !== "") ||
      attr.value_id ||
      attr.value_struct;

    if (!hasValidValue) {
      console.log(`[ad-action-execute] Attr ${attr.id}: skipped (empty value)`);
      continue;
    }

    // Verificar tipo numérico
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

    // Evitar duplicidade
    if (!attrsById.has(attr.id)) {
      attrsById.set(attr.id, normalized);
      cleanedAttrs.push(normalized);
    }
  }

  console.log(`[ad-action-execute] Normalized ${cleanedAttrs.length} valid attributes from source`);
  return { attrsById, cleanedAttrs };
}

// ============================================================================
// ETAPA C: VALIDAR E COMPLETAR OBRIGATÓRIOS
// ============================================================================
interface AttributeFillResult {
  filled: NormalizedAttribute[];
  missing: string[];
  log: Array<{ attrId: string; source: string; value?: string }>;
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
  const log: Array<{ attrId: string; source: string; value?: string }> = [];

  // Mapa de atributos da categoria para acesso rápido
  const catAttrById = new Map<string, CategoryAttribute>();
  for (const attr of categoryAttributes) {
    catAttrById.set(attr.id, attr);
  }

  for (const reqId of requiredIds) {
    const catAttr = catAttrById.get(reqId);
    let filledAttr: NormalizedAttribute | null = null;
    let source = "";

    // C1) Verificar se já existe no payload (fonte 1)
    const sourceAttr = sourceAttrsById.get(reqId);
    if (sourceAttr && (sourceAttr.value_id || sourceAttr.value_name || sourceAttr.value_struct)) {
      filledAttr = { ...sourceAttr };
      source = "item_fonte";
    }

    // C2) Fonte 2: Inferência baseada em atributos próximos
    if (!filledAttr && catAttr) {
      // ITEM_CONDITION → condition do item
      if (reqId === "ITEM_CONDITION" && itemData.condition) {
        filledAttr = { id: reqId, value_name: itemData.condition === "new" ? "Novo" : "Usado" };
        source = "inferencia:condition";
      }
      // BRAND → buscar em attributes do item
      else if (reqId === "BRAND") {
        const brandAttr = sourceAttrsById.get("BRAND");
        if (brandAttr) {
          filledAttr = { ...brandAttr };
          source = "inferencia:brand";
        }
      }
    }

    // C2.5) Fonte 3: Valores permitidos da categoria (primeiro valor como default)
    if (!filledAttr && catAttr?.values && catAttr.values.length > 0) {
      const defaultVal = catAttr.values[0];
      filledAttr = { id: reqId, value_id: defaultVal.id, value_name: defaultVal.name };
      source = "categoria:primeiro_valor";
    }

    // C3) Fonte 4: Defaults controlados por categoria
    if (!filledAttr) {
      // Tentar default específico da categoria
      const categoryDefaults = CATEGORY_ATTRIBUTE_DEFAULTS[categoryId] || {};
      const globalDefaults = CATEGORY_ATTRIBUTE_DEFAULTS["*"] || {};
      
      const specificDefault = categoryDefaults[reqId];
      const globalDefault = globalDefaults[reqId];
      const defaultValue = specificDefault || globalDefault;

      if (defaultValue) {
        filledAttr = { id: reqId, ...defaultValue };
        source = specificDefault ? "default:categoria" : "default:global";
      }
    }

    // C3.5) Fallback especial para FAMILY_NAME (derivar do título)
    if (!filledAttr && (reqId === "FAMILY_NAME" || reqId.toLowerCase() === "family_name")) {
      const derivedName = itemData.title
        ? itemData.title.split(" ").slice(0, 4).join(" ")
        : "Produto";
      filledAttr = { id: reqId, value_name: derivedName };
      source = "fallback:titulo";
    }

    // C3.6) Fallback genérico para tipos conhecidos
    if (!filledAttr && catAttr) {
      if (catAttr.value_type === "string") {
        filledAttr = { id: reqId, value_name: "-" };
        source = "fallback:string_generico";
      } else if (catAttr.value_type === "boolean") {
        filledAttr = { id: reqId, value_name: "Não" };
        source = "fallback:boolean";
      }
    }

    // Registrar resultado
    if (filledAttr) {
      filled.push(filledAttr);
      log.push({ 
        attrId: reqId, 
        source, 
        value: filledAttr.value_name || filledAttr.value_id || "(struct)" 
      });
      console.log(`[ad-action-execute] Required ${reqId}: ✓ ${source} → ${filledAttr.value_name || filledAttr.value_id}`);
    } else {
      missing.push(reqId);
      log.push({ attrId: reqId, source: "MISSING" });
      console.warn(`[ad-action-execute] Required ${reqId}: ✗ NO VALUE AVAILABLE`);
    }
  }

  return { filled, missing, log };
}

// ============================================================================
// ETAPA E: MONTAGEM FINAL COM VALIDAÇÃO
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
    // NOTE: ad_lifecycle_actions.ml_account_id stores ml_accounts.id (UUID)
    // (not ml_user_id). Keep a fallback for legacy rows that might store ml_user_id.
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
      // No catalog resolution needed - proceed directly to item fetch
    }
    // FALLBACK RESIDUAL: Somente se for MLBU e não houver MLB
    else if (isCatalogId(itemId)) {
      console.log(`[ad-action-execute] FALLBACK PATH: Catalog ID (MLBU) detected - attempting catalog resolution`);
      console.log(`[ad-action-execute] Note: This is a residual case. The system does not guarantee cloning from catalog links.`);

      const catalogResult = await resolveCatalogItemFallback(accessToken, itemId);
      if (!catalogResult.ok) {
        console.error(
          `[ad-action-execute] Catalog resolve failed for ${itemId}`,
          catalogResult.tried
        );
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
      
      // Log detailed error for debugging
      console.error(`[ad-action-execute] /items/${resolvedItemId} FAILED`, JSON.stringify({
        status: responseStatus,
        body_preview: errBody?.slice(0, 500),
        item_id: resolvedItemId,
        original_id: itemId,
      }));

      // Parse error type for better user feedback
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

      // Try to parse JSON error for more details
      let parsedError: any = null;
      try {
        parsedError = JSON.parse(errBody);
      } catch {
        // Not JSON, keep as string
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
  // ETAPA A: Descobrir atributos obrigatórios da categoria
  // =========================================================================
  let categoryAttributes: CategoryAttribute[] = [];
  let requiredIds: string[] = [];

  if (itemData.category_id) {
    const catResult = await fetchCategoryRequiredAttributes(accessToken, itemData.category_id);
    categoryAttributes = catResult.attributes;
    requiredIds = catResult.requiredIds;
  }

  // =========================================================================
  // ETAPA B: Normalizar atributos do item fonte
  // =========================================================================
  const { attrsById: sourceAttrsById, cleanedAttrs } = normalizeAndCleanAttributes(
    itemData.attributes || [],
    categoryAttributes
  );

  // =========================================================================
  // ETAPA C: Validar e completar obrigatórios
  // =========================================================================
  const fillResult = validateAndFillRequiredAttributes(
    requiredIds,
    categoryAttributes,
    sourceAttrsById,
    itemData,
    itemData.category_id || ""
  );

  // Log detalhado da validação
  console.log(`[ad-action-execute] === VALIDATION SUMMARY ===`);
  console.log(`[ad-action-execute] Category: ${itemData.category_id}`);
  console.log(`[ad-action-execute] Required count: ${requiredIds.length}`);
  console.log(`[ad-action-execute] Filled count: ${fillResult.filled.length}`);
  console.log(`[ad-action-execute] Missing count: ${fillResult.missing.length}`);
  
  for (const entry of fillResult.log) {
    console.log(`[ad-action-execute]   - ${entry.attrId}: ${entry.source}${entry.value ? ` = "${entry.value}"` : ""}`);
  }

  // C3) Se não conseguiu preencher obrigatórios → erro controlado
  if (fillResult.missing.length > 0) {
    console.error(`[ad-action-execute] CLONE BLOCKED: Missing required attributes: ${fillResult.missing.join(", ")}`);
    
    return {
      success: false,
      error: "MISSING_REQUIRED_ATTRIBUTES",
      message: `Este produto exige campos obrigatórios definidos pelo Mercado Livre: ${fillResult.missing.join(", ")}. Complete os campos do anúncio e tente novamente.`,
      user_guidance: "O Mercado Livre exige campos obrigatórios adicionais para esta categoria. Ajuste antes de clonar.",
      missing_required_attributes: fillResult.missing,
      category_id: itemData.category_id,
      item_id: resolvedItemId,
      validation_log: fillResult.log,
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

  // Build new item payload
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
      validation_log: fillResult.log,
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
    catalog_info: catalogInfo,
  };
}
