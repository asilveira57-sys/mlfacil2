import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const traceId = crypto.randomUUID().substring(0, 12);

  try {
    const { company_id, seller_id, ml_user_id, force_refresh, requested_by_user_id } = await req.json();

    if (!company_id || !seller_id || !ml_user_id) {
      return jsonResponse({ error: "company_id, seller_id and ml_user_id are required" }, 400);
    }

    const dateRef = getDateRefSP();

    // 1. Check cache (unless force_refresh)
    if (!force_refresh) {
      const { data: cached } = await supabase
        .from("shipping_cutoff_cache")
        .select("*")
        .eq("company_id", company_id)
        .eq("seller_id", seller_id)
        .eq("date_ref", dateRef)
        .maybeSingle();

      if (cached && new Date(cached.expires_at) > new Date()) {
        await log(supabase, { trace_id: traceId, company_id, seller_id, action: "read_cache", status: "success", step: "cache_hit", execution_time_ms: Date.now() - startTime, payload_summary: { date_ref: dateRef } });

        return jsonResponse({
          flex: formatFlexResponse(cached),
          colecta: formatColectaResponse(cached),
          agency: formatAgencyResponse(cached),
          meta: { status: cached.status, fetched_at: cached.fetched_at, expires_at: cached.expires_at, timezone: cached.timezone, message: null },
        });
      }
    }

    // 2. Check manual rate limit
    if (force_refresh) {
      const { data: rl } = await supabase
        .from("shipping_cutoff_manual_rate_limit")
        .select("last_manual_refresh_at, cooldown_minutes")
        .eq("company_id", company_id)
        .eq("seller_id", seller_id)
        .maybeSingle();

      if (rl) {
        const diff = Date.now() - new Date(rl.last_manual_refresh_at).getTime();
        const cooldownMs = (rl.cooldown_minutes || 15) * 60 * 1000;
        if (diff < cooldownMs) {
          const remainingMin = Math.ceil((cooldownMs - diff) / 60000);
          await log(supabase, { trace_id: traceId, company_id, seller_id, action: "manual_refresh", status: "partial", step: "rate_limited", execution_time_ms: Date.now() - startTime, payload_summary: { remaining_min: remainingMin } });
          return jsonResponse({ error: "rate_limited", message: `Atualização recente. Aguarde ${remainingMin} minuto(s).` }, 429);
        }
      }
    }

    // 3. Call refresh function
    const refreshUrl = `${supabaseUrl}/functions/v1/meli-shipping-cutoff-refresh`;
    const refreshRes = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        company_id,
        seller_id,
        ml_user_id,
        initiated_by: force_refresh ? "manual" : "auto",
        requested_by_user_id: requested_by_user_id || null,
        trace_id: traceId,
      }),
    });

    const refreshResult = await refreshRes.json();

    if (!refreshRes.ok) {
      // Fallback to existing cache
      const { data: fallback } = await supabase
        .from("shipping_cutoff_cache")
        .select("*")
        .eq("company_id", company_id)
        .eq("seller_id", seller_id)
        .eq("date_ref", dateRef)
        .maybeSingle();

      if (fallback) {
        await log(supabase, { trace_id: traceId, company_id, seller_id, action: "fallback_partial", status: "partial", step: "refresh_failed_with_cache", execution_time_ms: Date.now() - startTime, error_message: refreshResult?.error });

        // Mark cache as partial
        await supabase.from("shipping_cutoff_cache").update({ status: "partial" }).eq("id", fallback.id);

        return jsonResponse({
          flex: formatFlexResponse(fallback),
          colecta: formatColectaResponse(fallback),
          agency: formatAgencyResponse(fallback),
          meta: { status: "partial", fetched_at: fallback.fetched_at, expires_at: fallback.expires_at, timezone: fallback.timezone, message: "Alguns dados não vieram agora." },
        });
      }

      return jsonResponse({
        flex: { enabled: false, cutoff_type: null, cutoff_time: null, zone_summary_first: null, zone_summary_last: null, zone_details_count: 0 },
        colecta: { enabled: false, cutoff_time: null, window_from: null, window_to: null, cutoff_calculated: false },
        agency: { enabled: false, cutoff_time: null },
        meta: { status: "error", fetched_at: null, expires_at: null, timezone: "America/Sao_Paulo", message: "Não foi possível buscar a hora de corte agora." },
      });
    }

    // Success: return normalized data from refresh result
    const cached = refreshResult.data;
    return jsonResponse({
      flex: formatFlexResponse(cached),
      colecta: formatColectaResponse(cached),
      meta: { status: cached.status, fetched_at: cached.fetched_at, expires_at: cached.expires_at, timezone: cached.timezone, message: cached.status === "partial" ? "Alguns dados não vieram agora." : null },
    });
  } catch (error: any) {
    console.error("[meli-shipping-cutoff-get] Error:", error);
    await log(supabase, { trace_id: traceId, company_id: null, seller_id: null, action: "error", status: "error", step: "unhandled", execution_time_ms: Date.now() - startTime, error_message: error.message });
    return jsonResponse({ error: error.message }, 500);
  }
});

// Helpers
function getDateRefSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function formatFlexResponse(c: any) {
  return {
    enabled: c.flex_enabled ?? false,
    cutoff_type: c.flex_cutoff_type,
    cutoff_time: c.flex_cutoff_time,
    zone_summary_first: c.flex_zone_summary_first,
    zone_summary_last: c.flex_zone_summary_last,
    zone_details_count: Array.isArray(c.flex_zone_details) ? c.flex_zone_details.length : 0,
  };
}

function formatColectaResponse(c: any) {
  return {
    enabled: c.colecta_enabled ?? false,
    cutoff_time: c.colecta_cutoff_time,
    window_from: c.colecta_window_from,
    window_to: c.colecta_window_to,
    cutoff_calculated: c.colecta_cutoff_calculated ?? false,
  };
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function log(supabase: any, d: any) {
  try {
    await supabase.from("shipping_cutoff_logs").insert({
      trace_id: d.trace_id, company_id: d.company_id, seller_id: d.seller_id,
      action: d.action, status: d.status, step: d.step,
      execution_time_ms: d.execution_time_ms, http_status: d.http_status || null,
      endpoint_name: d.endpoint_name || null,
      payload_summary: d.payload_summary || null, error_message: d.error_message || null,
    });
  } catch (e) { console.error("Log failed:", e); }
}
