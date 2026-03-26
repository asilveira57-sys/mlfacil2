import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Auth event type → email_templates.key mapping
const EVENT_TO_TEMPLATE_KEY: Record<string, string> = {
  signup: "confirm_email",
  recovery: "password_reset",
  magiclink: "confirm_email",        // reuse confirm_email
  invite: "confirm_email",           // reuse confirm_email
  email_change: "confirm_email",     // reuse confirm_email
  reauthentication: "confirm_email", // reuse confirm_email (token-based)
};

const SITE_NAME = "MKTP Fácil";
const FROM_ADDRESS = `MKTP Fácil <noreply@ale.mktpfacil.com>`;

function resolveTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ id: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Resend API error: ${response.status}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Support both direct payload and nested data structure
  const emailType = payload.data?.action_type || payload.action_type;
  const recipientEmail = payload.data?.email || payload.email;
  const confirmationUrl = payload.data?.url || payload.url;
  const token = payload.data?.token || payload.token;
  const newEmail = payload.data?.new_email || payload.new_email;

  console.log("Received auth event", { emailType, email: recipientEmail });

  if (!emailType || !recipientEmail) {
    return new Response(JSON.stringify({ error: "Missing action_type or email" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const templateKey = EVENT_TO_TEMPLATE_KEY[emailType];
  if (!templateKey) {
    console.error("Unknown email type", { emailType });
    return new Response(JSON.stringify({ error: `Unknown email type: ${emailType}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch template from database
  const { data: template, error: tplErr } = await supabase
    .from("email_templates")
    .select("id, subject, body_html, body_text, variables_schema_json")
    .eq("key", templateKey)
    .eq("is_enabled", true)
    .single();

  if (tplErr || !template) {
    console.error("Template not found", { templateKey, error: tplErr?.message });
    return new Response(JSON.stringify({ error: `Template not found: ${templateKey}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build variables for template resolution
  const variables: Record<string, string> = {
    site_name: SITE_NAME,
    user_name: recipientEmail.split("@")[0],
    user_email: recipientEmail,
    recipient: recipientEmail,
    action_link: confirmationUrl || "",
    confirmation_url: confirmationUrl || "",
    token: token || "",
    new_email: newEmail || "",
  };

  const resolvedSubject = resolveTemplate(template.subject, variables);
  const resolvedHtml = resolveTemplate(template.body_html, variables);
  const resolvedText = resolveTemplate(template.body_text, variables);

  try {
    const result = await sendViaResend({
      to: recipientEmail,
      subject: resolvedSubject,
      html: resolvedHtml,
      text: resolvedText,
    });

    console.log("Email sent via Resend", { id: result.id, emailType, templateKey, email: recipientEmail });

    // Log to email_logs
    await supabase.from("email_logs").insert({
      action: "sent",
      source_type: "auth_hook",
      event_key: emailType,
      email: recipientEmail,
      template_id: template.id,
      message: `Auth email sent: ${emailType} → ${templateKey}`,
      details_json: { resend_id: result.id, template_key: templateKey },
    });

    return new Response(
      JSON.stringify({ success: true, message_id: result.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send email";
    console.error("Resend API error", { error: message, emailType, email: recipientEmail });

    // Log failure
    await supabase.from("email_logs").insert({
      action: "error",
      source_type: "auth_hook",
      event_key: emailType,
      email: recipientEmail,
      template_id: template.id,
      message: `Auth email failed: ${message}`,
      details_json: { error: message, template_key: templateKey },
    });

    return new Response(JSON.stringify({ error: "Failed to send email" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
