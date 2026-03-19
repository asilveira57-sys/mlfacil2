import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TrialModuleGate } from "@/components/access/TrialModuleGate";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  RefreshCw,
  Download,
  MoreHorizontal,
  Eye,
  XCircle,
  Copy,
  AlertTriangle,
  Search,
  Filter,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { StatusBucketBadge, ActionDrawer } from "@/components/ad-timeline";
import {
  useAdTimelineStats,
  useAdTimelineBucketCounts,
  useRecalculateTimeline,
  useCreateAction,
  useEnrichTimelineItems,
} from "@/hooks/useAdTimeline";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useCurrentWorkspaceId } from "@/hooks/useCurrentWorkspaceId";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceCompanies } from "@/hooks/useWorkspaceCompanies";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { exportTimelineExcel, exportTimelinePdf } from "@/utils/exportTimeline";
import type { StatusBucket, ActionType, CloneChecklist, AdTimelineStats } from "@/types/ad-timeline";

const bucketLabels: Record<StatusBucket | 'ALL' | 'HAS_SALES', string> = {
  ALL: 'Todos',
  OK: 'OK',
  '30D': '30 dias',
  '60D': '60 dias',
  '90D': '90 dias',
  '120D': '120 dias',
  NO_SALES: 'Nunca vendeu',
  HAS_SALES: 'Já vendeu',
};

