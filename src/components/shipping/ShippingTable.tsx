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
import { Eye, Loader2 } from 'lucide-react';
import { ShippingOrder } from '@/hooks/useShippingLabels';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ShippingTableProps {
  orders: ShippingOrder[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onViewDetails: (order: ShippingOrder) => void;
  isLoading: boolean;
}

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  pronta: { label: 'Para Imprimir', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  aguardando_nf: { label: 'Aguardando NF', variant: 'secondary' },
  reimprimir: { label: 'Etiqueta Impressa', variant: 'outline', className: 'text-yellow-600 border-yellow-600' },
  full: { label: 'FULL', variant: 'outline', className: 'text-muted-foreground border-muted-foreground' },
  enviado: { label: 'Enviado', variant: 'outline', className: 'text-blue-600 border-blue-600' },
  outros: { label: 'Outro', variant: 'outline' },
};

export function ShippingTable({
  orders,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onViewDetails,
  isLoading,
}: ShippingTableProps) {
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
            <TableHead>Data</TableHead>
            <TableHead>Pedido</TableHead>
            <TableHead>Comprador</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const statusBadge = STATUS_BADGES[order.final_status || 'outros'];
            
            return (
              <TableRow key={order.id}>
                <TableCell>
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
                  {order.order_id}
                </TableCell>
                <TableCell>
                  {order.buyer_nickname || '-'}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={statusBadge?.variant || 'outline'}
                    className={statusBadge?.className}
                  >
                    {statusBadge?.label || order.final_status || '-'}
                  </Badge>
                </TableCell>
                <TableCell>
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
