import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Generates an access link for a user, depending on their state.
 *
 * Body:
 *  - target_user_id?: string
 *  - email?: string
 *  - mode?: "confirmation" | "recovery" | "auto" (default "auto")
 *  - return_link?: boolean (default true) — include masked link in response
 *
 * Behavior:
 *  - If user is NOT confirmed → generates "signup" link (real confirmation)
 *  - If user IS confirmed → generates "recovery" link
 *  - "auto" detects state and picks the correct flow
 *
 * IMPORTANT: This function returns a masked link only. It does NOT trigger
 * an email send. The actual transactional email is sent by Supabase Auth's
 * native flows (resend / recovery), which are reachable via separate
 * helpers. Use this when the admin wants a copy-paste link for support.
 */
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
    const { data: isAdmin } = await anonClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { target_user_id, email } = body;
    const mode: "confirmation" | "recovery" | "auto" = body?.mode || "auto";

    if (!target_user_id && !email) {
      return new Response(
        JSON.stringify({ error: "target_user_id or email required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Find the user (we need email + email_confirmed_at to pick the flow)
    let targetEmail: string | null = email || null;
    let targetUser: any = null;

    if (target_user_id) {
      const { data, error } = await adminClient.auth.admin.getUserById(target_user_id);
      if (!error && data?.user) {
        targetUser = data.user;
        targetEmail = targetEmail || data.user.email;
      }
    }

    if (!targetUser && targetEmail) {
      let page = 1;
      const perPage = 200;
      const lower = targetEmail.toLowerCase();
      while (!targetUser) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) break;
        const users = data?.users ?? [];
        targetUser = users.find((u: any) => u.email?.toLowerCase() === lower);
        if (users.length < perPage) break;
        page++;
      }
    }

    if (!targetEmail && targetUser) targetEmail = targetUser.email;

    if (!targetEmail) {
      return new Response(
        JSON.stringify({ error: "Email not found for user" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decide effective mode
    const isConfirmed = !!targetUser?.email_confirmed_at;
    let effectiveMode: "confirmation" | "recovery";
    if (mode === "confirmation") {
      effectiveMode = "confirmation";
    } else if (mode === "recovery") {
      effectiveMode = "recovery";
    } else {
      // auto
      effectiveMode = isConfirmed ? "recovery" : "confirmation";
    }

    // Generate the proper link
    let linkData: any = null;
    let linkError: any = null;

    if (effectiveMode === "recovery") {
      ({ data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: {
          redirectTo: `${body.redirectTo || "https://www.mktpfacil.com"}/reset-password`,
        },
      }));
    } else {
      // confirmation: try magiclink first (existing user), fall back to signup
      ({ data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
      }));
      if (linkError) {
        ({ data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "signup",
          email: targetEmail,
        }));
      }
    }

    if (linkError) {
      if (
        linkError.message?.includes("already confirmed") ||
        linkError.message?.includes("already registered")
      ) {
        return new Response(
          JSON.stringify({
            success: true,
            effective_mode: effectiveMode,
            email_confirmed: isConfirmed,
            message: "Usuário já confirmou o e-mail",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw linkError;
    }

    const verificationLink = linkData?.properties?.action_link || null;

    if (!verificationLink) {
      return new Response(
        JSON.stringify({
          success: true,
          effective_mode: effectiveMode,
          email_confirmed: isConfirmed,
          message: "Link processado, mas nenhum action_link retornado",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save in verification_links and return masked URL
    const { data: record, error: insertError } = await adminClient
      .from("verification_links")
      .insert({ verification_url: verificationLink })
      .select("id")
      .single();

    if (insertError || !record) {
      // Fallback: raw link
      return new Response(
        JSON.stringify({
          success: true,
          effective_mode: effectiveMode,
          email_confirmed: isConfirmed,
          message:
            effectiveMode === "recovery"
              ? "Link de recuperação gerado"
              : "Link de confirmação gerado",
          verification_link: verificationLink,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const maskedLink = `https://www.mktpfacil.com/verificar?t=${record.id}`;

    return new Response(
      JSON.stringify({
        success: true,
        effective_mode: effectiveMode,
        email_confirmed: isConfirmed,
        message:
          effectiveMode === "recovery"
            ? "Link de recuperação gerado. Use 'Copiar Link' para enviar ao cliente."
            : "Link de confirmação gerado. Use 'Copiar Link' para enviar ao cliente.",
        verification_link: maskedLink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
