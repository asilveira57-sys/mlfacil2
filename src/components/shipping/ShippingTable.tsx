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
 * Builds a compact item summary string from order items
 * Format: "2x SKU | 1x SKU | +N itens"
 */
function buildItemsSummary(items: OrderItemSummary[] | undefined): string {
  if (!items || items.length === 0) return '-';

  // Sort by quantity desc, then by sku/title
  const sorted = [...items].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    const labelA = a.sku || a.title_short || '';
    const labelB = b.sku || b.title_short || '';
    return labelA.localeCompare(labelB);
  });

  const MAX_DISPLAY = 2;
  const displayed = sorted.slice(0, MAX_DISPLAY);
  const remaining = sorted.length - MAX_DISPLAY;

  const parts = displayed.map(item => {
    const label = item.sku || item.title_short || item.title || item.item_id;
    // Truncate long labels
    const truncated = label.length > 15 ? label.substring(0, 15) + '…' : label;
    return `${item.quantity}x ${truncated}`;
  });

  if (remaining > 0) {
    parts.push(`+${remaining} ${remaining === 1 ? 'item' : 'itens'}`);
  }

  return parts.join(' | ');
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
    <div className="border rounded-lg">
      <Table>
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
            const itemsSummary = buildItemsSummary(items);
            
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
                    {order.order_id}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopy(order.order_id); }}
                      className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      title="Copiar número do pedido"
                    >
                      {copiedId === order.order_id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </span>
                </TableCell>
                <TableCell>
                  {order.buyer_nickname || '-'}
                </TableCell>
                <TableCell 
                  className="text-sm text-muted-foreground max-w-[200px] truncate"
                  title={itemsSummary}
                >
                  {itemsSummary}
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
                  <Badge 
                    variant={statusInfo.badgeVariant}
                    className={statusInfo.className}
                    title={statusInfo.description}
                  >
                    {statusInfo.label}
                  </Badge>
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
