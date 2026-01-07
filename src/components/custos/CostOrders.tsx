import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, AlertCircle, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, DollarSign, Save } from 'lucide-react';
import { toast } from 'sonner';

interface CostOrdersProps {
  sellerId: string;
}

interface OrderCost {
  id: string;
  order_id: string;
  shipment_id: string | null;
  revenue_total: number;
  cost_total: number;
  cost_fees: number;
  cost_shipping: number;
  cost_other: number;
  profit_total: number;
  margin_percent: number;
  missing_cost_items_count: number;
  status: string;
  buyer_nickname: string | null;
  buyer_name: string | null;
  created_at_meli: string | null;
}

interface OrderDetail {
  order: any;
  items: any[];
  breakdown: any;
  billing: any;
  missing_costs: number;
}

export function CostOrders({ sellerId }: CostOrdersProps) {
  const [orders, setOrders] = useState<OrderCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [periodDays, setPeriodDays] = useState('30');
  const [statusFilter, setStatusFilter] = useState('all');
  const [profitFilter, setProfitFilter] = useState('all');
  const [ecommerceFilter, setEcommerceFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [goToPageInput, setGoToPageInput] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Edit e-commerce cost state
  const [editingCostOther, setEditingCostOther] = useState<number>(0);
  const [editingNotes, setEditingNotes] = useState<string>('');
  const [savingExtra, setSavingExtra] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({
        seller_id: sellerId,
        period_days: periodDays,
        search,
        page: String(page),
        page_size: '50',
      });

      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (profitFilter !== 'all') params.set('profit_type', profitFilter);
      if (ecommerceFilter !== 'all') params.set('ecommerce_cost', ecommerceFilter);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/orders?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
        setTotalPages(data.total_pages || 1);
        setTotalOrders(data.total || 0);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Erro ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sellerId) {
      loadOrders();
    }
  }, [sellerId, periodDays, statusFilter, profitFilter, ecommerceFilter, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sellerId) {
        setPage(1);
        loadOrders();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadOrderDetail = async (orderId: string) => {
    setLoadingDetail(true);
    setDetailOpen(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/orders/detail?seller_id=${sellerId}&order_id=${orderId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Also fetch billing data for this order
        const { data: billing } = await supabase
          .from('meli_order_financials_cache')
          .select('*')
          .eq('seller_id', sellerId)
          .eq('order_id', orderId)
          .maybeSingle();

        const orderData = { ...data, billing };
        setSelectedOrder(orderData);
        setEditingCostOther(data.breakdown?.cost_other || 0);
        setEditingNotes(data.breakdown?.notes || '');
      }
    } catch (error) {
      console.error('Error loading order detail:', error);
      toast.error('Erro ao carregar detalhes');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSaveExtra = async () => {
    if (!selectedOrder) return;
    
    setSavingExtra(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/orders/update-extra`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seller_id: sellerId,
            order_id: selectedOrder.order?.order_id,
            cost_other: editingCostOther,
            notes: editingNotes,
          }),
        }
      );

      if (response.ok) {
        toast.success('Custo e-commerce salvo com sucesso');
        // Reload detail
        await loadOrderDetail(selectedOrder.order?.order_id);
        // Reload list
        loadOrders();
      } else {
        toast.error('Erro ao salvar');
      }
    } catch (error) {
      toast.error('Erro ao salvar custo e-commerce');
    } finally {
      setSavingExtra(false);
    }
  };

  const handleGoToPage = () => {
    const pageNum = parseInt(goToPageInput);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setPage(pageNum);
      setGoToPageInput('');
    } else {
      toast.error(`Página inválida. Digite um número entre 1 e ${totalPages}`);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  // Check if order has real billing data
  const hasRealData = (order: OrderCost) => {
    return (order.cost_fees > 0 || order.cost_shipping > 0);
  };

  // Check if order has e-commerce cost
  const hasEcommerceCost = (order: OrderCost) => {
    return (order.cost_other || 0) > 0;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Custo por Pedido</span>
            {totalOrders > 0 && (
              <Badge variant="secondary">{totalOrders.toLocaleString()} pedidos</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por pedido, envio ou comprador..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={periodDays} onValueChange={(v) => { setPeriodDays(v); setPage(1); }}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="15">15 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
                <SelectItem value="180">6 meses</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ok">Completo</SelectItem>
                <SelectItem value="incompleto">Incompleto</SelectItem>
              </SelectContent>
            </Select>

            <Select value={profitFilter} onValueChange={(v) => { setProfitFilter(v); setPage(1); }}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Lucro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="lucro">Lucro</SelectItem>
                <SelectItem value="prejuizo">Prejuízo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={ecommerceFilter} onValueChange={(v) => { setEcommerceFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Custo E-commerce" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="with">Com custo e-commerce</SelectItem>
                <SelectItem value="without">Sem custo e-commerce</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={loadOrders} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Comprador</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Lucro</TableHead>
                      <TableHead className="text-right">Margem</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Nenhum pedido encontrado. Clique em "Recalcular" para processar.
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((order) => (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => loadOrderDetail(order.order_id)}
                        >
                          <TableCell>{formatDate(order.created_at_meli)}</TableCell>
                          <TableCell>
                            <div className="font-mono text-xs">{order.order_id}</div>
                            {order.shipment_id && (
                              <div className="text-xs text-muted-foreground">{order.shipment_id}</div>
                            )}
                          </TableCell>
                          <TableCell>{order.buyer_nickname || order.buyer_name || '-'}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(order.revenue_total)}
                          </TableCell>
                          <TableCell className="text-right text-destructive">
                            {formatCurrency(order.cost_total)}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${order.profit_total >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                            <span className="flex items-center justify-end gap-1">
                              {order.profit_total >= 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {formatCurrency(order.profit_total)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {order.margin_percent.toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {order.status === 'ok' ? (
                                <Badge variant="outline" className="text-green-600 border-green-600">OK</Badge>
                              ) : (
                                <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                  <AlertCircle className="h-3 w-3" />
                                  {order.missing_cost_items_count} s/ custo
                                </Badge>
                              )}
                              {hasRealData(order) && (
                                <span title="Dados reais do ML">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                </span>
                              )}
                              {hasEcommerceCost(order) && (
                                <span title="Com custo e-commerce">
                                  <DollarSign className="h-3.5 w-3.5 text-blue-600" />
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
                      Primeira
                    </Button>
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      Anterior
                    </Button>
                    <span className="py-2 px-4 text-sm">
                      Página {page} de {totalPages}
                    </span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      Próxima
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
                      Última
                    </Button>
                  </div>
                  
                  {/* Go to page */}
                  <div className="flex items-center gap-2">
                    <Label htmlFor="goToPage" className="text-sm text-muted-foreground">Ir para:</Label>
                    <Input
                      id="goToPage"
                      type="number"
                      min="1"
                      max={totalPages}
                      value={goToPageInput}
                      onChange={(e) => setGoToPageInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGoToPage()}
                      placeholder={String(page)}
                      className="w-20 h-8"
                    />
                    <Button variant="outline" size="sm" onClick={handleGoToPage}>
                      Ir
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detalhes do Pedido
              {selectedOrder?.billing && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Dados Reais
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {loadingDetail ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : selectedOrder ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Pedido:</span>
                  <span className="ml-2 font-mono">{selectedOrder.order?.order_id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Comprador:</span>
                  <span className="ml-2">{selectedOrder.order?.buyer_nickname || selectedOrder.order?.buyer_name}</span>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Itens do Pedido</h4>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-right">Custo Unit.</TableHead>
                        <TableHead className="text-right">Custo Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items?.map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <div className="truncate max-w-[200px]" title={item.title}>
                              {item.title_short || item.title || item.item_id}
                            </div>
                            {!item.has_cost && (
                              <Badge variant="destructive" className="text-xs mt-1">Sem custo</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                          <TableCell className="text-right">
                            {item.has_cost ? formatCurrency(item.cost_unit) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.has_cost ? formatCurrency(item.cost_total) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {selectedOrder.breakdown && (
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-3">Resumo Financeiro</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Receita Produtos:</div>
                    <div className="text-right font-medium">{formatCurrency(selectedOrder.order?.total_amount || 0)}</div>

                    {selectedOrder.billing?.revenue_shipping > 0 && (
                      <>
                        <div className="flex items-center gap-1">
                          (+) Receita Frete:
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        </div>
                        <div className="text-right text-green-600">{formatCurrency(selectedOrder.billing.revenue_shipping)}</div>
                      </>
                    )}

                    <div className="border-t pt-2 font-medium">Receita Total:</div>
                    <div className="text-right border-t pt-2 font-medium">{formatCurrency(selectedOrder.breakdown.revenue_total)}</div>

                    <div>(-) Custo dos Itens:</div>
                    <div className="text-right">{formatCurrency(selectedOrder.breakdown.cost_items_total)}</div>

                    <div>(-) Embalagem:</div>
                    <div className="text-right">{formatCurrency(selectedOrder.breakdown.cost_packaging)}</div>

                    {selectedOrder.billing ? (
                      <>
                        <div className="flex items-center gap-1">
                          (-) Tarifa de Venda:
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        </div>
                        <div className="text-right">{formatCurrency(selectedOrder.billing.cost_sale_fee || 0)}</div>

                        {selectedOrder.billing.cost_installment_fee > 0 && (
                          <>
                            <div className="flex items-center gap-1">
                              (-) Tarifa Parcelamento:
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            </div>
                            <div className="text-right">{formatCurrency(selectedOrder.billing.cost_installment_fee)}</div>
                          </>
                        )}

                        {selectedOrder.billing.cost_shipping_fee > 0 && (
                          <>
                            <div className="flex items-center gap-1">
                              (-) Tarifa Frete:
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            </div>
                            <div className="text-right">{formatCurrency(selectedOrder.billing.cost_shipping_fee)}</div>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <div>(-) Taxas ML (estimado):</div>
                        <div className="text-right text-muted-foreground">{formatCurrency(selectedOrder.breakdown.cost_fees)}</div>
                      </>
                    )}

                    <div className="border-t pt-2 font-medium">Custo Total:</div>
                    <div className="text-right border-t pt-2 font-medium text-destructive">
                      {formatCurrency(selectedOrder.breakdown.cost_total)}
                    </div>

                    <div className="border-t pt-2 font-medium">Lucro:</div>
                    <div className={`text-right border-t pt-2 font-medium ${selectedOrder.breakdown.profit_total >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {formatCurrency(selectedOrder.breakdown.profit_total)}
                    </div>

                    <div>Margem:</div>
                    <div className="text-right">{selectedOrder.breakdown.margin_percent?.toFixed(1)}%</div>
                  </div>
                </div>
              )}

              {/* E-commerce cost editor */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Custo E-commerce (Outros Custos)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="costOther">Custo adicional (R$)</Label>
                    <Input
                      id="costOther"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingCostOther}
                      onChange={(e) => setEditingCostOther(parseFloat(e.target.value) || 0)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Observações</Label>
                    <Input
                      id="notes"
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      placeholder="Ex: Taxa de anúncio, desconto..."
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button onClick={handleSaveExtra} disabled={savingExtra} size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  {savingExtra ? 'Salvando...' : 'Salvar Custo'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
