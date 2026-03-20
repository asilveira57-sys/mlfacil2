import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = user.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (target_user_id === callerUserId) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your own account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target user info for audit
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", target_user_id)
      .maybeSingle();

    // 1. Immediately revoke all sessions
    try {
      await supabaseAdmin.auth.admin.signOut(target_user_id, "global");
    } catch (e) {
      console.warn("signOut warning (non-blocking):", e.message);
    }

    // 2. Delete all related data in FK-safe order
    // Get ml_account ids first (needed for finance cleanup)
    const { data: mlAccounts } = await supabaseAdmin
      .from("ml_accounts")
      .select("id")
      .eq("user_id", target_user_id);

    const mlAccountIds = (mlAccounts || []).map((a: { id: string }) => a.id);

    const deletionLog: Record<string, number> = {};

    const deleteFromTable = async (table: string, column: string, value: string | string[]) => {
      try {
        let query = supabaseAdmin.from(table).delete();
        if (Array.isArray(value)) {
          if (value.length === 0) return;
          query = query.in(column, value);
        } else {
          query = query.eq(column, value);
        }
        const { data, error } = await query.select("id");
        if (error) console.error(`Error deleting from ${table}:`, error.message);
        deletionLog[table] = data?.length || 0;
      } catch (e) {
        console.error(`Exception deleting from ${table}:`, e.message);
        deletionLog[table] = -1;
      }
    };

    // Phase 1: finance tables (depend on finance_accounts which depends on ml_accounts)
    if (mlAccountIds.length > 0) {
      // Get finance_account ids
      const { data: finAccts } = await supabaseAdmin
        .from("finance_accounts")
        .select("id")
        .in("ml_account_id", mlAccountIds);
      const finAcctIds = (finAccts || []).map((a: { id: string }) => a.id);

      if (finAcctIds.length > 0) {
        await deleteFromTable("finance_payments", "finance_account_id", finAcctIds);
        await deleteFromTable("finance_movements", "finance_account_id", finAcctIds);
        await deleteFromTable("finance_sync_jobs", "finance_account_id", finAcctIds);
        await deleteFromTable("finance_sync_runs", "finance_account_id", finAcctIds);
      }
      await deleteFromTable("finance_accounts", "ml_account_id", mlAccountIds);
    }

    // Phase 2: tables referencing ml_accounts
    await deleteFromTable("listing_clone_drafts", "user_id", target_user_id);
    await deleteFromTable("clone_drafts", "user_id", target_user_id);
    await deleteFromTable("analyzed_items", "user_id", target_user_id);
    await deleteFromTable("sync_jobs", "user_id", target_user_id);

    // Phase 3: ads / timeline
    await deleteFromTable("ad_timeline_stats", "workspace_id", target_user_id);
    await deleteFromTable("ad_lifecycle_actions", "workspace_id", target_user_id);

    // Phase 4: security & preferences
    await deleteFromTable("security_events", "user_id", target_user_id);
    await deleteFromTable("user_security_settings", "user_id", target_user_id);
    await deleteFromTable("billing_info", "user_id", target_user_id);
    await deleteFromTable("notification_preferences", "user_id", target_user_id);
    await deleteFromTable("user_feature_flags", "user_id", target_user_id);
    await deleteFromTable("user_email_preferences", "user_id", target_user_id);
    await deleteFromTable("cookie_consents", "user_id", target_user_id);

    // Phase 5: seller metrics
    await deleteFromTable("seller_item_visits", "user_id", target_user_id);
    await deleteFromTable("seller_item_sales_daily", "user_id", target_user_id);
    await deleteFromTable("seller_item_sales_monthly", "user_id", target_user_id);
    await deleteFromTable("monthly_rankings", "user_id", target_user_id);

    // Phase 6: ads module
    await deleteFromTable("ads_daily_metrics", "user_id", target_user_id);
    await deleteFromTable("ads_items", "user_id", target_user_id);
    await deleteFromTable("ads_ad_groups", "user_id", target_user_id);
    await deleteFromTable("ads_campaigns", "user_id", target_user_id);
    await deleteFromTable("ads_ai_analyses", "user_id", target_user_id);
    await deleteFromTable("ads_alerts", "user_id", target_user_id);
    await deleteFromTable("ads_automation_rules", "user_id", target_user_id);
    await deleteFromTable("ads_period_cache", "user_id", target_user_id);
    await deleteFromTable("ads_sync_state", "user_id", target_user_id);

    // Phase 7: abc / misc
    await deleteFromTable("abc_profit_cache", "user_id", target_user_id);
    await deleteFromTable("abc_config", "user_id", target_user_id);
    await deleteFromTable("account_category_activity", "user_id", target_user_id);
    await deleteFromTable("account_category_sync_state", "user_id", target_user_id);
    await deleteFromTable("account_events", "user_id", target_user_id);
    await deleteFromTable("app_notifications", "user_id", target_user_id);

    // Phase 7b: Seed module (FK-safe order)
    await deleteFromTable("seed_metrics_snapshots", "user_id", target_user_id);
    await deleteFromTable("seed_item_history", "user_id", target_user_id);
    await deleteFromTable("seed_planted_items", "user_id", target_user_id);
    await deleteFromTable("seed_balance", "user_id", target_user_id);
    await deleteFromTable("seed_aplus_candidates", "user_id", target_user_id);
    await deleteFromTable("seed_purchases", "user_id", target_user_id);

    // Phase 7c: Pricing simulator
    {
      const { data: sims } = await supabaseAdmin
        .from("pricing_simulations")
        .select("id")
        .eq("user_id", target_user_id);
      const simIds = (sims || []).map((s: { id: string }) => s.id);
      if (simIds.length > 0) {
        await deleteFromTable("pricing_simulation_results", "simulation_id", simIds);
        await deleteFromTable("pricing_simulation_inputs", "simulation_id", simIds);
      }
      await deleteFromTable("pricing_simulations", "user_id", target_user_id);
    }

    // Phase 8: core user tables
    await deleteFromTable("user_access_state", "user_id", target_user_id);
    await deleteFromTable("user_roles", "user_id", target_user_id);
    await deleteFromTable("ml_accounts", "user_id", target_user_id);
    await deleteFromTable("user_context", "user_id", target_user_id);
    await deleteFromTable("companies", "user_id", target_user_id);
    await deleteFromTable("profiles", "user_id", target_user_id);

    // Phase 9: delete auth user
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(target_user_id);

    if (authDeleteError) {
      console.error("CRITICAL: Failed to delete auth user:", authDeleteError.message);
      return new Response(
        JSON.stringify({
          error: `Data cleaned but auth deletion failed: ${authDeleteError.message}`,
          tables_cleaned: deletionLog,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Audit log
    await supabaseAdmin.from("admin_action_log").insert({
      admin_user_id: callerUserId,
      action_type: "delete_user",
      target_table: "auth.users",
      target_id: target_user_id,
      old_value: {
        email: targetProfile?.email,
        full_name: targetProfile?.full_name,
      },
      new_value: null,
      description: `Admin deleted user ${targetProfile?.email || target_user_id}. Tables cleaned: ${JSON.stringify(deletionLog)}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        deleted_user_id: target_user_id,
        tables_cleaned: deletionLog,
        auth_deleted: true,
        session_revoked: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("admin-delete-user error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
