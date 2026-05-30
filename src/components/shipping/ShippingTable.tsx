import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Package, Clock, Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ShippingOrder, SortField, SortDirection, OrderItemSummary } from '@/hooks/useShippingLabels';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { getFinalStatus } from '@/lib/shippingStatusMap';

interface ShippingTableProps {
  orders: ShippingOrder[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onViewDetails: (order: ShippingOrder) => void;
  isLoading: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  onToggleSort: (field: SortField) => void;
  orderItems: Map<string, OrderItemSummary[]>;
}

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  pronta: { label: 'Para Imprimir', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  aguardando_nf: { label: 'Aguardando NF', variant: 'secondary' },
  reimprimir: { label: 'Etiqueta Impressa', variant: 'outline', className: 'text-yellow-600 border-yellow-600' },
  full: { label: 'FULL', variant: 'outline', className: 'text-muted-foreground border-muted-foreground' },
  enviado: { label: 'Enviado', variant: 'outline', className: 'text-blue-600 border-blue-600' },
  outros: { label: 'Outro', variant: 'outline' },
};

function SortIcon({ field, currentField, direction }: { field: SortField; currentField: SortField; direction: SortDirection }) {
  if (field !== currentField) {
    return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
  }
  return direction === 'asc' 
    ? <ArrowUp className="ml-1 h-3 w-3" />
    : <ArrowDown className="ml-1 h-3 w-3" />;
}

/**
 * Renders a compact item summary with thumbnail, like Mercado Livre
 */
function ItemsSummaryCell({ items }: { items: OrderItemSummary[] | undefined }) {
  if (!items || items.length === 0) {
    return <span className="text-muted-foreground/50">-</span>;
  }

  const sorted = [...items].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return (a.sku || a.title_short || '').localeCompare(b.sku || b.title_short || '');
  });

  const MAX_DISPLAY = 2;
  const displayed = sorted.slice(0, MAX_DISPLAY);
  const remaining = sorted.length - MAX_DISPLAY;

  return (
    <div className="flex flex-col gap-1.5">
      {displayed.map((item, idx) => {
        const label = item.title_short || item.title || item.sku || item.item_id;
        const truncated = label.length > 30 ? label.substring(0, 30) + '…' : label;
        const skuLabel = item.sku ? `SKU: ${item.sku}` : null;

        return (
          <div key={idx} className="flex items-center gap-2 min-w-0">
            {item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt=""
                className="h-8 w-8 rounded border border-border object-contain bg-background flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="h-8 w-8 rounded border border-border bg-muted flex items-center justify-center flex-shrink-0">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex flex-col">
              <span className="text-sm text-foreground truncate" title={item.title || label}>
                {item.quantity > 1 && <span className="font-medium">{item.quantity}x </span>}
                {truncated}
              </span>
              {skuLabel && (
                <span className="text-xs text-muted-foreground truncate">{skuLabel}</span>
              )}
            </div>
          </div>
        );
      })}
      {remaining > 0 && (
        <span className="text-xs text-muted-foreground ml-10">
          +{remaining} {remaining === 1 ? 'item' : 'itens'}
        </span>
      )}
    </div>
  );
}

export function ShippingTable({
  orders,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onViewDetails,
  isLoading,
  sortField,
  sortDirection,
  onToggleSort,
  orderItems,
}: ShippingTableProps) {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = useCallback((orderId: string) => {
    navigator.clipboard.writeText(orderId);
    setCopiedId(orderId);
    toast({ title: 'Pedido copiado', description: orderId });
    setTimeout(() => setCopiedId(null), 1500);
  }, [toast]);

  const selectableOrders = orders.filter(o => o.selectable);
  const allSelected = selectableOrders.length > 0 && 
    selectableOrders.every(o => selectedIds.has(o.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Nenhum pedido encontrado para o período selecionado.</p>
        <p className="text-sm mt-2">Tente sincronizar ou alterar os filtros.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-auto max-h-[calc(100vh-240px)]">
      <Table className="[&_th]:px-2 [&_th]:py-1.5 [&_td]:px-2 [&_td]:py-1">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => {
                  if (allSelected) {
                    selectableOrders.forEach(o => onToggleSelection(o.id));
                  } else {
                    onSelectAll();
                  }
                }}
                disabled={selectableOrders.length === 0}
              />
            </TableHead>
            <TableHead>
              <button
                onClick={() => onToggleSort('created_at_meli')}
                className="flex items-center hover:text-foreground transition-colors"
              >
                Data
                <SortIcon field="created_at_meli" currentField={sortField} direction={sortDirection} />
              </button>
            </TableHead>
            <TableHead>Pedido</TableHead>
            <TableHead>
              <button
                onClick={() => onToggleSort('buyer_nickname')}
                className="flex items-center hover:text-foreground transition-colors"
              >
                Comprador
                <SortIcon field="buyer_nickname" currentField={sortField} direction={sortDirection} />
              </button>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5" />
                Itens
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Prazo
              </div>
            </TableHead>
            <TableHead>
              <button
                onClick={() => onToggleSort('final_status')}
                className="flex items-center hover:text-foreground transition-colors"
              >
                Status
                <SortIcon field="final_status" currentField={sortField} direction={sortDirection} />
              </button>
            </TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const statusInfo = getFinalStatus(order.final_status);
            const items = orderItems.get(order.order_id);
            
            return (
              <TableRow 
                key={order.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onViewDetails(order)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(order.id)}
                    onCheckedChange={() => onToggleSelection(order.id)}
                    disabled={!order.selectable}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {order.created_at_meli 
                    ? format(new Date(order.created_at_meli), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                    : '-'
                  }
                </TableCell>
                <TableCell className="font-mono text-sm">
                  <span className="inline-flex items-center gap-1">
                    {(order as any).pack_id || order.order_id}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopy((order as any).pack_id || order.order_id); }}
                      className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      title="Copiar número do pedido"
                    >
                      {copiedId === ((order as any).pack_id || order.order_id) ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </span>
                </TableCell>
                <TableCell>
                  {order.buyer_nickname || '-'}
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <ItemsSummaryCell items={items} />
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {order.estimated_handling_limit ? (
                    <span className="text-muted-foreground">
                      {format(toZonedTime(new Date(order.estimated_handling_limit), 'America/Sao_Paulo'), 'dd/MM HH:mm', { locale: ptBR })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge 
                      variant={statusInfo.badgeVariant}
                      className={statusInfo.className}
                      title={statusInfo.description}
                    >
                      {statusInfo.label}
                    </Badge>
                    {order.logistic_type === 'self_service' && (
                      <Badge variant="outline" className="text-amber-600 border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-[10px] px-1.5 py-0">
                        Flex
                      </Badge>
                    )}
                    {order.logistic_type && order.logistic_type !== 'self_service' && order.logistic_type !== 'fulfillment' && (
                      <Badge variant="outline" className="text-blue-600 border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-[10px] px-1.5 py-0">
                        Coleta
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onViewDetails(order)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
