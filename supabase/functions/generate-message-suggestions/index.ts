import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TEMA_PROMPTS: Record<string, string> = {
  empreendedorismo:
    "Crie frases motivacionais para empreendedores de marketplace/e-commerce. Foco em disciplina, constância, gestão e crescimento.",
  raul_inspirado:
    "Crie frases inspiradas na filosofia de Raul Seixas: liberdade, atitude, ousadia, ser diferente. NÃO reproduza letras de músicas literalmente. Use o espírito e a filosofia.",
  biblica:
    "Crie frases inspiradas em sabedoria bíblica, sem proselitismo agressivo. Linguagem leve, universal, focada em paz, sabedoria e perseverança.",
  crista:
    "Crie frases de inspiração cristã com linguagem leve e acolhedora. Foco em fé, esperança e trabalho. Sem proselitismo.",
  atitude:
    "Crie frases sobre atitude, decisão, coragem e ação. Curtas, impactantes, sem clichês.",
  geral:
    "Crie frases motivacionais para vendedores de marketplace. Podem ser sobre vendas, logística, atendimento, crescimento profissional.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || supabaseKey);
      const { data: { user } } = await anonClient.auth.getUser(token);

      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check admin role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { tema = "geral", count = 5 } = await req.json();
    const temaPrompt = TEMA_PROMPTS[tema] || TEMA_PROMPTS.geral;

    // Check daily quota
    const { data: quotaSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "mensagem_do_dia_ai_daily_quota")
      .single();

    const maxPerDay = (quotaSetting?.value as any)?.max_suggestions_per_day || 10;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from("message_ai_suggestions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString());

    if ((todayCount || 0) + count > maxPerDay) {
      return new Response(
        JSON.stringify({ error: `Quota diária excedida. Máximo: ${maxPerDay}` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call OpenAI API
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você é um criador de frases motivacionais para a plataforma Marketplace Fácil.
Regras:
- Frases curtas (máximo 2 linhas)
- Sem referência a datas comemorativas
- Sem conteúdo ofensivo, político ou sensível
- Atemporais
- Em português do Brasil`,
          },
          {
            role: "user",
            content: `${temaPrompt}\n\nGere exatamente ${count} frases. Responda APENAS em formato JSON array, sem markdown, sem explicação. Cada item: {"texto": "frase aqui", "referencia": "referência opcional ou null"}`,
          },
        ],
        temperature: 0.9,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let suggestions: Array<{ texto: string; referencia?: string }> = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("JSON parse error:", e, "content:", content);
      throw new Error("Failed to parse AI response");
    }

    // Insert as pending
    const rows = suggestions.map((s) => ({
      tema,
      texto: s.texto,
      referencia: s.referencia || null,
      status: "pendente",
    }));

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from("message_ai_suggestions").insert(rows);
      if (insertErr) throw insertErr;
    }

    // Log
    await supabase.rpc("register_system_log", {
      p_level: "info",
      p_system_area: "mensagem_do_dia",
      p_action: "ai_suggestions_generated",
      p_success: true,
      p_message: `${rows.length} sugestões geradas para tema ${tema}`,
      p_meta_json: { tema, count: rows.length },
    });

    return new Response(JSON.stringify({ count: rows.length, suggestions: rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
