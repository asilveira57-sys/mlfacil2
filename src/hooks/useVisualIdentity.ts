import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';

export interface VisualIdentitySettings {
  id: string;
  seller_id: string;
  modo_identidade: 'automatico' | 'manual' | 'clean';
  grupo_visual_manual: string | null;
  intensidade_overlay: number;
  aplicar_dashboard: boolean;
  aplicar_menu: boolean;
  aplicar_cards: boolean;
  categoria_detectada: string | null;
  grupo_visual_aplicado: string | null;
  updated_at: string;
}

export interface VisualCategoryGroup {
  id: string;
  slug: string;
  nome: string;
  imagem_overlay_url: string | null;
  gradiente_inicio: string;
  gradiente_fim: string;
  intensidade_padrao: number;
  ativo: boolean;
  prioridade: number;
  categorias_ml: string[];
}

export interface ResolvedVisualIdentity {
  settings: VisualIdentitySettings | null;
  activeGroup: VisualCategoryGroup | null;
  isClean: boolean;
  gradient: string | null;
  overlayUrl: string | null;
  intensity: number;
  applyToDashboard: boolean;
  applyToMenu: boolean;
  applyToCards: boolean;
}

export function useVisualIdentity() {
  const { sellerId } = useActiveAccount();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['visual-identity-settings', sellerId],
    queryFn: async () => {
      if (!sellerId) return null;
      const { data, error } = await supabase
        .from('visual_identity_settings')
        .select('*')
        .eq('seller_id', sellerId)
        .maybeSingle();
      if (error) throw error;
      return data as VisualIdentitySettings | null;
    },
    enabled: !!sellerId,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  });

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['visual-category-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visual_category_groups')
        .select('*')
        .eq('ativo', true)
        .order('prioridade', { ascending: true });
      if (error) throw error;
      return data as VisualCategoryGroup[];
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  });

  // Resolve which group to use
  const resolveGroup = (): VisualCategoryGroup | null => {
    if (!settings) return null;
    if (settings.modo_identidade === 'clean') return null;

    if (settings.modo_identidade === 'manual' && settings.grupo_visual_manual) {
      return groups.find(g => g.slug === settings.grupo_visual_manual) || null;
    }

    if (settings.modo_identidade === 'automatico' && settings.grupo_visual_aplicado) {
      return groups.find(g => g.slug === settings.grupo_visual_aplicado) || null;
    }

    return null;
  };

  const activeGroup = resolveGroup();
  const intensity = settings?.intensidade_overlay ?? activeGroup?.intensidade_padrao ?? 4;

  const resolved: ResolvedVisualIdentity = {
    settings,
    activeGroup,
    isClean: settings?.modo_identidade === 'clean',
    gradient: activeGroup ? `linear-gradient(135deg, ${activeGroup.gradiente_inicio}, ${activeGroup.gradiente_fim})` : null,
    overlayUrl: activeGroup?.imagem_overlay_url || null,
    intensity,
    applyToDashboard: settings?.aplicar_dashboard ?? true,
    applyToMenu: settings?.aplicar_menu ?? false,
    applyToCards: settings?.aplicar_cards ?? false,
  };

  return {
    ...resolved,
    groups,
    isLoading: settingsLoading || groupsLoading,
  };
}

export function useVisualIdentityMutations() {
  const queryClient = useQueryClient();
  const { sellerId } = useActiveAccount();
  const userId = useCurrentUserId();

  const upsertSettings = useMutation({
    mutationFn: async (updates: Partial<VisualIdentitySettings>) => {
      if (!sellerId) throw new Error('Seller não selecionado');

      const { data: existing } = await supabase
        .from('visual_identity_settings')
        .select('id')
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('visual_identity_settings')
          .update(updates)
          .eq('seller_id', sellerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('visual_identity_settings')
          .insert({ seller_id: sellerId, ...updates } as any);
        if (error) throw error;
      }

      // Log via edge or direct
      await supabase.from('visual_identity_logs').insert({
        seller_id: sellerId,
        user_id: userId,
        modo_aplicado: updates.modo_identidade || 'automatico',
        categoria_detectada: updates.categoria_detectada || null,
        grupo_visual_aplicado: updates.grupo_visual_aplicado || updates.grupo_visual_manual || null,
        origem: updates.modo_identidade === 'clean' ? 'clean' : updates.modo_identidade === 'manual' ? 'manual' : 'sistema',
        detalhes: { action: 'settings_update', updates },
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visual-identity-settings'] });
    },
  });

  return { upsertSettings };
}
