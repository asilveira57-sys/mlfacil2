import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map(e => e.trim().toLowerCase()).filter(e => e.length > 0);
    const userEmail = (user.email || "").toLowerCase();
    console.log(`[mp-sync] User email: ${userEmail}, Admin emails configured: ${adminEmails.length}`);
    if (!adminEmails.includes(userEmail)) {
      console.warn(`[mp-sync] Forbidden: ${userEmail} not in admin list`);
      return new Response(JSON.stringify({ error: "Forbidden", detail: `Email ${userEmail} is not an admin` }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch all preapproval plans from Mercado Pago
    const mpPlans: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const url = new URL("https://api.mercadopago.com/preapproval_plan/search");
      url.searchParams.set("status", "active");
      url.searchParams.set("offset", offset.toString());
      url.searchParams.set("limit", "50");

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`MP API error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const results = data.results || [];
      mpPlans.push(...results);

      if (results.length < 50) {
        hasMore = false;
      } else {
        offset += 50;
      }
    }

    console.log(`[mp-sync-tenant-plans] Found ${mpPlans.length} active MP plans`);

    // 2. Fetch tenant_plans
    const { data: tenantPlans, error: tpError } = await supabase
      .from("tenant_plans")
      .select("*")
      .order("display_order");

    if (tpError) throw tpError;

    // 3. Match MP plans to tenant_plans by reason (name matching)
    const matches: Array<{
      tenant_plan_id: string;
      tenant_plan_code: string;
      tenant_plan_name: string;
      mp_plan_id: string;
      mp_plan_reason: string;
      mp_plan_status: string;
      mp_amount: number;
      mp_currency: string;
      already_linked: boolean;
    }> = [];

    const unmatched_mp: Array<{
      mp_plan_id: string;
      mp_plan_reason: string;
      mp_plan_status: string;
      mp_amount: number;
    }> = [];

    for (const mpPlan of mpPlans) {
      const mpReason = (mpPlan.reason || "").toLowerCase().trim();
      const mpId = mpPlan.id;
      const mpAmount = mpPlan.auto_recurring?.transaction_amount || 0;
      const mpCurrency = mpPlan.auto_recurring?.currency_id || "BRL";
      const mpStatus = mpPlan.status || "unknown";

      // Try to match by checking if tenant plan name/code appears in MP plan reason
      let matched = false;
      for (const tp of tenantPlans || []) {
        const tpName = (tp.name || "").toLowerCase();
        const tpCode = (tp.code || "").toLowerCase();

        // Match strategies:
        // 1. MP reason contains the tenant plan code (e.g. "ate-50", "51-300")
        // 2. MP reason contains key parts of the name
        // 3. Exact code match in reason
        const codeInReason = mpReason.includes(tpCode);
        const nameInReason = mpReason.includes(tpName);
        
        // Also try partial matching for common patterns
        const codeNormalized = tpCode.replace(/-/g, " ").replace(/ate/g, "até");
        const partialMatch = mpReason.includes(codeNormalized) || 
          mpReason.replace(/[^a-z0-9]/g, "").includes(tpCode.replace(/[^a-z0-9]/g, ""));

        if (codeInReason || nameInReason || partialMatch) {
          matches.push({
            tenant_plan_id: tp.id,
            tenant_plan_code: tp.code,
            tenant_plan_name: tp.name,
            mp_plan_id: mpId,
            mp_plan_reason: mpPlan.reason,
            mp_plan_status: mpStatus,
            mp_amount: mpAmount,
            mp_currency: mpCurrency,
            already_linked: tp.mercado_pago_plan_id === mpId,
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        unmatched_mp.push({
          mp_plan_id: mpId,
          mp_plan_reason: mpPlan.reason,
          mp_plan_status: mpStatus,
          mp_amount: mpAmount,
        });
      }
    }

    // 4. Check request body for auto-apply flag
    let applied = 0;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    
    if (body.auto_apply) {
      // Apply matches that aren't already linked
      for (const match of matches) {
        if (!match.already_linked) {
          const { error: updateError } = await supabase
            .from("tenant_plans")
            .update({ mercado_pago_plan_id: match.mp_plan_id })
            .eq("id", match.tenant_plan_id);

          if (updateError) {
            console.error(`Failed to update ${match.tenant_plan_code}:`, updateError);
          } else {
            applied++;
          }
        }
      }
    }

    // Also support manual mapping
    if (body.manual_mapping && Array.isArray(body.manual_mapping)) {
      for (const mapping of body.manual_mapping) {
        if (mapping.tenant_plan_id && mapping.mp_plan_id) {
          const { error: updateError } = await supabase
            .from("tenant_plans")
            .update({ mercado_pago_plan_id: mapping.mp_plan_id })
            .eq("id", mapping.tenant_plan_id);

          if (updateError) {
            console.error(`Manual mapping failed:`, updateError);
          } else {
            applied++;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      mp_plans_found: mpPlans.length,
      matches,
      unmatched_mp,
      applied,
      tenant_plans: (tenantPlans || []).map(tp => ({
        id: tp.id,
        code: tp.code,
        name: tp.name,
        current_mp_id: tp.mercado_pago_plan_id,
        is_enterprise: tp.is_enterprise,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[mp-sync-tenant-plans] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
