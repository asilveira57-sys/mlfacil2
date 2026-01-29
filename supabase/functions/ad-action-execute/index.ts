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

/**
 * Check if itemId is a catalog/product ID (MLBU, MLBP, etc.) rather than regular item (MLB)
 */
function isCatalogProductId(itemId: string): boolean {
  // MLBU = universal product, MLBP = product, any suffix that isn't pure item
  return /^MLB[UP]/i.test(itemId);
}

/**
 * Convert catalog product ID (MLBU...) to API-compatible format (MLB...)
 * MLBU1436905343 -> MLB1436905343
 */
function normalizeProductId(productId: string): string {
  // Remove the 'U' or 'P' suffix to get standard product ID
  return productId.replace(/^MLB[UP]/i, 'MLB');
}

/**
 * For catalog product IDs (MLBU/MLBP), fetch the product details and find an item to clone
 */
async function fetchCatalogItemData(accessToken: string, rawProductId: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  // Normalize MLBU -> MLB
  const productId = normalizeProductId(rawProductId);
  console.log(`[ad-action-execute] Normalized product ID: ${rawProductId} -> ${productId}`);

  // Fetch product details
  const productRes = await fetch(`https://api.mercadolibre.com/products/${productId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (productRes.ok) {
    const product = await productRes.json();
    // If product has buy_box_winner with an item_id, fetch that item
    if (product.buy_box_winner?.item_id) {
      const itemRes = await fetch(`https://api.mercadolibre.com/items/${product.buy_box_winner.item_id}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      if (itemRes.ok) {
        return { ok: true, data: await itemRes.json() };
      }
    }
    // Build minimal data from product itself
    return {
      ok: true,
      data: {
        title: product.name,
        category_id: product.main_features?.[0]?.category_id,
        pictures: product.pictures?.map((p: any) => ({ url: p.url })) || [],
        attributes: product.attributes || [],
      },
    };
  }

  // Fallback: try /products/{id}/items endpoint to get competing items
  const compRes = await fetch(`https://api.mercadolibre.com/products/${productId}/items?status=active&limit=1`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  if (compRes.ok) {
    const compData = await compRes.json();
    const firstItemId = compData.results?.[0]?.item_id;
    if (firstItemId) {
      const itemRes = await fetch(`https://api.mercadolibre.com/items/${firstItemId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      if (itemRes.ok) {
        return { ok: true, data: await itemRes.json() };
      }
    }
  }

  return { ok: false, error: `Não foi possível obter dados do produto ${productId}. Verifique se o link é válido.` };
}

async function executeCloneAction(accessToken: string, itemId: string, snapshot: any, checklist: any) {
  // First, get item details if no snapshot
  let itemData = snapshot;
  if (!itemData || Object.keys(itemData).length === 0) {
    // Check if this is a catalog product ID
    if (isCatalogProductId(itemId)) {
      console.log(`[ad-action-execute] Detected catalog product ID: ${itemId}`);
      const catalogResult = await fetchCatalogItemData(accessToken, itemId);
      if (!catalogResult.ok) {
        return { success: false, error: catalogResult.error || "Failed to fetch catalog product details" };
      }
      itemData = catalogResult.data;
    } else {
      // Regular item fetch
      const getResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      if (!getResponse.ok) {
        const errBody = await getResponse.text();
        console.error(`[ad-action-execute] Failed to fetch item ${itemId}:`, errBody);
        return { success: false, error: `Falha ao buscar detalhes do anúncio ${itemId}`, api_error: errBody };
      }
      itemData = await getResponse.json();
    }
  }

  console.log(`[ad-action-execute] Building clone payload from data:`, JSON.stringify({ title: itemData.title, category_id: itemData.category_id }));

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

  // Add description if included (only for regular items)
  if (checklist?.description !== false && !isCatalogProductId(itemId)) {
    const descResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
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
    };
  }

  return { 
    success: true, 
    message: "Item cloned successfully", 
    new_item_id: createData.id,
    permalink: createData.permalink,
  };
}
