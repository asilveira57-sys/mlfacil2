import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : null;
    const action = url.searchParams.get("action") || body?.action;

    if (req.method === "POST" && action === "list-activity") {
      const { data: subscriptionsRaw, error: subscriptionsError } = await supabase
        .from("tenant_entitlements")
        .select(`
          id,
          tenant_id,
          status,
          created_at,
          current_period_end,
          last_payment_id,
          plan_tiers(code, name),
          plan_addons(code, name),
          tenants!inner(owner_user_id)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (subscriptionsError) throw subscriptionsError;

      const { data: paymentsRaw, error: paymentsError } = await supabase
        .from("tenant_payments")
        .select(`
          id,
          tenant_id,
          payment_id,
          external_reference,
          amount_brl,
          status,
          created_at,
          paid_at,
          tenants!inner(owner_user_id)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (paymentsError) throw paymentsError;

      const ownerIds = Array.from(new Set([
        ...(subscriptionsRaw || []).map((item: any) => item.tenants?.owner_user_id).filter(Boolean),
        ...(paymentsRaw || []).map((item: any) => item.tenants?.owner_user_id).filter(Boolean),
      ]));

      const profileMap = new Map<string, { full_name: string | null; email: string | null }>();

      if (ownerIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", ownerIds);

        if (profilesError) throw profilesError;

        for (const profile of profiles || []) {
          profileMap.set(profile.user_id, {
            full_name: profile.full_name,
            email: profile.email,
          });
        }
      }

      const subscriptions = (subscriptionsRaw || []).map((item: any) => {
        const ownerUserId = item.tenants?.owner_user_id || item.tenant_id;
        const profile = profileMap.get(ownerUserId) || { full_name: null, email: null };
        const tier = Array.isArray(item.plan_tiers) ? item.plan_tiers[0] : item.plan_tiers;
        const addon = Array.isArray(item.plan_addons) ? item.plan_addons[0] : item.plan_addons;

        return {
          id: item.id,
          mp_preapproval_id: item.last_payment_id || "—",
          user_id: ownerUserId,
          user_name: profile.full_name,
          user_email: profile.email,
          plan_id: tier?.code || addon?.code || null,
          plan_name: tier?.name || addon?.name || null,
          status: item.status || "unknown",
          created_at: item.created_at,
          current_period_end: item.current_period_end,
          tenant_id: item.tenant_id,
        };
      });

      const payments = (paymentsRaw || []).map((item: any) => {
        const ownerUserId = item.tenants?.owner_user_id || item.tenant_id;
        const profile = profileMap.get(ownerUserId) || { full_name: null, email: null };

        return {
          id: item.id,
          mp_payment_id: item.payment_id || "—",
          user_id: ownerUserId,
          user_name: profile.full_name,
          user_email: profile.email,
          amount: Number(item.amount_brl || 0),
          status: item.status || "unknown",
          created_at: item.created_at,
          paid_at: item.paid_at,
          external_reference: item.external_reference,
          tenant_id: item.tenant_id,
        };
      });

      return new Response(
        JSON.stringify({ subscriptions, payments }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // POST: Reconcile Mercado Pago payments (call billing-reconcile-payments)
    if (req.method === "POST" && action === "reconcile") {
      const sinceDays = Number(body?.since_days) || 7;
      const reconcileRes = await fetch(`${supabaseUrl}/functions/v1/billing-reconcile-payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
          "x-cron-key": Deno.env.get("CRON_KEY") || "",
        },
        body: JSON.stringify({ since_days: sinceDays }),
      });
      const text = await reconcileRes.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }

      return new Response(
        JSON.stringify({ success: reconcileRes.ok, status: reconcileRes.status, result: json }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: List unresolved payments (recorded but no entitlement linked)
    if (req.method === "POST" && action === "list-unresolved") {
      const { data: rows, error } = await supabase
        .from("tenant_payments")
        .select("id, tenant_id, payment_id, external_reference, amount_brl, status, paid_at, created_at, raw")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const tenantIds = Array.from(new Set((rows || []).map((r: any) => r.tenant_id).filter(Boolean)));
      const linkedSet = new Set<string>();
      if (tenantIds.length > 0) {
        const { data: ents } = await supabase
          .from("tenant_entitlements")
          .select("tenant_id, last_payment_id")
          .in("tenant_id", tenantIds);
        for (const e of ents || []) {
          if (e.last_payment_id) linkedSet.add(`${e.tenant_id}:${e.last_payment_id}`);
        }
      }

      const unresolved = (rows || []).filter((r: any) => {
        if (!r.tenant_id || r.tenant_id === "00000000-0000-0000-0000-000000000000") return true;
        return !linkedSet.has(`${r.tenant_id}:${r.payment_id}`);
      });

      return new Response(
        JSON.stringify({ unresolved }),
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
