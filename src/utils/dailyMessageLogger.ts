import { supabase } from '@/integrations/supabase/client';

const SYSTEM_AREA = 'mensagem_do_dia';

type LogParams = {
  action: string;
  userId?: string;
  meta?: Record<string, unknown>;
  message?: string;
};

/**
 * Fire-and-forget log to system_logs via register_system_log RPC.
 * Never throws — logging must not break the main flow.
 */
export function logDailyMessageEvent({ action, userId, meta, message }: LogParams) {
  supabase
    .rpc('register_system_log', {
      p_level: 'info',
      p_system_area: SYSTEM_AREA,
      p_action: action,
      p_user_id: userId ?? undefined,
      p_meta_json: JSON.parse(JSON.stringify(meta ?? {})),
      p_message: message ?? null,
      p_success: true,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn('[DailyMessageLog] Error:', error.message);
      }
    });
}

// ─── Dedup: only log daily_message_viewed once per user per day ───
const viewedToday = new Set<string>();

export function logMessageViewed(
  userId: string,
  messageId: string,
  meta: { tema: string; data_exibicao: string; origem?: string }
) {
  const key = `${userId}:${meta.data_exibicao}`;
  const isFirst = !viewedToday.has(key);
  if (!isFirst) return; // already logged today
  viewedToday.add(key);

  logDailyMessageEvent({
    action: 'daily_message_viewed',
    userId,
    meta: {
      entity_type: 'daily_message',
      entity_id: messageId,
      tema: meta.tema,
      data_exibicao: meta.data_exibicao,
      origem: meta.origem ?? 'dashboard',
      primeira_exibicao_dia: true,
    },
  });
}

export function logMessageLiked(userId: string, messageId: string, tema: string) {
  logDailyMessageEvent({
    action: 'daily_message_liked',
    userId,
    meta: { entity_type: 'daily_message', entity_id: messageId, tema },
  });
}

export function logMessageUnliked(userId: string, messageId: string) {
  logDailyMessageEvent({
    action: 'daily_message_unliked',
    userId,
    meta: { entity_type: 'daily_message', entity_id: messageId },
  });
}

export function logCardGenerated(
  userId: string,
  messageId: string,
  template: string,
  signatureActive: boolean
) {
  logDailyMessageEvent({
    action: 'daily_message_card_generated',
    userId,
    meta: {
      entity_type: 'daily_message',
      entity_id: messageId,
      template,
      assinatura_ativa: signatureActive,
    },
  });
}

export function logCardDownloaded(userId: string, messageId: string) {
  logDailyMessageEvent({
    action: 'daily_message_card_downloaded',
    userId,
    meta: { entity_type: 'daily_message', entity_id: messageId },
  });
}

export function logPreferencesUpdated(
  userId: string,
  prefs: Record<string, unknown>
) {
  logDailyMessageEvent({
    action: 'daily_message_preferences_updated',
    userId,
    meta: {
      entity_type: 'user_preferences',
      entity_id: userId,
      ...prefs,
    },
  });
}

// ─── Admin actions ───

export function logAdminMessageCreated(userId: string, messageId: string, tema: string) {
  logDailyMessageEvent({
    action: 'daily_message_created',
    userId,
    meta: { entity_type: 'daily_message', entity_id: messageId, tema },
  });
}

export function logAdminMessageUpdated(userId: string, messageId: string, changes: Record<string, unknown>) {
  logDailyMessageEvent({
    action: 'daily_message_updated',
    userId,
    meta: { entity_type: 'daily_message', entity_id: messageId, ...changes },
  });
}

export function logAdminMessageToggled(userId: string, messageId: string, ativa: boolean) {
  logDailyMessageEvent({
    action: 'daily_message_toggled',
    userId,
    meta: { entity_type: 'daily_message', entity_id: messageId, ativa },
  });
}

export function logAdminSignatureUpdated(userId: string, newArroba: string) {
  logDailyMessageEvent({
    action: 'daily_message_signature_updated',
    userId,
    meta: { entity_type: 'system_settings', new_value: newArroba },
  });
}

export function logAdminAiSuggested(userId: string, tema: string, count: number) {
  logDailyMessageEvent({
    action: 'daily_message_ai_suggested',
    userId,
    meta: { tema, count },
  });
}

export function logAdminAiApproved(userId: string, suggestionId: string, tema: string) {
  logDailyMessageEvent({
    action: 'daily_message_ai_approved',
    userId,
    meta: { entity_type: 'message_ai_suggestion', entity_id: suggestionId, tema },
  });
}

export function logAdminAiRejected(userId: string, suggestionId: string) {
  logDailyMessageEvent({
    action: 'daily_message_ai_rejected',
    userId,
    meta: { entity_type: 'message_ai_suggestion', entity_id: suggestionId },
  });
}
