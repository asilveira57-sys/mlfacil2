import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MeliQuestion {
  id: number;
  seller_id: number;
  item_id: string;
  text: string;
  status: string;
  date_created: string;
  answer?: {
    text: string;
    date_created: string;
    status: string;
  };
  from: {
    id: number;
    nickname?: string;
  };
}

interface MeliItem {
  id: string;
  title: string;
  thumbnail: string;
  seller_custom_field?: string;
  variations?: Array<{
    id: number;
    seller_custom_field?: string;
    attribute_combinations?: Array<{ name: string; value_name: string }>;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { seller_id, status = "UNANSWERED", limit = 50 } = await req.json();

    if (!seller_id) {
      return new Response(
        JSON.stringify({ success: false, error: "seller_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ml-sync-questions] Starting sync for seller ${seller_id}, status=${status}`);

    // Get ML credentials
    const { data: mlAccount, error: accountError } = await supabase
      .from("ml_accounts")
      .select("access_token, refresh_token, ml_user_id")
      .eq("ml_user_id", seller_id)
      .eq("is_active", true)
      .maybeSingle();

    if (accountError || !mlAccount?.access_token) {
      console.error("No ML account found:", accountError);
      return new Response(
        JSON.stringify({ success: false, error: "ML account not found or token missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = mlAccount.access_token;

    // Refresh token if needed
    const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ seller_id }),
    });

    if (refreshResponse.ok) {
      const refreshData = await refreshResponse.json();
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
      }
    }

    // Fetch questions from ML API
    const questionsUrl = `https://api.mercadolibre.com/questions/search?seller_id=${seller_id}&status=${status}&limit=${limit}&sort_fields=date_created&sort_types=DESC`;
    
    console.log(`[ml-sync-questions] Fetching from: ${questionsUrl}`);

    const questionsResponse = await fetch(questionsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!questionsResponse.ok) {
      const errorText = await questionsResponse.text();
      console.error(`ML API error: ${questionsResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ success: false, error: `ML API error: ${questionsResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const questionsData = await questionsResponse.json();
    const questions: MeliQuestion[] = questionsData.questions || [];

    console.log(`[ml-sync-questions] Found ${questions.length} questions`);

    if (questions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: "No questions to sync" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique item IDs to fetch item details
    const itemIds = [...new Set(questions.map(q => q.item_id))];
    
    // Fetch item details in batches
    const itemsMap = new Map<string, MeliItem>();
    const BATCH_SIZE = 20;
    
    for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
      const batchIds = itemIds.slice(i, i + BATCH_SIZE);
      const idsParam = batchIds.join(",");
      
      try {
        // Try public endpoint first (no auth needed)
        const itemsResponse = await fetch(
          `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,thumbnail,seller_custom_field,variations`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (itemsResponse.ok) {
          const itemsData = await itemsResponse.json();
          for (const item of itemsData) {
            if (item.code === 200 && item.body) {
              itemsMap.set(item.body.id, item.body);
            }
          }
        }
      } catch (e) {
        console.error("Error fetching items:", e);
      }
    }

    // Calculate SLA deadline (15 hours from question date per ML rules)
    const calculateSlaDeadline = (questionDate: string): string => {
      const date = new Date(questionDate);
      date.setHours(date.getHours() + 15);
      return date.toISOString();
    };

    // Determine question status
    const mapStatus = (q: MeliQuestion): string => {
      if (q.answer) return "answered";
      if (q.status === "DELETED") return "deleted";
      return "pending";
    };

    // Analyze risk level
    const analyzeRisk = (text: string): { level: string; reasons: string[] } => {
      const reasons: string[] = [];
      let level = "low";

      const highRiskPatterns = [
        { pattern: /whats|telefone|liga|chama|contato/i, reason: "Pedido de contato externo" },
        { pattern: /reclama|denunci|advogado|procon|processo/i, reason: "Possível ameaça legal" },
      ];

      const mediumRiskPatterns = [
        { pattern: /troca|devolu[çc][aã]o|quebr|defeito|problema/i, reason: "Potencial problema com produto" },
        { pattern: /prazo|demora|atraso|quando.*chega/i, reason: "Dúvida sobre prazo" },
      ];

      for (const { pattern, reason } of highRiskPatterns) {
        if (pattern.test(text)) {
          level = "high";
          reasons.push(reason);
        }
      }

      if (level !== "high") {
        for (const { pattern, reason } of mediumRiskPatterns) {
          if (pattern.test(text)) {
            level = "medium";
            reasons.push(reason);
          }
        }
      }

      return { level, reasons };
    };

    // Prepare upsert data
    const questionsToUpsert = questions.map(q => {
      const item = itemsMap.get(q.item_id);
      const risk = analyzeRisk(q.text);
      const slaDeadline = calculateSlaDeadline(q.date_created);
      const now = new Date();
      const isSlaBreached = new Date(slaDeadline) < now && !q.answer;

      // Get SKU from item (seller_custom_field or first variation)
      let sku = item?.seller_custom_field || null;
      let variation = null;
      if (!sku && item?.variations?.length) {
        sku = item.variations[0]?.seller_custom_field || null;
        if (item.variations[0]?.attribute_combinations?.length) {
          variation = item.variations[0].attribute_combinations
            .map(a => `${a.name}: ${a.value_name}`)
            .join(", ");
        }
      }

      return {
        user_id: user.id,
        seller_id: String(seller_id),
        ml_question_id: String(q.id),
        ml_item_id: q.item_id,
        ml_buyer_id: String(q.from.id),
        question_text: q.text,
        item_title: item?.title || null,
        item_sku: sku,
        item_variation: variation,
        item_thumbnail: item?.thumbnail || null,
        status: mapStatus(q),
        risk_level: risk.level,
        risk_reasons: risk.reasons,
        question_date: q.date_created,
        answered_at: q.answer?.date_created || null,
        sla_deadline: slaDeadline,
        is_sla_breached: isSlaBreached,
        needs_attention: risk.level === "high" || isSlaBreached,
        updated_at: new Date().toISOString(),
      };
    });

    // Upsert questions
    const { error: upsertError } = await supabase
      .from("qa_questions")
      .upsert(questionsToUpsert as never[], {
        onConflict: "ml_question_id",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response(
        JSON.stringify({ success: false, error: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ml-sync-questions] Successfully synced ${questionsToUpsert.length} questions`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: questionsToUpsert.length,
        pending: questionsToUpsert.filter(q => q.status === "pending").length,
        answered: questionsToUpsert.filter(q => q.status === "answered").length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ml-sync-questions:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
