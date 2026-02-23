import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tag,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  PlayCircle,
  ClipboardPlus,
  Loader2,
  Search,
  ArrowUpDown,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PromotionSnapshot } from '@/hooks/usePromotions';
import type { EnrichedPromotionItem } from '@/hooks/useEnrichedPromotionItems';
import { PromotionItemCard } from './PromotionItemCard';

type SortOption = 'status' | 'discount_asc' | 'discount_desc' | 'price_asc' | 'price_desc' | 'net_asc' | 'net_desc';

interface PromotionDetailModalProps {
  promotion: PromotionSnapshot | null;
  onClose: () => void;
  items: EnrichedPromotionItem[];
  itemsLoading: boolean;
  pendingItems: EnrichedPromotionItem[];
  ineligibleItems: EnrichedPromotionItem[];
  startedItems: EnrichedPromotionItem[];
  actionLoading: boolean;
  creating: boolean;
  onAdhere: (item: EnrichedPromotionItem) => void;
  onRemove: (item: EnrichedPromotionItem) => void;
  onAdhereAll: () => void;
  onAdhereSelected: (items: EnrichedPromotionItem[]) => void;
  onRemoveSelected: (items: EnrichedPromotionItem[]) => void;
  onCreateTask: (taskType: 'ineligible' | 'expiring' | 'review' | 'custom') => void;
}

function PromotionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    started: { label: 'Ativa', icon: <TrendingUp className="h-3 w-3" />, className: 'bg-success/15 text-success border-success/30' },
    pending: { label: 'Pendente', icon: <Clock className="h-3 w-3" />, className: 'bg-warning/15 text-warning border-warning/30' },
    finished: { label: 'Finalizada', icon: <CheckCircle2 className="h-3 w-3" />, className: 'bg-muted text-muted-foreground' },
    cancelled: { label: 'Cancelada', icon: <XCircle className="h-3 w-3" />, className: 'bg-destructive/15 text-destructive border-destructive/30' },
  };

  const { label, icon, className } = config[status] || { label: status, icon: null, className: '' };

  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      {icon}
      {label}
    </Badge>
  );
}

