import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 7000]; // backoff with jitter

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let traceId = "";
  let companyId = "";
  let sellerId = "";

  try {
    const body = await req.json();
    companyId = body.company_id;
    sellerId = body.seller_id;
    const mlUserId = body.ml_user_id;
    const initiatedBy = body.initiated_by || "auto";
    const requestedByUserId = body.requested_by_user_id || null;
    traceId = body.trace_id || crypto.randomUUID().substring(0, 12);

    if (!companyId || !sellerId || !mlUserId) {
      return jsonResponse({ error: "Missing required params" }, 400);
    }

    const dateRef = getDateRefSP();
    const lockKey = `shipping_cutoff:${companyId}:${sellerId}:${dateRef}`;

    // 1. Acquire lock
    const lockAcquired = await acquireLock(supabase, lockKey, companyId, sellerId, dateRef, requestedByUserId, traceId);
    if (!lockAcquired) {
      await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "lock_denied", status: "partial", step: "lock_check", execution_time_ms: Date.now() - startTime });
      return jsonResponse({ error: "busy", message: "Refresh em andamento. Tente novamente em instantes." }, 409);
    }

    try {
      // 2. Get ML token
      const { data: mlAccount } = await supabase
        .from("ml_accounts")
        .select("access_token, refresh_token, token_expires_at, ml_user_id, id")
        .eq("ml_user_id", mlUserId)
        .eq("is_active", true)
        .maybeSingle();

      if (!mlAccount) {
        await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "error", status: "error", step: "token_load", execution_time_ms: Date.now() - startTime, error_message: "ML account not found" });
        return jsonResponse({ error: "ML account not found" }, 400);
      }

      let token = mlAccount.access_token;

      // 2b. Check token expiry and proactively refresh
      if (mlAccount.token_expires_at && new Date(mlAccount.token_expires_at) <= new Date()) {
        const refreshStart = Date.now();
        try {
          const refreshRes = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ seller_id: mlUserId }),
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            token = refreshData.access_token || token;
            await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "token_refresh", status: "success", step: "token_refresh", execution_time_ms: Date.now() - refreshStart });
          } else {
            const errText = await refreshRes.text();
            await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "token_refresh", status: "error", step: "token_refresh", execution_time_ms: Date.now() - refreshStart, http_status: refreshRes.status, error_message: errText.substring(0, 300) });
          }
        } catch (e: any) {
          await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "token_refresh", status: "error", step: "token_refresh", execution_time_ms: Date.now() - refreshStart, error_message: e.message });
        }
      }

      // 3. Fetch Flex data from ML API
      let flexData: any = null;
      let colectaData: any = null;
      const errorMessages: string[] = [];

      const flexResult = await fetchWithRetry(
        `https://api.mercadolibre.com/users/${mlUserId}/shipping_preferences`,
        token, "flex_shipping_preferences", supabase, traceId, companyId, sellerId
      );
      if (flexResult.ok) {
        flexData = flexResult.data;
      } else {
        errorMessages.push(flexResult.error!);
      }

      // 4. Fetch Coleta/Places data
      const colectaResult = await fetchWithRetry(
        `https://api.mercadolibre.com/users/${mlUserId}/shipping_options/pickup`,
        token, "colecta_pickup", supabase, traceId, companyId, sellerId
      );
      if (colectaResult.ok) {
        colectaData = colectaResult.data;
      } else {
        // Try alternative endpoint
        const altResult = await fetchWithRetry(
          `https://api.mercadolibre.com/shipments/handling_time/${mlUserId}`,
          token, "colecta_handling_time", supabase, traceId, companyId, sellerId
        );
        if (altResult.ok) {
          colectaData = altResult.data;
        } else {
          errorMessages.push(colectaResult.error!);
        }
      }

      // 5. Normalize
      await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "normalize", status: "success", step: "normalize_start", execution_time_ms: Date.now() - startTime });

      const normalized = normalizeShippingCutoff(flexData, colectaData);

      // 6. Build safe source_payload (no tokens!) — capture full structure for debugging
      const safePayload: any = {};
      if (flexData) {
        safePayload.flex_keys = Object.keys(flexData);
        const modesList = flexData?.shipping_modes || flexData?.modes || [];
        safePayload.flex_modes_count = Array.isArray(modesList) ? modesList.length : 0;
        // Capture first 3 modes raw (truncated) for debugging
        if (Array.isArray(modesList)) {
          safePayload.flex_modes_raw = modesList.slice(0, 3).map((m: any) => {
            if (typeof m === 'string') return m;
            if (typeof m === 'object' && m !== null) {
              // Capture top-level fields (no nested data)
              const summary: any = {};
              for (const k of Object.keys(m).slice(0, 15)) {
                const v = m[k];
                summary[k] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : typeof v;
              }
              return summary;
            }
            return String(m);
          });
        }
        if (flexData?.me2_enablers) safePayload.me2_enablers = typeof flexData.me2_enablers === 'object' ? JSON.stringify(flexData.me2_enablers).substring(0, 500) : String(flexData.me2_enablers);
        if (flexData?.option) safePayload.option_raw = typeof flexData.option === 'object' ? JSON.stringify(flexData.option).substring(0, 500) : String(flexData.option);
        if (flexData?.services) safePayload.services_count = Array.isArray(flexData.services) ? flexData.services.length : 'not_array';
        if (flexData?.logistics) safePayload.logistics_raw = JSON.stringify(flexData.logistics).substring(0, 500);
      }
      if (colectaData) {
        safePayload.colecta_keys = Object.keys(colectaData);
      }

      // 7. Calculate expires_at
      const now = new Date();
      const endOfDaySP = new Date(dateRef + "T23:59:59-03:00");
      const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      const expiresAt = endOfDaySP < sixHoursLater ? endOfDaySP : sixHoursLater;

      const status = errorMessages.length > 0
        ? (normalized.flex_enabled || normalized.colecta_enabled ? "partial" : "error")
        : "ok";

      // 8. Save cache
      const record = {
        company_id: companyId,
        seller_id: sellerId,
        provider: "meli",
        date_ref: dateRef,
        timezone: "America/Sao_Paulo",
        ...normalized,
        source_payload: safePayload,
        fetched_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        status,
        error_message: errorMessages.length > 0 ? errorMessages.join("; ") : null,
      };

      const { data: upserted, error: upsertErr } = await supabase
        .from("shipping_cutoff_cache")
        .upsert(record, { onConflict: "company_id,seller_id,date_ref" })
        .select()
        .single();

      await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "save_cache", status: upsertErr ? "error" : "success", step: "save_cache", execution_time_ms: Date.now() - startTime, error_message: upsertErr?.message });

      // 9. Update rate limit if manual
      if (initiatedBy === "manual") {
        await supabase.from("shipping_cutoff_manual_rate_limit").upsert({
          company_id: companyId,
          seller_id: sellerId,
          last_manual_refresh_at: now.toISOString(),
          cooldown_minutes: 15,
        }, { onConflict: "company_id,seller_id" });
      }

      // 10. Final log
      await log(supabase, {
        trace_id: traceId, company_id: companyId, seller_id: sellerId,
        action: initiatedBy === "manual" ? "manual_refresh" : "auto_refresh",
        status, step: "complete",
        execution_time_ms: Date.now() - startTime,
        payload_summary: { flex_enabled: normalized.flex_enabled, colecta_enabled: normalized.colecta_enabled, errors: errorMessages.length },
      });

      return jsonResponse({ data: upserted || record, source: "api" });
    } finally {
      // Always release lock
      await releaseLock(supabase, lockKey);
    }
  } catch (error: any) {
    console.error("[meli-shipping-cutoff-refresh] Error:", error);
    await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "error", status: "error", step: "unhandled", execution_time_ms: Date.now() - startTime, error_message: error.message });
    return jsonResponse({ error: error.message }, 500);
  }
});

