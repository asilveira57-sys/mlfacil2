import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Tag,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Package,
  Loader2,
  Info,
  Percent,
  CalendarClock,
  ClipboardPlus,
  Store,
  History,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { usePromotions, usePromotionItems, PromotionSnapshot, PromotionItemSnapshot } from '@/hooks/usePromotions';
import { usePromotionTasks } from '@/hooks/usePromotionTasks';
import { usePromotionSyncLogs } from '@/hooks/usePromotionSyncLogs';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

export default function Promocoes() {
  const { sellerId, activeAccount, loading: accountLoading, initialized } = useActiveAccount();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<PromotionSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { createTask, creating } = usePromotionTasks();

  // Fetch workspace on mount
  useEffect(() => {
    const fetchContext = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's workspace
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_workspace_id')
        .eq('user_id', user.id)
        .single();

      if (prefs?.active_workspace_id) {
        setWorkspaceId(prefs.active_workspace_id);
      }
    };

    fetchContext();
  }, []);

  const {
    promotions,
    loading,
    error,
    refetch,
    activePromotions,
    endingSoonPromotions,
    finishedPromotions,
  } = usePromotions(workspaceId, sellerId);

  const {
    items: selectedItems,
    loading: itemsLoading,
    pendingItems,
    ineligibleItems,
    startedItems,
  } = usePromotionItems(workspaceId, selectedPromotion?.promotion_id, sellerId);

  // Sync logs
  const { lastSync, refetch: refetchLogs } = usePromotionSyncLogs(workspaceId, sellerId);

  const handleSync = async () => {
    if (!workspaceId || !sellerId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('promotions-sync', {
        body: { workspace_id: workspaceId, account_id: sellerId },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Sincronizado: ${data.promotions_synced || 0} promoções`);
      }
      await refetch();
      await refetchLogs();
    } catch (err) {
      console.error('[Promocoes] Sync error:', err);
      toast.error('Erro ao sincronizar promoções');
    } finally {
      setSyncing(false);
    }
  };

  // Handle manual task creation
  const handleCreateTask = async (taskType: 'ineligible' | 'expiring' | 'review' | 'custom') => {
    if (!workspaceId || !sellerId || !selectedPromotion) return;
    
    await createTask({
      workspaceId,
      sellerId,
      promotionId: selectedPromotion.promotion_id,
      promotionName: selectedPromotion.promotion_name,
      taskType,
    });
  };

  // Show loading while context initializes
  if (accountLoading || !initialized) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!sellerId) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Conecte uma conta</h3>
              <p className="text-muted-foreground">
                Conecte sua conta do Mercado Livre para acessar a Central de Promoções.
              </p>
              <Button className="mt-4" onClick={() => window.location.href = '/settings'}>
                Conectar Conta
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!workspaceId) {
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Tag className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Central de Promoções</h1>
              <p className="text-muted-foreground text-sm">
                Gerencie suas promoções e ofertas do Mercado Livre
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Active Account Indicator */}
            {activeAccount && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border">
                <Store className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {activeAccount.nickname || activeAccount.sellerId}
                </span>
              </div>
            )}
            
            {/* Last Sync Info */}
            {lastSync && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <History className="h-3.5 w-3.5" />
                    <span>
                      {format(new Date(lastSync.started_at), 'HH:mm', { locale: ptBR })}
                    </span>
                    {lastSync.status === 'success' && <CheckCircle2 className="h-3 w-3 text-success" />}
                    {lastSync.status === 'error' && <XCircle className="h-3 w-3 text-destructive" />}
                    {lastSync.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Última sync: {format(new Date(lastSync.started_at), 'dd/MM HH:mm', { locale: ptBR })}</p>
                  <p className="text-xs opacity-70">{lastSync.promotions_synced || 0} promoções sincronizadas</p>
                </TooltipContent>
              </Tooltip>
            )}
            
            <Button onClick={handleSync} disabled={syncing} className="gap-2">
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sincronizar
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar promoções</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Promoções Ativas"
            value={activePromotions.length}
            icon={<TrendingUp className="h-5 w-5" />}
            loading={loading}
            color="success"
          />
          <KpiCard
            title="Terminando em 48h"
            value={endingSoonPromotions.length}
            icon={<CalendarClock className="h-5 w-5" />}
            loading={loading}
            color={endingSoonPromotions.length > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            title="Itens Participando"
            value={promotions.reduce((acc, p) => acc + (p.items_count || 0), 0)}
            icon={<Package className="h-5 w-5" />}
            loading={loading}
          />
          <KpiCard
            title="Finalizadas"
            value={finishedPromotions.length}
            icon={<CheckCircle2 className="h-5 w-5" />}
            loading={loading}
            color="muted"
          />
        </div>

        {/* Promotions Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Promoções</CardTitle>
            <CardDescription>
              Clique em uma promoção para ver os itens participantes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : promotions.length === 0 ? (
              <div className="text-center py-12">
                <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-medium mb-2">Nenhuma promoção encontrada</h3>
                <p className="text-sm text-muted-foreground">
                  Sincronize para buscar promoções do Mercado Livre.
                </p>
              </div>
            ) : (
              <Tabs defaultValue="active">
                <TabsList className="mb-4">
                  <TabsTrigger value="active" className="gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Ativas ({activePromotions.length})
                  </TabsTrigger>
                  <TabsTrigger value="ending" className="gap-2">
                    <Clock className="h-4 w-4" />
                    Terminando ({endingSoonPromotions.length})
                  </TabsTrigger>
                  <TabsTrigger value="finished" className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Finalizadas ({finishedPromotions.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active">
                  <PromotionsTable 
                    promotions={activePromotions} 
                    onSelect={setSelectedPromotion}
                  />
                </TabsContent>
                <TabsContent value="ending">
                  <PromotionsTable 
                    promotions={endingSoonPromotions} 
                    onSelect={setSelectedPromotion}
                  />
                </TabsContent>
                <TabsContent value="finished">
                  <PromotionsTable 
                    promotions={finishedPromotions} 
                    onSelect={setSelectedPromotion}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Promotion Detail Drawer */}
        <Sheet open={!!selectedPromotion} onOpenChange={() => setSelectedPromotion(null)}>
          <SheetContent className="sm:max-w-xl">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {selectedPromotion?.promotion_name || `Promoção ${selectedPromotion?.promotion_id}`}
              </SheetTitle>
              <SheetDescription>
                Tipo: {selectedPromotion?.promotion_type} | Status: {selectedPromotion?.status}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Promotion Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block">Início</span>
                  <span className="font-medium">
                    {selectedPromotion?.start_at 
                      ? format(new Date(selectedPromotion.start_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Término</span>
                  <span className="font-medium">
                    {selectedPromotion?.end_at 
                      ? format(new Date(selectedPromotion.end_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                      : '-'}
                  </span>
                </div>
              </div>

              {/* Items Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-success/10 text-center">
                  <span className="text-2xl font-bold text-success">{startedItems.length}</span>
                  <span className="block text-xs text-muted-foreground">Participando</span>
                </div>
                <div className="p-3 rounded-lg bg-warning/10 text-center">
                  <span className="text-2xl font-bold text-warning">{pendingItems.length}</span>
                  <span className="block text-xs text-muted-foreground">Pendentes</span>
                </div>
                <div className="p-3 rounded-lg bg-destructive/10 text-center">
                  <span className="text-2xl font-bold text-destructive">{ineligibleItems.length}</span>
                  <span className="block text-xs text-muted-foreground">Inelegíveis</span>
                </div>
              </div>

              {/* Task Creation Actions */}
              <div className="space-y-3">
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Criar Tarefa</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ineligibleItems.length > 0 && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="gap-1.5 text-destructive border-destructive/30"
                      onClick={() => handleCreateTask('ineligible')}
                      disabled={creating}
                    >
                      <ClipboardPlus className="h-3.5 w-3.5" />
                      Corrigir Inelegíveis
                    </Button>
                  )}
                  {selectedPromotion?.status === 'started' && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="gap-1.5"
                      onClick={() => handleCreateTask('expiring')}
                      disabled={creating}
                    >
                      <ClipboardPlus className="h-3.5 w-3.5" />
                      Planejar Renovação
                    </Button>
                  )}
                  {selectedPromotion?.status === 'finished' && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="gap-1.5"
                      onClick={() => handleCreateTask('review')}
                      disabled={creating}
                    >
                      <ClipboardPlus className="h-3.5 w-3.5" />
                      Revisar Resultados
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              {/* Items Table */}
              <div>
                <h4 className="font-medium mb-3">Itens da Promoção</h4>
                {itemsLoading ? (
                  <Skeleton className="h-32" />
                ) : selectedItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhum item encontrado</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item ID</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Preço</TableHead>
                          <TableHead className="text-right">Desconto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedItems.slice(0, 10).map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-xs">{item.item_id}</TableCell>
                            <TableCell>
                              <ItemStatusBadge status={item.item_status} />
                            </TableCell>
                            <TableCell className="text-right">
                              {item.promo_price ? (
                                <div>
                                  <span className="line-through text-muted-foreground text-xs">
                                    R$ {item.original_price?.toFixed(2)}
                                  </span>
                                  <span className="block font-medium text-success">
                                    R$ {item.promo_price.toFixed(2)}
                                  </span>
                                </div>
                              ) : (
                                <span>R$ {item.original_price?.toFixed(2) || '-'}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.discount_percent ? (
                                <Badge variant="outline" className="gap-1">
                                  <Percent className="h-3 w-3" />
                                  {item.discount_percent}%
                                </Badge>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {selectedItems.length > 10 && (
                      <div className="p-2 text-center text-sm text-muted-foreground border-t">
                        +{selectedItems.length - 10} itens adicionais
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}

// Sub-components
function KpiCard({ 
  title, 
  value, 
  icon, 
  loading, 
  color = 'default' 
}: { 
  title: string; 
  value: number; 
  icon: React.ReactNode;
  loading: boolean;
  color?: 'default' | 'success' | 'warning' | 'muted';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            color === 'success' && "bg-success/10 text-success",
            color === 'warning' && "bg-warning/10 text-warning",
            color === 'muted' && "bg-muted text-muted-foreground",
            color === 'default' && "bg-primary/10 text-primary"
          )}>
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PromotionsTable({ 
  promotions, 
  onSelect 
}: { 
  promotions: PromotionSnapshot[]; 
  onSelect: (p: PromotionSnapshot) => void;
}) {
  if (promotions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Nenhuma promoção nesta categoria</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Promoção</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Período</TableHead>
            <TableHead className="text-right">Itens</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {promotions.map(promo => (
            <TableRow 
              key={promo.id} 
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onSelect(promo)}
            >
              <TableCell className="font-medium">
                {promo.promotion_name || `Promoção ${promo.promotion_id.slice(0, 8)}...`}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{promo.promotion_type}</Badge>
              </TableCell>
              <TableCell>
                <PromotionStatusBadge status={promo.status} />
              </TableCell>
              <TableCell>
                {promo.end_at ? (
                  <span className="text-sm">
                    {formatDistanceToNow(new Date(promo.end_at), { 
                      addSuffix: true, 
                      locale: ptBR 
                    })}
                  </span>
                ) : '-'}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary">{promo.items_count || 0}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PromotionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    started: { label: 'Ativa', variant: 'default' },
    pending: { label: 'Pendente', variant: 'secondary' },
    finished: { label: 'Finalizada', variant: 'outline' },
    cancelled: { label: 'Cancelada', variant: 'destructive' },
  };

  const { label, variant } = config[status] || { label: status, variant: 'outline' };

  return (
    <Badge variant={variant} className="gap-1">
      {status === 'started' && <TrendingUp className="h-3 w-3" />}
      {status === 'finished' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'cancelled' && <XCircle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

function ItemStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    started: { label: 'Participando', variant: 'default' },
    candidate: { label: 'Candidato', variant: 'secondary' },
    pending: { label: 'Pendente', variant: 'secondary' },
    ineligible: { label: 'Inelegível', variant: 'destructive' },
    finished: { label: 'Finalizado', variant: 'outline' },
  };

  const { label, variant } = config[status] || { label: status, variant: 'outline' };

  return <Badge variant={variant}>{label}</Badge>;
}
