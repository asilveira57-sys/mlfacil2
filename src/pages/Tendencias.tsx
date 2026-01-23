import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  TrendingUp, 
  ArrowLeft, 
  FolderTree, 
  ChevronDown, 
  ChevronUp,
  Clock,
  RefreshCw,
  User
} from 'lucide-react';
import { useMarketTrends, useMarketHighlights } from '@/hooks/useTrendsApi';
import { useTrendsStatus } from '@/hooks/useTrendsStatus';
import { useCategoryEligibility, EligibilityState } from '@/hooks/useCategoryEligibility';
import { useCategoryBreadcrumb } from '@/hooks/useSubcategories';
import { SubcategoryNavigator } from '@/components/trends/SubcategoryNavigator';

// New architecture components
import { CategoriaStatusCard } from '@/components/trends/CategoriaStatusCard';
import { MarketOverviewCard } from '@/components/trends/MarketOverviewCard';
import { TrendingSubcategoriesGrid } from '@/components/trends/TrendingSubcategoriesGrid';
import { TrendingKeywordsTable } from '@/components/trends/TrendingKeywordsTable';
import { TopSellingProductsList } from '@/components/trends/TopSellingProductsList';
import { SellerPerformanceSection } from '@/components/trends/SellerPerformanceSection';
import { StrategyRecommendationsSection } from '@/components/trends/StrategyRecommendationsSection';

import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

// ============================================================
// CATEGORIES LIST
// ============================================================
const CATEGORIES = [
  { id: 'MLB5672', label: 'Acessórios para Veículos' },
  { id: 'MLB1367', label: 'Antiguidades e Coleções' },
  { id: 'MLB1375', label: 'Artigos para Fumadores' },
  { id: 'MLB1384', label: 'Bebês' },
  { id: 'MLB1246', label: 'Beleza e Cuidado Pessoal' },
  { id: 'MLB1132', label: 'Brinquedos e Hobbies' },
  { id: 'MLB1039', label: 'Câmeras e Acessórios' },
  { id: 'MLB1574', label: 'Casa, Móveis e Decoração' },
  { id: 'MLB1051', label: 'Celulares e Telefones' },
  { id: 'MLB1648', label: 'Computadores' },
  { id: 'MLB1500', label: 'Construção' },
  { id: 'MLB1144', label: 'Eletrodomésticos' },
  { id: 'MLB1000', label: 'Eletrônicos' },
  { id: 'MLB1276', label: 'Esportes e Fitness' },
  { id: 'MLB263532', label: 'Ferramentas' },
  { id: 'MLB1499', label: 'Indústria e Comércio' },
  { id: 'MLB1182', label: 'Instrumentos Musicais' },
  { id: 'MLB3937', label: 'Joias e Relógios' },
  { id: 'MLB1196', label: 'Livros, Revistas e Comics' },
  { id: 'MLB1168', label: 'Música, Filmes e Seriados' },
  { id: 'MLB1430', label: 'Roupas e Acessórios' },
  { id: 'MLB264586', label: 'Saúde' },
];

