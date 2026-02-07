import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  CalendarClock,
  Store,
  History,
  WifiOff,
  Link2,
  Search,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { usePromotions, PromotionSnapshot } from '@/hooks/usePromotions';
import { useEnrichedPromotionItems, EnrichedPromotionItem } from '@/hooks/useEnrichedPromotionItems';
import { usePromotionTasks } from '@/hooks/usePromotionTasks';
import { usePromotionSyncLogs } from '@/hooks/usePromotionSyncLogs';
import { invokeEdgeFunction, getUserFriendlyError } from '@/lib/edgeFunctionClient';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PromotionDetailModal } from '@/components/promotions/PromotionDetailModal';

export default function Promocoes() {
  const navigate = useNavigate();
  const { sellerId, activeAccount, loading: accountLoading, initialized } = useActiveAccount();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<PromotionSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncErrorCode, setSyncErrorCode] = useState<string | null>(null);
  const { createTask, creating } = usePromotionTasks();

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Adhere/remove action state
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    action: 'adhere' | 'remove';
    items: { item_id: string; price?: number }[];
    label: string;
  } | null>(null);

  // Fetch workspace on mount
  useEffect(() => {
    const fetchContext = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
    refetch: refetchItems,
    pendingItems,
    ineligibleItems,
    startedItems,
  } = useEnrichedPromotionItems(workspaceId, selectedPromotion?.promotion_id, sellerId);

  // Sync logs
  const { lastSync, refetch: refetchLogs } = usePromotionSyncLogs(workspaceId, sellerId);

  // Unique promotion types for filter dropdown
  const promotionTypes = useMemo(() => {
    const types = new Set(promotions.map(p => p.promotion_type));
    return Array.from(types).sort();
  }, [promotions]);

  // Filter promotions by search and type
  const filterPromotions = (list: PromotionSnapshot[]) => {
    return list.filter(p => {
      const matchesSearch = !searchQuery || 
        (p.promotion_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        p.promotion_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || p.promotion_type === typeFilter;
      return matchesSearch && matchesType;
    });
  };

  const filteredActive = useMemo(() => filterPromotions(activePromotions), [activePromotions, searchQuery, typeFilter]);
  const filteredEnding = useMemo(() => filterPromotions(endingSoonPromotions), [endingSoonPromotions, searchQuery, typeFilter]);
  const filteredFinished = useMemo(() => filterPromotions(finishedPromotions), [finishedPromotions, searchQuery, typeFilter]);

  // Define result type for sync
  interface SyncResultData {
    promotions_synced?: number;
    items_synced?: number;
    events_created?: number;
    expired_marked?: number;
    log_id?: string;
  }

  const handleSync = async () => {
    if (!workspaceId || !sellerId) return;
    setSyncing(true);
    setSyncError(null);
    setSyncErrorCode(null);

    const result = await invokeEdgeFunction<SyncResultData>('promotions-sync', {
      body: { workspace_id: workspaceId, account_id: sellerId },
    });

    setSyncing(false);

    if (!result.success) {
      setSyncError(result.error);
      setSyncErrorCode(result.errorCode);
      
      if (result.errorCode === 'TOKEN_EXPIRED' || result.errorCode === 'ML_AUTH_REQUIRED' || result.errorCode === 'NO_CONNECTED_ACCOUNT') {
        toast.error('Reconecte sua conta do Mercado Livre', {
          description: result.error,
          action: {
            label: 'Conectar',
            onClick: () => navigate('/settings'),
          },
        });
      } else {
        toast.error(getUserFriendlyError(result.errorCode, result.error || undefined));
      }
      return;
    }

    const data = result.data;
    toast.success(`Sincronizado: ${data?.promotions_synced || 0} promoções, ${data?.items_synced || 0} itens${data?.expired_marked ? `, ${data.expired_marked} expiradas marcadas` : ''}`);
    await refetch();
    await refetchLogs();
  };

  // Handle adhere/remove action
  const handlePromotionAction = async (action: 'adhere' | 'remove', items: { item_id: string; price?: number }[]) => {
    if (!workspaceId || !sellerId || !selectedPromotion) return;
    setActionLoading(true);

    try {
      const result = await invokeEdgeFunction<{
        success_count: number;
        failed_count: number;
        results: { item_id: string; success: boolean; error?: string }[];
      }>('promotions-action', {
        body: {
          action,
          workspace_id: workspaceId,
          seller_id: sellerId,
          promotion_id: selectedPromotion.promotion_id,
          promotion_type: selectedPromotion.promotion_type,
          items,
        },
      });

      if (!result.success) {
        toast.error(result.error || 'Erro ao executar ação');
      } else {
        const data = result.data;
        if (data?.failed_count && data.failed_count > 0) {
          toast.warning(`${data.success_count} ok, ${data.failed_count} falharam`);
        } else {
          toast.success(`${action === 'adhere' ? 'Aderido' : 'Removido'}: ${data?.success_count || 0} itens`);
        }
        // Refresh items and promotions
        await refetchItems();
        await refetch();
      }
    } catch (err) {
      toast.error('Erro ao executar ação');
      console.error('[Promocoes] Action error:', err);
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
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
      <PageContainer title="Promoções" subtitle="Central de Promoções">
        <div className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!sellerId) {
    return (
      <PageContainer title="Promoções" subtitle="Central de Promoções">
        <div className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Conecte uma conta</h3>
              <p className="text-muted-foreground">
                Conecte sua conta do Mercado Livre para acessar a Central de Promoções.
              </p>
              <Button className="mt-4" onClick={() => navigate('/settings')}>
                Conectar Conta
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  // FIX #5: Show loading skeleton when workspace not yet loaded
  if (!workspaceId) {
    return (
      <PageContainer title="Promoções" subtitle="Central de Promoções">
        <div className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Promoções" subtitle="Central de Promoções">
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
            {activeAccount && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border">
                <Store className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {activeAccount.nickname || activeAccount.sellerId}
                </span>
              </div>
            )}
            
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

        {/* Sync Error Alert */}
        {syncError && (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>Erro na sincronização</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{syncError}</span>
              {(syncErrorCode === 'TOKEN_EXPIRED' || syncErrorCode === 'ML_AUTH_REQUIRED') && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="ml-4 gap-1.5"
                  onClick={() => navigate('/settings')}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Reconectar Conta
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Data Loading Error Alert */}
        {error && !syncError && (
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

        {/* Search & Filter - FIX #6 */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar promoção..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {promotionTypes.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                    Ativas ({filteredActive.length})
                  </TabsTrigger>
                  <TabsTrigger value="ending" className="gap-2">
                    <Clock className="h-4 w-4" />
                    Terminando ({filteredEnding.length})
                  </TabsTrigger>
                  <TabsTrigger value="finished" className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Finalizadas ({filteredFinished.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active">
                  <PromotionsTable 
                    promotions={filteredActive} 
                    onSelect={setSelectedPromotion}
                  />
                </TabsContent>
                <TabsContent value="ending">
                  <PromotionsTable 
                    promotions={filteredEnding} 
                    onSelect={setSelectedPromotion}
                  />
                </TabsContent>
                <TabsContent value="finished">
                  <PromotionsTable 
                    promotions={filteredFinished} 
                    onSelect={setSelectedPromotion}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Promotion Detail Modal */}
        <PromotionDetailModal
          promotion={selectedPromotion}
          onClose={() => setSelectedPromotion(null)}
          items={selectedItems}
          itemsLoading={itemsLoading}
          pendingItems={pendingItems}
          ineligibleItems={ineligibleItems}
          startedItems={startedItems}
          actionLoading={actionLoading}
          creating={creating}
          onAdhere={(item: EnrichedPromotionItem) => setConfirmAction({
            action: 'adhere',
            items: [{ item_id: item.item_id, price: item.promo_price || item.original_price || undefined }],
            label: `Aderir item ${item.title || item.item_id} à promoção`,
          })}
          onRemove={(item: EnrichedPromotionItem) => setConfirmAction({
            action: 'remove',
            items: [{ item_id: item.item_id }],
            label: `Remover item ${item.title || item.item_id} da promoção`,
          })}
          onAdhereAll={() => setConfirmAction({
            action: 'adhere',
            items: pendingItems.map(i => ({
              item_id: i.item_id,
              price: i.promo_price || i.original_price || undefined,
            })),
            label: `Aderir ${pendingItems.length} itens candidatos à promoção`,
          })}
          onCreateTask={handleCreateTask}
        />

        {/* Confirmation Dialog */}
        <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction?.action === 'adhere' ? 'Aderir Itens' : 'Remover Itens'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction?.label}
                <br />
                <span className="text-xs text-muted-foreground mt-1 block">
                  Esta ação será executada diretamente na API do Mercado Livre.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmAction && handlePromotionAction(confirmAction.action, confirmAction.items)}
                disabled={actionLoading}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageContainer>
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