export function PromotionDetailModal({
  promotion,
  onClose,
  items,
  itemsLoading,
  pendingItems,
  ineligibleItems,
  startedItems,
  actionLoading,
  creating,
  onAdhere,
  onRemove,
  onAdhereAll,
  onAdhereSelected,
  onRemoveSelected,
  onCreateTask,
}: PromotionDetailModalProps) {
  // ===== Filter, Sort, Selection State =====
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [coParticipationFilter, setCoParticipationFilter] = useState(false);
  const [maxDiscountFilter, setMaxDiscountFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('status');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset filters and selection when promotion changes
  useEffect(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setCoParticipationFilter(false);
    setMaxDiscountFilter('');
    setSortBy('status');
    setSelectedIds(new Set());
  }, [promotion?.promotion_id]);

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, statusFilter, coParticipationFilter, maxDiscountFilter]);

  // ===== Filtered & Sorted Items =====
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        (i.title?.toLowerCase().includes(q)) ||
        (i.sku?.toLowerCase().includes(q)) ||
        i.item_id.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(i => i.item_status === statusFilter);
    }

    // Co-participation filter
    if (coParticipationFilter) {
      result = result.filter(i => i.meliPercentage && i.meliPercentage > 0);
    }

    // Max discount filter
    const maxDisc = maxDiscountFilter ? parseFloat(maxDiscountFilter) : null;
    if (maxDisc !== null && !isNaN(maxDisc)) {
      result = result.filter(i => {
        const disc = i.computedDiscount ?? 0;
        return disc <= maxDisc;
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'discount_asc':
          return (a.computedDiscount ?? 0) - (b.computedDiscount ?? 0);
        case 'discount_desc':
          return (b.computedDiscount ?? 0) - (a.computedDiscount ?? 0);
        case 'price_asc':
          return (a.original_price ?? 0) - (b.original_price ?? 0);
        case 'price_desc':
          return (b.original_price ?? 0) - (a.original_price ?? 0);
        case 'net_asc':
          return (a.net_proceeds_amount ?? 0) - (b.net_proceeds_amount ?? 0);
        case 'net_desc':
          return (b.net_proceeds_amount ?? 0) - (a.net_proceeds_amount ?? 0);
        default: // status
          const order: Record<string, number> = { started: 0, candidate: 1, pending: 2, ineligible: 3, finished: 4 };
          return (order[a.item_status] ?? 5) - (order[b.item_status] ?? 5);
      }
    });

    return result;
  }, [items, searchQuery, statusFilter, coParticipationFilter, maxDiscountFilter, sortBy]);

  // ===== Selection Logic =====
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.item_id));
  const someFilteredSelected = filteredItems.some(i => selectedIds.has(i.item_id));

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.item_id)));
    }
  }, [allFilteredSelected, filteredItems]);

  const toggleSelect = useCallback((itemId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const selectedItems = useMemo(() => 
    filteredItems.filter(i => selectedIds.has(i.item_id)),
    [filteredItems, selectedIds]
  );

  const selectedCandidates = useMemo(() =>
    selectedItems.filter(i => i.item_status === 'candidate' || i.item_status === 'pending'),
    [selectedItems]
  );

  const selectedStarted = useMemo(() =>
    selectedItems.filter(i => i.item_status === 'started'),
    [selectedItems]
  );

  // ===== Average discount =====
  const avgDiscount = useMemo(() => {
    const withDiscount = items.filter(i => i.computedDiscount && i.computedDiscount > 0);
    if (withDiscount.length === 0) return null;
    const sum = withDiscount.reduce((acc, i) => acc + (i.computedDiscount || 0), 0);
    return Math.round(sum / withDiscount.length);
  }, [items]);

  const isExpired = promotion ? !!(promotion.end_at && new Date(promotion.end_at) <= new Date()) : false;

  if (!promotion) return null;

  return (
    <Dialog open={!!promotion} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-6xl w-[90vw] max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Compact Header */}
        <div className="px-6 pt-4 pb-2 space-y-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-primary" />
              {promotion.promotion_name || `Promoção ${promotion.promotion_id}`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Detalhes da promoção {promotion.promotion_name || promotion.promotion_id}
            </DialogDescription>
          </DialogHeader>

          {/* Info Row */}
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <PromotionStatusBadge status={promotion.status} />
            <Badge variant="outline">{promotion.promotion_type}</Badge>
            
            <Separator orientation="vertical" className="h-4" />

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {promotion.start_at 
                  ? format(new Date(promotion.start_at), 'dd/MM HH:mm', { locale: ptBR })
                  : '-'}
                {' → '}
                {promotion.end_at 
                  ? format(new Date(promotion.end_at), 'dd/MM HH:mm', { locale: ptBR })
                  : '-'}
              </span>
            </div>

            <Separator orientation="vertical" className="h-4" />

            {/* KPI Chips */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-medium">
                {startedItems.length} participando
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs font-medium">
                {pendingItems.length} candidatos
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                {ineligibleItems.length} inelegíveis
              </span>
              {avgDiscount !== null && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  ~{avgDiscount}% desc. médio
                </span>
              )}
            </div>
          </div>

          {/* Expired Alert */}
          {isExpired && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>Esta promoção já encerrou. Sincronize para atualizar os dados.</span>
            </div>
          )}

          {/* Actions Row */}
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 ? (
              <>
                {selectedCandidates.length > 0 && (promotion.status === 'started' || promotion.status === 'pending') && !isExpired && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onAdhereSelected(selectedCandidates)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5" />
                    )}
                    Aderir {selectedCandidates.length} Selecionados
                  </Button>
                )}
                {selectedStarted.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive border-destructive/30"
                    onClick={() => onRemoveSelected(selectedStarted)}
                    disabled={actionLoading}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover {selectedStarted.length} Selecionados
                  </Button>
                )}
                <span className="text-xs text-muted-foreground ml-1">
                  {selectedIds.size} selecionado(s)
                </span>
              </>
            ) : (
              <>
                {pendingItems.length > 0 && (promotion.status === 'started' || promotion.status === 'pending') && !isExpired && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={onAdhereAll}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5" />
                    )}
                    Aderir {pendingItems.length} Candidatos
                  </Button>
                )}
                {ineligibleItems.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive border-destructive/30"
                    onClick={() => onCreateTask('ineligible')}
                    disabled={creating}
                  >
                    <ClipboardPlus className="h-3.5 w-3.5" />
                    Corrigir Inelegíveis
                  </Button>
                )}
                {promotion.status === 'started' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => onCreateTask('expiring')}
                    disabled={creating}
                  >
                    <ClipboardPlus className="h-3.5 w-3.5" />
                    Planejar Renovação
                  </Button>
                )}
                {promotion.status === 'finished' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => onCreateTask('review')}
                    disabled={creating}
                  >
                    <ClipboardPlus className="h-3.5 w-3.5" />
                    Revisar Resultados
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Filter Toolbar */}
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap bg-muted/30">
          {/* Select All */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allFilteredSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Selecionar todos"
              className={someFilteredSelected && !allFilteredSelected ? 'data-[state=unchecked]:bg-primary/20' : ''}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {allFilteredSelected ? 'Desmarcar' : 'Selecionar'} todos
            </span>
          </div>

          <Separator orientation="vertical" className="h-5" />

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Título, SKU, MLB..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="started">Participando</SelectItem>
              <SelectItem value="candidate">Candidato</SelectItem>
              <SelectItem value="ineligible">Inelegível</SelectItem>
              <SelectItem value="finished">Finalizado</SelectItem>
            </SelectContent>
          </Select>

          {/* Discount max filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Desc. máx:</span>
            <Input
              type="number"
              placeholder="%"
              value={maxDiscountFilter}
              onChange={(e) => setMaxDiscountFilter(e.target.value)}
              className="w-[60px] h-8 text-xs"
              min={0}
              max={100}
            />
          </div>

          {/* Co-participation filter */}
          <Button
            variant={coParticipationFilter ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setCoParticipationFilter(!coParticipationFilter)}
          >
            <TrendingUp className="h-3 w-3 text-success" />
            Coparticipação ML
          </Button>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <ArrowUpDown className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="discount_asc">Desconto ↑</SelectItem>
              <SelectItem value="discount_desc">Desconto ↓</SelectItem>
              <SelectItem value="price_asc">Preço ↑</SelectItem>
              <SelectItem value="price_desc">Preço ↓</SelectItem>
              <SelectItem value="net_asc">Recebe ↑</SelectItem>
              <SelectItem value="net_desc">Recebe ↓</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground ml-auto">
            {filteredItems.length} de {items.length} itens
          </span>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-hidden px-6 py-3">
          {itemsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-[76px]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Nenhum item encontrado</p>
              <p className="text-sm mt-1">Sincronize para buscar os itens desta promoção.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Nenhum item corresponde aos filtros</p>
              <p className="text-sm mt-1">Ajuste os filtros para ver mais itens.</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(90vh-280px)]">
              <div className="space-y-2 pr-2">
                {filteredItems.map(item => (
                  <PromotionItemCard
                    key={item.id}
                    item={item}
                    promotionStatus={promotion.status}
                    selected={selectedIds.has(item.item_id)}
                    onToggleSelect={toggleSelect}
                    onAdhere={onAdhere}
                    onRemove={onRemove}
                    actionLoading={actionLoading}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
