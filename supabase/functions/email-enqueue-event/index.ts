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

  const startMs = Date.now();

  try {
    // Auth check - allow service-role (internal) or user JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    let callerId: string | null = null;

    // Check if it's a service-role call (internal from other edge functions)
    const token = authHeader.replace("Bearer ", "");
    if (token === supabaseServiceKey) {
      // Internal call - trusted, use user_id from body
      callerId = null; // will be set from body below
    } else {
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
      callerId = user.id;
    }

    const body = await req.json();
    const { event_key, user_id, company_id, variables, dedup_key, to_email } = body;

    if (!event_key) {
      return new Response(JSON.stringify({ error: "event_key required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUserId = user_id || callerId;
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "user_id required for internal calls" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const logBase = { source_type: "event" as const, event_key, user_id: targetUserId, company_id };

    // 1. Find event rule
    const { data: rule, error: ruleErr } = await supabase
      .from("email_event_rules")
      .select("*, email_templates(*)")
      .eq("event_key", event_key)
      .single();

    if (ruleErr || !rule) {
      await supabase.from("email_logs").insert({
        ...logBase,
        action: "skip_opt_out",
        message: `No event rule found for ${event_key}`,
      });
      return new Response(JSON.stringify({ skipped: true, reason: "no_rule" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!rule.is_enabled) {
      await supabase.from("email_logs").insert({
        ...logBase,
        action: "skip_opt_out",
        message: `Event rule ${event_key} is disabled`,
      });
      return new Response(JSON.stringify({ skipped: true, reason: "rule_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const template = rule.email_templates;
    if (!template || !template.is_enabled) {
      await supabase.from("email_logs").insert({
        ...logBase,
        action: "skip_opt_out",
        template_id: rule.template_id,
        message: `Template disabled for ${event_key}`,
      });
      return new Response(JSON.stringify({ skipped: true, reason: "template_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Check user opt-in preference
    const { data: pref } = await supabase
      .from("user_email_preferences")
      .select("is_opted_in")
      .eq("user_id", targetUserId)
      .eq("category_id", template.category_id)
      .maybeSingle();

    // Get category to check if mandatory
    const { data: category } = await supabase
      .from("email_categories")
      .select("can_user_opt_out, default_opt_in")
      .eq("id", template.category_id)
      .single();

    const isOptedIn = pref ? pref.is_opted_in : (category?.default_opt_in ?? true);
    const canOptOut = category?.can_user_opt_out ?? true;

    if (!isOptedIn && canOptOut) {
      await supabase.from("email_logs").insert({
        ...logBase,
        action: "skip_opt_out",
        template_id: rule.template_id,
        message: `User opted out of category for ${event_key}`,
      });
      return new Response(JSON.stringify({ skipped: true, reason: "opted_out" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Dedup check
    const dedupKeyVal = dedup_key || event_key;
    const { data: existingDedup } = await supabase
      .from("email_event_dedup")
      .select("*")
      .eq("event_key", event_key)
      .eq("user_id", targetUserId)
      .eq("dedup_key", dedupKeyVal)
      .maybeSingle();

    if (existingDedup) {
      // Cooldown check
      if (rule.cooldown_minutes > 0) {
        const cooldownEnd = new Date(existingDedup.last_sent_at);
        cooldownEnd.setMinutes(cooldownEnd.getMinutes() + rule.cooldown_minutes);
        if (new Date() < cooldownEnd) {
          await supabase.from("email_logs").insert({
            ...logBase,
            action: "dedup_block",
            template_id: rule.template_id,
            message: `Cooldown active for ${event_key} (${rule.cooldown_minutes}min)`,
            details_json: { cooldown_end: cooldownEnd.toISOString(), last_sent: existingDedup.last_sent_at },
          });
          return new Response(JSON.stringify({ skipped: true, reason: "cooldown" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Max per day check
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const lastSentDate = new Date(existingDedup.last_sent_at);
      const sentToday = lastSentDate >= todayStart ? existingDedup.sent_count_day : 0;

      if (sentToday >= rule.max_per_day) {
        await supabase.from("email_logs").insert({
          ...logBase,
          action: "throttle_block",
          template_id: rule.template_id,
          message: `Max per day (${rule.max_per_day}) reached for ${event_key}`,
          details_json: { sent_today: sentToday, max: rule.max_per_day },
        });
        return new Response(JSON.stringify({ skipped: true, reason: "max_per_day" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 4. Resolve email address + human-readable context for logs
    let email = to_email;
    let userName: string | null = null;
    let companyName: string | null = null;

    // Get profile info (name + email)
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (profile) {
      email = email || profile.email;
      userName = profile.full_name || null;
    }

    // Fallback: get email from auth.users if not found in profiles
    if (!email) {
      try {
        const { data: authData } = await supabase.auth.admin.getUserById(targetUserId);
        if (authData?.user?.email) {
          email = authData.user.email;
        }
        if (!userName && authData?.user?.user_metadata?.full_name) {
          userName = authData.user.user_metadata.full_name;
        }
      } catch (_) {
        // fail-safe
      }
    }

    // Get company name for log context
    if (company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("display_name")
        .eq("id", company_id)
        .maybeSingle();
      companyName = company?.display_name || null;
    }

    const userLabel = userName || email || targetUserId.substring(0, 8) + "…";
    const companyLabel = companyName ? ` (empresa: ${companyName})` : "";

    if (!email) {
      await supabase.from("email_logs").insert({
        ...logBase,
        action: "invalid_email",
        template_id: rule.template_id,
        message: `Sem e-mail encontrado para ${userLabel}${companyLabel}`,
      });
      return new Response(JSON.stringify({ skipped: true, reason: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Resolve template variables
    const vars = variables || {};
    let resolvedSubject = template.subject;
    let resolvedHtml = template.body_html;
    let resolvedText = template.body_text;

    const schema = (template.variables_schema_json as string[]) || [];
    for (const key of schema) {
      const val = vars[key] || `[${key}]`;
      resolvedSubject = resolvedSubject.replaceAll(`{{${key}}}`, val);
      resolvedHtml = resolvedHtml.replaceAll(`{{${key}}}`, val);
      resolvedText = resolvedText.replaceAll(`{{${key}}}`, val);
    }

    // 6. Enqueue
    const { data: queueItem, error: queueErr } = await supabase
      .from("email_queue")
      .insert({
        source_type: "event",
        source_id: rule.id,
        template_id: rule.template_id,
        user_id: targetUserId,
        company_id: company_id || null,
        to_email: email,
        subject_resolved: resolvedSubject,
        body_html_resolved: resolvedHtml,
        body_text_resolved: resolvedText,
        variables_json: vars,
        status: "queued",
        priority: 10, // events get high priority
      })
      .select()
      .single();

    if (queueErr) {
      await supabase.from("email_logs").insert({
        ...logBase,
        action: "fail",
        template_id: rule.template_id,
        email,
        message: `Failed to enqueue: ${queueErr.message}`,
        details_json: { error: queueErr.message },
      });
      throw queueErr;
    }

    // 7. Update dedup
    if (existingDedup) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const lastSentDate = new Date(existingDedup.last_sent_at);
      const newCount = lastSentDate >= todayStart ? existingDedup.sent_count_day + 1 : 1;

      await supabase
        .from("email_event_dedup")
        .update({
          last_sent_at: new Date().toISOString(),
          sent_count_day: newCount,
        })
        .eq("id", existingDedup.id);
    } else {
      await supabase.from("email_event_dedup").insert({
        event_key,
        user_id: targetUserId,
        company_id: company_id || null,
        dedup_key: dedupKeyVal,
        last_sent_at: new Date().toISOString(),
        sent_count_day: 1,
      });
    }

    // 8. Log enqueue
    await supabase.from("email_logs").insert({
      ...logBase,
      action: "enqueue",
      template_id: rule.template_id,
      queue_id: queueItem.id,
      email,
      message: `Enqueued ${event_key} → ${userLabel} (${email})${companyLabel}`,
      details_json: {
        queue_id: queueItem.id,
        template_key: template.key,
        duration_ms: Date.now() - startMs,
      },
    });

    await auditLog(supabase, {
      level: "info",
      area: "email",
      action: "enqueue_event",
      userId: callerId || targetUserId,
      success: true,
      message: `Event ${event_key} enqueued for ${email}`,
      meta: { event_key, queue_id: queueItem.id, template_key: template.key },
    });

    return new Response(
      JSON.stringify({ success: true, queue_id: queueItem.id, email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await auditLog(supabase, {
      level: "error",
      area: "email",
      action: "enqueue_event",
      success: false,
      message: err.message,
      meta: { duration_ms: Date.now() - startMs },
    });

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
