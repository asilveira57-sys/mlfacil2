import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type EligibilityState = 'eligible' | 'low_base' | 'inactive' | 'unknown' | 'loading';

export interface CategoryEligibility {
  state: EligibilityState;
  ordersCount: number;
  revenue: number;
  unitsSold: number;
  thresholdOrders: number;
  blockedUntil: string | null;
  blockReason: string | null;
  calculatedAt: string | null;
  isExpired: boolean;
}

interface EligibilityRow {
  id: string;
  user_id: string;
  seller_id: string;
  category_id: string;
  period_key: string;
  eligibility_state: string;
  orders_count: number;
  revenue: number;
  units_sold: number;
  threshold_orders: number;
  expires_at: string;
  blocked_until: string | null;
  block_reason: string | null;
  calculated_at: string;
}

// Thresholds configuráveis
export const ELIGIBILITY_THRESHOLDS = {
  MIN_ORDERS_ELIGIBLE: 10,
  MIN_REVENUE_ELIGIBLE: 500, // R$ 500
  CACHE_TTL_HOURS: 24,
  BLOCK_TTL_HOURS: 24,
};

// Hook principal para verificar elegibilidade
export function useCategoryEligibility(
  sellerId: string | null,
  categoryId: string | null,
  periodDays: number = 30
) {
  const periodKey = `last_${periodDays}d`;

  return useQuery({
    queryKey: ['category-eligibility', sellerId, categoryId, periodKey],
    queryFn: async (): Promise<CategoryEligibility> => {
      if (!sellerId || !categoryId) {
        return {
          state: 'unknown',
          ordersCount: 0,
          revenue: 0,
          unitsSold: 0,
          thresholdOrders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
          blockedUntil: null,
          blockReason: null,
          calculatedAt: null,
          isExpired: true,
        };
      }

      // 1. Verificar cache existente
      const { data: cached, error: cacheError } = await supabase
        .from('seller_category_eligibility')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('category_id', categoryId)
        .eq('period_key', periodKey)
        .maybeSingle();

      if (cacheError) {
        console.error('[useCategoryEligibility] Cache error:', cacheError);
      }

      const now = new Date();
      const isExpired = !cached || new Date(cached.expires_at) < now;
      const isBlocked = cached?.blocked_until && new Date(cached.blocked_until) > now;

      // Se está bloqueado, retorna do cache sem recalcular
      if (isBlocked && cached) {
        return {
          state: cached.eligibility_state as EligibilityState,
          ordersCount: cached.orders_count,
          revenue: Number(cached.revenue),
          unitsSold: cached.units_sold,
          thresholdOrders: cached.threshold_orders,
          blockedUntil: cached.blocked_until,
          blockReason: cached.block_reason,
          calculatedAt: cached.calculated_at,
          isExpired: false,
        };
      }

      // Se cache válido, retorna
      if (!isExpired && cached) {
        return {
          state: cached.eligibility_state as EligibilityState,
          ordersCount: cached.orders_count,
          revenue: Number(cached.revenue),
          unitsSold: cached.units_sold,
          thresholdOrders: cached.threshold_orders,
          blockedUntil: cached.blocked_until,
          blockReason: cached.block_reason,
          calculatedAt: cached.calculated_at,
          isExpired: false,
        };
      }

      // 2. Recalcular usando a função SQL
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) {
        return {
          state: 'unknown',
          ordersCount: 0,
          revenue: 0,
          unitsSold: 0,
          thresholdOrders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
          blockedUntil: null,
          blockReason: null,
          calculatedAt: null,
          isExpired: true,
        };
      }

      const userId = session.session.user.id;

      const { data: calculated, error: calcError } = await supabase
        .rpc('calculate_category_eligibility', {
          p_user_id: userId,
          p_seller_id: sellerId,
          p_category_id: categoryId,
          p_period_days: periodDays,
          p_threshold_orders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
        });

      if (calcError) {
        console.error('[useCategoryEligibility] Calculation error:', calcError);
        return {
          state: 'unknown',
          ordersCount: 0,
          revenue: 0,
          unitsSold: 0,
          thresholdOrders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
          blockedUntil: null,
          blockReason: null,
          calculatedAt: null,
          isExpired: true,
        };
      }

      const result = calculated?.[0] || {
        eligibility_state: 'inactive',
        orders_count: 0,
        revenue: 0,
        units_sold: 0,
      };

      // 3. Salvar no cache
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + ELIGIBILITY_THRESHOLDS.CACHE_TTL_HOURS);

      const upsertData = {
        user_id: userId,
        seller_id: sellerId,
        category_id: categoryId,
        period_key: periodKey,
        eligibility_state: result.eligibility_state,
        orders_count: result.orders_count,
        revenue: result.revenue,
        units_sold: result.units_sold,
        threshold_orders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
        calculated_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      await supabase
        .from('seller_category_eligibility')
        .upsert(upsertData, {
          onConflict: 'seller_id,category_id,period_key',
        });

      return {
        state: result.eligibility_state as EligibilityState,
        ordersCount: result.orders_count,
        revenue: Number(result.revenue),
        unitsSold: result.units_sold,
        thresholdOrders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
        blockedUntil: null,
        blockReason: null,
        calculatedAt: new Date().toISOString(),
        isExpired: false,
      };
    },
    enabled: !!sellerId && !!categoryId,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 30 * 60 * 1000, // 30 minutos
  });
}

