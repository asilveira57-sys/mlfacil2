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

  try {
    const { company_id, seller_id, ml_user_id, force_refresh } = await req.json();

    if (!company_id || !seller_id || !ml_user_id) {
      return new Response(
        JSON.stringify({ error: "company_id, seller_id and ml_user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate today in São Paulo timezone
    const now = new Date();
    const spFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateRef = spFormatter.format(now); // YYYY-MM-DD

    // Check cache first (unless force_refresh)
    if (!force_refresh) {
      const { data: cached } = await supabase
        .from("shipping_cutoff_cache")
        .select("*")
        .eq("company_id", company_id)
        .eq("seller_id", seller_id)
        .eq("date_ref", dateRef)
        .maybeSingle();

      if (cached && new Date(cached.expires_at) > now) {
        // Log cache read
        await logAction(supabase, {
          company_id,
          seller_id,
          action: "read_cache",
          status: "success",
          execution_time_ms: Date.now() - startTime,
          payload_summary: { date_ref: dateRef, from_cache: true },
        });

        return new Response(JSON.stringify({ data: cached, source: "cache" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Rate limit for manual refresh: 15 minutes
    if (force_refresh) {
      const { data: lastManual } = await supabase
        .from("shipping_cutoff_logs")
        .select("created_at")
        .eq("company_id", company_id)
        .eq("seller_id", seller_id)
        .eq("action", "manual_refresh")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastManual) {
        const diff = now.getTime() - new Date(lastManual.created_at).getTime();
        if (diff < 15 * 60 * 1000) {
          const remainingMin = Math.ceil((15 * 60 * 1000 - diff) / 60000);
          return new Response(
            JSON.stringify({
              error: "rate_limited",
              message: `Atualização recente. Aguarde ${remainingMin} minuto(s).`,
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Get ML access token
    const { data: mlAccount } = await supabase
      .from("ml_accounts")
      .select("access_token")
      .eq("ml_user_id", ml_user_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!mlAccount?.access_token) {
      await logAction(supabase, {
        company_id,
        seller_id,
        action: force_refresh ? "manual_refresh" : "auto_refresh",
        status: "error",
        execution_time_ms: Date.now() - startTime,
        error_message: "ML account not found or inactive",
      });

      return new Response(
        JSON.stringify({ error: "ML account not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch shipping options from ML API
    const token = mlAccount.access_token;
    let flexData: any = null;
    let colectaData: any = null;
    let sourcePayload: any = {};
    let errorMessages: string[] = [];

    // 1. Fetch Flex shipping modes
    try {
      const flexRes = await fetch(
        `https://api.mercadolibre.com/users/${ml_user_id}/shipping_preferences`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (flexRes.ok) {
        flexData = await flexRes.json();
        sourcePayload.flex = flexData;
      } else {
        const errText = await flexRes.text();
        errorMessages.push(`Flex API ${flexRes.status}: ${errText.substring(0, 200)}`);
      }
    } catch (e: any) {
      errorMessages.push(`Flex fetch error: ${e.message}`);
    }

    // 2. Fetch Places/Coleta info
    try {
      const colectaRes = await fetch(
        `https://api.mercadolibre.com/users/${ml_user_id}/shipping_options/pickup`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (colectaRes.ok) {
        colectaData = await colectaRes.json();
        sourcePayload.colecta = colectaData;
      } else {
        // Try alternative endpoint
        const altRes = await fetch(
          `https://api.mercadolibre.com/shipments/handling_time/${ml_user_id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (altRes.ok) {
          colectaData = await altRes.json();
          sourcePayload.colecta_alt = colectaData;
        } else {
          const errText = await altRes.text();
          errorMessages.push(`Colecta API ${altRes.status}: ${errText.substring(0, 200)}`);
        }
      }
    } catch (e: any) {
      errorMessages.push(`Colecta fetch error: ${e.message}`);
    }

    // Parse and normalize data
    const result = normalizeShippingCutoff(flexData, colectaData);

    // Calculate expires_at: min of (end of day in SP, now + 6h)
    const endOfDaySP = new Date(dateRef + "T23:59:59-03:00");
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const expiresAt = endOfDaySP < sixHoursLater ? endOfDaySP : sixHoursLater;

    const status = errorMessages.length > 0
      ? (result.flex_enabled || result.colecta_enabled ? "partial" : "error")
      : "ok";

    const record = {
      company_id,
      seller_id,
      provider: "meli",
      date_ref: dateRef,
      timezone: "America/Sao_Paulo",
      ...result,
      source_payload: sourcePayload,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      status,
      error_message: errorMessages.length > 0 ? errorMessages.join("; ") : null,
    };

    // Upsert cache
    const { data: upserted, error: upsertErr } = await supabase
      .from("shipping_cutoff_cache")
      .upsert(record, { onConflict: "company_id,seller_id,date_ref" })
      .select()
      .single();

    if (upsertErr) {
      console.error("Upsert error:", upsertErr);
    }

    // Log
    await logAction(supabase, {
      company_id,
      seller_id,
      action: force_refresh ? "manual_refresh" : "auto_refresh",
      status,
      execution_time_ms: Date.now() - startTime,
      payload_summary: {
        date_ref: dateRef,
        flex_enabled: result.flex_enabled,
        colecta_enabled: result.colecta_enabled,
        errors: errorMessages.length,
      },
      error_message: errorMessages.length > 0 ? errorMessages.join("; ") : null,
    });

    return new Response(
      JSON.stringify({ data: upserted || record, source: "api" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Shipping cutoff error:", error);

    await logAction(supabase, {
      company_id: null,
      seller_id: null,
      action: "api_error",
      status: "error",
      execution_time_ms: Date.now() - startTime,
      error_message: error.message,
    });

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function normalizeShippingCutoff(flexData: any, colectaData: any) {
  const result: Record<string, any> = {
    flex_enabled: false,
    flex_cutoff_type: null,
    flex_cutoff_time: null,
    flex_zone_summary_first: null,
    flex_zone_summary_last: null,
    flex_zone_details: null,
    colecta_enabled: false,
    colecta_cutoff_time: null,
    colecta_window_from: null,
    colecta_window_to: null,
    colecta_cutoff_calculated: false,
  };

  // Parse Flex
  if (flexData) {
    const modes = flexData?.shipping_modes || flexData?.modes || [];
    const flexMode = Array.isArray(modes)
      ? modes.find((m: any) => m?.mode === "me2" || m?.name?.toLowerCase()?.includes("flex"))
      : null;

    if (flexMode) {
      result.flex_enabled = true;

      // Check for zone-based cutoffs
      const zones = flexMode?.shipping_zones || flexMode?.zones || [];
      if (Array.isArray(zones) && zones.length > 0) {
        const cutoffs = zones
          .map((z: any) => ({
            zone: z.name || z.zone_name || z.id || "Zona",
            cutoff: z.cutoff_time || z.cutoff || z.handling_time?.cutoff || null,
          }))
          .filter((z: any) => z.cutoff);

        if (cutoffs.length > 1) {
          result.flex_cutoff_type = "by_zone";
          const sorted = cutoffs.sort((a: any, b: any) => (a.cutoff > b.cutoff ? 1 : -1));
          result.flex_zone_summary_first = sorted[0].cutoff;
          result.flex_zone_summary_last = sorted[sorted.length - 1].cutoff;
          result.flex_zone_details = sorted;
        } else if (cutoffs.length === 1) {
          result.flex_cutoff_type = "single";
          result.flex_cutoff_time = cutoffs[0].cutoff;
        }
      }

      // Fallback: direct cutoff_time on flex mode
      if (!result.flex_cutoff_type) {
        const directCutoff =
          flexMode.cutoff_time || flexMode.cutoff || flexMode.handling_time?.cutoff;
        if (directCutoff) {
          result.flex_cutoff_type = "single";
          result.flex_cutoff_time = directCutoff;
        } else {
          result.flex_cutoff_type = "unknown";
        }
      }
    }
  }

  // Parse Coleta/Places
  if (colectaData) {
    const pickup = colectaData?.pickup || colectaData;
    const cutoff = pickup?.cutoff_time || pickup?.cutoff;
    const windowFrom = pickup?.window_from || pickup?.from;
    const windowTo = pickup?.window_to || pickup?.to;

    if (cutoff || windowFrom) {
      result.colecta_enabled = true;

      if (cutoff) {
        result.colecta_cutoff_time = cutoff;
      } else if (windowFrom) {
        // Calculate cutoff = from - 1 hour
        result.colecta_window_from = windowFrom;
        result.colecta_window_to = windowTo || null;
        const [h, m] = windowFrom.split(":").map(Number);
        const calcHour = Math.max(0, h - 1);
        result.colecta_cutoff_time = `${String(calcHour).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
        result.colecta_cutoff_calculated = true;
      }
    }
  }

  return result;
}

async function logAction(
  supabase: any,
  data: {
    company_id: string | null;
    seller_id: string | null;
    action: string;
    status: string;
    execution_time_ms: number;
    payload_summary?: any;
    error_message?: string | null;
  }
) {
  try {
    await supabase.from("shipping_cutoff_logs").insert({
      company_id: data.company_id,
      seller_id: data.seller_id,
      action: data.action,
      status: data.status,
      execution_time_ms: data.execution_time_ms,
      payload_summary: data.payload_summary || null,
      error_message: data.error_message || null,
    });
  } catch (e) {
    console.error("Failed to log cutoff action:", e);
  }
}
