import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCallback } from 'react';

// ============================================================
// TIPOS
// ============================================================
export interface ConsultantTip {
  id: string;
  titulo: string;
  slug: string;
  tipo: 'texto' | 'imagem' | 'video' | 'carrossel';
  conteudo_json: {
    body?: string;
    highlights?: string[];
    image_url?: string;
    video_url?: string;
    slides?: Array<{ text: string; image_url?: string }>;
  };
  categoria: string | null;
  modulo_relacionado: string | null;
  tags: string[] | null;
  nivel: 'iniciante' | 'intermediario' | 'avancado';
  fixada_dashboard: boolean;
  ativa: boolean;
  versao: number;
  created_at: string;
  updated_at: string;
  // Computed client-side
  liked?: boolean;
  saved?: boolean;
  views_count?: number;
  likes_count?: number;
  saves_count?: number;
  shares_count?: number;
}

// ============================================================
// LOGGER: registra em system_logs (fail-safe)
// ============================================================
async function logTipAction(params: {
  acao: string;
  user_id?: string;
  referencia_id?: string;
  detalhes?: Record<string, unknown>;
}) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('system_logs') as any).insert({
      system_area: 'consultant_tips',
      action: params.acao,
      user_id: params.user_id ?? null,
      success: true,
      message: params.referencia_id ? `tip_id: ${params.referencia_id}` : params.acao,
      meta_json: params.detalhes ?? {},
    });
  } catch {
    // fail-safe: log nunca bloqueia o fluxo
  }
}

