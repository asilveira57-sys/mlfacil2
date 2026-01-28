import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  ArrowUpDown,
  ExternalLink,
  Zap,
  Package,
  TrendingUp,
  Eye,
  ShoppingCart,
  HeartPulse,
  Activity,
  AlertTriangle,
  Stethoscope,
  Siren,
  Scan,
} from "lucide-react";
import { useRadiography, ListingSnapshot } from "@/hooks/useRadiography";
import { 
  HEALTH_STATUS_CONFIG, 
  CURVE_CONFIG, 
  RadiographyHealthStatus, 
  AbcCurve,
  calculateHealthStatus,
  getSuggestedAction,
  SUGGESTED_ACTIONS,
} from "@/types/radiography";

interface RadiographyItemListProps {
  sellerId: string | null;
  onSelectItem: (itemId: string) => void;
}

export function RadiographyItemList({ sellerId, onSelectItem }: RadiographyItemListProps) {
  const { loading, items, fetchItems } = useRadiography(sellerId);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("score_total");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [healthFilter, setHealthFilter] = useState<string>("all");

  useEffect(() => {
    if (sellerId) {
      fetchItems(sortBy, sortOrder);
    }
  }, [sellerId, sortBy, sortOrder, fetchItems]);

  const getHealthStatus = (item: ListingSnapshot): RadiographyHealthStatus => {
    return calculateHealthStatus({
      score_total: item.score_total,
      conversion_rate_7d: item.conversion_rate_7d,
      visits_trend: 0, // Would need trend data
      stock_level: item.available_quantity,
    });
  };

  // Mock curve data - in real implementation would come from abc_profit_cache
  const getCurve = (item: ListingSnapshot): AbcCurve => {
    if (item.score_total >= 80 && item.sales_7d >= 5) return 'A+';
    if (item.score_total >= 70 && item.sales_7d >= 3) return 'A';
    if (item.score_total >= 50 && item.sales_7d >= 1) return 'B';
    return 'C';
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.title?.toLowerCase().includes(search.toLowerCase()) ||
      item.item_id.toLowerCase().includes(search.toLowerCase());
    
    if (healthFilter === "all") return matchesSearch;
    return matchesSearch && getHealthStatus(item) === healthFilter;
  });

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

  const getLogisticBadge = (type: string) => {
    switch (type) {
      case "fulfillment":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Full</Badge>;
      case "cross_docking":
        return <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">Flex</Badge>;
      case "drop_off":
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Coleta</Badge>;
      default:
        return <Badge variant="outline" className="border-slate-600 text-slate-400">{type || "N/A"}</Badge>;
    }
  };

  if (!sellerId) {
    return null;
  }

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
                <SelectItem value="all">Todos os estados</SelectItem>
                <SelectItem value="healthy">🟢 Saudável</SelectItem>
                <SelectItem value="stable">🔵 Estável</SelectItem>
                <SelectItem value="observation">🟡 Em Observação</SelectItem>
                <SelectItem value="alert">🟠 Com Alerta</SelectItem>
                <SelectItem value="critical">🔴 Crítico</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-36 bg-slate-800/50 border-slate-700 text-slate-200">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="score_total">Score Total</SelectItem>
                <SelectItem value="score_performance">Performance</SelectItem>
                <SelectItem value="visits_7d">Visitas 7d</SelectItem>
                <SelectItem value="sales_7d">Vendas 7d</SelectItem>
                <SelectItem value="conversion_rate_7d">Conversão</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
              className="bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200"
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-24 w-full bg-slate-800/50" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Package className="h-8 w-8 text-slate-500" />
            </div>
            <p className="text-lg font-medium text-slate-300">Nenhum registro encontrado</p>
            <p className="text-sm text-slate-500 mt-1">Execute a varredura para iniciar a coleta de dados.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const healthStatus = getHealthStatus(item);
              const healthConfig = HEALTH_STATUS_CONFIG[healthStatus];
              const curve = getCurve(item);
              const curveConfig = curve ? CURVE_CONFIG[curve] : null;
              const suggestedAction = getSuggestedAction(healthStatus, curve);
              const actionConfig = SUGGESTED_ACTIONS[suggestedAction];

              return (
                <div
                  key={item.item_id}
                  className={`relative flex items-center gap-4 p-4 rounded-lg border bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer transition-all group ${healthConfig.borderClass}`}
                  onClick={() => onSelectItem(item.item_id)}
                >
                  {/* Health Status Indicator - Left Bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${healthConfig.bgClass.replace('/10', '/60')}`} />

                  {/* Thumbnail with X-ray Effect */}
                  <div className="relative flex-shrink-0 ml-2">
                    {item.thumbnail ? (
                      <div className="relative">
                        <img 
                          src={item.thumbnail} 
                          alt={item.title}
                          className="h-16 w-16 object-cover rounded-md grayscale-[30%] group-hover:grayscale-0 transition-all"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent rounded-md" />
                      </div>
                    ) : (
                      <div className="h-16 w-16 bg-slate-800 rounded-md flex items-center justify-center border border-slate-700">
                        <Package className="h-8 w-8 text-slate-600" />
                      </div>
                    )}
                    {/* Health Status Badge */}
                    <div className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full ${healthConfig.bgClass} border ${healthConfig.borderClass} flex items-center justify-center`}>
                      <HealthIcon status={healthStatus} />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                        {item.title || item.item_id}
                      </span>
                      {item.catalog_product_id && (
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
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3 text-cyan-400" />
                        {item.visits_7d} visitas
                      </span>
                      <span className="flex items-center gap-1">
                        <ShoppingCart className="h-3 w-3 text-emerald-400" />
                        {item.sales_7d} vendas
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-violet-400" />
                        {item.conversion_rate_7d.toFixed(1)}% conv.
                      </span>
                      {getLogisticBadge(item.logistic_type)}
                    </div>
                    {/* Suggested Action */}
                    <div className="mt-2">
                      <span className={`text-xs ${
                        actionConfig.priority === 'critical' ? 'text-red-400' :
                        actionConfig.priority === 'high' ? 'text-orange-400' :
                        actionConfig.priority === 'medium' ? 'text-amber-400' :
                        'text-slate-500'
                      }`}>
                        {actionConfig.title}
                      </span>
                    </div>
                  </div>

                  {/* Curve Badge */}
                  {curveConfig && (
                    <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg border ${curveConfig.bgClass} ${curveConfig.borderClass}`}>
                      <span className={`text-sm font-bold ${curveConfig.colorClass}`}>
                        {curve}
                      </span>
                    </div>
                  )}

                  {/* Score Blocks (mini) - X-Ray style */}
                  <div className="hidden xl:flex items-center gap-1.5">
                    <ScoreBlock label="SEM" score={item.score_semantica} />
                    <ScoreBlock label="VIS" score={item.score_visual} />
                    <ScoreBlock label="LOG" score={item.score_logistica} />
                    <ScoreBlock label="COM" score={item.score_competitividade} />
                    <ScoreBlock label="PER" score={item.score_performance} />
                  </div>

                  {/* Total Score - Clinical Display */}
                  <div className={`flex-shrink-0 px-4 py-2 rounded-lg border ${healthConfig.bgClass} ${healthConfig.borderClass}`}>
                    <div className={`text-2xl font-bold font-mono ${healthConfig.colorClass}`}>
                      {item.score_total}
                    </div>
                    <div className="text-[10px] text-slate-500 text-center uppercase tracking-wide">Score</div>
                  </div>

                  {/* Examine Button */}
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

function ScoreBlock({ label, score }: { label: string; score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return "text-emerald-400";
    if (s >= 60) return "text-amber-400";
    return "text-red-400";
  };

  const getBgColor = (s: number) => {
    if (s >= 80) return "bg-emerald-500/10";
    if (s >= 60) return "bg-amber-500/10";
    return "bg-red-500/10";
  };

  return (
    <div className={`text-center px-2 py-1 rounded ${getBgColor(score)}`}>
      <div className={`text-sm font-semibold font-mono ${getColor(score)}`}>{score}</div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}
