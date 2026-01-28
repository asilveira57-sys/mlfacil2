import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
  AlertTriangle
} from 'lucide-react';
import { CompetitorOverview } from '@/components/competitor/CompetitorOverview';
import { CompetitorListings } from '@/components/competitor/CompetitorListings';
import { CompetitorMarketSearch } from '@/components/competitor/CompetitorMarketSearch';
import { CompetitorAlerts } from '@/components/competitor/CompetitorAlerts';
import { CompetitorSettings } from '@/components/competitor/CompetitorSettings';
import { PageContainer } from '@/components/layout/PageContainer';

interface MlAccount {
  id: string;
  ml_user_id: string;
  nickname: string;
}

export default function Concorrencia() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<MlAccount[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      // Load ML accounts
      const { data: mlAccounts } = await supabase
        .from('ml_accounts')
        .select('id, ml_user_id, nickname')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      if (mlAccounts && mlAccounts.length > 0) {
        setAccounts(mlAccounts);
        setSelectedSellerId(mlAccounts[0].ml_user_id);
      }
      setLoading(false);
    };

    checkAuth();
  }, [navigate]);

  const headerContent = accounts.length > 1 ? (
    <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Selecione a conta" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((acc) => (
          <SelectItem key={acc.id} value={acc.ml_user_id}>
            {acc.nickname || acc.ml_user_id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : undefined;

  if (loading) {
    return (
      <PageContainer title="Concorrência" subtitle="Análise de mercado e posicionamento">
        <div className="container mx-auto p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (accounts.length === 0) {
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
      subtitle="Análise de mercado e posicionamento de preços"
      headerContent={headerContent}
    >
      <div className="container mx-auto p-6 space-y-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
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
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alertas</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configurações</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <CompetitorOverview sellerId={selectedSellerId} />
          </TabsContent>

          <TabsContent value="listings" className="mt-6">
            <CompetitorListings sellerId={selectedSellerId} />
          </TabsContent>

          <TabsContent value="search" className="mt-6">
            <CompetitorMarketSearch sellerId={selectedSellerId} />
          </TabsContent>

          <TabsContent value="alerts" className="mt-6">
            <CompetitorAlerts sellerId={selectedSellerId} />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <CompetitorSettings sellerId={selectedSellerId} />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