type SortColumn = 'last_sale_at' | 'days_since_last_sale' | 'avg_gap_hours' | 'sales_count_30d' | 'sales_count_60d' | 'sales_count_90d' | 'status' | 'available_quantity' | 'sold_quantity';
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
  const { toast } = useToast();
  const mlAccountId = sellerId || undefined;

  const [statusFilter, setStatusFilter] = useState<StatusBucket | 'ALL' | 'HAS_SALES'>('ALL');
  const [mlStatusFilter, setMlStatusFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState("");
  const [actionDrawerOpen, setActionDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AdTimelineStats | null>(null);
  const [actionType, setActionType] = useState<ActionType>('END');
  
  // Selection state for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
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
  const enrichMutation = useEnrichTimelineItems();
  const enrichTriggeredRef = useRef(false);
  const { createTask } = useTasks(workspaceId ?? null);

  // Background enrichment: fetch status/stock for items missing listing cache data
  useEffect(() => {
    if (!stats?.length || enrichTriggeredRef.current || enrichMutation.isPending) return;
    const missingIds = stats.filter(s => !s.status).map(s => s.item_id);
    if (missingIds.length > 0) {
      enrichTriggeredRef.current = true;
      const batch = missingIds.slice(0, 200);
      enrichMutation.mutate({ itemIds: batch, mlAccountId });
    }
  }, [stats, mlAccountId]);

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

    // Create a task automatically
    const actionLabel = actionType === 'END' ? 'Encerrar' : 'Clonar';
    const itemTitle = selectedItem.title || selectedItem.item_id;
    try {
      await createTask({
        title: `[${actionLabel}] ${itemTitle}`.substring(0, 200),
        description: `${reason || 'Sem motivo informado'}\n\nItem: ${selectedItem.item_id}`,
        status: 'todo',
        priority: 'medium',
        tags: ['linha-do-tempo'],
      });
    } catch (e) {
      console.error('[AdTimelineRadar] Task creation failed:', e);
    }
    
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
    setCurrentPage(1);
  };

  const toggleSelectItem = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const getCompanyLogo = async (): Promise<string | null> => {
    try {
      const { data } = await supabase
        .from('companies')
        .select('logo_url')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      return (data as any)?.logo_url || null;
    } catch {
      return null;
    }
  };

  const handleExportExcel = () => {
    const dataToExport = filteredData || [];
    if (!dataToExport.length) {
      toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
      return;
    }
    exportTimelineExcel({ data: dataToExport });
    toast({ title: 'Excel exportado com sucesso' });
  };

  const handleExportPdf = async () => {
    const dataToExport = filteredData || [];
    if (!dataToExport.length) {
      toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
      return;
    }
    const logoUrl = await getCompanyLogo();
    await exportTimelinePdf({ data: dataToExport, logoUrl });
    toast({ title: 'PDF exportado com sucesso' });
  };

  // Filter, sort and paginate data
  const { paginatedStats, totalPages, totalItems, filteredData } = useMemo(() => {
    let filtered = stats?.filter(s => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = s.item_id.toLowerCase().includes(term) ||
          s.title?.toLowerCase().includes(term) ||
          s.sku?.toLowerCase().includes(term);
        if (!matches) return false;
      }
      
      // ML status filter
      if (mlStatusFilter !== 'all' && s.status !== mlStatusFilter) return false;
      
      // Stock filter
      if (stockFilter === 'out_of_stock' && (s.available_quantity === undefined || s.available_quantity === null || s.available_quantity > 0)) return false;
      if (stockFilter === 'in_stock' && (s.available_quantity === undefined || s.available_quantity === null || s.available_quantity === 0)) return false;

      // Status bucket filter (client-side)
      if (statusFilter === 'HAS_SALES' && s.status_bucket === 'NO_SALES') return false;
      if (statusFilter !== 'ALL' && statusFilter !== 'HAS_SALES' && s.status_bucket !== statusFilter) return false;
      
      return true;
    }) || [];
    
    // Sort
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = (a as any)[sortColumn];
        let bVal: any = (b as any)[sortColumn];
        
        if (aVal === null || aVal === undefined) aVal = sortDirection === 'asc' ? Infinity : -Infinity;
        if (bVal === null || bVal === undefined) bVal = sortDirection === 'asc' ? Infinity : -Infinity;
        
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
    
    return { paginatedStats, totalPages, totalItems, filteredData: filtered };
  }, [stats, searchTerm, mlStatusFilter, stockFilter, statusFilter, sortColumn, sortDirection, currentPage]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const allPageIds = paginatedStats?.map(s => s.id) || [];
      const allSelected = allPageIds.length > 0 && allPageIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        allPageIds.forEach(id => next.delete(id));
      } else {
        allPageIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [paginatedStats]);

  const handleBatchAction = (type: ActionType) => {
    if (selectedIds.size === 0) return;
    const items = (filteredData || []).filter(s => selectedIds.has(s.id));
    if (items.length === 0) return;
    
    const actionLabel = type === 'END' ? 'Encerrar' : 'Clonar';
    Promise.all(
      items.map(item =>
        createTask({
          title: `[${actionLabel}] ${(item.title || item.item_id).substring(0, 180)}`,
          description: `Ação em lote via Linha do Tempo\n\nItem: ${item.item_id}`,
          status: 'todo',
          priority: 'medium',
          tags: ['linha-do-tempo'],
        }).catch(e => console.error('[Batch] Task creation failed:', e))
      )
    ).then(() => {
      toast({ title: `${items.length} tarefas de "${actionLabel}" criadas com sucesso` });
      setSelectedIds(new Set());
    });
  };

  const allPageSelected = (paginatedStats?.length || 0) > 0 && paginatedStats?.every(s => selectedIds.has(s.id));

  // Reset page when filter changes
  const handleStatusFilterChange = (value: StatusBucket | 'ALL' | 'HAS_SALES') => {
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
      <TrialModuleGate
        feature="Histórico completo da Linha do Tempo"
        message="Durante o período de teste, a Linha do Tempo utiliza apenas 30 dias de histórico. Ative seu plano para acessar o histórico completo de 1 ano."
        soft
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
                  <div className="text-xs text-muted-foreground">Nunca vendeu</div>
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
                placeholder="Buscar por ID, título ou SKU..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => handleStatusFilterChange(v as StatusBucket | 'ALL' | 'HAS_SALES')}>
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
            <Select value={mlStatusFilter} onValueChange={(v) => { setMlStatusFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status ML" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status ML: Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="paused">Pausado</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={(v) => { setStockFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Estoque" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Estoque: Todos</SelectItem>
                <SelectItem value="in_stock">Com estoque</SelectItem>
                <SelectItem value="out_of_stock">Sem estoque</SelectItem>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Batch Action Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
            <Button size="sm" variant="outline" onClick={() => handleBatchAction('END')}>
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Encerrar em lote
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBatchAction('CLONE')}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              Clonar em lote
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs">
              Limpar seleção
            </Button>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36px] px-2">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead className="w-[56px] px-1">Img</TableHead>
                  <TableHead className="min-w-[160px]">Anúncio</TableHead>
                  <TableHead className="w-[70px] px-1">Status</TableHead>
                  <SortableHeader 
                    column="status" 
                    label="ML" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                    className="w-[65px] px-1"
                  />
                  <SortableHeader 
                    column="available_quantity" 
                    label="Est." 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                    className="w-[60px] px-1"
                  />
                  <SortableHeader 
                    column="last_sale_at" 
                    label="Últ. Venda" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                    className="w-[80px] px-1"
                  />
                  <SortableHeader 
                    column="days_since_last_sale" 
                    label="Dias" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                    className="w-[50px] px-1"
                  />
                  <SortableHeader 
                    column="avg_gap_hours" 
                    label="Gap" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                    className="w-[50px] px-1"
                  />
                  <SortableHeader 
                    column="sales_count_30d" 
                    label="30d" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                    className="w-[40px] px-1"
                  />
                  <SortableHeader 
                    column="sales_count_60d" 
                    label="60d" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                    className="w-[40px] px-1"
                  />
                  <SortableHeader 
                    column="sales_count_90d" 
                    label="90d" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                    className="w-[40px] px-1"
                  />
                  <SortableHeader 
                    column="sold_quantity" 
                    label="Total" 
                    currentSort={sortColumn} 
                    currentDirection={sortDirection} 
                    onSort={handleSort}
                    className="w-[45px] px-1"
                  />
                  <TableHead className="w-[40px] px-1"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-2"><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-10 w-10 rounded" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-5 w-14" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                      <TableCell className="px-1"><Skeleton className="h-6 w-6" /></TableCell>
                    </TableRow>
                  ))
                ) : paginatedStats?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <AlertTriangle className="h-8 w-8" />
                        <p>Nenhum anúncio encontrado</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedStats?.map((item) => (
                    <TableRow key={item.id} className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(item.id) ? 'bg-primary/5' : ''}`}>
                      <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleSelectItem(item.id)}
                        />
                      </TableCell>
                      <TableCell className="px-1">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="h-10 w-10 object-cover rounded" />
                        ) : (
                          <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm truncate max-w-[200px] hover:underline"
                          onClick={() => navigate(`/anuncios/linha-do-tempo/${item.item_id}`)}>
                          {item.title || item.item_id}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {item.item_id}{item.sku ? ` • ${item.sku}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="px-1">
                        <StatusBucketBadge bucket={item.status_bucket as StatusBucket} />
                      </TableCell>
                      <TableCell className="text-center px-1">
                        <MlStatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-center px-1">
                        <StockBadge quantity={item.available_quantity} />
                      </TableCell>
                      <TableCell className="text-center text-xs px-1">
                        {item.last_sale_at ? format(new Date(item.last_sale_at), "dd/MM/yy", { locale: ptBR }) : "—"}
                      </TableCell>
                      <TableCell className="text-center px-1">
                        <span className={`text-sm font-medium ${(item.days_since_last_sale || 0) > 60 ? 'text-destructive' : (item.days_since_last_sale || 0) > 30 ? 'text-warning' : 'text-foreground'}`}>
                          {item.days_since_last_sale ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs px-1">{formatGap(item.avg_gap_hours)}</TableCell>
                      <TableCell className="text-center text-xs px-1">{item.sales_count_30d}</TableCell>
                      <TableCell className="text-center text-xs px-1">{item.sales_count_60d}</TableCell>
                      <TableCell className="text-center text-xs px-1">{item.sales_count_90d}</TableCell>
                      <TableCell className="text-center text-xs font-medium px-1">{item.sold_quantity ?? '—'}</TableCell>
                      <TableCell className="px-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/anuncios/linha-do-tempo/${item.item_id}`)}>
                              <Eye className="h-4 w-4 mr-2" />Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCreateAction(item, 'END')}>
                              <XCircle className="h-4 w-4 mr-2" />Encerrar
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
      </TrialModuleGate>
    </PageContainer>
  );
}
