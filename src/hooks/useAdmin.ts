import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  AdminDashboardStats,
  AdminUser,
  OnboardingCard,
  OnboardingCardInsert,
  PlatformSetting,
  SeoPageSetting,
  IntegrationStatus,
  AdminActionLog,
} from '@/types/admin';
import type { Json } from '@/integrations/supabase/types';

// Dashboard Stats
export function useAdminDashboardStats() {
  return useQuery({
    queryKey: ['admin', 'dashboard-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_dashboard_stats');
      if (error) throw error;
      return data as unknown as AdminDashboardStats;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

// Users Management
export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      // Get all user access states with their roles using raw query approach
      const { data: accessStates, error: accessError } = await supabase
        .from('user_access_state')
        .select('user_id, created_at, trial_end_at, selected_plan_id')
        .order('created_at', { ascending: false });

      if (accessError) throw accessError;

      // Get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Merge data
      const usersMap = new Map<string, AdminUser>();
      
      for (const state of accessStates || []) {
        const userRoles = (roles || [])
          .filter(r => r.user_id === state.user_id)
          .map(r => r.role);
        
        usersMap.set(state.user_id, {
          id: state.user_id,
          email: state.user_id.slice(0, 8) + '...',
          created_at: state.created_at,
          last_sign_in_at: null,
          subscription_status: 'trial', // Default
          trial_end_at: state.trial_end_at,
          selected_plan_id: state.selected_plan_id,
          roles: userRoles,
        });
      }

      return Array.from(usersMap.values());
    },
  });
}

// User Role Management
export function useAdminUserRole() {
  const queryClient = useQueryClient();

  const setRole = useMutation({
    mutationFn: async ({
      userId,
      role,
      action,
    }: {
      userId: string;
      role: 'admin' | 'seller';
      action: 'add' | 'remove';
    }) => {
      const { data, error } = await supabase.rpc('admin_set_user_role', {
        p_target_user_id: userId,
        p_role: role,
        p_action: action,
      });
      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Role atualizada com sucesso');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar role: ${error.message}`);
    },
  });

  return { setRole };
}

// Trial Management
export function useAdminTrialManagement() {
  const queryClient = useQueryClient();

  const adjustTrial = useMutation({
    mutationFn: async ({
      userId,
      daysAdjustment,
      reason,
    }: {
      userId: string;
      daysAdjustment: number;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc('admin_adjust_trial', {
        p_target_user_id: userId,
        p_days_adjustment: daysAdjustment,
        p_reason: reason || null,
      });
      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Período de teste ajustado');
    },
    onError: (error) => {
      toast.error(`Erro ao ajustar período: ${error.message}`);
    },
  });

  const resetTrial = useMutation({
    mutationFn: async ({
      userId,
      trialDays,
      reason,
    }: {
      userId: string;
      trialDays?: number;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc('admin_reset_trial', {
        p_target_user_id: userId,
        p_trial_days: trialDays || 7,
        p_reason: reason || null,
      });
      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Período de teste resetado');
    },
    onError: (error) => {
      toast.error(`Erro ao resetar período: ${error.message}`);
    },
  });

  const setBlocked = useMutation({
    mutationFn: async ({
      userId,
      blocked,
      reason,
    }: {
      userId: string;
      blocked: boolean;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc('admin_set_user_blocked', {
        p_target_user_id: userId,
        p_blocked: blocked,
        p_reason: reason || null,
      });
      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(variables.blocked ? 'Usuário bloqueado' : 'Usuário desbloqueado');
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  return { adjustTrial, resetTrial, setBlocked };
}

// Onboarding Cards
export function useOnboardingCards() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'onboarding-cards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_cards')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as OnboardingCard[];
    },
  });

  const createCard = useMutation({
    mutationFn: async (card: OnboardingCardInsert) => {
      const { data, error } = await supabase
        .from('onboarding_cards')
        .insert(card)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'onboarding-cards'] });
      toast.success('Card criado com sucesso');
    },
    onError: (error) => {
      toast.error(`Erro ao criar card: ${error.message}`);
    },
  });

  const updateCard = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<OnboardingCard> & { id: string }) => {
      const { data, error } = await supabase
        .from('onboarding_cards')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'onboarding-cards'] });
      toast.success('Card atualizado');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const deleteCard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('onboarding_cards')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'onboarding-cards'] });
      toast.success('Card excluído');
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  return { ...query, createCard, updateCard, deleteCard };
}

// Platform Settings
export function usePlatformSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .order('category', { ascending: true });
      if (error) throw error;
      return data as PlatformSetting[];
    },
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data, error } = await supabase
        .from('platform_settings')
        .update({ value: value as unknown as Json, updated_at: new Date().toISOString() })
        .eq('key', key)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'platform-settings'] });
      toast.success('Configuração atualizada');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  return { ...query, updateSetting };
}

// SEO Settings
export function useSeoSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'seo-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seo_page_settings')
        .select('*')
        .order('page_path', { ascending: true });
      if (error) throw error;
      return data as SeoPageSetting[];
    },
  });

  const upsertSeoSetting = useMutation({
    mutationFn: async (setting: Partial<SeoPageSetting> & { page_path: string }) => {
      const insertData = {
        page_path: setting.page_path,
        meta_title: setting.meta_title || null,
        meta_description: setting.meta_description || null,
        canonical_url: setting.canonical_url || null,
        og_title: setting.og_title || null,
        og_description: setting.og_description || null,
        og_image: setting.og_image || null,
        robots_index: setting.robots_index ?? true,
        robots_follow: setting.robots_follow ?? true,
      };
      const { data, error } = await supabase
        .from('seo_page_settings')
        .upsert(insertData, { onConflict: 'page_path' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'seo-settings'] });
      toast.success('Configuração SEO atualizada');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar SEO: ${error.message}`);
    },
  });

  return { ...query, upsertSeoSetting };
}

// Integrations
export function useIntegrations() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_status')
        .select('*')
        .order('display_name', { ascending: true });
      if (error) throw error;
      return data as IntegrationStatus[];
    },
  });

  const updateIntegration = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'inactive' | 'error' }) => {
      const { data, error } = await supabase
        .from('integration_status')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'integrations'] });
      toast.success('Integração atualizada');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  return { ...query, updateIntegration };
}

// Admin Action Logs (Audit)
export function useAdminActionLogs() {
  return useQuery({
    queryKey: ['admin', 'action-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_action_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as AdminActionLog[];
    },
  });
}

// Webhook Logs type
export interface WebhookLogData {
  id: string;
  event_type: string;
  payload: unknown;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

// Webhook Logs (Payments)
export function useWebhookLogs() {
  return useQuery({
    queryKey: ['admin', 'webhook-logs'],
    queryFn: async () => {
      // Use raw SQL approach for tables not in types
      const { data, error } = await supabase
        .rpc('get_admin_dashboard_stats'); // We'll mock this for now
      
      // Return empty array - actual implementation would need RPC function
      return [] as WebhookLogData[];
    },
  });
}
