import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { TrendsProvider, useTrends } from '@/contexts/TrendsContext';
import { useTrendsController } from '@/hooks/useTrendsController';
import { useTrendsAutoLoad } from '@/hooks/useTrendsAutoLoad';
import { useSellerCategories } from '@/hooks/useSellerCategories';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

// Components
import { TrendsHeaderBar } from '@/components/trends/TrendsHeaderBar';
import { TrendsStatusBanner } from '@/components/trends/TrendsStatusBanner';
import { TrendsQuickKpis } from '@/components/trends/TrendsQuickKpis';
import { MarketTrendsSection } from '@/components/trends/MarketTrendsSection';
import { KeywordTrendsList } from '@/components/trends/KeywordTrendsList';
import { TopicChips } from '@/components/trends/TopicChips';
import { BestSellersSection } from '@/components/trends/BestSellersSection';
import { SellerGoalsSection } from '@/components/trends/SellerGoalsSection';
import { TechnicalFooterAccordion } from '@/components/trends/TechnicalFooterAccordion';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';

// Categories list (fallback for "Explorar mercado")
const CATEGORIES = [
  { id: 'MLB5672', label: 'Acessórios para Veículos' },
  { id: 'MLB1367', label: 'Antiguidades e Coleções' },
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

// Inner component that uses the context
function TendenciasContent() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<MlAccount[]>([]);
  const [isReloading, setIsReloading] = useState(false);
  const [isAutoLoading, setIsAutoLoading] = useState(true);
  const autoLoadAttemptedRef = useRef(false);
  
  const { state, setAccount, setCategory, setSubcategory, hasCategory } = useTrends();
  const { collectPublicData, reload, snapshotDate, eligibility, isLoading } = useTrendsController();
  const autoLoad = useTrendsAutoLoad();
  
  // Get seller categories for auto-selection
  const { data: sellerCategories, isLoading: categoriesLoading } = useSellerCategories(state.selectedAccountId);
  
  const [isCollecting, setIsCollecting] = useState(false);

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
        setAccount(data[0].ml_user_id);
      }
      setIsAutoLoading(false);
    };
    loadAccounts();
  }, [navigate, setAccount]);

  // AUTO-LOAD: When account is set, auto-select category and load data
  useEffect(() => {
    if (!state.selectedAccountId || categoriesLoading || autoLoadAttemptedRef.current) return;
    
    // Mark as attempted
    autoLoadAttemptedRef.current = true;
    autoLoad.resetForAccount(state.selectedAccountId);
    
    // Check for last category first
    const lastCategory = autoLoad.getLastCategory(state.selectedAccountId);
    
    if (lastCategory) {
      // Use last selected category
      console.log('[Tendencias] Auto-loading last category:', lastCategory);
      setCategory(lastCategory.categoryId, lastCategory.categoryName);
      autoLoad.markAutoLoaded();
      return;
    }
    
    // Otherwise, try seller's best category
    if (sellerCategories && sellerCategories.length > 0) {
      // Pick first pinned or most active category
      const pinnedCat = sellerCategories.find(c => c.is_pinned_auto);
      const bestCat = pinnedCat || sellerCategories[0];
      
      console.log('[Tendencias] Auto-loading best seller category:', bestCat);
      setCategory(bestCat.category_id, bestCat.category_name);
      autoLoad.markAutoLoaded();
      return;
    }
    
    // Fallback: select first general category
    if (CATEGORIES.length > 0) {
      console.log('[Tendencias] Auto-loading fallback category:', CATEGORIES[0]);
      setCategory(CATEGORIES[0].id, CATEGORIES[0].label);
      autoLoad.markAutoLoaded();
    }
  }, [
    state.selectedAccountId,
    sellerCategories,
    categoriesLoading,
    setCategory,
    autoLoad,
  ]);

  // Reset auto-load attempt when account changes
  useEffect(() => {
    autoLoadAttemptedRef.current = false;
  }, [state.selectedAccountId]);

  // Save category selection for persistence
  const handleCategoryChange = useCallback((categoryId: string | null, categoryName: string) => {
    if (categoryId && state.selectedAccountId) {
      autoLoad.saveLastCategory(state.selectedAccountId, categoryId, categoryName);
    }
    // Note: setCategory is already called by the header, we just persist here
  }, [state.selectedAccountId, autoLoad]);

  const handleReload = () => {
    setIsReloading(true);
    reload();
    setTimeout(() => setIsReloading(false), 2000);
  };

  const handleCollect = async () => {
    setIsCollecting(true);
    await collectPublicData();
    setTimeout(() => setIsCollecting(false), 5000);
  };

  const handleSubcategoryClick = (id: string, name: string) => {
    setSubcategory(id);
  };

  const categoriesForNavigator = CATEGORIES.map(c => ({ id: c.id, name: c.label }));

  // Header content with account selector and reload button
  const headerContent = (
    <div className="flex items-center gap-2">
      {accounts.length > 1 && (
        <Select value={state.selectedAccountId || ''} onValueChange={setAccount}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Conta" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.ml_user_id}>
                {acc.nickname || acc.ml_user_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleReload}
        disabled={isReloading}
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${isReloading ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">Atualizar</span>
      </Button>
    </div>
  );

  // Show loading while auto-loading
  if (isAutoLoading) {
    return (
      <DashboardLayout title="Tendências de Mercado" subtitle="Análise baseada em dados públicos do Mercado Livre">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/20" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Tendências de Mercado"
      subtitle="Análise baseada em dados públicos do Mercado Livre"
      headerContent={headerContent}
    >
      {/* Main Content - Loading Order */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Inline filters bar */}
        <TrendsHeaderBar
          accounts={accounts}
          onReload={handleReload}
          isReloading={isReloading}
          categoriesForNavigator={categoriesForNavigator}
          onCategoryChange={handleCategoryChange}
          hideBackAndTitle
        />

        {/* 1. Status Banner */}
        <TrendsStatusBanner />

        {/* 2. Quick KPIs */}
        <TrendsQuickKpis />

        {/* 3. Market Trends */}
        <MarketTrendsSection />

        {/* 4. Keywords + Topics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <KeywordTrendsList />
          </div>
          <div>
            <TopicChips />
          </div>
        </div>

        {/* 5. Best Sellers */}
        <BestSellersSection
          onCollect={handleCollect}
          isCollecting={isCollecting}
          snapshotDate={snapshotDate}
        />

        {/* 6. Seller Goals (Conditional) */}
        <SellerGoalsSection
          eligibility={eligibility}
          isLoading={isLoading}
          sellerId={state.selectedAccountId}
          periodDays={state.selectedPeriod}
          hasCategory={hasCategory}
        />

        {/* 7. Technical Footer */}
        <TechnicalFooterAccordion
          onReload={handleReload}
          isReloading={isReloading}
          snapshotDate={snapshotDate}
        />
      </div>
    </DashboardLayout>
  );
}

// Main export with Provider wrapper
export default function Tendencias() {
  return (
    <TrendsProvider>
      <TendenciasContent />
    </TrendsProvider>
  );
}