// ============================================================
// HOOK: buscar todas as dicas (sem limite)
// ============================================================
export function useConsultantTips(filtros?: {
  modulo_relacionado?: string;
  categoria?: string;
  nivel?: string;
  tag?: string;
  tipo?: string;
  fixada_dashboard?: boolean;
}) {
  return useQuery({
    queryKey: ['consultant-tips', filtros],
    queryFn: async () => {
      let query = supabase
        .from('consultant_tips')
        .select('*')
        .eq('ativa', true)
        .order('fixada_dashboard', { ascending: false })
        .order('created_at', { ascending: false });

      if (filtros?.modulo_relacionado) {
        query = query.eq('modulo_relacionado', filtros.modulo_relacionado);
      }
      if (filtros?.categoria) {
        query = query.eq('categoria', filtros.categoria);
      }
      if (filtros?.nivel) {
        query = query.eq('nivel', filtros.nivel);
      }
      if (filtros?.tag) {
        query = query.contains('tags', [filtros.tag]);
      }
      if (filtros?.tipo) {
        query = query.eq('tipo', filtros.tipo);
      }
      if (filtros?.fixada_dashboard !== undefined) {
        query = query.eq('fixada_dashboard', filtros.fixada_dashboard);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ConsultantTip[];
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

// ============================================================
// HOOK: buscar dica por slug (para rota pública)
// ============================================================
export function useConsultantTipBySlug(slug: string) {
  return useQuery({
    queryKey: ['consultant-tip-slug', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultant_tips')
        .select('*')
        .eq('slug', slug)
        .eq('ativa', true)
        .maybeSingle();
      if (error) throw error;
      return data as ConsultantTip | null;
    },
    enabled: !!slug,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

// ============================================================
// HOOK: dicas fixadas no dashboard
// ============================================================
export function useDashboardTips() {
  return useConsultantTips({ fixada_dashboard: true });
}

// ============================================================
// HOOK: dicas por módulo (exibição contextual)
// ============================================================
export function useModuleTips(moduloSlug: string) {
  return useConsultantTips({ modulo_relacionado: moduloSlug });
}

// ============================================================
// HOOK: busca global (retorna dicas que batem com o termo)
// ============================================================
export function useConsultantTipsSearch(term: string) {
  return useQuery({
    queryKey: ['consultant-tips-search', term],
    queryFn: async () => {
      if (!term || term.length < 2) return [];

      const { data, error } = await supabase
        .from('consultant_tips')
        .select('id, titulo, slug, tipo, categoria, modulo_relacionado, tags, nivel')
        .eq('ativa', true)
        .or(
          `titulo.ilike.%${term}%,categoria.ilike.%${term}%,modulo_relacionado.ilike.%${term}%`
        )
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Pick<ConsultantTip, 'id' | 'titulo' | 'slug' | 'tipo' | 'categoria' | 'modulo_relacionado' | 'tags' | 'nivel'>[];
    },
    enabled: term.length >= 2,
    staleTime: 30 * 1000,
  });
}

// ============================================================
// HOOK: interações do usuário com dicas
// ============================================================
export function useUserTipInteractions(tipId?: string) {
  return useQuery({
    queryKey: ['tip-interactions-user', tipId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !tipId) return { liked: false, saved: false };

      const { data } = await supabase
        .from('consultant_tip_interactions')
        .select('tipo_interacao')
        .eq('tip_id', tipId)
        .eq('user_id', user.id);

      const types = new Set((data || []).map(d => d.tipo_interacao));
      return { liked: types.has('like'), saved: types.has('salvar') };
    },
    enabled: !!tipId,
    staleTime: 30 * 1000,
  });
}

// ============================================================
// HOOK: métricas de uma dica (admin)
// ============================================================
export function useTipMetrics(tipId: string) {
  return useQuery({
    queryKey: ['tip-metrics', tipId],
    queryFn: async () => {
      const [viewsRes, interactionsRes] = await Promise.all([
        supabase
          .from('consultant_tip_views')
          .select('id', { count: 'exact', head: true })
          .eq('tip_id', tipId),
        supabase
          .from('consultant_tip_interactions')
          .select('tipo_interacao')
          .eq('tip_id', tipId),
      ]);

      const interactions = interactionsRes.data || [];
      return {
        views: viewsRes.count ?? 0,
        likes: interactions.filter(i => i.tipo_interacao === 'like').length,
        saves: interactions.filter(i => i.tipo_interacao === 'salvar').length,
        shares: interactions.filter(i => i.tipo_interacao === 'compartilhar').length,
      };
    },
    staleTime: 60 * 1000,
  });
}

// ============================================================
// HOOK: registrar visualização (deduplicado por dia)
// ============================================================
export function useRegisterTipView() {
  return useCallback(async (tipId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Deduplicação: apenas 1 view por usuário por dica por dia
      const today = new Date().toISOString().split('T')[0];
      const { data: existing } = await supabase
        .from('consultant_tip_views')
        .select('id')
        .eq('tip_id', tipId)
        .eq('user_id', user.id)
        .gte('viewed_at', `${today}T00:00:00`)
        .maybeSingle();

      if (!existing) {
        await supabase.from('consultant_tip_views').insert({
          tip_id: tipId,
          user_id: user.id,
        });

        await logTipAction({
          acao: 'VIEW',
          user_id: user.id,
          referencia_id: tipId,
          detalhes: { tip_id: tipId, date: today },
        });
      }
    } catch {
      // fail-safe
    }
  }, []);
}

// ============================================================
// HOOK: toggleInteração (like/salvar/compartilhar)
// ============================================================
export function useToggleTipInteraction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tipId,
      tipo,
    }: { tipId: string; tipo: 'like' | 'salvar' | 'compartilhar' }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data: existing } = await supabase
        .from('consultant_tip_interactions')
        .select('id')
        .eq('tip_id', tipId)
        .eq('user_id', user.id)
        .eq('tipo_interacao', tipo)
        .maybeSingle();

      if (existing) {
        // Toggle off
        await supabase
          .from('consultant_tip_interactions')
          .delete()
          .eq('id', existing.id);

        await logTipAction({
          acao: `${tipo.toUpperCase()}_REMOVED`,
          user_id: user.id,
          referencia_id: tipId,
          detalhes: { tipo_interacao: tipo },
        });
        return { active: false };
      } else {
        // Toggle on
        await supabase.from('consultant_tip_interactions').insert({
          tip_id: tipId,
          user_id: user.id,
          tipo_interacao: tipo,
        });

        await logTipAction({
          acao: tipo.toUpperCase(),
          user_id: user.id,
          referencia_id: tipId,
          detalhes: { tipo_interacao: tipo },
        });
        return { active: true };
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tip-interactions-user', variables.tipId] });
      queryClient.invalidateQueries({ queryKey: ['tip-metrics', variables.tipId] });
    },
  });
}

// ============================================================
// HOOK ADMIN: todas as dicas (incluindo inativas)
// ============================================================
export function useAdminConsultantTips() {
  return useQuery({
    queryKey: ['admin-consultant-tips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultant_tips')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ConsultantTip[];
    },
    staleTime: 0,
  });
}

