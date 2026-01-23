import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ============================================================
// ESTADOS EXPLÍCITOS DO MÓDULO DE TENDÊNCIAS
// ============================================================

// Estado de elegibilidade da categoria (antes de qualquer requisição)
export type EligibilityState = 
  | 'eligible'    // Categoria ativa com volume suficiente
  | 'low_base'    // Categoria ativa mas sem base mínima (1-9 pedidos)
  | 'inactive'    // Categoria sem vendas no período
  | 'unknown'     // Estado inicial, sem dados para determinar
  | 'loading';    // Carregando verificação

// Estado de dados (camada mais importante)
export type DataState = 
  | 'DADOS_LIBERADOS_SELLER'      // ML liberou dados internos, pode buscar tudo
  | 'DADOS_BLOQUEADOS_POR_POLITICA' // ML não libera, NÃO tentar novas requisições
  | 'DADOS_PUBLICOS_MERCADO';      // Sempre disponível, independe do seller

// Permissões de leitura para cada seção
export interface DataPermissions {
  canFetchSellerPerformance: boolean;
  canFetchSellerGoals: boolean;
  canFetchSellerComparison: boolean;
  canFetchSellerAlerts: boolean;
  canFetchMarketTrends: boolean;   // Sempre true
  canFetchMarketHighlights: boolean; // Sempre true
  canFetchMarketKeywords: boolean;   // Sempre true
}

export interface CategoryEligibility {
  // Estado primário
  eligibilityState: EligibilityState;
  dataState: DataState;
  permissions: DataPermissions;
  
  // Métricas para auditoria
  ordersCount: number;
  revenue: number;
  unitsSold: number;
  thresholdOrders: number;
  
  // Bloqueio por política
  blockedUntil: string | null;
  blockReason: string | null;
  
  // Metadados
  calculatedAt: string | null;
  isExpired: boolean;
  
  // Log para auditoria
  auditLog: AuditLogEntry;
}

export interface AuditLogEntry {
  categoryId: string | null;
  periodKey: string;
  eligibilityState: EligibilityState;
  dataState: DataState;
  endpointsBlocked: string[];
  blockReason: string | null;
  timestamp: string;
}

// Thresholds configuráveis
export const ELIGIBILITY_THRESHOLDS = {
  MIN_ORDERS_ELIGIBLE: 10,
  MIN_REVENUE_ELIGIBLE: 500, // R$ 500
  CACHE_TTL_HOURS: 24,
  BLOCK_TTL_HOURS: 24,
};

// ============================================================
// FUNÇÕES DE DECISÃO (ORDEM OBRIGATÓRIA)
// ============================================================

/**
 * REGRA 1: Determina o estado de dados baseado na elegibilidade
 * Esta função é chamada ANTES de qualquer requisição à API
 */
function determineDataState(eligibilityState: EligibilityState): DataState {
  switch (eligibilityState) {
    case 'eligible':
      return 'DADOS_LIBERADOS_SELLER';
    case 'low_base':
    case 'inactive':
      return 'DADOS_BLOQUEADOS_POR_POLITICA';
    case 'unknown':
    case 'loading':
    default:
      return 'DADOS_PUBLICOS_MERCADO';
  }
}

/**
 * REGRA 2: Gera permissões de leitura baseado no estado de dados
 * Nenhum componente pode ignorar estas permissões
 */
function generatePermissions(dataState: DataState): DataPermissions {
  const sellerAllowed = dataState === 'DADOS_LIBERADOS_SELLER';
  
  return {
    // Seller-based (condicionais)
    canFetchSellerPerformance: sellerAllowed,
    canFetchSellerGoals: sellerAllowed,
    canFetchSellerComparison: sellerAllowed,
    canFetchSellerAlerts: sellerAllowed,
    
    // Mercado (sempre disponível)
    canFetchMarketTrends: true,
    canFetchMarketHighlights: true,
    canFetchMarketKeywords: true,
  };
}

/**
 * REGRA 3: Gera lista de endpoints bloqueados para auditoria
 */
function getBlockedEndpoints(dataState: DataState): string[] {
  if (dataState === 'DADOS_LIBERADOS_SELLER') {
    return [];
  }
  return [
    'seller/performance',
    'seller/goals',
    'seller/comparison',
    'seller/alerts',
  ];
}

/**
 * Gera motivo de bloqueio para UX
 */
