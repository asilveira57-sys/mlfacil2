import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "public, max-age=600, s-maxage=1800",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Fetch tiers with offers
    const { data: tiers, error: tiersError } = await supabase
      .from("plan_tiers")
      .select("*")
      .eq("is_active", true)
      .order("display_order");

    if (tiersError) throw tiersError;

    const { data: offers, error: offersError } = await supabase
      .from("plan_offers")
      .select("*")
      .eq("is_active", true)
      .eq("is_visible", true)
      .order("billing_mode")
      .order("period_months");

    if (offersError) throw offersError;

    // Fetch addons with offers
    const { data: addons, error: addonsError } = await supabase
      .from("plan_addons")
      .select("*")
      .eq("is_active", true)
      .order("display_order");

    if (addonsError) throw addonsError;

    const { data: addonOffers, error: aoError } = await supabase
      .from("plan_addon_offers")
      .select("*")
      .eq("is_active", true)
      .eq("is_visible", true)
      .order("billing_mode")
      .order("period_months");

    if (aoError) throw aoError;

    // Fetch settings
    const { data: settingsData } = await supabase
      .from("plan_settings")
      .select("*")
      .eq("key", "global")
      .single();

    // Fetch trial policy
    const { data: trialData } = await supabase
      .from("trial_policy")
      .select("*")
      .eq("is_active", true)
      .single();

    // Build response
    const tiersWithOffers = (tiers || []).map((tier: any) => ({
      id: tier.id,
      code: tier.code,
      name: tier.display_name || tier.name,
      description: tier.description,
      min_orders_30d: tier.min_orders_30d,
      max_orders_30d: tier.max_orders_30d,
      is_enterprise: tier.is_enterprise,
      display_order: tier.display_order,
      offers: (offers || [])
        .filter((o: any) => o.tier_id === tier.id)
        .map((o: any) => ({
          id: o.id,
          offer_code: o.offer_code,
          billing_mode: o.billing_mode,
          period_months: o.period_months,
          price_brl: Number(o.price_brl),
          badge_text: o.badge_text,
          is_campaign: o.is_campaign,
          mp_product_ref: o.mp_product_ref,
        })),
    }));

    const addonsWithOffers = (addons || []).map((addon: any) => ({
      id: addon.id,
      code: addon.code,
      name: addon.name,
      description: addon.description,
      display_order: addon.display_order,
      offers: (addonOffers || [])
        .filter((o: any) => o.addon_id === addon.id)
        .map((o: any) => ({
          id: o.id,
          offer_code: o.offer_code,
          billing_mode: o.billing_mode,
          period_months: o.period_months,
          price_brl: Number(o.price_brl),
          badge_text: o.badge_text,
          is_campaign: o.is_campaign,
          mp_product_ref: o.mp_product_ref,
        })),
    }));

    return new Response(JSON.stringify({
      tiers: tiersWithOffers,
      addons: addonsWithOffers,
      settings: {
        enable_annual_campaign: settingsData?.enable_annual_campaign ?? false,
      },
      trial_policy: trialData ? {
        trial_days: trialData.trial_days,
        requires_card: trialData.requires_card,
        one_trial_per_account: trialData.one_trial_per_account,
      } : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[billing-public-plans] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
