import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  TrendsFiltersBar,
  TrendsOverviewCards,
  TrendsKeywordsCard,
  TrendsBestSellersCard,
  TrendsStatusBanner,
} from '@/components/trends-v2';

import {
  useLastCategory,
  useMarketTrendsCached,
  useHighlightsCached,
  useEligibilityCached,
  useTrendsRefresh,
} from '@/hooks/useTrendsDataCache';

import { useSellerCategories } from '@/hooks/useSellerCategories';

// ============================================================
// TENDENCIAS PAGE V2
// 
// Rules:
// - NO fullscreen overlays for loading
// - Cache-first: render instantly from cache, refresh in background
// - Dropdowns don't block sidebar (no portal in body)
// - 90 days option only when hasHistory=true
// - Loading is LOCAL (inside cards only)
// ============================================================

// Fallback categories for market exploration
const FALLBACK_CATEGORIES = [
  { id: 'MLB5672', name: 'Acessórios para Veículos' },
  { id: 'MLB1367', name: 'Antiguidades e Coleções' },
  { id: 'MLB1384', name: 'Bebês' },
  { id: 'MLB1246', name: 'Beleza e Cuidado Pessoal' },
  { id: 'MLB1132', name: 'Brinquedos e Hobbies' },
  { id: 'MLB1039', name: 'Câmeras e Acessórios' },
  { id: 'MLB1574', name: 'Casa, Móveis e Decoração' },
  { id: 'MLB1051', name: 'Celulares e Telefones' },
  { id: 'MLB1648', name: 'Computadores' },
  { id: 'MLB1500', name: 'Construção' },
  { id: 'MLB1144', name: 'Eletrodomésticos' },
  { id: 'MLB1000', name: 'Eletrônicos' },
  { id: 'MLB1276', name: 'Esportes e Fitness' },
  { id: 'MLB263532', name: 'Ferramentas' },
  { id: 'MLB1499', name: 'Indústria e Comércio' },
  { id: 'MLB1182', name: 'Instrumentos Musicais' },
  { id: 'MLB3937', name: 'Joias e Relógios' },
  { id: 'MLB1196', name: 'Livros, Revistas e Comics' },
  { id: 'MLB1168', name: 'Música, Filmes e Seriados' },
  { id: 'MLB1430', name: 'Roupas e Acessórios' },
  { id: 'MLB264586', name: 'Saúde' },
];

interface MlAccount {
  id: string;
  ml_user_id: string;
  nickname: string | null;
}

