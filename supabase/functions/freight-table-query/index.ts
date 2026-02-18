import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ML_API_BASE = "https://api.mercadolibre.com";

interface QueryParams {
  seller_id: string;
  category_id?: string;
  listing_type_id: string;
  logistic_type: string;
  weight_ranges: number[];
  price_ranges: number[];
}

interface ShippingResult {
  weight: number;
  price: number;
  listing_type: string;
  logistic_type: string;
  list_cost: number | null;
  discount_rate: number | null;
  subsidized_cost: number | null;
  billable_weight: number | null;
  free_shipping: boolean;
  error?: string;
}

/** Convert weight to estimated dimensions (HxWxL) based on freight profiles */
function weightToDimensions(weightKg: number): string {
  // Profile A: small items ≤0.5kg
  if (weightKg <= 0.5) {
    const h = 5, w = 15, l = 20;
    return `${h}x${w}x${l},${Math.round(weightKg * 1000)}`;
  }
  // Profile B: medium items ≤5kg  
  if (weightKg <= 5) {
    const h = 10, w = 25, l = 35;
    return `${h}x${w}x${l},${Math.round(weightKg * 1000)}`;
  }
  // Profile C: large items >5kg
  const h = 20, w = 40, l = 50;
  return `${h}x${w}x${l},${Math.round(weightKg * 1000)}`;
}

