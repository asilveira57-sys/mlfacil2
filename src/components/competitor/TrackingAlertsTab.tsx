import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Bell, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  X,
  ExternalLink
} from 'lucide-react';
import { useCompetitorTracking, TrackingAlert } from '@/hooks/useCompetitorTracking';

interface TrackingAlertsTabProps {
  sellerId: string;
}

export function TrackingAlertsTab({ sellerId }: TrackingAlertsTabProps) {
  const { alerts, fetchAlerts, dismissAlert, loading } = useCompetitorTracking(sellerId);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'price_drop':
        return <TrendingDown className="h-5 w-5 text-green-500" />;
      case 'price_rise':
        return <TrendingUp className="h-5 w-5 text-amber-500" />;
      case 'min_reached':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'max_reached':
        return <TrendingUp className="h-5 w-5 text-blue-500" />;
      case 'unavailable':
        return <AlertTriangle className="h-5 w-5 text-muted-foreground" />;
      case 'available':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      default:
        return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'danger':
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

  if (alerts.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
        <h3 className="text-lg font-semibold mb-2">Nenhum alerta pendente</h3>
        <p className="text-muted-foreground">
          Você será notificado quando houver alterações nos preços dos concorrentes monitorados
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          Alertas de Concorrência ({alerts.length})
        </h3>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => (
          <Card key={alert.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="mt-0.5">
                  {getAlertIcon(alert.alert_type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{alert.title}</h4>
                    {getSeverityBadge(alert.severity)}
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message_pt}</p>

                  {/* Price Details */}
                  {alert.data_json && (
                    <div className="flex flex-wrap gap-4 mt-2 text-xs">
                      {alert.data_json.previous_price !== undefined && (
                        <span>
                          Anterior: {formatCurrency(alert.data_json.previous_price)}
                        </span>
                      )}
                      {alert.data_json.current_price !== undefined && (
                        <span className="font-medium">
                          Atual: {formatCurrency(alert.data_json.current_price)}
                        </span>
                      )}
                      {alert.data_json.delta_percent !== undefined && (
                        <span className={alert.data_json.delta_percent > 0 ? 'text-amber-600' : 'text-green-600'}>
                          {alert.data_json.delta_percent > 0 ? '+' : ''}
                          {alert.data_json.delta_percent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )}

                  {/* Suggested Action */}
                  {alert.suggested_price && (
                    <div className="mt-3 p-2 bg-primary/10 rounded-lg">
                      <p className="text-sm">
                        <strong>Sugestão:</strong> Ajustar seu preço para{' '}
                        <span className="font-bold">{formatCurrency(alert.suggested_price)}</span>
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDate(alert.created_at)}
                  </p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => dismissAlert(alert.id, true)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Resolvido
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => dismissAlert(alert.id, false)}
                    title="Descartar"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
