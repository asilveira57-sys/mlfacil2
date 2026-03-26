import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserToImport {
  nome: string;
  email: string;
  dias: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Check admin with anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: roleCheck } = await anonClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
    }

    // Admin client for user creation
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { users } = (await req.json()) as { users: UserToImport[] };
    if (!users || !Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ error: "No users provided" }), { status: 400, headers: corsHeaders });
    }

    const batchId = crypto.randomUUID();
    const now = new Date();
    const results = { total: users.length, created: 0, updated: 0, skipped: 0, errors: 0 };
    const logs: any[] = [];

    for (const u of users) {
      const email = u.email.trim().toLowerCase();
      const nome = u.nome.trim();
      const dias = Math.max(1, Math.round(u.dias));
      const trialEnd = new Date(now.getTime() + dias * 24 * 60 * 60 * 1000);

      try {
        // Check if user exists
        const { data: existingUsers } = await adminClient.auth.admin.listUsers({ perPage: 1, page: 1 });
        // Use a direct query to check by email
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("user_id")
          .eq("email", email)
          .maybeSingle();

        let userId: string;

        if (existingProfile?.user_id) {
          // User exists - update trial
          userId = existingProfile.user_id;
          const { error: updateErr } = await adminClient
            .from("user_access_state")
            .update({
              trial_status: "active",
              trial_start_at: now.toISOString(),
              trial_end_at: trialEnd.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("user_id", userId);

          if (updateErr) throw new Error(`Update trial failed: ${updateErr.message}`);

          // Update tag
          await adminClient
            .from("profiles")
            .update({ tag: "VETERANO", updated_at: now.toISOString() })
            .eq("user_id", userId);

          results.updated++;
          logs.push({ email, full_name: nome, status: "updated", reason: "Email já existia, trial atualizado", batch_id: batchId });
        } else {
          // Create new user - no password, email confirmed
          const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { full_name: nome },
          });

          if (createErr) {
            // Maybe user exists in auth but not in profiles
            if (createErr.message?.includes("already been registered") || createErr.message?.includes("already exists")) {
              // Get user by email from auth
              const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers();
              const existingAuthUser = authUsers?.find((au: any) => au.email?.toLowerCase() === email);
              if (existingAuthUser) {
                userId = existingAuthUser.id;
                // Update trial
                await adminClient.from("user_access_state").upsert({
                  user_id: userId,
                  trial_status: "active",
                  trial_start_at: now.toISOString(),
                  trial_end_at: trialEnd.toISOString(),
                  onboarding_status: "pending",
                  updated_at: now.toISOString(),
                }, { onConflict: "user_id" });

                await adminClient.from("profiles").upsert({
                  user_id: userId,
                  full_name: nome,
                  email,
                  tag: "VETERANO",
                  updated_at: now.toISOString(),
                }, { onConflict: "user_id" });

                results.updated++;
                logs.push({ email, full_name: nome, status: "updated", reason: "Existia no auth, trial atualizado", batch_id: batchId });
                continue;
              }
            }
            throw createErr;
          }

          userId = newUser.user.id;

          // Create profile
          await adminClient.from("profiles").upsert({
            user_id: userId,
            full_name: nome,
            email,
            tag: "VETERANO",
          }, { onConflict: "user_id" });

          // Create user_access_state with custom trial
          await adminClient.from("user_access_state").upsert({
            user_id: userId,
            onboarding_status: "pending",
            trial_status: "active",
            trial_start_at: now.toISOString(),
            trial_end_at: trialEnd.toISOString(),
            payment_status: "trial",
          }, { onConflict: "user_id" });

          results.created++;
          logs.push({ email, full_name: nome, status: "created", reason: `Criado com ${dias} dias de acesso`, batch_id: batchId });
        }
      } catch (err: any) {
        results.errors++;
        logs.push({ email, full_name: nome, status: "error", reason: err.message || String(err), batch_id: batchId });
      }
    }

    // Bulk insert logs
    if (logs.length > 0) {
      await adminClient.from("user_import_logs").insert(logs);
    }

    return new Response(
      JSON.stringify({ success: true, batch_id: batchId, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
