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
  let evaluated = 0;
  let enqueued = 0;

  try {
    // Allow cron or admin auth
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

    // Fetch schedules that are due
    const now = new Date().toISOString();
    const { data: schedules, error: schedErr } = await supabase
      .from("email_schedules")
      .select("*, email_templates(*)")
      .eq("is_enabled", true)
      .or(`next_run_at.is.null,next_run_at.lte.${now}`);

    if (schedErr) throw schedErr;
    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, evaluated: 0, enqueued: 0, message: "No schedules due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const schedule of schedules) {
      evaluated++;
      const template = schedule.email_templates;
      if (!template || !template.is_enabled) {
        await supabase.from("email_schedules").update({
          last_run_at: now,
          last_run_status: "skipped_template_disabled",
          last_run_count: 0,
        }).eq("id", schedule.id);
        continue;
      }

      // Resolve recipients based on scope
      const recipients = await resolveRecipients(supabase, schedule.scope, schedule.segment_filter);

      let scheduleEnqueued = 0;
      for (const recipient of recipients) {
        // Check opt-in
        const { data: pref } = await supabase
          .from("user_email_preferences")
          .select("is_opted_in")
          .eq("user_id", recipient.user_id)
          .eq("category_id", template.category_id)
          .maybeSingle();

        const { data: category } = await supabase
          .from("email_categories")
          .select("can_user_opt_out, default_opt_in")
          .eq("id", template.category_id)
          .single();

        const isOptedIn = pref ? pref.is_opted_in : (category?.default_opt_in ?? true);
        if (!isOptedIn && category?.can_user_opt_out) continue;

        // Resolve variables
        const vars = { ...schedule.variables_default, ...recipient.variables };
        let subject = template.subject;
        let html = template.body_html;
        let text = template.body_text;

        const schema = (template.variables_schema_json as string[]) || [];
        for (const key of schema) {
          const val = vars[key] || `[${key}]`;
          subject = subject.replaceAll(`{{${key}}}`, val);
          html = html.replaceAll(`{{${key}}}`, val);
          text = text.replaceAll(`{{${key}}}`, val);
        }

        // Enqueue
        const { error: qErr } = await supabase.from("email_queue").insert({
          source_type: "schedule",
          source_id: schedule.id,
          template_id: template.id,
          user_id: recipient.user_id,
          to_email: recipient.email,
          subject_resolved: subject,
          body_html_resolved: html,
          body_text_resolved: text,
          variables_json: vars,
          status: "queued",
          priority: 5,
        });

        if (!qErr) {
          scheduleEnqueued++;
          enqueued++;
        }
      }

      // Calculate next run
      const nextRun = schedule.is_one_shot
        ? null
        : calculateNextRun(schedule.cron_expression, schedule.timezone);

      await supabase.from("email_schedules").update({
        last_run_at: now,
        last_run_status: "ok",
        last_run_count: scheduleEnqueued,
        next_run_at: nextRun,
        is_enabled: schedule.is_one_shot ? false : schedule.is_enabled,
      }).eq("id", schedule.id);

      await supabase.from("email_logs").insert({
        action: "schedule_run",
        source_type: "schedule",
        source_id: schedule.id,
        template_id: template.id,
        message: `Schedule "${schedule.name}" enqueued ${scheduleEnqueued} emails`,
        details_json: { scope: schedule.scope, recipients_total: recipients.length, enqueued: scheduleEnqueued },
      });
    }

    await auditLog(supabase, {
      level: "info",
      area: "email",
      action: "schedule_evaluate",
      success: true,
      message: `Evaluated ${evaluated} schedules, enqueued ${enqueued} emails`,
      meta: { evaluated, enqueued, duration_ms: Date.now() - startMs },
    });

    return new Response(
      JSON.stringify({ success: true, evaluated, enqueued, duration_ms: Date.now() - startMs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await auditLog(supabase, {
      level: "error",
      area: "email",
      action: "schedule_evaluate",
      success: false,
      message: err.message,
      meta: { evaluated, enqueued, duration_ms: Date.now() - startMs },
    });

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============ Helpers ============

interface Recipient {
  user_id: string;
  email: string;
  variables: Record<string, string>;
}

async function resolveRecipients(
  supabase: any,
  scope: string,
  _segmentFilter: any
): Promise<Recipient[]> {
  const recipients: Recipient[] = [];

  switch (scope) {
    case "all": {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .not("email", "is", null)
        .limit(500);
      for (const p of profiles || []) {
        recipients.push({
          user_id: p.user_id,
          email: p.email,
          variables: { user_name: p.full_name || "Usuário", user_email: p.email },
        });
      }
      break;
    }

    case "trial_expiring": {
      // Users with trial ending in the next 3 days
      const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      const { data: companies } = await supabase
        .from("companies")
        .select("user_id, trial_ends_at, display_name")
        .eq("trial_status", "active")
        .gte("trial_ends_at", now)
        .lte("trial_ends_at", inThreeDays);

      for (const c of companies || []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", c.user_id)
          .maybeSingle();
        if (profile?.email) {
          const daysLeft = Math.ceil((new Date(c.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          recipients.push({
            user_id: c.user_id,
            email: profile.email,
            variables: {
              user_name: profile.full_name || "Usuário",
              company_name: c.display_name || "",
              trial_days_remaining: String(daysLeft),
              trial_end_date: new Date(c.trial_ends_at).toLocaleDateString("pt-BR"),
            },
          });
        }
      }
      break;
    }

    case "trial_expired": {
      const { data: companies } = await supabase
        .from("companies")
        .select("user_id, trial_ends_at, display_name")
        .eq("trial_status", "expired")
        .limit(500);

      for (const c of companies || []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", c.user_id)
          .maybeSingle();
        if (profile?.email) {
          recipients.push({
            user_id: c.user_id,
            email: profile.email,
            variables: {
              user_name: profile.full_name || "Usuário",
              company_name: c.display_name || "",
            },
          });
        }
      }
      break;
    }

    case "active_paid": {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("user_id, plan_name")
        .eq("status", "active")
        .limit(500);

      for (const s of subs || []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", s.user_id)
          .maybeSingle();
        if (profile?.email) {
          recipients.push({
            user_id: s.user_id,
            email: profile.email,
            variables: {
              user_name: profile.full_name || "Usuário",
              plan_name: s.plan_name || "Plano",
            },
          });
        }
      }
      break;
    }

    case "inactive_30d": {
      // Users who haven't had orders in 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .lt("updated_at", thirtyDaysAgo)
        .not("email", "is", null)
        .limit(500);

      for (const p of profiles || []) {
        recipients.push({
          user_id: p.user_id,
          email: p.email,
          variables: { user_name: p.full_name || "Usuário" },
        });
      }
      break;
    }

    default:
      break;
  }

  return recipients;
}

/**
 * Simple cron-to-next-run calculator.
 * Supports: minute hour dayOfMonth month dayOfWeek
 * Returns ISO string for next run time.
 */
function calculateNextRun(cron: string, _timezone: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) {
    // Fallback: next hour
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  const now = new Date();
  const next = new Date(now);

  // Simple heuristic: advance to next matching slot
  if (dayOfWeek !== "*") {
    // Weekly schedule
    const targetDay = parseInt(dayOfWeek);
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    next.setDate(next.getDate() + daysUntil);
  } else if (dayOfMonth !== "*") {
    // Monthly schedule
    const targetDay = parseInt(dayOfMonth);
    next.setMonth(next.getMonth() + 1);
    next.setDate(targetDay);
  } else {
    // Daily schedule - next day
    next.setDate(next.getDate() + 1);
  }

  if (hour !== "*") next.setHours(parseInt(hour));
  if (minute !== "*") next.setMinutes(parseInt(minute));
  next.setSeconds(0);
  next.setMilliseconds(0);

  return next.toISOString();
}
