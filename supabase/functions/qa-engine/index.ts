import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, content, questionText, itemContext } = await req.json();

    // =============================================
    // VALIDATE ACTION
    // =============================================
    if (action === "validate") {
      // Fetch blocked patterns
      const { data: patterns } = await supabase
        .from("communication_blocked_patterns")
        .select("*")
        .eq("is_active", true)
        .contains("channels", ["qa"]);

      const errors: string[] = [];
      const suggestions: string[] = [];

      // Built-in critical patterns
      const criticalPatterns = [
        { pattern: /whats\s*app/i, reason: "WhatsApp detectado" },
        { pattern: /\b\d{2}[\s.-]?\d{4,5}[\s.-]?\d{4}\b/, reason: "Número de telefone detectado" },
        { pattern: /@\w+\.\w+/, reason: "E-mail detectado" },
        { pattern: /instagram|facebook|twitter|tiktok|@\w{2,}/i, reason: "Rede social detectada" },
        { pattern: /https?:\/\/(?!www\.mercadolivre|mercadolivre)/i, reason: "Link externo detectado" },
        { pattern: /bit\.ly|goo\.gl|tinyurl|t\.co/i, reason: "Link encurtado detectado" },
        { pattern: /avalia[çc][aã]o|qualifica[çc][aã]o|5\s*estrelas?|estrela|nota\s*\d/i, reason: "Pedido de avaliação detectado" },
        { pattern: /cupom|desconto|promo[çc][aã]o|oferta\s+especial/i, reason: "Promoção detectada" },
        { pattern: /pix|transfer[eê]ncia|dep[oó]sito|fora\s+(da\s+)?plataforma/i, reason: "Tentativa de pagamento externo" },
        { pattern: /urgente|[uú]ltim[ao]s?\s+(unidade|chance)|corra|aproveite\s+j[aá]/i, reason: "Linguagem de pressão detectada" },
      ];

      const contentLower = content.toLowerCase();

      // Check critical patterns
      for (const { pattern, reason } of criticalPatterns) {
        if (pattern.test(content)) {
          errors.push(reason);
        }
      }

      // Check database patterns
      if (patterns) {
        for (const p of patterns) {
          try {
            if (p.pattern_type === "regex") {
              const regex = new RegExp(p.pattern, "i");
              if (regex.test(content)) {
                errors.push(p.block_reason || "Conteúdo não permitido");
              }
            } else if (p.pattern_type === "contains") {
              if (contentLower.includes(p.pattern.toLowerCase())) {
                errors.push(p.block_reason || "Conteúdo não permitido");
              }
            }
          } catch (e) {
            console.error("Pattern error:", e);
          }
        }
      }

      // Character limit check
      if (content.length > 2000) {
        errors.push("Mensagem muito longa (máximo 2000 caracteres)");
      }

      // Generate suggestions if there are errors
      if (errors.length > 0) {
        suggestions.push("Remova informações de contato pessoal");
        suggestions.push("Mantenha a comunicação dentro da plataforma");
        suggestions.push("Foque em responder a dúvida objetivamente");
      }

      return new Response(
        JSON.stringify({
          isValid: errors.length === 0,
          errors: [...new Set(errors)], // Remove duplicates
          suggestions,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // AI SUGGEST ACTION
    // =============================================
    if (action === "suggest") {
      const systemPrompt = `Você é um especialista em atendimento ao cliente do Mercado Livre.
Seu objetivo é criar respostas claras, objetivas e úteis para perguntas de compradores.

REGRAS CRÍTICAS que você DEVE seguir:
1. NUNCA inclua telefones, WhatsApp, e-mails ou links externos
2. NUNCA peça avaliação, qualificação ou nota
3. NUNCA mencione promoções, cupons ou descontos não relacionados
4. NUNCA sugira compra ou pagamento fora da plataforma
5. NUNCA use linguagem de pressão ou urgência
6. SEMPRE responda diretamente à pergunta do comprador
7. SEMPRE seja educado e profissional
8. SEMPRE mencione que mais informações estão na descrição do anúncio quando relevante
9. Mantenha respostas entre 100-300 caracteres idealmente
10. Use português brasileiro correto

Contexto do produto (se disponível):
${itemContext?.title ? `Título: ${itemContext.title}` : ''}
${itemContext?.sku ? `SKU: ${itemContext.sku}` : ''}
${itemContext?.variation ? `Variação: ${itemContext.variation}` : ''}`;

      const userPrompt = `Crie uma resposta profissional para esta pergunta de um comprador:

"${questionText}"

Responda de forma direta, útil e seguindo todas as regras de segurança.`;

      // Use Lovable AI
      const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!aiResponse.ok) {
        // Fallback: Try with Google Gemini via Lovable AI
        const geminiResponse = await fetch(
          `${supabaseUrl}/functions/v1/ads-ai-consultant`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              action: "custom",
              prompt: userPrompt,
              systemPrompt,
            }),
          }
        );

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          return new Response(
            JSON.stringify({ suggestion: geminiData.response || "" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // If all else fails, return a template
        return new Response(
          JSON.stringify({
            suggestion: "Olá! Obrigado pelo interesse. Todas as informações sobre o produto estão detalhadas na descrição do anúncio. Se tiver dúvidas específicas, estou à disposição para ajudar.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const aiData = await aiResponse.json();
      const suggestion = aiData.content?.[0]?.text || "";

      return new Response(
        JSON.stringify({ suggestion }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================
    // ANALYZE RISK ACTION
    // =============================================
    if (action === "analyzeRisk") {
      const riskPatterns = [
        { pattern: /whats|telefone|liga|chama|contato/i, risk: "high", reason: "Pedido de contato externo" },
        { pattern: /troca|devolu[çc][aã]o|quebr|defeito/i, risk: "medium", reason: "Potencial problema com produto" },
        { pattern: /reclama|denunci|advogado|procon|processo/i, risk: "high", reason: "Ameaça legal" },
        { pattern: /concorr|outra\s+loja|mais\s+barato/i, risk: "low", reason: "Comparação de preços" },
      ];

      let riskLevel = "low";
      const riskReasons: string[] = [];

      for (const { pattern, risk, reason } of riskPatterns) {
        if (pattern.test(content)) {
          riskReasons.push(reason);
          if (risk === "high") riskLevel = "high";
          else if (risk === "medium" && riskLevel !== "high") riskLevel = "medium";
        }
      }

      return new Response(
        JSON.stringify({ riskLevel, riskReasons }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Action not supported" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