export default function TendenciasV2() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lastCategoryStore = useLastCategory();
  const refreshCache = useTrendsRefresh();
  
  // ============================================================
  // LOCAL STATE
  // ============================================================
  
  const [accounts, setAccounts] = useState<MlAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('Selecionar categoria');
  const [selectedPeriod, setSelectedPeriod] = useState<number>(30);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // ============================================================
  // DATA HOOKS (cache-first)
  // ============================================================
  
  const { data: sellerCategories, isLoading: categoriesLoading } = useSellerCategories(selectedAccountId);
  
  const { data: marketTrends, isLoading: trendsLoading } = useMarketTrendsCached(
    'MLB',
    selectedCategoryId
  );
  
  const { data: highlights, isLoading: highlightsLoading } = useHighlightsCached(
    'MLB',
    selectedCategoryId
  );
  
  const { data: eligibility, isLoading: eligibilityLoading } = useEligibilityCached(
    selectedAccountId,
    selectedCategoryId,
    selectedPeriod
  );
  
  // ============================================================
  // COMPUTED VALUES
  // ============================================================
  
  const hasCategory = !!selectedCategoryId;
  const hasSeller = !!selectedAccountId;
  
  const eligibilityStatus = useMemo(() => {
    if (!eligibility) return 'unknown' as const;
    return eligibility.eligibilityState as 'eligible' | 'low_base' | 'inactive' | 'unknown';
  }, [eligibility]);
  
  const hasHistory = useMemo(() => {
    return eligibility?.hasHistory || (sellerCategories && sellerCategories.length > 0);
  }, [eligibility, sellerCategories]);
  
  const sellerKpis = useMemo(() => {
    if (eligibilityStatus !== 'eligible' || !eligibility) return null;
    return {
      ordersCount: eligibility.ordersCount,
      unitsSold: eligibility.ordersCount, // Approximation
      revenue: eligibility.revenue,
      averageTicket: eligibility.ordersCount > 0 
        ? eligibility.revenue / eligibility.ordersCount 
        : 0,
    };
  }, [eligibility, eligibilityStatus]);
  
  const formattedSellerCategories = useMemo(() => {
    if (!sellerCategories) return [];
    return sellerCategories.map(cat => ({
      category_id: cat.category_id,
      category_name: cat.category_name,
      orders_count_90d: cat.orders_count_90d || 0,
      gmv_90d: cat.gmv_90d || 0,
      is_pinned_auto: cat.is_pinned_auto || false,
      category_path: cat.category_path || [cat.category_name],
    }));
  }, [sellerCategories]);
  
  // ============================================================
  // INITIALIZATION
  // ============================================================
  
  // Load accounts on mount
  useEffect(() => {
    const loadAccounts = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data } = await supabase
        .from('ml_accounts')
        .select('id, ml_user_id, nickname')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      if (data && data.length > 0) {
        setAccounts(data);
        setSelectedAccountId(data[0].ml_user_id);
      }
      
      setIsInitialized(true);
    };
    
    loadAccounts();
  }, [navigate]);
  
  // Auto-select category based on last selection or best seller category
  useEffect(() => {
    if (!selectedAccountId || !isInitialized) return;
    if (selectedCategoryId) return; // Already has selection
    
    // 1. Try last selected category
    const lastCategory = lastCategoryStore.get(selectedAccountId);
    if (lastCategory) {
      setSelectedCategoryId(lastCategory.id);
      setSelectedCategoryName(lastCategory.name);
      return;
    }
    
    // 2. Try best seller category
    if (sellerCategories && sellerCategories.length > 0) {
      const pinnedCat = sellerCategories.find(c => c.is_pinned_auto);
      const bestCat = pinnedCat || sellerCategories[0];
      setSelectedCategoryId(bestCat.category_id);
      setSelectedCategoryName(bestCat.category_name);
      return;
    }
    
    // 3. Fallback to first category
    if (FALLBACK_CATEGORIES.length > 0 && !categoriesLoading) {
      setSelectedCategoryId(FALLBACK_CATEGORIES[0].id);
      setSelectedCategoryName(FALLBACK_CATEGORIES[0].name);
    }
  }, [
    selectedAccountId, 
    isInitialized, 
    selectedCategoryId, 
    sellerCategories, 
    categoriesLoading, 
    lastCategoryStore
  ]);
  
  // ============================================================
  // HANDLERS
  // ============================================================
  
  const handleAccountChange = useCallback((accountId: string | null) => {
    setSelectedAccountId(accountId);
    setSelectedCategoryId(null);
    setSelectedCategoryName('Selecionar categoria');
    setSelectedKeyword(null);
  }, []);
  
  const handleCategoryChange = useCallback((categoryId: string | null, categoryName: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedCategoryName(categoryName);
    setSelectedKeyword(null);
    
    // Persist selection
    if (categoryId && selectedAccountId) {
      lastCategoryStore.set(selectedAccountId, categoryId, categoryName);
    }
  }, [selectedAccountId, lastCategoryStore]);
  
  const handlePeriodChange = useCallback((period: number) => {
    setSelectedPeriod(period);
  }, []);
  
  const handleKeywordSelect = useCallback((keyword: string | null) => {
    setSelectedKeyword(keyword);
  }, []);
  
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshCache();
    toast.success('Atualizando dados...');
    
    setTimeout(() => {
      setIsRefreshing(false);
    }, 2000);
  }, [refreshCache]);
  
  // ============================================================
  // RENDER
  // ============================================================
  
  // Initial loading - just show layout with empty state
  // NO fullscreen overlay, NO blocking loading
  
  return (
    <DashboardLayout
      title="Tendências de Mercado"
      subtitle="Análise baseada em dados públicos do Mercado Livre"
    >
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters Bar */}
        <TrendsFiltersBar
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onAccountChange={handleAccountChange}
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
          hasHistory={hasHistory}
          selectedCategoryId={selectedCategoryId}
          selectedCategoryName={selectedCategoryName}
          sellerCategories={formattedSellerCategories}
          fallbackCategories={FALLBACK_CATEGORIES}
          onCategoryChange={handleCategoryChange}
          categoriesLoading={categoriesLoading}
          eligibilityStatus={eligibilityStatus}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
        
        {/* Status Banner */}
        <TrendsStatusBanner
          eligibilityStatus={eligibilityStatus}
          hasCategory={hasCategory}
          hasSeller={hasSeller}
          ordersCount={eligibility?.ordersCount || 0}
          isLoading={eligibilityLoading && hasCategory}
          lastUpdate={marketTrends?.snapshotDate || null}
        />
        
        {/* Overview Cards (KPIs) */}
        <TrendsOverviewCards
          hasCategory={hasCategory}
          eligibilityStatus={eligibilityStatus}
          ordersCount={eligibility?.ordersCount || 0}
          trendsCount={marketTrends?.trends.length || 0}
          highlightsCount={highlights?.items.length || 0}
          sellerKpis={sellerKpis}
          isLoadingEligibility={eligibilityLoading}
          isLoadingTrends={trendsLoading}
          isLoadingHighlights={highlightsLoading}
        />
        
        {/* Market Trends (Keywords) */}
        <TrendsKeywordsCard
          trends={marketTrends?.trends || []}
          isLoading={trendsLoading}
          snapshotDate={marketTrends?.snapshotDate || null}
          selectedKeyword={selectedKeyword}
          onKeywordSelect={handleKeywordSelect}
        />
        
        {/* Best Sellers Table */}
        <TrendsBestSellersCard
          items={highlights?.items || []}
          isLoading={highlightsLoading}
          snapshotDate={highlights?.snapshotDate || null}
          categoryName={selectedCategoryName}
          selectedKeyword={selectedKeyword}
        />
      </div>
    </DashboardLayout>
  );
}
