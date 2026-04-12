import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") || "";
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const { data: isAdmin } = await anonClient.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
    }

    const { password, dry_run } = await req.json();
    if (!password || password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Find users who never logged in (no successful login in security_events)
    const { data: usersWithLogin, error: loginErr } = await adminClient
      .from("security_events")
      .select("user_id")
      .eq("event_type", "login")
      .eq("success", true);

    if (loginErr) throw new Error(`Failed to query login events: ${loginErr.message}`);

    const loggedInUserIds = new Set((usersWithLogin || []).map((e: any) => e.user_id));

    // Get all profiles with email
    const { data: allProfiles, error: profErr } = await adminClient
      .from("profiles")
      .select("user_id, email, full_name")
      .not("email", "is", null);

    if (profErr) throw new Error(`Failed to query profiles: ${profErr.message}`);

    // Filter to users who never logged in
    const targetUsers = (allProfiles || []).filter((p: any) => !loggedInUserIds.has(p.user_id));

    if (dry_run) {
      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        total_users: targetUsers.length,
        users: targetUsers.map((u: any) => ({ email: u.email, full_name: u.full_name })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Set password for each user
    let updated = 0;
    let errors = 0;
    const errorDetails: any[] = [];

    for (const user of targetUsers) {
      try {
        const { error: updateErr } = await adminClient.auth.admin.updateUserById(user.user_id, {
          password,
        });
        if (updateErr) {
          errors++;
          errorDetails.push({ email: user.email, error: updateErr.message });
        } else {
          updated++;
        }
      } catch (err: any) {
        errors++;
        errorDetails.push({ email: user.email, error: err.message });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_targeted: targetUsers.length,
      updated,
      errors,
      error_details: errorDetails.length > 0 ? errorDetails : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
