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

/**
 * Check if itemId is a catalog/universal product ID (MLBU)
 * MLBU = Universal product catalog, not a sellable item
 */
function isCatalogId(id: string): boolean {
  return /^MLBU/i.test((id || "").trim());
}

/**
 * Fallback: convert MLBU to MLB for /products endpoint only
 */
function toProductIdFallback(catalogId: string): string {
  return catalogId.replace(/^MLBU/i, "MLB");
}

type ResolveCatalogResult = {
  ok: true;
  itemId: string;
  productData?: any;
  resolvedBy: "products:MLBU" | "products:MLB";
} | {
  ok: false;
  error: string;
  productData?: any;
  tried: Array<{ productId: string; status?: number; body?: string }>;
};

/**
 * Resolve a catalog ID (MLBU) to a real item ID (MLB) via the official API
 * Uses /products/{MLBU} and extracts buy_box_winner.item_id
 * Fallback A/B: tries MLBU first, then MLB on /products endpoint only
 */
async function resolveCatalogItem(
  accessToken: string,
  catalogIdRaw: string
): Promise<ResolveCatalogResult> {
  const catalogId = (catalogIdRaw || "").trim();
  const tried: Array<{ productId: string; status?: number; body?: string }> = [];

  console.log(`[ad-action-execute] Resolving catalog ID: ${catalogId}`);

  // A) Try as MLBU first
  const productIdA = catalogId;
  const resA = await fetch(`https://api.mercadolibre.com/products/${productIdA}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  console.log(`[ad-action-execute] /products/${productIdA} status: ${resA.status}`);

  if (resA.ok) {
    const product = await resA.json();
    console.log(`[ad-action-execute] Product found (A): ${product?.name ?? "(no name)"}`);

    if (!product?.buy_box_winner?.item_id) {
      console.log(`[ad-action-execute] No buy_box_winner for catalog (A) ${productIdA}`);
      return {
        ok: false,
        error: "Este produto está em catálogo, mas não possui um vendedor ativo no momento. Cole o link de um anúncio específico (MLB) para continuar.",
        productData: product,
        tried: [{ productId: productIdA, status: resA.status }],
      };
    }

    const realItemId = product.buy_box_winner.item_id;
    console.log(`[ad-action-execute] buy_box_winner.item_id resolved (A): ${realItemId}`);
    return {
      ok: true,
      itemId: realItemId,
      productData: product,
      resolvedBy: "products:MLBU",
    };
  } else {
    const bodyA = await resA.text().catch(() => "");
    tried.push({ productId: productIdA, status: resA.status, body: bodyA });
    console.log(`[ad-action-execute] /products/${productIdA} failed: ${bodyA?.slice(0, 300)}`);
  }

  // B) Fallback: try as MLB on /products (without normalizing to /items)
  const productIdB = toProductIdFallback(catalogId);
  if (productIdB !== productIdA) {
    const resB = await fetch(`https://api.mercadolibre.com/products/${productIdB}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log(`[ad-action-execute] /products/${productIdB} status: ${resB.status}`);

    if (resB.ok) {
      const product = await resB.json();
      console.log(`[ad-action-execute] Product found (B): ${product?.name ?? "(no name)"}`);

      if (!product?.buy_box_winner?.item_id) {
        console.log(`[ad-action-execute] No buy_box_winner for catalog (B) ${productIdB}`);
        return {
          ok: false,
          error: "Este produto está em catálogo, mas não possui um vendedor ativo no momento. Cole o link de um anúncio específico (MLB) para continuar.",
          productData: product,
          tried: [...tried, { productId: productIdB, status: resB.status }],
        };
      }

      const realItemId = product.buy_box_winner.item_id;
      console.log(`[ad-action-execute] buy_box_winner.item_id resolved (B): ${realItemId}`);
      return {
        ok: true,
        itemId: realItemId,
        productData: product,
        resolvedBy: "products:MLB",
      };
    } else {
      const bodyB = await resB.text().catch(() => "");
      tried.push({ productId: productIdB, status: resB.status, body: bodyB });
      console.log(`[ad-action-execute] /products/${productIdB} failed: ${bodyB?.slice(0, 300)}`);
    }
  }

  return {
    ok: false,
    error: `Produto de catálogo não encontrado (${catalogId}). Verifique se o link está correto.`,
    tried,
  };
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

  // If no snapshot, we need to fetch item data
  if (!itemData || Object.keys(itemData).length === 0) {
    // DETECTION: Is this a catalog ID (MLBU) or regular item (MLB)?
    if (isCatalogId(itemId)) {
      console.log(`[ad-action-execute] Detected CATALOG ID: ${itemId}`);

      // Resolve catalog via official API with A/B fallback
      const catalogResult = await resolveCatalogItem(accessToken, itemId);
      if (!catalogResult.ok) {
        console.error(
          `[ad-action-execute] Catalog resolve failed for ${itemId}`,
          catalogResult.tried
        );
        return {
          success: false,
          error: catalogResult.error,
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
    }

    // Fetch real item (MLB)
    console.log(`[ad-action-execute] Fetching item data: ${resolvedItemId}`);
    const getResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!getResponse.ok) {
      const errBody = await getResponse.text().catch(() => "");
      console.error(`[ad-action-execute] Failed to fetch item ${resolvedItemId}:`, errBody);
      return {
        success: false,
        error: `Falha ao buscar detalhes do anúncio ${resolvedItemId}`,
        api_error: errBody,
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

  // Build new item payload based on checklist
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
  };

  // Add description if included (fetch separately - only for regular items, not catalog)
  if (checklist?.description !== false && !isCatalogId(itemId)) {
    const descResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}/description`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (descResponse.ok) {
      const descData = await descResponse.json();
      newItem.description = { plain_text: descData.plain_text || descData.text };
    }
  }

  // Add attributes if included
  if (checklist?.attributes !== false && itemData.attributes) {
    newItem.attributes = itemData.attributes;
  }

  // Validate minimum required fields
  if (!newItem.title || !newItem.category_id) {
    return {
      success: false,
      error: "Dados insuficientes para clonagem. Título ou categoria não encontrados.",
      missing: { title: !newItem.title, category_id: !newItem.category_id },
      catalog_info: catalogInfo,
    };
  }

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
    return { 
      success: false, 
      error: createData.message || "Failed to create cloned item", 
      api_error: createData,
      payload_sent: newItem,
      catalog_info: catalogInfo,
    };
  }

  return { 
    success: true, 
    message: catalogInfo 
      ? "Item clonado com sucesso a partir do catálogo" 
      : "Item cloned successfully", 
    new_item_id: createData.id,
    permalink: createData.permalink,
    catalog_info: catalogInfo,
  };
}
