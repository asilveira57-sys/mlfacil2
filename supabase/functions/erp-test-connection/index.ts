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

    const { integration_id, provider } = await req.json();

    if (!integration_id) {
      return new Response(
        JSON.stringify({ success: false, message: "integration_id required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch integration
    const { data: integration, error: fetchError } = await supabase
      .from("erp_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (fetchError || !integration) {
      return new Response(
        JSON.stringify({ success: false, message: "Integration not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    let testResult: { success: boolean; message: string } = { success: false, message: "Unknown provider" };

    if (integration.provider === "tiny") {
      testResult = await testTinyConnection(integration.api_key);
    } else if (integration.provider === "olist") {
      testResult = await testOlistConnection(integration.api_key);
    }

    // Update integration with test result
    await supabase
      .from("erp_integrations")
      .update({
        last_test_at: new Date().toISOString(),
        last_test_status: testResult.success ? "success" : "failed",
        last_test_message: testResult.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration_id);

    return new Response(
      JSON.stringify(testResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error testing connection:", error);
    return new Response(
      JSON.stringify({ success: false, message: errorMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function testTinyConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    // Tiny API test endpoint
    const response = await fetch(
      `https://api.tiny.com.br/api2/info.php?token=${apiKey}&formato=json`
    );

    const data = await response.json();

    if (data.retorno?.status === "OK") {
      return { success: true, message: "Conexão OK" };
    } else {
      return { 
        success: false, 
        message: data.retorno?.erros?.[0]?.erro || "Falha na autenticação" 
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: `Erro de rede: ${errorMsg}` };
  }
}

async function testOlistConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    // Olist API test endpoint
    const response = await fetch(
      "https://api.olist.com/v1/me",
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      return { success: true, message: "Conexão OK" };
    } else {
      const data = await response.json().catch(() => ({}));
      return { 
        success: false, 
        message: data.message || `HTTP ${response.status}` 
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: `Erro de rede: ${errorMsg}` };
  }
}
