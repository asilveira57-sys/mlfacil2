import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTrends, CapabilityReason, SectionErrorType } from '@/contexts/TrendsContext';
import { useCategoryEligibility } from '@/hooks/useCategoryEligibility';
import { useMarketTrends, useMarketHighlights } from '@/hooks/useTrendsApi';
import { toast } from 'sonner';

// ============================================================
// CONTROLLER CENTRAL
// Todas as chamadas de API acontecem exclusivamente aqui.
// Componentes NUNCA fazem fetch direto.
// ============================================================

interface ControllerOptions {
  onCapabilitiesChecked?: (canUseSellerInsights: boolean, reason: CapabilityReason) => void;
}

export function useTrendsController(options: ControllerOptions = {}) {
  const queryClient = useQueryClient();
  const {
    state,
    setCapabilities,
    setMarketData,
    setSellerData,
    setSectionLoading,
    setSectionEmpty,
    setSectionError,
    markUpdated,
    clearSellerData,
    effectiveCategoryId,
    hasSeller,
    hasCategory,
  } = useTrends();
  
  const lastNonceRef = useRef(state.ui.requestNonce);
  const isRefreshing = useRef(false);
  
  // ============================================================
  // STEP 1: CHECK CAPABILITIES
  // Executado ANTES de qualquer requisição seller-based
  // ============================================================
  
  const { data: eligibility, isLoading: eligibilityLoading } = useCategoryEligibility(
    state.selectedAccountId,
    state.selectedCategoryId,
    state.selectedPeriod
  );
  
  // Update capabilities when eligibility changes
  useEffect(() => {
    if (eligibilityLoading) {
      setSectionLoading('status', true);
      return;
    }
    
    setSectionLoading('status', false);
    
    // Determine capabilities
    let canUseSellerInsights = false;
    let reason: CapabilityReason = 'OK';
    
    if (!state.selectedAccountId) {
      reason = 'NO_ACCOUNT';
    } else if (!state.selectedCategoryId) {
      reason = 'NO_CATEGORY';
    } else if (!eligibility) {
      reason = 'NO_HISTORY';
    } else if (eligibility.eligibilityState === 'eligible') {
      canUseSellerInsights = true;
      reason = 'OK';
    } else if (eligibility.eligibilityState === 'low_base') {
      reason = 'INSUFFICIENT_CATEGORY_SALES';
    } else if (eligibility.eligibilityState === 'inactive') {
      reason = 'NO_HISTORY';
    } else {
      reason = 'NO_HISTORY';
    }
    
    setCapabilities({ canUseSellerInsights, reason });
    options.onCapabilitiesChecked?.(canUseSellerInsights, reason);
    
    // REGRA: Se não pode usar seller insights, limpar dados
    if (!canUseSellerInsights) {
      clearSellerData();
    }
  }, [
    eligibility,
    eligibilityLoading,
    state.selectedAccountId,
    state.selectedCategoryId,
    setCapabilities,
    setSectionLoading,
    clearSellerData,
    options,
  ]);
  
  // ============================================================
  // STEP 2: FETCH MARKET DATA (ALWAYS ALLOWED)
  // ============================================================
  
  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
  } = useMarketTrends('MLB', effectiveCategoryId || undefined);
  
  const {
    data: highlights,
    isLoading: highlightsLoading,
    error: highlightsError,
    refetch: refetchHighlights,
  } = useMarketHighlights('MLB', effectiveCategoryId || undefined);
  
  // Update market data in state
  useEffect(() => {
    // Loading flags
    setSectionLoading('marketTrends', trendsLoading);
    setSectionLoading('keywords', trendsLoading);
    setSectionLoading('bestSellers', highlightsLoading);
    
    // Process trends
    if (!trendsLoading && trends) {
      const marketTrends = trends.trends || [];
      const keywords = (trends.keywords || trends.trends || []).map((k) => ({
        keyword: k.keyword,
        url: k.url,
        funnel: classifyKeywordFunnel(k.keyword),
        trend: 'stable' as const,
      }));
      
      setMarketData({ marketTrends, keywords });
      setSectionEmpty('marketTrends', marketTrends.length === 0);
      setSectionEmpty('keywords', keywords.length === 0);
    }
    
    // Process highlights
    if (!highlightsLoading && highlights) {
      const bestSellers = (highlights.items || []).slice(0, 10);
      setMarketData({ bestSellers });
      setSectionEmpty('bestSellers', bestSellers.length === 0);
    }
    
    // Handle errors - REGRA: NÃO retry automaticamente
    if (trendsError) {
      const errorType = classifyError(trendsError);
      setSectionError('marketTrends', errorType);
      setSectionError('keywords', errorType);
    }
    
    if (highlightsError) {
      const errorType = classifyError(highlightsError);
      setSectionError('bestSellers', errorType);
    }
    
    // Mark as updated
    if (!trendsLoading && !highlightsLoading && (trends || highlights)) {
      markUpdated();
    }
  }, [
    trends,
    highlights,
    trendsLoading,
    highlightsLoading,
    trendsError,
    highlightsError,
    setMarketData,
    setSectionLoading,
    setSectionEmpty,
    setSectionError,
    markUpdated,
  ]);
  
  // ============================================================
  // STEP 3: FETCH SELLER DATA (CONDITIONAL)
  // REGRA: Só executa se canUseSellerInsights = true
  // ============================================================
  
  useEffect(() => {
    // BLOQUEIO: Não buscar dados seller se não permitido
    if (!state.capabilities.canUseSellerInsights) {
      setSectionLoading('sellerSubcategories', false);
      setSectionLoading('sellerGoals', false);
      setSectionEmpty('sellerSubcategories', false);
      setSectionEmpty('sellerGoals', false);
      return;
    }
    
    // Se permitido e temos elegibilidade, use os dados
    if (eligibility && eligibility.eligibilityState === 'eligible') {
      setSellerData({
        sellerGoals: {
          ordersCount: eligibility.ordersCount,
          revenue: eligibility.revenue,
          unitsSold: eligibility.unitsSold,
          averageTicket: eligibility.ordersCount > 0 
            ? eligibility.revenue / eligibility.ordersCount 
            : 0,
        },
      });
      setSectionEmpty('sellerGoals', eligibility.ordersCount === 0);
    }
  }, [
    state.capabilities.canUseSellerInsights,
    eligibility,
    setSellerData,
    setSectionLoading,
    setSectionEmpty,
  ]);
  
  // ============================================================
  // FETCH SUBCATEGORIES (MARKET - ALWAYS ALLOWED)
  // ============================================================
  
  useEffect(() => {
    const fetchSubcategories = async () => {
      if (!effectiveCategoryId) {
        setSectionEmpty('marketSubcategories', true);
        return;
      }
      
      setSectionLoading('marketSubcategories', true);
      
      try {
        const { data, error } = await supabase
          .from('category_tree_cache')
          .select('id, name, total_items_qty')
          .eq('parent_id', effectiveCategoryId)
          .limit(20);
        
        if (error) throw error;
        
        const subcategories = (data || []).map((s) => ({
          id: s.id,
          name: s.name,
          itemsCount: s.total_items_qty || 0,
        }));
        
        setMarketData({ marketSubcategories: subcategories });
        setSectionEmpty('marketSubcategories', subcategories.length === 0);
      } catch (err) {
        console.error('[TrendsController] Error fetching subcategories:', err);
        setSectionError('marketSubcategories', 'TEMP_UNAVAILABLE');
      } finally {
        setSectionLoading('marketSubcategories', false);
      }
    };
    
    fetchSubcategories();
  }, [effectiveCategoryId, setMarketData, setSectionLoading, setSectionEmpty, setSectionError]);
  
  // ============================================================
  // MANUAL ACTIONS
  // ============================================================
  
  /**
   * Collect public data - triggers edge function
   * REGRA: Sem retentativa automática
   */
  const collectPublicData = useCallback(async () => {
    if (!effectiveCategoryId) return;
    
    try {
      const { error } = await supabase.functions.invoke('trends-collect-public', {
        body: {
          site_id: 'MLB',
          category_id: effectiveCategoryId,
          collect_type: 'all',
        },
      });
      
      if (error) throw error;
      
      toast.success('Coleta iniciada. Aguarde alguns segundos.');
      
      // Single poll attempt after 5 seconds - NO AUTOMATIC RETRY
      setTimeout(() => {
        refetchHighlights();
      }, 5000);
    } catch (err) {
      console.error('[TrendsController] Error collecting data:', err);
      toast.error('Erro ao coletar dados. Tente novamente manualmente.');
    }
  }, [effectiveCategoryId, refetchHighlights]);
  
  /**
   * Manual reload - invalidates all queries
   * REGRA: Ação única, sem loop
   */
  const reload = useCallback(() => {
    if (isRefreshing.current) return;
    
    isRefreshing.current = true;
    
    queryClient.invalidateQueries({ queryKey: ['trends'] });
    queryClient.invalidateQueries({ queryKey: ['market-trends'] });
    queryClient.invalidateQueries({ queryKey: ['market-highlights'] });
    queryClient.invalidateQueries({ queryKey: ['category-eligibility'] });
    
    markUpdated();
    toast.success('Dados recarregados');
    
    setTimeout(() => {
      isRefreshing.current = false;
    }, 2000);
  }, [queryClient, markUpdated]);
  
  // Watch for refresh trigger
  useEffect(() => {
    if (state.ui.requestNonce > lastNonceRef.current) {
      lastNonceRef.current = state.ui.requestNonce;
      reload();
    }
  }, [state.ui.requestNonce, reload]);
  
  // ============================================================
  // RETURN
  // ============================================================
  
  return {
    // State
    eligibility,
    isLoading: trendsLoading || highlightsLoading || eligibilityLoading,
    snapshotDate: trends?.snapshot_date || highlights?.snapshot_date || null,
    
    // Actions
    collectPublicData,
    reload,
    refetchHighlights,
  };
}

// ============================================================
// UTILITIES
// ============================================================

function classifyKeywordFunnel(keyword: string): 'topo' | 'meio' | 'fundo' {
  const lower = keyword.toLowerCase();
  
  // Fundo de funil - termos de compra
  if (
    lower.includes('comprar') ||
    lower.includes('preço') ||
    lower.includes('barato') ||
    lower.includes('frete grátis') ||
    lower.includes('promoção')
  ) {
    return 'fundo';
  }
  
  // Meio de funil - termos de comparação
  if (
    lower.includes('melhor') ||
    lower.includes('vs') ||
    lower.includes('comparar') ||
    lower.includes('qual') ||
    lower.includes('diferença')
  ) {
    return 'meio';
  }
  
  // Topo de funil - termos gerais
  return 'topo';
}

function classifyError(error: unknown): SectionErrorType {
  if (!error) return null;
  
  const message = error instanceof Error ? error.message : String(error);
  
  if (message.includes('403') || message.includes('Forbidden')) {
    return 'FORBIDDEN';
  }
  
  if (message.includes('429') || message.includes('rate') || message.includes('limit')) {
    return 'RATE_LIMIT';
  }
  
  return 'TEMP_UNAVAILABLE';
}
