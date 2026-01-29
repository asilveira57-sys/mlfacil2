import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  RefreshCw,
  Download,
  MoreHorizontal,
  Eye,
  XCircle,
  Copy,
  RefreshCcw,
  AlertTriangle,
  Search,
  Filter,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { StatusBucketBadge, ActionDrawer } from "@/components/ad-timeline";
import {
  useAdTimelineStats,
  useAdTimelineBucketCounts,
  useRecalculateTimeline,
  useCreateAction,
} from "@/hooks/useAdTimeline";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
import type { StatusBucket, ActionType, CloneChecklist, AdTimelineStats } from "@/types/ad-timeline";

const bucketLabels: Record<StatusBucket | 'ALL', string> = {
  ALL: 'Todos',
  OK: 'OK',
  '30D': '30 dias',
  '60D': '60 dias',
  '90D': '90 dias',
  '120D': '120 dias',
  NO_SALES: 'Sem vendas',
};

export default function AdTimelineRadar() {
  const navigate = useNavigate();
  const { sellerId } = useActiveAccount();
  // Use centralized hook instead of direct Supabase call
  const workspaceId = useCurrentUserId();
  const mlAccountId = sellerId || undefined;

  const [statusFilter, setStatusFilter] = useState<StatusBucket | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState("");
  const [actionDrawerOpen, setActionDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AdTimelineStats | null>(null);
  const [actionType, setActionType] = useState<ActionType>('END');

  const { data: stats, isLoading: statsLoading } = useAdTimelineStats(workspaceId, {
    ml_account_id: mlAccountId,
    status_bucket: statusFilter,
  });

  const { data: bucketCounts, isLoading: countsLoading } = useAdTimelineBucketCounts(
    workspaceId,
    mlAccountId
  );

  const recalculateMutation = useRecalculateTimeline();
  const createActionMutation = useCreateAction();

  const handleRecalculate = () => {
    if (workspaceId) {
      recalculateMutation.mutate({ workspaceId, mlAccountId });
    }
  };

  const handleCreateAction = (item: AdTimelineStats, type: ActionType) => {
    setSelectedItem(item);
    setActionType(type);
    setActionDrawerOpen(true);
  };

  const handleConfirmAction = async (reason: string, checklist: CloneChecklist) => {
    if (!selectedItem || !workspaceId || !mlAccountId) return;
    
    await createActionMutation.mutateAsync({
      workspaceId,
      mlAccountId,
      itemId: selectedItem.item_id,
      actionType,
      reason,
      checklist,
    });
    
    setActionDrawerOpen(false);
    setSelectedItem(null);
  };

  const filteredStats = stats?.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.item_id.toLowerCase().includes(term) ||
      s.title?.toLowerCase().includes(term)
    );
  });

  const formatGap = (hours: number | null) => {
    if (hours === null) return "—";
    return `${Math.round(hours)}h`;
  };

  return (
    <PageContainer
      title="Linha do Tempo"
      subtitle="Radar de anúncios por intervalo de vendas"
    >
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {countsLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === '30D' ? 'ring-2 ring-warning' : 'hover:bg-muted/50'}`}
                onClick={() => setStatusFilter(statusFilter === '30D' ? 'ALL' : '30D')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-warning">{bucketCounts?.['30D'] || 0}</div>
                  <div className="text-xs text-muted-foreground">30 dias sem venda</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === '60D' ? 'ring-2 ring-destructive/70' : 'hover:bg-muted/50'}`}
                onClick={() => setStatusFilter(statusFilter === '60D' ? 'ALL' : '60D')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-destructive/80">{bucketCounts?.['60D'] || 0}</div>
                  <div className="text-xs text-muted-foreground">60 dias sem venda</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === '90D' ? 'ring-2 ring-destructive' : 'hover:bg-muted/50'}`}
                onClick={() => setStatusFilter(statusFilter === '90D' ? 'ALL' : '90D')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-destructive">{bucketCounts?.['90D'] || 0}</div>
                  <div className="text-xs text-muted-foreground">90 dias sem venda</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === '120D' ? 'ring-2 ring-destructive' : 'hover:bg-muted/50'}`}
                onClick={() => setStatusFilter(statusFilter === '120D' ? 'ALL' : '120D')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-destructive">{bucketCounts?.['120D'] || 0}</div>
                  <div className="text-xs text-muted-foreground">120 dias sem venda</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === 'NO_SALES' ? 'ring-2 ring-muted-foreground' : 'hover:bg-muted/50'}`}
                onClick={() => setStatusFilter(statusFilter === 'NO_SALES' ? 'ALL' : 'NO_SALES')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-muted-foreground">{bucketCounts?.NO_SALES || 0}</div>
                  <div className="text-xs text-muted-foreground">Sem vendas</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === 'OK' ? 'ring-2 ring-success' : 'hover:bg-muted/50'}`}
                onClick={() => setStatusFilter(statusFilter === 'OK' ? 'ALL' : 'OK')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-success">{bucketCounts?.OK || 0}</div>
                  <div className="text-xs text-muted-foreground">OK (vendendo)</div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID ou título..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusBucket | 'ALL')}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(bucketLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRecalculate}
              disabled={recalculateMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
              Recalcular
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Imagem</TableHead>
                  <TableHead>Anúncio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Última Venda</TableHead>
                  <TableHead className="text-center">Dias s/ Venda</TableHead>
                  <TableHead className="text-center">Média Gap</TableHead>
                  <TableHead className="text-center">30d</TableHead>
                  <TableHead className="text-center">60d</TableHead>
                  <TableHead className="text-center">90d</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-12 w-12 rounded" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredStats?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <AlertTriangle className="h-8 w-8" />
                        <p>Nenhum anúncio encontrado</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStats?.map((item) => (
                    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="h-12 w-12 object-cover rounded" />
                        ) : (
                          <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm truncate max-w-[200px] hover:underline"
                          onClick={() => navigate(`/anuncios/linha-do-tempo/${item.item_id}`)}>
                          {item.title || item.item_id}
                        </div>
                        <div className="text-xs text-muted-foreground">{item.item_id}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBucketBadge bucket={item.status_bucket as StatusBucket} />
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {item.last_sale_at ? format(new Date(item.last_sale_at), "dd/MM/yy", { locale: ptBR }) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-medium ${(item.days_since_last_sale || 0) > 60 ? 'text-destructive' : (item.days_since_last_sale || 0) > 30 ? 'text-warning' : 'text-foreground'}`}>
                          {item.days_since_last_sale ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm">{formatGap(item.avg_gap_hours)}</TableCell>
                      <TableCell className="text-center text-sm">{item.sales_count_30d}</TableCell>
                      <TableCell className="text-center text-sm">{item.sales_count_60d}</TableCell>
                      <TableCell className="text-center text-sm">{item.sales_count_90d}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/anuncios/linha-do-tempo/${item.item_id}`)}>
                              <Eye className="h-4 w-4 mr-2" />Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCreateAction(item, 'END')}>
                              <XCircle className="h-4 w-4 mr-2" />Encerrar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCreateAction(item, 'RELIST')}>
                              <RefreshCcw className="h-4 w-4 mr-2" />Republicar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCreateAction(item, 'CLONE')}>
                              <Copy className="h-4 w-4 mr-2" />Clonar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {selectedItem && (
        <ActionDrawer
          open={actionDrawerOpen}
          onOpenChange={setActionDrawerOpen}
          actionType={actionType}
          itemId={selectedItem.item_id}
          itemTitle={selectedItem.title}
          itemStatus={selectedItem.status}
          onConfirm={handleConfirmAction}
          isLoading={createActionMutation.isPending}
        />
      )}
    </PageContainer>
  );
}