// ============================================================
// ELIGIBILITY BADGE COMPONENT
// ============================================================
function EligibilityBadge({ state }: { state: EligibilityState }) {
  const config = {
    eligible: { 
      label: 'Elegível', 
      className: 'bg-green-500/10 text-green-600 border-green-500/30' 
    },
    low_base: { 
      label: 'Pouca base', 
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' 
    },
    inactive: { 
      label: 'Sem vendas', 
      className: 'bg-muted text-muted-foreground' 
    },
    unknown: { 
      label: '', 
      className: '' 
    },
    loading: { 
      label: '...', 
      className: 'bg-muted text-muted-foreground animate-pulse' 
    },
  };
  
  const { label, className } = config[state];
  
  if (!label) return null;
  
  return (
    <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}

// ============================================================
// ML ACCOUNT INTERFACE
// ============================================================
interface MlAccount {
  id: string;
  ml_user_id: string;
  nickname: string | null;
}

// ============================================================
// MAIN PAGE COMPONENT
// Nome: TendenciasCategoriaPage
// Responsabilidade: orquestrar estado, decidir o que pode ou não ser chamado na API
// ============================================================
export default function Tendencias() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // ============================================================
  // ESTADOS GLOBAIS
  // ============================================================
  
  // Account state
  const [accounts, setAccounts] = useState<MlAccount[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  
  // Category state
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string>('Selecionar Categoria');
  const [showNavigator, setShowNavigator] = useState(false);
  
  // Period state
  const [periodDays, setPeriodDays] = useState<number>(30);
  
  // UI states
  const [isCollecting, setIsCollecting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // ============================================================
  // AUTH CHECK AND LOAD ACCOUNTS
  // ============================================================
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data: mlAccounts } = await supabase
        .from('ml_accounts')
        .select('id, ml_user_id, nickname')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      if (mlAccounts && mlAccounts.length > 0) {
        setAccounts(mlAccounts);
        setSelectedSellerId(mlAccounts[0].ml_user_id);
      }
    };

    checkAuth();
  }, [navigate]);

  // ============================================================
  // DATA HOOKS - MARKET DATA (ALWAYS AVAILABLE)
  // ============================================================
  const { data: trendsStatus } = useTrendsStatus();
  const { data: breadcrumb } = useCategoryBreadcrumb(subcategoryId || categoryId);
  
  // Market data - never depends on seller eligibility
  const { data: trends, isLoading: trendsLoading } = useMarketTrends('MLB', subcategoryId || categoryId || undefined);
  const { data: highlights, isLoading: highlightsLoading, refetch: refetchHighlights } = useMarketHighlights('MLB', subcategoryId || categoryId || undefined);
  
  // ============================================================
  // ELIGIBILITY - RULE 1: CHECK BEFORE ANY SELLER API CALL
  // ============================================================
  const { data: eligibility, isLoading: eligibilityLoading } = useCategoryEligibility(
    selectedSellerId,
    categoryId,
    periodDays
  );

  // ============================================================
  // DERIVED STATE (REGRA-MÃE)
  // Se categoriaStatus !== ELEGIVEL → bloquear qualquer chamada seller-based
  // ============================================================
  const categoriaStatus = eligibility?.eligibilityState || 'unknown';
  const dataState = eligibility?.dataState || 'DADOS_PUBLICOS_MERCADO';
  const hasSeller = !!selectedSellerId;
  const hasCategory = !!categoryId;
  const isLoading = trendsLoading || highlightsLoading || (eligibilityLoading && hasCategory);
  
  // Market data
  const keywords = trends?.trends || [];
  const topSellers = highlights?.items || [];

  // ============================================================
  // HANDLERS
  // ============================================================
  
  // Transform categories for navigator
  const navigatorCategories = CATEGORIES.map(c => ({
    id: c.id,
    name: c.label,
  }));

  const handleCategorySelect = useCallback((id: string, name: string) => {
    // If selecting a subcategory, track both
    if (categoryId && id !== categoryId) {
      setSubcategoryId(id);
    } else {
      setCategoryId(id || null);
      setSubcategoryId(null);
    }
    setCategoryName(name);
    setShowNavigator(false);
  }, [categoryId]);

  const handleBreadcrumbClick = useCallback((id: string) => {
    const item = breadcrumb?.find(b => b.id === id);
    if (item) {
      // Reset to clicked level
      setCategoryId(id);
      setSubcategoryId(null);
      setCategoryName(item.name);
    }
  }, [breadcrumb]);

  const handleCollectData = useCallback(async () => {
    const targetCategoryId = subcategoryId || categoryId;
    if (!targetCategoryId) return;
    
    setIsCollecting(true);
    try {
      const { error } = await supabase.functions.invoke('trends-collect-public', {
        body: {
          site_id: 'MLB',
          category_id: targetCategoryId,
          collect_type: 'all'
        }
      });
      
      if (error) throw error;
      
      toast.success('Coleta iniciada! Aguarde alguns segundos.');
      
      // Polling for updates - NO AUTOMATIC RETRY
      let attempts = 0;
      const maxAttempts = 10;
      const pollInterval = setInterval(() => {
        attempts++;
        refetchHighlights();
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setIsCollecting(false);
        }
      }, 3000);
      
    } catch (err) {
      console.error('Error collecting data:', err);
      toast.error('Erro ao coletar dados');
      setIsCollecting(false);
    }
  }, [categoryId, subcategoryId, refetchHighlights]);

  const handleReload = useCallback(() => {
    setIsReloading(true);
    queryClient.invalidateQueries({ queryKey: ['trends'] });
    queryClient.invalidateQueries({ queryKey: ['market-trends'] });
    queryClient.invalidateQueries({ queryKey: ['market-highlights'] });
    queryClient.invalidateQueries({ queryKey: ['category-eligibility'] });
    
    setTimeout(() => setIsReloading(false), 2000);
    toast.success('Dados recarregados');
  }, [queryClient]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-background flex flex-col">
      
      {/* ============================================================ */}
      {/* TOPO FIXO */}
      {/* ============================================================ */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <TrendingUp className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">Tendências de Mercado</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Análise baseada em dados públicos do Mercado Livre e, quando disponível, no seu histórico de vendas
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Controls Row */}
        <div className="border-t bg-muted/30">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              
              {/* Account Selector */}
              <Select 
                value={selectedSellerId || 'none'} 
                onValueChange={(v) => setSelectedSellerId(v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <User className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Selecionar conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length === 0 ? (
                    <SelectItem value="none" disabled>Nenhuma conta</SelectItem>
                  ) : (
                    accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.ml_user_id}>
                        {acc.nickname || acc.ml_user_id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {/* Period Selector */}
              <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
                <SelectTrigger className="w-[150px]">
                  <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>

              {/* Category Selector with Eligibility Badge */}
              <Collapsible open={showNavigator} onOpenChange={setShowNavigator}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-[280px] justify-between">
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{categoryName}</span>
                      {hasCategory && <EligibilityBadge state={categoriaStatus} />}
                    </div>
                    {showNavigator ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="absolute z-50 mt-2 w-[320px]">
                  <SubcategoryNavigator
                    categories={navigatorCategories}
                    selectedId={subcategoryId || categoryId}
                    onSelect={handleCategorySelect}
                    breadcrumb={breadcrumb}
                    onBreadcrumbClick={handleBreadcrumbClick}
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Reload Button - Single action, no loop */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleReload}
                disabled={isReloading}
                className="ml-auto"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isReloading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* MAIN CONTENT - ORDEM DE CARREGAMENTO (CRÍTICO) */}
      {/* ============================================================ */}
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        
        {/* 1. CategoriaStatusCard - Sempre renderiza primeiro */}
        <CategoriaStatusCard
          categoriaStatus={categoriaStatus}
          periodo={periodDays}
          categoriaNome={categoryName}
          hasCategory={hasCategory}
          ordersCount={eligibility?.ordersCount}
          revenue={eligibility?.revenue}
          isLoading={eligibilityLoading && hasCategory}
        />

        {/* 2. MarketOverviewCard - Sempre disponível */}
        <MarketOverviewCard
          categoryId={subcategoryId || categoryId}
          categoryName={categoryName}
          trendsCount={keywords.length}
          highlightsCount={topSellers.length}
          snapshotDate={trends?.snapshot_date || highlights?.snapshot_date}
          isLoading={isLoading}
        />

        {/* 3. TrendingSubcategoriesGrid - Nunca cruza com dados do seller */}
        <TrendingSubcategoriesGrid
          categoryId={subcategoryId || categoryId}
          periodo={periodDays}
          onSubcategoryClick={handleCategorySelect}
        />

        {/* 4. TrendingKeywordsTable - Proteção: debounce + cache 24h */}
        <TrendingKeywordsTable
          categoryId={subcategoryId || categoryId}
          periodo={periodDays}
          keywords={keywords}
          isLoading={trendsLoading}
          snapshotDate={trends?.snapshot_date}
          categoryLabel={categoryName}
        />

        {/* 5. TopSellingProductsList - Ranking público */}
        <TopSellingProductsList
          categoryId={subcategoryId || categoryId}
          subcategoryId={subcategoryId}
          items={topSellers}
          isLoading={highlightsLoading}
          snapshotDate={highlights?.snapshot_date}
          categoryLabel={categoryName}
          onCollect={handleCollectData}
          isCollecting={isCollecting}
        />

        {/* 6. SellerPerformanceSection - CONDICIONAL */}
        <SellerPerformanceSection
          categoriaStatus={categoriaStatus}
          categoryId={categoryId}
          periodo={periodDays}
          eligibility={eligibility}
          isLoading={eligibilityLoading}
          sellerId={selectedSellerId}
        />

        {/* 7. StrategyRecommendationsSection - CONDICIONAL */}
        <StrategyRecommendationsSection
          categoriaStatus={categoriaStatus}
          categoryId={categoryId}
          categoryName={categoryName}
          eligibility={eligibility}
          isLoading={eligibilityLoading}
        />

      </main>

      {/* ============================================================ */}
      {/* FOOTER */}
      {/* ============================================================ */}
      <footer className="border-t bg-muted/30 py-3">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Fonte: Dados Públicos do Mercado Livre
              {categoriaStatus === 'eligible' && ' + Histórico do Seller'}
            </span>
            <span>
              Última atualização: {trendsStatus?.last_success_at 
                ? new Date(trendsStatus.last_success_at).toLocaleString('pt-BR')
                : 'N/A'
              }
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
