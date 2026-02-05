import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  collaboratorId: string;
  workspaceId: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Authorization header required");
    }

    // Verify calling user
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { collaboratorId, workspaceId }: InviteRequest = await req.json();

    if (!collaboratorId || !workspaceId) {
      throw new Error("collaboratorId and workspaceId are required");
    }

    // Use service role for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Verify caller is workspace admin
    const { data: memberData, error: memberError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (memberError || memberData?.role !== "admin") {
      throw new Error("Only workspace admins can send invites");
    }

    // Get collaborator data
    const { data: collab, error: collabError } = await supabase
      .from("collaborators")
      .select("*")
      .eq("id", collaboratorId)
      .eq("workspace_id", workspaceId)
      .single();

    if (collabError || !collab) {
      throw new Error("Collaborator not found");
    }

    // Check if user already exists in auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === collab.email.toLowerCase()
    );

    let authUserId: string;

    if (existingUser) {
      authUserId = existingUser.id;
    } else {
      // Create new user with invite
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        collab.email,
        {
          redirectTo: `${req.headers.get("origin") || "https://mlfacil2.lovable.app"}/auth`,
        }
      );

      if (inviteError) {
        console.error("Invite error:", inviteError);
        throw new Error(`Failed to send invite: ${inviteError.message}`);
      }

      authUserId = inviteData.user.id;
    }

    // Update collaborator with auth user id and invited_at
    const { error: updateError } = await supabase
      .from("collaborators")
      .update({
        auth_user_id: authUserId,
        invited_at: new Date().toISOString(),
        status: "invited",
      })
      .eq("id", collaboratorId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error("Failed to update collaborator");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invite sent to ${collab.email}`,
        authUserId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in collaborator-invite:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