// ==================== LOCK ====================
async function acquireLock(supabase: any, lockKey: string, companyId: string, sellerId: string, dateRef: string, userId: string | null, traceId: string): Promise<boolean> {
  const now = new Date();

  // Clean expired locks first
  await supabase.from("shipping_cutoff_locks").delete().lt("expires_at", now.toISOString());

  const { error } = await supabase.from("shipping_cutoff_locks").insert({
    company_id: companyId,
    seller_id: sellerId,
    date_ref: dateRef,
    lock_key: lockKey,
    locked_by_user_id: userId,
    locked_at: now.toISOString(),
    expires_at: new Date(now.getTime() + LOCK_TTL_MS).toISOString(),
    status: "locked",
  });

  if (error) {
    // Unique conflict = lock exists and isn't expired
    if (error.code === "23505") return false;
    console.error("Lock error:", error);
    return false;
  }

  await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "lock_wait", status: "success", step: "lock_acquired", execution_time_ms: 0 });
  return true;
}

async function releaseLock(supabase: any, lockKey: string) {
  await supabase.from("shipping_cutoff_locks").delete().eq("lock_key", lockKey);
}

// ==================== FETCH WITH RETRY ====================
async function fetchWithRetry(
  url: string, token: string, endpointName: string,
  supabase: any, traceId: string, companyId: string, sellerId: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const callStart = Date.now();
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const httpStatus = res.status;

      if (res.ok) {
        const data = await res.json();
        await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "api_call", status: "success", step: endpointName, execution_time_ms: Date.now() - callStart, http_status: httpStatus, endpoint_name: endpointName });
        return { ok: true, data };
      }

      const errText = await res.text();

      // Non-retryable errors (4xx except 429)
      if (httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429) {
        await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "api_call", status: "error", step: endpointName, execution_time_ms: Date.now() - callStart, http_status: httpStatus, endpoint_name: endpointName, error_message: errText.substring(0, 300) });
        return { ok: false, error: `${endpointName} ${httpStatus}: ${errText.substring(0, 200)}` };
      }

      // Retryable: 429, 5xx
      if (attempt < MAX_RETRIES) {
        const jitter = Math.random() * 500;
        const delay = RETRY_DELAYS[attempt] + jitter;
        await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "api_retry", status: "partial", step: endpointName, execution_time_ms: Date.now() - callStart, http_status: httpStatus, endpoint_name: endpointName, payload_summary: { attempt: attempt + 1, delay_ms: Math.round(delay) } });
        await sleep(delay);
        continue;
      }

      await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "api_call", status: "error", step: endpointName, execution_time_ms: Date.now() - callStart, http_status: httpStatus, endpoint_name: endpointName, error_message: `Max retries exceeded. Last: ${errText.substring(0, 200)}` });
      return { ok: false, error: `${endpointName} failed after ${MAX_RETRIES + 1} attempts` };
    } catch (e: any) {
      if (attempt < MAX_RETRIES) {
        const jitter = Math.random() * 500;
        await sleep(RETRY_DELAYS[attempt] + jitter);
        continue;
      }
      await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "api_call", status: "error", step: endpointName, execution_time_ms: Date.now() - callStart, endpoint_name: endpointName, error_message: e.message });
      return { ok: false, error: `${endpointName}: ${e.message}` };
    }
  }
  return { ok: false, error: `${endpointName}: unexpected` };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ==================== NORMALIZE ====================
