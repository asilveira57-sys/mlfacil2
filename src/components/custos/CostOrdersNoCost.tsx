import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, RefreshCw, AlertCircle, Clock, Edit2, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { getCostCache, setCostCache, invalidateCostCache, checkSellerChange } from '@/hooks/useCostModuleCache';

interface CostOrdersNoCostProps {
  sellerId: string;
}

interface NoCostOrder {
  id: string;
  order_id: string;
  shipment_id: string | null;
  revenue_total: number;
  buyer_nickname: string | null;
  buyer_name: string | null;
  created_at_meli: string | null;
  fee_ml_source: string;
  cost_items_total: number;
  cost_packaging: number;
}

export function CostOrdersNoCost({ sellerId }: CostOrdersNoCostProps) {
  const [orders, setOrders] = useState<NoCostOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [periodDays, setPeriodDays] = useState('30');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [noChargesTotal, setNoChargesTotal] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ processed: number; updated: number; remaining: number } | null>(null);

  // Manual cost dialog
  const [editOrder, setEditOrder] = useState<NoCostOrder | null>(null);
  const [editCommission, setEditCommission] = useState(0);
  const [editShipping, setEditShipping] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [resyncingOrder, setResyncingOrder] = useState<string | null>(null);
  const [goToPageInput, setGoToPageInput] = useState('');

  const loadOrders = useCallback(async () => {
    checkSellerChange(sellerId);
    const cacheKey = `no-cost:${sellerId}:${periodDays}:${search}:${page}`;
    const cached = getCostCache(cacheKey);
    if (cached) {
      setOrders(cached.orders || []);
      setTotalPages(cached.total_pages || 1);
      setTotalOrders(cached.total || 0);
      setPendingTotal(cached.pending_total || 0);
      setNoChargesTotal(cached.no_charges_total || 0);
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

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/orders/no-cost?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
        setTotalPages(data.total_pages || 1);
        setTotalOrders(data.total || 0);
        setPendingTotal(data.pending_total || 0);
        setNoChargesTotal(data.no_charges_total || 0);
        setCostCache(cacheKey, data);
      }
    } catch (error) {
      console.error('Error loading no-cost orders:', error);
      toast.error('Erro ao carregar pedidos sem custo');
    } finally {
      setLoading(false);
    }
  }, [sellerId, periodDays, search, page]);

  useEffect(() => {
    if (sellerId) loadOrders();
  }, [sellerId, periodDays, page, loadOrders]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sellerId) {
        setPage(1);
        loadOrders();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Rate limit: 30 min cooldown
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const SYNC_COOLDOWN_MS = 30 * 60 * 1000;
  const canSync = Date.now() - lastSyncTime > SYNC_COOLDOWN_MS;
  const cooldownRemaining = Math.max(0, Math.ceil((SYNC_COOLDOWN_MS - (Date.now() - lastSyncTime)) / 60000));

  const handleSync = async () => {
    if (!canSync) {
      toast.info(`Aguarde ${cooldownRemaining} minuto(s) antes de sincronizar novamente`);
      return;
    }
    setSyncing(true);
    setSyncProgress({ processed: 0, updated: 0, remaining: 0 });
    
    let totalProcessed = 0;
    let totalUpdated = 0;
    let batchCount = 0;
    const MAX_BATCHES = 50; // Safety limit
    
    try {
      while (batchCount < MAX_BATCHES) {
        batchCount++;
        
        const { data, error } = await supabase.functions.invoke('ml-sync-real-costs', {
          body: {
            seller_id: sellerId,
            action: 'reprocess_pending',
            scope_days: parseInt(periodDays),
          },
        });

        if (error) throw error;
        
        totalProcessed += (data.processed || 0);
        totalUpdated += (data.updated || 0);
        const remaining = data.remaining || 0;
        
        setSyncProgress({ processed: totalProcessed, updated: totalUpdated, remaining });
        
        // If nothing was processed or no more remaining, we're done
        if (data.processed === 0 || remaining === 0) {
          break;
        }
        
        // Refresh the list after each batch
        invalidateCostCache('no-cost');
        invalidateCostCache('orders');
        loadOrders();
        
        // Small delay between batches
        await new Promise(r => setTimeout(r, 1000));
      }
      
      setLastSyncTime(Date.now());
      
      if (totalUpdated > 0) {
        toast.success(`${totalUpdated} pedidos atualizados com dados reais (${totalProcessed} processados)`);
      } else if (totalProcessed > 0) {
        toast.info(`${totalProcessed} pedidos verificados, nenhum com billing disponível ainda`);
      } else {
        toast.success('Nenhum pedido pendente para processar');
      }
      
      invalidateCostCache('no-cost');
      invalidateCostCache('orders');
      loadOrders();
    } catch (err) {
      console.error('Error syncing:', err);
      toast.error('Erro ao sincronizar. Progresso salvo — tente novamente para continuar de onde parou.');
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const openManualCostDialog = (order: NoCostOrder) => {
    setEditOrder(order);
    setEditCommission(0);
    setEditShipping(0);
    setEditNotes('');
  };

  const handleSaveManualCost = async () => {
    if (!editOrder) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/orders/update-manual-cost`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seller_id: sellerId,
            order_id: editOrder.order_id,
            commission_cost: editCommission,
            shipping_cost: editShipping,
            notes: editNotes,
          }),
        }
      );

      if (response.ok) {
        toast.success('Custo manual salvo com sucesso');
        setEditOrder(null);
        invalidateCostCache('no-cost');
        invalidateCostCache('orders');
        loadOrders();
      } else {
        toast.error('Erro ao salvar custo manual');
      }
    } catch (error) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Pedidos Sem Custo</span>
            <div className="flex items-center gap-2">
              {pendingTotal > 0 && (
                <Badge variant="secondary">
                  <Clock className="h-3 w-3 mr-1" />
                  {pendingTotal} pendentes
                </Badge>
              )}
              {noChargesTotal > 0 && (
                <Badge variant="outline">
                  {noChargesTotal} sem taxas
                </Badge>
              )}
              {totalOrders > 0 && (
                <Badge variant="destructive">
                  {totalOrders} total
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por pedido ou comprador..."
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

            <Button variant="outline" onClick={loadOrders} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Button onClick={handleSync} disabled={syncing || loading || !canSync} title={!canSync ? `Aguarde ${cooldownRemaining} min` : ''}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : !canSync ? `Aguarde ${cooldownRemaining}min` : 'Forçar Sincronização'}
            </Button>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 mb-4 text-sm text-muted-foreground space-y-1">
            <div>
              <AlertCircle className="h-4 w-4 inline mr-2" />
              Pedidos que ainda não possuem dados de taxas/frete do Mercado Livre.
            </div>
            <div className="text-xs">
              <Clock className="h-3 w-3 inline mr-1" />
              <strong>Importante:</strong> Pedidos recentes levam de 24 a 48 horas para ter dados de billing disponíveis no Mercado Livre. 
              O sistema sincroniza automaticamente durante a madrugada. Use "Forçar Sincronização" apenas para pedidos com mais de 48h.
            </div>
          </div>

          {/* Sync progress bar */}
          {syncing && syncProgress && (
            <div className="bg-muted/50 rounded-lg p-3 mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Sincronizando pedidos...</span>
                <span className="text-muted-foreground">
                  {syncProgress.processed} processados · {syncProgress.updated} atualizados · {syncProgress.remaining} restantes
                </span>
              </div>
              {syncProgress.remaining > 0 && (
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round((syncProgress.processed / (syncProgress.processed + syncProgress.remaining)) * 100))}%` }}
                  />
                </div>
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
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Comprador</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum pedido sem custo encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((order) => (
                        <TableRow key={order.order_id}>
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
                          <TableCell>
                            {order.fee_ml_source === 'pending' ? (
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 mr-1" />
                                Pendente
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-500">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Sem Taxas
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => openManualCostDialog(order)}
                              >
                                <Edit2 className="h-3 w-3 mr-1" />
                                Editar
                              </Button>
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
                                    toast.success(result?.message || 'Pedido resincronizado');
                    invalidateCostCache('no-cost');
                    invalidateCostCache('orders');
                    loadOrders();
                                  } catch {
                                    toast.error('Erro ao resincronizar');
                                  } finally {
                                    setResyncingOrder(null);
                                  }
                                }}
                                title="Recalcular custos deste pedido"
                              >
                                <RotateCw className={`h-3 w-3 ${resyncingOrder === order.order_id ? 'animate-spin' : ''}`} />
                              </Button>
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
                    <Label htmlFor="goToPageNoCost" className="text-sm text-muted-foreground">Ir para:</Label>
                    <Input
                      id="goToPageNoCost"
                      type="number"
                      min="1"
                      max={totalPages}
                      value={goToPageInput}
                      onChange={(e) => setGoToPageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const pageNum = parseInt(goToPageInput);
                          if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
                            setPage(pageNum);
                            setGoToPageInput('');
                          } else {
                            toast.error(`Página inválida. Digite um número entre 1 e ${totalPages}`);
                          }
                        }
                      }}
                      placeholder={String(page)}
                      className="w-20 h-8"
                    />
                    <Button variant="outline" size="sm" onClick={() => {
                      const pageNum = parseInt(goToPageInput);
                      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
                        setPage(pageNum);
                        setGoToPageInput('');
                      } else {
                        toast.error(`Página inválida. Digite um número entre 1 e ${totalPages}`);
                      }
                    }}>
                      Ir
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual Cost Dialog */}
      <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Custo Manual</DialogTitle>
          </DialogHeader>
          
          {editOrder && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div><strong>Pedido:</strong> {editOrder.order_id}</div>
                <div><strong>Comprador:</strong> {editOrder.buyer_nickname || editOrder.buyer_name || '-'}</div>
                <div><strong>Receita:</strong> {formatCurrency(editOrder.revenue_total)}</div>
              </div>

              <div>
                <Label htmlFor="commission">Custo de Venda / Comissão (R$)</Label>
                <Input
                  id="commission"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editCommission}
                  onChange={(e) => setEditCommission(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="shipping">Custo de Frete (R$)</Label>
                <Input
                  id="shipping"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editShipping}
                  onChange={(e) => setEditShipping(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="notes">Observações</Label>
                <Input
                  id="notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Ex: Frete grátis, pickup..."
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Cancelar</Button>
            <Button onClick={handleSaveManualCost} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