// Hook para bloquear categoria após falha de API
export function useBlockCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sellerId,
      categoryId,
      periodKey,
      reason,
    }: {
      sellerId: string;
      categoryId: string;
      periodKey: string;
      reason: string;
    }) => {
      const blockedUntil = new Date();
      blockedUntil.setHours(blockedUntil.getHours() + ELIGIBILITY_THRESHOLDS.BLOCK_TTL_HOURS);

      const { error } = await supabase
        .from('seller_category_eligibility')
        .update({
          blocked_until: blockedUntil.toISOString(),
          block_reason: reason,
          api_attempts_count: supabase.rpc ? 1 : 1, // Incrementar tentativas
          last_api_attempt_at: new Date().toISOString(),
          last_error: reason,
        })
        .eq('seller_id', sellerId)
        .eq('category_id', categoryId)
        .eq('period_key', periodKey);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['category-eligibility', variables.sellerId, variables.categoryId],
      });
    },
  });
}

// Hook para obter todas as categorias com elegibilidade
export function useSellerCategoriesEligibility(sellerId: string | null, periodDays: number = 30) {
  const periodKey = `last_${periodDays}d`;

  return useQuery({
    queryKey: ['seller-categories-eligibility', sellerId, periodKey],
    queryFn: async () => {
      if (!sellerId) return [];

      const { data, error } = await supabase
        .from('seller_category_eligibility')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('period_key', periodKey)
        .order('orders_count', { ascending: false });

      if (error) {
        console.error('[useSellerCategoriesEligibility] Error:', error);
        return [];
      }

      const now = new Date();
      return (data || []).map((row: EligibilityRow) => ({
        categoryId: row.category_id,
        state: row.eligibility_state as EligibilityState,
        ordersCount: row.orders_count,
        revenue: Number(row.revenue),
        isBlocked: row.blocked_until ? new Date(row.blocked_until) > now : false,
        isExpired: new Date(row.expires_at) < now,
      }));
    },
    enabled: !!sellerId,
    staleTime: 2 * 60 * 1000,
  });
}

// Utilitário para verificar se deve chamar endpoint seller-based
export function shouldCallSellerEndpoint(eligibility: CategoryEligibility | undefined): boolean {
  if (!eligibility) return false;
  if (eligibility.state === 'loading' || eligibility.state === 'unknown') return false;
  if (eligibility.blockedUntil) return false;
  return eligibility.state === 'eligible';
}

// Textos para UX
export const ELIGIBILITY_TEXTS = {
  low_base: {
    title: 'Dados do seu desempenho ainda não aparecem aqui',
    description:
      'O Mercado Livre libera metas e desempenho por categoria só depois que existe um volume mínimo de vendas. Por enquanto, este painel vai mostrar tendências do mercado e mais vendidos públicos para ajudar no planejamento.',
    action: 'Ver tendências do mercado',
  },
  inactive: {
    title: 'Sem histórico de vendas nesta categoria',
    description:
      'Sem vendas registradas, o Mercado Livre não gera metas nem evolução para esta categoria. Você continua com acesso a tendências gerais, palavras-chave e mais vendidos para decidir onde entrar primeiro.',
    action: 'Ver subcategorias em alta',
  },
  blocked: {
    title: 'Metas e evolução do seller',
    description: 'Indisponível por volume mínimo de vendas na categoria.',
    link: 'Entender critérios',
  },
  criteria_modal: {
    title: 'Quando este painel libera dados do seu desempenho',
    description:
      'Metas e evolução dependem de histórico suficiente de vendas. Quando a categoria atinge volume mínimo no período, o Mercado Livre passa a exibir estes dados automaticamente.',
    bullets: [
      'Este painel usa dados liberados pelo próprio Mercado Livre',
      'Sem base mínima, a plataforma retorna vazio ou indisponível',
      'As tendências do mercado continuam disponíveis',
    ],
  },
};
