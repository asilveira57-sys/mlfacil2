import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUserId } from './useCurrentUserId';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface SecurityEvent {
  id: string;
  user_id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  device_info: Json;
  location: string | null;
  is_new_device: boolean;
  success: boolean;
  metadata: Json;
  created_at: string;
}

export interface SecuritySettings {
  id: string;
  user_id: string;
  new_device_alerts: boolean;
  login_alerts: boolean;
  password_change_alerts: boolean;
  last_password_change_at: string | null;
  trusted_devices: unknown[];
}

export function useSecurityEvents(limit = 20) {
  const userId = useCurrentUserId();

  return useQuery({
    queryKey: ['security-events', userId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_events')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as SecurityEvent[];
    },
    enabled: !!userId,
  });
}

export function useSecuritySettings() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['security-settings', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_security_settings')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as SecuritySettings | null;
    },
    enabled: !!userId,
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<Pick<SecuritySettings, 'new_device_alerts' | 'login_alerts' | 'password_change_alerts'>>) => {
      const { data, error } = await supabase
        .from('user_security_settings')
        .upsert({
          user_id: userId!,
          ...updates,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-settings', userId] });
      toast.success('Preferências de segurança atualizadas');
    },
    onError: () => {
      toast.error('Erro ao salvar preferências');
    },
  });

  return { ...query, updateSettings };
}

export function useChangePassword() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ newPassword }: { newPassword: string }) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      // Log the password change event
      await supabase.from('security_events').insert([{
        user_id: userId!,
        event_type: 'password_changed',
        user_agent: navigator.userAgent,
        success: true,
        metadata: { changed_at: new Date().toISOString() } as Json,
      }]);

      // Update last password change timestamp
      await supabase.from('user_security_settings').upsert({
        user_id: userId!,
        last_password_change_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-events', userId] });
      queryClient.invalidateQueries({ queryKey: ['security-settings', userId] });
      toast.success('Senha alterada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao alterar senha');
    },
  });
}

export function useLogSecurityEvent() {
  const userId = useCurrentUserId();

  return useMutation({
    mutationFn: async (event: { event_type: string; success?: boolean; metadata?: Json }) => {
      if (!userId) return;
      const { error } = await supabase.from('security_events').insert([{
        user_id: userId,
        user_agent: navigator.userAgent,
        ...event,
      }]);
      if (error) throw error;
    },
  });
}

export interface ActiveSession {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  is_current: boolean;
}

export function useActiveSessions() {
  const userId = useCurrentUserId();

  return useQuery({
    queryKey: ['active-sessions', userId],
    queryFn: async (): Promise<ActiveSession[]> => {
      if (!userId) return [];

      const currentUserAgent = navigator.userAgent;

      // Always ensure current session is registered first
      try {
        // Check if we already have a recent login event for this exact user agent (last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existing, error: existingError } = await supabase
          .from('security_events')
          .select('id')
          .eq('user_id', userId)
          .eq('event_type', 'login')
          .eq('success', true)
          .eq('user_agent', currentUserAgent)
          .gte('created_at', oneDayAgo)
          .limit(1);

        if (existingError) throw existingError;

        // If no recent login event for current user agent, register one
        if (!existing || existing.length === 0) {
          const { error: insertError } = await supabase.from('security_events').insert([{
            user_id: userId,
            event_type: 'login',
            user_agent: currentUserAgent,
            success: true,
            metadata: { login_at: new Date().toISOString(), source: 'session_register' } as Json,
          }]);

          if (insertError) throw insertError;
        }
      } catch {
        // Non-critical, continue
      }

      // Get recent login events to show as "active sessions"
      const { data, error } = await supabase
        .from('security_events')
        .select('id, user_agent, ip_address, created_at')
        .eq('user_id', userId)
        .eq('event_type', 'login')
        .eq('success', true)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[useActiveSessions] Query error:', error);
        // Return at least the current session on error
        return [{
          id: 'current-session',
          user_agent: currentUserAgent,
          ip_address: null,
          created_at: new Date().toISOString(),
          is_current: true,
        }];
      }

      // Keep recent sessions as distinct entries and mark only one as current
      let currentMarked = false;
      const sessions = (data || []).map((event) => {
        const isCurrent = !currentMarked && event.user_agent === currentUserAgent;
        if (isCurrent) currentMarked = true;

        return {
          ...event,
          is_current: isCurrent,
        };
      });

      // Always include current session if no matching row was found
      if (!currentMarked) {
        sessions.unshift({
          id: 'current-session',
          user_agent: currentUserAgent,
          ip_address: null,
          created_at: new Date().toISOString(),
          is_current: true,
        });
      }

      return sessions;
    },
    enabled: !!userId,
  });
}

export function useSignOutOtherSessions() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId?: string) => {
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const { error: authError } = await supabase.auth.signOut({ scope: 'others' });
      if (authError) throw authError;

      const currentUserAgent = navigator.userAgent;

      let deleteQuery = supabase
        .from('security_events')
        .delete()
        .eq('user_id', userId)
        .eq('event_type', 'login');

      if (sessionId) {
        deleteQuery = deleteQuery.eq('id', sessionId);
      } else {
        deleteQuery = deleteQuery.neq('user_agent', currentUserAgent);
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;

      const { error: logError } = await supabase.from('security_events').insert([{
        user_id: userId,
        event_type: 'all_sessions_revoked',
        user_agent: currentUserAgent,
        success: true,
        metadata: { revoked_at: new Date().toISOString(), session_id: sessionId || 'all' } as Json,
      }]);

      if (logError) throw logError;
    },
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['active-sessions', userId] });
      queryClient.invalidateQueries({ queryKey: ['security-events', userId] });
      toast.success(
        sessionId
          ? 'Dispositivo desconectado com sucesso'
          : 'Todos os outros dispositivos foram desconectados',
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao desconectar dispositivos');
    },
  });
}
