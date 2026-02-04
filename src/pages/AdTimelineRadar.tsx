import { useState, useMemo } from "react";
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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
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
import { useCurrentWorkspaceId } from "@/hooks/useCurrentWorkspaceId";
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

type SortColumn = 'last_sale_at' | 'days_since_last_sale' | 'avg_gap_hours' | 'sales_count_30d' | 'sales_count_60d' | 'sales_count_90d' | 'status' | 'available_quantity';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 30;

// ML Status badge component
function MlStatusBadge({ status }: { status?: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: 'Ativo', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
    paused: { label: 'Pausado', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
    under_review: { label: 'Em análise', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    closed: { label: 'Fechado', className: 'bg-red-500/10 text-red-600 border-red-500/20' },
    inactive: { label: 'Inativo', className: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
  };
  
  const cfg = config[status || ''] || { label: '—', className: 'bg-muted text-muted-foreground' };
  
  return (
    <Badge variant="outline" className={`font-medium ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

// Stock badge component
function StockBadge({ quantity }: { quantity?: number }) {
  if (quantity === undefined || quantity === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  
  if (quantity === 0) {
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 font-medium">
        Sem estoque
      </Badge>
    );
  }
  
  return <span className="font-medium">{quantity}</span>;
}

// Sortable header component
function SortableHeader({ 
  column, 
  label, 
  currentSort, 
  currentDirection, 
  onSort,
  className = ""
}: { 
  column: SortColumn; 
  label: string; 
  currentSort: SortColumn | null;
  currentDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const isActive = currentSort === column;
  
  return (
    <TableHead 
      className={`cursor-pointer select-none hover:bg-muted/50 transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1 justify-center">
        <span>{label}</span>
        {isActive ? (
          currentDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
        )}
      </div>
    </TableHead>
  );
}

export default function AdTimelineRadar() {
  const navigate = useNavigate();
  const { sellerId } = useActiveAccount();
  const { data: workspaceId } = useCurrentWorkspaceId();
  const mlAccountId = sellerId || undefined;

  const [statusFilter, setStatusFilter] = useState<StatusBucket | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState("");
  const [actionDrawerOpen, setActionDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AdTimelineStats | null>(null);
  const [actionType, setActionType] = useState<ActionType>('END');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn | null>('days_since_last_sale');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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
  
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  // Filter, sort and paginate data
  const { paginatedStats, totalPages, totalItems } = useMemo(() => {
    let filtered = stats?.filter(s => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        s.item_id.toLowerCase().includes(term) ||
        s.title?.toLowerCase().includes(term)
      );
    }) || [];
    
    // Sort
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortColumn];
        let bVal: any = b[sortColumn];
        
        // Handle nulls
        if (aVal === null || aVal === undefined) aVal = sortDirection === 'asc' ? Infinity : -Infinity;
        if (bVal === null || bVal === undefined) bVal = sortDirection === 'asc' ? Infinity : -Infinity;
        
        // Handle dates
        if (sortColumn === 'last_sale_at') {
          aVal = aVal === Infinity || aVal === -Infinity ? aVal : new Date(aVal).getTime();
          bVal = bVal === Infinity || bVal === -Infinity ? bVal : new Date(bVal).getTime();
        }
        
        if (sortDirection === 'asc') {
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
      });
    }
    
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedStats = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    
    return { paginatedStats, totalPages, totalItems };
  }, [stats, searchTerm, sortColumn, sortDirection, currentPage]);

  // Reset page when filter changes
  const handleStatusFilterChange = (value: StatusBucket | 'ALL') => {
    setStatusFilter(value);
    setCurrentPage(1);
  };
  
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const formatGap = (hours: number | null) => {
    if (hours === null) return "—";
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);

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
                onClick={() => handleStatusFilterChange(statusFilter === '30D' ? 'ALL' : '30D')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-warning">{bucketCounts?.['30D'] || 0}</div>
                  <div className="text-xs text-muted-foreground">30 dias sem venda</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === '60D' ? 'ring-2 ring-destructive/70' : 'hover:bg-muted/50'}`}
                onClick={() => handleStatusFilterChange(statusFilter === '60D' ? 'ALL' : '60D')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-destructive/80">{bucketCounts?.['60D'] || 0}</div>
                  <div className="text-xs text-muted-foreground">60 dias sem venda</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === '90D' ? 'ring-2 ring-destructive' : 'hover:bg-muted/50'}`}
                onClick={() => handleStatusFilterChange(statusFilter === '90D' ? 'ALL' : '90D')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-destructive">{bucketCounts?.['90D'] || 0}</div>
                  <div className="text-xs text-muted-foreground">90 dias sem venda</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === '120D' ? 'ring-2 ring-destructive' : 'hover:bg-muted/50'}`}
                onClick={() => handleStatusFilterChange(statusFilter === '120D' ? 'ALL' : '120D')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-destructive">{bucketCounts?.['120D'] || 0}</div>
                  <div className="text-xs text-muted-foreground">120 dias sem venda</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === 'NO_SALES' ? 'ring-2 ring-muted-foreground' : 'hover:bg-muted/50'}`}
                onClick={() => handleStatusFilterChange(statusFilter === 'NO_SALES' ? 'ALL' : 'NO_SALES')}
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-muted-foreground">{bucketCounts?.NO_SALES || 0}</div>
                  <div className="text-xs text-muted-foreground">Sem vendas</div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${statusFilter === 'OK' ? 'ring-2 ring-success' : 'hover:bg-muted/50'}`}
                onClick={() => handleStatusFilterChange(statusFilter === 'OK' ? 'ALL' : 'OK')}
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
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => handleStatusFilterChange(v as StatusBucket | 'ALL')}>
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
                  <SortableHeader 
                    column="status" 
                    label="Status ML" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                  />
                  <SortableHeader 
                    column="available_quantity" 
                    label="Estoque" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                  />
                  <SortableHeader 
                    column="last_sale_at" 
                    label="Última Venda" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                  />
                  <SortableHeader 
                    column="days_since_last_sale" 
                    label="Dias s/ Venda" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                  />
                  <SortableHeader 
                    column="avg_gap_hours" 
                    label="Média Gap" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                  />
                  <SortableHeader 
                    column="sales_count_30d" 
                    label="30d" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                  />
                  <SortableHeader 
                    column="sales_count_60d" 
                    label="60d" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                  />
                  <SortableHeader 
                    column="sales_count_90d" 
                    label="90d" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                  />
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
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : paginatedStats?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <AlertTriangle className="h-8 w-8" />
                        <p>Nenhum anúncio encontrado</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedStats?.map((item) => (
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
                      <TableCell className="text-center">
                        <MlStatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-center">
                        <StockBadge quantity={item.available_quantity} />
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
            
            {/* Pagination Controls */}
            {!statsLoading && totalItems > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="text-sm text-muted-foreground">
                  Mostrando {startItem}-{endItem} de {totalItems} anúncios
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <div className="text-sm font-medium px-2">
                    Página {currentPage} de {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
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
