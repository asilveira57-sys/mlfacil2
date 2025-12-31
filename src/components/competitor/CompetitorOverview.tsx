import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  RefreshCw, 
  Package, 
  Bell, 
  TrendingUp, 
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target
} from 'lucide-react';
import { toast } from 'sonner';

interface CompetitorOverviewProps {
  sellerId: string;
}

interface OverviewData {
  listings_count: number;
  catalog_count: number;
  alerts_count: number;
  snapshots_count: number;
  products_with_cost: number;
  recent_alerts: any[];
  last_sync_at: string | null;
}

export function CompetitorOverview({ sellerId }: CompetitorOverviewProps) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [generatingAlerts, setGeneratingAlerts] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/overview?seller_id=${sellerId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error loading overview:', error);
      toast.error('Erro ao carregar visão geral');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sellerId) {
      loadOverview();
    }
  }, [sellerId]);

  const handleSyncListings = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/listings/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ seller_id: sellerId }),
        }
      );

      if (response.ok) {
        toast.success('Sincronização de anúncios iniciada');
        // Poll for completion
        setTimeout(() => {
          loadOverview();
          setSyncing(false);
        }, 10000);
      } else {
        toast.error('Erro ao sincronizar');
        setSyncing(false);
      }
    } catch (error) {
      console.error('Error syncing listings:', error);
      toast.error('Erro ao sincronizar anúncios');
      setSyncing(false);
    }
  };

  const handleGenerateAlerts = async () => {
    setGeneratingAlerts(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/alerts/generate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ seller_id: sellerId }),
        }
      );

      if (response.ok) {
        toast.success('Análise de alertas iniciada');
        setTimeout(() => {
          loadOverview();
          setGeneratingAlerts(false);
        }, 5000);
      } else {
        toast.error('Erro ao gerar alertas');
        setGeneratingAlerts(false);
      }
    } catch (error) {
      console.error('Error generating alerts:', error);
      toast.error('Erro ao gerar alertas');
      setGeneratingAlerts(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Nunca';
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'danger': return 'destructive';
      case 'warning': return 'outline';
      default: return 'secondary';
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Meus Anúncios</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.listings_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              {data?.catalog_count || 0} em catálogo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.alerts_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              Atenção necessária
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Produtos com Custo</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.products_with_cost || 0}</div>
            <p className="text-xs text-muted-foreground">
              Margem calculável
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pesquisas Salvas</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.snapshots_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              Snapshots de mercado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions and Sync Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sincronização</CardTitle>
            <CardDescription>
              Última atualização: {formatDate(data?.last_sync_at)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={handleSyncListings} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Anúncios'}
            </Button>
            <Button variant="outline" onClick={handleGenerateAlerts} disabled={generatingAlerts}>
              <Bell className={`h-4 w-4 mr-2 ${generatingAlerts ? 'animate-pulse' : ''}`} />
              {generatingAlerts ? 'Analisando...' : 'Analisar Alertas'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status do Custo</CardTitle>
            <CardDescription>
              Integração com módulo de custos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.products_with_cost || 0) > 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span>{data?.products_with_cost} produtos com custo preenchido</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                <span>Nenhum produto com custo. Recomendações de preço desativadas.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Alerts */}
      {(data?.recent_alerts?.length || 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Alertas Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.recent_alerts.map((alert: any) => (
                <div 
                  key={alert.id} 
                  className="flex items-start justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    {alert.severity === 'danger' ? (
                      <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                    ) : (
                      <Bell className="h-5 w-5 text-amber-500 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm text-muted-foreground">{alert.message_pt}</p>
                    </div>
                  </div>
                  <Badge variant={getSeverityColor(alert.severity) as any}>
                    {alert.severity === 'danger' ? 'Risco' : 'Atenção'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!data?.listings_count && (
        <Card className="p-8 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Nenhum anúncio sincronizado</h3>
          <p className="text-muted-foreground mb-4">
            Clique em "Sincronizar Anúncios" para importar seus produtos do Mercado Livre
          </p>
        </Card>
      )}
    </div>
  );
}
