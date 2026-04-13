import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const {
      data: { user: caller },
    } = await anonClient.auth.getUser();

    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await anonClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email = body?.email?.trim().toLowerCase();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Find user by email
    const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    // We need to search through all users to find by email
    let targetUser: any = null;
    let page = 1;
    const perPage = 200;

    while (!targetUser) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      const users = data?.users ?? [];
      targetUser = users.find(
        (u: any) => u.email?.toLowerCase() === email
      );

      if (users.length < perPage) break;
      page++;
    }

    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: `User not found: ${email}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure email is confirmed first
    if (!targetUser.email_confirmed_at) {
      await adminClient.auth.admin.updateUserById(targetUser.id, {
        email_confirm: true,
      });
    }

    // Generate a magic link for password recovery
    const { data: linkData, error: linkErr } =
      await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: email,
        options: {
          redirectTo: `${body.redirectTo || "https://mlfacil2.lovable.app"}/reset-password`,
        },
      });

    if (linkErr) {
      throw linkErr;
    }

    // The generated link contains the token - build the proper redirect URL
    const properties = linkData?.properties;
    const actionLink = properties?.action_link;

    return new Response(
      JSON.stringify({
        success: true,
        email,
        user_id: targetUser.id,
        email_confirmed: !!targetUser.email_confirmed_at || true,
        recovery_link: actionLink,
        hashed_token: properties?.hashed_token,
        expires_at: properties?.verification_type,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error generating reset link:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
