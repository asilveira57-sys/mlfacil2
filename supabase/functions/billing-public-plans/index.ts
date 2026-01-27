import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "public, max-age=600, s-maxage=1800", // 10min client, 30min CDN
};

interface PlanPrice {
  id: string;
  mode: string;
  period: string;
  amount_cents: number;
  currency: string;
  badge_text: string | null;
  label_sub: string | null;
  ui_order: number;
}

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: string[];
  category: string;
  prices: PlanPrice[];
}

interface BillingSettings {
  campaigns?: { annual_enabled?: boolean };
  ui_copy?: { one_time_note?: string; subscription_note?: string };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[billing-public-plans] Starting request");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Fetch published plans with prices
    const { data: viewData, error: viewError } = await supabase
      .from("public_plans_v1")
      .select("*")
      .order("category")
      .order("ui_order");

    if (viewError) {
      console.error("[billing-public-plans] Error fetching plans:", viewError);
      throw viewError;
    }

    console.log(`[billing-public-plans] Fetched ${viewData?.length || 0} price entries`);

    // Fetch settings
    const { data: settingsData, error: settingsError } = await supabase
      .from("billing_settings")
      .select("key, value");

    if (settingsError) {
      console.error("[billing-public-plans] Error fetching settings:", settingsError);
    }

    const settings: BillingSettings = {};
    settingsData?.forEach((s: { key: string; value: unknown }) => {
      settings[s.key as keyof BillingSettings] = s.value as BillingSettings[keyof BillingSettings];
    });

    // Group by plan
    const plansMap = new Map<string, Plan>();

    viewData?.forEach((row: {
      plan_id: string;
      slug: string;
      name: string;
      description: string | null;
      features: string[];
      category: string;
      price_id: string;
      mode: string;
      period: string;
      amount_cents: number;
      currency: string;
      badge_text: string | null;
      label_sub: string | null;
      ui_order: number;
    }) => {
      if (!plansMap.has(row.slug)) {
        plansMap.set(row.slug, {
          id: row.plan_id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          features: row.features || [],
          category: row.category,
          prices: [],
        });
      }

      const plan = plansMap.get(row.slug)!;
      
      // Filter out annual_campaign if not enabled
      const annualEnabled = settings.campaigns?.annual_enabled ?? false;
      if (row.period === "annual_campaign" && !annualEnabled) {
        return;
      }

      plan.prices.push({
        id: row.price_id,
        mode: row.mode,
        period: row.period,
        amount_cents: row.amount_cents,
        currency: row.currency,
        badge_text: row.badge_text,
        label_sub: row.label_sub,
        ui_order: row.ui_order,
      });
    });

    // Convert to array and sort
    const plans = Array.from(plansMap.values())
      .filter(p => p.prices.length > 0) // Only plans with visible prices
      .sort((a, b) => {
        if (a.category !== b.category) {
          return a.category === "volume" ? -1 : 1;
        }
        return 0;
      });

    console.log(`[billing-public-plans] Returning ${plans.length} plans`);

    return new Response(
      JSON.stringify({
        plans,
        settings: {
          annual_enabled: settings.campaigns?.annual_enabled ?? false,
          ui_copy: settings.ui_copy ?? {},
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[billing-public-plans] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
