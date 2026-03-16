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

      // 3. Fetch Flex subscription data (has cutoff times)
      let flexData: any = null;
      let colectaData: any = null;
      const errorMessages: string[] = [];

      // Flex: use shipping_preferences directly (subscriptions/v1 returns 410 Gone)
      const flexPrefResult = await fetchWithRetry(
        `https://api.mercadolibre.com/users/${mlUserId}/shipping_preferences`,
        token, "flex_shipping_preferences", supabase, traceId, companyId, sellerId
      );
      if (flexPrefResult.ok) {
        flexData = { _from_preferences: true, ...flexPrefResult.data };
      } else {
        errorMessages.push(flexPrefResult.error!);
      }

      // 4. Fetch Coleta/Places capacity data (has cutoff/processing times)
      const colectaResult = await fetchWithRetry(
        `https://api.mercadolibre.com/users/${mlUserId}/capacity_middleend/xd_drop_off`,
        token, "colecta_capacity", supabase, traceId, companyId, sellerId
      );
      if (colectaResult.ok) {
        colectaData = colectaResult.data;
      } else {
        // Try cross_docking logistic type
        const altResult = await fetchWithRetry(
          `https://api.mercadolibre.com/users/${mlUserId}/capacity_middleend/cross_docking`,
          token, "colecta_cross_docking", supabase, traceId, companyId, sellerId
        );
        if (altResult.ok) {
          colectaData = altResult.data;
        } else {
          errorMessages.push(colectaResult.error!);
        }
      }

      // 5. Get real cutoffs from estimated_handling_limit in shipments cache,
      // SEPARATED BY LOGISTIC TYPE to avoid mixing agency/flex/coleta cutoffs.
      let agencyCutoff: string | null = null;
      let colectaCutoffFromShipments: string | null = null;

      try {
        const nowISO = new Date().toISOString();

        // Query active shipments with future handling limits, ordered by earliest first
        const { data: activeShipments } = await supabase
          .from("meli_shipments_cache")
          .select("shipment_id, estimated_handling_limit, logistic_type")
          .eq("seller_id", mlUserId)
          .in("shipment_status", ["ready_to_ship", "handling"])
          .gt("estimated_handling_limit", nowISO)
          .order("estimated_handling_limit", { ascending: true })
          .limit(50);

        if (activeShipments && activeShipments.length > 0) {
          // Separate shipments by logistic type category
          const agencyTypes = ["xd_drop_off", "drop_off"]; // Agency drop-off
          const flexTypes = ["self_service"]; // Flex
          const fullTypes = ["fulfillment", "cross_docking"]; // Full

          for (const shipment of activeShipments) {
            if (!shipment.estimated_handling_limit) continue;
            const d = new Date(shipment.estimated_handling_limit);
            const timeStr = d.toLocaleTimeString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
            // Skip midnight — ML sometimes sets date-only limits as 00:00
            if (timeStr === '00:00') continue;

            const lt = shipment.logistic_type || '';

            // Agency cutoff (earliest agency deadline)
            if (!agencyCutoff && agencyTypes.includes(lt)) {
              agencyCutoff = timeStr;
            }

            // Coleta cutoff (non-agency, non-flex, non-full)
            if (!colectaCutoffFromShipments && !agencyTypes.includes(lt) && !flexTypes.includes(lt) && !fullTypes.includes(lt) && lt) {
              colectaCutoffFromShipments = timeStr;
            }

            // If we found both, stop searching
            if (agencyCutoff && colectaCutoffFromShipments) break;
          }
        }

        await log(supabase, {
          trace_id: traceId, company_id: companyId, seller_id: sellerId,
          action: "cutoff_extraction", status: (agencyCutoff || colectaCutoffFromShipments) ? "success" : "empty",
          step: "cutoff_from_handling_limit", execution_time_ms: Date.now() - startTime,
          payload_summary: {
            agency_cutoff: agencyCutoff,
            colecta_cutoff: colectaCutoffFromShipments,
            shipments_checked: activeShipments?.length || 0,
            by_type: (activeShipments || []).reduce((acc: any, s: any) => {
              const t = s.logistic_type || 'unknown';
              acc[t] = (acc[t] || 0) + 1;
              return acc;
            }, {}),
            sample: (activeShipments || []).slice(0, 5).map(s => ({
              id: s.shipment_id,
              limit: s.estimated_handling_limit,
              type: s.logistic_type,
            })),
          },
        });
      } catch (e: any) {
        console.error("Cutoff extraction error:", e.message);
        await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "cutoff_extraction", status: "error", step: "cutoff_extraction", execution_time_ms: Date.now() - startTime, error_message: e.message });
      }

      // Use colecta cutoff from shipments if API doesn't provide one
      const finalColectaCutoff = colectaCutoffFromShipments;

      // 6. Normalize
      await log(supabase, { trace_id: traceId, company_id: companyId, seller_id: sellerId, action: "normalize", status: "success", step: "normalize_start", execution_time_ms: Date.now() - startTime });

      const normalized = normalizeShippingCutoff(flexData, colectaData, finalCutoff);

      // 6. Build safe source_payload (no tokens!)
      const safePayload: any = {};
      if (flexData) {
        safePayload.flex_source = flexData._from_preferences ? 'preferences' : 'subscriptions';
        safePayload.flex_keys = Object.keys(flexData).filter(k => k !== '_from_preferences');
        if (flexData.delivery_ranges?.week) safePayload.flex_week_ranges_count = flexData.delivery_ranges.week.length;
        if (flexData.availables?.cutoff) safePayload.flex_availables_cutoff = flexData.availables.cutoff;
      }
      if (colectaData) {
        safePayload.colecta_keys = Object.keys(colectaData);
        if (colectaData.processing_times) safePayload.colecta_days = Object.keys(colectaData.processing_times);
        // Capture capacities structure for debugging
        if (colectaData.capacities) {
          const caps = colectaData.capacities;
          safePayload.colecta_capacities_raw = JSON.stringify(caps).substring(0, 1000);
        }
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
function normalizeShippingCutoff(flexData: any, colectaData: any, shipmentCutoff: string | null = null) {
  const result: Record<string, any> = {
    flex_enabled: false, flex_cutoff_type: null, flex_cutoff_time: null,
    flex_zone_summary_first: null, flex_zone_summary_last: null, flex_zone_details: null,
    colecta_enabled: false, colecta_cutoff_time: null, colecta_window_from: null,
    colecta_window_to: null, colecta_cutoff_calculated: false,
  };

  // If we have a cutoff derived from actual shipment deadlines, use it as colecta/xd_drop_off cutoff
  if (shipmentCutoff) {
    result.colecta_enabled = true;
    result.colecta_cutoff_time = shipmentCutoff;
  }

  // Flex - from /shipping/flex/sites/MLB/users/{id}/subscriptions/v1
  if (flexData && !flexData._from_preferences) {
    // Flex subscription response has delivery_ranges with calculated_cutoff
    const deliveryRanges = flexData?.delivery_ranges || {};
    const weekRanges = deliveryRanges?.week || [];
    
    if (Array.isArray(weekRanges) && weekRanges.length > 0) {
      result.flex_enabled = true;
      
      // Extract cutoff times from week ranges
      const cutoffs = weekRanges
        .filter((r: any) => r?.calculated_cutoff != null)
        .map((r: any) => ({
          zone: r?.from && r?.to ? `${r.from}:00-${r.to}:00` : "Geral",
          cutoff: `${String(r.calculated_cutoff).padStart(2, "0")}:00`,
          cutoff_hour: r.calculated_cutoff,
        }));
      
      if (cutoffs.length > 1) {
        // Check if cutoffs differ
        const uniqueCutoffs = [...new Set(cutoffs.map((c: any) => c.cutoff_hour))];
        if (uniqueCutoffs.length > 1) {
          result.flex_cutoff_type = "by_zone";
          const sorted = cutoffs.sort((a: any, b: any) => a.cutoff_hour - b.cutoff_hour);
          result.flex_zone_summary_first = sorted[0].cutoff;
          result.flex_zone_summary_last = sorted[sorted.length - 1].cutoff;
          result.flex_zone_details = sorted.map((c: any) => ({ zone: c.zone, cutoff: c.cutoff }));
        } else {
          result.flex_cutoff_type = "single";
          result.flex_cutoff_time = cutoffs[0].cutoff;
        }
      } else if (cutoffs.length === 1) {
        result.flex_cutoff_type = "single";
        result.flex_cutoff_time = cutoffs[0].cutoff;
      }
    }
    
    // Try availables.cutoff as fallback
    if (!result.flex_cutoff_type) {
      const availables = flexData?.availables;
      if (availables?.cutoff && Array.isArray(availables.cutoff) && availables.cutoff.length > 0) {
        result.flex_enabled = true;
        const maxCutoff = Math.max(...availables.cutoff);
        result.flex_cutoff_type = "single";
        result.flex_cutoff_time = `${String(maxCutoff).padStart(2, "0")}:00`;
      }
    }
  } else if (flexData?._from_preferences) {
    // Fallback: from shipping_preferences - limited info
    const logistics = flexData?.logistics || [];
    if (Array.isArray(logistics)) {
      const me2 = logistics.find((l: any) => l?.mode === 'me2');
      if (me2) {
        result.flex_enabled = true;
        result.flex_cutoff_type = "unknown";
        // No cutoff info available from preferences endpoint
      }
    }
  }

  // Coleta/Places - shipmentCutoff (from actual shipment deadlines) is already set above.
  // The capacity_middleend API returns weekly capacity limits, NOT cutoff times.
  // Only use it as a last-resort fallback if we have no shipment-based cutoff.
  if (!result.colecta_enabled && colectaData) {
    // Try direct cutoff fields as fallback
    const pickup = colectaData?.pickup || colectaData;
    const cutoff = pickup?.cutoff_time || pickup?.cutoff;
    if (cutoff) {
      result.colecta_enabled = true;
      result.colecta_cutoff_time = typeof cutoff === 'number' ? `${String(cutoff).padStart(2, "0")}:00` : cutoff;
    }
  }

  return result;
}

function getTodayDayName(): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const spDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return days[spDate.getDay()];
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
