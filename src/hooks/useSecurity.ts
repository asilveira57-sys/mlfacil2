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
    queryFn: async () => {
      // Get recent login events to show as "active sessions"
      const { data, error } = await supabase
        .from('security_events')
        .select('id, user_agent, ip_address, created_at')
        .eq('user_id', userId!)
        .eq('event_type', 'login')
        .eq('success', true)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      
      const currentUserAgent = navigator.userAgent;
      
      // Dedupe by user_agent (keep most recent per device)
      const sessionsMap = new Map<string, ActiveSession>();
      for (const event of data || []) {
        const key = event.user_agent || event.id;
        if (!sessionsMap.has(key)) {
          sessionsMap.set(key, {
            ...event,
            is_current: event.user_agent === currentUserAgent,
          });
        }
      }
      
      const sessions = Array.from(sessionsMap.values());
      
      // If no sessions logged yet, show current session as fallback
      if (sessions.length === 0) {
        sessions.push({
          id: 'current-session',
          user_agent: currentUserAgent,
          ip_address: null,
          created_at: new Date().toISOString(),
          is_current: true,
        });
        
        // Also register the current session for future queries
        try {
          await supabase.from('security_events').insert([{
            user_id: userId!,
            event_type: 'login',
            user_agent: currentUserAgent,
            success: true,
            metadata: { login_at: new Date().toISOString(), source: 'session_backfill' },
          }]);
        } catch { /* silent */ }
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
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;

      // Log the event
      await supabase.from('security_events').insert([{
        user_id: userId!,
        event_type: 'all_sessions_revoked',
        user_agent: navigator.userAgent,
        success: true,
        metadata: { revoked_at: new Date().toISOString() } as Json,
      }]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-sessions', userId] });
      queryClient.invalidateQueries({ queryKey: ['security-events', userId] });
      toast.success('Todos os outros dispositivos foram desconectados');
    },
    onError: () => {
      toast.error('Erro ao desconectar dispositivos');
    },
  });
}
