// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ML_APP_ID = Deno.env.get("ML_APP_ID") || "";
const ML_SECRET_KEY = Deno.env.get("ML_SECRET_KEY") || "";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getValidToken(supabase: any, sellerId: string): Promise<string | null> {
  const { data: acct } = await supabase
    .from("ml_accounts")
    .select("id, access_token, refresh_token, token_expires_at")
    .eq("ml_user_id", String(sellerId))
    .eq("is_active", true)
    .maybeSingle();

  if (!acct) return null;

  const expiresAt = acct.token_expires_at ? new Date(acct.token_expires_at) : null;
  if (expiresAt && expiresAt > new Date(Date.now() + 60_000)) {
    return acct.access_token;
  }

  if (acct.refresh_token && ML_APP_ID && ML_SECRET_KEY) {
    try {
      const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: ML_APP_ID,
          client_secret: ML_SECRET_KEY,
          refresh_token: acct.refresh_token,
        }),
      });
      if (resp.ok) {
        const td = await resp.json();
        await supabase.from("ml_accounts").update({
          access_token: td.access_token,
          refresh_token: td.refresh_token,
          token_expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", acct.id);
        return td.access_token;
      }
    } catch (e) {
      console.error(`[freight-sync] Token refresh failed:`, e);
    }
  }

  return acct.access_token;
}

function extractDimensions(attrs: any[]) {
  const getAttrNum = (ids: string[]) => {
    for (const aid of ids) {
      const attr = attrs.find((a: any) => a.id === aid);
      if (attr?.value_name) {
        const num = parseFloat(String(attr.value_name).replace(',', '.'));
        if (!isNaN(num) && num > 0) return num;
      }
    }
    return null;
  };
  // ML returns weight in grams — convert to kg
  let rawWeight = getAttrNum(['SELLER_PACKAGE_WEIGHT', 'PACKAGE_WEIGHT', 'WEIGHT']);
  const weight_kg = rawWeight !== null && rawWeight > 50 ? rawWeight / 1000 : rawWeight;

  return {
    weight_kg,
    height_cm: getAttrNum(['SELLER_PACKAGE_HEIGHT', 'PACKAGE_HEIGHT', 'HEIGHT']),
    width_cm: getAttrNum(['SELLER_PACKAGE_WIDTH', 'PACKAGE_WIDTH', 'WIDTH']),
    length_cm: getAttrNum(['SELLER_PACKAGE_LENGTH', 'PACKAGE_LENGTH', 'LENGTH', 'DEPTH']),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { seller_id, item_ids } = await req.json();
    if (!seller_id) {
      return new Response(JSON.stringify({ error: "seller_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = await getValidToken(supabase, seller_id);
    if (!token) {
      return new Response(JSON.stringify({ error: "No valid ML token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If specific item_ids provided, use them; otherwise fetch all from cache
    let targetIds: string[] = item_ids || [];
    if (targetIds.length === 0) {
      const { data: cached } = await supabase
        .from("meli_listings_cache")
        .select("item_id")
        .eq("seller_id", seller_id)
        .eq("status", "active");
      // Deduplicate item_ids (variations share the same item_id)
      targetIds = [...new Set((cached || []).map((r: any) => r.item_id))];
    }

    console.log(`[freight-sync] Processing ${targetIds.length} items for seller ${seller_id}`);

    const BATCH = 20;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < targetIds.length; i += BATCH) {
      const batch = targetIds.slice(i, i + BATCH);
      const idsParam = batch.join(",");

      try {
        const resp = await fetch(
          `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,attributes`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (resp.status === 429) {
          console.warn("[freight-sync] Rate limited, waiting 5s...");
          await sleep(5000);
          const retry = await fetch(
            `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,attributes`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!retry.ok) { failed += batch.length; continue; }
          const data = await retry.json();
          await processBatch(supabase, seller_id, data);
          continue;
        }

        if (!resp.ok) { failed += batch.length; continue; }

        const data = await resp.json();
        const count = await processBatch(supabase, seller_id, data);
        updated += count;
      } catch (err) {
        console.warn(`[freight-sync] Batch error:`, err);
        failed += batch.length;
      }

      await sleep(300);
    }

    console.log(`[freight-sync] Done: ${updated} updated, ${failed} failed`);

    return new Response(JSON.stringify({
      success: true,
      total: targetIds.length,
      updated,
      failed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[freight-sync] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processBatch(supabase: any, sellerId: string, data: any[]): Promise<number> {
  let count = 0;
  for (const item of data) {
    if (item.code !== 200 || !item.body) continue;
    const b = item.body;
    const attrs = Array.isArray(b.attributes) ? b.attributes : [];
    const dims = extractDimensions(attrs);
    const hasDims = dims.weight_kg !== null || dims.height_cm !== null || dims.width_cm !== null || dims.length_cm !== null;

    if (!hasDims) continue;

    // Only update if dimensions_source is not 'manual' (preserve manual overrides)
    const { error } = await supabase
      .from("meli_listings_cache")
      .update({
        ...dims,
        dimensions_source: 'ml_api',
        updated_at: new Date().toISOString(),
      })
      .eq("seller_id", sellerId)
      .eq("item_id", b.id)
      .neq("dimensions_source", "manual");

    if (!error) count++;
  }
  return count;
}
