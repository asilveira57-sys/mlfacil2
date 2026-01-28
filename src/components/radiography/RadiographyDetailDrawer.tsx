import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Zap, 
  TrendingUp, 
  TrendingDown,
  Minus,
  Clock,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Package,
  ExternalLink,
  RefreshCw,
  LineChart,
  HeartPulse,
  Activity,
  Stethoscope,
  Siren,
  Scan,
  Sprout,
  ArrowDownRight,
  AlertOctagon,
} from "lucide-react";
import { useRadiography, Radiography, ListingEvent } from "@/hooks/useRadiography";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RadiographyEvolutionChart } from "./RadiographyEvolutionChart";
import {
  HEALTH_STATUS_CONFIG,
  CURVE_CONFIG,
  RadiographyHealthStatus,
  AbcCurve,
  calculateHealthStatus,
  getSuggestedAction,
  SUGGESTED_ACTIONS,
} from "@/types/radiography";

interface RadiographyDetailDrawerProps {
  sellerId: string | null;
  itemId: string | null;
  open: boolean;
  onClose: () => void;
}

export function RadiographyDetailDrawer({ 
  sellerId, 
  itemId, 
  open, 
  onClose 
}: RadiographyDetailDrawerProps) {
  const { 
    loading, 
    radiography, 
    events, 
    analyzeItem, 
    fetchEvents,
    setRadiography
  } = useRadiography(sellerId);
  
  const [listing, setListing] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("diagnosis");

  useEffect(() => {
    if (open && itemId && sellerId) {
      setRadiography(null);
      setListing(null);
      
      analyzeItem(itemId).then(async (data) => {
        if (data?.listing?.title && data?.listing?.thumbnail) {
          setListing(data.listing);
        } else {
          const { data: fallbackListing } = await supabase
            .from('meli_listings_cache')
            .select('title, thumbnail, permalink, price, status')
            .eq('item_id', itemId)
            .order('last_sync_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (fallbackListing) {
            setListing(fallbackListing);
          } else {
            setListing({ title: itemId, thumbnail: null, permalink: null });
          }
        }
      });
      fetchEvents(itemId);
    }
  }, [open, itemId, sellerId]);

  // Calculate health status from radiography data
  const healthStatus: RadiographyHealthStatus = radiography 
    ? calculateHealthStatus({
        score_total: radiography.score_breakdown?.total || 0,
        conversion_rate_7d: 0,
        visits_trend: 0,
        stock_level: 100,
      })
    : 'stable';
  
  const healthConfig = HEALTH_STATUS_CONFIG[healthStatus];
  
  // Mock curve - would come from real data
  const curve: AbcCurve = radiography?.score_breakdown?.total >= 70 ? 'A' : 'B';
  const curveConfig = curve ? CURVE_CONFIG[curve] : null;
  
  const suggestedAction = getSuggestedAction(healthStatus, curve);
  const actionConfig = SUGGESTED_ACTIONS[suggestedAction];

  const HealthIcon = ({ status }: { status: RadiographyHealthStatus }) => {
    const iconMap = {
      healthy: HeartPulse,
      stable: Activity,
      observation: Stethoscope,
      alert: AlertTriangle,
      critical: Siren,
    };
    const Icon = iconMap[status];
    return <Icon className="h-5 w-5" />;
  };

  const ActionIcon = ({ type }: { type: string }) => {
    const iconMap: Record<string, any> = {
      send_candidate: Sprout,
      stagnation_risk: TrendingDown,
      healthy: CheckCircle,
      declining: ArrowDownRight,
      critical_intervention: AlertOctagon,
    };
    const Icon = iconMap[type] || Activity;
    return <Icon className="h-5 w-5" />;
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <Siren className="h-4 w-4 text-red-400" />;
      case "warning": return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      default: return <Activity className="h-4 w-4 text-cyan-400" />;
    }
  };

  const getImpactIcon = (direction: string) => {
    switch (direction) {
      case "positive": return <TrendingUp className="h-4 w-4 text-emerald-400" />;
      case "negative": return <TrendingDown className="h-4 w-4 text-red-400" />;
      default: return <Minus className="h-4 w-4 text-slate-400" />;
    }
  };

  const getPeriodBadge = (summary: string) => {
    const colors: Record<string, string> = {
      crescimento: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      queda: "bg-red-500/20 text-red-400 border-red-500/30",
      recuperação: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      "declínio recente": "bg-orange-500/20 text-orange-400 border-orange-500/30",
      estagnação: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    };
    return colors[summary] || "bg-slate-500/20 text-slate-400 border-slate-500/30";
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

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 bg-slate-900 border-slate-700">
        {/* Clinical Header */}
        <SheetHeader className="p-6 pb-4 border-b border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-start gap-4">
            <div className="relative">
              {listing?.thumbnail ? (
                <div className="relative">
                  <img 
                    src={listing.thumbnail} 
                    alt={listing.title}
                    className="h-16 w-16 object-cover rounded-md grayscale-[20%]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent rounded-md" />
                </div>
              ) : (
                <div className="h-16 w-16 bg-slate-800 rounded-md flex items-center justify-center border border-slate-700">
                  <Package className="h-8 w-8 text-slate-600" />
                </div>
              )}
              {/* Health Badge */}
              <div className={`absolute -bottom-2 -right-2 h-8 w-8 rounded-full ${healthConfig.bgClass} border-2 border-slate-900 flex items-center justify-center ${healthConfig.colorClass}`}>
                <HealthIcon status={healthStatus} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg leading-tight mb-1 text-slate-100">
                {listing?.title || itemId}
              </SheetTitle>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="font-mono">{itemId}</span>
                {listing?.permalink && (
                  <a 
                    href={listing.permalink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                  >
                    Ver anúncio <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {/* Health & Curve Status */}
              <div className="flex items-center gap-2 mt-2">
                <Badge className={`${healthConfig.bgClass} ${healthConfig.colorClass} ${healthConfig.borderClass}`}>
                  {healthConfig.label}
                </Badge>
                {curveConfig && (
                  <Badge className={`${curveConfig.bgClass} ${curveConfig.colorClass} ${curveConfig.borderClass}`}>
                    Curva {curve}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)]">
          {loading && !radiography ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-32 w-full bg-slate-800" />
              <Skeleton className="h-48 w-full bg-slate-800" />
              <Skeleton className="h-48 w-full bg-slate-800" />
            </div>
          ) : radiography ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6">
              <TabsList className="grid w-full grid-cols-5 bg-slate-800/50 border border-slate-700">
                <TabsTrigger value="diagnosis" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                  Diagnóstico
                </TabsTrigger>
                <TabsTrigger value="evolution" className="gap-1 data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                  <LineChart className="h-3 w-3" />
                  Evolução
                </TabsTrigger>
                <TabsTrigger value="narrative" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                  Laudo
                </TabsTrigger>
                <TabsTrigger value="events" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                  Histórico
                </TabsTrigger>
                <TabsTrigger value="actions" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                  Orientações
                </TabsTrigger>
              </TabsList>

              {/* Diagnosis Tab */}
              <TabsContent value="diagnosis" className="space-y-4 mt-4">
                {/* Suggested Action Card */}
                <Card className={`bg-slate-800/50 border ${
                  actionConfig.priority === 'critical' ? 'border-red-500/30 bg-red-500/5' :
                  actionConfig.priority === 'high' ? 'border-orange-500/30 bg-orange-500/5' :
                  actionConfig.priority === 'medium' ? 'border-amber-500/30 bg-amber-500/5' :
                  'border-emerald-500/30 bg-emerald-500/5'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                        actionConfig.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                        actionConfig.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        actionConfig.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        <ActionIcon type={suggestedAction} />
                      </div>
                      <div>
                        <div className={`font-semibold ${
                          actionConfig.priority === 'critical' ? 'text-red-400' :
                          actionConfig.priority === 'high' ? 'text-orange-400' :
                          actionConfig.priority === 'medium' ? 'text-amber-400' :
                          'text-emerald-400'
                        }`}>
                          {actionConfig.title}
                        </div>
                        <div className="text-sm text-slate-400">{actionConfig.description}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Period Summary */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div>
                    <div className="text-sm text-slate-400">Período analisado</div>
                    <div className="font-medium text-slate-200">{radiography.period_analyzed_days} dias</div>
                  </div>
                  <Badge className={getPeriodBadge(radiography.period_summary)}>
                    {radiography.period_summary}
                  </Badge>
                </div>

                {/* Score Breakdown - Clinical Style */}
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                          <Scan className="h-5 w-5 text-cyan-400" />
                        </div>
                        <CardTitle className="text-lg text-slate-100">Exame por Área</CardTitle>
                      </div>
                      <div className={`text-4xl font-bold font-mono ${healthConfig.colorClass}`}>
                        {radiography.score_breakdown?.total || 0}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Object.entries(radiography.score_breakdown || {}).map(([key, data]: [string, any]) => {
                      if (key === "total") return null;
                      return (
                        <ScoreRow 
                          key={key} 
                          label={formatBlockName(key)} 
                          score={data.score} 
                        />
                      );
                    })}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Evolution Tab */}
              <TabsContent value="evolution" className="space-y-4 mt-4">
                {sellerId && itemId && (
                  <RadiographyEvolutionChart 
                    sellerId={sellerId} 
                    itemId={itemId} 
                  />
                )}
              </TabsContent>

              {/* Narrative Tab - Clinical Report */}
              <TabsContent value="narrative" className="space-y-4 mt-4">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
                        <Stethoscope className="h-5 w-5 text-violet-400" />
                      </div>
                      <CardTitle className="text-lg text-slate-100">Laudo Radiográfico</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-300 leading-relaxed">
                      {radiography.narrative_pt || "Laudo não disponível."}
                    </p>
                  </CardContent>
                </Card>

                {/* Cause & Effect - X-Ray Insights */}
                {radiography.cause_effect_insights?.length > 0 && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                          <Activity className="h-5 w-5 text-amber-400" />
                        </div>
                        <CardTitle className="text-lg text-slate-100">Relação Causa-Efeito</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {radiography.cause_effect_insights.map((insight: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                          <div className="flex-1">
                            <div className="font-medium text-red-400">{insight.cause}</div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-slate-500" />
                          <div className="flex-1">
                            <div className="font-medium text-cyan-400">{insight.effect}</div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Events Tab - Clinical Timeline */}
              <TabsContent value="events" className="space-y-4 mt-4">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                        <Clock className="h-5 w-5 text-cyan-400" />
                      </div>
                      <CardTitle className="text-lg text-slate-100">Histórico Clínico</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {events.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                          <Clock className="h-6 w-6 text-slate-500" />
                        </div>
                        <p>Nenhum evento registrado ainda.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {events.slice(0, 20).map((event) => (
                          <div 
                            key={event.id}
                            className="flex items-start gap-3 p-3 rounded-lg border border-slate-700 bg-slate-900/30"
                          >
                            {getSeverityIcon(event.severity)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-slate-200">
                                  {formatEventType(event.event_type)}
                                </span>
                                {getImpactIcon(event.impact_direction)}
                              </div>
                              <p className="text-sm text-slate-400">
                                {event.observation_pt}
                              </p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                                <Clock className="h-3 w-3" />
                                {format(new Date(event.detected_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                <Badge variant="outline" className="text-[10px] border-slate-600">
                                  {event.blocks_affected?.join(", ")}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Actions Tab - Clinical Recommendations */}
              <TabsContent value="actions" className="space-y-4 mt-4">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                        <Stethoscope className="h-5 w-5 text-emerald-400" />
                      </div>
                      <CardTitle className="text-lg text-slate-100">Orientações Clínicas</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!radiography.suggested_actions?.length ? (
                      <div className="text-center py-8 text-slate-400">
                        <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                          <CheckCircle className="h-6 w-6 text-emerald-400" />
                        </div>
                        <p className="text-slate-300 font-medium">Nenhuma intervenção prioritária</p>
                        <p className="text-sm text-slate-500 mt-1">O anúncio está bem otimizado.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {radiography.suggested_actions.map((action: any, i: number) => (
                          <div 
                            key={i}
                            className={`flex items-start gap-3 p-4 rounded-lg border ${
                              action.impact === "crítico" ? "border-red-500/30 bg-red-500/5" :
                              action.impact === "alto" ? "border-orange-500/30 bg-orange-500/5" :
                              "border-slate-700 bg-slate-900/30"
                            }`}
                          >
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                              action.impact === "crítico" ? "bg-red-500/20 text-red-400" :
                              action.impact === "alto" ? "bg-orange-500/20 text-orange-400" :
                              "bg-cyan-500/20 text-cyan-400"
                            }`}>
                              {action.priority}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium mb-1 text-slate-200">{action.action}</div>
                              <p className="text-sm text-slate-400">{action.reason}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="border-slate-600 text-slate-400">{action.block}</Badge>
                                <Badge className={
                                  action.impact === "crítico" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                                  action.impact === "alto" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                                  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                                }>
                                  Impacto {action.impact}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="p-6 text-center text-slate-400">
              <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-slate-500" />
              </div>
              <p className="text-slate-300">Não foi possível carregar a radiografia.</p>
              <Button 
                variant="outline" 
                className="mt-4 border-slate-600 text-slate-300 hover:bg-slate-800"
                onClick={() => itemId && analyzeItem(itemId)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ScoreRow({ label, score }: { label: string; score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return "bg-emerald-500";
    if (s >= 60) return "bg-amber-500";
    if (s >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  const getTextColor = (s: number) => {
    if (s >= 80) return "text-emerald-400";
    if (s >= 60) return "text-amber-400";
    if (s >= 40) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className={`font-semibold font-mono ${getTextColor(score)}`}>{score}</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getColor(score)} transition-all`} 
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function formatBlockName(key: string): string {
  const map: Record<string, string> = {
    semantica: "Semântica (SEO)",
    visual: "Visual (Imagens)",
    clip: "Clip",
    competitividade: "Competitividade",
    logistica: "Logística",
    performance: "Performance",
  };
  return map[key] || key;
}
