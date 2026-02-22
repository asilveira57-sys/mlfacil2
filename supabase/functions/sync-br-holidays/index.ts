import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GITHUB_BASE =
  "https://raw.githubusercontent.com/joaopbini/feriados-brasil/master/dados";

const BATCH_SIZE = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { ano = 2026 } = await req.json().catch(() => ({ ano: 2026 }));
    const results: Record<string, unknown> = { ano };

    // ──────────────────────────────────────
    // 1. Sync estados
    // ──────────────────────────────────────
    console.log("[sync-br-holidays] Fetching estados...");
    const estadosRes = await fetch(
      `${GITHUB_BASE}/localizacao/estados/estados.json`
    );
    if (!estadosRes.ok) throw new Error(`Failed to fetch estados: ${estadosRes.status}`);
    const estadosJson: Array<{
      codigo_uf: number;
      uf: string;
      nome: string;
      latitude: number;
      longitude: number;
      regiao: string;
    }> = await estadosRes.json();

    let estadosCount = 0;
    for (let i = 0; i < estadosJson.length; i += BATCH_SIZE) {
      const batch = estadosJson.slice(i, i + BATCH_SIZE).map((e) => ({
        uf: e.uf,
        codigo_uf: e.codigo_uf,
        nome: e.nome,
        regiao: e.regiao,
      }));
      const { error } = await supabase
        .from("br_estados")
        .upsert(batch, { onConflict: "uf" });
      if (error) throw error;
      estadosCount += batch.length;
    }
    results.estados = estadosCount;
    console.log(`[sync-br-holidays] ${estadosCount} estados synced`);

    // ──────────────────────────────────────
    // 2. Sync municipios
    // ──────────────────────────────────────
    console.log("[sync-br-holidays] Fetching municipios...");
    const munRes = await fetch(
      `${GITHUB_BASE}/localizacao/municipios/municipios.json`
    );
    if (!munRes.ok) throw new Error(`Failed to fetch municipios: ${munRes.status}`);
    const munJson: Array<{
      codigo_ibge: number;
      nome: string;
      capital: boolean;
      codigo_uf: number;
      uf: string;
      ddd: number;
      fuso_horario: string;
    }> = await munRes.json();

    let munCount = 0;
    for (let i = 0; i < munJson.length; i += BATCH_SIZE) {
      const batch = munJson.slice(i, i + BATCH_SIZE).map((m) => ({
        codigo_ibge: m.codigo_ibge,
        nome: m.nome,
        capital: m.capital ?? false,
        uf: m.uf,
        ddd: m.ddd ?? null,
        fuso_horario: m.fuso_horario ?? null,
      }));
      const { error } = await supabase
        .from("br_municipios")
        .upsert(batch, { onConflict: "codigo_ibge" });
      if (error) {
        console.error(`[sync-br-holidays] Municipios batch error:`, error);
        throw error;
      }
      munCount += batch.length;
    }
    results.municipios = munCount;
    console.log(`[sync-br-holidays] ${munCount} municipios synced`);

    // ──────────────────────────────────────
    // 3. Sync feriados (nacional + estadual + municipal)
    // ──────────────────────────────────────
    const feriadoTypes = ["nacional", "estadual", "municipal"];
    let totalFeriados = 0;

    for (const tipo of feriadoTypes) {
      const url = `${GITHUB_BASE}/feriados/${tipo}/json/${ano}.json`;
      console.log(`[sync-br-holidays] Fetching ${tipo} from ${url}...`);

      const ferRes = await fetch(url);
      if (!ferRes.ok) {
        console.warn(`[sync-br-holidays] ${tipo}/${ano} not found (${ferRes.status}), skipping`);
        results[`feriados_${tipo}`] = 0;
        continue;
      }

      const ferJson: Array<{
        data: string; // DD/MM/YYYY
        nome: string;
        tipo: string;
        descricao?: string;
        uf?: string;
        codigo_ibge?: number;
      }> = await ferRes.json();

      // Parse DD/MM/YYYY -> YYYY-MM-DD
      const parsed = ferJson.map((f) => {
        const [dd, mm, yyyy] = f.data.split("/");
        return {
          data: `${yyyy}-${mm}-${dd}`,
          nome: f.nome,
          tipo: f.tipo?.toUpperCase() ?? tipo.toUpperCase(),
          descricao: f.descricao ?? null,
          uf: f.uf ?? null,
          codigo_ibge: f.codigo_ibge ?? null,
          ano: parseInt(yyyy) || ano,
        };
      });

      let typeCount = 0;
      for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
        const batch = parsed.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from("br_feriados").upsert(batch, {
          onConflict: "idx_br_feriados_unique",
          ignoreDuplicates: true,
        });
        if (error) {
          console.error(`[sync-br-holidays] ${tipo} batch error:`, error);
          // Try inserting one by one for this batch to skip duplicates
          for (const row of batch) {
            await supabase
              .from("br_feriados")
              .insert(row)
              .then(({ error: e }) => {
                if (e && !e.message?.includes("duplicate")) {
                  console.error(`[sync-br-holidays] Single insert error:`, e);
                }
              });
          }
        }
        typeCount += batch.length;
      }
      results[`feriados_${tipo}`] = typeCount;
      totalFeriados += typeCount;
      console.log(`[sync-br-holidays] ${typeCount} feriados ${tipo} processed`);
    }

    results.feriados_total = totalFeriados;
    console.log(`[sync-br-holidays] Done! Total: ${totalFeriados} feriados`);

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[sync-br-holidays] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
