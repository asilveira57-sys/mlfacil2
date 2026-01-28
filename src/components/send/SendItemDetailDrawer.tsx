import { useState, useEffect } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { 
  HEALTH_STATUS_CONFIG, 
  GROWTH_STAGE_CONFIG,
  SendPlantedItem,
  SendMetricsSnapshot,
  SendItemHistory
} from "@/types/send";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Trash2,
  ClipboardPlus,
  StickyNote,
  BarChart3,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ImageOff
} from "lucide-react";
import { toast } from "sonner";

interface SendItemDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string | null;
  sellerId: string;
  onRemove: (itemId: string) => void;
}

interface ItemData {
  planted: SendPlantedItem | null;
  metrics: SendMetricsSnapshot | null;
  history: SendItemHistory[];
  listing: {
    title: string;
    thumbnail: string;
    sku: string;
    permalink: string;
    price: number;
    status: string;
    available_quantity: number;
  } | null;
}

export function SendItemDetailDrawer({ 
  open, 
  onOpenChange, 
  itemId, 
  sellerId,
  onRemove 
}: SendItemDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState("performance");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ItemData>({
    planted: null,
    metrics: null,
    history: [],
    listing: null
  });
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (!open || !itemId || !sellerId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Extract base MLB ID for lookups
        const extractMlbId = (id: string): string | null => {
          if (!id.startsWith('MLB')) return null;
          const match = id.match(/^(MLB\d+)/);
          return match ? match[1] : null;
        };

        const mlbId = extractMlbId(itemId) || itemId;

        // Parallel fetches
        const [plantedRes, historyRes, listingRes] = await Promise.all([
          supabase
            .from('send_planted_items')
            .select('*')
            .eq('user_id', user.id)
            .eq('seller_id', sellerId)
            .eq('item_id', itemId)
            .single(),

          supabase
            .from('send_item_history')
            .select('*')
            .eq('user_id', user.id)
            .eq('seller_id', sellerId)
            .eq('item_id', itemId)
            .order('occurred_at', { ascending: false })
            .limit(50),

          supabase
            .from('meli_listings_cache')
            .select('title, thumbnail, sku, permalink, price, status, available_quantity')
            .eq('seller_id', sellerId)
            .eq('item_id', mlbId)
            .limit(1)
            .single()
        ]);

        let metricsData = null;
        if (plantedRes.data) {
          const metricsRes = await supabase
            .from('send_metrics_snapshots')
            .select('*')
            .eq('planted_item_id', plantedRes.data.id)
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .single();
          metricsData = metricsRes.data;
        }

        setData({
          planted: plantedRes.data as SendPlantedItem | null,
          metrics: metricsData as SendMetricsSnapshot | null,
          history: (historyRes.data || []) as SendItemHistory[],
          listing: listingRes.data || null
        });
      } catch (err) {
        console.error('[SendItemDetailDrawer] Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, itemId, sellerId]);

  const handleAddNote = async () => {
    if (!note.trim() || !itemId) return;

    setSavingNote(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('send_item_history').insert({
        user_id: user.id,
        seller_id: sellerId,
        item_id: itemId,
        event_type: 'milestone',
        event_data: { note: note.trim() }
      });

      toast.success("Nota adicionada");
      setNote("");
      
      // Refresh history
      const { data: historyData } = await supabase
        .from('send_item_history')
        .select('*')
        .eq('user_id', user.id)
        .eq('seller_id', sellerId)
        .eq('item_id', itemId)
        .order('occurred_at', { ascending: false })
        .limit(50);

      setData(prev => ({ ...prev, history: (historyData || []) as SendItemHistory[] }));
    } catch (err) {
      toast.error("Erro ao salvar nota");
    } finally {
      setSavingNote(false);
    }
  };

  const getTrendIcon = (trend: number | null) => {
    if (trend === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
    if (trend > 5) return <TrendingUp className="h-4 w-4 text-success" />;
    if (trend < -5) return <TrendingDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'planted': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'removed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'health_changed': return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'stage_changed': return <TrendingUp className="h-4 w-4 text-primary" />;
      case 'milestone': return <StickyNote className="h-4 w-4 text-primary" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventLabel = (type: string) => {
    const labels: Record<string, string> = {
      planted: 'Plantado',
      removed: 'Removido',
      health_changed: 'Saúde alterada',
      stage_changed: 'Estágio alterado',
      milestone: 'Nota/Marco'
    };
    return labels[type] || type;
  };

  const title = data.listing?.title || data.planted?.item_title || itemId || 'Carregando...';
  const thumbnail = data.listing?.thumbnail || data.planted?.item_thumbnail;
  const sku = data.listing?.sku || '-';
  const healthConfig = data.planted ? HEALTH_STATUS_CONFIG[data.planted.health_status] : null;
  const growthConfig = data.planted ? GROWTH_STAGE_CONFIG[data.planted.growth_stage] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-start gap-4">
            {/* Thumbnail */}
            <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
              {loading ? (
                <Skeleton className="w-full h-full" />
              ) : thumbnail ? (
                <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageOff className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base line-clamp-2 mb-1">
                {loading ? <Skeleton className="h-5 w-48" /> : title}
              </SheetTitle>
              
              {!loading && (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    {itemId} {sku !== '-' && `• SKU: ${sku}`}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {data.planted && (
                      <>
                        <Badge variant="outline" className={cn("text-[10px]", healthConfig?.color)}>
                          {healthConfig?.label}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {growthConfig?.emoji} {growthConfig?.label}
                        </Badge>
                        <Badge variant={data.planted.is_a_plus ? "default" : "outline"} className="text-[10px]">
                          {data.planted.is_a_plus ? 'A+' : data.planted.abc_class}
                        </Badge>
                      </>
                    )}
                    {!data.planted && (
                      <Badge variant="secondary" className="text-[10px]">Elegível</Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col mt-4">
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="performance" className="text-xs">
                <BarChart3 className="h-3 w-3 mr-1" />
                Performance
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Histórico
              </TabsTrigger>
              <TabsTrigger value="actions" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                Ações
              </TabsTrigger>
              <TabsTrigger value="diagnostic" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Diagnóstico
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto py-4">
              {/* Performance Tab */}
              <TabsContent value="performance" className="mt-0 space-y-4">
                {data.metrics ? (
                  <>
                    {/* Sales metrics */}
                    <Card>
                      <CardContent className="p-4">
                        <h4 className="text-sm font-medium mb-3">Vendas</h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center p-2 rounded bg-muted/50">
                            <p className="text-lg font-bold">{data.metrics.sales_count_7d}</p>
                            <p className="text-[10px] text-muted-foreground">7 dias</p>
                          </div>
                          <div className="text-center p-2 rounded bg-muted/50">
                            <p className="text-lg font-bold">{data.metrics.sales_count_30d}</p>
                            <p className="text-[10px] text-muted-foreground">30 dias</p>
                          </div>
                          <div className="text-center p-2 rounded bg-muted/50">
                            <p className="text-lg font-bold">
                              {data.metrics.avg_sales_interval_hours 
                                ? `${Math.round(data.metrics.avg_sales_interval_hours)}h`
                                : '-'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Intervalo médio</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Visits & Conversion */}
                    <Card>
                      <CardContent className="p-4">
                        <h4 className="text-sm font-medium mb-3">Visitas & Conversão</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded bg-muted/50">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">Visitas 7d</span>
                              {getTrendIcon(data.metrics.visit_trend)}
                            </div>
                            <p className="text-lg font-bold">{data.metrics.visits_7d}</p>
                          </div>
                          <div className="p-3 rounded bg-muted/50">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">Conversão</span>
                              {getTrendIcon(data.metrics.conversion_trend)}
                            </div>
                            <p className="text-lg font-bold">
                              {data.metrics.conversion_rate 
                                ? `${data.metrics.conversion_rate.toFixed(1)}%` 
                                : '-'}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Maturity */}
                    <Card>
                      <CardContent className="p-4">
                        <h4 className="text-sm font-medium mb-3">Maturidade</h4>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="h-3 rounded-full bg-muted overflow-hidden">
                              <div 
                                className="h-full bg-primary transition-all"
                                style={{ width: `${data.metrics.maturity_score || 0}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-lg font-bold">
                            {data.metrics.maturity_score?.toFixed(0) || 0}/100
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card className="p-8 text-center">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Métricas serão coletadas após o plantio
                    </p>
                  </Card>
                )}
              </TabsContent>

              {/* Timeline Tab */}
              <TabsContent value="timeline" className="mt-0 space-y-4">
                {data.planted && (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Plantado há</p>
                      <p className="text-lg font-bold">
                        {formatDistanceToNow(new Date(data.planted.planted_at), { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {data.planted.days_planted} dias no Send
                      </p>
                    </CardContent>
                  </Card>
                )}

                {data.history.length > 0 ? (
                  <div className="space-y-3">
                    {data.history.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                        {getEventIcon(event.event_type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {getEventLabel(event.event_type)}
                          </p>
                          {event.event_data && typeof event.event_data === 'object' && 'note' in event.event_data && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {String(event.event_data.note)}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {format(new Date(event.occurred_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Nenhum evento registrado ainda
                    </p>
                  </Card>
                )}
              </TabsContent>

              {/* Actions Tab */}
              <TabsContent value="actions" className="mt-0 space-y-4">
                {/* Add note */}
                <Card>
                  <CardContent className="p-4">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <StickyNote className="h-4 w-4" />
                      Adicionar nota
                    </h4>
                    <Textarea
                      placeholder="Escreva uma observação sobre este anúncio..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="mb-2"
                      rows={3}
                    />
                    <Button 
                      size="sm" 
                      onClick={handleAddNote}
                      disabled={!note.trim() || savingNote}
                    >
                      {savingNote ? 'Salvando...' : 'Salvar nota'}
                    </Button>
                  </CardContent>
                </Card>

                {/* Quick actions */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <h4 className="text-sm font-medium mb-3">Ações rápidas</h4>

                    {data.listing?.permalink && (
                      <Button 
                        variant="outline" 
                        className="w-full justify-start"
                        onClick={() => window.open(data.listing!.permalink, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir no Mercado Livre
                      </Button>
                    )}

                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => toast.info("Em breve: Criar tarefa")}
                    >
                      <ClipboardPlus className="h-4 w-4 mr-2" />
                      Criar tarefa para este anúncio
                    </Button>

                    {data.planted && (
                      <Button 
                        variant="outline" 
                        className="w-full justify-start text-destructive hover:text-destructive"
                        onClick={() => {
                          onRemove(itemId!);
                          onOpenChange(false);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover do Send
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Diagnostic Tab */}
              <TabsContent value="diagnostic" className="mt-0 space-y-4">
                {data.planted && data.planted.health_status !== 'healthy' && (
                  <Card className="border-warning/50 bg-warning/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-medium">
                            {healthConfig?.label}: {healthConfig?.description}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Considere revisar preço, título ou fotos deste anúncio.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {data.listing && data.listing.available_quantity === 0 && (
                  <Card className="border-destructive/50 bg-destructive/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-medium">Estoque zerado</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Este anúncio está sem estoque. Reponha para não perder posicionamento.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {data.metrics && data.metrics.conversion_rate && data.metrics.conversion_rate < 1 && (
                  <Card className="border-warning/50 bg-warning/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-medium">Conversão baixa</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Taxa de conversão abaixo de 1%. Revise fotos, descrição ou preço.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {(!data.planted || data.planted.health_status === 'healthy') && 
                 data.listing?.available_quantity && data.listing.available_quantity > 0 &&
                 (!data.metrics?.conversion_rate || data.metrics.conversion_rate >= 1) && (
                  <Card className="border-success/50 bg-success/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-medium">Anúncio saudável</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Nenhum problema crítico identificado. Continue monitorando.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-4">
                    <h4 className="text-sm font-medium mb-3">Dados do anúncio</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status ML:</span>
                        <span>{data.listing?.status || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Preço:</span>
                        <span>R$ {data.listing?.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Estoque:</span>
                        <span>{data.listing?.available_quantity ?? '-'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        )}

        <SheetFooter className="border-t pt-4 mt-4">
          <SheetClose asChild>
            <Button variant="outline" className="w-full">Fechar</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
