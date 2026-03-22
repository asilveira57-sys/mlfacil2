import { useEffect, useState, useCallback, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CopyMlbId } from "@/components/ui/CopyMlbId";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Eye, TrendingUp, TrendingDown, Package, ExternalLink, HeartPulse,
  Activity, AlertTriangle, Stethoscope, Siren, ShoppingCart, Clock,
  BarChart3, ArrowUpDown, AlertOctagon, Lightbulb, Search, Check,
  X, Target, Scan, Zap, Image, Video, Tag, Camera, Truck, Megaphone,
  Copy, RefreshCw, Loader2, ThumbsUp, ThumbsDown, Sparkles, Type,
  FileText, ClipboardList, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Area,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HEALTH_STATUS_CONFIG, RadiographyHealthStatus } from "@/types/radiography";
import {
  HealthCurrentItem, HealthHistoryEntry, VisitSeriesEntry, StructuredAlert, ChangeFlag,
  SeoAnalysis, classifyHealth, getAnomalyLabel, PeriodDays, CoverageInfo, computeCoverage,
  MAIN_PROBLEM_LABELS, getLogisticsLabel,
} from "@/hooks/useRadiographyData";

interface Props {
  item: HealthCurrentItem | null;
  open: boolean;
  onClose: () => void;
  fetchHistory: (itemId: string, days: PeriodDays) => Promise<HealthHistoryEntry[]>;
  fetchVisitSeries: (itemId: string, days: PeriodDays) => Promise<VisitSeriesEntry[]>;
  selectedPeriod: PeriodDays;
}

// --- Smart Recommendations (with blocking logic) ---
interface Recommendation {
  action: string;
  reason: string;
  priority: "high" | "medium" | "low";
  icon: React.ReactNode;
}

