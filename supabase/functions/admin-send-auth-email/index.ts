import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Triggers a REAL email send (goes through the auth-email-hook → email queue
 * → email_send_log) for the given user.
 *
 * Body:
 *  - target_user_id?: string
 *  - email?: string
 *  - mode?: "confirmation" | "recovery" | "auto" (default "auto")
 *  - redirectTo?: string
 *
 * "auto" detects user state:
 *  - email NOT confirmed → resend signup confirmation
 *  - email confirmed → send password recovery
 *
 * Returns { success, effective_mode, email, message }.
 */
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
    const { data: { user: caller } } = await anonClient.auth.getUser();
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
    const { target_user_id } = body;
    const inputEmail: string | undefined = body?.email?.trim()?.toLowerCase();
    const requestedMode: "confirmation" | "recovery" | "auto" = body?.mode || "auto";
    const redirectTo: string = body?.redirectTo || "https://www.mktpfacil.com";

    if (!target_user_id && !inputEmail) {
      return new Response(
        JSON.stringify({ error: "target_user_id or email required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Locate the user
    let targetUser: any = null;
    if (target_user_id) {
      const { data, error } = await adminClient.auth.admin.getUserById(target_user_id);
      if (!error) targetUser = data?.user || null;
    }
    if (!targetUser && inputEmail) {
      let page = 1;
      const perPage = 200;
      while (!targetUser) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) break;
        const users = data?.users ?? [];
        targetUser = users.find((u: any) => u.email?.toLowerCase() === inputEmail);
        if (users.length < perPage) break;
        page++;
      }
    }

    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetEmail = targetUser.email as string;
    const isConfirmed = !!targetUser.email_confirmed_at;

    // Decide effective mode
    let effectiveMode: "confirmation" | "recovery";
    if (requestedMode === "confirmation") effectiveMode = "confirmation";
    else if (requestedMode === "recovery") effectiveMode = "recovery";
    else effectiveMode = isConfirmed ? "recovery" : "confirmation";

    // For confirmation flow on already-confirmed users, fall back to recovery
    if (effectiveMode === "confirmation" && isConfirmed) {
      effectiveMode = "recovery";
    }

    // We use the public anon client (no auth header) for the public-facing
    // signup/recovery endpoints — these go through the auth-email-hook.
    const publicClient = createClient(supabaseUrl, anonKey);

    if (effectiveMode === "recovery") {
      const { error } = await publicClient.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${redirectTo}/reset-password`,
      });
      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          effective_mode: "recovery",
          email: targetEmail,
          email_confirmed: isConfirmed,
          message: "E-mail de recuperação enviado. Cliente deve verificar caixa de entrada e spam.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // confirmation
    const { error } = await publicClient.auth.resend({
      type: "signup",
      email: targetEmail,
      options: { emailRedirectTo: `${redirectTo}/auth/callback` },
    });
    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        effective_mode: "confirmation",
        email: targetEmail,
        email_confirmed: isConfirmed,
        message: "E-mail de confirmação reenviado. Cliente deve verificar caixa de entrada e spam.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("admin-send-auth-email error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
