import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all sellers with modo_identidade = 'automatico' or no settings yet
    // We process active ML accounts
    const { data: accounts, error: accErr } = await supabase
      .from("ml_accounts")
      .select("ml_user_id, user_id")
      .eq("is_active", true);

    if (accErr) throw accErr;

    const results: any[] = [];

    for (const account of accounts || []) {
      const sellerId = account.ml_user_id;

      try {
        // Check current settings
        const { data: settings } = await supabase
          .from("visual_identity_settings")
          .select("modo_identidade")
          .eq("seller_id", sellerId)
          .maybeSingle();

        // Skip if manual or clean
        if (settings && settings.modo_identidade !== "automatico") {
          results.push({ sellerId, skipped: true, reason: settings.modo_identidade });
          continue;
        }

        // Get top category by revenue in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: orders } = await supabase
          .from("meli_order_items_cache")
          .select("category_id, unit_price, quantity")
          .eq("seller_id", sellerId);

        if (!orders || orders.length === 0) {
          results.push({ sellerId, skipped: true, reason: "no_orders" });
          continue;
        }

        // Aggregate revenue by category
        const categoryRevenue: Record<string, number> = {};
        for (const item of orders) {
          const catId = item.category_id || "unknown";
          const revenue = (item.unit_price || 0) * (item.quantity || 1);
          categoryRevenue[catId] = (categoryRevenue[catId] || 0) + revenue;
        }

        // Find top category
        const topCategory = Object.entries(categoryRevenue).sort(
          ([, a], [, b]) => b - a
        )[0];

        if (!topCategory) {
          results.push({ sellerId, skipped: true, reason: "no_category" });
          continue;
        }

        const [topCategoryId] = topCategory;

        // Find matching visual group
        const { data: groups } = await supabase
          .from("visual_category_groups")
          .select("slug, categorias_ml, prioridade")
          .eq("ativo", true)
          .order("prioridade", { ascending: true });

        let matchedGroup = "generico";
        for (const group of groups || []) {
          if (
            group.categorias_ml &&
            group.categorias_ml.some((cat: string) => topCategoryId.startsWith(cat))
          ) {
            matchedGroup = group.slug;
            break;
          }
        }

        // Upsert settings
        const { data: existing } = await supabase
          .from("visual_identity_settings")
          .select("id")
          .eq("seller_id", sellerId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("visual_identity_settings")
            .update({
              categoria_detectada: topCategoryId,
              grupo_visual_aplicado: matchedGroup,
            })
            .eq("seller_id", sellerId);
        } else {
          await supabase.from("visual_identity_settings").insert({
            seller_id: sellerId,
            modo_identidade: "automatico",
            categoria_detectada: topCategoryId,
            grupo_visual_aplicado: matchedGroup,
          });
        }

        // Log
        await supabase.from("visual_identity_logs").insert({
          seller_id: sellerId,
          user_id: account.user_id,
          modo_aplicado: "automatico",
          categoria_detectada: topCategoryId,
          grupo_visual_aplicado: matchedGroup,
          origem: "automatico",
          detalhes: {
            top_revenue: topCategory[1],
            categories_analyzed: Object.keys(categoryRevenue).length,
          },
        });

        results.push({
          sellerId,
          detected: topCategoryId,
          group: matchedGroup,
          revenue: topCategory[1],
        });
      } catch (err) {
        results.push({ sellerId, error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
