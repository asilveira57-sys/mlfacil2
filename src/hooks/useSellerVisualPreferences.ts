import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { toast } from 'sonner';

export type SellerAppearanceMode = 'auto' | 'fixed' | 'clean';

export interface SellerVisualPreferences {
  seller_id: string;
  user_id: string;
  mode: SellerAppearanceMode;
  fixed_template_id: string | null;
  allow_seasonal: boolean;
  allow_category: boolean;
  preferred_intensity: number;
  created_at: string;
  updated_at: string;
}

export function useSellerVisualPreferences() {
  const { sellerId } = useActiveAccount();
  const userId = useCurrentUserId();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['seller-visual-preferences', sellerId],
    queryFn: async () => {
      if (!sellerId) return null;
      const { data, error } = await supabase
        .from('seller_visual_preferences')
        .select('*')
        .eq('seller_id', sellerId)
        .maybeSingle();
      if (error) throw error;
      return data as SellerVisualPreferences | null;
    },
    enabled: !!sellerId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    preferences,
    isLoading,
    // Defaults when no preferences saved yet
    mode: (preferences?.mode as SellerAppearanceMode) || 'auto',
    fixedTemplateId: preferences?.fixed_template_id || null,
    allowSeasonal: preferences?.allow_seasonal ?? true,
    allowCategory: preferences?.allow_category ?? true,
    preferredIntensity: preferences?.preferred_intensity ?? 5,
  };
}

export function useSellerVisualPreferencesMutations() {
  const queryClient = useQueryClient();
  const { sellerId } = useActiveAccount();
  const userId = useCurrentUserId();

  const upsert = useMutation({
    mutationFn: async (updates: Partial<Omit<SellerVisualPreferences, 'seller_id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!sellerId || !userId) throw new Error('Seller não selecionado');

      const { data: existing } = await supabase
        .from('seller_visual_preferences')
        .select('seller_id')
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('seller_visual_preferences')
          .update(updates as any)
          .eq('seller_id', sellerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('seller_visual_preferences')
          .insert({
            seller_id: sellerId,
            user_id: userId,
            ...updates,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-visual-preferences'] });
      queryClient.invalidateQueries({ queryKey: ['theme-resolver'] });
      toast.success('Preferências de aparência salvas');
    },
    onError: (e: Error) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  return { upsert };
}
