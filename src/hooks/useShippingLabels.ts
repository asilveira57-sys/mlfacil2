import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type FinalStatus = 'pronta' | 'aguardando_nf' | 'sem_etiqueta' | 'erro' | 'all';
export type PeriodFilter = 7 | 15 | 30 | 90;
export type SyncPhase = 'idle' | 'orders' | 'shipments' | 'invoices' | 'done';

export interface ShippingOrder {
  id: string;
  user_id: string;
  seller_id: string;
  order_id: string;
  created_at_meli: string | null;
  order_status: string | null;
  shipment_id: string | null;
  buyer_nickname: string | null;
  total_amount: number | null;
  order_sync_at: string | null;
  shipment_status: string | null;
  shipment_substatus: string | null;
  tracking_number: string | null;
  label_available: boolean | null;
  receiver_name: string | null;
  shipment_sync_at: string | null;
  invoice_status: string | null;
  invoice_number: string | null;
  invoice_key: string | null;
  issued_at: string | null;
  invoice_sync_at: string | null;
  final_status: string | null;
  selectable: boolean | null;
}

export interface PrintQueueEntry {
  id: string;
  seller_id: string;
  format: string;
  shipment_ids: string[];
  total_labels: number;
  status: string;
  file_url: string | null;
  zpl_content: string | null;
  error_log: string | null;
  created_at: string;
}

interface UseShippingLabelsOptions {
  sellerId: string | null;
}

// Helper to get auth headers
async function getAuthHeaders(): Promise<{ Authorization: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return { Authorization: `Bearer ${session.access_token}` };
}

