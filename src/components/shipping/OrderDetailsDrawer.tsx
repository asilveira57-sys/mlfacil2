import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ShippingOrder } from '@/hooks/useShippingLabels';
import { usePrintHistory } from '@/hooks/usePrintHistory';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Package, FileText, History, MapPin, Truck, CheckCircle, AlertCircle, Clock, Printer, FileDown } from 'lucide-react';

interface OrderDetailsDrawerProps {
  order: ShippingOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReprint?: (shipmentId: string, format: 'pdf' | 'zpl') => void;
  isGenerating?: boolean;
}

export function OrderDetailsDrawer({ order, open, onOpenChange, onReprint, isGenerating }: OrderDetailsDrawerProps) {
  const { data: printHistory = [] } = usePrintHistory(
    order?.seller_id || null,
    order?.shipment_id || undefined
  );

  if (!order) return null;

  const canReprint = order.label_available && order.invoice_status === 'emitida' && order.shipment_id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Pedido #{order.order_id}
          </SheetTitle>
          <SheetDescription>
            {order.buyer_nickname && `Comprador: ${order.buyer_nickname}`}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
          <div className="space-y-6">
            {/* Reprint Actions */}
            {canReprint && onReprint && (
              <section className="bg-primary/5 rounded-lg p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Printer className="h-4 w-4" />
                  Reimprimir Etiqueta
                </h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => onReprint(order.shipment_id!, 'pdf')}
                    disabled={isGenerating}
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onReprint(order.shipment_id!, 'zpl')}
                    disabled={isGenerating}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    ZPL
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  A etiqueta será gerada novamente diretamente do Mercado Livre.
                </p>
              </section>
            )}

            {/* Shipment Info */}
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Truck className="h-4 w-4" />
                Dados do Envio
              </h3>
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Shipment ID</span>
                  <span className="text-sm font-mono">{order.shipment_id || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant="outline">{order.shipment_status || '-'}</Badge>
                </div>
                {order.shipment_substatus && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Substatus</span>
                    <span className="text-sm">{order.shipment_substatus}</span>
                  </div>
                )}
                {order.tracking_number && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Rastreio</span>
                    <span className="text-sm font-mono">{order.tracking_number}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Etiqueta disponível</span>
                  {order.label_available ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                {order.receiver_name && (
                  <div className="pt-2 border-t">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{order.receiver_name}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Invoice Info */}
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4" />
                Nota Fiscal
              </h3>
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge 
                    variant={order.invoice_status === 'emitida' ? 'default' : 'secondary'}
                  >
                    {order.invoice_status === 'emitida' && 'Emitida'}
                    {order.invoice_status === 'pendente' && 'Pendente'}
                    {order.invoice_status === 'nao_localizada' && 'Não localizada'}
                    {order.invoice_status === 'erro' && 'Erro'}
                    {!order.invoice_status && '-'}
                  </Badge>
                </div>
                {order.invoice_number && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Número</span>
                    <span className="text-sm font-mono">{order.invoice_number}</span>
                  </div>
                )}
                {order.invoice_key && (
                  <div>
                    <span className="text-sm text-muted-foreground block mb-1">Chave de Acesso</span>
                    <code className="text-xs bg-background p-2 rounded block break-all">
                      {order.invoice_key}
                    </code>
                  </div>
                )}
                {order.issued_at && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Data de emissão</span>
                    <span className="text-sm">
                      {format(new Date(order.issued_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Print History */}
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <History className="h-4 w-4" />
                Histórico de Impressões
              </h3>
              <p className="text-xs text-muted-foreground mb-2">
                Mostra apenas impressões feitas por este sistema.
              </p>
              {printHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma impressão registrada para este envio.
                </p>
              ) : (
                <div className="space-y-2">
                  {printHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-muted/50 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm">
                            {entry.format.toUpperCase()} - {entry.total_labels} etiqueta(s)
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <Badge variant={entry.status === 'gerada' ? 'default' : 'destructive'}>
                        {entry.status === 'gerada' ? 'Gerada' : 'Erro'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
