import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, AlertTriangle, CheckCircle2, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface CompetitorAlertsProps {
  sellerId: string;
}

interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message_pt: string;
  item_id: string | null;
  product_key: string | null;
  data_json: any;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

export function CompetitorAlerts({ sellerId }: CompetitorAlertsProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({
        seller_id: sellerId,
        page: String(page),
        page_size: '20',
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/alerts?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
        setTotalPages(data.total_pages || 1);
      }
    } catch (error) {
      console.error('Error loading alerts:', error);
      toast.error('Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sellerId) {
      loadAlerts();
    }
  }, [sellerId, page]);

  const handleDismiss = async (alertId: string, resolve: boolean = false) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/alerts/dismiss`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ alert_id: alertId, resolve }),
        }
      );

      if (response.ok) {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
        toast.success(resolve ? 'Alerta resolvido' : 'Alerta descartado');
      }
    } catch (error) {
      console.error('Error dismissing alert:', error);
      toast.error('Erro ao descartar alerta');
    }
  };

  const handleGenerateAlerts = async () => {
    setGenerating(true);
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
        toast.success('Análise iniciada');
        setTimeout(() => {
          loadAlerts();
          setGenerating(false);
        }, 5000);
      } else {
        toast.error('Erro ao gerar alertas');
        setGenerating(false);
      }
    } catch (error) {
      console.error('Error generating alerts:', error);
      toast.error('Erro ao gerar alertas');
      setGenerating(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'danger':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <Bell className="h-5 w-5 text-amber-500" />;
      default:
        return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'danger':
        return <Badge variant="destructive">Risco</Badge>;
      case 'warning':
        return <Badge variant="outline" className="text-amber-600 border-amber-600">Atenção</Badge>;
      default:
        return <Badge variant="secondary">Info</Badge>;
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Alertas de Concorrência</h3>
        <Button onClick={handleGenerateAlerts} disabled={generating} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Analisando...' : 'Analisar Novos'}
        </Button>
      </div>

      {alerts.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-semibold mb-2">Nenhum alerta ativo</h3>
          <p className="text-muted-foreground">
            Seus produtos estão com margem saudável. Clique em "Analisar Novos" para verificar.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(alert.severity)}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{alert.title}</h4>
                        {getSeverityBadge(alert.severity)}
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.message_pt}</p>
                      {alert.data_json && (
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          {alert.data_json.margin !== undefined && (
                            <span>Margem: {alert.data_json.margin.toFixed(1)}%</span>
                          )}
                          {alert.data_json.price !== undefined && (
                            <span>Preço: R$ {alert.data_json.price.toFixed(2)}</span>
                          )}
                          {alert.data_json.cost !== undefined && (
                            <span>Custo: R$ {alert.data_json.cost.toFixed(2)}</span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">{formatDate(alert.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDismiss(alert.id, true)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Resolvido
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDismiss(alert.id, false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Anterior
          </Button>
          <span className="py-2 px-4 text-sm">Página {page} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
