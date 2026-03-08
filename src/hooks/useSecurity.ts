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
      await supabase.from('security_events').insert({
        user_id: userId!,
        event_type: 'password_changed',
        user_agent: navigator.userAgent,
        success: true,
        metadata: { changed_at: new Date().toISOString() },
      });

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
