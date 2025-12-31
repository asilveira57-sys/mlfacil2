import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  Search as SearchIcon,
  Bell,
  Settings,
  AlertTriangle,
  CheckCircle2,
  Target
} from 'lucide-react';
import { toast } from 'sonner';
import { CompetitorOverview } from '@/components/competitor/CompetitorOverview';
import { CompetitorListings } from '@/components/competitor/CompetitorListings';
import { CompetitorMarketSearch } from '@/components/competitor/CompetitorMarketSearch';
import { CompetitorAlerts } from '@/components/competitor/CompetitorAlerts';
import { CompetitorSettings } from '@/components/competitor/CompetitorSettings';

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

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
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
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Target className="h-6 w-6" />
              Concorrência
            </h1>
            <p className="text-muted-foreground">
              Análise de mercado e posicionamento de preços
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {accounts.length > 1 && (
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
          )}
        </div>
      </div>

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
  );
}
