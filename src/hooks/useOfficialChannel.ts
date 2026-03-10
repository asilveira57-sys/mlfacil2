import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { useUserContext } from '@/hooks/useUserContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  link_url: string | null;
  plan_target: string;
  is_active: boolean;
  priority: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementWithRead extends Announcement {
  is_read: boolean;
}

// ─── Log helper ───────────────────────────────────────────────────────────────

function logCanalEvent(
  action: string,
  userId?: string | null,
  referenceId?: string | null,
  meta?: Record<string, unknown>,
) {
  void supabase
    .rpc('register_system_log', {
      p_level: 'info',
      p_system_area: 'CANAL_OFICIAL',
      p_action: action,
      p_user_id: userId ?? undefined,
      p_reference_id: referenceId ?? undefined,
      p_meta_json: (meta ?? {}) as Record<string, string>,
    });
}

// ─── User-facing hooks ────────────────────────────────────────────────────────

/** Busca todos os comunicados ativos com flag de leitura para o usuário, filtrando por seller */
export function useAnnouncements() {
  const userId = useCurrentUserId();
  const { activeMarketplaceAccountId } = useUserContext();

  return useQuery<AnnouncementWithRead[]>({
    queryKey: ['official-channel-announcements', userId, activeMarketplaceAccountId],
    queryFn: async () => {
      if (!userId) return [];

      // Busca seller_id do marketplace account ativo (para filtro de target_seller_id)
      let activeSellerId: string | null = null;
      if (activeMarketplaceAccountId) {
        const { data: maData } = await supabase
          .from('marketplace_accounts')
          .select('external_user_id')
          .eq('id', activeMarketplaceAccountId)
          .single();
        activeSellerId = maData?.external_user_id ?? null;
      }

      // Busca todos os comunicados ativos
      const { data: announcements, error: annErr } = await supabase
        .from('mktpfacil_announcements')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (annErr) throw annErr;
      if (!announcements || announcements.length === 0) return [];

      // Filtra: target_seller_id IS NULL (para todos) OU = sellerId ativo
      const filtered = announcements.filter((a: any) => {
        const target = a.target_seller_id;
        if (!target) return true; // comunicado global
        return activeSellerId && target === activeSellerId;
      });

      // Busca leituras do usuário
      const { data: reads, error: readsErr } = await supabase
        .from('mktpfacil_announcement_reads')
        .select('announcement_id')
        .eq('user_id', userId);

      if (readsErr) throw readsErr;

      const readIds = new Set((reads ?? []).map((r) => r.announcement_id));

      return filtered.map((a) => ({
        ...a,
        is_read: readIds.has(a.id),
      }));
    },
    enabled: !!userId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/** Contador de não lidos — usado pelo badge */
export function useUnreadCount() {
  const { data } = useAnnouncements();
  return data ? data.filter((a) => !a.is_read).length : 0;
}

/** Marca um comunicado como lido */
export function useMarkAnnouncementRead() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (announcementId: string) => {
      if (!userId) return;

      await supabase.from('mktpfacil_announcement_reads').upsert(
        { announcement_id: announcementId, user_id: userId },
        { onConflict: 'user_id,announcement_id' },
      );

      logCanalEvent('ANNOUNCEMENT_READ', userId, announcementId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['official-channel-announcements'] });
    },
  });
}

// ─── Admin hooks ──────────────────────────────────────────────────────────────

/** Busca todos os comunicados (incluindo inativos) — somente admin */
export function useAdminAnnouncements() {
  return useQuery<Announcement[]>({
    queryKey: ['admin-announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mktpfacil_announcements')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Cria ou atualiza comunicado */
export function useUpsertAnnouncement() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<Announcement> & { title: string; content: string }) => {
      const { id, ...rest } = payload;

      if (id) {
        const { error } = await supabase
          .from('mktpfacil_announcements')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        logCanalEvent('ANNOUNCEMENT_UPDATED', userId, id, { title: rest.title });
      } else {
        const { data, error } = await supabase
          .from('mktpfacil_announcements')
          .insert({ ...rest, created_by: userId ?? undefined })
          .select()
          .single();
        if (error) throw error;
        logCanalEvent('ANNOUNCEMENT_CREATED', userId, data?.id, { title: rest.title });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      queryClient.invalidateQueries({ queryKey: ['official-channel-announcements'] });
    },
  });
}

/** Ativa / desativa comunicado */
export function useToggleAnnouncementActive() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('mktpfacil_announcements')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      if (!is_active) logCanalEvent('ANNOUNCEMENT_DEACTIVATED', userId, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      queryClient.invalidateQueries({ queryKey: ['official-channel-announcements'] });
    },
  });
}

/** Métricas por comunicado — total de leituras e usuários que viram */
export function useAnnouncementMetrics(announcementId: string) {
  return useQuery({
    queryKey: ['announcement-metrics', announcementId],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('mktpfacil_announcement_reads')
        .select('user_id', { count: 'exact' })
        .eq('announcement_id', announcementId);

      if (error) throw error;
      return { totalReads: count ?? 0, readers: data ?? [] };
    },
    enabled: !!announcementId,
  });
}
