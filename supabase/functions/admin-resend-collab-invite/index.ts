import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Reenvio de convite admin-only.
 * Body: { collaboratorId: string }  OU  { email: string }
 * Bypassa a checagem de "admin do workspace" — só admins globais podem usar.
 */
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
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: isAdmin } = await anonClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const admin = createClient(supabaseUrl, serviceKey);

    let collab: any = null;
    if (body.collaboratorId) {
      const { data } = await admin.from("collaborators").select("*").eq("id", body.collaboratorId).maybeSingle();
      collab = data;
    } else if (body.email) {
      const { data } = await admin.from("collaborators").select("*").ilike("email", body.email).limit(1).maybeSingle();
      collab = data;
    }
    if (!collab) {
      return new Response(JSON.stringify({ error: "Colaborador não encontrado" }), { status: 404, headers: corsHeaders });
    }

    const REDIRECT_URL = "https://www.mktpfacil.com/auth";

    // Procura usuário existente paginando
    const target = collab.email.toLowerCase();
    let existing: any = null;
    let page = 1;
    while (page <= 20) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      const u = data?.users?.find((x: any) => x.email?.toLowerCase() === target);
      if (u) { existing = u; break; }
      if (!data?.users?.length || data.users.length < 1000) break;
      page++;
    }

    let authUserId: string;
    let dispatchMethod = "";

    if (existing) {
      authUserId = existing.id;
      const { error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email: collab.email,
        options: { redirectTo: REDIRECT_URL },
      });
      if (linkErr) {
        const { error: magicErr } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: collab.email,
          options: { redirectTo: REDIRECT_URL },
        });
        if (magicErr) {
          return new Response(JSON.stringify({
            error: `Falha ao reenviar: ${magicErr.message}`,
            wasExistingUser: true,
          }), { status: 500, headers: corsHeaders });
        }
        dispatchMethod = "magiclink (existing user)";
      } else {
        dispatchMethod = "invite (existing user)";
      }
    } else {
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(collab.email, {
        redirectTo: REDIRECT_URL,
        data: { full_name: collab.name },
      });
      if (invErr) {
        return new Response(JSON.stringify({ error: `inviteUserByEmail falhou: ${invErr.message}` }), { status: 500, headers: corsHeaders });
      }
      authUserId = inv.user!.id;
      dispatchMethod = "inviteUserByEmail (new user)";
    }

    await admin.from("collaborators").update({
      auth_user_id: authUserId,
      invited_at: new Date().toISOString(),
      status: "invited",
    }).eq("id", collab.id);

    return new Response(JSON.stringify({
      success: true,
      email: collab.email,
      method: dispatchMethod,
      wasExistingUser: !!existing,
      authUserId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
