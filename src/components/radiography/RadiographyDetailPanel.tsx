import { useEffect, useState, useCallback, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Eye, TrendingUp, TrendingDown, Package, ExternalLink, HeartPulse,
  Activity, AlertTriangle, Stethoscope, Siren, ShoppingCart, Clock,
  BarChart3, ArrowUpDown, AlertOctagon, Lightbulb, Search, Check,
  X, Target, Scan, ChevronRight, Zap, Image, Video, FileText,
  ListChecks, Tag,
} from "lucide-react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Area,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HEALTH_STATUS_CONFIG, RadiographyHealthStatus } from "@/types/radiography";
import {
  HealthCurrentItem, HealthHistoryEntry, StructuredAlert, ChangeFlag,
  SeoAnalysis, classifyHealth, getAnomalyLabel, PeriodDays,
} from "@/hooks/useRadiographyData";

interface Props {
  item: HealthCurrentItem | null;
  open: boolean;
  onClose: () => void;
  fetchHistory: (itemId: string, days: PeriodDays) => Promise<HealthHistoryEntry[]>;
  selectedPeriod: PeriodDays;
}

// --- Health score breakdown ---
interface HealthFactor {
  label: string;
  icon: React.ReactNode;
  status: "good" | "warning" | "bad" | "neutral";
  detail: string;
}

function getHealthBreakdown(item: HealthCurrentItem): HealthFactor[] {
  const factors: HealthFactor[] = [];
  const visits = item.visits_last;
  const stock = item.available_quantity;
  const sales30 = item.sales_count_30d;
  const conv = item.conversion_rate_7d;
  const daysNoSale = item.days_without_sale;
  const seo = item.seo_score;

  // Traffic
  if (visits == null || visits < 0) {
    factors.push({ label: "Tráfego", icon: <Eye className="h-3.5 w-3.5" />, status: "neutral", detail: "Sem dados" });
  } else if (visits === 0) {
    factors.push({ label: "Tráfego", icon: <Eye className="h-3.5 w-3.5" />, status: "bad", detail: "Zero visitas" });
  } else if (visits < 10) {
    factors.push({ label: "Tráfego", icon: <Eye className="h-3.5 w-3.5" />, status: "warning", detail: `${visits} visitas` });
  } else {
    factors.push({ label: "Tráfego", icon: <Eye className="h-3.5 w-3.5" />, status: "good", detail: `${visits} visitas` });
  }

  // Sales
  if (sales30 == null) {
    factors.push({ label: "Vendas (30d)", icon: <ShoppingCart className="h-3.5 w-3.5" />, status: "neutral", detail: "Sem dados" });
  } else if (sales30 === 0) {
    factors.push({ label: "Vendas (30d)", icon: <ShoppingCart className="h-3.5 w-3.5" />, status: "bad", detail: "Nenhuma venda" });
  } else {
    factors.push({ label: "Vendas (30d)", icon: <ShoppingCart className="h-3.5 w-3.5" />, status: "good", detail: `${sales30} vendas` });
  }

  // Conversion
  if (conv != null && visits != null && visits > 20) {
    if (conv < 0.5) {
      factors.push({ label: "Conversão", icon: <BarChart3 className="h-3.5 w-3.5" />, status: "bad", detail: `${conv.toFixed(1)}%` });
    } else if (conv < 2) {
      factors.push({ label: "Conversão", icon: <BarChart3 className="h-3.5 w-3.5" />, status: "warning", detail: `${conv.toFixed(1)}%` });
    } else {
      factors.push({ label: "Conversão", icon: <BarChart3 className="h-3.5 w-3.5" />, status: "good", detail: `${conv.toFixed(1)}%` });
    }
  }

  // Days without sale
  if (daysNoSale != null && daysNoSale > 0) {
    if (daysNoSale > 30) {
      factors.push({ label: "Inatividade", icon: <Clock className="h-3.5 w-3.5" />, status: "bad", detail: `${daysNoSale} dias sem venda` });
    } else if (daysNoSale > 14) {
      factors.push({ label: "Inatividade", icon: <Clock className="h-3.5 w-3.5" />, status: "warning", detail: `${daysNoSale} dias sem venda` });
    } else {
      factors.push({ label: "Inatividade", icon: <Clock className="h-3.5 w-3.5" />, status: "neutral", detail: `${daysNoSale} dias sem venda` });
    }
  }

  // Stock
  if (stock === 0) {
    factors.push({ label: "Estoque", icon: <Package className="h-3.5 w-3.5" />, status: "bad", detail: "Zerado" });
  } else if (stock != null && stock < 3) {
    factors.push({ label: "Estoque", icon: <Package className="h-3.5 w-3.5" />, status: "warning", detail: `${stock} unidades` });
  } else if (stock != null) {
    factors.push({ label: "Estoque", icon: <Package className="h-3.5 w-3.5" />, status: "good", detail: `${stock} unidades` });
  }

  // SEO
  if (seo != null) {
    if (seo < 40) {
      factors.push({ label: "SEO", icon: <Search className="h-3.5 w-3.5" />, status: "bad", detail: `Score ${seo}` });
    } else if (seo < 70) {
      factors.push({ label: "SEO", icon: <Search className="h-3.5 w-3.5" />, status: "warning", detail: `Score ${seo}` });
    } else {
      factors.push({ label: "SEO", icon: <Search className="h-3.5 w-3.5" />, status: "good", detail: `Score ${seo}` });
    }
  }

  // Logistics
  if (item.shipping_mode === "me2" || item.listing_type === "gold_pro") {
    factors.push({ label: "Logística", icon: <Zap className="h-3.5 w-3.5" />, status: "good", detail: "Full / Premium" });
  } else if (item.shipping_mode) {
    factors.push({ label: "Logística", icon: <Zap className="h-3.5 w-3.5" />, status: "neutral", detail: item.shipping_mode });
  }

  // Catalog
  if (item.catalog_listing) {
    factors.push({ label: "Catálogo", icon: <Tag className="h-3.5 w-3.5" />, status: "good", detail: "Participando" });
  }

  return factors;
}

