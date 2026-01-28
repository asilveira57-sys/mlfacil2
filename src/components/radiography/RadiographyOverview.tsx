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
  Clock,
  HeartPulse,
  Stethoscope,
  Siren,
  Scan,
  Zap,
  ShieldAlert,
} from "lucide-react";
import { useRadiography, MonitorStatus, ListingEvent } from "@/hooks/useRadiography";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HEALTH_STATUS_CONFIG, RadiographyHealthStatus } from "@/types/radiography";

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
      case "critical": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "warning": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default: return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    }
  };

  const getEventIcon = (impactDirection: string) => {
    switch (impactDirection) {
      case "positive": return <TrendingUp className="h-4 w-4 text-emerald-400" />;
      case "negative": return <TrendingDown className="h-4 w-4 text-red-400" />;
      default: return <Minus className="h-4 w-4 text-slate-400" />;
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
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="py-8 text-center text-slate-400">
          Conecte uma conta do Mercado Livre para usar a Radiografia.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Clinical Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Scan className="h-7 w-7 text-cyan-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-slate-900 border border-cyan-500/30 flex items-center justify-center">
              <HeartPulse className="h-3 w-3 text-cyan-400" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-100">Diagnóstico Clínico</h2>
            <p className="text-slate-400">
              Exame interno da saúde dos seus anúncios
            </p>
          </div>
        </div>
        <Button 
          onClick={runSnapshot} 
          disabled={loading}
          className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white border-0"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Realizar Exame
        </Button>
      </div>

      {/* Vitals Cards - Clinical Style */}
      <div className="grid gap-4 md:grid-cols-4">
        <VitalCard
          icon={<Activity className="h-5 w-5" />}
          label="Pacientes Monitorados"
          value={status?.config?.total_items_monitored || 0}
          loading={loading && !status}
          colorClass="text-cyan-400"
          bgClass="bg-cyan-500/10"
          borderClass="border-cyan-500/20"
        />
        <VitalCard
          icon={<Camera className="h-5 w-5" />}
          label="Exames Realizados"
          value={status?.stats?.total_snapshots || 0}
          loading={loading && !status}
          colorClass="text-violet-400"
          bgClass="bg-violet-500/10"
          borderClass="border-violet-500/20"
        />
        <VitalCard
          icon={<ShieldAlert className="h-5 w-5" />}
          label="Anomalias Detectadas"
          value={status?.stats?.total_events || 0}
          loading={loading && !status}
          colorClass="text-amber-400"
          bgClass="bg-amber-500/10"
          borderClass="border-amber-500/20"
        />
        <VitalCard
          icon={<Clock className="h-5 w-5" />}
          label="Última Varredura"
          value={
            status?.config?.last_snapshot_at
              ? formatDistanceToNow(new Date(status.config.last_snapshot_at), {
                  addSuffix: true,
                  locale: ptBR,
                })
              : "Nunca"
          }
          loading={loading && !status}
          colorClass="text-emerald-400"
          bgClass="bg-emerald-500/10"
          borderClass="border-emerald-500/20"
          isText
        />
      </div>

      {/* Critical Events Panel - X-Ray Style */}
      <Card className="bg-slate-900/60 border-slate-700/50 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent pointer-events-none" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-3 text-slate-100">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <Siren className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <span>Alertas Críticos</span>
              <Badge className="ml-3 bg-red-500/20 text-red-400 border-red-500/30">
                Últimos 7 dias
              </Badge>
            </div>
          </CardTitle>
          <CardDescription className="text-slate-400">
            Condições que requerem intervenção imediata
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          {loading && !status ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full bg-slate-800/50" />
              ))}
            </div>
          ) : status?.critical_events?.length ? (
            <div className="space-y-3">
              {status.critical_events.map((event) => (
                <div 
                  key={event.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer transition-all hover:border-red-500/30 group"
                  onClick={() => onSelectItem?.(event.item_id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      event.severity === 'critical' ? 'bg-red-500/20 border border-red-500/30' : 'bg-amber-500/20 border border-amber-500/30'
                    }`}>
                      {getEventIcon(event.impact_direction)}
                    </div>
                    <div>
                      <div className="font-medium text-slate-200 group-hover:text-white transition-colors">
                        {formatEventType(event.event_type)}
                      </div>
                      <div className="text-sm text-slate-400">
                        {event.observation_pt}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={getSeverityColor(event.severity)}>
                      {event.severity === 'critical' ? 'Crítico' : event.severity === 'warning' ? 'Alerta' : 'Info'}
                    </Badge>
                    <span className="text-xs text-slate-500">
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
            <div className="text-center py-12 text-slate-400">
              <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <HeartPulse className="h-8 w-8 text-emerald-400" />
              </div>
              <p className="text-lg font-medium text-slate-300">Nenhuma anomalia crítica</p>
              <p className="text-sm text-slate-500 mt-1">Seus anúncios estão operando dentro dos parâmetros normais.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface VitalCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  loading: boolean;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  isText?: boolean;
}

function VitalCard({ icon, label, value, loading, colorClass, bgClass, borderClass, isText }: VitalCardProps) {
  return (
    <Card className={`relative overflow-hidden bg-slate-900/60 border-slate-700/50 ${borderClass}`}>
      <div className={`absolute inset-0 ${bgClass} opacity-30`} />
      <CardContent className="relative pt-4 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className={`h-8 w-8 rounded-lg ${bgClass} border ${borderClass} flex items-center justify-center ${colorClass}`}>
            {icon}
          </div>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            {label}
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-20 bg-slate-800/50" />
        ) : (
          <div className={`text-2xl font-bold ${colorClass}`}>
            {isText ? value : typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
