import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auditLog } from "../_shared/audit-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleCheck } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { to_email } = body;

    if (!to_email) {
      return new Response(JSON.stringify({ error: "to_email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get provider settings
    const { data: providerSettings } = await supabase
      .from("email_provider_settings")
      .select("*")
      .limit(1)
      .single();

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      // Update provider test status
      if (providerSettings) {
        await supabase
          .from("email_provider_settings")
          .update({
            last_test_at: new Date().toISOString(),
            last_test_status: "fail",
            last_test_error: "RESEND_API_KEY not configured",
          })
          .eq("id", providerSettings.id);
      }

      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const VERIFIED_SENDER_DOMAIN = "notify.notifica.mktpfacil.com";
    const fromName = providerSettings?.from_name || "MKTP Fácil";
    let fromEmail = providerSettings?.from_email || `noreply@${VERIFIED_SENDER_DOMAIN}`;
    
    // Validate sender domain matches verified domain
    const configuredDomain = fromEmail.split("@")[1];
    if (configuredDomain !== VERIFIED_SENDER_DOMAIN) {
      console.warn(`Configured from_email domain '${configuredDomain}' doesn't match verified domain. Using default.`);
      fromEmail = `noreply@${VERIFIED_SENDER_DOMAIN}`;
    }

    // Send test email via Resend
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to_email],
        subject: "🧪 E-mail de teste - MKTP Fácil",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a1a2e;">✅ Teste de E-mail</h2>
            <p>Este é um e-mail de teste enviado pelo módulo de comunicação do MKTP Fácil.</p>
            <p style="color: #666;">Provedor: Resend</p>
            <p style="color: #666;">Data: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">MKTP Fácil - Módulo de Comunicação</p>
          </div>
        `,
        text: `Teste de e-mail - MKTP Fácil. Provedor: Resend. Data: ${new Date().toISOString()}`,
      }),
    });

    const resendData = await resendResp.json();

    // Log to email_logs
    await supabase.from("email_logs").insert({
      action: "sent",
      source_type: "manual_test",
      email: to_email,
      message: resendResp.ok
        ? `Test email sent successfully to ${to_email}`
        : `Test email failed: ${JSON.stringify(resendData)}`,
      details_json: { provider: "resend", response: resendData, from: fromEmail },
    });

    // Update provider test status
    if (providerSettings) {
      await supabase
        .from("email_provider_settings")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: resendResp.ok ? "ok" : "fail",
          last_test_error: resendResp.ok ? null : JSON.stringify(resendData),
        })
        .eq("id", providerSettings.id);
    }

    await auditLog(supabase, {
      level: "info",
      area: "email",
      action: "test_provider",
      userId: user.id,
      success: resendResp.ok,
      message: `Test email to ${to_email}: ${resendResp.ok ? "ok" : "fail"}`,
      meta: { to_email, provider: "resend" },
    });

    if (!resendResp.ok) {
      return new Response(
        JSON.stringify({ success: false, error: resendData }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message_id: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
