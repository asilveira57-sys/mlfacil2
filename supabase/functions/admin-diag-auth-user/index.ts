import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: isAdmin } = await anonClient.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });

    const { email } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceKey);
    const target = String(email).trim().toLowerCase();

    // Paginate listUsers because there's no by-email filter
    let found: any = null;
    let page = 1;
    const perPage = 1000;
    while (page <= 20) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      const u = data?.users?.find((x: any) => x.email?.toLowerCase() === target);
      if (u) { found = u; break; }
      if (!data?.users?.length || data.users.length < perPage) break;
      page++;
    }

    return new Response(JSON.stringify({
      email: target,
      exists: !!found,
      user: found ? {
        id: found.id,
        email: found.email,
        created_at: found.created_at,
        invited_at: found.invited_at,
        confirmation_sent_at: found.confirmation_sent_at,
        email_confirmed_at: found.email_confirmed_at,
        last_sign_in_at: found.last_sign_in_at,
        identities_count: found.identities?.length ?? 0,
      } : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
