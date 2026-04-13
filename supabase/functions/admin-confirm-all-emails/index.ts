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

    const { data: isAdmin, error: roleError } = await anonClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (roleError) throw roleError;

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const emailFilter = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;

    const adminClient = createClient(supabaseUrl, serviceKey);

    let page = 1;
    const perPage = 200;
    const users: Array<{ id: string; email?: string | null; email_confirmed_at?: string | null }> = [];

    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      const batch = data?.users ?? [];
      users.push(...batch.map((user) => ({
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
      })));

      if (batch.length < perPage) break;
      page += 1;
    }

    const filteredUsers = emailFilter
      ? users.filter((user) => user.email?.toLowerCase() === emailFilter)
      : users;

    const targets = filteredUsers.filter((user) => !user.email_confirmed_at && user.email);

    let confirmed = 0;
    let errors = 0;
    const error_details: Array<{ user_id: string; email: string | null | undefined; error: string }> = [];

    for (const user of targets) {
      const { error } = await adminClient.auth.admin.updateUserById(user.id, {
        email_confirm: true,
      });

      if (error) {
        errors += 1;
        error_details.push({
          user_id: user.id,
          email: user.email,
          error: error.message,
        });
          continue;
      }

      confirmed += 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        email_filter: emailFilter,
        total_users: users.length,
        matched_users: filteredUsers.length,
        targeted_unconfirmed: targets.length,
        confirmed,
        errors,
        error_details: error_details.length ? error_details : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
