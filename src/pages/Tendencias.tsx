import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  TrendingUp, 
  ArrowLeft, 
  FolderTree, 
  ChevronDown, 
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  Info,
  Clock,
  RefreshCw
} from 'lucide-react';
import { useMarketTrends, useMarketHighlights } from '@/hooks/useTrendsApi';
import { useTrendsStatus } from '@/hooks/useTrendsStatus';
import { useCategoryEligibility, EligibilityState } from '@/hooks/useCategoryEligibility';
import { useCategoryBreadcrumb } from '@/hooks/useSubcategories';
import { SubcategoryNavigator } from '@/components/trends/SubcategoryNavigator';
import { CategoryStatusCard } from '@/components/trends/CategoryStatusCard';
import { MarketOverviewCard } from '@/components/trends/MarketOverviewCard';
import { SubcategoriesHighlightCard } from '@/components/trends/SubcategoriesHighlightCard';
import { KeywordsTrendCard } from '@/components/trends/KeywordsTrendCard';
import { TopSellersMarketCard } from '@/components/trends/TopSellersMarketCard';
import { SellerPerformanceSection } from '@/components/trends/SellerPerformanceSection';
import { RecommendationsSection } from '@/components/trends/RecommendationsSection';
import { toast } from 'sonner';

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

// Badge component for eligibility state
function EligibilityBadge({ state }: { state: EligibilityState }) {
  const config = {
    eligible: { 
      icon: CheckCircle, 
      label: 'Elegível', 
      className: 'bg-green-500/10 text-green-600 border-green-500/30' 
    },
    low_base: { 
      icon: AlertTriangle, 
      label: 'Pouca Base', 
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' 
    },
    inactive: { 
      icon: Info, 
      label: 'Sem Vendas', 
      className: 'bg-muted text-muted-foreground' 
    },
    unknown: { 
      icon: Info, 
      label: 'Verificando', 
      className: 'bg-muted text-muted-foreground' 
    },
    loading: { 
      icon: RefreshCw, 
      label: 'Carregando', 
      className: 'bg-muted text-muted-foreground' 
    },
  };
  
  const { icon: Icon, label, className } = config[state];
  
  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Icon className={`h-3 w-3 ${state === 'loading' ? 'animate-spin' : ''}`} />
      {label}
    </Badge>
  );
}

export default function Tendencias() {
  const navigate = useNavigate();
  
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

  // Data hooks - ALWAYS fetched (market data doesn't depend on eligibility)
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
  const handleCategorySelect = (id: string, name: string) => {
    setCategoryId(id || null);
    setCategoryName(name);
    setShowNavigator(false);
  };

  const handleBreadcrumbClick = (id: string) => {
    const item = breadcrumb?.find(b => b.id === id);
    if (item) {
      setCategoryId(id);
      setCategoryName(item.name);
    }
  };

  const handleCollectData = async () => {
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
      
      setTimeout(() => {
        refetchHighlights();
        setIsCollecting(false);
      }, 5000);
    } catch (err) {
      console.error('Error collecting data:', err);
      toast.error('Erro ao coletar dados');
      setIsCollecting(false);
    }
  };

  // Derived state
  const eligibilityState: EligibilityState = eligibilityLoading 
    ? 'loading' 
    : eligibility?.eligibilityState || 'unknown';
  
  const filteredTrends = trends?.trends || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
                  Análise baseada em dados públicos do Mercado Livre e, quando disponível, no seu histórico
                </p>
              </div>
            </div>
            
            {/* Account Selector */}
            {accounts.length > 0 && (
              <Select value={selectedSellerId || ''} onValueChange={setSelectedSellerId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Selecionar conta" />
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
          </div>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
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
                <Button variant="outline" className="w-[260px] justify-between">
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

            {/* Eligibility Badge */}
            {categoryId && (
              <EligibilityBadge state={eligibilityState} />
            )}

            {/* Status Info */}
            {trendsStatus && (
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  Atualizado: {trendsStatus.last_success_at 
                    ? new Date(trendsStatus.last_success_at).toLocaleDateString('pt-BR')
                    : 'Nunca'
                  }
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Ordered Sections */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        
        {/* Section 1: Category Status (only when category selected) */}
        {categoryId && (
          <CategoryStatusCard
            eligibility={eligibility}
            isLoading={eligibilityLoading}
            categoryName={categoryName}
          />
        )}

        {/* Section 2 & 3: Market Overview + Subcategories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MarketOverviewCard
            categoryName={categoryName}
            trendsCount={filteredTrends.length}
            highlightsCount={highlights?.items?.length || 0}
            snapshotDate={trends?.snapshot_date}
            isLoading={trendsLoading}
          />
          
          <SubcategoriesHighlightCard
            parentCategoryId={categoryId}
            onSubcategoryClick={handleCategorySelect}
          />
        </div>

        {/* Section 4: Keywords Trend */}
        <KeywordsTrendCard
          keywords={filteredTrends}
          snapshotDate={trends?.snapshot_date}
          isLoading={trendsLoading}
          categoryLabel={categoryName}
        />

        {/* Section 5: Top Sellers Market */}
        <TopSellersMarketCard
          items={highlights?.items || []}
          snapshotDate={highlights?.snapshot_date}
          isLoading={highlightsLoading}
          categoryLabel={categoryName}
          onCollect={handleCollectData}
          isCollecting={isCollecting}
          showCollectButton={!!categoryId}
        />

        {/* Section 6: Seller Performance (Conditional) */}
        {categoryId && (
          <SellerPerformanceSection
            eligibility={eligibility}
            isLoading={eligibilityLoading}
            sellerId={selectedSellerId}
            periodDays={periodDays}
          />
        )}

        {/* Section 7: Strategic Recommendations */}
        {categoryId && (
          <RecommendationsSection
            eligibility={eligibility}
            isLoading={eligibilityLoading}
            categoryName={categoryName}
          />
        )}

      </main>
    </div>
  );
}
