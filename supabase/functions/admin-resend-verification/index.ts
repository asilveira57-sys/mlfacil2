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
    const { data: isAdmin } = await anonClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { target_user_id, email } = body;
    if (!target_user_id && !email) {
      return new Response(JSON.stringify({ error: "target_user_id or email required" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Find user email if only user_id provided
    let targetEmail = email;
    if (!targetEmail && target_user_id) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("email")
        .eq("user_id", target_user_id)
        .maybeSingle();
      targetEmail = profile?.email;
    }

    if (!targetEmail) {
      return new Response(JSON.stringify({ error: "Email not found for user" }), { status: 404, headers: corsHeaders });
    }

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "signup",
      email: targetEmail,
    });

    if (linkError) {
      if (linkError.message?.includes("already confirmed") || linkError.message?.includes("already registered")) {
        return new Response(
          JSON.stringify({ success: true, message: "Usuário já confirmou o e-mail" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw linkError;
    }

    const verificationLink = linkData?.properties?.action_link || null;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: verificationLink 
          ? "Link de verificação gerado. Use o botão 'Copiar Link' para enviar manualmente ao cliente." 
          : "Verificação processada",
        ...(verificationLink ? { verification_link: verificationLink } : {}),
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