// --- Recommendations ---
interface Recommendation {
  action: string;
  reason: string;
  priority: "high" | "medium" | "low";
  icon: React.ReactNode;
}

function buildRecommendations(item: HealthCurrentItem): Recommendation[] {
  const recs: Recommendation[] = [];
  const flags = item.anomaly_flags || [];
  const alerts = item.alerts_json || [];
  const seo = item.seo_score;

  if (flags.includes("zero_visits") || flags.includes("visit_drop")) {
    recs.push({ action: "Revisar título e fotos", reason: "Sem tráfego ou queda acentuada de visitas", priority: "high", icon: <Image className="h-4 w-4" /> });
  }

  if (flags.includes("visits_no_conversion") || flags.includes("low_conversion")) {
    recs.push({ action: "Revisar preço e condições", reason: "Recebe visitas mas não converte em vendas", priority: "high", icon: <BarChart3 className="h-4 w-4" /> });
  }

  if (flags.includes("no_sales_30d") || flags.includes("no_sales_14d")) {
    recs.push({ action: "Avaliar competitividade", reason: `Sem vendas há ${item.days_without_sale ?? "muitos"} dias`, priority: "high", icon: <ShoppingCart className="h-4 w-4" /> });
  }

  if (item.available_quantity === 0) {
    recs.push({ action: "Reforçar estoque", reason: "Estoque zerado impede vendas", priority: "high", icon: <Package className="h-4 w-4" /> });
  }

  if (seo != null && seo < 40) {
    recs.push({ action: "Otimizar palavras-chave", reason: "Score de SEO baixo — título pode estar fraco", priority: "medium", icon: <Search className="h-4 w-4" /> });
  }

  if (item.shipping_mode !== "me2" && item.listing_type !== "gold_pro") {
    recs.push({ action: "Considerar Full ou Premium", reason: "Logística avançada melhora relevância", priority: "low", icon: <Zap className="h-4 w-4" /> });
  }

  if (!item.catalog_listing) {
    recs.push({ action: "Tentar vincular ao catálogo", reason: "Catálogo aumenta exposição e confiança", priority: "low", icon: <Tag className="h-4 w-4" /> });
  }

  // Change-driven recommendations
  const changes = item.change_flags || [];
  if (changes.some(c => c.type === "price_increased")) {
    recs.push({ action: "Monitorar impacto do aumento de preço", reason: "Preço subiu recentemente — pode afetar conversão", priority: "medium", icon: <TrendingUp className="h-4 w-4" /> });
  }

  return recs.sort((a, b) => {
    const p: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (p[a.priority] ?? 3) - (p[b.priority] ?? 3);
  });
}

