import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auditLog } from "../_shared/audit-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 20;
const MAX_RETRY_ATTEMPTS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  const startMs = Date.now();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Allow cron (no auth) or admin auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const internalKey = req.headers.get("x-internal-key");
    const isCron = internalKey === supabaseServiceKey;

    if (!isCron) {
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
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get provider settings
    const { data: providerSettings } = await supabase
      .from("email_provider_settings")
      .select("from_name, from_email, is_enabled")
      .limit(1)
      .single();

    if (!providerSettings?.is_enabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "provider_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fromName = providerSettings.from_name || "MKTP Fácil";
    const fromEmail = providerSettings.from_email || "noreply@mktpfacil.com";

    // 1. Fetch queued emails (highest priority first)
    const { data: queue, error: queueErr } = await supabase
      .from("email_queue")
      .select("*")
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (queueErr) throw queueErr;

    // 2. Also fetch retry-eligible emails
    const { data: retryQueue } = await supabase
      .from("email_queue")
      .select("*")
      .eq("status", "retry")
      .lte("next_retry_at", new Date().toISOString())
      .order("priority", { ascending: false })
      .limit(Math.max(0, BATCH_SIZE - (queue?.length || 0)));

    const allItems = [...(queue || []), ...(retryQueue || [])];

    if (allItems.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No emails in queue" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Process each item
    for (const item of allItems) {
      try {
        // Mark as sending
        await supabase
          .from("email_queue")
          .update({ status: "sending" as any, updated_at: new Date().toISOString() })
          .eq("id", item.id);

        // Send via Resend
        const resendResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: [item.to_email],
            subject: item.subject_resolved,
            html: item.body_html_resolved,
            text: item.body_text_resolved || undefined,
            reply_to: providerSettings.reply_to_email || undefined,
          }),
        });

        const resendData = await resendResp.json();

        if (resendResp.ok) {
          // Success
          await supabase
            .from("email_queue")
            .update({
              status: "sent" as any,
              sent_at: new Date().toISOString(),
              provider_message_id: resendData.id,
              attempt_count: (item.attempt_count || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          await supabase.from("email_logs").insert({
            action: "sent",
            source_type: item.source_type,
            source_id: item.source_id,
            template_id: item.template_id,
            queue_id: item.id,
            email: item.to_email,
            message: `Sent to ${item.to_email}: ${item.subject_resolved}`,
            details_json: { provider_message_id: resendData.id, attempt: (item.attempt_count || 0) + 1 },
          });

          sent++;
        } else {
          // Failed
          const attempts = (item.attempt_count || 0) + 1;
          const shouldRetry = attempts < (item.max_attempts || MAX_RETRY_ATTEMPTS);

          // Exponential backoff: 1min, 5min, 15min
          const retryDelay = Math.pow(3, attempts) * 60 * 1000;
          const nextRetry = new Date(Date.now() + retryDelay).toISOString();

          await supabase
            .from("email_queue")
            .update({
              status: (shouldRetry ? "retry" : "failed") as any,
              attempt_count: attempts,
              next_retry_at: shouldRetry ? nextRetry : null,
              error: JSON.stringify(resendData),
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          await supabase.from("email_logs").insert({
            action: "fail",
            source_type: item.source_type,
            source_id: item.source_id,
            template_id: item.template_id,
            queue_id: item.id,
            email: item.to_email,
            message: `Failed (attempt ${attempts}): ${JSON.stringify(resendData).slice(0, 200)}`,
            details_json: { error: resendData, attempt: attempts, will_retry: shouldRetry },
          });

          failed++;
        }

        // Rate limit: 100ms between sends
        await new Promise((r) => setTimeout(r, 100));
      } catch (itemErr) {
        // Item-level error - mark failed
        const attempts = (item.attempt_count || 0) + 1;
        await supabase
          .from("email_queue")
          .update({
            status: "failed" as any,
            attempt_count: attempts,
            error: itemErr.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        await supabase.from("email_logs").insert({
          action: "fail",
          queue_id: item.id,
          email: item.to_email,
          message: `Exception: ${itemErr.message}`,
        });

        failed++;
      }
    }

    await auditLog(supabase, {
      level: "info",
      area: "email",
      action: "worker_send_batch",
      success: true,
      message: `Batch processed: ${sent} sent, ${failed} failed, ${skipped} skipped`,
      meta: { sent, failed, skipped, batch_size: allItems.length, duration_ms: Date.now() - startMs },
    });

    return new Response(
      JSON.stringify({ success: true, sent, failed, skipped, duration_ms: Date.now() - startMs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await auditLog(supabase, {
      level: "error",
      area: "email",
      action: "worker_send_batch",
      success: false,
      message: err.message,
      meta: { sent, failed, duration_ms: Date.now() - startMs },
    });

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
