import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  logMessageViewed,
  logMessageLiked,
  logMessageUnliked,
  logPreferencesUpdated,
  logAdminMessageCreated,
  logAdminMessageUpdated,
  logAdminMessageToggled,
  logAdminSignatureUpdated,
  logAdminAiApproved,
  logAdminAiRejected,
} from '@/utils/dailyMessageLogger';
import { getCachedUserId } from '@/hooks/useCurrentUserId';

type DailyMessage = {
  id: string;
  tema: string;
  texto: string;
  referencia: string | null;
};

type MessagePreferences = {
  user_id: string;
  exibir_mensagem: boolean;
  tema_preferido: string | null;
  permitir_gerar_card: boolean;
};

export function useDailyMessage(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Get today's date in São Paulo timezone
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // Fetch user preferences
  const { data: preferences } = useQuery({
    queryKey: ['message-preferences', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('user_message_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      return data as MessagePreferences | null;
    },
    enabled: !!userId,
  });

  // Fetch today's message
  const { data: todayMessage, isLoading } = useQuery({
    queryKey: ['daily-message', userId, today],
    queryFn: async (): Promise<DailyMessage | null> => {
      if (!userId) return null;
      if (preferences?.exibir_mensagem === false) return null;

      // Check if already assigned today
      const { data: existing } = await supabase
        .from('message_daily_log')
        .select('message_id')
        .eq('user_id', userId)
        .eq('data_exibicao', today)
        .maybeSingle();

      if (existing?.message_id) {
        const { data: msg } = await supabase
          .from('daily_messages')
          .select('id, tema, texto, referencia')
          .eq('id', existing.message_id)
          .single();
        return msg as DailyMessage | null;
      }

      // Pick a new message
      const tema = preferences?.tema_preferido;
      let query = supabase
        .from('daily_messages')
        .select('id, tema, texto, referencia')
        .eq('ativa', true);

      if (tema) {
        query = query.eq('tema', tema);
      }

      const { data: messages } = await query;
      if (!messages || messages.length === 0) return null;

      // Random pick
      const picked = messages[Math.floor(Math.random() * messages.length)];

      // Log it
      await supabase.from('message_daily_log').insert({
        user_id: userId,
        message_id: picked.id,
        data_exibicao: today,
      });

      return picked as DailyMessage;
    },
    enabled: !!userId && preferences?.exibir_mensagem !== false,
  });

  // Fetch like count for current message
  const { data: likeCount = 0 } = useQuery({
    queryKey: ['message-likes', todayMessage?.id],
    queryFn: async () => {
      if (!todayMessage?.id) return 0;
      const { count } = await supabase
        .from('message_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('message_id', todayMessage.id)
        .eq('liked', true);
      return count ?? 0;
    },
    enabled: !!todayMessage?.id,
  });

  // Check if user liked
  const { data: userLiked = false } = useQuery({
    queryKey: ['message-user-liked', todayMessage?.id, userId],
    queryFn: async () => {
      if (!todayMessage?.id || !userId) return false;
      const { data } = await supabase
        .from('message_interactions')
        .select('id')
        .eq('message_id', todayMessage.id)
        .eq('user_id', userId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!todayMessage?.id && !!userId,
  });

  // Toggle like
  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!todayMessage?.id || !userId) throw new Error('No message');

      if (userLiked) {
        await supabase
          .from('message_interactions')
          .delete()
          .eq('message_id', todayMessage.id)
          .eq('user_id', userId);
        logMessageUnliked(userId, todayMessage.id);
      } else {
        await supabase.from('message_interactions').insert({
          user_id: userId,
          message_id: todayMessage.id,
        });
        logMessageLiked(userId, todayMessage.id, todayMessage.tema);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-likes', todayMessage?.id] });
      queryClient.invalidateQueries({ queryKey: ['message-user-liked', todayMessage?.id, userId] });
    },
  });

  // Update preferences
  const updatePreferences = useMutation({
    mutationFn: async (prefs: Partial<MessagePreferences>) => {
      if (!userId) throw new Error('No user');
      const { error } = await supabase
        .from('user_message_preferences')
        .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });
      if (error) throw error;
      logPreferencesUpdated(userId, prefs as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-preferences', userId] });
    },
  });

  // Fetch signature
  const { data: signature } = useQuery({
    queryKey: ['message-signature'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'mensagem_do_dia_signature')
        .single();
      return (data?.value as any)?.arroba || '';
    },
  });

  return {
    message: todayMessage,
    isLoading,
    likeCount,
    userLiked,
    toggleLike,
    preferences,
    updatePreferences,
    signature: signature || '',
    showMessage: preferences?.exibir_mensagem !== false,
  };
}

