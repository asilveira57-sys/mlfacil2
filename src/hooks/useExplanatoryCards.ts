import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUserId } from './useCurrentUserId';

export interface ExplanatoryCard {
  id: string;
  module_slug: string;
  titulo: string;
  tipo: 'texto' | 'imagem' | 'video' | 'carrossel';
  conteudo: Record<string, unknown>;
  ordem: number;
  ativo: boolean;
  obrigatorio: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Fetch active cards for a module ───────────────────────────
export function useModuleCards(moduleSlug: string | null) {
  return useQuery({
    queryKey: ['explanatory-cards', moduleSlug],
    queryFn: async () => {
      if (!moduleSlug) return [];
      const { data, error } = await supabase
        .from('module_explanatory_cards')
        .select('*')
        .eq('module_slug', moduleSlug)
        .eq('ativo', true)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExplanatoryCard[];
    },
    enabled: !!moduleSlug,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Check if user already viewed ─────────────────────────────
export function useHasViewedModuleCard(moduleSlug: string | null) {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: ['card-view', moduleSlug, userId],
    queryFn: async () => {
      if (!userId || !moduleSlug) return true; // default: don't show
      const { data, error } = await supabase
        .from('user_module_card_views')
        .select('visualizado')
        .eq('user_id', userId)
        .eq('module_slug', moduleSlug)
        .maybeSingle();
      if (error) throw error;
      return data?.visualizado ?? false;
    },
    enabled: !!userId && !!moduleSlug,
    staleTime: 60 * 1000,
  });
}

// ─── Mark as viewed ───────────────────────────────────────────
export function useMarkCardViewed() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  return useMutation({
    mutationFn: async (moduleSlug: string) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_module_card_views')
        .upsert(
          {
            user_id: userId,
            module_slug: moduleSlug,
            visualizado: true,
            visualizado_em: new Date().toISOString(),
            user_agent: navigator.userAgent,
          },
          { onConflict: 'user_id,module_slug' }
        );
      if (error) throw error;

      // Log to system_logs
      void supabase.rpc('register_system_log', {
        p_level: 'info',
        p_system_area: 'explanatory_cards',
        p_action: 'MODULE_CARD_VIEW',
        p_user_id: userId,
        p_success: true,
        p_meta_json: { module_slug: moduleSlug },
      });
    },
    onSuccess: (_, moduleSlug) => {
      qc.invalidateQueries({ queryKey: ['card-view', moduleSlug, userId] });
    },
  });
}

// ─── Admin: fetch ALL cards (including inactive) ──────────────
export function useAllExplanatoryCards() {
  return useQuery({
    queryKey: ['admin-explanatory-cards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_explanatory_cards')
        .select('*')
        .order('module_slug')
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExplanatoryCard[];
    },
    staleTime: 30 * 1000,
  });
}

// ─── Admin: upsert card ──────────────────────────────────────
export function useUpsertExplanatoryCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (card: Partial<ExplanatoryCard> & { module_slug: string; titulo: string; tipo: string; conteudo: Record<string, unknown> }) => {
      const payload = {
        module_slug: card.module_slug,
        titulo: card.titulo,
        tipo: card.tipo,
        conteudo: card.conteudo as unknown as import('@/integrations/supabase/types').Json,
        ordem: card.ordem ?? 1,
        ativo: card.ativo ?? true,
        obrigatorio: card.obrigatorio ?? true,
      };
      if (card.id) {
        const { error } = await supabase
          .from('module_explanatory_cards')
          .update(payload)
          .eq('id', card.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('module_explanatory_cards')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-explanatory-cards'] });
      qc.invalidateQueries({ queryKey: ['explanatory-cards'] });
    },
  });
}

// ─── Admin: delete card ──────────────────────────────────────
export function useDeleteExplanatoryCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase
        .from('module_explanatory_cards')
        .delete()
        .eq('id', cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-explanatory-cards'] });
      qc.invalidateQueries({ queryKey: ['explanatory-cards'] });
    },
  });
}

// ─── Admin: reset views for a module ─────────────────────────
export function useResetCardViews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (moduleSlug: string) => {
      const { error } = await supabase
        .from('user_module_card_views')
        .delete()
        .eq('module_slug', moduleSlug);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card-view'] });
    },
  });
}
