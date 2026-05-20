import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { InviteEmail } from "../_shared/email-templates/invite.tsx";

const SITE_NAME = "MKTP Fácil";
const SENDER_DOMAIN = "notify.notifica.mktpfacil.com";
const FROM_DOMAIN = "notifica.mktpfacil.com";

async function enqueueInviteEmail(
  admin: ReturnType<typeof createClient>,
  recipient: string,
  actionLink: string,
  idempotencyKey: string,
) {
  const html = await renderAsync(
    React.createElement(InviteEmail, {
      siteName: SITE_NAME,
      siteUrl: `https://${FROM_DOMAIN}`,
      confirmationUrl: actionLink,
    }),
  );
  const text = await renderAsync(
    React.createElement(InviteEmail, {
      siteName: SITE_NAME,
      siteUrl: `https://${FROM_DOMAIN}`,
      confirmationUrl: actionLink,
    }),
    { plainText: true },
  );

  const messageId = crypto.randomUUID();
  await admin.from("email_send_log").insert({
    message_id: messageId,
    template_name: "invite",
    recipient_email: recipient,
    status: "pending",
  });

  const { error } = await admin.rpc("enqueue_email", {
    queue_name: "auth_emails",
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: "Você foi convidado",
      html,
      text,
      purpose: "transactional",
      label: "invite",
      idempotency_key: idempotencyKey,
      queued_at: new Date().toISOString(),
    },
  });

  if (error) {
    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "invite",
      recipient_email: recipient,
      status: "failed",
      error_message: `enqueue_email failed: ${error.message}`,
    });
    throw new Error(`Falha ao enfileirar email: ${error.message}`);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  collaboratorId: string;
  workspaceId: string;
  /** Quando true, força reenvio mesmo se já houver invited_at recente */
  resend?: boolean;
}

const REDIRECT_URL =
  "https://www.mktpfacil.com/auth";

/**
 * Procura um usuário em auth.users pelo email, paginando todas as páginas.
 * `listUsers()` retorna no máximo `perPage` usuários — sem paginar, usuários
 * antigos passam despercebidos e o sistema acha que precisa criar (gera erro
 * "already registered") OU pula o invite achando que já foi enviado.
 */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<any | null> {
  const target = email.toLowerCase();
  const perPage = 1000;
  let page = 1;
  // Hard cap em 20 páginas (= 20k usuários) para evitar loop infinito
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[collaborator-invite] listUsers error", { page, error: error.message });
      throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    }
    const users = data?.users ?? [];
    const found = users.find((u: any) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (users.length < perPage) break; // última página
    page++;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(`[collaborator-invite][${reqId}] ${msg}`, extra ?? "");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header required");

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { collaboratorId, workspaceId, resend }: InviteRequest = await req.json();
    if (!collaboratorId || !workspaceId) {
      throw new Error("collaboratorId and workspaceId are required");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Verifica se o caller é admin do workspace
    const { data: memberData, error: memberError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (memberError || memberData?.role !== "admin") {
      throw new Error("Only workspace admins can send invites");
    }

    // Busca o colaborador
    const { data: collab, error: collabError } = await supabase
      .from("collaborators")
      .select("*")
      .eq("id", collaboratorId)
      .eq("workspace_id", workspaceId)
      .single();

    if (collabError || !collab) throw new Error("Collaborator not found");

    log("Starting invite", { email: collab.email, resend, status: collab.status });

    // Procura o usuário em auth.users (com paginação completa)
    const existingUser = await findAuthUserByEmail(supabase, collab.email);

    let authUserId: string;
    let emailDispatched = false;

    if (existingUser) {
      authUserId = existingUser.id;
      log("User already exists in auth", { userId: authUserId });

      // generateLink só GERA a URL — não envia email automaticamente.
      // Tentamos magiclink (funciona para qualquer usuário existente),
      // capturamos a action_link e enfileiramos o email manualmente
      // com nosso template de convite.
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: collab.email,
        options: { redirectTo: REDIRECT_URL },
      });

      if (linkError || !linkData?.properties?.action_link) {
        throw new Error(
          `Não foi possível gerar link de convite (usuário já existe). ` +
          `Erro: ${linkError?.message ?? "sem action_link"}. ` +
          `Peça ao colaborador para usar 'Esqueci minha senha'.`,
        );
      }

      await enqueueInviteEmail(
        supabase,
        collab.email,
        linkData.properties.action_link,
        `collaborator-invite-${collab.id}-${Date.now()}`,
      );
      emailDispatched = true;
      log("invite email enqueued for existing user", { email: collab.email });
    } else {
      // Cria novo usuário via inviteUserByEmail
      const { data: inviteData, error: inviteError } = await supabase.auth.admin
        .inviteUserByEmail(collab.email, {
          redirectTo: REDIRECT_URL,
          data: { full_name: collab.name },
        });

      if (inviteError) {
        log("inviteUserByEmail failed", { error: inviteError.message });
        throw new Error(`Falha ao enviar convite: ${inviteError.message}`);
      }

      if (!inviteData?.user?.id) {
        throw new Error("Convite criado mas sem user_id retornado");
      }

      authUserId = inviteData.user.id;
      emailDispatched = true;
      log("inviteUserByEmail succeeded", { userId: authUserId });
    }

    if (!emailDispatched) {
      throw new Error("Email não foi disparado por motivo desconhecido");
    }

    // SÓ atualiza o status para 'invited' depois de confirmar o disparo do email.
    const { error: updateError } = await supabase
      .from("collaborators")
      .update({
        auth_user_id: authUserId,
        invited_at: new Date().toISOString(),
        status: "invited",
      })
      .eq("id", collaboratorId);

    if (updateError) {
      log("Failed to update collaborator after dispatch", { error: updateError.message });
      // Não falhamos aqui — o email já foi enviado; só logamos.
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Convite enviado para ${collab.email}`,
        authUserId,
        wasExistingUser: !!existingUser,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error(`[collaborator-invite][${reqId}] ERROR`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
