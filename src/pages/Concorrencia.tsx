import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  Package, 
  Search as SearchIcon,
  Bell,
  Settings,
  AlertTriangle,
  Eye,
  DollarSign,
  Copy,
  ShieldCheck
} from 'lucide-react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { CompetitorOverview } from '@/components/competitor/CompetitorOverview';
import { CompetitorListings } from '@/components/competitor/CompetitorListings';
import { CompetitorMarketSearch } from '@/components/competitor/CompetitorMarketSearch';
import { CompetitorAlerts } from '@/components/competitor/CompetitorAlerts';
import { CompetitorSettings } from '@/components/competitor/CompetitorSettings';
import { TrackedCompetitorsTab } from '@/components/competitor/TrackedCompetitorsTab';
import { TrackingAlertsTab } from '@/components/competitor/TrackingAlertsTab';
import { PriceSuggestionsTab } from '@/components/competitor/PriceSuggestionsTab';
import { PageContainer } from '@/components/layout/PageContainer';
import { AntiCatalogCloneModal } from '@/components/clone-anti-catalog';

export default function Concorrencia() {
  const navigate = useNavigate();
  
  // Use global active account from context
  const { activeAccount, sellerId, accounts, loading: accountLoading, initialized } = useActiveAccount();
  const selectedAccountId = activeAccount?.id || '';
  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'tracked';
  const setActiveTab = useCallback((tab: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [antiCatalogModalOpen, setAntiCatalogModalOpen] = useState(false);

  // Redirect if no account
  useEffect(() => {
    if (!accountLoading && initialized && !activeAccount) {
      navigate('/dashboard');
    }
  }, [accountLoading, initialized, activeAccount, navigate]);

  const headerContent = (
    <div className="flex items-center gap-3">
      {/* NOVO BOTÃO ISOLADO - Anti-Catálogo v3 */}
      <Button 
        variant="default" 
        onClick={() => setAntiCatalogModalOpen(true)}
        className="bg-primary"
      >
        <ShieldCheck className="h-4 w-4 mr-2" />
        Clonar como Anúncio Novo
      </Button>
      <Button asChild variant="outline">
        <Link to="/anuncios/acoes">
          <Copy className="h-4 w-4 mr-2" />
          Central de Ações
        </Link>
      </Button>
    </div>
  );

  if (accountLoading || !initialized) {
    return (
      <PageContainer title="Concorrência" subtitle="Análise de mercado e posicionamento">
        <div className="container mx-auto p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!activeAccount) {
    return (
      <PageContainer title="Concorrência" subtitle="Análise de mercado e posicionamento">
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Conta não conectada</h3>
            <p className="text-muted-foreground mb-4">
              Conecte sua conta do Mercado Livre para usar o módulo de Concorrência
            </p>
            <Button onClick={() => navigate('/dashboard')}>Ir para Dashboard</Button>
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Concorrência"
      subtitle="Monitore preços e estratégias dos concorrentes"
      headerContent={headerContent}
    >
      <div className="container mx-auto p-6 space-y-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-8 lg:w-auto lg:inline-grid">
            <TabsTrigger value="tracked" className="gap-2">
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Monitorados</span>
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Sugestões</span>
            </TabsTrigger>
            <TabsTrigger value="tracking-alerts" className="gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alertas</span>
            </TabsTrigger>
            <TabsTrigger value="overview" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Visão Geral</span>
            </TabsTrigger>
            <TabsTrigger value="listings" className="gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Meus Anúncios</span>
            </TabsTrigger>
            <TabsTrigger value="search" className="gap-2">
              <SearchIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Pesquisar</span>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Margem</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Config</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tracked" className="mt-6">
            <TrackedCompetitorsTab sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="suggestions" className="mt-6">
            <PriceSuggestionsTab sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="tracking-alerts" className="mt-6">
            <TrackingAlertsTab sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="overview" className="mt-6">
            <CompetitorOverview sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="listings" className="mt-6">
            <CompetitorListings sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="search" className="mt-6">
            <CompetitorMarketSearch sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="alerts" className="mt-6">
            <CompetitorAlerts sellerId={sellerId || ''} />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <CompetitorSettings sellerId={sellerId || ''} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal Anti-Catálogo v3 - ISOLADO */}
      <AntiCatalogCloneModal
        open={antiCatalogModalOpen}
        onOpenChange={setAntiCatalogModalOpen}
        mlAccountId={selectedAccountId}
      />
    </PageContainer>
  );
}
