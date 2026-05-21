import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const USER_ID = "d0714efa-0cab-4ad1-8d2d-5a7adca4f99c";
    const NEW_EMAIL = "suporte_ti@interfood.com.br";

    const { data, error } = await admin.auth.admin.updateUserById(USER_ID, {
      email: NEW_EMAIL,
      email_confirm: true,
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

    await admin.from("profiles").update({ email: NEW_EMAIL, email_verified: true }).eq("id", USER_ID);

    return new Response(JSON.stringify({ success: true, email: data.user?.email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
