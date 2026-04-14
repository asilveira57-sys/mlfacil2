import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ShippingOrder, OrderItemSummary } from '@/hooks/useShippingLabels';
import { usePrintHistory } from '@/hooks/usePrintHistory';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Package, History, MapPin, Truck, CheckCircle, AlertCircle, Clock, Printer, FileDown, ExternalLink, ShoppingCart } from 'lucide-react';
import { getShipmentStatus, getInvoiceStatusFromSubstatus, getSeverityColors } from '@/lib/shippingStatusMap';
import { canReprintOrder, getReprintLayout } from '@/lib/shippingLabelRules';

interface OrderDetailsDrawerProps {
  order: ShippingOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReprint?: (shipmentId: string, format: 'pdf' | 'zpl') => void;
  isGenerating?: boolean;
  orderItems?: OrderItemSummary[];
}

export function OrderDetailsDrawer({ order, open, onOpenChange, onReprint, isGenerating, orderItems = [] }: OrderDetailsDrawerProps) {
  const { data: printHistory = [] } = usePrintHistory(
    order?.seller_id || null,
    order?.shipment_id || undefined
  );

  if (!order) return null;

  const canReprint = canReprintOrder(order, 'pdf') || canReprintOrder(order, 'zpl');
  const isFull = order.logistic_type === 'fulfillment';
  const pdfLayout = getReprintLayout(order, 'pdf');
  const pdfButtonLabel = pdfLayout === 'meli_100x150_no_nf'
    ? 'PDF Somente Etiquetas de envio'
    : 'PDF Padrão';
  const pdfButtonTitle = pdfLayout === 'meli_100x150_no_nf'
    ? 'Etiqueta com cabeçalho, sem DANFE'
    : 'PDF Padrão ML';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px] w-full max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Pedido #{order.order_id}
          </DialogTitle>
          <DialogDescription>
            {order.buyer_nickname && `Comprador: ${order.buyer_nickname}`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[calc(90vh-120px)] pr-4">
          <div className="space-y-6">
            {/* Reprint Actions */}
            {canReprint && onReprint && (
              <section className="bg-primary/5 rounded-lg p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Printer className="h-4 w-4" />
                  Reimprimir Etiqueta
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => onReprint(order.shipment_id!, 'pdf')}
                    disabled={isGenerating || isFull}
                    title={pdfButtonTitle}
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    {pdfButtonLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onReprint(order.shipment_id!, 'zpl')}
                    disabled={isGenerating || isFull}
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

            {/* Order Items */}
            {orderItems.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <ShoppingCart className="h-4 w-4" />
                  Itens do Pedido ({orderItems.length})
                </h3>
                <div className="space-y-2">
                  {orderItems.map((item, index) => (
                    <div
                      key={`${item.item_id}-${item.variation_id || index}`}
                      className="bg-muted/50 rounded-lg p-3"
                    >
                      <div className="flex items-start gap-3">
                        {/* Thumbnail */}
                        {item.thumbnail ? (
                          <a
                            href={
                              item.catalog_product_id
                                ? `https://www.mercadolivre.com.br/p/${item.catalog_product_id}`
                                : item.permalink
                                  ? item.permalink
                                  : `https://produto.mercadolivre.com.br/${item.item_id.replace(/^(MLB)(\d+)$/, '$1-$2')}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                          >
                            <img 
                              src={item.thumbnail} 
                              alt={item.title_short || item.title || item.item_id}
                              className="w-12 h-12 object-cover rounded-md border border-border hover:opacity-80 transition-opacity"
                            />
                          </a>
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded-md border border-border flex items-center justify-center shrink-0">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {item.quantity}x
                                </span>
                                <span className="text-sm truncate">
                                  {item.sku || item.title_short || item.title || item.item_id}
                                </span>
                              </div>
                              {(item.title_short || item.title) && item.sku && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {item.title_short || item.title}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-medium">
                                R$ {(item.unit_price * item.quantity).toFixed(2)}
                              </span>
                              <a
                                href={
                                  item.catalog_product_id
                                    ? `https://www.mercadolivre.com.br/p/${item.catalog_product_id}`
                                    : item.permalink
                                      ? item.permalink
                                      : `https://produto.mercadolivre.com.br/${item.item_id.replace(/^(MLB)(\d+)$/, '$1-$2')}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="Abrir anúncio no Mercado Livre"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          </div>
                          {item.sku && (
                            <p className="text-xs text-muted-foreground mt-1">
                              SKU: {item.sku}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Separator />

            {/* Shipment Info */}
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Truck className="h-4 w-4" />
                Dados do Envio
              </h3>
              {(() => {
                const shipmentInfo = getShipmentStatus(order.shipment_status);
                const shipmentColors = shipmentInfo.severity ? getSeverityColors(shipmentInfo.severity) : getSeverityColors('muted');
                const invoiceInfo = getInvoiceStatusFromSubstatus(order.shipment_substatus);
                const invoiceColors = invoiceInfo.severity ? getSeverityColors(invoiceInfo.severity) : getSeverityColors('muted');
                
                return (
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Shipment ID</span>
                      <span className="text-sm font-mono">{order.shipment_id || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Status do Envio</span>
                      <Badge 
                        variant="outline" 
                        className={shipmentColors.text}
                        title={shipmentInfo.description}
                      >
                        {shipmentInfo.label}
                      </Badge>
                    </div>
                    {order.shipment_substatus && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Situação Fiscal</span>
                        <Badge 
                          variant="outline"
                          className={invoiceColors.text}
                          title={invoiceInfo.description}
                        >
                          {invoiceInfo.label}
                        </Badge>
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
                );
              })()}
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
      </DialogContent>
    </Dialog>
  );
}
