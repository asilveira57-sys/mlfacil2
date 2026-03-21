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
  AlertOctagon,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import {
  HEALTH_STATUS_CONFIG,
  RadiographyHealthStatus,
} from "@/types/radiography";
import {
  HealthCurrentItem,
  classifyHealth,
  AnomalyFilter,
  PeriodDays,
} from "@/hooks/useRadiographyData";

const ITEMS_PER_PAGE = 50;

interface Props {
  items: HealthCurrentItem[];
  loading: boolean;
  onSelectItem: (itemId: string) => void;
  selectedPeriod: PeriodDays;
  onPeriodChange: (p: PeriodDays) => void;
  collectionStatus?: string | null;
  collectionError?: string | null;
  dataDaysAvailable?: number;
}

export function RadiographyItemList({
  items,
  loading,
  onSelectItem,
  selectedPeriod,
  onPeriodChange,
  collectionStatus,
  collectionError,
  dataDaysAvailable = 0,
}: Props) {
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [anomalyFilter, setAnomalyFilter] = useState<AnomalyFilter>("all");
  const [sortBy, setSortBy] = useState<string>("health");
  const [page, setPage] = useState(0);

  const filteredItems = useMemo(() => {
    let result = items.filter((item) => {
      const q = search.toLowerCase();
      if (q && !item.title?.toLowerCase().includes(q) && !item.item_id.toLowerCase().includes(q)) {
        return false;
      }
      if (healthFilter !== "all") {
        if (classifyHealth(item) !== healthFilter) return false;
      }
      if (anomalyFilter === "with_anomaly") {
        if (!item.anomaly_flags?.length) return false;
      } else if (anomalyFilter === "without_anomaly") {
        if (item.anomaly_flags?.length) return false;
      }
      return true;
    });

    // Sort
    const healthPriority: Record<string, number> = { critical: 0, alert: 1, observation: 2, stable: 3, healthy: 4 };
    result.sort((a, b) => {
      if (sortBy === "health") {
        return (healthPriority[classifyHealth(a)] ?? 5) - (healthPriority[classifyHealth(b)] ?? 5);
      }
      if (sortBy === "visits") return (b.visits_period ?? b.visits_last ?? 0) - (a.visits_period ?? a.visits_last ?? 0);
      if (sortBy === "sales") return (b.sales_period ?? b.sales_count_30d ?? 0) - (a.sales_period ?? a.sales_count_30d ?? 0);
      if (sortBy === "days_no_sale") return (b.days_without_sale ?? 0) - (a.days_without_sale ?? 0);
      if (sortBy === "seo") return (a.seo_score ?? 999) - (b.seo_score ?? 999);
      if (sortBy === "conversion") {
        const convA = a.conversion_period ?? ((a.visits_period && a.visits_period > 0 && a.sales_period != null) ? (a.sales_period / a.visits_period) * 100 : -1);
        const convB = b.conversion_period ?? ((b.visits_period && b.visits_period > 0 && b.sales_period != null) ? (b.sales_period / b.visits_period) * 100 : -1);
        return convB - convA;
      }
      return 0;
    });

    return result;
  }, [items, search, healthFilter, anomalyFilter, sortBy]);

  // Reset page on filter change
  useMemo(() => setPage(0), [search, healthFilter, anomalyFilter, sortBy]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const pagedItems = filteredItems.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const HealthIcon = ({ status }: { status: RadiographyHealthStatus }) => {
    const iconMap = { healthy: HeartPulse, stable: Activity, observation: Stethoscope, alert: AlertTriangle, critical: Siren };
    const Icon = iconMap[status];
    const config = HEALTH_STATUS_CONFIG[status];
    return <Icon className={`h-4 w-4 ${config.colorClass}`} />;
  };

  // Stats summary
  const stats = useMemo(() => {
    const counts: Record<string, number> = { healthy: 0, stable: 0, observation: 0, alert: 0, critical: 0 };
    items.forEach(i => { counts[classifyHealth(i)]++; });
    return counts;
  }, [items]);

  // Data quality check
  const dataQuality = useMemo(() => {
    if (items.length === 0) return null;
    const noSalesData = items.filter(i => i.sales_count_30d === 0 && i.sales_count_7d === 0 && !i.last_sale_at).length;
    const noVisits = items.filter(i => (i.visits_last ?? 0) === 0).length;
    const hasSalesIssue = noSalesData > items.length * 0.9;
    const hasVisitsIssue = noVisits > items.length * 0.8;
    return { noSalesData, noVisits, hasSalesIssue, hasVisitsIssue };
  }, [items]);

  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Scan className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <CardTitle className="text-slate-100">Prontuários</CardTitle>
                <p className="text-sm text-slate-400">{filteredItems.length} de {items.length} anúncios</p>
              </div>
            </div>
            {/* Health summary pills */}
            <div className="hidden md:flex items-center gap-1.5">
              {(["critical", "alert", "observation", "stable", "healthy"] as RadiographyHealthStatus[]).map(s => {
                const c = HEALTH_STATUS_CONFIG[s];
                return stats[s] > 0 ? (
                  <button
                    key={s}
                    onClick={() => setHealthFilter(healthFilter === s ? "all" : s)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all border ${
                      healthFilter === s
                        ? `${c.bgClass} ${c.borderClass} ${c.colorClass}`
                        : "border-transparent text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <HealthIcon status={s} />
                    <span className="font-mono">{stats[s]}</span>
                  </button>
                ) : null;
              })}
            </div>
          </div>

          {/* Data quality warnings */}
          {dataQuality?.hasSalesIssue && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-amber-300 font-medium">Dados de vendas pendentes</p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  {dataQuality.noSalesData} de {items.length} anúncios ainda sem cruzamento de vendas. 
                  Clique em "Atualizar Dados" para enriquecer.
                </p>
              </div>
            </div>
          )}

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Buscar por título ou ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <Select value={anomalyFilter} onValueChange={(v) => setAnomalyFilter(v as AnomalyFilter)}>
              <SelectTrigger className="w-36 bg-slate-800/50 border-slate-700 text-slate-200">
                <SelectValue placeholder="Anomalias" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Todas</SelectItem>
                <SelectItem value="with_anomaly" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Com anomalia</SelectItem>
                <SelectItem value="without_anomaly" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Sem anomalia</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-36 bg-slate-800/50 border-slate-700 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="health" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Por saúde</SelectItem>
                <SelectItem value="visits" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Por visitas</SelectItem>
                <SelectItem value="sales" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Por vendas</SelectItem>
                <SelectItem value="days_no_sale" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Dias s/ venda</SelectItem>
                <SelectItem value="conversion" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Por conversão</SelectItem>
                <SelectItem value="seo" className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">Por SEO</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(selectedPeriod)} onValueChange={(v) => onPeriodChange(Number(v) as PeriodDays)}>
              <SelectTrigger className="w-28 bg-slate-800/50 border-slate-700 text-slate-200">
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
                  ? (collectionError || "A coleta não conseguiu gerar histórico. Tente atualizar novamente.")
                  : "Clique em \"Atualizar Dados\" para iniciar a coleta."
                : "Tente ajustar os filtros."}
            </p>
          </div>
        ) : (
          <>
            {/* Coverage warning when period exceeds available data */}
            {dataDaysAvailable > 0 && dataDaysAvailable < selectedPeriod && (
              <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <Activity className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Histórico de visitas disponível para os últimos <strong>{dataDaysAvailable} dias</strong>.
                  {selectedPeriod > dataDaysAvailable && ` Período de ${selectedPeriod}d mostra dados parciais — a cobertura melhora automaticamente a cada dia.`}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              {pagedItems.map((item) => {
                const health = classifyHealth(item);
                const config = HEALTH_STATUS_CONFIG[health];
                const alertCount = (item.alerts_json?.length ?? 0) + (item.anomaly_flags?.length ?? 0);
                

                return (
                  <div
                    key={item.id}
                    className={`relative flex items-center gap-3 p-3 rounded-lg border bg-slate-800/30 hover:bg-slate-800/60 cursor-pointer transition-all group ${config.borderClass}`}
                    onClick={() => onSelectItem(item.item_id)}
                  >
                    {/* Left health bar */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${config.bgClass.replace("/10", "/60")}`} />

                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0 ml-1">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          className="h-12 w-12 object-cover rounded-md grayscale-[30%] group-hover:grayscale-0 transition-all"
                        />
                      ) : (
                        <div className="h-12 w-12 bg-slate-800 rounded-md flex items-center justify-center border border-slate-700">
                          <Package className="h-6 w-6 text-slate-600" />
                        </div>
                      )}
                      <div className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full ${config.bgClass} border ${config.borderClass} flex items-center justify-center`}>
                        <HealthIcon status={health} />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm text-slate-200 truncate group-hover:text-white transition-colors">
                          {item.title || item.item_id}
                        </span>
                        {item.permalink && (
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {/* Metrics row */}
                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3 text-cyan-400" />
                          {(item.visits_period ?? item.visits_last) != null ? (item.visits_period ?? item.visits_last)!.toLocaleString("pt-BR") : "—"}
                        </span>
                        <span className={`flex items-center gap-1 ${!(item.sales_period ?? item.sales_count_30d) && !item.last_sale_at ? "opacity-50" : ""}`}>
                          <ShoppingCart className="h-3 w-3 text-emerald-400" />
                          {(item.sales_period ?? item.sales_count_30d) != null ? (item.sales_period ?? item.sales_count_30d) : "—"}
                        </span>
                        {/* Conversion rate */}
                        {(() => {
                          const conv = item.conversion_period ??
                            ((item.visits_period && item.visits_period > 0 && item.sales_period != null)
                              ? ((item.sales_period / item.visits_period) * 100)
                              : null);
                          return conv != null ? (
                            <span className={`flex items-center gap-1 font-mono ${
                              conv >= 3 ? "text-emerald-400" : conv >= 1 ? "text-amber-400" : "text-red-400"
                            }`}>
                              {conv.toFixed(1)}%
                            </span>
                          ) : null;
                        })()}
                        {item.days_without_sale != null && item.days_without_sale > 0 && (
                          <span className={`flex items-center gap-1 ${
                            item.days_without_sale > 30 ? "text-red-400" : item.days_without_sale > 14 ? "text-amber-400" : ""
                          }`}>
                            <Clock className="h-3 w-3" />
                            {item.days_without_sale}d
                          </span>
                        )}
                        <span className="text-slate-500">
                          Est: {item.available_quantity ?? "—"}
                        </span>
                        <span className="text-slate-500">
                          R$ {item.price != null ? item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}
                        </span>
                        {item.seo_score != null && (
                          <span className={`font-mono ${
                            item.seo_score >= 70 ? "text-emerald-400" :
                            item.seo_score >= 40 ? "text-amber-400" :
                            "text-red-400"
                          }`}>
                            SEO {item.seo_score}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side: alerts count + examine */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {alertCount > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20">
                          <AlertOctagon className="h-3 w-3 text-red-400" />
                          <span className="text-xs font-mono text-red-400">{alertCount}</span>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 text-xs px-2"
                        onClick={(e) => { e.stopPropagation(); onSelectItem(item.item_id); }}
                      >
                        <Stethoscope className="h-3.5 w-3.5 mr-1" />
                        Examinar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
                <p className="text-xs text-slate-500">
                  Mostrando {page * ITEMS_PER_PAGE + 1}–{Math.min((page + 1) * ITEMS_PER_PAGE, filteredItems.length)} de {filteredItems.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-slate-200"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i;
                    } else if (page < 3) {
                      pageNum = i;
                    } else if (page > totalPages - 4) {
                      pageNum = totalPages - 7 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className={`h-8 w-8 p-0 text-xs ${
                          page === pageNum
                            ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {pageNum + 1}
                      </Button>
                    );
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-slate-200"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}