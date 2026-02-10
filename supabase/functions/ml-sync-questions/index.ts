import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    // ML API Access Gate - check trial/subscription
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabase, user.id);
    if (!gate.allowed) {
      console.log(`[ml-sync-questions] Access denied: ${gate.reason}`);
      return gate.response!;
    }

    const { seller_id, account_id, limit = 100 } = await req.json();

    if (!seller_id) {
      return new Response(
        JSON.stringify({ success: false, error: "seller_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ml-sync-questions] Starting sync for seller ${seller_id}, account ${account_id}`);

    // Get ML credentials - prioritize account_id (UUID), fallback to seller_id
    let mlAccount = null;
    
    // Priority 1: Get by account_id (UUID) with ownership validation
    if (account_id) {
      const { data: accountById, error: accError } = await supabase
        .from("ml_accounts")
        .select("access_token, refresh_token, ml_user_id")
        .eq("id", account_id)
        .eq("user_id", user.id)
        .in("connection_status", ["connected", "attention"])
        .maybeSingle();
      
      if (accError) {
        console.error("Error fetching ML account by id:", accError);
      }
      mlAccount = accountById;
      console.log(`[ml-sync-questions] Account lookup by UUID: ${account_id} -> found: ${!!mlAccount}`);
    }
    
    // Priority 2: Get by seller_id with ownership validation
    if (!mlAccount && seller_id) {
      const { data: specificAccount, error: specificError } = await supabase
        .from("ml_accounts")
        .select("access_token, refresh_token, ml_user_id")
        .eq("ml_user_id", seller_id)
        .eq("user_id", user.id)
        .in("connection_status", ["connected", "attention"])
        .maybeSingle();
      
      if (specificError) {
        console.error("Error fetching ML account by seller_id:", specificError);
      }
      mlAccount = specificAccount;
      console.log(`[ml-sync-questions] Account lookup by seller_id: ${seller_id} -> found: ${!!mlAccount}`);
    }

    if (!mlAccount?.access_token) {
      console.error("No ML account found or token missing");
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
      body: JSON.stringify({ accountId: account_id }),
    });

    if (refreshResponse.ok) {
      const refreshData = await refreshResponse.json();
      if (refreshData.success && refreshData.accessToken) {
        accessToken = refreshData.accessToken;
        console.log(`[ml-sync-questions] Token refreshed successfully`);
      } else {
        console.warn(`[ml-sync-questions] Token refresh returned:`, JSON.stringify(refreshData));
      }
    } else {
      console.error(`[ml-sync-questions] Token refresh failed with status ${refreshResponse.status}`);
    }

    // Fetch UNANSWERED questions first (priority) then recent answered
    const allQuestions: MeliQuestion[] = [];
    
    // 1. Fetch unanswered questions (most important)
    const unansweredUrl = `https://api.mercadolibre.com/questions/search?seller_id=${seller_id}&status=UNANSWERED&limit=50&sort_fields=date_created&sort_types=DESC`;
    console.log(`[ml-sync-questions] Fetching unanswered: ${unansweredUrl}`);
    
    const unansweredResponse = await fetch(unansweredUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (unansweredResponse.ok) {
      const unansweredData = await unansweredResponse.json();
      const unanswered = unansweredData.questions || [];
      console.log(`[ml-sync-questions] Found ${unanswered.length} unanswered questions`);
      allQuestions.push(...unanswered);
    } else {
      console.error(`ML API error for unanswered: ${unansweredResponse.status}`);
    }
    
    // 2. Also fetch recent answered (for context/history)
    const answeredUrl = `https://api.mercadolibre.com/questions/search?seller_id=${seller_id}&status=ANSWERED&limit=50&sort_fields=date_created&sort_types=DESC`;
    console.log(`[ml-sync-questions] Fetching answered: ${answeredUrl}`);
    
    const answeredResponse = await fetch(answeredUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (answeredResponse.ok) {
      const answeredData = await answeredResponse.json();
      const answered = answeredData.questions || [];
      console.log(`[ml-sync-questions] Found ${answered.length} answered questions`);
      allQuestions.push(...answered);
    }
    
    const questions = allQuestions;
    console.log(`[ml-sync-questions] Total questions to sync: ${questions.length}`);

    if (questions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, pending: 0, answered: 0, message: "No questions to sync" }),
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

    // Now sync responses for answered questions from ML
    // First, get the question IDs we just upserted
    const { data: syncedQuestions } = await supabase
      .from("qa_questions")
      .select("id, ml_question_id")
      .in("ml_question_id", questions.map(q => String(q.id)));

    const questionIdMap = new Map<string, string>();
    syncedQuestions?.forEach(q => {
      questionIdMap.set(q.ml_question_id, q.id);
    });

    // Create responses for answered questions from ML
    const responsesToUpsert = questions
      .filter(q => q.answer && q.answer.text)
      .map(q => {
        const questionUuid = questionIdMap.get(String(q.id));
        if (!questionUuid) return null;
        
        return {
          user_id: user.id,
          seller_id: String(seller_id),
          question_id: questionUuid,
          response_text: q.answer!.text,
          source: "ml_synced" as const,
          is_draft: false,
          is_sent: true,
          sent_at: q.answer!.date_created,
          created_at: q.answer!.date_created,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (responsesToUpsert.length > 0) {
      // Check which responses already exist to avoid duplicates
      const { data: existingResponses } = await supabase
        .from("qa_responses")
        .select("question_id")
        .in("question_id", responsesToUpsert.map(r => r!.question_id))
        .eq("is_sent", true);

      const existingQuestionIds = new Set(existingResponses?.map(r => r.question_id) || []);
      
      const newResponses = responsesToUpsert.filter(
        r => r && !existingQuestionIds.has(r.question_id)
      );

      if (newResponses.length > 0) {
        const { error: responseError } = await supabase
          .from("qa_responses")
          .insert(newResponses as never[]);

        if (responseError) {
          console.error("Error inserting ML responses:", responseError);
        } else {
          console.log(`[ml-sync-questions] Synced ${newResponses.length} ML responses`);
        }
      }
    }

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
