import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Admin emails allowed to manage billing
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map(e => e.trim().toLowerCase());

async function verifyAdmin(authHeader: string | null, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  if (!authHeader) return false;
  
  const supabaseAuth = createClient(supabaseUrl, serviceKey);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
  
  if (error || !user?.email) return false;
  
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    const isAdmin = await verifyAdmin(authHeader, supabaseUrl, supabaseServiceKey);

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // GET: List all plans with prices (including unpublished)
    if (req.method === "GET" && action === "list") {
      const { data: plans, error: plansError } = await supabase
        .from("billing_plans")
        .select(`
          id, slug, name, description, features, category, is_active, created_at, updated_at,
          billing_plan_prices (
            id, mode, period, amount_cents, currency, badge_text, label_sub, 
            ui_order, is_visible, published_at, version, created_at, updated_at
          )
        `)
        .order("category")
        .order("created_at");

      if (plansError) throw plansError;

      const { data: settings, error: settingsError } = await supabase
        .from("billing_settings")
        .select("*");

      if (settingsError) throw settingsError;

      const settingsMap: Record<string, unknown> = {};
      settings?.forEach(s => { settingsMap[s.key] = s.value; });

      return new Response(
        JSON.stringify({ plans, settings: settingsMap }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: Update plan
    if (req.method === "POST" && action === "update-plan") {
      const body = await req.json();
      const { id, name, description, features, is_active } = body;

      const { error } = await supabase
        .from("billing_plans")
        .update({ name, description, features, is_active })
        .eq("id", id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: Update price
    if (req.method === "POST" && action === "update-price") {
      const body = await req.json();
      const { id, amount_cents, badge_text, label_sub, is_visible, ui_order } = body;

      const { error } = await supabase
        .from("billing_plan_prices")
        .update({ amount_cents, badge_text, label_sub, is_visible, ui_order })
        .eq("id", id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: Publish price
    if (req.method === "POST" && action === "publish-price") {
      const body = await req.json();
      const { id } = body;

      const { error } = await supabase
        .from("billing_plan_prices")
        .update({ published_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: Unpublish price
    if (req.method === "POST" && action === "unpublish-price") {
      const body = await req.json();
      const { id } = body;

      const { error } = await supabase
        .from("billing_plan_prices")
        .update({ published_at: null })
        .eq("id", id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: Update settings
    if (req.method === "POST" && action === "update-settings") {
      const body = await req.json();
      const { key, value } = body;

      const { error } = await supabase
        .from("billing_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[billing-admin] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
