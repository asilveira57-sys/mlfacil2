import { useEffect, useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Eye,
  TrendingUp,
  TrendingDown,
  Package,
  ExternalLink,
  HeartPulse,
  Activity,
  AlertTriangle,
  Stethoscope,
  Siren,
  Scan,
  ShoppingCart,
  Clock,
  BarChart3,
  ArrowUpDown,
  Info,
  AlertOctagon,
  Lightbulb,
  Search,
  Check,
  X,
  Target,
} from "lucide-react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  HEALTH_STATUS_CONFIG,
  RadiographyHealthStatus,
} from "@/types/radiography";
import {
  HealthCurrentItem,
  HealthHistoryEntry,
  StructuredAlert,
  ChangeFlag,
  classifyHealth,
  getAnomalyLabel,
  PeriodDays,
} from "@/hooks/useRadiographyData";

interface Props {
  item: HealthCurrentItem | null;
  open: boolean;
  onClose: () => void;
  fetchHistory: (itemId: string, days: PeriodDays) => Promise<HealthHistoryEntry[]>;
  selectedPeriod: PeriodDays;
}

export function RadiographyDetailPanel({ item, open, onClose, fetchHistory, selectedPeriod }: Props) {
  const [history, setHistory] = useState<HealthHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodDays>(selectedPeriod);

  const loadHistory = useCallback(async () => {
    if (!item) return;
    setHistoryLoading(true);
    try {
      const data = await fetchHistory(item.item_id, period);
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [item, period, fetchHistory]);

  useEffect(() => {
    if (open && item) {
      setPeriod(selectedPeriod);
      loadHistory();
    }
  }, [open, item?.item_id]);

  useEffect(() => {
    if (open && item) {
      loadHistory();
    }
  }, [period]);

  if (!item) return null;

  const health = classifyHealth(item);
  const config = HEALTH_STATUS_CONFIG[health];
  const hasAnomalies = !!item.anomaly_flags?.length;

  const HealthIcon = ({ status }: { status: RadiographyHealthStatus }) => {
    const iconMap = { healthy: HeartPulse, stable: Activity, observation: Stethoscope, alert: AlertTriangle, critical: Siren };
    const Icon = iconMap[status];
    return <Icon className="h-5 w-5" />;
  };

  // Chart data
  const chartData = history.map((h) => ({
    date: format(new Date(h.collected_at), "dd/MM", { locale: ptBR }),
    fullDate: h.collected_at,
    visits: h.visits ?? 0,
    price: h.price ?? 0,
    stock: h.available_quantity ?? 0,
  }));

  // Evolution calculations
  const visitEvolution = history.length >= 2
    ? ((history[history.length - 1].visits ?? 0) - (history[0].visits ?? 0))
    : null;
  const priceEvolution = history.length >= 2
    ? ((history[history.length - 1].price ?? 0) - (history[0].price ?? 0))
    : null;
  const stockEvolution = history.length >= 2
    ? ((history[history.length - 1].available_quantity ?? 0) - (history[0].available_quantity ?? 0))
    : null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg text-sm">
        <p className="font-medium text-slate-200 mb-1">
          {format(new Date(d.fullDate), "dd 'de' MMMM, yyyy", { locale: ptBR })}
        </p>
        <div className="space-y-1 text-slate-300">
          <div className="flex items-center gap-2"><Eye className="h-3 w-3 text-cyan-400" />{d.visits.toLocaleString("pt-BR")} visitas</div>
          <div>R$ {d.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
          <div>Estoque: {d.stock}</div>
        </div>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 bg-slate-900 border-slate-700">
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-start gap-4">
            <div className="relative flex-shrink-0">
              {item.thumbnail ? (
                <div className="relative">
                  <img src={item.thumbnail} alt={item.title || ""} className="h-16 w-16 object-cover rounded-md" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent rounded-md" />
                </div>
              ) : (
                <div className="h-16 w-16 bg-slate-800 rounded-md flex items-center justify-center border border-slate-700">
                  <Package className="h-8 w-8 text-slate-600" />
                </div>
              )}
              <div className={`absolute -bottom-2 -right-2 h-8 w-8 rounded-full ${config.bgClass} border-2 border-slate-900 flex items-center justify-center ${config.colorClass}`}>
                <HealthIcon status={health} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg leading-tight mb-1 text-slate-100">
                {item.title || item.item_id}
              </SheetTitle>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="font-mono">{item.item_id}</span>
                {item.permalink && (
                  <a href={item.permalink} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                    Ver anúncio <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={`${config.bgClass} ${config.colorClass} ${config.borderClass}`}>
                  {config.label}
                </Badge>
                {item.catalog_listing && (
                  <Badge variant="outline" className="border-violet-500/30 text-violet-400">Catálogo</Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="p-6 space-y-6">
            {/* Current snapshot */}
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Visitas (7d)" value={item.visits_last != null ? item.visits_last.toLocaleString("pt-BR") : "—"} icon={<Eye className="h-3 w-3 text-cyan-400" />} />
              <MiniStat label="Preço" value={item.price != null ? `R$ ${item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"} />
              <MiniStat label="Estoque" value={item.available_quantity != null ? String(item.available_quantity) : "—"} />
            </div>

            {/* Sales metrics */}
            <div className="grid grid-cols-4 gap-3">
              <MiniStat
                label="Vendas (7d)"
                value={String(item.sales_count_7d ?? 0)}
                icon={<ShoppingCart className="h-3 w-3 text-emerald-400" />}
              />
              <MiniStat
                label="Vendas (30d)"
                value={String(item.sales_count_30d ?? 0)}
                icon={<ShoppingCart className="h-3 w-3 text-emerald-400" />}
              />
              <MiniStat
                label="Conversão (7d)"
                value={item.conversion_rate_7d != null ? `${item.conversion_rate_7d.toFixed(1)}%` : "—"}
                icon={<BarChart3 className="h-3 w-3 text-violet-400" />}
              />
              <MiniStat
                label="Dias s/ venda"
                value={item.days_without_sale != null ? String(item.days_without_sale) : "—"}
                icon={<Clock className="h-3 w-3 text-amber-400" />}
                highlight={item.days_without_sale != null && item.days_without_sale > 14}
              />
            </div>

            {/* Recent Changes */}
            {item.change_flags && item.change_flags.length > 0 && (
              <Card className="bg-amber-500/5 border-amber-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    Mudanças Recentes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.change_flags.map((change, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                        change.severity === "critical" ? "bg-red-400" :
                        change.severity === "high" ? "bg-orange-400" :
                        change.severity === "medium" ? "bg-amber-400" :
                        "bg-slate-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200">{change.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{change.detail}</div>
                      </div>
                      <Badge variant="outline" className={`text-xs flex-shrink-0 ${
                        change.severity === "critical" ? "border-red-500/30 text-red-400" :
                        change.severity === "high" ? "border-orange-500/30 text-orange-400" :
                        "border-amber-500/30 text-amber-400"
                      }`}>
                        {change.severity}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Structured Alerts (explained) */}
            {item.alerts_json && item.alerts_json.length > 0 && (
              <Card className="bg-red-500/5 border-red-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-400 flex items-center gap-2">
                    <AlertOctagon className="h-4 w-4" />
                    Alertas Explicados ({item.alerts_json.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {item.alerts_json.map((alert, idx) => (
                    <div key={idx} className="border-l-2 pl-3 py-1 space-y-1" style={{
                      borderColor: alert.severity === "critical" ? "#f87171" :
                        alert.severity === "high" ? "#fb923c" :
                        alert.severity === "medium" ? "#fbbf24" : "#94a3b8"
                    }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200">{alert.title}</span>
                        <Badge variant="outline" className={`text-xs ${
                          alert.severity === "critical" ? "border-red-500/30 text-red-400" :
                          alert.severity === "high" ? "border-orange-500/30 text-orange-400" :
                          "border-amber-500/30 text-amber-400"
                        }`}>
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{alert.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Legacy anomaly flags (fallback if no structured alerts) */}
            {hasAnomalies && (!item.alerts_json || item.alerts_json.length === 0) && (
              <Card className="bg-red-500/5 border-red-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Anomalias Detectadas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {item.anomaly_flags!.map((flag) => (
                    <div key={flag} className="flex items-center gap-2 text-sm text-slate-300">
                      <div className="h-2 w-2 rounded-full bg-red-400" />
                      {getAnomalyLabel(flag)}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Evolution metrics */}
            {history.length >= 2 && (
              <div className="grid grid-cols-3 gap-3">
                <EvolutionCard label="Visitas" delta={visitEvolution} />
                <EvolutionCard label="Preço" delta={priceEvolution} isCurrency />
                <EvolutionCard label="Estoque" delta={stockEvolution} />
              </div>
            )}

            {/* History Chart */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scan className="h-4 w-4 text-cyan-400" />
                    <CardTitle className="text-sm text-slate-200">Histórico de Visitas</CardTitle>
                  </div>
                  <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v) as PeriodDays)}>
                    <SelectTrigger className="w-[120px] h-8 bg-slate-800/50 border-slate-700 text-slate-200 text-xs">
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
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <Skeleton className="h-[250px] w-full bg-slate-700" />
                ) : chartData.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center text-slate-500 text-sm">
                    Histórico sendo carregado. Os dados aparecerão conforme a coleta avança.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#475569" />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} stroke="#475569" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                      <Tooltip content={<CustomTooltip />} />
                      <defs>
                        <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="visits" fill="url(#visitGrad)" stroke="none" />
                      <Line type="monotone" dataKey="visits" stroke="#22d3ee" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: "#22d3ee" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({ label, value, icon, highlight }: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={`border-slate-700 ${highlight ? "bg-red-500/5 border-red-500/20" : "bg-slate-800/50"}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
          {icon}
          {label}
        </div>
        <div className={`text-sm font-bold font-mono ${highlight ? "text-red-400" : "text-slate-200"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function EvolutionCard({ label, delta, isCurrency }: { label: string; delta: number | null; isCurrency?: boolean }) {
  if (delta == null) return null;
  const isPositive = delta > 0;
  const isZero = delta === 0;
  const color = isZero ? "text-slate-400" : isPositive ? "text-emerald-400" : "text-red-400";
  const Icon = isZero ? Activity : isPositive ? TrendingUp : TrendingDown;
  const formatted = isCurrency
    ? `R$ ${Math.abs(delta).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : Math.abs(delta).toLocaleString("pt-BR");

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="p-3">
        <div className="text-xs text-slate-400 mb-1">{label}</div>
        <div className={`flex items-center gap-1 text-sm font-bold ${color}`}>
          <Icon className="h-3 w-3" />
          {isPositive ? "+" : isZero ? "" : "-"}{formatted}
        </div>
      </CardContent>
    </Card>
  );
}
