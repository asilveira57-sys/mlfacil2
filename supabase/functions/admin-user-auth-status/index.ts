import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Returns the real auth state of a user so the admin UI can show the
 * correct action (resend confirmation vs send recovery) instead of
 * always offering "resend verification".
 *
 * Response:
 * {
 *   user_id, email,
 *   email_confirmed_at, last_sign_in_at,
 *   has_password (best-effort: true if any password set / sign-in occurred),
 *   recommended_action: "resend_confirmation" | "send_recovery" | "user_can_login",
 *   last_auth_email: { template_name, status, created_at, error_message } | null
 * }
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
    const target_user_id: string | undefined = body?.target_user_id;
    const inputEmail: string | undefined = body?.email?.trim()?.toLowerCase();

    if (!target_user_id && !inputEmail) {
      return new Response(
        JSON.stringify({ error: "target_user_id or email required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Locate the auth user
    let targetUser: any = null;

    if (target_user_id) {
      const { data, error } = await adminClient.auth.admin.getUserById(target_user_id);
      if (error) throw error;
      targetUser = data?.user || null;
    }

    if (!targetUser && inputEmail) {
      let page = 1;
      const perPage = 200;
      while (!targetUser) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
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

    const email = targetUser.email as string | null;
    const emailConfirmed = !!targetUser.email_confirmed_at;
    const lastSignIn = targetUser.last_sign_in_at as string | null;
    // Best-effort: if user already signed in, they have a usable credential
    const hasUsableCredential = !!lastSignIn;

    // Recommended action
    let recommended_action: "resend_confirmation" | "send_recovery" | "user_can_login";
    if (!emailConfirmed) {
      recommended_action = "resend_confirmation";
    } else if (!hasUsableCredential) {
      // confirmed but never logged in (typical of imported / admin-created)
      recommended_action = "send_recovery";
    } else {
      recommended_action = "user_can_login";
    }

    // Last auth email from email_send_log (auth_emails template)
    let last_auth_email: {
      template_name: string | null;
      status: string;
      created_at: string;
      error_message: string | null;
    } | null = null;

    if (email) {
      const { data: logs } = await adminClient
        .from("email_send_log")
        .select("template_name, status, created_at, error_message")
        .eq("recipient_email", email)
        .order("created_at", { ascending: false })
        .limit(5);

      if (logs && logs.length > 0) {
        // Prefer the most recent non-pending status; fallback to the very latest
        const finalized = logs.find((l: any) =>
          ["sent", "dlq", "failed", "bounced", "complained", "suppressed"].includes(l.status)
        );
        last_auth_email = (finalized || logs[0]) as any;
      }
    }

    return new Response(
      JSON.stringify({
        user_id: targetUser.id,
        email,
        email_confirmed_at: targetUser.email_confirmed_at || null,
        last_sign_in_at: lastSignIn,
        has_usable_credential: hasUsableCredential,
        recommended_action,
        last_auth_email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("admin-user-auth-status error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
