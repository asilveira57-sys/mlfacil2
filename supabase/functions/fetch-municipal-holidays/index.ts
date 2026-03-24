import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { codigo_ibge, ano } = await req.json();

    if (!codigo_ibge) {
      return new Response(
        JSON.stringify({ error: "codigo_ibge is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const year = ano || new Date().getFullYear();
    console.log(`[fetch-municipal-holidays] Fetching for IBGE ${codigo_ibge}, year ${year}`);

    // Fetch from feriadosapi.com (free, no auth required)
    const apiUrl = `https://feriadosapi.com/api/v1/feriados/cidade/${codigo_ibge}?ano=${year}`;
    console.log(`[fetch-municipal-holidays] URL: ${apiUrl}`);

    const res = await fetch(apiUrl);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[fetch-municipal-holidays] API error ${res.status}: ${errText}`);
      return new Response(
        JSON.stringify({ error: `API returned ${res.status}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const json = await res.json();
    const feriados: Array<{
      data: string;
      nome: string;
      tipo: string;
      descricao?: string;
      uf?: string;
      codigo_ibge?: number;
    }> = json.feriados || json || [];

    if (!Array.isArray(feriados) || feriados.length === 0) {
      console.log(`[fetch-municipal-holidays] No holidays found for IBGE ${codigo_ibge}`);
      return new Response(
        JSON.stringify({ success: true, inserted: 0, message: "No holidays found from API" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter only MUNICIPAL holidays (nationals and estaduais we already have from GitHub)
    const municipalOnly = feriados.filter(
      (f) => f.tipo?.toUpperCase() === "MUNICIPAL"
    );

    console.log(`[fetch-municipal-holidays] Found ${feriados.length} total, ${municipalOnly.length} municipal`);

    if (municipalOnly.length === 0) {
      return new Response(
        JSON.stringify({ success: true, inserted: 0, message: "No municipal holidays in API response" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse dates — API may return YYYY-MM-DD or DD/MM/YYYY
    const parsed = municipalOnly.map((f) => {
      let dataFormatted = f.data;
      if (f.data.includes("/")) {
        const [dd, mm, yyyy] = f.data.split("/");
        dataFormatted = `${yyyy}-${mm}-${dd}`;
      }
      return {
        data: dataFormatted,
        nome: f.nome,
        tipo: "MUNICIPAL",
        descricao: f.descricao ?? null,
        uf: f.uf ?? null,
        codigo_ibge: f.codigo_ibge ?? Number(codigo_ibge),
        ano: year,
      };
    });

    // Upsert: delete existing municipal holidays for this IBGE+year, then insert
    const { error: delError } = await supabase
      .from("br_feriados")
      .delete()
      .eq("tipo", "MUNICIPAL")
      .eq("codigo_ibge", Number(codigo_ibge))
      .eq("ano", year);

    if (delError) {
      console.error("[fetch-municipal-holidays] Delete error:", delError);
    }

    const { error: insError } = await supabase
      .from("br_feriados")
      .insert(parsed);

    if (insError) {
      console.error("[fetch-municipal-holidays] Insert error:", insError);
      return new Response(
        JSON.stringify({ error: insError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fetch-municipal-holidays] Inserted ${parsed.length} municipal holidays for IBGE ${codigo_ibge}`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: parsed.length,
        holidays: parsed.map((p) => ({ data: p.data, nome: p.nome })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fetch-municipal-holidays] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
