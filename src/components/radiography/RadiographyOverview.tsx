import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  AlertTriangle, 
  Camera, 
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock
} from "lucide-react";
import { useRadiography, MonitorStatus, ListingEvent } from "@/hooks/useRadiography";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RadiographyOverviewProps {
  sellerId: string | null;
  onSelectItem?: (itemId: string) => void;
}

export function RadiographyOverview({ sellerId, onSelectItem }: RadiographyOverviewProps) {
  const { 
    loading, 
    status, 
    fetchStatus, 
    runSnapshot,
  } = useRadiography(sellerId);

  useEffect(() => {
    if (sellerId) {
      fetchStatus();
    }
  }, [sellerId, fetchStatus]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-500/10 text-red-500 border-red-500/20";
      case "warning": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default: return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  const getEventIcon = (impactDirection: string) => {
    switch (impactDirection) {
      case "positive": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "negative": return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatEventType = (type: string) => {
    const map: Record<string, string> = {
      stockout: "Ruptura de Estoque",
      stockout_full: "Ruptura no Full",
      stock_recovered: "Estoque Reposto",
      price_changed: "Preço Alterado",
      title_changed: "Título Alterado",
      visits_spike: "Pico de Visitas",
      visits_drop: "Queda de Visitas",
      logistic_upgraded: "Melhoria Logística",
      logistic_downgraded: "Downgrade Logística",
      catalog_entered: "Entrou no Catálogo",
      catalog_exited: "Saiu do Catálogo",
      buybox_lost: "Perdeu Buy Box",
    };
    return map[type] || type;
  };

  if (!sellerId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Conecte uma conta do Mercado Livre para usar a Radiografia.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com Status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Radiografia de Anúncios</h2>
          <p className="text-muted-foreground">
            Monitoramento automático e análise profunda dos seus anúncios
          </p>
        </div>
        <Button 
          onClick={runSnapshot} 
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          Coletar Snapshots
        </Button>
      </div>

      {/* Cards de Status */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Anúncios Monitorados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !status ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {status?.config?.total_items_monitored || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Snapshots Totais
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !status ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {status?.stats?.total_snapshots || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Eventos Detectados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !status ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {status?.stats?.total_events || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Última Coleta
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !status ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-lg font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {status?.config?.last_snapshot_at ? (
                  formatDistanceToNow(new Date(status.config.last_snapshot_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })
                ) : (
                  "Nunca"
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Eventos Críticos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Eventos Críticos (últimos 7 dias)
          </CardTitle>
          <CardDescription>
            Eventos que requerem atenção imediata
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !status ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : status?.critical_events?.length ? (
            <div className="space-y-3">
              {status.critical_events.map((event) => (
                <div 
                  key={event.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => onSelectItem?.(event.item_id)}
                >
                  <div className="flex items-center gap-3">
                    {getEventIcon(event.impact_direction)}
                    <div>
                      <div className="font-medium">
                        {formatEventType(event.event_type)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {event.observation_pt}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={getSeverityColor(event.severity)}>
                      {event.severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.detected_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum evento crítico nos últimos 7 dias</p>
              <p className="text-sm">Seus anúncios estão operando normalmente.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
