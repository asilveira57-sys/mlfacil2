import { useMemo } from 'react';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PromotionSnapshot } from '@/hooks/usePromotions';
import type { EnrichedPromotionItem } from '@/hooks/useEnrichedPromotionItems';
import { PromotionItemCard } from './PromotionItemCard';

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
  onCreateTask,
}: PromotionDetailModalProps) {
  // Average discount
  const avgDiscount = useMemo(() => {
    const withDiscount = items.filter(i => i.discount_percent && i.discount_percent > 0);
    if (withDiscount.length === 0) return null;
    const sum = withDiscount.reduce((acc, i) => acc + (i.discount_percent || 0), 0);
    return Math.round(sum / withDiscount.length);
  }, [items]);

  if (!promotion) return null;

  return (
    <Dialog open={!!promotion} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-6xl w-[90vw] max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Compact Header */}
        <div className="px-6 pt-6 pb-4 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-primary" />
              {promotion.promotion_name || `Promoção ${promotion.promotion_id}`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Detalhes da promoção {promotion.promotion_name || promotion.promotion_id}
            </DialogDescription>
          </DialogHeader>

          {/* Info Row - Compact horizontal layout */}
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

          {/* Actions Row */}
          <div className="flex items-center gap-2 flex-wrap">
            {pendingItems.length > 0 && promotion.status === 'started' && (
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
          </div>
        </div>

        <Separator />

        {/* Items List */}
        <div className="flex-1 overflow-hidden px-6 py-4">
          <h4 className="font-medium mb-3 text-sm text-muted-foreground">
            Itens da Promoção ({items.length})
          </h4>

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
          ) : (
            <ScrollArea className="h-[calc(90vh-320px)]">
              <div className="space-y-2 pr-2">
                {items.map(item => (
                  <PromotionItemCard
                    key={item.id}
                    item={item}
                    promotionStatus={promotion.status}
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
