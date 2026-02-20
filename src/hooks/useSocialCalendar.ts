import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, format } from 'date-fns';

// ─────────────────────────────────────────
// AUTH HELPER
// ─────────────────────────────────────────
export function useCurrentUser() {
  const [userId, setUserId] = useState<string | undefined>();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return userId;
}

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
export interface SocialCalendarEvent {
  id: string;
  source: string;
  country_code: string | null;
  event_date: string;
  title: string;
  description: string | null;
  tags: string[];
  category: 'tematica' | 'feriado' | 'comercial' | 'sazonal';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SocialCalendarTemplate {
  id: string;
  niche: string;
  format: string;
  hook: string;
  script: string;
  cta: string | null;
  tags: string[];
  event_category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  seller_id: string | null;
  country_code: string;
  selected_niches: string[];
  preferred_formats: string[];
  objective: string;
  updated_at: string;
}

export interface SavedIdea {
  id: string;
  user_id: string;
  seller_id: string | null;
  event_id: string | null;
  chosen_template_id: string | null;
  custom_notes: string | null;
  custom_title: string | null;
  status: 'backlog' | 'produzindo' | 'postado';
  planned_date: string | null;
  created_at: string;
  updated_at: string;
  event?: SocialCalendarEvent | null;
  template?: SocialCalendarTemplate | null;
}

// ─────────────────────────────────────────
// TELEMETRIA HELPER
// ─────────────────────────────────────────
export async function logCalendarEngagement(
  userId: string | undefined,
  eventType: string,
  eventId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await supabase.from('social_calendar_engagement_events').insert([{
      user_id: userId ?? null,
      event_type: eventType,
      event_id: eventId ?? null,
      metadata: (metadata ?? {}) as Record<string, string>,
    }]);
  } catch {
    // fail-safe: não interrompe o fluxo
  }
}

// ─────────────────────────────────────────
// HOOK: Eventos do calendário (mês)
// ─────────────────────────────────────────
export function useCalendarEvents(currentMonth: Date, countryCode = 'BR') {
  const from = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const to = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['social_calendar_events', from, to, countryCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_calendar_events')
        .select('*')
        .gte('event_date', from)
        .lte('event_date', to)
        .eq('is_active', true)
        .or(`country_code.eq.${countryCode},country_code.is.null`)
        .order('event_date', { ascending: true });

      if (error) throw error;
      return (data ?? []) as SocialCalendarEvent[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─────────────────────────────────────────
// HOOK: Templates para um evento
// ─────────────────────────────────────────
export function useEventTemplates(eventCategory: string | null, niches: string[], formats: string[]) {
  return useQuery({
    queryKey: ['social_calendar_templates', eventCategory, niches, formats],
    queryFn: async () => {
      let query = supabase
        .from('social_calendar_templates')
        .select('*')
        .eq('is_active', true);

      if (niches.length > 0) {
        const targetNiches = [...new Set([...niches, 'geral'])];
        query = query.in('niche', targetNiches);
      }
      if (formats.length > 0) {
        query = query.in('format', formats);
      }

      const { data, error } = await query.order('niche').order('format');
      if (error) throw error;
      return (data ?? []) as SocialCalendarTemplate[];
    },
    enabled: true,
    staleTime: 10 * 60 * 1000,
  });
}

// ─────────────────────────────────────────
// HOOK: Preferências do usuário
// ─────────────────────────────────────────
export function useCalendarPreferences() {
  const userId = useCurrentUser();

  return useQuery({
    queryKey: ['social_calendar_prefs', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_calendar_user_preferences')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as UserPreferences | null;
    },
    enabled: !!userId,
  });
}

export function useSaveCalendarPreferences() {
  const userId = useCurrentUser();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: Partial<Omit<UserPreferences, 'id' | 'user_id' | 'updated_at'>>) => {
      const payload = { ...prefs, user_id: userId! };
      const { data, error } = await supabase
        .from('social_calendar_user_preferences')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social_calendar_prefs'] });
      toast.success('Preferências salvas!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─────────────────────────────────────────
// HOOK: Pautas salvas
// ─────────────────────────────────────────
export function useSavedIdeas() {
  const userId = useCurrentUser();

  return useQuery({
    queryKey: ['social_calendar_saved', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_calendar_saved_ideas')
        .select(`
          *,
          event:event_id ( * ),
          template:chosen_template_id ( * )
        `)
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedIdea[];
    },
    enabled: !!userId,
  });
}

export function useSaveIdea() {
  const userId = useCurrentUser();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      event_id?: string;
      chosen_template_id?: string;
      custom_notes?: string;
      custom_title?: string;
      planned_date?: string;
    }) => {
      const { data, error } = await supabase
        .from('social_calendar_saved_ideas')
        .insert({ ...payload, user_id: userId!, status: 'backlog' })
        .select()
        .single();
      if (error) throw error;
      await logCalendarEngagement(userId, 'save', payload.event_id);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social_calendar_saved'] });
      toast.success('Pauta salva com sucesso!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateIdeaStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SavedIdea['status'] }) => {
      const { error } = await supabase
        .from('social_calendar_saved_ideas')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social_calendar_saved'] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateIdea() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string; custom_notes?: string; custom_title?: string; planned_date?: string; status?: string }) => {
      const { error } = await supabase
        .from('social_calendar_saved_ideas')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social_calendar_saved'] });
      toast.success('Pauta atualizada!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteIdea() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('social_calendar_saved_ideas')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social_calendar_saved'] });
      toast.success('Pauta removida.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─────────────────────────────────────────
// HOOK: Admin – todos os eventos (sem limite)
// ─────────────────────────────────────────
export function useAdminCalendarEvents(year: number) {
  return useQuery({
    queryKey: ['admin_social_calendar_events', year],
    queryFn: async () => {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      const { data, error } = await supabase
        .from('social_calendar_events')
        .select('*')
        .gte('event_date', from)
        .lte('event_date', to)
        .order('event_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SocialCalendarEvent[];
    },
  });
}

export function useAdminTemplates() {
  return useQuery({
    queryKey: ['admin_social_calendar_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_calendar_templates')
        .select('*')
        .order('niche')
        .order('format');
      if (error) throw error;
      return (data ?? []) as SocialCalendarTemplate[];
    },
  });
}

export function useAdminEngagementMetrics() {
  return useQuery({
    queryKey: ['admin_social_calendar_metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_calendar_engagement_events')
        .select('event_type, created_at, metadata');
      if (error) throw error;

      const rows = data ?? [];
      const byType: Record<string, number> = {};
      rows.forEach((r) => {
        byType[r.event_type] = (byType[r.event_type] ?? 0) + 1;
      });

      return {
        total: rows.length,
        byType,
      };
    },
  });
}

export function useAdminUpsertEvent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (event: Partial<SocialCalendarEvent> & { id?: string }) => {
      const { id, ...rest } = event;
      if (id) {
        const { error } = await supabase.from('social_calendar_events').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('social_calendar_events').insert(rest as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_social_calendar_events'] });
      toast.success('Evento salvo!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminUpsertTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (tpl: Partial<SocialCalendarTemplate> & { id?: string }) => {
      const { id, ...rest } = tpl;
      if (id) {
        const { error } = await supabase.from('social_calendar_templates').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('social_calendar_templates').insert(rest as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_social_calendar_templates'] });
      toast.success('Template salvo!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminToggleEvent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('social_calendar_events')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin_social_calendar_events'] }),
    onError: (e: Error) => toast.error(e.message),
  });
}