// Sleep helper for yielding between batches
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useShippingLabels({ sellerId }: UseShippingLabelsOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState<FinalStatus>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(30);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const [syncProgress, setSyncProgress] = useState<string>('');
  const syncAbortRef = useRef(false);

  // Calculate date range
  const getDateRange = useCallback(() => {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - periodFilter);
    return {
      dateFrom: dateFrom.toISOString(),
      dateTo: new Date().toISOString(),
    };
  }, [periodFilter]);

  // FAST LOAD: Query local cache with joins - NO await on sync
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['shipping-orders', sellerId, statusFilter, periodFilter],
    queryFn: async () => {
      if (!sellerId) return [];

      const { dateFrom } = getDateRange();

      // Step 1: Get orders from cache (fast)
      let ordersQuery = supabase
        .from('meli_orders_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .gte('created_at_meli', dateFrom)
        .order('created_at_meli', { ascending: false })
        .limit(500);

      const { data: ordersData, error: ordersError } = await ordersQuery;

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        throw ordersError;
      }

      if (!ordersData || ordersData.length === 0) {
        return [];
      }

      // Step 2: Get shipment_ids and order_ids for joins
      const shipmentIds = ordersData
        .map(o => o.shipment_id)
        .filter(Boolean) as string[];
      const orderIds = ordersData.map(o => o.order_id);

      // Step 3: Parallel fetch shipments and invoices from cache
      const [shipmentsResult, invoicesResult] = await Promise.all([
        shipmentIds.length > 0
          ? supabase
              .from('meli_shipments_cache')
              .select('*')
              .eq('seller_id', sellerId)
              .in('shipment_id', shipmentIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length > 0
          ? supabase
              .from('meli_invoices_cache')
              .select('*')
              .eq('seller_id', sellerId)
              .in('order_id', orderIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const shipmentsMap = new Map(
        (shipmentsResult.data || []).map(s => [s.shipment_id, s])
      );
      const invoicesMap = new Map(
        (invoicesResult.data || []).map(i => [i.order_id, i])
      );

      // Step 4: Build combined view
      const combinedOrders: ShippingOrder[] = ordersData.map(order => {
        const shipment = order.shipment_id ? shipmentsMap.get(order.shipment_id) : null;
        const invoice = invoicesMap.get(order.order_id);

        // Calculate final_status
        let finalStatus: string = 'sem_etiqueta';
        const labelAvailable = shipment?.label_available ?? false;
        const invoiceStatus = invoice?.invoice_status ?? 'pendente';

        if (labelAvailable && invoiceStatus === 'emitida') {
          finalStatus = 'pronta';
        } else if (labelAvailable && invoiceStatus !== 'emitida') {
          finalStatus = 'aguardando_nf';
        } else if (invoiceStatus === 'erro') {
          finalStatus = 'erro';
        } else {
          finalStatus = 'sem_etiqueta';
        }

        // Selectable if label available and invoice emitida
        const selectable = labelAvailable && invoiceStatus === 'emitida';

        return {
          id: order.id,
          user_id: order.user_id,
          seller_id: order.seller_id,
          order_id: order.order_id,
          created_at_meli: order.created_at_meli,
          order_status: order.order_status,
          shipment_id: order.shipment_id,
          buyer_nickname: order.buyer_nickname,
          total_amount: order.total_amount,
          order_sync_at: order.last_sync_at,
          shipment_status: shipment?.shipment_status ?? null,
          shipment_substatus: shipment?.shipment_substatus ?? null,
          tracking_number: shipment?.tracking_number ?? null,
          label_available: labelAvailable,
          receiver_name: shipment?.receiver_name ?? null,
          shipment_sync_at: shipment?.last_sync_at ?? null,
          invoice_status: invoiceStatus,
          invoice_number: invoice?.invoice_number ?? null,
          invoice_key: invoice?.invoice_key ?? null,
          issued_at: invoice?.issued_at ?? null,
          invoice_sync_at: invoice?.last_sync_at ?? null,
          final_status: finalStatus,
          selectable,
        };
      });

      // Apply status filter
      if (statusFilter !== 'all') {
        return combinedOrders.filter(o => o.final_status === statusFilter);
      }

      return combinedOrders;
    },
    enabled: !!sellerId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Get last sync time
  const lastSyncAt = orders.length > 0 
    ? orders.reduce((latest, order) => {
        const syncAt = order.order_sync_at;
        if (!syncAt) return latest;
        if (!latest) return syncAt;
        return new Date(syncAt) > new Date(latest) ? syncAt : latest;
      }, null as string | null)
    : null;

  // === SYNC PIPELINE (background, non-blocking) ===

  // Phase 1: Sync orders (batched with yields)
  const syncOrders = useCallback(async (): Promise<{ orderIds: string[]; shipmentIds: string[] }> => {
    if (!sellerId) return { orderIds: [], shipmentIds: [] };

    const headers = await getAuthHeaders();
    if (!headers) throw new Error('Not authenticated');

    const { dateFrom, dateTo } = getDateRange();

    setSyncPhase('orders');
    setSyncProgress('Buscando pedidos do período...');

    const response = await supabase.functions.invoke('ml-sync-orders', {
      headers,
      body: {
        seller_id: sellerId,
        date_from: dateFrom,
        date_to: dateTo,
      },
    });

    if (response.error) throw new Error(response.error.message);

    console.log('Orders synced:', response.data);

    // Get order IDs and shipment IDs from cache
    const { data: ordersWithShipments } = await supabase
      .from('meli_orders_cache')
      .select('order_id, shipment_id')
      .eq('seller_id', sellerId)
      .gte('created_at_meli', dateFrom);

    const orderIds = (ordersWithShipments || []).map(o => o.order_id);
    const shipmentIds = (ordersWithShipments || [])
      .map(o => o.shipment_id)
      .filter(Boolean) as string[];

    setSyncProgress(`${orderIds.length} pedidos sincronizados`);
    
    // Yield before next phase
    await sleep(200);

    return { orderIds, shipmentIds: [...new Set(shipmentIds)] };
  }, [sellerId, getDateRange]);

  // Phase 2: Sync shipments (batched)
  const syncShipments = useCallback(async (shipmentIds: string[]): Promise<void> => {
    if (!sellerId || shipmentIds.length === 0) return;

    const headers = await getAuthHeaders();
    if (!headers) throw new Error('Not authenticated');

    setSyncPhase('shipments');

    const BATCH_SIZE = 25;
    let processed = 0;

    for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
      if (syncAbortRef.current) break;

      const batch = shipmentIds.slice(i, i + BATCH_SIZE);
      processed += batch.length;
      
      setSyncProgress(`Atualizando envios ${processed}/${shipmentIds.length}...`);

      const response = await supabase.functions.invoke('ml-sync-shipments', {
        headers,
        body: {
          seller_id: sellerId,
          shipment_ids: batch,
        },
      });

      if (response.error) {
        console.error('Shipments sync batch error:', response.error);
      } else {
        console.log(`Shipments batch synced:`, response.data);
      }

      // Refresh UI after each batch
      await refetch();

      // Yield between batches
      await sleep(200);
    }
  }, [sellerId, refetch]);

  // Phase 3: Sync invoices (batched)
  const syncInvoices = useCallback(async (orderIds: string[]): Promise<void> => {
    if (!sellerId || orderIds.length === 0) return;

    const headers = await getAuthHeaders();
    if (!headers) throw new Error('Not authenticated');

    setSyncPhase('invoices');

    const BATCH_SIZE = 25;
    let processed = 0;

    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      if (syncAbortRef.current) break;

      const batch = orderIds.slice(i, i + BATCH_SIZE);
      processed += batch.length;
      
      setSyncProgress(`Atualizando NFs ${processed}/${orderIds.length}...`);

      const response = await supabase.functions.invoke('ml-sync-invoices', {
        headers,
        body: {
          seller_id: sellerId,
          order_ids: batch,
        },
      });

      if (response.error) {
        console.error('Invoices sync batch error:', response.error);
      } else {
        console.log(`Invoices batch synced:`, response.data);
      }

      // Refresh UI after each batch
      await refetch();

      // Yield between batches
      await sleep(200);
    }
  }, [sellerId, refetch]);

  // Main sync pipeline (non-blocking)
  const startSyncPipeline = useCallback(async () => {
    if (isSyncing) return;

    syncAbortRef.current = false;
    setIsSyncing(true);
    setSyncPhase('orders');

    try {
      // Phase 1: Orders
      const { orderIds, shipmentIds } = await syncOrders();
      if (syncAbortRef.current) return;

      // Refresh after orders
      await refetch();

      // Phase 2: Shipments
      if (shipmentIds.length > 0) {
        await syncShipments(shipmentIds);
        if (syncAbortRef.current) return;
      }

      // Phase 3: Invoices
      if (orderIds.length > 0) {
        await syncInvoices(orderIds);
        if (syncAbortRef.current) return;
      }

      setSyncPhase('done');
      setSyncProgress('Sincronização completa');

      // Final refresh
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['shipping-orders'] });

      toast({
        title: 'Sincronização concluída',
        description: `${orderIds.length} pedidos, ${shipmentIds.length} envios atualizados`,
      });

    } catch (error) {
      console.error('Sync pipeline error:', error);
      toast({
        title: 'Erro na sincronização',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
      setSyncPhase('idle');
      setSyncProgress('');
    }
  }, [isSyncing, syncOrders, syncShipments, syncInvoices, refetch, queryClient, toast]);

  // Generate labels mutation
  const generateLabelsMutation = useMutation({
    mutationFn: async ({ format, shipmentId }: { format: 'pdf' | 'zpl'; shipmentId?: string }) => {
      if (!sellerId) throw new Error('Seller ID not set');
      
      const headers = await getAuthHeaders();
      if (!headers) throw new Error('Not authenticated');

      let shipmentIds: string[];
      
      if (shipmentId) {
        shipmentIds = [shipmentId];
      } else {
        if (selectedIds.size === 0) throw new Error('Nenhum envio selecionado');
        const selectedOrders = orders.filter(o => selectedIds.has(o.id));
        shipmentIds = selectedOrders
          .map(o => o.shipment_id)
          .filter(Boolean) as string[];
      }

      if (shipmentIds.length === 0) {
        throw new Error('Nenhum envio válido selecionado');
      }

      const response = await supabase.functions.invoke('ml-generate-labels', {
        headers,
        body: {
          seller_id: sellerId,
          shipment_ids: shipmentIds,
          format,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data.success) throw new Error(response.data.message || 'Erro ao gerar etiquetas');

      return response.data;
    },
    onSuccess: (data, variables) => {
      if (!variables.shipmentId) {
        setSelectedIds(new Set());
      }
      
      if (variables.format === 'pdf' && data.pdf_base64) {
        const binary = atob(data.pdf_base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiquetas_${new Date().getTime()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: 'PDF gerado com sucesso',
          description: `${data.total_labels} etiqueta(s) gerada(s)`,
        });
      } else if (variables.format === 'zpl' && data.zpl_content) {
        const blob = new Blob([data.zpl_content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiquetas_${new Date().getTime()}.zpl`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: 'ZPL gerado com sucesso',
          description: `${data.total_labels} etiqueta(s) gerada(s)`,
        });
      }
    },
    onError: (error) => {
      console.error('Generate labels error:', error);
      toast({
        title: 'Erro ao gerar etiquetas',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Selection helpers
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const selectableOrders = orders.filter(o => o.selectable);
    setSelectedIds(new Set(selectableOrders.map(o => o.id)));
  }, [orders]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Sync function (non-blocking wrapper)
  const sync = useCallback(() => {
    // Start in background without await
    startSyncPipeline();
  }, [startSyncPipeline]);

  // Get counts by status (unfiltered)
  const allOrders = useQuery({
    queryKey: ['shipping-orders-counts', sellerId, periodFilter],
    queryFn: async () => {
      if (!sellerId) return [];

      const { dateFrom } = getDateRange();

      // Get all orders for counting
      const { data: ordersData } = await supabase
        .from('meli_orders_cache')
        .select('order_id, shipment_id')
        .eq('seller_id', sellerId)
        .gte('created_at_meli', dateFrom);

      if (!ordersData || ordersData.length === 0) return [];

      const shipmentIds = ordersData.map(o => o.shipment_id).filter(Boolean) as string[];
      const orderIds = ordersData.map(o => o.order_id);

      const [shipmentsResult, invoicesResult] = await Promise.all([
        shipmentIds.length > 0
          ? supabase.from('meli_shipments_cache').select('shipment_id, label_available').eq('seller_id', sellerId).in('shipment_id', shipmentIds)
          : Promise.resolve({ data: [] }),
        orderIds.length > 0
          ? supabase.from('meli_invoices_cache').select('order_id, invoice_status').eq('seller_id', sellerId).in('order_id', orderIds)
          : Promise.resolve({ data: [] }),
      ]);

      const shipmentsMap = new Map((shipmentsResult.data || []).map(s => [s.shipment_id, s.label_available]));
      const invoicesMap = new Map((invoicesResult.data || []).map(i => [i.order_id, i.invoice_status]));

      return ordersData.map(o => {
        const labelAvailable = o.shipment_id ? shipmentsMap.get(o.shipment_id) ?? false : false;
        const invoiceStatus = invoicesMap.get(o.order_id) ?? 'pendente';

        let finalStatus = 'sem_etiqueta';
        if (labelAvailable && invoiceStatus === 'emitida') finalStatus = 'pronta';
        else if (labelAvailable && invoiceStatus !== 'emitida') finalStatus = 'aguardando_nf';
        else if (invoiceStatus === 'erro') finalStatus = 'erro';

        return { finalStatus };
      });
    },
    enabled: !!sellerId,
    staleTime: 30000,
  });

  const statusCounts = {
    all: allOrders.data?.length ?? 0,
    pronta: allOrders.data?.filter(o => o.finalStatus === 'pronta').length ?? 0,
    aguardando_nf: allOrders.data?.filter(o => o.finalStatus === 'aguardando_nf').length ?? 0,
    sem_etiqueta: allOrders.data?.filter(o => o.finalStatus === 'sem_etiqueta').length ?? 0,
    erro: allOrders.data?.filter(o => o.finalStatus === 'erro').length ?? 0,
  };

  return {
    orders,
    isLoading,
    refetch,
    statusFilter,
    setStatusFilter,
    periodFilter,
    setPeriodFilter,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isSyncing,
    syncPhase,
    syncProgress,
    sync,
    lastSyncAt,
    statusCounts,
    generateLabels: generateLabelsMutation.mutate,
    isGenerating: generateLabelsMutation.isPending,
  };
}
