import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Search, FileSearch, ArrowRight, CheckCircle2, XCircle, Package, Truck, Receipt, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface CostOrderDiagnosticProps {
  sellerId: string;
}

interface DiagnosticData {
  order: any;
  breakdown: any;
  movements: any[];
  shipmentCosts: any;
  billingInfo: any;
}

export function CostOrderDiagnostic({ sellerId }: CostOrderDiagnosticProps) {
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiagnosticData | null>(null);

  const searchOrder = async () => {
    if (!orderId.trim()) {
      toast.error('Digite o ID do pedido');
      return;
    }

    setLoading(true);
    setData(null);

    try {
      // Get order
      const { data: order } = await supabase
        .from('meli_orders_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('order_id', orderId.trim())
        .maybeSingle();

      if (!order) {
        toast.error('Pedido não encontrado');
        setLoading(false);
        return;
      }

      // Get breakdown
      const { data: breakdown } = await supabase
        .from('order_cost_breakdown_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('order_id', orderId.trim())
        .maybeSingle();

      // Get movements for this order
      const { data: movements } = await supabase
        .from('meli_financial_movements_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('order_id', orderId.trim());

      // Get shipment costs if has shipment_id
      let shipmentCosts = null;
      if (order.shipment_id) {
        const { data: sc } = await supabase
          .from('meli_shipment_costs_cache')
          .select('*')
          .eq('seller_id', sellerId)
          .eq('shipment_id', order.shipment_id)
          .maybeSingle();
        shipmentCosts = sc;
      }

      // Get billing info from financials cache
      const { data: billingInfo } = await supabase
        .from('meli_order_financials_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('order_id', orderId.trim())
        .maybeSingle();

      setData({
        order,
        breakdown,
        movements: movements || [],
        shipmentCosts,
        billingInfo,
      });

    } catch (error) {
      console.error('Error searching order:', error);
      toast.error('Erro ao buscar pedido');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Diagnóstico por Pedido
          </CardTitle>
          <CardDescription>
            Analise os dados de custo real de um pedido específico
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="ID do pedido (ex: 2000001234567890)"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchOrder()}
              className="max-w-md"
            />
            <Button onClick={searchOrder} disabled={loading}>
              <Search className="h-4 w-4 mr-2" />
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {data && (
        <>
          {/* Order Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Pedido #{data.order.order_id}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Data:</span>
                <p className="font-medium">{formatDate(data.order.created_at_meli)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Valor Total:</span>
                <p className="font-medium">{formatCurrency(data.order.total_amount)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Comprador:</span>
                <p className="font-medium">{data.order.buyer_nickname || data.order.buyer_name || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Shipment ID:</span>
                <p className="font-medium font-mono text-xs">{data.order.shipment_id || 'N/A'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Cost Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Breakdown de Custos
                {data.breakdown?.has_real_cost ? (
                  <Badge variant="default" className="ml-2 bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Com dados reais
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="ml-2">
                    <XCircle className="h-3 w-3 mr-1" />
                    Sem dados reais
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.breakdown ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <span className="text-muted-foreground">Tarifa ML</span>
                      <p className="font-bold text-lg">{formatCurrency(data.breakdown.fee_ml)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <span className="text-muted-foreground">Frete Seller</span>
                      <p className="font-bold text-lg">{formatCurrency(data.breakdown.shipping_cost_seller)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <span className="text-muted-foreground">Parcelamento</span>
                      <p className="font-bold text-lg">{formatCurrency(data.breakdown.installments_cost)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <span className="text-muted-foreground">Ajustes</span>
                      <p className="font-bold text-lg">{formatCurrency(data.breakdown.adjustments)}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg">
                    <span className="font-medium">Total Custo Marketplace:</span>
                    <span className="text-2xl font-bold">{formatCurrency(data.breakdown.total_marketplace_cost)}</span>
                  </div>

                  {data.breakdown.source_refs && Array.isArray(data.breakdown.source_refs) && data.breakdown.source_refs.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-muted-foreground mb-2">Referências de origem:</p>
                      <div className="flex flex-wrap gap-1">
                        {data.breakdown.source_refs.map((ref: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs font-mono">
                            {ref}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Sincronizado em: {formatDate(data.breakdown.real_cost_synced_at)}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Nenhum breakdown encontrado para este pedido</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipment Costs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Custos de Envio (API /shipments/costs)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.shipmentCosts ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Valor Bruto:</span>
                      <p className="font-medium">{formatCurrency(data.shipmentCosts.gross_amount)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Custo Seller:</span>
                      <p className="font-medium">{formatCurrency(data.shipmentCosts.sender_cost)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Compensação:</span>
                      <p className="font-medium">{formatCurrency(data.shipmentCosts.sender_compensation)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Custo Comprador:</span>
                      <p className="font-medium">{formatCurrency(data.shipmentCosts.receiver_cost)}</p>
                    </div>
                  </div>

                  {data.shipmentCosts.raw_json && (
                    <div className="mt-4">
                      <p className="text-sm text-muted-foreground mb-2">JSON Completo:</p>
                      <ScrollArea className="h-32 rounded border p-2 bg-muted/50">
                        <pre className="text-xs font-mono">
                          {JSON.stringify(data.shipmentCosts.raw_json, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    {data.order.shipment_id 
                      ? 'Custos de envio ainda não sincronizados' 
                      : 'Pedido sem shipment_id'}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial Movements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Movimentos Financeiros ({data.movements.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.movements.length > 0 ? (
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {data.movements.map((m, i) => (
                      <div key={i} className="flex items-center justify-between p-2 border rounded text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {m.concept}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {formatDate(m.movement_date)}
                          </span>
                        </div>
                        <span className={`font-medium ${m.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(m.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Nenhum movimento financeiro encontrado</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Billing Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Billing Info (Cache)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.billingInfo ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Receita Produtos:</span>
                    <p className="font-medium">{formatCurrency(data.billingInfo.revenue_products)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Receita Frete:</span>
                    <p className="font-medium">{formatCurrency(data.billingInfo.revenue_shipping)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tarifa Venda:</span>
                    <p className="font-medium">{formatCurrency(data.billingInfo.cost_sale_fee)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tarifa Frete:</span>
                    <p className="font-medium">{formatCurrency(data.billingInfo.cost_shipping_fee)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Parcelamento:</span>
                    <p className="font-medium">{formatCurrency(data.billingInfo.cost_installment_fee)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cancelamentos:</span>
                    <p className="font-medium">{formatCurrency(data.billingInfo.cost_cancellations)}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Billing info não sincronizado</span>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