function normalizeShippingCutoff(flexData: any, colectaData: any) {
  const result: Record<string, any> = {
    flex_enabled: false, flex_cutoff_type: null, flex_cutoff_time: null,
    flex_zone_summary_first: null, flex_zone_summary_last: null, flex_zone_details: null,
    colecta_enabled: false, colecta_cutoff_time: null, colecta_window_from: null,
    colecta_window_to: null, colecta_cutoff_calculated: false,
  };

  // Flex
  if (flexData) {
    const modes = flexData?.shipping_modes || flexData?.modes || [];
    
    // Try to find flex mode with multiple patterns
    const flexMode = Array.isArray(modes)
      ? modes.find((m: any) => {
          const modeName = (m?.mode || '').toLowerCase();
          const modeLabel = (m?.name || '').toLowerCase();
          return modeName === 'me2' || modeName === 'me1' || modeName === 'custom'
            || modeLabel.includes('flex') || modeLabel.includes('mercado envios')
            || modeLabel.includes('full');
        })
      : null;

    // Also check top-level cutoff from me2_enablers or option
    const topLevelCutoff = flexData?.me2_enablers?.cutoff_time
      || flexData?.option?.cutoff_time
      || flexData?.cutoff_time
      || flexData?.handling_time?.cutoff;

    if (flexMode) {
      result.flex_enabled = true;
      const zones = flexMode?.shipping_zones || flexMode?.zones || [];
      if (Array.isArray(zones) && zones.length > 0) {
        const cutoffs = zones
          .map((z: any) => ({ zone: z.name || z.zone_name || z.id || "Zona", cutoff: z.cutoff_time || z.cutoff || z.handling_time?.cutoff || null }))
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
      if (!result.flex_cutoff_type) {
        const directCutoff = flexMode.cutoff_time || flexMode.cutoff || flexMode.handling_time?.cutoff;
        if (directCutoff) { result.flex_cutoff_type = "single"; result.flex_cutoff_time = directCutoff; }
        else if (topLevelCutoff) { result.flex_cutoff_type = "single"; result.flex_cutoff_time = topLevelCutoff; }
        else { result.flex_cutoff_type = "unknown"; }
      }
    } else if (topLevelCutoff) {
      // No matching mode but top-level cutoff exists
      result.flex_enabled = true;
      result.flex_cutoff_type = "single";
      result.flex_cutoff_time = topLevelCutoff;
    } else if (Array.isArray(modes) && modes.length > 0) {
      // Try to extract cutoff from ANY mode that has one
      for (const m of modes) {
        const cutoff = m?.cutoff_time || m?.cutoff || m?.handling_time?.cutoff;
        if (cutoff) {
          result.flex_enabled = true;
          result.flex_cutoff_type = "single";
          result.flex_cutoff_time = cutoff;
          break;
        }
      }
    }
  }

  // Coleta/Places
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
        result.colecta_window_from = windowFrom;
        result.colecta_window_to = windowTo || null;
        const [h, m] = windowFrom.split(":").map(Number);
        result.colecta_cutoff_time = `${String(Math.max(0, h - 1)).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
        result.colecta_cutoff_calculated = true;
      }
    }
  }

  return result;
}

// ==================== HELPERS ====================
function getDateRefSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function log(supabase: any, d: any) {
  try {
    await supabase.from("shipping_cutoff_logs").insert({
      trace_id: d.trace_id, company_id: d.company_id, seller_id: d.seller_id,
      action: d.action, status: d.status, step: d.step || "main",
      execution_time_ms: d.execution_time_ms, http_status: d.http_status || null,
      endpoint_name: d.endpoint_name || null,
      payload_summary: d.payload_summary || null, error_message: d.error_message || null,
    });
  } catch (e) { console.error("Log failed:", e); }
}
