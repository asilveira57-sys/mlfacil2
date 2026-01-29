import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bell, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  X,
  Activity
} from 'lucide-react';
import { useCompetitorTracking, CompetitorAlert } from '@/hooks/useCompetitorTracking';

interface TrackingAlertsTabProps {
  sellerId: string;
}

export function TrackingAlertsTab({ sellerId }: TrackingAlertsTabProps) {
  const { alerts, fetchAlerts, dismissAlert, loading } = useCompetitorTracking(sellerId);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  useEffect(() => {
    fetchAlerts(filter === 'unread');
  }, [fetchAlerts, filter]);

  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <TrendingDown className="h-5 w-5 text-amber-500" />;
      default:
        return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Urgente</Badge>;
      case 'warning':
        return <Badge variant="outline" className="border-amber-500 text-amber-600">Atenção</Badge>;
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

  if (loading && alerts.length === 0) {
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          Alertas de Concorrência
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'unread' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('unread')}
          >
            Não lidos
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            Todos
          </Button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-semibold mb-2">Nenhum alerta pendente</h3>
          <p className="text-muted-foreground">
            Você será notificado quando houver alterações nos preços dos concorrentes monitorados
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id} className={`overflow-hidden ${alert.is_read ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5">
                    {getAlertIcon(alert.severity)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{alert.title}</h4>
                      {getSeverityBadge(alert.severity)}
                    </div>
                    <p className="text-sm text-muted-foreground">{alert.body}</p>

                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDate(alert.created_at)}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Marcar lido
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