// Admin hooks
export function useAdminDailyMessages() {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['admin-daily-messages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_messages')
        .select('*')
        .order('tema')
        .order('ordem_rotacao', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const upsertMessage = useMutation({
    mutationFn: async (msg: any) => {
      const adminId = getCachedUserId();
      if (msg.id) {
        // Check if it's just a toggle
        if (Object.keys(msg).length === 2 && 'ativa' in msg) {
          const { error } = await supabase.from('daily_messages').update(msg).eq('id', msg.id);
          if (error) throw error;
          if (adminId) logAdminMessageToggled(adminId, msg.id, msg.ativa);
        } else {
          const { error } = await supabase.from('daily_messages').update(msg).eq('id', msg.id);
          if (error) throw error;
          if (adminId) logAdminMessageUpdated(adminId, msg.id, msg);
        }
      } else {
        const { data, error } = await supabase.from('daily_messages').insert(msg).select('id').single();
        if (error) throw error;
        if (adminId && data) logAdminMessageCreated(adminId, data.id, msg.tema);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-daily-messages'] }),
  });

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('daily_messages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-daily-messages'] }),
  });

  return { messages, isLoading, upsertMessage, deleteMessage };
}

export function useAdminSignature() {
  const queryClient = useQueryClient();

  const { data: arroba = '' } = useQuery({
    queryKey: ['admin-signature'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'mensagem_do_dia_signature')
        .single();
      return (data?.value as any)?.arroba || '';
    },
  });

  const updateSignature = useMutation({
    mutationFn: async (newArroba: string) => {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: { arroba: newArroba } as any, updated_at: new Date().toISOString() })
        .eq('key', 'mensagem_do_dia_signature');
      if (error) throw error;
      const adminId = getCachedUserId();
      if (adminId) logAdminSignatureUpdated(adminId, newArroba);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-signature'] });
      queryClient.invalidateQueries({ queryKey: ['message-signature'] });
    },
  });

  return { arroba, updateSignature };
}

export function useAdminAiSuggestions() {
  const queryClient = useQueryClient();

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['admin-ai-suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_ai_suggestions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const approveSuggestion = useMutation({
    mutationFn: async (suggestion: any) => {
      const { error: insertErr } = await supabase.from('daily_messages').insert({
        tema: suggestion.tema,
        texto: suggestion.texto,
        referencia: suggestion.referencia,
        ativa: true,
      });
      if (insertErr) throw insertErr;

      const { error: updateErr } = await supabase
        .from('message_ai_suggestions')
        .update({ status: 'aprovada', approved_at: new Date().toISOString() })
        .eq('id', suggestion.id);
      if (updateErr) throw updateErr;

      const adminId = getCachedUserId();
      if (adminId) logAdminAiApproved(adminId, suggestion.id, suggestion.tema);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ai-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-daily-messages'] });
    },
  });

  const rejectSuggestion = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { error } = await supabase
        .from('message_ai_suggestions')
        .update({ status: 'reprovada', rejected_at: new Date().toISOString(), admin_notes: notes || null })
        .eq('id', id);
      if (error) throw error;
      const adminId = getCachedUserId();
      if (adminId) logAdminAiRejected(adminId, id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ai-suggestions'] }),
  });

  return { suggestions, isLoading, approveSuggestion, rejectSuggestion };
}