function buildSmartRecommendations(item: HealthCurrentItem): Recommendation[] {
  const recs: Recommendation[] = [];
  const flags = item.anomaly_flags || [];
  const isFull = getLogisticsLabel(item).isFull;
  const hasCatalog = !!(item.catalog_listing || item.catalog_product_id);
  const hasVideo = !!item.has_video;
  const photosCount = item.photos_count ?? 0;
  const coverageOk = item.data_coverage_status !== "insufficient";
  const visits = item.visits_period ?? item.visits_last ?? item.visits_30d ?? 0;
  const hasTraffic = visits >= 20;
  const isHealthy = (item.health_score ?? 0) > 80;

  // Stock — always show
  if (item.available_quantity === 0) {
    recs.push({ action: "Repor estoque imediatamente", reason: "Estoque zerado impede vendas e perde posicionamento", priority: "high", icon: <Package className="h-4 w-4" /> });
  }

  // Exposure-first: if no traffic AND no ADS/promo, suggest exposure
  if (!hasTraffic && !item.is_ads_active && !item.is_promotion_active) {
    recs.push({ action: "Ativar publicidade (ADS) ou promoção", reason: "Sem tráfego e sem estratégia de exposição ativa", priority: "high", icon: <Megaphone className="h-4 w-4" /> });
  }

  // ADS active but no traffic = campaign performance issue
  if (!hasTraffic && item.is_ads_active) {
    recs.push({ action: "Revisar campanha de ADS", reason: "ADS ativo mas sem gerar tráfego relevante — ajustar campanha ou atratividade", priority: "high", icon: <Megaphone className="h-4 w-4" /> });
  }

  // Traffic issues
  if (hasTraffic && (flags.includes("zero_visits") || flags.includes("visit_drop"))) {
    recs.push({ action: "Revisar título e fotos para melhorar descoberta", reason: "Queda acentuada de visitas detectada", priority: "high", icon: <Image className="h-4 w-4" /> });
  }

  // Conversion issues — ONLY if there IS traffic
  if (hasTraffic && (flags.includes("visits_no_conversion") || flags.includes("low_conversion"))) {
    recs.push({ action: "Revisar preço, fotos e condições de venda", reason: "Recebe visitas mas não converte em vendas", priority: "high", icon: <BarChart3 className="h-4 w-4" /> });
  }

  // No sales
  if (flags.includes("no_sales_30d") || flags.includes("no_sales_14d")) {
    recs.push({ action: "Avaliar competitividade do anúncio", reason: `Sem vendas há ${item.days_without_sale ?? "muitos"} dias`, priority: "high", icon: <ShoppingCart className="h-4 w-4" /> });
  }

  // SEO — only if has some traffic context
  if (item.seo_score != null && item.seo_score < 40 && hasTraffic) {
    recs.push({ action: "Otimizar título com palavras-chave relevantes", reason: "Score SEO baixo — título pode estar fraco para buscas", priority: "medium", icon: <Search className="h-4 w-4" /> });
  }

  // BLOCK: Media suggestions only if has traffic (no point improving content without visibility)
  if (hasTraffic) {
    if (!hasVideo) {
      recs.push({ action: "Adicionar vídeo ao anúncio", reason: "Anúncios com vídeo convertem até 20% mais", priority: isHealthy ? "low" : "medium", icon: <Video className="h-4 w-4" /> });
    }
    if (photosCount < 5 && photosCount > 0) {
      recs.push({ action: `Adicionar mais fotos (atualmente ${photosCount})`, reason: "Recomendado ter pelo menos 5 fotos de qualidade", priority: isHealthy ? "low" : "medium", icon: <Camera className="h-4 w-4" /> });
    }
  }

  // SMART BLOCK: Only suggest Full if NOT already Full and data is confirmed
  if (!isFull && coverageOk) {
    recs.push({ action: "Considerar envio por Fulfillment (Full)", reason: "Logística Full melhora relevância e tempo de entrega", priority: isHealthy ? "low" : "low", icon: <Zap className="h-4 w-4" /> });
  }

  // SMART BLOCK: Only suggest Catalog if NOT already in catalog
  if (!hasCatalog && coverageOk) {
    recs.push({ action: "Tentar vincular ao catálogo oficial", reason: "Catálogo aumenta exposição e confiança do comprador", priority: isHealthy ? "low" : "low", icon: <Tag className="h-4 w-4" /> });
  }

  // Promo suggestion — only if good conversion and has traffic
  if (!item.is_promotion_active && hasTraffic && (item.conversion_rate_7d ?? 0) >= 1) {
    recs.push({ action: "Considerar participar de promoções", reason: "Boa conversão — promoções podem escalar vendas", priority: "low", icon: <BarChart3 className="h-4 w-4" /> });
  }

  // Wholesale suggestion — only for eligible CNPJ accounts without active wholesale
  const wa = item.wholesale_analysis_json;
  if (wa && wa.is_eligible && wa.status !== 'active') {
    recs.push({ action: "Configurar preço de atacado", reason: "Sua conta CNPJ permite preço por quantidade — aumente vendas em volume", priority: hasTraffic ? "medium" : "low", icon: <Package className="h-4 w-4" /> });
  }

  // Price change monitoring
  const changes = item.change_flags || [];
  if (changes.some(c => c.type === "price_increased")) {
    recs.push({ action: "Monitorar impacto do aumento de preço", reason: "Preço subiu recentemente — pode afetar conversão", priority: "medium", icon: <TrendingUp className="h-4 w-4" /> });
  }

  // Healthy items — classify as "otimização leve"
  if (isHealthy && recs.length > 0) {
    recs.forEach(r => { if (r.priority !== "high") r.priority = "low"; });
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

type FactorStatus = "good" | "warning" | "bad" | "neutral";

export function RadiographyDetailPanel({ item, open, onClose, fetchHistory, fetchVisitSeries, selectedPeriod }: Props) {
  const [history, setHistory] = useState<HealthHistoryEntry[]>([]);
  const [visitSeries, setVisitSeries] = useState<VisitSeriesEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodDays>(selectedPeriod);

  const loadData = useCallback(async () => {
    if (!item) return;
    setHistoryLoading(true);
    try {
      const [histData, seriesData] = await Promise.all([
        fetchHistory(item.item_id, period),
        fetchVisitSeries(item.item_id, period),
      ]);
      setHistory(histData);
      setVisitSeries(seriesData);
    } catch {
      setHistory([]);
      setVisitSeries([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [item, period, fetchHistory, fetchVisitSeries]);

  useEffect(() => {
    if (open && item) { setPeriod(selectedPeriod); loadData(); }
  }, [open, item?.item_id]);

  useEffect(() => {
    if (open && item) loadData();
  }, [period]);

  // Chart data
  const chartData = useMemo(() => {
    if (!visitSeries.length) return [];
    const snapshotByDate = new Map<string, { price: number; stock: number }>();
    for (const h of history) {
      const dateKey = new Date(h.collected_at).toISOString().slice(0, 10);
      snapshotByDate.set(dateKey, { price: h.price ?? 0, stock: h.available_quantity ?? 0 });
    }
    const currentPrice = item?.price ?? 0;
    const currentStock = item?.available_quantity ?? 0;
    let lastKnownPrice = currentPrice;
    let lastKnownStock = currentStock;

    return visitSeries.map((v) => {
      const dateKey = v.visit_date;
      const snapshot = snapshotByDate.get(dateKey);
      if (snapshot) { lastKnownPrice = snapshot.price; lastKnownStock = snapshot.stock; }
      return {
        date: format(new Date(dateKey), "dd/MM", { locale: ptBR }),
        fullDate: dateKey,
        visits: v.visits,
        price: snapshot?.price ?? lastKnownPrice,
        stock: snapshot?.stock ?? lastKnownStock,
      };
    });
  }, [visitSeries, history, item]);

  const hasMultipleDates = chartData.length >= 2;
  const hasAnyVisits = chartData.some(d => d.visits > 0);

  const coverage = useMemo<CoverageInfo>(() => computeCoverage(visitSeries, period), [visitSeries, period]);

  if (!item) return null;

  const health = classifyHealth(item);
  const config = HEALTH_STATUS_CONFIG[health];
  const logistics = getLogisticsLabel(item);
  const hasCatalog = !!(item.catalog_listing || item.catalog_product_id);
  const problem = item.main_problem ? MAIN_PROBLEM_LABELS[item.main_problem] : null;
  const recommendations = buildSmartRecommendations(item);
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

  // Health factors
  const healthFactors: { label: string; icon: React.ReactNode; status: FactorStatus; detail: string }[] = [];

  // Traffic
  const visits = item.visits_period ?? item.visits_last;
  if (visits == null || visits < 0) healthFactors.push({ label: "Tráfego", icon: <Eye className="h-3.5 w-3.5" />, status: "neutral", detail: "Sem dados" });
  else if (visits === 0) healthFactors.push({ label: "Tráfego", icon: <Eye className="h-3.5 w-3.5" />, status: "bad", detail: "Zero visitas" });
  else if (visits < 10) healthFactors.push({ label: "Tráfego", icon: <Eye className="h-3.5 w-3.5" />, status: "warning", detail: `${visits} visitas` });
  else healthFactors.push({ label: "Tráfego", icon: <Eye className="h-3.5 w-3.5" />, status: "good", detail: `${visits.toLocaleString("pt-BR")} visitas` });

  // Sales
  const sales = item.sales_period ?? item.sales_count_30d;
  if (sales == null) healthFactors.push({ label: `Vendas (${period}d)`, icon: <ShoppingCart className="h-3.5 w-3.5" />, status: "neutral", detail: "Sem dados" });
  else if (sales === 0) healthFactors.push({ label: `Vendas (${period}d)`, icon: <ShoppingCart className="h-3.5 w-3.5" />, status: "bad", detail: "Nenhuma venda" });
  else healthFactors.push({ label: `Vendas (${period}d)`, icon: <ShoppingCart className="h-3.5 w-3.5" />, status: "good", detail: `${sales} vendas` });

  // Conversion
  const conv = item.conversion_period ?? item.conversion_rate_7d;
  if (conv != null && visits != null && visits > 20) {
    if (conv < 0.5) healthFactors.push({ label: "Conversão", icon: <BarChart3 className="h-3.5 w-3.5" />, status: "bad", detail: `${conv.toFixed(1)}%` });
    else if (conv < 2) healthFactors.push({ label: "Conversão", icon: <BarChart3 className="h-3.5 w-3.5" />, status: "warning", detail: `${conv.toFixed(1)}%` });
    else healthFactors.push({ label: "Conversão", icon: <BarChart3 className="h-3.5 w-3.5" />, status: "good", detail: `${conv.toFixed(1)}%` });
  }

  // Inactivity
  if (item.days_without_sale != null && item.days_without_sale > 0) {
    if (item.days_without_sale > 30) healthFactors.push({ label: "Inatividade", icon: <Clock className="h-3.5 w-3.5" />, status: "bad", detail: `${item.days_without_sale} dias sem venda` });
    else if (item.days_without_sale > 14) healthFactors.push({ label: "Inatividade", icon: <Clock className="h-3.5 w-3.5" />, status: "warning", detail: `${item.days_without_sale} dias sem venda` });
    else healthFactors.push({ label: "Inatividade", icon: <Clock className="h-3.5 w-3.5" />, status: "neutral", detail: `${item.days_without_sale} dias sem venda` });
  }

  // Stock
  if (item.available_quantity === 0) healthFactors.push({ label: "Estoque", icon: <Package className="h-3.5 w-3.5" />, status: "bad", detail: "Zerado" });
  else if (item.available_quantity != null && item.available_quantity < 3) healthFactors.push({ label: "Estoque", icon: <Package className="h-3.5 w-3.5" />, status: "warning", detail: `${item.available_quantity} unidades` });
  else if (item.available_quantity != null) healthFactors.push({ label: "Estoque", icon: <Package className="h-3.5 w-3.5" />, status: "good", detail: `${item.available_quantity} unidades` });

  // SEO
  if (item.seo_score != null) {
    if (item.seo_score < 40) healthFactors.push({ label: "SEO", icon: <Search className="h-3.5 w-3.5" />, status: "bad", detail: `Score ${item.seo_score}` });
    else if (item.seo_score < 70) healthFactors.push({ label: "SEO", icon: <Search className="h-3.5 w-3.5" />, status: "warning", detail: `Score ${item.seo_score}` });
    else healthFactors.push({ label: "SEO", icon: <Search className="h-3.5 w-3.5" />, status: "good", detail: `Score ${item.seo_score}` });
  }

  // Logistics
  healthFactors.push({
    label: "Logística",
    icon: <Truck className="h-3.5 w-3.5" />,
    status: logistics.isFull ? "good" : logistics.confirmed ? "neutral" : "neutral",
    detail: logistics.isFull ? "Full / Fulfillment" : logistics.confirmed ? logistics.label : "Não confirmado",
  });

  // Catalog
  healthFactors.push({
    label: "Catálogo",
    icon: <Tag className="h-3.5 w-3.5" />,
    status: hasCatalog ? "good" : "neutral",
    detail: hasCatalog ? "Participando" : "Não vinculado",
  });

  // Media - Photos
  if (item.photos_count != null) {
    healthFactors.push({
      label: "Fotos",
      icon: <Camera className="h-3.5 w-3.5" />,
      status: item.photos_count >= 5 ? "good" : item.photos_count >= 3 ? "warning" : "bad",
      detail: `${item.photos_count} fotos`,
    });
  }

  // Media - Video
  healthFactors.push({
    label: "Vídeo",
    icon: <Video className="h-3.5 w-3.5" />,
    status: item.has_video ? "good" : "warning",
    detail: item.has_video ? "Presente" : "Ausente",
  });

  // Exposure - ADS
  healthFactors.push({
    label: "ADS",
    icon: <Megaphone className="h-3.5 w-3.5" />,
    status: item.is_ads_active ? "good" : item.is_ads_active === false ? "neutral" : "neutral",
    detail: item.is_ads_active ? "Ativo" : item.is_ads_active === false ? "Inativo" : "Sem dados",
  });

  // Exposure - Promo
  healthFactors.push({
    label: "Promoção",
    icon: <BarChart3 className="h-3.5 w-3.5" />,
    status: item.is_promotion_active ? "good" : "neutral",
    detail: item.is_promotion_active ? "Em promoção" : item.is_promotion_active === false ? "Sem promoção" : "Sem dados",
  });

  // Wholesale
  const wa = item.wholesale_analysis_json;
  if (wa) {
    healthFactors.push({
      label: "Atacado",
      icon: <Package className="h-3.5 w-3.5" />,
      status: wa.status === 'active' ? "good" : wa.status === 'partial' ? "warning" : wa.status === 'not_eligible' ? "neutral" : "bad",
      detail: wa.status === 'active' ? `Ativo (${wa.ranges_count} faixas)` : wa.status === 'partial' ? 'Parcial' : wa.status === 'not_eligible' ? (wa.account_type === 'cpf' ? 'CPF' : 'Indisponível') : 'Não configurado',
    });
  }

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
                <CopyMlbId itemId={item.item_id} />
                {item.permalink && (
                  <a href={item.permalink} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                    Ver <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {/* Badges */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Badge className={`text-xs ${config.bgClass} ${config.colorClass} ${config.borderClass}`}>{config.label}</Badge>
                {item.health_score != null && (
                  <Badge variant="outline" className={`text-xs ${
                    item.health_score >= 70 ? "border-emerald-500/30 text-emerald-400" :
                    item.health_score >= 40 ? "border-amber-500/30 text-amber-400" :
                    "border-red-500/30 text-red-400"
                  }`}>
                    Score: {item.health_score}
                  </Badge>
                )}
                {problem && item.main_problem !== "healthy" && (
                  <Badge variant="outline" className={`text-xs border-slate-600 ${problem.color}`}>
                    {problem.label}
                  </Badge>
                )}
                {logistics.isFull && <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400">Full</Badge>}
                {hasCatalog && <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400">Catálogo</Badge>}
                {item.has_video && <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400">Vídeo</Badge>}
                {item.listing_status && item.listing_status !== "active" && (
                  <Badge variant="outline" className="text-xs border-red-500/30 text-red-400">{item.listing_status}</Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-160px)]">
          <div className="p-5 space-y-5">
            {/* SECTION 1 — Commercial metrics */}
            <SectionCard title="Comercial" icon={<ShoppingCart className="h-4 w-4 text-emerald-400" />}>
              <div className="grid grid-cols-4 gap-2">
                <MiniStat label={`Visitas (${period}d)`} value={visits != null ? visits.toLocaleString("pt-BR") : "—"} icon={<Eye className="h-3 w-3 text-cyan-400" />} />
                <MiniStat label={`Vendas (${period}d)`} value={String(sales ?? 0)} icon={<ShoppingCart className="h-3 w-3 text-emerald-400" />} />
                <MiniStat label="Conversão" value={
                  conv != null && visits != null && visits > 0 ? `${conv.toFixed(1)}%` :
                  (visits === 0 || visits == null) && (sales ?? 0) > 0 ? "s/ visitas" :
                  "—"
                } icon={<BarChart3 className="h-3 w-3 text-violet-400" />}
                  subtitle={coverage.status !== 'good' && coverage.days_with_data > 0 ? `base: ${coverage.days_with_data}d` : undefined}
                />
                <MiniStat label="Dias s/ venda" value={item.days_without_sale != null ? String(item.days_without_sale) : "—"} icon={<Clock className="h-3 w-3 text-amber-400" />} highlight={item.days_without_sale != null && item.days_without_sale > 14} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <MiniStat label="Preço" value={item.price != null ? `R$ ${item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"} />
                <MiniStat label="Estoque" value={item.available_quantity != null ? String(item.available_quantity) : "—"} highlight={item.available_quantity === 0} />
                <MiniStat label="Vendas (7d)" value={String(item.sales_count_7d ?? 0)} icon={<ShoppingCart className="h-3 w-3 text-emerald-400" />} />
              </div>
            </SectionCard>

            {/* Coverage indicator */}
            {coverage.status !== 'good' && coverage.days_with_data > 0 && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                coverage.status === 'insufficient'
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                  : 'bg-cyan-500/5 border border-cyan-500/15 text-cyan-300'
              }`}>
                <Activity className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Histórico de visitas disponível em {coverage.days_with_data} dos últimos {coverage.days_requested} dias.
                  {coverage.status === 'partial' && ' A conversão foi calculada com base nos dias com coleta válida.'}
                  {coverage.status === 'insufficient' && ' Os dados anteriores podem estar incompletos.'}
                </span>
              </div>
            )}

            {/* SECTION 2 — Structural */}
            <SectionCard title="Estrutural" icon={<Truck className="h-4 w-4 text-blue-400" />}>
              <div className="grid grid-cols-3 gap-2">
                <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${logistics.isFull ? factorStatusStyles.good : factorStatusStyles.neutral}`}>
                  <Zap className="h-3.5 w-3.5" />
                  <div>
                    <span className="font-medium">Logística</span>
                    <span className="ml-1.5 opacity-80">{logistics.isFull ? "Full" : logistics.confirmed ? logistics.label : "Não confirmado"}</span>
                  </div>
                </div>
                <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${hasCatalog ? factorStatusStyles.good : factorStatusStyles.neutral}`}>
                  <Tag className="h-3.5 w-3.5" />
                  <div>
                    <span className="font-medium">Catálogo</span>
                    <span className="ml-1.5 opacity-80">{hasCatalog ? "Participando" : "Não"}</span>
                  </div>
                </div>
                <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${item.free_shipping ? factorStatusStyles.good : factorStatusStyles.neutral}`}>
                  <Truck className="h-3.5 w-3.5" />
                  <div>
                    <span className="font-medium">Frete</span>
                    <span className="ml-1.5 opacity-80">{item.free_shipping ? "Grátis" : "Normal"}</span>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* SECTION 2.5 — Exposure (ADS + Promoções) */}
            <SectionCard title="Exposição" icon={<Megaphone className="h-4 w-4 text-orange-400" />}>
              <div className="grid grid-cols-2 gap-2">
                <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${
                  item.is_ads_active ? factorStatusStyles.good :
                  item.is_ads_active === false ? factorStatusStyles.neutral : factorStatusStyles.neutral
                }`}>
                  <Megaphone className="h-3.5 w-3.5" />
                  <div>
                    <span className="font-medium">ADS</span>
                    <span className="ml-1.5 opacity-80">
                      {item.is_ads_active === true ? "Ativo" :
                       item.is_ads_active === false ? (item.ads_status || "Inativo") :
                       "Sem dados"}
                    </span>
                  </div>
                </div>
                <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${
                  item.is_promotion_active ? factorStatusStyles.good :
                  item.is_promotion_active === false ? factorStatusStyles.neutral : factorStatusStyles.neutral
                }`}>
                  <BarChart3 className="h-3.5 w-3.5" />
                  <div>
                    <span className="font-medium">Promoção</span>
                    <span className="ml-1.5 opacity-80">
                      {item.is_promotion_active === true ? "Em promoção" :
                       item.is_promotion_active === false ? "Sem promoção" :
                       "Sem dados"}
                    </span>
                  </div>
                </div>
              </div>
              {/* Diagnostic text */}
              {item.diagnostic_text && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs text-slate-300 leading-relaxed">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400 inline mr-1.5" />
                  {item.diagnostic_text}
                </div>
              )}
            </SectionCard>

            {/* SECTION 2.7 — Wholesale (Atacado) */}
            <WholesaleCard item={item} />

            {/* SECTION 3 — Media (expanded with per-image resolution) */}
            <MediaCard item={item} />

            {/* SECTION 4 — Health breakdown */}
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

            {/* SECTION 5 — Alerts */}
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

            {/* SECTION 6 — Recent Changes */}
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

            {/* SECTION 7 — History Chart */}
            <SectionCard
              title="Histórico de Visitas"
              icon={<Scan className="h-4 w-4 text-cyan-400" />}
              action={
                <div className="flex items-center gap-2">
                  {coverage.days_with_data > 0 && (
                    <Badge variant="outline" className={`text-[10px] ${
                      coverage.status === 'good' ? 'border-emerald-500/30 text-emerald-400' :
                      coverage.status === 'partial' ? 'border-amber-500/30 text-amber-400' :
                      'border-red-500/30 text-red-400'
                    }`}>
                      {coverage.days_with_data}/{coverage.days_requested}d
                    </Badge>
                  )}
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
                </div>
              }
            >
              {historyLoading ? (
                <Skeleton className="h-[200px] w-full bg-slate-700" />
              ) : chartData.length === 0 || !hasAnyVisits ? (
                <div className="h-[200px] flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                  <BarChart3 className="h-8 w-8 text-slate-600" />
                  <p>{chartData.length === 0
                    ? "Sem dados de visitas para este período."
                    : `Dados históricos insuficientes para ${period} dias.`}
                  </p>
                  <p className="text-xs text-slate-600">Tente um período menor ou aguarde a próxima coleta.</p>
                </div>
              ) : !hasMultipleDates ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/15">
                    <Activity className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-cyan-300">Primeiro exame realizado em {chartData[0]?.date}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{chartData[0]?.visits.toLocaleString("pt-BR")} visitas registradas.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <EvolutionPill label="Visitas" delta={chartData[chartData.length - 1].visits - chartData[0].visits} />
                    <EvolutionPill label="Preço" delta={chartData[chartData.length - 1].price - chartData[0].price} isCurrency />
                    <EvolutionPill label="Estoque" delta={chartData[chartData.length - 1].stock - chartData[0].stock} />
                  </div>
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
                      <Line type="monotone" dataKey="visits" stroke="#22d3ee" strokeWidth={2} dot={chartData.length < 30} activeDot={{ r: 4, fill: "#22d3ee" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </>
              )}
            </SectionCard>

            {/* SECTION 8 — SEO Interativo + Título */}
            {item.seo_analysis_json && (
              <InteractiveSeoCard
                item={item}
                seo={item.seo_analysis_json}
                score={item.seo_score}
                found={item.seo_keywords_found}
                missing={item.seo_keywords_missing}
                structuralScore={item.seo_structural_score}
                keywordScore={item.seo_keyword_score}
                grade={item.seo_grade}
              />
            )}

            {/* SECTION 9 — Recommendations */}
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

function MiniStat({ label, value, icon, highlight, subtitle }: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean; subtitle?: string }) {
  return (
    <div className={`rounded-lg border p-2.5 ${highlight ? "bg-red-500/5 border-red-500/20" : "bg-slate-800/40 border-slate-700/40"}`}>
      <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-0.5">{icon}{label}</div>
      <div className={`text-sm font-bold font-mono ${highlight ? "text-red-400" : "text-slate-200"}`}>{value}</div>
      {subtitle && <div className="text-[10px] text-slate-500 mt-0.5">{subtitle}</div>}
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

// --- Media Card with per-image resolution analysis ---
function MediaCard({ item }: { item: HealthCurrentItem }) {
  const [expanded, setExpanded] = useState(false);

  // Try to get per-image data from media_analysis_json
  const mediaJson = item.media_analysis_json;
  const perImage: Array<{ image_index: number; width: number; height: number; is_1200x1200: boolean; is_primary: boolean; resolution_status: string; recommendation: string | null }> = mediaJson?.per_image || [];
  const imagesAt1200 = mediaJson?.images_at_1200 ?? perImage.filter(i => i.is_1200x1200).length;
  const totalImages = mediaJson?.total_images ?? (item.photos_count ?? 0);
  const resLabel = totalImages > 0 ? `${imagesAt1200}/${totalImages} em 1200x1200` : "Sem dados";
  const resColor = totalImages === 0 ? "neutral" : imagesAt1200 === totalImages ? "good" : imagesAt1200 > 0 ? "warning" : "bad";

  // First image status based on actual resolution
  const firstImage = perImage.find(i => i.is_primary || i.image_index === 1);
  let firstImageStatus: string;
  let firstImageColor: string;
  if (firstImage) {
    if (firstImage.is_1200x1200) {
      firstImageStatus = `OK (${firstImage.width}x${firstImage.height})`;
      firstImageColor = "good";
    } else if (firstImage.width > 0) {
      firstImageStatus = `${firstImage.width}x${firstImage.height}`;
      firstImageColor = "warning";
    } else {
      firstImageStatus = "Sem dados";
      firstImageColor = "neutral";
    }
  } else {
    firstImageStatus = item.thumbnail ? "Presente" : "Sem";
    firstImageColor = item.thumbnail ? "neutral" : "bad";
  }

  return (
    <SectionCard title="Mídia" icon={<Camera className="h-4 w-4 text-violet-400" />}>
      <div className="grid grid-cols-2 gap-2">
        <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${
          (item.photos_count ?? 0) >= 5 ? factorStatusStyles.good :
          (item.photos_count ?? 0) >= 3 ? factorStatusStyles.warning : factorStatusStyles.bad
        }`}>
          <Image className="h-3.5 w-3.5" />
          <div><span className="font-medium">Fotos</span><span className="ml-1.5 opacity-80">{item.photos_count ?? "?"}</span></div>
        </div>
        <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${item.has_video ? factorStatusStyles.good : factorStatusStyles.warning}`}>
          <Video className="h-3.5 w-3.5" />
          <div><span className="font-medium">Vídeo</span><span className="ml-1.5 opacity-80">{item.has_video ? "Sim" : "Não"}</span></div>
        </div>
        <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${factorStatusStyles[firstImageColor as keyof typeof factorStatusStyles]}`}>
          <Image className="h-3.5 w-3.5" />
          <div><span className="font-medium">1ª imagem</span><span className="ml-1.5 opacity-80">{firstImageStatus}</span></div>
        </div>
        <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${factorStatusStyles[resColor as keyof typeof factorStatusStyles]}`}>
          <Scan className="h-3.5 w-3.5" />
          <div><span className="font-medium">Resolução</span><span className="ml-1.5 opacity-80">{resLabel}</span></div>
        </div>
      </div>

      {/* Per-image detail (expandable) */}
      {perImage.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-300">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Ocultar detalhes" : "Ver detalhes por imagem"}
          </button>
          {expanded && (
            <div className="mt-1.5 space-y-1">
              {perImage.map((img) => (
                <div key={img.image_index} className={`flex items-center justify-between px-2 py-1 rounded text-[11px] border ${
                  img.resolution_status === 'ok' ? 'border-emerald-500/20 text-emerald-400' :
                  img.resolution_status === 'unknown' ? 'border-slate-600 text-slate-500' :
                  'border-amber-500/20 text-amber-400'
                }`}>
                  <span>Imagem {img.image_index}{img.is_primary ? " (principal)" : ""}</span>
                  <span className="font-mono">{img.width > 0 ? `${img.width}x${img.height}` : "?"} — {img.resolution_status === 'ok' ? 'OK' : img.resolution_status === 'unknown' ? 'Indisponível' : 'Revisar'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {totalImages > 0 && imagesAt1200 < totalImages && (
        <p className="text-[10px] text-amber-300 mt-2">
          Algumas imagens estão fora do padrão 1200x1200 px. Imagens secundárias podem ser ambientadas, mas a resolução ideal continua sendo 1200x1200 px.
        </p>
      )}
    </SectionCard>
  );
}

// --- Wholesale Card ---
function WholesaleCard({ item }: { item: HealthCurrentItem }) {
  const [expanded, setExpanded] = useState(false);
  const w = item.wholesale_analysis_json;

  if (!w) return null;

  const statusColor = w.status === 'active' ? 'emerald' : w.status === 'partial' ? 'amber' : w.status === 'not_eligible' ? 'slate' : 'red';
  const statusLabel = w.status === 'active' ? 'Ativo no Mercado Livre' : w.status === 'partial' ? 'Parcial' : w.status === 'not_eligible' ? (w.account_type === 'cpf' ? 'Indisponível para CPF' : 'Indisponível') : 'Preço de atacado não configurado';
  const scoreDisplay = w.is_eligible ? w.score : null;
  const icon = w.status === 'active' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> :
               w.status === 'not_eligible' ? <X className="h-3.5 w-3.5 text-slate-400" /> :
               <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;

  return (
    <SectionCard
      title="Atacado"
      icon={<Package className="h-4 w-4 text-indigo-400" />}
      action={scoreDisplay != null ? (
        <Badge variant="outline" className={`text-xs border-${statusColor}-500/30 text-${statusColor}-400`}>
          {scoreDisplay}/100
        </Badge>
      ) : undefined}
    >
      {/* Summary line */}
      <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${
        w.status === 'active' ? factorStatusStyles.good :
        w.status === 'partial' ? factorStatusStyles.warning :
        w.status === 'not_eligible' ? factorStatusStyles.neutral :
        factorStatusStyles.bad
      }`}>
        {icon}
        <div className="flex-1 min-w-0">
          <span className="font-medium">Status: {statusLabel}</span>
          {w.account_type !== 'unknown' && (
            <span className="ml-1.5 opacity-70">({w.account_type === 'cnpj' ? 'CNPJ' : 'CPF'})</span>
          )}
        </div>
        {w.ranges_count > 0 && (
          <span className="text-[10px] opacity-70">{w.ranges_count} faixas</span>
        )}
      </div>

      {/* Summary text */}
      <p className="text-xs text-slate-400 mt-2 leading-relaxed">{w.summary}</p>

      {/* Expandable detail */}
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-300 mt-2">
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Ocultar detalhes" : "Ver análise completa"}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Positives */}
          {w.positives.length > 0 && (
            <div className="space-y-1">
              {w.positives.map((p, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-400">
                  <Check className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          )}
          {/* Negatives */}
          {w.negatives.length > 0 && (
            <div className="space-y-1">
              {w.negatives.map((n, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-400">
                  <X className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{n}</span>
                </div>
              ))}
            </div>
          )}
          {/* Improvement actions */}
          {w.improvement_actions.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-medium">Como melhorar:</span>
              {w.improvement_actions.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-cyan-300">
                  <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CTA - only for eligible accounts without active wholesale */}
      {w.cta_available && w.is_eligible && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            className="text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 gap-1.5"
            onClick={() => {
              window.open(`/atacado?item_id=${item?.item_id || ''}`, '_blank');
            }}
          >
            <Package className="h-3.5 w-3.5" />
            Configurar preço de atacado
          </Button>
          <p className="text-[10px] text-slate-500 mt-1">
            Após configurar, atualize os dados para refletir a nova pontuação.
          </p>
        </div>
      )}
    </SectionCard>
  );
}


interface TitleSuggestion {
  title: string;
  score: number;
  length: number;
  breakdown: Record<string, number>;
}

function InteractiveSeoCard({ item, seo, score, found, missing, structuralScore, keywordScore, grade }: {
  item: HealthCurrentItem;
  seo: SeoAnalysis; score: number | null; found: string[] | null; missing: string[] | null;
  structuralScore?: number | null; keywordScore?: number | null; grade?: string | null;
}) {
  const { toast } = useToast();
  const [feedbackMap, setFeedbackMap] = useState<Record<string, boolean>>({});
  const [titleData, setTitleData] = useState<{ best: TitleSuggestion | null; suggestions: TitleSuggestion[]; issues: string[] } | null>(null);
  const [titleLoading, setTitleLoading] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null);
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);

  const scoreVal = score ?? seo.score ?? 0;
  const gradeVal = grade ?? seo.grade ?? (scoreVal >= 85 ? 'A' : scoreVal >= 70 ? 'B' : scoreVal >= 50 ? 'C' : 'D');
  const scoreColor = scoreVal >= 70 ? "text-emerald-400" : scoreVal >= 40 ? "text-amber-400" : "text-red-400";
  const gradeColor = gradeVal === 'A' ? "text-emerald-400 border-emerald-500/30" : gradeVal === 'B' ? "text-cyan-400 border-cyan-500/30" : gradeVal === 'C' ? "text-amber-400 border-amber-500/30" : "text-red-400 border-red-500/30";

  const titleScore = item.seo_title_score ?? seo.title_score ?? structuralScore ?? null;
  const descScore = item.seo_description_score ?? seo.description_score ?? null;
  const attrScore = item.seo_attributes_score ?? seo.attributes_score ?? null;
  const modelScore = item.seo_model_score ?? seo.model_score ?? null;
  const descLength = item.seo_description_length ?? seo.description_length ?? null;
  const kwVal = keywordScore ?? seo.keyword_score ?? null;
  const foundKws = found || [];
  const missingKws = missing || [];
  const totalKws = seo.total_keywords ?? seo.total_trending_keywords ?? 0;
  const coverageRatio = seo.coverage_ratio != null ? Math.round(seo.coverage_ratio * 100) : null;
  const irrelevantKws = seo.irrelevant_keywords || [];

  // Enriched layer data
  const titleAnalysis = seo.title_analysis || null;
  const descAnalysis = seo.description_analysis || null;
  const attrAnalysis = seo.attributes_analysis || null;
  const modelAnalysis = seo.model_analysis || null;

  const handleKeywordFeedback = async (keyword: string, isRelevant: boolean) => {
    setFeedbackMap(prev => ({ ...prev, [keyword]: isRelevant }));
    try {
      await supabase.functions.invoke("radiography-collector", {
        body: { action: "save_keyword_feedback", seller_id: item.seller_id, item_id: item.item_id, keyword, is_relevant: isRelevant },
      });
    } catch { /* silent */ }
  };

  const handleGenerateTitle = async () => {
    setTitleLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("radiography-collector", {
        body: { action: "generate_title", seller_id: item.seller_id, item_id: item.item_id },
      });
      if (error) throw error;
      if (data?.success) {
        setTitleData(data);
        toast({ title: "Títulos gerados", description: `${data.suggestions?.length || 0} sugestões criadas.` });
      } else {
        toast({ title: "Erro", description: data?.error || "Falha ao gerar títulos", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao gerar título", description: err.message, variant: "destructive" });
    } finally {
      setTitleLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTitle(text);
    setTimeout(() => setCopiedTitle(null), 2000);
  };

  const toggleLayer = (layer: string) => setExpandedLayer(expandedLayer === layer ? null : layer);

  // Layer summary lines
  const getLayerSummary = (layer: string, layerScore: number | null): string => {
    if (layerScore == null) return '';
    const analysis = layer === 'title' ? titleAnalysis : layer === 'description' ? descAnalysis : layer === 'attributes' ? attrAnalysis : modelAnalysis;
    if (analysis?.summary) return analysis.summary;
    if (layerScore >= 70) return 'Boa performance nesta camada.';
    if (layerScore >= 40) return 'Pode melhorar com ajustes pontuais.';
    return 'Precisa de atenção para melhorar o SEO.';
  };

  const DetailSection = ({ items, icon, title: secTitle, colorClass }: { items: string[]; icon: React.ReactNode; title: string; colorClass: string }) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="mt-1.5">
        <div className={`text-[10px] font-medium ${colorClass} mb-1 flex items-center gap-1`}>{icon} {secTitle}</div>
        <ul className="space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className="text-[11px] text-slate-400 flex items-start gap-1">
              <span className={`mt-0.5 ${colorClass}`}>•</span>{item}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const ExpandableLayerCard = ({ layerKey, label, value, weight, icon, iconColor }: {
    layerKey: string; label: string; value: number | null; weight: string; icon: React.ReactNode; iconColor: string;
  }) => {
    if (value == null) return null;
    const color = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500';
    const textColor = value >= 70 ? 'text-emerald-400' : value >= 40 ? 'text-amber-400' : 'text-red-400';
    const isExpanded = expandedLayer === layerKey;
    const analysis = layerKey === 'title' ? titleAnalysis : layerKey === 'description' ? descAnalysis : layerKey === 'attributes' ? attrAnalysis : modelAnalysis;
    const summary = getLayerSummary(layerKey, value);

    return (
      <div className="rounded-md bg-slate-800/30 border border-slate-700/30 overflow-hidden transition-all">
        <button onClick={() => toggleLayer(layerKey)} className="w-full text-left p-2.5 hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-5 flex justify-center ${iconColor}`}>{icon}</div>
              <span className="text-xs text-slate-300 font-medium">{label}</span>
              <span className="text-[9px] text-slate-600">{weight}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono font-bold ${textColor}`}>{value}</span>
              {isExpanded ? <ChevronUp className="h-3 w-3 text-slate-500" /> : <ChevronDown className="h-3 w-3 text-slate-500" />}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-slate-700/50">
              <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
            </div>
          </div>
          {!isExpanded && summary && (
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{summary}</p>
          )}
        </button>

        {isExpanded && analysis && (
          <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-700/20 pt-2">
            {/* Summary */}
            {analysis.summary && (
              <p className="text-xs text-slate-300 bg-slate-800/50 p-2 rounded">{analysis.summary}</p>
            )}

            {/* Layer-specific extras */}
            {layerKey === 'title' && titleAnalysis && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Título atual</span>
                  <span className={`font-mono ${(titleAnalysis.length || 0) > 60 ? 'text-red-400' : 'text-slate-400'}`}>
                    {titleAnalysis.length || item.title?.length || 0}/60 chars
                    {titleAnalysis.limit_status === 'above_limit' && ' ⚠️'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 bg-slate-900/50 p-1.5 rounded font-mono">{item.title || '—'}</p>
                {titleAnalysis.matched_keywords?.length > 0 && (
                  <div>
                    <span className="text-[10px] text-emerald-400">Keywords no título: </span>
                    <span className="text-[10px] text-slate-400">{titleAnalysis.matched_keywords.join(', ')}</span>
                  </div>
                )}
                {titleAnalysis.missing_keywords?.length > 0 && (
                  <div>
                    <span className="text-[10px] text-amber-400">Keywords ausentes: </span>
                    <span className="text-[10px] text-slate-400">{titleAnalysis.missing_keywords.slice(0, 5).join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            {layerKey === 'description' && descAnalysis && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 text-[10px]">
                  <span className={`${descAnalysis.length_status === 'strong' ? 'text-emerald-400' : descAnalysis.length_status === 'acceptable' ? 'text-amber-400' : 'text-red-400'}`}>
                    {descAnalysis.length || 0} caracteres
                    {descAnalysis.length_status === 'strong' ? ' ✓ ideal' : descAnalysis.length_status === 'acceptable' ? ' (ideal: 500+)' : descAnalysis.length_status === 'empty' ? ' (vazia)' : ' (curta)'}
                  </span>
                  {descAnalysis.density != null && (
                    <span className="text-slate-500">Densidade: {(descAnalysis.density * 100).toFixed(1)}%</span>
                  )}
                </div>
                {descAnalysis.description_preview && (
                  <div>
                    <button onClick={(e) => { e.stopPropagation(); setShowDescription(!showDescription); }} className="text-[10px] text-cyan-400 hover:underline">
                      {showDescription ? 'Recolher descrição' : 'Ver descrição atual'}
                    </button>
                    {showDescription && (
                      <p className="text-[10px] text-slate-500 bg-slate-900/50 p-2 rounded mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">{descAnalysis.description_preview}</p>
                    )}
                  </div>
                )}
                {descAnalysis.matched_keywords?.length > 0 && (
                  <div><span className="text-[10px] text-emerald-400">Keywords presentes: </span><span className="text-[10px] text-slate-400">{descAnalysis.matched_keywords.join(', ')}</span></div>
                )}
                {descAnalysis.missing_keywords?.length > 0 && (
                  <div><span className="text-[10px] text-amber-400">Keywords ausentes: </span><span className="text-[10px] text-slate-400">{descAnalysis.missing_keywords.slice(0, 5).join(', ')}</span></div>
                )}
              </div>
            )}

            {layerKey === 'attributes' && attrAnalysis && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-400">
                  Preenchimento: <strong className={attrAnalysis.filled_ratio >= 0.8 ? 'text-emerald-400' : attrAnalysis.filled_ratio >= 0.5 ? 'text-amber-400' : 'text-red-400'}>
                    {Math.round((attrAnalysis.filled_ratio || 0) * 100)}%
                  </strong> ({attrAnalysis.filled || 0}/{attrAnalysis.total || 0})
                </div>
                {attrAnalysis.strong_attributes?.length > 0 && (
                  <div>
                    <span className="text-[10px] text-emerald-400">Atributos fortes: </span>
                    <span className="text-[10px] text-slate-400">{attrAnalysis.strong_attributes.join(' · ')}</span>
                  </div>
                )}
                {attrAnalysis.weak_attributes_detail?.length > 0 && (
                  <div>
                    <span className="text-[10px] text-amber-400">Atributos fracos: </span>
                    <span className="text-[10px] text-slate-400">{attrAnalysis.weak_attributes_detail.join(' · ')}</span>
                  </div>
                )}
                {attrAnalysis.missing?.length > 0 && (
                  <div>
                    <span className="text-[10px] text-red-400">Faltantes: </span>
                    <span className="text-[10px] text-slate-400">{attrAnalysis.missing.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            {layerKey === 'model' && modelAnalysis && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-400">
                  Valor atual: <strong className={modelAnalysis.current_value && modelAnalysis.is_search_friendly ? 'text-emerald-400' : 'text-amber-400'}>
                    {modelAnalysis.current_value || 'não informado'}
                  </strong>
                  {modelAnalysis.brand_value && <span className="text-slate-500"> · Marca: {modelAnalysis.brand_value}</span>}
                </div>
                {modelAnalysis.is_search_friendly && (
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1"><Check className="h-2.5 w-2.5" /> Modelo pesquisável</div>
                )}
              </div>
            )}

            {/* Positives */}
            <DetailSection items={analysis.positives} icon={<Check className="h-2.5 w-2.5" />} title="O que está bom" colorClass="text-emerald-400" />
            {/* Negatives */}
            <DetailSection items={analysis.negatives} icon={<AlertTriangle className="h-2.5 w-2.5" />} title="O que prejudica" colorClass="text-red-400" />
            {/* Improvement actions */}
            <DetailSection items={analysis.improvement_actions} icon={<Lightbulb className="h-2.5 w-2.5" />} title="Como melhorar" colorClass="text-cyan-400" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* SEO Score Card */}
      <SectionCard
        title="SEO do Anúncio"
        icon={<Search className="h-4 w-4 text-cyan-400" />}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-sm font-bold ${gradeColor}`}>{gradeVal}</Badge>
            <span className={`text-xl font-bold font-mono ${scoreColor}`}>{scoreVal}</span>
            <span className="text-xs text-slate-500">/100</span>
          </div>
        }
        subtitle={`Análise em 4 camadas${totalKws > 0 ? ` · ${totalKws} palavras-chave` : ''} · Clique em cada camada para detalhes`}
      >
        <div className="space-y-2">
          {/* 4-layer expandable cards */}
          <ExpandableLayerCard layerKey="title" label="Título" value={titleScore} weight="40%" icon={<Type className="h-3.5 w-3.5" />} iconColor="text-violet-400" />
          <ExpandableLayerCard layerKey="description" label="Descrição" value={descScore} weight="25%" icon={<FileText className="h-3.5 w-3.5" />} iconColor="text-cyan-400" />
          <ExpandableLayerCard layerKey="attributes" label="Ficha Técnica" value={attrScore} weight="20%" icon={<ClipboardList className="h-3.5 w-3.5" />} iconColor="text-amber-400" />
          <ExpandableLayerCard layerKey="model" label="Modelo" value={modelScore} weight="15%" icon={<Tag className="h-3.5 w-3.5" />} iconColor="text-emerald-400" />

          {/* Coverage ratio */}
          {coverageRatio != null && totalKws > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
              <Target className="h-3 w-3" />
              <span>Cobertura de keywords: <strong className={coverageRatio >= 60 ? "text-emerald-400" : coverageRatio >= 30 ? "text-amber-400" : "text-red-400"}>{coverageRatio}%</strong></span>
            </div>
          )}

          {/* Category keyword details with match locations */}
          {seo.details && seo.details.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1">
                <Target className="h-3 w-3 text-cyan-400" /> Palavras da categoria ({seo.details.length})
              </div>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {seo.details.map((d, i) => {
                  const matched = d.matched_overall ?? d.found_in_title ?? false;
                  const inTitle = d.matched_in_title ?? d.found_in_title ?? false;
                  const inDesc = d.matched_in_description ?? false;
                  const inAttrs = d.matched_in_attributes ?? false;
                  const locationParts: string[] = [];
                  if (inTitle) locationParts.push("título");
                  if (inDesc) locationParts.push("descrição");
                  if (inAttrs) locationParts.push("atributos");
                  const locationText = matched ? locationParts.join(", ") : "ausente";
                  return (
                    <div key={i} className={`flex items-center justify-between px-2 py-1 rounded text-[11px] ${
                      matched ? 'bg-emerald-500/5 text-emerald-300' : 'bg-slate-800/30 text-slate-500'
                    }`}>
                      <span className="truncate">{d.keyword}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] ${matched ? 'text-emerald-400' : 'text-red-400'}`}>{locationText}</span>
                        {d.weight != null && <span className="text-[9px] text-slate-600">{(d.weight * 100).toFixed(0)}%</span>}
                        <button onClick={() => handleKeywordFeedback(d.keyword, !(feedbackMap[d.keyword] ?? true))} className="p-0.5 rounded hover:bg-slate-700/50">
                          {feedbackMap[d.keyword] === false ? <ThumbsDown className="h-2.5 w-2.5 text-red-400" /> : <ThumbsUp className="h-2.5 w-2.5 text-slate-500 opacity-30 hover:opacity-100" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fallback keyword lists when no details */}
          {foundKws.length > 0 && !seo.details?.length && (
            <div>
              <div className="text-xs font-medium text-emerald-400 mb-1.5 flex items-center gap-1">
                <Check className="h-3 w-3" /> Presentes ({foundKws.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {foundKws.map((kw) => (
                  <div key={kw} className="flex items-center gap-0.5">
                    <Badge variant="outline" className={`text-xs ${feedbackMap[kw] === false ? 'border-red-500/30 text-red-300 bg-red-500/5 line-through' : 'border-emerald-500/30 text-emerald-300 bg-emerald-500/5'}`}>{kw}</Badge>
                    <button onClick={() => handleKeywordFeedback(kw, !(feedbackMap[kw] ?? true))} className="p-0.5 rounded hover:bg-slate-700/50">
                      {feedbackMap[kw] === false ? <ThumbsDown className="h-3 w-3 text-red-400" /> : <ThumbsUp className="h-3 w-3 text-emerald-400 opacity-30 hover:opacity-100" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {missingKws.length > 0 && !seo.details?.length && (
            <div>
              <div className="text-xs font-medium text-amber-400 mb-1.5 flex items-center gap-1">
                <Target className="h-3 w-3" /> Ausentes ({missingKws.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {missingKws.map((kw) => (
                  <div key={kw} className="flex items-center gap-0.5">
                    <Badge variant="outline" className={`text-xs ${feedbackMap[kw] === false ? 'border-slate-600 text-slate-500 line-through' : 'border-amber-500/30 text-amber-300 bg-amber-500/5'}`}>{kw}</Badge>
                    <button onClick={() => handleKeywordFeedback(kw, !(feedbackMap[kw] ?? true))} className="p-0.5 rounded hover:bg-slate-700/50">
                      {feedbackMap[kw] === false ? <ThumbsDown className="h-3 w-3 text-red-400" /> : <ThumbsUp className="h-3 w-3 text-slate-400 opacity-30 hover:opacity-100" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Irrelevant */}
          {irrelevantKws.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-400 mb-1.5 flex items-center gap-1">
                <X className="h-3 w-3" /> Termos irrelevantes ({irrelevantKws.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {irrelevantKws.map((kw) => (
                  <Badge key={kw} variant="outline" className="text-xs border-red-500/30 text-red-300 bg-red-500/5">{kw}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Validation prompt */}
          {(foundKws.length > 0 || missingKws.length > 0 || (seo.details && seo.details.length > 0)) && (
            <div className="p-2 rounded-md bg-cyan-500/5 border border-cyan-500/15 text-xs text-cyan-300">
              <Sparkles className="h-3 w-3 inline mr-1" />
              Selecione as palavras que representam seu produto. Use 👍/👎 para refinar a análise e gerar títulos mais precisos.
            </div>
          )}

          {foundKws.length === 0 && missingKws.length === 0 && !seo.details?.length && (seo.issues || []).length === 0 && (
            <p className="text-xs text-slate-500 text-center py-2">Execute "Atualizar Dados" para gerar a análise SEO.</p>
          )}
        </div>
      </SectionCard>

      {/* Title Generator Card */}
      <SectionCard
        title="Título Otimizado"
        icon={<Type className="h-4 w-4 text-violet-400" />}
        subtitle="Gerador de título com limite de 60 caracteres (Mercado Livre)"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateTitle}
            disabled={titleLoading}
            className="h-7 text-xs gap-1 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
          >
            {titleLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {titleLoading ? "Gerando..." : titleData ? "Gerar Novamente" : "Gerar Títulos"}
          </Button>
        }
      >
        <div className="space-y-3">
          {/* Current title */}
          <div className="p-2.5 rounded-md bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">Título atual</span>
              <span className={`text-[10px] font-mono ${(item.title?.length || 0) > 60 ? 'text-red-400' : 'text-slate-500'}`}>
                {item.title?.length || 0}/60 chars
              </span>
            </div>
            <p className="text-sm text-slate-300">{item.title || "—"}</p>
            {(item.title?.length || 0) > 60 && (
              <p className="text-[10px] text-red-400 mt-1">⚠️ Excede o limite de 60 caracteres</p>
            )}
          </div>

          {titleData && (
            <>
              {titleData.best && (
                <div className="p-2.5 rounded-md bg-violet-500/5 border border-violet-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-violet-400 font-medium">🔥 Melhor sugestão</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400">{titleData.best.length}/60</span>
                      <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400">
                        Score {titleData.best.score}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-violet-200 font-medium">{titleData.best.title}</p>
                  <button onClick={() => copyToClipboard(titleData.best!.title)} className="mt-1.5 flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300">
                    {copiedTitle === titleData.best.title ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedTitle === titleData.best.title ? "Copiado!" : "Copiar título"}
                  </button>
                </div>
              )}

              {titleData.suggestions.length > 1 && (
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-1.5">Outras variações</div>
                  <div className="space-y-1.5">
                    {titleData.suggestions.slice(1).map((sug, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-slate-800/40 border border-slate-700/40">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-300 truncate">{sug.title}</p>
                          <span className="text-[10px] text-slate-500">{sug.length}/60 · Score {sug.score}</span>
                        </div>
                        <button onClick={() => copyToClipboard(sug.title)} className="ml-2 p-1 rounded hover:bg-slate-700/50 flex-shrink-0">
                          {copiedTitle === sug.title ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {titleData.issues.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-amber-400 mb-1">Problemas do título atual</div>
                  <ul className="space-y-0.5 text-xs text-slate-400">
                    {titleData.issues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-1"><span className="text-amber-400 mt-0.5">•</span>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {!titleData && !titleLoading && (
            <p className="text-xs text-slate-500 text-center py-2">
              Clique em "Gerar Títulos" para criar sugestões otimizadas baseadas nas palavras-chave da categoria.
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
