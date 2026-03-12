import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidationResult {
  isValid: boolean;
  violations: Array<{
    category: string;
    pattern: string;
    description: string;
    match: string;
  }>;
  suggestedFix?: string;
}

interface BlockedPattern {
  pattern: string;
  pattern_type: string;
  category: string;
  description: string;
}

// Category descriptions for user-friendly messages
const categoryLabels: Record<string, string> = {
  phone: "Telefone/WhatsApp detectado",
  email: "E-mail detectado",
  link: "Link externo detectado",
  social: "Rede social detectada",
  review_request: "Pedido de avaliação detectado",
  promo: "Termo promocional detectado",
  external: "Sugestão de compra externa detectada",
  pressure: "Linguagem de pressão detectada",
};

async function validateMessage(
  supabase: SupabaseClient,
  content: string
): Promise<ValidationResult> {
  // Fetch active patterns
  const { data: patterns, error } = await supabase
    .from("post_sale_blocked_patterns")
    .select("*")
    .eq("is_active", true);

  if (error) {
    console.error("Error fetching patterns:", error);
    throw new Error("Failed to fetch validation patterns");
  }

  const violations: ValidationResult["violations"] = [];

  for (const pattern of patterns as BlockedPattern[]) {
    try {
      let matches: string[] = [];

      if (pattern.pattern_type === "regex") {
        const regex = new RegExp(pattern.pattern, "gi");
        const found = content.match(regex);
        if (found) {
          matches = found;
        }
      } else if (pattern.pattern_type === "contains") {
        if (content.toLowerCase().includes(pattern.pattern.toLowerCase())) {
          matches = [pattern.pattern];
        }
      } else if (pattern.pattern_type === "exact") {
        if (content.toLowerCase() === pattern.pattern.toLowerCase()) {
          matches = [pattern.pattern];
        }
      }

      for (const match of matches) {
        violations.push({
          category: pattern.category,
          pattern: pattern.pattern,
          description: pattern.description || categoryLabels[pattern.category] || "Conteúdo bloqueado",
          match,
        });
      }
    } catch (e) {
      console.warn(`Invalid regex pattern: ${pattern.pattern}`, e);
    }
  }

  // Generate suggested fix if violations found
  let suggestedFix: string | undefined;
  if (violations.length > 0) {
    suggestedFix = generateSuggestedFix(content, violations);
  }

  return {
    isValid: violations.length === 0,
    violations,
    suggestedFix,
  };
}

function generateSuggestedFix(
  content: string,
  violations: ValidationResult["violations"]
): string {
  let fixed = content;

  // Remove each violation match
  for (const v of violations) {
    if (v.match) {
      // Replace with a placeholder suggestion based on category
      const replacement = getReplacementSuggestion(v.category);
      fixed = fixed.replace(new RegExp(escapeRegex(v.match), "gi"), replacement);
    }
  }

  // Clean up multiple spaces and empty lines
  fixed = fixed.replace(/\s{2,}/g, " ").trim();

  return fixed;
}

function getReplacementSuggestion(category: string): string {
  switch (category) {
    case "phone":
    case "email":
    case "social":
      return "[utilize o chat do Mercado Livre para contato]";
    case "link":
      return "[link removido]";
    case "review_request":
      return "";
    case "promo":
      return "";
    case "external":
      return "";
    case "pressure":
      return "";
    default:
      return "";
  }
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// AI suggestion for improving message text
async function suggestImprovement(content: string, messageType: string): Promise<string> {
  // Use Lovable AI for text improvement
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not configured, returning original content");
    return content;
  }

  const systemPrompt = `Você é um especialista em comunicação pós-venda para o Mercado Livre.
Seu objetivo é melhorar mensagens de suporte ao comprador, mantendo um tom profissional e acolhedor.

REGRAS CRÍTICAS que você DEVE seguir:
1. NUNCA inclua telefones, WhatsApp, e-mails ou links externos
2. NUNCA peça avaliação, qualificação ou nota
3. NUNCA mencione promoções, cupons ou descontos
4. NUNCA sugira compra fora da plataforma
5. NUNCA use linguagem de pressão ou urgência
6. Mantenha a mensagem clara, objetiva e breve
7. Foque em orientação e suporte genuíno

Tipo de mensagem: ${messageType}
- informativa: foco em informações de envio, prazo, logística
- preventiva: foco em instruções de uso, conferência do produto
- relacionamento: foco em agradecimento neutro e cordialidade

Retorne APENAS o texto melhorado, sem explicações.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Melhore esta mensagem:\n\n${content}` },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", await response.text());
      return content;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || content;
  } catch (e) {
    console.error("AI suggestion error:", e);
    return content;
  }
}

// Interpolate variables in template
function interpolateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Route actions
    switch (action) {
      case "validate": {
        const { content, variables } = await req.json();
        
        // Interpolate variables if provided
        const finalContent = variables 
          ? interpolateVariables(content, variables)
          : content;
        
        const result = await validateMessage(supabase, finalContent);
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "suggest": {
        const { content, messageType } = await req.json();
        const suggestion = await suggestImprovement(content, messageType || "informativa");
        
        // Validate the suggestion too
        const validation = await validateMessage(supabase, suggestion);
        
        return new Response(
          JSON.stringify({
            suggestion,
            validation,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "preview": {
        const { content, variables } = await req.json();
        const preview = interpolateVariables(content, variables || {});
        const charCount = preview.length;
        
        return new Response(
          JSON.stringify({
            preview,
            charCount,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("Error in post-sale-messages:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
