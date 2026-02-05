import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    // Fetch published plans with prices using correct column names
    const { data: viewData, error: viewError } = await supabase
      .from("public_plans_v1")
      .select("*")
      .eq("visible", true)
      .order("plan_sort_order")
      .order("price_sort_order");

    if (viewError) {
      console.error("[billing-public-plans] Error fetching plans:", viewError);
      throw viewError;
    }

    console.log(`[billing-public-plans] Fetched ${viewData?.length || 0} price entries`);

    // Fetch trial policy
    const { data: trialData } = await supabase
      .from("trial_policy")
      .select("*")
      .eq("is_active", true)
      .single();

    // Group by plan
    const plansMap = new Map<string, Plan>();

    viewData?.forEach((row: {
      plan_id: string;
      slug: string;
      name: string;
      description: string | null;
      features: unknown;
      category: string;
      price_id: string;
      mode: string;
      period: string;
      price_cents: number;
      currency: string;
      badge_text: string | null;
      price_sort_order: number;
      is_campaign: boolean;
    }) => {
      if (!plansMap.has(row.slug)) {
        // Parse features - ensure they're strings
        let features: string[] = [];
        if (Array.isArray(row.features)) {
          features = row.features.map((f: unknown) => String(f));
        }
        
        plansMap.set(row.slug, {
          id: row.plan_id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          features,
          category: row.category,
          prices: [],
        });
      }

      const plan = plansMap.get(row.slug)!;

      if (row.price_id) {
        plan.prices.push({
          id: row.price_id,
          mode: row.mode,
          period: row.period,
          amount_cents: row.price_cents,
          currency: row.currency || "BRL",
          badge_text: row.badge_text,
          ui_order: row.price_sort_order || 0,
        });
      }
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
          annual_enabled: false,
          ui_copy: {},
        },
        trial_policy: trialData ? {
          trial_days: trialData.trial_days,
          requires_card: trialData.requires_card,
          one_trial_per_account: trialData.one_trial_per_account,
        } : null,
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