function getBlockReason(eligibilityState: EligibilityState): string | null {
  switch (eligibilityState) {
    case 'inactive':
      return 'Categoria sem histórico de vendas no período';
    case 'low_base':
      return 'Volume de vendas abaixo do mínimo para liberação de dados';
    case 'unknown':
      return 'Aguardando verificação de elegibilidade';
    default:
      return null;
  }
}

// ============================================================
// HOOK PRINCIPAL
// ============================================================

/**
 * Hook para verificar elegibilidade de categoria
 * IMPORTANTE: Este hook deve ser chamado ANTES de qualquer requisição seller-based
 */
export function useCategoryEligibility(
  sellerId: string | null,
  categoryId: string | null,
  periodDays: number = 30
) {
  const periodKey = `last_${periodDays}d`;

  return useQuery({
    queryKey: ['category-eligibility', sellerId, categoryId, periodKey],
    queryFn: async (): Promise<CategoryEligibility> => {
      const now = new Date();
      
      // Estado padrão para casos sem seller/categoria
      const createDefaultState = (state: EligibilityState): CategoryEligibility => {
        const dataState = determineDataState(state);
        return {
          eligibilityState: state,
          dataState,
          permissions: generatePermissions(dataState),
          ordersCount: 0,
          revenue: 0,
          unitsSold: 0,
          thresholdOrders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
          blockedUntil: null,
          blockReason: getBlockReason(state),
          calculatedAt: null,
          isExpired: true,
          auditLog: {
            categoryId,
            periodKey,
            eligibilityState: state,
            dataState,
            endpointsBlocked: getBlockedEndpoints(dataState),
            blockReason: getBlockReason(state),
            timestamp: now.toISOString(),
          },
        };
      };

      // Sem seller = desconhecido
      if (!sellerId) {
        return createDefaultState('unknown');
      }

      // Sem categoria = dados globais do seller (elegível para visão geral)
      if (!categoryId) {
        const dataState: DataState = 'DADOS_LIBERADOS_SELLER';
        return {
          eligibilityState: 'eligible',
          dataState,
          permissions: generatePermissions(dataState),
          ordersCount: 0,
          revenue: 0,
          unitsSold: 0,
          thresholdOrders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
          blockedUntil: null,
          blockReason: null,
          calculatedAt: now.toISOString(),
          isExpired: false,
          auditLog: {
            categoryId: null,
            periodKey,
            eligibilityState: 'eligible',
            dataState,
            endpointsBlocked: [],
            blockReason: null,
            timestamp: now.toISOString(),
          },
        };
      }

      // 1. Verificar cache existente (respeitando TTL de 24h)
      const { data: cached, error: cacheError } = await supabase
        .from('seller_category_eligibility')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('category_id', categoryId)
        .eq('period_key', periodKey)
        .maybeSingle();

      if (cacheError) {
        console.warn('[useCategoryEligibility] Cache read error:', cacheError);
      }

      const isExpired = !cached || new Date(cached.expires_at) < now;
      const isBlocked = cached?.blocked_until && new Date(cached.blocked_until) > now;

      // REGRA: Se bloqueado, NÃO recalcular - retorna do cache
      if (isBlocked && cached) {
        const eligState = cached.eligibility_state as EligibilityState;
        const dataState = determineDataState(eligState);
        
        console.log('[useCategoryEligibility] Categoria bloqueada, usando cache:', {
          categoryId,
          blockedUntil: cached.blocked_until,
          reason: cached.block_reason,
        });
        
        return {
          eligibilityState: eligState,
          dataState,
          permissions: generatePermissions(dataState),
          ordersCount: cached.orders_count,
          revenue: Number(cached.revenue),
          unitsSold: cached.units_sold,
          thresholdOrders: cached.threshold_orders,
          blockedUntil: cached.blocked_until,
          blockReason: cached.block_reason,
          calculatedAt: cached.calculated_at,
          isExpired: false,
          auditLog: {
            categoryId,
            periodKey,
            eligibilityState: eligState,
            dataState,
            endpointsBlocked: getBlockedEndpoints(dataState),
            blockReason: cached.block_reason,
            timestamp: now.toISOString(),
          },
        };
      }

      // Cache válido e não expirado - retorna
      if (!isExpired && cached) {
        const eligState = cached.eligibility_state as EligibilityState;
        const dataState = determineDataState(eligState);
        
        return {
          eligibilityState: eligState,
          dataState,
          permissions: generatePermissions(dataState),
          ordersCount: cached.orders_count,
          revenue: Number(cached.revenue),
          unitsSold: cached.units_sold,
          thresholdOrders: cached.threshold_orders,
          blockedUntil: cached.blocked_until,
          blockReason: cached.block_reason,
          calculatedAt: cached.calculated_at,
          isExpired: false,
          auditLog: {
            categoryId,
            periodKey,
            eligibilityState: eligState,
            dataState,
            endpointsBlocked: getBlockedEndpoints(dataState),
            blockReason: cached.block_reason,
            timestamp: now.toISOString(),
          },
        };
      }

      // 2. Recalcular usando função SQL
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) {
        return createDefaultState('unknown');
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
        return createDefaultState('unknown');
      }

      const result = calculated?.[0] || {
        eligibility_state: 'inactive',
        orders_count: 0,
        revenue: 0,
        units_sold: 0,
      };

      const eligState = result.eligibility_state as EligibilityState;
      const dataState = determineDataState(eligState);

      // 3. Salvar no cache
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + ELIGIBILITY_THRESHOLDS.CACHE_TTL_HOURS);

      const upsertData = {
        user_id: userId,
        seller_id: sellerId,
        category_id: categoryId,
        period_key: periodKey,
        eligibility_state: eligState,
        orders_count: result.orders_count,
        revenue: result.revenue,
        units_sold: result.units_sold,
        threshold_orders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
        calculated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      await supabase
        .from('seller_category_eligibility')
        .upsert(upsertData, {
          onConflict: 'seller_id,category_id,period_key',
        });

      // Log de auditoria (não-bloqueante)
      console.log('[useCategoryEligibility] Eligibility calculated:', {
        categoryId,
        eligibilityState: eligState,
        dataState,
        ordersCount: result.orders_count,
        blockedEndpoints: getBlockedEndpoints(dataState),
      });

      return {
        eligibilityState: eligState,
        dataState,
        permissions: generatePermissions(dataState),
        ordersCount: result.orders_count,
        revenue: Number(result.revenue),
        unitsSold: result.units_sold,
        thresholdOrders: ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE,
        blockedUntil: null,
        blockReason: getBlockReason(eligState),
        calculatedAt: now.toISOString(),
        isExpired: false,
        auditLog: {
          categoryId,
          periodKey,
          eligibilityState: eligState,
          dataState,
          endpointsBlocked: getBlockedEndpoints(dataState),
          blockReason: getBlockReason(eligState),
          timestamp: now.toISOString(),
        },
      };
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 30 * 60 * 1000, // 30 minutos
  });
}

