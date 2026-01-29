import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  ShoppingCart,
  XCircle,
  Copy,
  RefreshCcw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { StatusBucketBadge, GapMetricsCard, AuditLog, ActionDrawer } from "@/components/ad-timeline";
import {
  useAdTimelineItemDetail,
  useAdTimelineEvents,
  useAdLifecycleActions,
  useCreateAction,
} from "@/hooks/useAdTimeline";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
import type { StatusBucket, ActionType, CloneChecklist } from "@/types/ad-timeline";

export default function AdTimelineDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { sellerId } = useActiveAccount();
  // Use centralized hook instead of direct Supabase call
  const workspaceId = useCurrentUserId();
  const mlAccountId = sellerId || undefined;

  const [actionDrawerOpen, setActionDrawerOpen] = useState(false);
  const [actionType, setActionType] = useState<ActionType>('END');

  const { data: item, isLoading: itemLoading } = useAdTimelineItemDetail(workspaceId, itemId || null);
  const { data: events, isLoading: eventsLoading } = useAdTimelineEvents(workspaceId, itemId || null);
  const { data: actions, isLoading: actionsLoading } = useAdLifecycleActions(workspaceId);
  const createActionMutation = useCreateAction();

  const itemActions = actions?.filter(a => a.item_id === itemId) || [];

  const handleCreateAction = (type: ActionType) => {
    setActionType(type);
    setActionDrawerOpen(true);
  };

  const handleConfirmAction = async (reason: string, checklist: CloneChecklist) => {
    if (!workspaceId || !mlAccountId || !itemId) return;
    
    await createActionMutation.mutateAsync({
      workspaceId,
      mlAccountId,
      itemId,
      actionType,
      reason,
      checklist,
    });
    
    setActionDrawerOpen(false);
  };

  if (itemLoading) {
    return (
      <PageContainer title="Carregando..." subtitle="Detalhes do anúncio">
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-40" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-40" />
              <Skeleton className="h-32" />
            </div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!item) {
    return (
      <PageContainer title="Anúncio não encontrado" subtitle="Detalhes do anúncio">
        <div className="p-6 text-center py-12">
          <p className="text-muted-foreground mb-4">O anúncio solicitado não foi encontrado.</p>
          <Button onClick={() => navigate('/anuncios/linha-do-tempo')}>Voltar ao Radar</Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={item.title || item.item_id} subtitle={`Linha do tempo - ${item.item_id}`}>
      <div className="p-6 space-y-6">
        <Button variant="ghost" onClick={() => navigate('/anuncios/linha-do-tempo')}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar ao Radar
        </Button>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              {item.thumbnail ? (
                <img src={item.thumbnail} alt="" className="w-32 h-32 object-cover rounded-lg" />
              ) : (
                <div className="w-32 h-32 bg-muted rounded-lg flex items-center justify-center">
                  <Clock className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{item.title || item.item_id}</h2>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{item.item_id}</span>
                      <a href={`https://www.mercadolivre.com.br/p/${item.item_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                        <ExternalLink className="h-3 w-3" />Ver no ML
                      </a>
                    </div>
                  </div>
                  <StatusBucketBadge bucket={item.status_bucket as StatusBucket} />
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  {item.price && <div><span className="text-muted-foreground">Preço:</span> <span className="font-medium">R$ {item.price.toFixed(2)}</span></div>}
                  {item.status && <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{item.status}</Badge></div>}
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleCreateAction('END')}><XCircle className="h-4 w-4 mr-1" />Encerrar</Button>
                  <Button size="sm" variant="outline" onClick={() => handleCreateAction('RELIST')}><RefreshCcw className="h-4 w-4 mr-1" />Republicar</Button>
                  <Button size="sm" variant="outline" onClick={() => handleCreateAction('CLONE')}><Copy className="h-4 w-4 mr-1" />Clonar</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />Vendas por Período
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div><div className="text-2xl font-bold">{item.sales_count_30d}</div><div className="text-xs text-muted-foreground">30 dias</div></div>
                  <div><div className="text-2xl font-bold">{item.sales_count_60d}</div><div className="text-xs text-muted-foreground">60 dias</div></div>
                  <div><div className="text-2xl font-bold">{item.sales_count_90d}</div><div className="text-xs text-muted-foreground">90 dias</div></div>
                  <div><div className="text-2xl font-bold">{item.sales_count_120d}</div><div className="text-xs text-muted-foreground">120 dias</div></div>
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-2 gap-4">
                  <div><div className="text-sm text-muted-foreground">Primeira venda</div><div className="font-medium">{item.first_sale_at ? format(new Date(item.first_sale_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}</div></div>
                  <div><div className="text-sm text-muted-foreground">Última venda</div><div className="font-medium">{item.last_sale_at ? format(new Date(item.last_sale_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}</div></div>
                </div>
                {item.days_since_last_sale !== null && (
                  <div className="mt-4 p-3 bg-muted rounded-lg text-center">
                    <div className="text-3xl font-bold text-warning">{item.days_since_last_sale}</div>
                    <div className="text-sm text-muted-foreground">dias sem vender</div>
                  </div>
                )}
              </CardContent>
            </Card>
            <GapMetricsCard avgGapHours={item.avg_gap_hours} medianGapHours={item.median_gap_hours} maxGapHours={item.max_gap_hours} />
          </div>
          <AuditLog events={events || []} actions={itemActions} isLoading={eventsLoading || actionsLoading} />
        </div>
      </div>

      <ActionDrawer open={actionDrawerOpen} onOpenChange={setActionDrawerOpen} actionType={actionType} itemId={item.item_id} itemTitle={item.title} itemStatus={item.status} onConfirm={handleConfirmAction} isLoading={createActionMutation.isPending} />
    </PageContainer>
  );
}