// ============================================================
// HOOK ADMIN: CRUD de dicas
// ============================================================
export function useAdminTipMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-consultant-tips'] });
    queryClient.invalidateQueries({ queryKey: ['consultant-tips'] });
  };

  const createTip = useMutation({
    mutationFn: async (tip: Omit<ConsultantTip, 'id' | 'created_at' | 'updated_at' | 'versao'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('consultant_tips')
        .insert({ ...tip, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      await logTipAction({ acao: 'CREATE', user_id: user?.id, referencia_id: data.id, detalhes: { titulo: tip.titulo } });
      return data;
    },
    onSuccess: invalidate,
  });

  const updateTip = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ConsultantTip> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      // Remove computed fields before updating
      const { liked, saved, views_count, likes_count, saves_count, shares_count, ...safeUpdates } = updates as Record<string, unknown>;
      const { data, error } = await supabase
        .from('consultant_tips')
        .update(safeUpdates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await logTipAction({ acao: 'UPDATE', user_id: user?.id, referencia_id: id, detalhes: safeUpdates });
      return data;
    },
    onSuccess: invalidate,
  });

  const toggleTip = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('consultant_tips')
        .update({ ativa })
        .eq('id', id);
      if (error) throw error;
      await logTipAction({ acao: ativa ? 'ACTIVATE' : 'DEACTIVATE', user_id: user?.id, referencia_id: id });
    },
    onSuccess: invalidate,
  });

  const deleteTip = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('consultant_tips').delete().eq('id', id);
      if (error) throw error;
      await logTipAction({ acao: 'DELETE', user_id: user?.id, referencia_id: id });
    },
    onSuccess: invalidate,
  });

  const toggleDashboard = useMutation({
    mutationFn: async ({ id, fixada }: { id: string; fixada: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('consultant_tips')
        .update({ fixada_dashboard: fixada })
        .eq('id', id);
      if (error) throw error;
      await logTipAction({ acao: fixada ? 'PIN_DASHBOARD' : 'UNPIN_DASHBOARD', user_id: user?.id, referencia_id: id });
    },
    onSuccess: invalidate,
  });

  return { createTip, updateTip, toggleTip, deleteTip, toggleDashboard };
}

// ============================================================
// HOOK ADMIN: métricas globais
// ============================================================
export function useAdminTipGlobalMetrics() {
  return useQuery({
    queryKey: ['admin-tip-global-metrics'],
    queryFn: async () => {
      const [tipsRes, viewsRes, interactionsRes] = await Promise.all([
        supabase.from('consultant_tips').select('id, ativa', { count: 'exact' }),
        supabase.from('consultant_tip_views').select('id', { count: 'exact', head: true }),
        supabase.from('consultant_tip_interactions').select('tipo_interacao'),
      ]);

      const interactions = interactionsRes.data || [];
      return {
        total_tips: tipsRes.count ?? 0,
        active_tips: (tipsRes.data || []).filter(t => t.ativa).length,
        total_views: viewsRes.count ?? 0,
        total_likes: interactions.filter(i => i.tipo_interacao === 'like').length,
        total_saves: interactions.filter(i => i.tipo_interacao === 'salvar').length,
        total_shares: interactions.filter(i => i.tipo_interacao === 'compartilhar').length,
      };
    },
    staleTime: 60 * 1000,
  });
}
