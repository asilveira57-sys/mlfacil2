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
  RefreshCw
} from "lucide-react";
import { useRadiography, Radiography, ListingEvent } from "@/hooks/useRadiography";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  const [activeTab, setActiveTab] = useState("score");

  useEffect(() => {
    if (open && itemId && sellerId) {
      setRadiography(null);
      analyzeItem(itemId).then((data) => {
        if (data?.listing) {
          setListing(data.listing);
        }
      });
      fetchEvents(itemId);
    }
  }, [open, itemId, sellerId]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    if (score >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "warning": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <CheckCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getImpactIcon = (direction: string) => {
    switch (direction) {
      case "positive": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "negative": return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getPeriodBadge = (summary: string) => {
    const colors: Record<string, string> = {
      crescimento: "bg-green-500/10 text-green-500",
      queda: "bg-red-500/10 text-red-500",
      recuperação: "bg-blue-500/10 text-blue-500",
      "declínio recente": "bg-orange-500/10 text-orange-500",
      estagnação: "bg-gray-500/10 text-gray-500",
    };
    return colors[summary] || "bg-gray-500/10 text-gray-500";
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
      <SheetContent className="w-full sm:max-w-2xl p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-start gap-4">
            {listing?.thumbnail ? (
              <img 
                src={listing.thumbnail} 
                alt={listing.title}
                className="h-16 w-16 object-cover rounded-md"
              />
            ) : (
              <div className="h-16 w-16 bg-muted rounded-md flex items-center justify-center">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg leading-tight mb-1">
                {listing?.title || itemId}
              </SheetTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{itemId}</span>
                {listing?.permalink && (
                  <a 
                    href={listing.permalink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    Ver anúncio <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-140px)]">
          {loading && !radiography ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : radiography ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="score">Score</TabsTrigger>
                <TabsTrigger value="narrative">Narrativa</TabsTrigger>
                <TabsTrigger value="events">Eventos</TabsTrigger>
                <TabsTrigger value="actions">Ações</TabsTrigger>
              </TabsList>

              {/* Score Tab */}
              <TabsContent value="score" className="space-y-4 mt-4">
                {/* Period Summary */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <div className="text-sm text-muted-foreground">Período analisado</div>
                    <div className="font-medium">{radiography.period_analyzed_days} dias</div>
                  </div>
                  <Badge className={getPeriodBadge(radiography.period_summary)}>
                    {radiography.period_summary}
                  </Badge>
                </div>

                {/* Score Breakdown */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Score por Bloco</CardTitle>
                      <div className={`text-3xl font-bold ${getScoreColor(radiography.score_breakdown?.total || 0)}`}>
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

              {/* Narrative Tab */}
              <TabsContent value="narrative" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Radiografia Interpretativa</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">
                      {radiography.narrative_pt || "Narrativa não disponível."}
                    </p>
                  </CardContent>
                </Card>

                {/* Cause & Effect */}
                {radiography.cause_effect_insights?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Causa e Efeito</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {radiography.cause_effect_insights.map((insight: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className="flex-1">
                            <div className="font-medium text-red-500">{insight.cause}</div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="font-medium text-blue-500">{insight.effect}</div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Events Tab */}
              <TabsContent value="events" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Linha do Tempo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {events.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Nenhum evento registrado ainda.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {events.slice(0, 20).map((event) => (
                          <div 
                            key={event.id}
                            className="flex items-start gap-3 p-3 rounded-lg border"
                          >
                            {getSeverityIcon(event.severity)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">
                                  {formatEventType(event.event_type)}
                                </span>
                                {getImpactIcon(event.impact_direction)}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {event.observation_pt}
                              </p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {format(new Date(event.detected_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                <Badge variant="outline" className="text-[10px]">
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

              {/* Actions Tab */}
              <TabsContent value="actions" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Ações Sugeridas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!radiography.suggested_actions?.length ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50 text-green-500" />
                        <p>Nenhuma ação prioritária identificada.</p>
                        <p className="text-sm">O anúncio está bem otimizado.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {radiography.suggested_actions.map((action: any, i: number) => (
                          <div 
                            key={i}
                            className="flex items-start gap-3 p-4 rounded-lg border"
                          >
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                              action.impact === "crítico" ? "bg-red-500/10 text-red-500" :
                              action.impact === "alto" ? "bg-orange-500/10 text-orange-500" :
                              "bg-blue-500/10 text-blue-500"
                            }`}>
                              {action.priority}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium mb-1">{action.action}</div>
                              <p className="text-sm text-muted-foreground">{action.reason}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline">{action.block}</Badge>
                                <Badge className={
                                  action.impact === "crítico" ? "bg-red-500/10 text-red-500" :
                                  action.impact === "alto" ? "bg-orange-500/10 text-orange-500" :
                                  "bg-blue-500/10 text-blue-500"
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
            <div className="p-6 text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Não foi possível carregar a radiografia.</p>
              <Button 
                variant="outline" 
                className="mt-4"
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
    if (s >= 80) return "bg-green-500";
    if (s >= 60) return "bg-yellow-500";
    if (s >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{score}</span>
      </div>
      <Progress value={score} className={`h-2 ${getColor(score)}`} />
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
