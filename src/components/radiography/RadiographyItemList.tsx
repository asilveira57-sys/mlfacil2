import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Package,
  Eye,
  HeartPulse,
  Activity,
  AlertTriangle,
  Stethoscope,
  Siren,
  Scan,
  ExternalLink,
  ShoppingCart,
  Clock,
} from "lucide-react";
import {
  HEALTH_STATUS_CONFIG,
  RadiographyHealthStatus,
} from "@/types/radiography";
import {
  HealthCurrentItem,
  classifyHealth,
  getAnomalyLabel,
  AnomalyFilter,
  PeriodDays,
} from "@/hooks/useRadiographyData";

interface Props {
  items: HealthCurrentItem[];
  loading: boolean;
  onSelectItem: (itemId: string) => void;
  selectedPeriod: PeriodDays;
  onPeriodChange: (p: PeriodDays) => void;
  collectionStatus?: string | null;
  collectionError?: string | null;
}

export function RadiographyItemList({
  items,
  loading,
  onSelectItem,
  selectedPeriod,
  onPeriodChange,
  collectionStatus,
  collectionError,
}: Props) {
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [anomalyFilter, setAnomalyFilter] = useState<AnomalyFilter>("all");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Search
      const q = search.toLowerCase();
      if (q && !item.title?.toLowerCase().includes(q) && !item.item_id.toLowerCase().includes(q)) {
        return false;
      }
      // Health filter
      if (healthFilter !== "all") {
        if (classifyHealth(item) !== healthFilter) return false;
      }
      // Anomaly filter
      if (anomalyFilter === "with_anomaly") {
        if (!item.anomaly_flags?.length) return false;
      } else if (anomalyFilter === "without_anomaly") {
        if (item.anomaly_flags?.length) return false;
      }
      return true;
    });
  }, [items, search, healthFilter, anomalyFilter]);

  const HealthIcon = ({ status }: { status: RadiographyHealthStatus }) => {
    const iconMap = {
      healthy: HeartPulse,
      stable: Activity,
      observation: Stethoscope,
      alert: AlertTriangle,
      critical: Siren,
    };
    const Icon = iconMap[status];
    const config = HEALTH_STATUS_CONFIG[status];
    return <Icon className={`h-4 w-4 ${config.colorClass}`} />;
  };

  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Scan className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-slate-100">Prontuários</CardTitle>
              <p className="text-sm text-slate-400">{filteredItems.length} anúncios em análise</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Buscar por título ou ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-64 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <Select value={healthFilter} onValueChange={setHealthFilter}>
              <SelectTrigger className="w-40 bg-slate-800/50 border-slate-700 text-slate-200">
                <SelectValue placeholder="Estado clínico" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Todos os estados</SelectItem>
                <SelectItem value="healthy" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">🟢 Saudável</SelectItem>
                <SelectItem value="stable" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">🔵 Estável</SelectItem>
                <SelectItem value="observation" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">🟡 Em Observação</SelectItem>
                <SelectItem value="alert" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">🟠 Com Alerta</SelectItem>
                <SelectItem value="critical" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">🔴 Crítico</SelectItem>
              </SelectContent>
            </Select>
            <Select value={anomalyFilter} onValueChange={(v) => setAnomalyFilter(v as AnomalyFilter)}>
              <SelectTrigger className="w-40 bg-slate-800/50 border-slate-700 text-slate-200">
                <SelectValue placeholder="Anomalias" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Todas</SelectItem>
                <SelectItem value="with_anomaly" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Com anomalia</SelectItem>
                <SelectItem value="without_anomaly" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Sem anomalia</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(selectedPeriod)} onValueChange={(v) => onPeriodChange(Number(v) as PeriodDays)}>
              <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="7" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">7 dias</SelectItem>
                <SelectItem value="15" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">15 dias</SelectItem>
                <SelectItem value="30" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">30 dias</SelectItem>
                <SelectItem value="60" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">60 dias</SelectItem>
                <SelectItem value="150" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">150 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full bg-slate-800/50" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Package className="h-8 w-8 text-slate-500" />
            </div>
            <p className="text-lg font-medium text-slate-300">
              {items.length === 0
                ? collectionStatus === "failed"
                  ? "Sincronização concluída, mas a coleta falhou"
                  : "Aguardando primeira coleta de dados"
                : "Nenhum resultado encontrado"}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {items.length === 0
                ? collectionStatus === "failed"
                  ? (collectionError || "A coleta não conseguiu gerar histórico. Verifique os logs da coleta e tente atualizar novamente.")
                  : "Clique em \"Atualizar Dados\" para iniciar a coleta. Os prontuários aparecerão após o processamento."
                : "Tente ajustar os filtros."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const health = classifyHealth(item);
              const config = HEALTH_STATUS_CONFIG[health];
              const hasAnomalies = !!item.anomaly_flags?.length;

              return (
                <div
                  key={item.id}
                  className={`relative flex items-center gap-4 p-4 rounded-lg border bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer transition-all group ${config.borderClass}`}
                  onClick={() => onSelectItem(item.item_id)}
                >
                  {/* Left health bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${config.bgClass.replace("/10", "/60")}`} />

                  {/* Thumbnail */}
                  <div className="relative flex-shrink-0 ml-2">
                    {item.thumbnail ? (
                      <div className="relative">
                        <img
                          src={item.thumbnail}
                          alt={item.title || ""}
                          className="h-14 w-14 object-cover rounded-md grayscale-[30%] group-hover:grayscale-0 transition-all"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent rounded-md" />
                      </div>
                    ) : (
                      <div className="h-14 w-14 bg-slate-800 rounded-md flex items-center justify-center border border-slate-700">
                        <Package className="h-7 w-7 text-slate-600" />
                      </div>
                    )}
                    <div className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full ${config.bgClass} border ${config.borderClass} flex items-center justify-center`}>
                      <HealthIcon status={health} />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                        {item.title || item.item_id}
                      </span>
                      {item.catalog_listing && (
                        <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400">Catálogo</Badge>
                      )}
                      {item.permalink && (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-500 hover:text-cyan-400 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <span className="font-mono text-xs text-slate-500">{item.item_id}</span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3 text-cyan-400" />
                        {item.visits_last != null ? item.visits_last.toLocaleString("pt-BR") : "—"} visitas
                      </span>
                      <span>
                        Estoque: {item.available_quantity ?? "—"}
                      </span>
                      <span>
                        R$ {item.price != null ? item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}
                      </span>
                      <Badge className={`text-xs ${config.bgClass} ${config.colorClass} ${config.borderClass}`}>
                        {config.label}
                      </Badge>
                    </div>
                    {/* Anomaly flags */}
                    {hasAnomalies && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.anomaly_flags!.map((flag) => (
                          <Badge key={flag} variant="outline" className="text-xs border-red-500/30 text-red-400 bg-red-500/5">
                            {getAnomalyLabel(flag)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Examine */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-shrink-0 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectItem(item.item_id);
                    }}
                  >
                    <Stethoscope className="h-4 w-4 mr-1" />
                    Examinar
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