const factorStatusStyles = {
  good: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  bad: "text-red-400 bg-red-500/10 border-red-500/20",
  neutral: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

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
    if (open && item) { setPeriod(selectedPeriod); loadHistory(); }
  }, [open, item?.item_id]);

  useEffect(() => {
    if (open && item) loadHistory();
  }, [period]);

  if (!item) return null;

  const health = classifyHealth(item);
  const config = HEALTH_STATUS_CONFIG[health];
  const healthFactors = getHealthBreakdown(item);
  const recommendations = buildRecommendations(item);
  const allAlerts = [
    ...(item.alerts_json || []),
    ...((item.anomaly_flags || [])
      .filter(f => !(item.alerts_json || []).some(a => a.type === f))
      .map(f => ({ type: f, severity: "medium", title: getAnomalyLabel(f), description: "", context: {} } as StructuredAlert))),
  ];
  const changes = item.change_flags || [];

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

  // Evolution
  const calcDelta = (key: "visits" | "price" | "available_quantity") =>
    history.length >= 2 ? ((history[history.length - 1][key] ?? 0) - (history[0][key] ?? 0)) : null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg text-sm">
        <p className="font-medium text-slate-200 mb-1">{format(new Date(d.fullDate), "dd 'de' MMMM, yyyy", { locale: ptBR })}</p>
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
        {/* HEADER */}
        <SheetHeader className="p-5 pb-4 border-b border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-start gap-3">
            <div className="relative flex-shrink-0">
              {item.thumbnail ? (
                <img src={item.thumbnail} alt="" className="h-14 w-14 object-cover rounded-md" />
              ) : (
                <div className="h-14 w-14 bg-slate-800 rounded-md flex items-center justify-center border border-slate-700">
                  <Package className="h-7 w-7 text-slate-600" />
                </div>
              )}
              <div className={`absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full ${config.bgClass} border-2 border-slate-900 flex items-center justify-center ${config.colorClass}`}>
                <HealthIcon status={health} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight mb-1 text-slate-100">{item.title || item.item_id}</SheetTitle>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="font-mono">{item.item_id}</span>
                {item.permalink && (
                  <a href={item.permalink} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                    Ver <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Badge className={`text-xs ${config.bgClass} ${config.colorClass} ${config.borderClass}`}>{config.label}</Badge>
                {item.catalog_listing && <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400">Catálogo</Badge>}
                {item.listing_status && item.listing_status !== "active" && (
                  <Badge variant="outline" className="text-xs border-red-500/30 text-red-400">{item.listing_status}</Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-160px)]">
          <div className="p-5 space-y-5">
            {/* SECTION 1 — Summary metrics */}
            <div className="grid grid-cols-4 gap-2">
              <MiniStat label="Visitas" value={item.visits_last != null ? item.visits_last.toLocaleString("pt-BR") : "—"} icon={<Eye className="h-3 w-3 text-cyan-400" />} />
              <MiniStat label="Vendas (30d)" value={String(item.sales_count_30d ?? 0)} icon={<ShoppingCart className="h-3 w-3 text-emerald-400" />} />
              <MiniStat label="Conversão" value={item.conversion_rate_7d != null ? `${item.conversion_rate_7d.toFixed(1)}%` : "—"} icon={<BarChart3 className="h-3 w-3 text-violet-400" />} />
              <MiniStat label="Dias s/ venda" value={item.days_without_sale != null ? String(item.days_without_sale) : "—"} icon={<Clock className="h-3 w-3 text-amber-400" />} highlight={item.days_without_sale != null && item.days_without_sale > 14} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Preço" value={item.price != null ? `R$ ${item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"} />
              <MiniStat label="Estoque" value={item.available_quantity != null ? String(item.available_quantity) : "—"} highlight={item.available_quantity === 0} />
              <MiniStat label="Vendas (7d)" value={String(item.sales_count_7d ?? 0)} icon={<ShoppingCart className="h-3 w-3 text-emerald-400" />} />
            </div>

            {/* SECTION 2 — Health breakdown */}
            <SectionCard title="Fatores de Saúde" icon={<HeartPulse className="h-4 w-4 text-cyan-400" />} subtitle={config.description}>
              <div className="grid grid-cols-2 gap-1.5">
                {healthFactors.map((f, i) => (
                  <div key={i} className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${factorStatusStyles[f.status]}`}>
                    {f.icon}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{f.label}</span>
                      <span className="ml-1.5 opacity-80">{f.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* SECTION 3 — Alerts */}
            {allAlerts.length > 0 && (
              <SectionCard title={`Alertas (${allAlerts.length})`} icon={<AlertOctagon className="h-4 w-4 text-red-400" />}>
                <div className="space-y-2.5">
                  {allAlerts.map((alert, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                        alert.severity === "critical" ? "bg-red-400" :
                        alert.severity === "high" ? "bg-orange-400" :
                        alert.severity === "medium" ? "bg-amber-400" : "bg-slate-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200">{alert.title}</div>
                        {alert.description && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{alert.description}</p>}
                      </div>
                      <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${
                        alert.severity === "critical" ? "border-red-500/30 text-red-400" :
                        alert.severity === "high" ? "border-orange-500/30 text-orange-400" :
                        "border-amber-500/30 text-amber-400"
                      }`}>
                        {alert.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* SECTION 4 — Recent Changes */}
            {changes.length > 0 && (
              <SectionCard title="Mudanças Recentes" icon={<ArrowUpDown className="h-4 w-4 text-amber-400" />}>
                <div className="space-y-2">
                  {changes.map((change, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-sm">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        change.severity === "critical" ? "bg-red-400" :
                        change.severity === "high" ? "bg-orange-400" :
                        change.severity === "medium" ? "bg-amber-400" : "bg-slate-400"
                      }`} />
                      <span className="font-medium text-slate-200">{change.label}</span>
                      <span className="text-xs text-slate-400 flex-1">{change.detail}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* SECTION 5 — History Chart */}
            <SectionCard
              title="Histórico de Visitas"
              icon={<Scan className="h-4 w-4 text-cyan-400" />}
              action={
                <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v) as PeriodDays)}>
                  <SelectTrigger className="w-24 h-7 bg-slate-800/50 border-slate-700 text-slate-200 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {([7, 15, 30, 60, 150] as PeriodDays[]).map(p => (
                      <SelectItem key={p} value={String(p)} className="text-slate-200 focus:text-slate-100 focus:bg-slate-700">{p} dias</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              {historyLoading ? (
                <Skeleton className="h-[200px] w-full bg-slate-700" />
              ) : chartData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
                  Histórico será preenchido conforme a coleta avança.
                </div>
              ) : (
                <>
                  {/* Evolution deltas */}
                  {history.length >= 2 && (
                    <div className="flex items-center gap-3 mb-3">
                      <EvolutionPill label="Visitas" delta={calcDelta("visits")} />
                      <EvolutionPill label="Preço" delta={calcDelta("price")} isCurrency />
                      <EvolutionPill label="Estoque" delta={calcDelta("available_quantity")} />
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#475569" />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#475569" tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <defs>
                        <linearGradient id="visitGradDetail" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="visits" fill="url(#visitGradDetail)" stroke="none" />
                      <Line type="monotone" dataKey="visits" stroke="#22d3ee" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#22d3ee" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </>
              )}
            </SectionCard>

            {/* SECTION 6 — SEO */}
            {item.seo_analysis_json && (
              <SeoAnalysisCard seo={item.seo_analysis_json} score={item.seo_score} found={item.seo_keywords_found} missing={item.seo_keywords_missing} />
            )}

            {/* SECTION 7 — Recommendations */}
            {recommendations.length > 0 && (
              <SectionCard title="Recomendações" icon={<Lightbulb className="h-4 w-4 text-amber-400" />}>
                <div className="space-y-2">
                  {recommendations.map((rec, idx) => (
                    <div key={idx} className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                      rec.priority === "high" ? "bg-red-500/5 border-red-500/15" :
                      rec.priority === "medium" ? "bg-amber-500/5 border-amber-500/15" :
                      "bg-slate-800/30 border-slate-700/50"
                    }`}>
                      <div className={`mt-0.5 ${
                        rec.priority === "high" ? "text-red-400" :
                        rec.priority === "medium" ? "text-amber-400" :
                        "text-slate-400"
                      }`}>
                        {rec.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200">{rec.action}</div>
                        <p className="text-xs text-slate-400 mt-0.5">{rec.reason}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${
                        rec.priority === "high" ? "border-red-500/30 text-red-400" :
                        rec.priority === "medium" ? "border-amber-500/30 text-amber-400" :
                        "border-slate-600 text-slate-500"
                      }`}>
                        {rec.priority === "high" ? "alta" : rec.priority === "medium" ? "média" : "baixa"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// --- Sub-components ---

function SectionCard({ title, icon, subtitle, action, children }: {
  title: string; icon: React.ReactNode; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Card className="bg-slate-800/40 border-slate-700/50">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-sm text-slate-200">{title}</CardTitle>
          </div>
          {action}
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
    </Card>
  );
}

function MiniStat({ label, value, icon, highlight }: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${highlight ? "bg-red-500/5 border-red-500/20" : "bg-slate-800/40 border-slate-700/40"}`}>
      <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-0.5">{icon}{label}</div>
      <div className={`text-sm font-bold font-mono ${highlight ? "text-red-400" : "text-slate-200"}`}>{value}</div>
    </div>
  );
}

function EvolutionPill({ label, delta, isCurrency }: { label: string; delta: number | null; isCurrency?: boolean }) {
  if (delta == null) return null;
  const isPositive = delta > 0;
  const isZero = delta === 0;
  const color = isZero ? "text-slate-400" : isPositive ? "text-emerald-400" : "text-red-400";
  const formatted = isCurrency
    ? `R$ ${Math.abs(delta).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : Math.abs(delta).toLocaleString("pt-BR");
  const Icon = isZero ? Activity : isPositive ? TrendingUp : TrendingDown;
  return (
    <div className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="font-mono">{isPositive ? "+" : isZero ? "" : "-"}{formatted}</span>
      <span className="text-slate-500">{label}</span>
    </div>
  );
}

function SeoAnalysisCard({ seo, score, found, missing }: { seo: SeoAnalysis; score: number | null; found: string[] | null; missing: string[] | null }) {
  const scoreVal = score ?? seo.score ?? 0;
  const scoreColor = scoreVal >= 70 ? "text-emerald-400" : scoreVal >= 40 ? "text-amber-400" : "text-red-400";
  const scoreBorder = scoreVal >= 70 ? "border-emerald-500/20" : scoreVal >= 40 ? "border-amber-500/20" : "border-red-500/20";
  const foundKws = found || [];
  const missingKws = missing || [];
  const relevantDetails = seo.details?.filter(d => d.relevance !== "low") || [];

  return (
    <SectionCard
      title="Análise de SEO"
      icon={<Search className="h-4 w-4 text-cyan-400" />}
      action={
        <div className="flex items-center gap-1">
          <span className={`text-xl font-bold font-mono ${scoreColor}`}>{scoreVal}</span>
          <span className="text-xs text-slate-500">/100</span>
        </div>
      }
      subtitle={`Baseado nas ${seo.total_trending_keywords} palavras mais buscadas em ${seo.l1_category_name || seo.category_name}`}
    >
      <div className="space-y-3">
        {foundKws.length > 0 && (
          <div>
            <div className="text-xs font-medium text-emerald-400 mb-1.5 flex items-center gap-1">
              <Check className="h-3 w-3" /> Encontradas no título ({foundKws.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {foundKws.map((kw) => (
                <Badge key={kw} variant="outline" className="text-xs border-emerald-500/30 text-emerald-300 bg-emerald-500/5">{kw}</Badge>
              ))}
            </div>
          </div>
        )}

        {missingKws.length > 0 && (
          <div>
            <div className="text-xs font-medium text-amber-400 mb-1.5 flex items-center gap-1">
              <Target className="h-3 w-3" /> Oportunidades ({missingKws.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {missingKws.map((kw) => (
                <Badge key={kw} variant="outline" className="text-xs border-amber-500/30 text-amber-300 bg-amber-500/5">{kw}</Badge>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Avalie quais dessas palavras realmente representam este produto. Nem toda palavra com alto volume é aderente ao seu anúncio.
            </p>
          </div>
        )}

        {relevantDetails.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1.5">Detalhes ({relevantDetails.length})</div>
            <div className="space-y-0.5 max-h-[160px] overflow-y-auto">
              {relevantDetails.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-800/50">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {d.found_in_title ? <Check className="h-3 w-3 text-emerald-400 flex-shrink-0" /> : <X className="h-3 w-3 text-slate-500 flex-shrink-0" />}
                    <span className={d.found_in_title ? "text-slate-200" : "text-slate-400"}>{d.keyword}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${d.relevance === "high" ? "border-cyan-500/30 text-cyan-400" : "border-slate-600 text-slate-500"}`}>
                    {d.relevance === "high" ? "alta" : "média"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {foundKws.length === 0 && missingKws.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">Nenhuma palavra relevante encontrada para análise.</p>
        )}
      </div>
    </SectionCard>
  );
}
