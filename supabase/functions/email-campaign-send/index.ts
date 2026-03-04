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
    // Auth check - admin only
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { campaign_id, action } = body;

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("email_campaigns")
      .select("*, email_templates(*)")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: build_recipients - resolve audience and save recipients list
    if (action === "build_recipients") {
      const template = campaign.email_templates;
      const recipients = await resolveAudience(supabase, campaign.audience_json);

      // Check opt-in for each recipient
      const validRecipients: any[] = [];
      for (const r of recipients) {
        if (!template?.category_id) {
          validRecipients.push(r);
          continue;
        }

        const { data: pref } = await supabase
          .from("user_email_preferences")
          .select("is_opted_in")
          .eq("user_id", r.user_id)
          .eq("category_id", template.category_id)
          .maybeSingle();

        const { data: cat } = await supabase
          .from("email_categories")
          .select("can_user_opt_out, default_opt_in")
          .eq("id", template.category_id)
          .single();

        const isOptedIn = pref ? pref.is_opted_in : (cat?.default_opt_in ?? true);
        if (isOptedIn || !cat?.can_user_opt_out) {
          validRecipients.push(r);
        }
      }

      // Delete old recipients and insert new
      await supabase.from("email_campaign_recipients").delete().eq("campaign_id", campaign_id);

      if (validRecipients.length > 0) {
        const rows = validRecipients.map((r: any) => ({
          campaign_id,
          user_id: r.user_id,
          email: r.email,
          variables_json: { ...campaign.variables_default, ...r.variables },
          status: "pending",
        }));

        // Batch insert in chunks of 100
        for (let i = 0; i < rows.length; i += 100) {
          await supabase.from("email_campaign_recipients").insert(rows.slice(i, i + 100));
        }
      }

      await supabase.from("email_campaigns").update({
        total_recipients: validRecipients.length,
      }).eq("id", campaign_id);

      return new Response(
        JSON.stringify({ success: true, total_recipients: validRecipients.length, total_audience: recipients.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: send - start sending campaign
    if (action === "send") {
      if (!["draft", "scheduled"].includes(campaign.status)) {
        return new Response(JSON.stringify({ error: `Cannot send campaign with status: ${campaign.status}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const template = campaign.email_templates;
      if (!template || !template.is_enabled) {
        return new Response(JSON.stringify({ error: "Template disabled" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update campaign status
      await supabase.from("email_campaigns").update({
        status: "running",
        started_at: new Date().toISOString(),
      }).eq("id", campaign_id);

      // Get pending recipients
      const { data: pendingRecipients } = await supabase
        .from("email_campaign_recipients")
        .select("*")
        .eq("campaign_id", campaign_id)
        .eq("status", "pending")
        .limit(500);

      let sentCount = 0;
      let failedCount = 0;

      for (const recipient of pendingRecipients || []) {
        // Resolve template variables
        const vars = recipient.variables_json || {};
        let subject = template.subject;
        let html = template.body_html;
        let text = template.body_text;

        const schema = (template.variables_schema_json as string[]) || [];
        for (const key of schema) {
          const val = (vars as any)[key] || `[${key}]`;
          subject = subject.replaceAll(`{{${key}}}`, val);
          html = html.replaceAll(`{{${key}}}`, val);
          text = text.replaceAll(`{{${key}}}`, val);
        }

        // Enqueue
        const { data: queueItem, error: qErr } = await supabase
          .from("email_queue")
          .insert({
            source_type: "campaign",
            source_id: campaign_id,
            template_id: template.id,
            user_id: recipient.user_id,
            to_email: recipient.email,
            subject_resolved: subject,
            body_html_resolved: html,
            body_text_resolved: text,
            variables_json: vars,
            status: "queued",
            priority: 3,
          })
          .select()
          .single();

        if (qErr) {
          await supabase.from("email_campaign_recipients").update({
            status: "failed",
            error: qErr.message,
          }).eq("id", recipient.id);
          failedCount++;
        } else {
          await supabase.from("email_campaign_recipients").update({
            status: "queued",
            queue_id: queueItem.id,
          }).eq("id", recipient.id);
          sentCount++;
        }

        // Throttle
        if (campaign.throttle_per_minute > 0) {
          const delayMs = Math.ceil(60000 / campaign.throttle_per_minute);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }

      // Check if all recipients processed
      const { count: remaining } = await supabase
        .from("email_campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .eq("status", "pending");

      const finalStatus = (remaining || 0) === 0 ? "completed" : "running";

      await supabase.from("email_campaigns").update({
        status: finalStatus,
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: finalStatus === "completed" ? new Date().toISOString() : null,
      }).eq("id", campaign_id);

      await supabase.from("email_logs").insert({
        action: "campaign_send",
        source_type: "campaign",
        source_id: campaign_id,
        message: `Campaign "${campaign.name}" processed: ${sentCount} queued, ${failedCount} failed`,
        details_json: { sent: sentCount, failed: failedCount, remaining: remaining || 0 },
      });

      await auditLog(supabase, {
        level: "info",
        area: "email",
        action: "campaign_send",
        userId: user.id,
        success: true,
        message: `Campaign "${campaign.name}": ${sentCount} queued, ${failedCount} failed`,
        meta: { campaign_id, sent: sentCount, failed: failedCount, duration_ms: Date.now() - startMs },
      });

      return new Response(
        JSON.stringify({ success: true, status: finalStatus, sent: sentCount, failed: failedCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: pause
    if (action === "pause") {
      await supabase.from("email_campaigns").update({ status: "paused" }).eq("id", campaign_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: cancel
    if (action === "cancel") {
      await supabase.from("email_campaigns").update({ status: "cancelled" }).eq("id", campaign_id);
      // Cancel pending recipients
      await supabase.from("email_campaign_recipients").update({ status: "skipped" })
        .eq("campaign_id", campaign_id).eq("status", "pending");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await auditLog(supabase, {
      level: "error",
      area: "email",
      action: "campaign_action",
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

// ============ Audience Resolver ============

interface AudienceMember {
  user_id: string;
  email: string;
  variables: Record<string, string>;
}

async function resolveAudience(supabase: any, audienceJson: any): Promise<AudienceMember[]> {
  const members: AudienceMember[] = [];
  const scope = audienceJson?.scope || "all";

  switch (scope) {
    case "all": {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .not("email", "is", null)
        .limit(1000);
      for (const p of profiles || []) {
        members.push({
          user_id: p.user_id,
          email: p.email,
          variables: { user_name: p.full_name || "Usuário", user_email: p.email },
        });
      }
      break;
    }

    case "trial_active": {
      const { data: companies } = await supabase
        .from("companies")
        .select("user_id, display_name, trial_ends_at")
        .eq("trial_status", "active")
        .gt("trial_ends_at", new Date().toISOString());
      for (const c of companies || []) {
        const { data: profile } = await supabase
          .from("profiles").select("email, full_name").eq("user_id", c.user_id).maybeSingle();
        if (profile?.email) {
          members.push({
            user_id: c.user_id,
            email: profile.email,
            variables: { user_name: profile.full_name || "Usuário", company_name: c.display_name || "" },
          });
        }
      }
      break;
    }

    case "paid_active": {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("user_id, plan_name")
        .eq("status", "active")
        .limit(1000);
      for (const s of subs || []) {
        const { data: profile } = await supabase
          .from("profiles").select("email, full_name").eq("user_id", s.user_id).maybeSingle();
        if (profile?.email) {
          members.push({
            user_id: s.user_id,
            email: profile.email,
            variables: { user_name: profile.full_name || "Usuário", plan_name: s.plan_name || "" },
          });
        }
      }
      break;
    }

    case "custom_emails": {
      const emails = audienceJson?.emails || [];
      for (const email of emails) {
        members.push({
          user_id: "",
          email,
          variables: { user_name: "Usuário", user_email: email },
        });
      }
      break;
    }

    default:
      break;
  }

  return members;
}