// ============================================================
// HOOK PARA BLOQUEAR CATEGORIA APÓS FALHA DE API
// ============================================================

/**
 * REGRA 2: Ausência de dados não é erro
 * Este hook bloqueia a categoria por 24h após resposta vazia/indisponível
 */
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

      console.log('[useBlockCategory] Blocking category:', {
        sellerId,
        categoryId,
        reason,
        blockedUntil: blockedUntil.toISOString(),
      });

      const { error } = await supabase
        .from('seller_category_eligibility')
        .update({
          blocked_until: blockedUntil.toISOString(),
          block_reason: reason,
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

// ============================================================
// HOOKS AUXILIARES
// ============================================================

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
      return (data || []).map((row) => ({
        categoryId: row.category_id,
        eligibilityState: row.eligibility_state as EligibilityState,
        dataState: determineDataState(row.eligibility_state as EligibilityState),
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

// ============================================================
// UTILITÁRIOS PARA COMPONENTES
// ============================================================

/**
 * Verifica se deve chamar endpoint seller-based
 * REGRA 1: Nunca começar pela API seller-based sem verificar primeiro
 */
export function shouldCallSellerEndpoint(eligibility: CategoryEligibility | undefined): boolean {
  if (!eligibility) return false;
  return eligibility.dataState === 'DADOS_LIBERADOS_SELLER';
}

/**
 * Verifica permissão específica
 */
export function hasPermission(
  eligibility: CategoryEligibility | undefined,
  permission: keyof DataPermissions
): boolean {
  if (!eligibility) return false;
  return eligibility.permissions[permission];
}

/**
 * Retorna estado de dados para renderização condicional
 */
export function getDataState(eligibility: CategoryEligibility | undefined): DataState {
  if (!eligibility) return 'DADOS_PUBLICOS_MERCADO';
  return eligibility.dataState;
}

// ============================================================
// TEXTOS PARA UX
// ============================================================

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
