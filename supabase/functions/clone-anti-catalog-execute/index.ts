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

// Campos que NUNCA podem ser enviados no POST /items
const FORBIDDEN_BODY_FIELDS = new Set([
  "catalog_listing",
  "catalog_product_id",
  "product_id",
  "parent_item_id",
  "family_name", // Só envia via retry se API exigir
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

// Cache de categorias que exigem family_name
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

function extractMissingFields(apiError: any): { bodyFields: string[] } {
  const bodyFields: string[] = [];

  if (!apiError) return { bodyFields };

  // Formato: { cause: [{ code: "body.required_fields", ... }] }
  const causes = apiError.cause || apiError.causes || [];
  for (const c of causes) {
    if (c.code === "body.required_fields" || c.code === "item.required_fields") {
      const missing = c.references || [];
      for (const ref of missing) {
        if (typeof ref === "string") {
          bodyFields.push(ref);
        }
      }
    }
  }

  // Formato: { message: "...", error: "..." }
  const message = apiError.message || apiError.error || "";
  if (message.includes("family_name")) {
    if (!bodyFields.includes("family_name")) {
      bodyFields.push("family_name");
    }
  }

  return { bodyFields };
}

function deriveFamilyName(title: string, categoryId: string): string {
  // Fallback simples: primeiras 4 palavras do título
  if (title) {
    const words = title.split(/\s+/).slice(0, 4).join(" ");
    if (words.length > 0) return words;
  }
  // Fallback por categoria (pode ser expandido)
  const categoryFallbacks: Record<string, string> = {
    MLB1684: "Etiquetas impressas",
    MLB1499: "Produto de papelaria",
  };
  return categoryFallbacks[categoryId] || "Produto";
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
    const { data: account, error: accError } = await supabase
      .from("ml_accounts")
      .select("access_token, seller_id")
      .eq("id", ml_account_id)
      .eq("user_id", userId)
      .single();

    if (accError || !account?.access_token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Conta ML não encontrada ou token expirado",
          error_code: "AUTH_EXPIRED",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = account.access_token;
    const sellerId = account.seller_id;

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

    // Payload base (SEM campos proibidos)
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

    // Verificar cache de family_name
    if (familyNameRequiredCache.get(category_id)) {
      itemPayload.family_name = deriveFamilyName(payload.title, category_id);
    }

    // Remover qualquer campo proibido que possa ter vazado
    for (const field of FORBIDDEN_BODY_FIELDS) {
      delete itemPayload[field];
    }

    // Diagnóstico
    const diagnostic = {
      payload_keys_sent: Object.keys(itemPayload),
      attributes_ids_sent: finalAttributes.map((a: any) => a.id),
      removed_fields: [...FORBIDDEN_BODY_FIELDS],
    };

    console.log("[ANTI-CATALOG-V3] Creating item with payload:", JSON.stringify(itemPayload, null, 2));
    console.log("[ANTI-CATALOG-V3] Diagnostic:", diagnostic);

    // ============================================
    // PRIMEIRA TENTATIVA DE CRIAÇÃO
    // ============================================

    let createResponse = await fetch("https://api.mercadolibre.com/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(itemPayload),
    });

    let createData = await createResponse.json();

    console.log("[ANTI-CATALOG-V3] First attempt response:", createResponse.status, JSON.stringify(createData));

    // ============================================
    // RETRY SE family_name FOR EXIGIDO
    // ============================================

    let retryInfo = {
      attempted: false,
      field_added: undefined as string | undefined,
      success_on_retry: false,
    };

    if (!createResponse.ok) {
      const { bodyFields } = extractMissingFields(createData);

      if (bodyFields.includes("family_name")) {
        console.log("[ANTI-CATALOG-V3] API requires family_name, retrying...");

        retryInfo.attempted = true;
        retryInfo.field_added = "family_name";

        // Salvar no cache
        familyNameRequiredCache.set(category_id, true);

        // Adicionar family_name e tentar novamente
        const retryPayload = {
          ...itemPayload,
          family_name: deriveFamilyName(payload.title, category_id),
        };

        console.log("[ANTI-CATALOG-V3] Retry payload with family_name:", retryPayload.family_name);

        createResponse = await fetch("https://api.mercadolibre.com/items", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(retryPayload),
        });

        createData = await createResponse.json();
        console.log("[ANTI-CATALOG-V3] Retry response:", createResponse.status, JSON.stringify(createData));

        if (createResponse.ok) {
          retryInfo.success_on_retry = true;
        }
      }
    }

    // ============================================
    // PROCESSAR RESULTADO
    // ============================================

    if (!createResponse.ok) {
      // Verificar se é erro de título (não mascarar)
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

      console.log("[ANTI-CATALOG-V3] Creation failed:", errorCode, errorMessage);

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          error_code: errorCode,
          api_status: createResponse.status,
          api_error: createData,
          retry_info: retryInfo,
          diagnostic,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sucesso!
    const newItemId = createData.id;
    const permalink = createData.permalink;

    console.log("[ANTI-CATALOG-V3] Item created successfully:", newItemId);

    return new Response(
      JSON.stringify({
        success: true,
        item_id: newItemId,
        permalink,
        retry_info: retryInfo,
        diagnostic,
      }),
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