async function queryShippingOption(
  accessToken: string,
  sellerId: string,
  weight: number,
  price: number,
  listingType: string,
  logisticType: string,
  categoryId?: string
): Promise<ShippingResult> {
  const dims = weightToDimensions(weight);
  
  const params = new URLSearchParams({
    dimensions: dims,
    item_price: price.toString(),
    listing_type_id: listingType,
  });
  
  if (categoryId) {
    params.set("category_id", categoryId);
  }

  // Map logistic_type to shipping mode
  const modeMap: Record<string, string> = {
    fulfillment: "me2",
    xd_drop_off: "me2",
    drop_off: "me2",
    cross_docking: "me2",
    me1: "me1",
  };
  const mode = modeMap[logisticType] || "me2";
  params.set("mode", mode);

  const url = `${ML_API_BASE}/users/${sellerId}/shipping_options/free?${params.toString()}`;

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[freight-table-query] API error ${resp.status} for weight=${weight} price=${price}: ${errText}`);
      return {
        weight, price, listing_type: listingType, logistic_type: logisticType,
        list_cost: null, discount_rate: null, subsidized_cost: null,
        billable_weight: null, free_shipping: false,
        error: `API ${resp.status}`,
      };
    }

    const data = await resp.json();
    
    // Extract the relevant shipping option matching logistic_type
    const options = data?.options || [];
    
    // Find the option that matches the logistic type
    let bestOption = options.find((o: any) => {
      const lt = o.logistic_type || o.shipping_method_id;
      return lt === logisticType;
    });
    
    // Fallback to first option if no exact match
    if (!bestOption && options.length > 0) {
      bestOption = options[0];
    }

    if (!bestOption) {
      // Try coverage structure
      const coverage = data?.coverage;
      if (coverage) {
        return {
          weight, price, listing_type: listingType, logistic_type: logisticType,
          list_cost: coverage.list_cost ?? data.list_cost ?? null,
          discount_rate: coverage.discount?.rate ?? null,
          subsidized_cost: coverage.list_cost != null && coverage.discount?.rate != null
            ? coverage.list_cost * (1 - coverage.discount.rate)
            : null,
          billable_weight: data.billable_weight ?? null,
          free_shipping: data.free_shipping === true || coverage.list_cost === 0,
        };
      }

      // Direct properties on response
      if (data.list_cost !== undefined) {
        return {
          weight, price, listing_type: listingType, logistic_type: logisticType,
          list_cost: data.list_cost,
          discount_rate: data.discount?.rate ?? null,
          subsidized_cost: data.list_cost != null && data.discount?.rate != null
            ? data.list_cost * (1 - data.discount.rate)
            : data.list_cost,
          billable_weight: data.billable_weight ?? null,
          free_shipping: data.free_shipping === true,
        };
      }

      return {
        weight, price, listing_type: listingType, logistic_type: logisticType,
        list_cost: null, discount_rate: null, subsidized_cost: null,
        billable_weight: null, free_shipping: false,
        error: "No shipping option found",
      };
    }

    const listCost = bestOption.list_cost ?? bestOption.cost ?? null;
    const discountRate = bestOption.discount?.rate ?? null;

    return {
      weight, price, listing_type: listingType, logistic_type: logisticType,
      list_cost: listCost,
      discount_rate: discountRate,
      subsidized_cost: listCost != null && discountRate != null
        ? listCost * (1 - discountRate)
        : listCost,
      billable_weight: bestOption.billable_weight ?? null,
      free_shipping: bestOption.free_shipping === true || listCost === 0,
    };
  } catch (err) {
    console.error(`[freight-table-query] Fetch error for weight=${weight} price=${price}:`, err);
    return {
      weight, price, listing_type: listingType, logistic_type: logisticType,
      list_cost: null, discount_rate: null, subsidized_cost: null,
      billable_weight: null, free_shipping: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: QueryParams = await req.json();
    const { seller_id, category_id, listing_type_id, logistic_type, weight_ranges, price_ranges } = body;

    if (!seller_id || !listing_type_id || !logistic_type || !weight_ranges?.length || !price_ranges?.length) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: "INVALID_PARAMS", message: "Missing required parameters" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get access token - seller_id can be either internal UUID (id) or ML numeric ID (ml_user_id)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seller_id);
    const query = supabase
      .from("ml_accounts")
      .select("access_token, token_expires_at, ml_user_id")
      .eq("is_active", true);
    
    if (isUuid) {
      query.eq("id", seller_id);
    } else {
      query.eq("ml_user_id", seller_id);
    }
    
    const { data: mlAccount } = await query.maybeSingle();

    if (!mlAccount) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: "ACCOUNT_NOT_FOUND", message: "Conta ML não encontrada" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check token expiry and refresh if needed
    if (mlAccount.token_expires_at && new Date(mlAccount.token_expires_at) < new Date()) {
      // Try to refresh token via the existing refresh function
      try {
        const refreshResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/ml-token-refresh`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ seller_id }),
          }
        );
        if (refreshResp.ok) {
          const refreshData = await refreshResp.json();
          if (refreshData.access_token) {
            mlAccount.access_token = refreshData.access_token;
          }
        }
      } catch (e) {
        console.warn("[freight-table-query] Token refresh failed:", e);
      }
    }

    const results: ShippingResult[] = [];
    const totalCombinations = weight_ranges.length * price_ranges.length;

    // Use the actual ML numeric user ID for API calls
    const mlUserId = mlAccount.ml_user_id;
    console.log(`[freight-table-query] Querying ${totalCombinations} combinations for ML user ${mlUserId}`);

    // Query each combination with rate limiting
    for (const weight of weight_ranges) {
      for (const price of price_ranges) {
        const result = await queryShippingOption(
          mlAccount.access_token,
          mlUserId,
          weight,
          price,
          listing_type_id,
          logistic_type,
          category_id
        );
        results.push(result);

        // Rate limit: 100ms between calls
        if (totalCombinations > 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    }

    const successCount = results.filter((r) => r.list_cost !== null).length;
    console.log(`[freight-table-query] Done: ${successCount}/${totalCombinations} successful`);

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          results,
          meta: {
            seller_id,
            listing_type_id,
            logistic_type,
            category_id: category_id || null,
            total_queries: totalCombinations,
            successful: successCount,
            queried_at: new Date().toISOString(),
          },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[freight-table-query] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "Erro interno" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
