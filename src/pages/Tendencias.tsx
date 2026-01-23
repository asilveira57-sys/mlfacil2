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
import { useCategoryEligibility } from '@/hooks/useCategoryEligibility';
import { useCategoryBreadcrumb } from '@/hooks/useSubcategories';
import { SubcategoryNavigator } from '@/components/trends/SubcategoryNavigator';
import { StatusBanner } from '@/components/trends/StatusBanner';
import { KPICards } from '@/components/trends/KPICards';
import { TrendsKeywordsSection } from '@/components/trends/TrendsKeywordsSection';
import { TopSellersRankingSection } from '@/components/trends/TopSellersRankingSection';
import { SubcategoriesSection } from '@/components/trends/SubcategoriesSection';
import { SellerGoalsSection } from '@/components/trends/SellerGoalsSection';
import { TechnicalFooter } from '@/components/trends/TechnicalFooter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

// Categories list
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

interface MlAccount {
  id: string;
  ml_user_id: string;
  nickname: string | null;
}

export default function Tendencias() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Account state
  const [accounts, setAccounts] = useState<MlAccount[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  
  // Category state
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string>('Selecionar Categoria');
  const [showNavigator, setShowNavigator] = useState(false);
  
  // Period state
  const [periodDays, setPeriodDays] = useState<number>(30);
  
  // Collection state
  const [isCollecting, setIsCollecting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // Auth check and load accounts
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

  // Data hooks - Market data (always fetched)
  const { data: trendsStatus } = useTrendsStatus();
  const { data: breadcrumb } = useCategoryBreadcrumb(categoryId);
  const { data: trends, isLoading: trendsLoading } = useMarketTrends('MLB', categoryId || undefined);
  const { data: highlights, isLoading: highlightsLoading, refetch: refetchHighlights } = useMarketHighlights('MLB', categoryId || undefined);
  
  // Eligibility - RULE 1: Check BEFORE any seller API call
  const { data: eligibility, isLoading: eligibilityLoading } = useCategoryEligibility(
    selectedSellerId,
    categoryId,
    periodDays
  );

  // Transform categories for navigator
  const navigatorCategories = CATEGORIES.map(c => ({
    id: c.id,
    name: c.label,
  }));

  // Handlers
  const handleCategorySelect = useCallback((id: string, name: string) => {
    setCategoryId(id || null);
    setCategoryName(name);
    setShowNavigator(false);
  }, []);

  const handleBreadcrumbClick = useCallback((id: string) => {
    const item = breadcrumb?.find(b => b.id === id);
    if (item) {
      setCategoryId(id);
      setCategoryName(item.name);
    }
  }, [breadcrumb]);

  const handleCollectData = useCallback(async () => {
    if (!categoryId) return;
    
    setIsCollecting(true);
    try {
      const { error } = await supabase.functions.invoke('trends-collect-public', {
        body: {
          site_id: 'MLB',
          category_id: categoryId,
          collect_type: 'all'
        }
      });
      
      if (error) throw error;
      
      toast.success('Coleta iniciada! Aguarde alguns segundos.');
      
      // Polling for updates
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
  }, [categoryId, refetchHighlights]);

  const handleReload = useCallback(() => {
    setIsReloading(true);
    queryClient.invalidateQueries({ queryKey: ['trends'] });
    queryClient.invalidateQueries({ queryKey: ['market-trends'] });
    queryClient.invalidateQueries({ queryKey: ['market-highlights'] });
    queryClient.invalidateQueries({ queryKey: ['category-eligibility'] });
    
    setTimeout(() => setIsReloading(false), 2000);
    toast.success('Dados recarregados');
  }, [queryClient]);

  // Derived state
  const dataState = eligibility?.dataState || 'DADOS_PUBLICOS_MERCADO';
  const filteredTrends = trends?.trends || [];
  const hasSeller = !!selectedSellerId;
  const hasCategory = !!categoryId;
  const isLoading = trendsLoading || highlightsLoading || (eligibilityLoading && hasCategory);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 1. Fixed Top Bar */}
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
                  Análise baseada em dados públicos e seu histórico de vendas
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
              <Select value={selectedSellerId || 'none'} onValueChange={(v) => setSelectedSellerId(v === 'none' ? null : v)}>
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

              {/* Category Selector */}
              <Collapsible open={showNavigator} onOpenChange={setShowNavigator}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-[240px] justify-between">
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{categoryName}</span>
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
                    selectedId={categoryId}
                    onSelect={handleCategorySelect}
                    breadcrumb={breadcrumb}
                    onBreadcrumbClick={handleBreadcrumbClick}
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Reload Button */}
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

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        
        {/* 2. Status Banner */}
        <StatusBanner
          dataState={dataState}
          isLoading={isLoading && hasCategory && hasSeller}
          hasCategory={hasCategory}
          hasSeller={hasSeller}
        />

        {/* 3. KPI Cards */}
        <KPICards
          eligibility={eligibility}
          isLoading={isLoading}
          trendsCount={filteredTrends.length}
          highlightsCount={highlights?.items?.length || 0}
          categoryName={categoryName}
          hasCategory={hasCategory}
        />

        {/* 4. Trends & Keywords Section */}
        <TrendsKeywordsSection
          keywords={filteredTrends}
          isLoading={trendsLoading}
          dataState={dataState}
          snapshotDate={trends?.snapshot_date}
          categoryLabel={categoryName}
          hasCategory={hasCategory}
        />

        {/* 5. Top Sellers Ranking */}
        <TopSellersRankingSection
          items={highlights?.items || []}
          isLoading={highlightsLoading}
          snapshotDate={highlights?.snapshot_date}
          categoryLabel={categoryName}
          hasCategory={hasCategory}
          onCollect={handleCollectData}
          isCollecting={isCollecting}
        />

        {/* 6. Subcategories Section */}
        <SubcategoriesSection
          eligibility={eligibility}
          isLoading={eligibilityLoading}
          parentCategoryId={categoryId}
          onSubcategoryClick={handleCategorySelect}
        />

        {/* 7. Seller Goals Section (Conditional) */}
        <SellerGoalsSection
          eligibility={eligibility}
          isLoading={eligibilityLoading}
          sellerId={selectedSellerId}
          periodDays={periodDays}
          hasCategory={hasCategory}
        />

      </main>

      {/* 8. Technical Footer */}
      <TechnicalFooter
        lastUpdate={trendsStatus?.last_success_at || trendsStatus?.last_run_at}
        dataState={dataState}
        onReload={handleReload}
        isReloading={isReloading}
      />
    </div>
  );
}
