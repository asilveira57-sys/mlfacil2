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

    // Verify caller is admin
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } =
      await supabaseUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = claimsData.claims.sub as string;

    // Check admin role using service client
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
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prevent self-deletion
    if (target_user_id === callerUserId) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your own account" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get target user info for audit log
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", target_user_id)
      .maybeSingle();

    // Delete related data in order (respecting foreign keys)
    const tables = [
      "user_roles",
      "user_access_state",
      "ml_accounts",
      "user_context",
      "companies",
      "profiles",
    ];

    const deletionLog: Record<string, number> = {};

    for (const table of tables) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq("user_id", target_user_id)
        .select("id");

      if (error) {
        console.error(`Error deleting from ${table}:`, error.message);
      }
      deletionLog[table] = data?.length || 0;
    }

    // Delete auth user
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(target_user_id);

    if (authDeleteError) {
      console.error("Error deleting auth user:", authDeleteError.message);
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
        auth_deleted: !authDeleteError,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("admin-delete-user error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
