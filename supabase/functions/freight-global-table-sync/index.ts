import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WEIGHTS = [0.3, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30];
const PRICES = [50, 79, 120, 200, 350, 500, 750, 1000, 2000, 5000];
const LISTING_TYPES = ["gold_pro", "gold_special"];
const LOGISTIC_TYPES = ["drop_off", "xd_drop_off", "fulfillment"];

interface ShippingOption {
  list_cost: number | null;
  cost: number | null;
  logistic_type: string;
  free_shipping: boolean;
  discount_rate?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get any active ML account to use as proxy for API queries
    const { data: accounts } = await supabase
      .from("ml_accounts")
      .select("seller_id:ml_user_id, access_token")
      .eq("is_connected", true)
      .eq("is_active", true)
      .not("access_token", "is", null)
      .limit(1);

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma conta ML ativa para consultar API" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { seller_id, access_token } = accounts[0];
    const results: any[] = [];
    let queriesOk = 0;
    let queriesFail = 0;

    // Query ML API for all combinations
    for (const listing_type of LISTING_TYPES) {
      for (const weight of WEIGHTS) {
        for (const price of PRICES) {
          try {
            const weightG = Math.round(weight * 1000);
            const dims = weight <= 1 ? { height: 10, width: 15, length: 20 }
              : weight <= 5 ? { height: 15, width: 25, length: 30 }
              : weight <= 15 ? { height: 20, width: 30, length: 40 }
              : { height: 30, width: 40, length: 60 };

            const url = `https://api.mercadolibre.com/users/${seller_id}/shipping_options?` +
              `item_price=${price}&weight=${weightG}&` +
              `dimensions=${dims.height}x${dims.width}x${dims.length}&` +
              `listing_type_id=${listing_type}&` +
              `free_method=0`;

            const resp = await fetch(url, {
              headers: { Authorization: `Bearer ${access_token}` },
            });

            if (resp.status === 429) {
              // Rate limit — wait and retry once
              await new Promise(r => setTimeout(r, 2000));
              const retry = await fetch(url, {
                headers: { Authorization: `Bearer ${access_token}` },
              });
              if (!retry.ok) { queriesFail++; continue; }
              const data = await retry.json();
              processShippingResponse(data, listing_type, weight, price, results);
              queriesOk++;
            } else if (resp.ok) {
              const data = await resp.json();
              processShippingResponse(data, listing_type, weight, price, results);
              queriesOk++;
            } else {
              queriesFail++;
            }

            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 150));
          } catch {
            queriesFail++;
          }
        }
      }
    }

    if (results.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum resultado obtido da API", queries_ok: queriesOk, queries_fail: queriesFail }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deactivate previous global rulesets
    await supabase
      .from("freight_rulesets")
      .update({ status: "archived" })
      .eq("is_global", true)
      .eq("status", "active");

    // Create new global ruleset
    const now = new Date().toISOString().split("T")[0];
    const { data: ruleset, error: rsErr } = await supabase
      .from("freight_rulesets")
      .insert({
        name: `Tabela Oficial ML — ${now}`,
        description: `Gerada automaticamente. ${queriesOk} consultas OK, ${queriesFail} falhas.`,
        marketplace: "mercadolivre",
        country: "BR",
        status: "active",
        valid_from: now,
        is_global: true,
      })
      .select("id")
      .single();

    if (rsErr || !ruleset) {
      throw new Error("Erro ao criar ruleset: " + (rsErr?.message || "unknown"));
    }

    // Convert point results to range-based rule lines
    const ruleLines = buildRangeRules(results, ruleset.id);

    // Insert in batches of 100
    for (let i = 0; i < ruleLines.length; i += 100) {
      const batch = ruleLines.slice(i, i + 100);
      const { error: insertErr } = await supabase
        .from("freight_rule_lines")
        .insert(batch);
      if (insertErr) {
        console.error("Batch insert error:", insertErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ruleset_id: ruleset.id,
        rule_lines: ruleLines.length,
        queries_ok: queriesOk,
        queries_fail: queriesFail,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("freight-global-table-sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function processShippingResponse(
  data: any,
  listing_type: string,
  weight: number,
  price: number,
  results: any[]
) {
  const options = data?.options || [];
  for (const opt of options) {
    if (opt.list_cost === null && opt.cost === null) continue;
    results.push({
      listing_type,
      logistic_type: opt.logistic_type || "unknown",
      weight,
      price,
      list_cost: opt.list_cost ?? opt.cost ?? 0,
      cost: opt.cost ?? opt.list_cost ?? 0,
      free_shipping: !!opt.free_shipping,
      discount_rate: opt.list_cost && opt.cost ? 1 - (opt.cost / opt.list_cost) : 0,
      currency_id: opt.currency_id || "BRL",
    });
  }
}

function buildRangeRules(results: any[], rulesetId: string) {
  // Group by logistic_type + listing_type + weight
  // Then for each group, create rules with proper weight and price ranges
  const groups = new Map<string, any[]>();

  for (const r of results) {
    const key = `${r.logistic_type}|${r.listing_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const ruleLines: any[] = [];
  let sortOrder = 0;

  for (const [key, items] of groups) {
    const [logistic_type, listing_type] = key.split("|");
    const adType = listing_type === "gold_pro" ? "premium" : "classic";

    // Sort by weight then price
    items.sort((a: any, b: any) => a.weight - b.weight || a.price - b.price);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const weightIdx = WEIGHTS.indexOf(item.weight);
      const priceIdx = PRICES.indexOf(item.price);

      const weightMax = weightIdx < WEIGHTS.length - 1 ? WEIGHTS[weightIdx + 1] : null;
      const priceMax = priceIdx < PRICES.length - 1 ? PRICES[priceIdx + 1] : null;

      ruleLines.push({
        ruleset_id: rulesetId,
        logistic_mode: logistic_type,
        ad_type: adType,
        weight_min: item.weight,
        weight_max: weightMax,
        price_band_min: item.price,
        price_band_max: priceMax,
        seller_pays_value: item.free_shipping ? 0 : item.list_cost,
        seller_pays_formula: null,
        dimensions_limit_policy: null,
        dimensions_limit_value: null,
        subsidy_type: item.free_shipping ? "full" : "none",
        subsidy_value: item.free_shipping ? item.list_cost : 0,
        is_free_shipping: item.free_shipping,
        notes: item.discount_rate > 0 ? `Desconto: ${(item.discount_rate * 100).toFixed(0)}%` : null,
        sort_order: sortOrder++,
      });
    }
  }

  return ruleLines;
}
