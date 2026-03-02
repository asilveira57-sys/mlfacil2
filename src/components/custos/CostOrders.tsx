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
import { Search, AlertCircle, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, DollarSign, Save, ArrowUpDown, ArrowUp, ArrowDown, Package, RotateCw, Square, CheckSquare, Loader2, Copy, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getCostCache, setCostCache, checkSellerChange } from '@/hooks/useCostModuleCache';

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
  // New separated fields
  shipping_cost_seller: number;
  commission_cost: number;
  receita_envio: number;
  shipping_balance: number;
  revenue_net: number;
  cost_net: number;
  profit_net: number;
  margin_net: number;
  missing_fields: string[];
  fee_ml_source: string | null;
  order_status?: string;
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
  const [shippingFilter, setShippingFilter] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('paid');
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

  // Sorting state
  type SortKey = 'created_at_meli' | 'revenue_total' | 'cost_total' | 'shipping_cost_seller' | 'profit_total' | 'margin_percent' | null;
  type SortDirection = 'asc' | 'desc' | null;
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const [resyncingOrder, setResyncingOrder] = useState<string | null>(null);
  const [reimportingOrder, setReimportingOrder] = useState<string | null>(null);

  // Batch selection state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentOrderId: '' });

  const allOnPageSelected = orders.length > 0 && orders.every(o => selectedOrders.has(o.order_id));
  const someOnPageSelected = orders.some(o => selectedOrders.has(o.order_id));

  const toggleSelectAll = () => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        orders.forEach(o => next.delete(o.order_id));
      } else {
        orders.forEach(o => next.add(o.order_id));
      }
      return next;
    });
  };

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleBatchResync = async () => {
    const ids = Array.from(selectedOrders);
    if (ids.length === 0) return;

    setBatchProcessing(true);
    setBatchProgress({ current: 0, total: ids.length, currentOrderId: '' });
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < ids.length; i++) {
      const orderId = ids[i];
      setBatchProgress({ current: i + 1, total: ids.length, currentOrderId: orderId });
      try {
        const { error } = await supabase.functions.invoke('ml-sync-real-costs', {
          body: { seller_id: sellerId, action: 'resync_single', order_id: orderId }
        });
        if (error) throw error;
        successCount++;
      } catch {
        errorCount++;
      }
      // Small delay to avoid rate limiting
      if (i < ids.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setBatchProcessing(false);
    setSelectedOrders(new Set());
    setBatchProgress({ current: 0, total: 0, currentOrderId: '' });

    if (errorCount === 0) {
      toast.success(`${successCount} pedidos atualizados com sucesso`);
    } else {
      toast.warning(`${successCount} atualizados, ${errorCount} com erro`);
    }
    loadOrders();
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else if (sortDirection === 'asc') {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
    setPage(1); // reset to page 1 on sort change
  };

  // No client-side sorting - sorting is done server-side

  // Count orders with high shipping costs
  const highShippingCount = orders.filter(o => (o.shipping_cost_seller || 0) >= 100).length;
  const veryHighShippingCount = orders.filter(o => (o.shipping_cost_seller || 0) >= 300).length;
  const missingShippingCount = orders.filter(o => 
    (o.shipping_cost_seller || 0) === 0 && 
    o.missing_fields?.includes('sem_frete_cobrado') &&
    o.fee_ml_source !== 'no_charges'
  ).length;

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'desc' 
      ? <ArrowDown className="h-4 w-4 ml-1" />
      : <ArrowUp className="h-4 w-4 ml-1" />;
  };

  const loadOrders = async () => {
    checkSellerChange(sellerId);
    const cacheKey = `orders:${sellerId}:${periodDays}:${search}:${page}:${statusFilter}:${profitFilter}:${ecommerceFilter}:${shippingFilter}:${orderStatusFilter}:${sortKey}:${sortDirection}`;
    const cached = getCostCache(cacheKey);
    if (cached) {
      setOrders(cached.orders || []);
      setTotalPages(cached.total_pages || 1);
      setTotalOrders(cached.total || 0);
      setLoading(false);
      return;
    }

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

      if (sortKey && sortDirection) {
        params.set('sort_by', sortKey);
        params.set('sort_dir', sortDirection);
      }

      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (profitFilter !== 'all') params.set('profit_type', profitFilter);
      if (ecommerceFilter !== 'all') params.set('ecommerce_cost', ecommerceFilter);
      if (shippingFilter !== 'all') params.set('shipping_filter', shippingFilter);
      if (orderStatusFilter !== 'paid') params.set('order_status', orderStatusFilter);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/orders?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
        setTotalPages(data.total_pages || 1);
        setTotalOrders(data.total || 0);
        setCostCache(cacheKey, data);
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
  }, [sellerId, periodDays, statusFilter, profitFilter, ecommerceFilter, shippingFilter, orderStatusFilter, page, sortKey, sortDirection]);

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

  // Pending orders are now in the "Sem Custo" tab

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

            <Select value={shippingFilter} onValueChange={(v) => { setShippingFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Frete (ML)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Frete: Todos</SelectItem>
                <SelectItem value="high">Frete alto (≥100)</SelectItem>
                <SelectItem value="very_high">Frete muito alto (≥300)</SelectItem>
                <SelectItem value="missing">Frete ausente</SelectItem>
              </SelectContent>
            </Select>

            {/* Billing filter removed - pending/no_charges are in "Sem Custo" tab */}

            <Select value={orderStatusFilter} onValueChange={(v) => { setOrderStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status Venda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Pagos</SelectItem>
                <SelectItem value="pending_cost">Sem Custo</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={loadOrders} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            {/* Reprocess pending button moved to "Sem Custo" tab */}
          </div>

          {/* Shipping counters */}
          {!loading && (highShippingCount > 0 || veryHighShippingCount > 0 || missingShippingCount > 0) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {veryHighShippingCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="cursor-pointer"
                  onClick={() => { setShippingFilter('very_high'); setPage(1); }}
                >
                  🚨 {veryHighShippingCount} pedidos com frete ≥300
                </Badge>
              )}
              {highShippingCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className="cursor-pointer"
                  onClick={() => { setShippingFilter('high'); setPage(1); }}
                >
                  📦 {highShippingCount} pedidos com frete ≥100
                </Badge>
              )}
              {missingShippingCount > 0 && (
                <Badge 
                  variant="outline" 
                  className="cursor-pointer text-yellow-600 border-yellow-500"
                  onClick={() => { setShippingFilter('missing'); setPage(1); }}
                >
                  ⚠️ {missingShippingCount} sem frete cobrado
                </Badge>
              )}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              {/* Batch action bar */}
              {selectedOrders.size > 0 && (
                <div className="flex items-center gap-3 p-3 mb-2 rounded-lg bg-muted border">
                  <span className="text-sm font-medium">{selectedOrders.size} selecionado(s)</span>
                  <Button
                    size="sm"
                    onClick={handleBatchResync}
                    disabled={batchProcessing}
                  >
                    {batchProcessing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        {batchProgress.current}/{batchProgress.total}
                      </>
                    ) : (
                      <>
                        <RotateCw className="h-3.5 w-3.5 mr-1" />
                        Atualizar selecionados
                      </>
                    )}
                  </Button>
                  {!batchProcessing && (
                    <Button size="sm" variant="ghost" onClick={() => setSelectedOrders(new Set())}>
                      Limpar seleção
                    </Button>
                  )}
                  {batchProcessing && (
                    <div className="flex-1 flex items-center gap-2">
                      <Progress value={(batchProgress.current / batchProgress.total) * 100} className="flex-1 h-2" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Pedido {batchProgress.currentOrderId}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <Table className="[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allOnPageSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Selecionar todos da página"
                        />
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer select-none hover:bg-muted/80"
                        onClick={() => handleSort('created_at_meli')}
                      >
                        <div className="flex items-center">
                          Data
                          <SortIcon columnKey="created_at_meli" />
                        </div>
                      </TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Status Venda</TableHead>
                      <TableHead>Comprador</TableHead>
                      <TableHead 
                        className="text-right cursor-pointer select-none hover:bg-muted/80"
                        onClick={() => handleSort('revenue_total')}
                      >
                        <div className="flex items-center justify-end">
                          Receita
                          <SortIcon columnKey="revenue_total" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer select-none hover:bg-muted/80"
                        onClick={() => handleSort('cost_total')}
                      >
                        <div className="flex items-center justify-end">
                          Custo
                          <SortIcon columnKey="cost_total" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer select-none hover:bg-muted/80"
                        onClick={() => handleSort('shipping_cost_seller')}
                      >
                        <div className="flex items-center justify-end">
                          Frete (ML)
                          <SortIcon columnKey="shipping_cost_seller" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer select-none hover:bg-muted/80"
                        onClick={() => handleSort('profit_total')}
                      >
                        <div className="flex items-center justify-end">
                          Lucro
                          <SortIcon columnKey="profit_total" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer select-none hover:bg-muted/80"
                        onClick={() => handleSort('margin_percent')}
                      >
                        <div className="flex items-center justify-end">
                          Margem
                          <SortIcon columnKey="margin_percent" />
                        </div>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                          Nenhum pedido encontrado. Clique em "Recalcular" para processar.
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((order) => {
                        const shippingCost = order.shipping_cost_seller || 0;
                        const isMissingShipping = shippingCost === 0 && order.missing_fields?.includes('sem_frete_cobrado') && order.fee_ml_source !== 'no_charges';
                        const isHighShipping = shippingCost >= 100;
                        const isVeryHighShipping = shippingCost >= 300;
                        
                        return (
                          <TableRow
                            key={order.id}
                            className={cn("cursor-pointer hover:bg-muted/50", selectedOrders.has(order.order_id) && "bg-muted/30")}
                            onClick={() => loadOrderDetail(order.order_id)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedOrders.has(order.order_id)}
                                onCheckedChange={() => toggleSelectOrder(order.order_id)}
                                disabled={batchProcessing}
                              />
                            </TableCell>
                            <TableCell>{formatDate(order.created_at_meli)}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <div>
                                  <div className="font-mono text-xs">{order.order_id}</div>
                                  {order.shipment_id && (
                                    <div className="text-xs text-muted-foreground">{order.shipment_id}</div>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                                  onClick={() => {
                                    navigator.clipboard.writeText(order.order_id);
                                    toast.success('Número copiado');
                                  }}
                                  title="Copiar número do pedido"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const st = order.order_status || order.status;
                                const statusMap: Record<string, { label: string; cls: string }> = {
                                  paid: { label: 'Pago', cls: 'bg-green-100 text-green-800 border-green-300' },
                                  delivered: { label: 'Entregue', cls: 'bg-green-100 text-green-800 border-green-300' },
                                  cancelled: { label: 'Cancelado', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
                                  refunded: { label: 'Reembolsado', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
                                  partially_refunded: { label: 'Reemb. Parcial', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
                                  return_pending: { label: 'Devolução', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
                                  return_open: { label: 'Devolução', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
                                  claim_open: { label: 'Reclamação', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
                                };
                                const info = statusMap[st] || { label: st || '-', cls: 'bg-muted text-muted-foreground border-border' };
                                return (
                                  <Badge variant="outline" className={cn('text-xs whitespace-nowrap', info.cls)}>
                                    {info.label}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell>{order.buyer_nickname || order.buyer_name || '-'}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(order.revenue_total)}
                            </TableCell>
                            <TableCell className="text-right text-destructive">
                              {formatCurrency(order.cost_total)}
                            </TableCell>
                            <TableCell className={cn(
                              "text-right",
                              isMissingShipping && "text-yellow-600",
                              isVeryHighShipping && "text-destructive font-bold",
                              isHighShipping && !isVeryHighShipping && "text-orange-600 font-medium"
                            )}>
                              {isMissingShipping ? (
                                <span className="flex items-center justify-end gap-1" title="Frete ausente na API">
                                  <AlertCircle className="h-3 w-3" />
                                  -
                                </span>
                              ) : (
                                formatCurrency(shippingCost)
                              )}
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
                              {order.margin_percent?.toFixed(1) || '0.0'}%
                            </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              {order.status === 'ok' ? (
                                <Badge variant="outline" className="text-green-600 border-green-600">OK</Badge>
                              ) : (
                                <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                  <AlertCircle className="h-3 w-3" />
                                  {order.missing_cost_items_count} s/ custo
                                </Badge>
                              )}
                              {order.fee_ml_source === 'no_charges' && (
                                <Badge
                                  variant="secondary"
                                  className="flex items-center gap-1"
                                  title="Pedido sem taxas de marketplace (ex: pickup, frete grátis absorvido, promoção)"
                                >
                                  <Package className="h-3 w-3" />
                                  Sem Taxas
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
                          <TableCell>
                            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={resyncingOrder === order.order_id}
                                onClick={async () => {
                                  setResyncingOrder(order.order_id);
                                  try {
                                    const { data: result, error } = await supabase.functions.invoke('ml-sync-real-costs', {
                                      body: { seller_id: sellerId, action: 'resync_single', order_id: order.order_id }
                                    });
                                    if (error) throw error;
                                    toast.success(`Pedido ${order.order_id} atualizado`);
                                    loadOrders();
                                  } catch (err) {
                                    toast.error('Erro ao resincronizar');
                                  } finally {
                                    setResyncingOrder(null);
                                  }
                                }}
                                title="Atualizar custos deste pedido"
                              >
                                <RotateCw className={`h-3 w-3 ${resyncingOrder === order.order_id ? 'animate-spin' : ''}`} />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={reimportingOrder === order.order_id}
                                onClick={async () => {
                                  if (!confirm(`Reimportar pedido ${order.order_id}? Isso vai excluir e reimportar os dados.`)) return;
                                  setReimportingOrder(order.order_id);
                                  try {
                                    const { data: { session } } = await supabase.auth.getSession();
                                    if (!session) return;
                                    const response = await fetch(
                                      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/orders/reimport`,
                                      {
                                        method: 'POST',
                                        headers: {
                                          Authorization: `Bearer ${session.access_token}`,
                                          'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({ seller_id: sellerId, order_id: order.order_id }),
                                      }
                                    );
                                    if (response.ok) {
                                      toast.success(`Pedido ${order.order_id} reimportado`);
                                      loadOrders();
                                    } else {
                                      const err = await response.json().catch(() => ({}));
                                      toast.error(err.error || 'Erro ao reimportar');
                                    }
                                  } catch {
                                    toast.error('Erro ao reimportar pedido');
                                  } finally {
                                    setReimportingOrder(null);
                                  }
                                }}
                                title="Reimportar pedido (excluir e reimportar)"
                              >
                                <Trash2 className={`h-3 w-3 ${reimportingOrder === order.order_id ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })
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
                <div className="space-y-4">
                  {/* Resumo Principal - Lucro do Produto (sem frete) */}
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      💰 Lucro do Produto
                      <span className="text-xs text-muted-foreground font-normal">(sem impacto do frete)</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Receita Líquida (produtos):</div>
                      <div className="text-right font-medium">{formatCurrency(selectedOrder.breakdown.revenue_net || selectedOrder.breakdown.revenue_total)}</div>

                      <div>(-) Custo dos Itens:</div>
                      <div className="text-right">{formatCurrency(selectedOrder.breakdown.cost_items_total)}</div>

                      <div>(-) Embalagem:</div>
                      <div className="text-right">{formatCurrency(selectedOrder.breakdown.cost_packaging)}</div>

                      <div className="flex items-center gap-1">
                        (-) Comissão ML:
                        {selectedOrder.breakdown.commission_cost > 0 && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                      </div>
                      <div className="text-right">{formatCurrency(selectedOrder.breakdown.commission_cost || selectedOrder.billing?.cost_sale_fee || 0)}</div>

                      {(selectedOrder.breakdown.installments_cost > 0 || selectedOrder.billing?.cost_installment_fee > 0) && (
                        <>
                          <div className="flex items-center gap-1">
                            (-) Taxa Parcelamento:
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          </div>
                          <div className="text-right">{formatCurrency(selectedOrder.breakdown.installments_cost || selectedOrder.billing?.cost_installment_fee || 0)}</div>
                        </>
                      )}

                      <div className="border-t pt-2 font-medium">Custo Net:</div>
                      <div className="text-right border-t pt-2 font-medium text-destructive">
                        {formatCurrency(selectedOrder.breakdown.cost_net || selectedOrder.breakdown.cost_total)}
                      </div>

                      <div className="border-t pt-2 font-medium text-lg">Lucro:</div>
                      <div className={`text-right border-t pt-2 font-medium text-lg ${(selectedOrder.breakdown.profit_net ?? selectedOrder.breakdown.profit_total) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {formatCurrency(selectedOrder.breakdown.profit_net ?? selectedOrder.breakdown.profit_total)}
                      </div>

                      <div>Margem:</div>
                      <div className="text-right font-medium">{(selectedOrder.breakdown.margin_net ?? selectedOrder.breakdown.margin_percent)?.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* Bloco Frete e Taxas - Separado */}
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      🚚 Frete e Taxas
                      <span className="text-xs text-muted-foreground font-normal">(não impacta lucro/margem principal)</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-1">
                        Receita de Frete (cliente pagou):
                        {(selectedOrder.breakdown.receita_envio > 0 || selectedOrder.billing?.revenue_shipping > 0) && 
                          <CheckCircle2 className="h-3 w-3 text-green-600" />}
                      </div>
                      <div className="text-right text-green-600">
                        +{formatCurrency(selectedOrder.breakdown.receita_envio || selectedOrder.billing?.revenue_shipping || 0)}
                      </div>

                      <div className="flex items-center gap-1">
                        Custo de Frete (ML cobrou):
                        {(selectedOrder.breakdown.shipping_cost_seller > 0 || selectedOrder.billing?.cost_shipping_fee > 0) && 
                          <CheckCircle2 className="h-3 w-3 text-green-600" />}
                      </div>
                      <div className="text-right text-destructive">
                        -{formatCurrency(selectedOrder.breakdown.shipping_cost_seller || selectedOrder.billing?.cost_shipping_fee || 0)}
                      </div>

                      <div className="border-t pt-2 font-medium">Saldo do Frete:</div>
                      <div className={`text-right border-t pt-2 font-medium ${
                        (selectedOrder.breakdown.shipping_balance ?? 0) >= 0 ? 'text-green-600' : 'text-destructive'
                      }`}>
                        {formatCurrency(selectedOrder.breakdown.shipping_balance ?? 
                          ((selectedOrder.billing?.revenue_shipping || 0) - (selectedOrder.billing?.cost_shipping_fee || 0))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status e Debug */}
                  {selectedOrder.breakdown.missing_fields?.length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        <span className="font-medium">Campos faltantes:</span>
                        {selectedOrder.breakdown.missing_fields.map((field: string) => (
                          <Badge key={field} variant="outline" className="text-yellow-700 border-yellow-400">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
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
