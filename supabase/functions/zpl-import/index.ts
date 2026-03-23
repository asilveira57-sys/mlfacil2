import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Classification ──────────────────────────────────────────────────
const VOLUME_PATTERNS = [
  /\^FD.*?(volume|vol\.|VOLUME)/i,
  /\^FD.*?(envio|remessa|shipping|despacho)/i,
  /\^FD.*?(destinat|remetn|CEP|cep)/i,
  /\^BY/i, // barcode – very common in shipping labels
];

const PRODUCT_PATTERNS = [
  /\^FD.*?(SKU|sku|cod|código|barras|EAN|GTIN)/i,
  /\^FD.*?(preço|price|R\$|\$)/i,
  /\^FD.*?(lote|validade|fab)/i,
];

interface ClassifyResult {
  type: string;
  confidence: "high" | "medium" | "low";
}

function classifyZpl(zpl: string): ClassifyResult {
  const volumeScore = VOLUME_PATTERNS.filter((p) => p.test(zpl)).length;
  const productScore = PRODUCT_PATTERNS.filter((p) => p.test(zpl)).length;

  if (volumeScore >= 2) return { type: "full_volume_label", confidence: "high" };
  if (productScore >= 2) return { type: "full_product_label", confidence: "high" };
  if (volumeScore === 1) return { type: "full_volume_label", confidence: "medium" };
  if (productScore === 1) return { type: "full_product_label", confidence: "medium" };
  return { type: "unknown_zpl", confidence: "low" };
}

// ── Hash ─────────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── System presets ───────────────────────────────────────────────────
const SYSTEM_PRESETS: Record<string, { width: number; height: number; columns: number; dpi: number }> = {
  full_volume_label: { width: 100, height: 150, columns: 1, dpi: 203 },
  full_product_label: { width: 40, height: 25, columns: 2, dpi: 203 },
  unknown_zpl: { width: 100, height: 150, columns: 1, dpi: 203 },
};

// ── Label counting ──────────────────────────────────────────────────
function countLabels(zpl: string): number {
  const matches = zpl.match(/\^XA/gi);
  return matches ? matches.length : 1;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { zpl, source = "manual", file_name } = body;

    if (!zpl || typeof zpl !== "string" || !zpl.trim()) {
      return new Response(JSON.stringify({ error: "ZPL content is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zplContent = zpl.trim();

    // 1. Hash & dedup
    const hash = await sha256(zplContent);

    const { data: existing } = await supabase
      .from("zpl_imports")
      .select("id")
      .eq("user_id", user.id)
      .eq("zpl_hash", hash)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log("[ZPL_IMPORT] duplicate_skipped", { hash });
      return new Response(
        JSON.stringify({
          status: "duplicate",
          import_id: existing.id,
          message: "Este ZPL já foi importado anteriormente.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Classify
    const classification = classifyZpl(zplContent);
    console.log("[ZPL_IMPORT] type_detected", classification);

    // 3. Load user preferences
    const { data: userPref } = await supabase
      .from("user_label_preferences")
      .select("*")
      .eq("user_id", user.id)
      .eq("label_type", classification.type)
      .maybeSingle();

    const { data: globalPref } = await supabase
      .from("user_label_preferences")
      .select("*")
      .eq("user_id", user.id)
      .is("label_type", null)
      .maybeSingle();

    console.log("[ZPL_IMPORT] preferences_loaded", {
      specific: !!userPref,
      global: !!globalPref,
    });

    // 4. Resolve preset (priority: specific > global > system)
    const systemPreset = SYSTEM_PRESETS[classification.type] || SYSTEM_PRESETS.unknown_zpl;
    let appliedWidth: number;
    let appliedHeight: number;
    let presetSource: string;

    if (userPref) {
      appliedWidth = userPref.default_width_mm;
      appliedHeight = userPref.default_height_mm;
      presetSource = "user_specific";
    } else if (globalPref) {
      appliedWidth = globalPref.default_width_mm;
      appliedHeight = globalPref.default_height_mm;
      presetSource = "user_global";
    } else {
      appliedWidth = systemPreset.width;
      appliedHeight = systemPreset.height;
      presetSource = "system_default";
    }

    console.log("[ZPL_IMPORT] preset_applied", { appliedWidth, appliedHeight, presetSource });

    // 5. Count labels
    const totalLabels = countLabels(zplContent);

    // 6. Get company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    // 7. Save import
    const { data: importRecord, error: insertErr } = await supabase
      .from("zpl_imports")
      .insert({
        user_id: user.id,
        company_id: profile?.company_id || null,
        zpl_content: zplContent,
        zpl_hash: hash,
        detected_type: classification.type,
        source,
        file_name: file_name || null,
        preset_applied_width: appliedWidth,
        preset_applied_height: appliedHeight,
        preset_source: presetSource,
        confidence_level: classification.confidence,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[ZPL_IMPORT] import_error", insertErr);
      throw insertErr;
    }

    console.log("[ZPL_IMPORT] import_success", { id: importRecord.id });

    // 8. Return result (PDF generation happens client-side via Labelary)
    return new Response(
      JSON.stringify({
        status: "success",
        import_id: importRecord.id,
        type: classification.type,
        confidence: classification.confidence,
        applied_width: appliedWidth,
        applied_height: appliedHeight,
        preset_source: presetSource,
        total_labels: totalLabels,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[ZPL_IMPORT] import_error", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
