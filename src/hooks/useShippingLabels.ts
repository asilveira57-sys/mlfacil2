import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type FinalStatus = 'pronta' | 'aguardando_nf' | 'reimprimir' | 'full' | 'enviado' | 'outros' | 'all';
export type PeriodFilter = 0 | 7 | 15 | 30 | 90; // 0 = hoje (últimas 24h)
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
  logistic_type: string | null;
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

// Statuses that indicate order is already completed/shipped (should be excluded)
const COMPLETED_ORDER_STATUSES = ['cancelled'];
const COMPLETED_SHIPMENT_STATUSES = ['delivered', 'shipped', 'not_delivered'];

// Logistic types where ML handles shipping (FULL - seller doesn't print)
const FULL_LOGISTIC_TYPES = ['fulfillment', 'cross_docking'];

// Priority for final_status when deduplicating by shipment_id
const STATUS_PRIORITY: Record<string, number> = {
  pronta: 1,
  aguardando_nf: 2,
  reimprimir: 3,
  full: 4,
  enviado: 5,
  outros: 6,
};

export function useShippingLabels({ sellerId }: UseShippingLabelsOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState<FinalStatus>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(0); // Default: hoje
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const syncAbortRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(0);
  const hasAutoSyncedRef = useRef(false);

  // Calculate date range - "Hoje" means last 24 hours
  const getDateRange = useCallback(() => {
    const now = new Date();
    let dateFrom: Date;
    
    if (periodFilter === 0) {
      // Hoje: últimas 24 horas (não início do dia)
      dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else {
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - periodFilter);
    }
    
    return {
      dateFrom: dateFrom.toISOString(),
      dateTo: now.toISOString(),
    };
  }, [periodFilter]);

  // FAST LOAD: Query local cache with joins - NO await on sync
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['shipping-orders', sellerId, statusFilter, periodFilter],
    queryFn: async () => {
      if (!sellerId) return [];

      const { dateFrom } = getDateRange();

      // Step 1: Get orders from cache (fast) - exclude cancelled
      const { data: ordersData, error: ordersError } = await supabase
        .from('meli_orders_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .gte('created_at_meli', dateFrom)
        .not('order_status', 'in', `(${COMPLETED_ORDER_STATUSES.join(',')})`)
        .order('created_at_meli', { ascending: false })
        .limit(500);

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

      // Step 4: Build combined view - include ALL orders for "Todos" filter
      const combinedOrders: ShippingOrder[] = ordersData
        .map(order => {
          const shipment = order.shipment_id ? shipmentsMap.get(order.shipment_id) : null;
          const invoice = invoicesMap.get(order.order_id);

          // Skip orders without shipment
          if (!shipment || !order.shipment_id) return null;

          const logisticType = shipment.logistic_type;
          const labelAvailable = shipment?.label_available ?? false;
          const substatus = shipment?.shipment_substatus;
          const shipmentStatus = shipment?.shipment_status;

          // Calculate final_status for ALL orders
          let finalStatus: string;

          // FULL logistics - ML handles these
          if (logisticType && FULL_LOGISTIC_TYPES.includes(logisticType)) {
            finalStatus = 'full';
          }
          // Already shipped/delivered
          else if (shipmentStatus && COMPLETED_SHIPMENT_STATUSES.includes(shipmentStatus)) {
            finalStatus = 'enviado';
          }
          // Already printed - can reprint
          else if (substatus === 'printed') {
            finalStatus = 'reimprimir';
          }
          // Waiting for NF emission at ML
          else if (substatus === 'invoice_pending') {
            finalStatus = 'aguardando_nf';
          }
          // Ready to print (NF already emitted)
          else if (substatus === 'ready_to_print' && labelAvailable) {
            finalStatus = 'pronta';
          }
          // Other statuses (in_hub, packed, etc.)
          else {
            finalStatus = 'outros';
          }

          // Selectable only if ready to print (new labels for bulk printing)
          const selectable = finalStatus === 'pronta';

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
            invoice_status: invoice?.invoice_status ?? 'pendente',
            invoice_number: invoice?.invoice_number ?? null,
            invoice_key: invoice?.invoice_key ?? null,
            issued_at: invoice?.issued_at ?? null,
            invoice_sync_at: invoice?.last_sync_at ?? null,
            final_status: finalStatus,
            selectable,
            logistic_type: logisticType ?? null,
          };
        })
        .filter((o): o is ShippingOrder => o !== null);

      // Group by shipment_id to handle shopping cart orders (multiple orders = one shipment)
      // Keep the one with higher priority status
      const groupedByShipment = new Map<string, ShippingOrder>();
      combinedOrders.forEach(order => {
        if (!order.shipment_id) return;
        
        const existing = groupedByShipment.get(order.shipment_id);
        if (!existing) {
          groupedByShipment.set(order.shipment_id, order);
        } else {
          // Keep the one with higher priority (lower number = higher priority)
          const existingPriority = STATUS_PRIORITY[existing.final_status || ''] || 99;
          const newPriority = STATUS_PRIORITY[order.final_status || ''] || 99;
          if (newPriority < existingPriority) {
            groupedByShipment.set(order.shipment_id, order);
          }
        }
      });

      const uniqueOrders = Array.from(groupedByShipment.values());

      // Apply status filter - "all" shows everything
      if (statusFilter !== 'all') {
        return uniqueOrders.filter(o => o.final_status === statusFilter);
      }

      return uniqueOrders;
    },
    enabled: !!sellerId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // === SYNC PIPELINE (background, non-blocking) ===

  // Phase 1: Sync orders
  const syncOrders = useCallback(async (): Promise<{ orderIds: string[]; shipmentIds: string[] }> => {
    if (!sellerId) return { orderIds: [], shipmentIds: [] };

    const headers = await getAuthHeaders();
    if (!headers) throw new Error('Not authenticated');

    const { dateFrom, dateTo } = getDateRange();

    setSyncPhase('orders');
    setSyncProgress('Buscando pedidos...');

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
      .select('order_id, shipment_id, order_status')
      .eq('seller_id', sellerId)
      .gte('created_at_meli', dateFrom)
      .not('order_status', 'in', `(${COMPLETED_ORDER_STATUSES.join(',')})`);

    const orderIds = (ordersWithShipments || []).map(o => o.order_id);
    const shipmentIds = (ordersWithShipments || [])
      .map(o => o.shipment_id)
      .filter(Boolean) as string[];

    setSyncProgress(`${orderIds.length} pedidos`);
    
    await sleep(100);

    return { orderIds, shipmentIds: [...new Set(shipmentIds)] };
  }, [sellerId, getDateRange]);

  // Phase 2: Sync shipments - send ALL at once to edge function
  const syncShipments = useCallback(async (shipmentIds: string[]): Promise<void> => {
    if (!sellerId || shipmentIds.length === 0) return;

    const headers = await getAuthHeaders();
    if (!headers) throw new Error('Not authenticated');

    setSyncPhase('shipments');
    setSyncProgress(`Atualizando ${shipmentIds.length} envios...`);

    // Send ALL shipment IDs at once - edge function handles batching internally
    const response = await supabase.functions.invoke('ml-sync-shipments', {
      headers,
      body: {
        seller_id: sellerId,
        shipment_ids: shipmentIds,
      },
    });

    if (response.error) {
      console.error('Shipments sync error:', response.error);
    } else {
      console.log(`Shipments synced:`, response.data);
      setSyncProgress(`${response.data?.synced || 0} envios atualizados`);
    }

    // Refresh UI
    await refetch();
  }, [sellerId, refetch]);

  // Phase 3: Sync invoices - send ALL at once to edge function
  const syncInvoices = useCallback(async (orderIds: string[]): Promise<void> => {
    if (!sellerId || orderIds.length === 0) return;

    const headers = await getAuthHeaders();
    if (!headers) throw new Error('Not authenticated');

    setSyncPhase('invoices');
    setSyncProgress(`Atualizando ${orderIds.length} NFs...`);

    // Send ALL order IDs at once - edge function handles batching internally
    const response = await supabase.functions.invoke('ml-sync-invoices', {
      headers,
      body: {
        seller_id: sellerId,
        order_ids: orderIds,
      },
    });

    if (response.error) {
      console.error('Invoices sync error:', response.error);
    } else {
      console.log(`Invoices synced:`, response.data);
      setSyncProgress(`${response.data?.synced || 0} NFs atualizadas`);
    }

    // Refresh UI
    await refetch();
  }, [sellerId, refetch]);

  // Main sync pipeline (non-blocking)
  const startSyncPipeline = useCallback(async () => {
    // Prevent concurrent syncs and spam (5 second debounce)
    const now = Date.now();
    if (isSyncing || (now - lastSyncTimeRef.current) < 5000) {
      console.log('Sync skipped: already syncing or debounced');
      return;
    }

    lastSyncTimeRef.current = now;
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
      setSyncProgress('Concluído');
      setLastSyncAt(new Date().toISOString());

      // Final refresh
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['shipping-orders'] });

      toast({
        title: 'Sincronização concluída',
        description: `${orderIds.length} pedidos atualizados`,
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

  // Calculate status counts from the current orders (already deduped)
  // We need a separate query for counts that doesn't apply statusFilter
  const { data: allOrdersForCounts = [] } = useQuery({
    queryKey: ['shipping-orders-all', sellerId, periodFilter],
    queryFn: async () => {
      if (!sellerId) return [];

      const { dateFrom } = getDateRange();

      // Get all orders for counting - exclude cancelled
      const { data: ordersData } = await supabase
        .from('meli_orders_cache')
        .select('order_id, shipment_id')
        .eq('seller_id', sellerId)
        .gte('created_at_meli', dateFrom)
        .not('order_status', 'in', `(${COMPLETED_ORDER_STATUSES.join(',')})`);

      if (!ordersData || ordersData.length === 0) return [];

      const shipmentIds = ordersData.map(o => o.shipment_id).filter(Boolean) as string[];

      const shipmentsResult = shipmentIds.length > 0
        ? await supabase.from('meli_shipments_cache').select('shipment_id, label_available, shipment_status, shipment_substatus, logistic_type').eq('seller_id', sellerId).in('shipment_id', shipmentIds)
        : { data: [] };

      const shipmentsMap = new Map((shipmentsResult.data || []).map(s => [s.shipment_id, s]));

      // Build list with deduplication by shipment_id and priority
      const groupedByShipment = new Map<string, { finalStatus: string; priority: number }>();
      
      ordersData.forEach(o => {
        const shipment = o.shipment_id ? shipmentsMap.get(o.shipment_id) : null;
        
        // Skip if no shipment
        if (!shipment || !o.shipment_id) return;

        const substatus = shipment.shipment_substatus;
        const labelAvailable = shipment.label_available ?? false;
        const logisticType = shipment.logistic_type;
        const shipmentStatus = shipment.shipment_status;

        let finalStatus: string;

        // FULL logistics
        if (logisticType && FULL_LOGISTIC_TYPES.includes(logisticType)) {
          finalStatus = 'full';
        }
        // Already shipped/delivered
        else if (shipmentStatus && COMPLETED_SHIPMENT_STATUSES.includes(shipmentStatus)) {
          finalStatus = 'enviado';
        }
        // Already printed
        else if (substatus === 'printed') {
          finalStatus = 'reimprimir';
        }
        // Invoice pending
        else if (substatus === 'invoice_pending') {
          finalStatus = 'aguardando_nf';
        }
        // Ready to print
        else if (substatus === 'ready_to_print' && labelAvailable) {
          finalStatus = 'pronta';
        }
        // Other
        else {
          finalStatus = 'outros';
        }

        const priority = STATUS_PRIORITY[finalStatus] || 99;
        const existing = groupedByShipment.get(o.shipment_id);
        
        if (!existing || priority < existing.priority) {
          groupedByShipment.set(o.shipment_id, { finalStatus, priority });
        }
      });

      return Array.from(groupedByShipment.values());
    },
    enabled: !!sellerId,
    staleTime: 30000,
  });

  const statusCounts = {
    all: allOrdersForCounts.length,
    pronta: allOrdersForCounts.filter(o => o.finalStatus === 'pronta').length,
    aguardando_nf: allOrdersForCounts.filter(o => o.finalStatus === 'aguardando_nf').length,
    reimprimir: allOrdersForCounts.filter(o => o.finalStatus === 'reimprimir').length,
  };

  // Auto-sync on first load when sellerId is available
  useEffect(() => {
    if (sellerId && !hasAutoSyncedRef.current && !isSyncing) {
      hasAutoSyncedRef.current = true;
      // Small delay to let the UI render first
      const timer = setTimeout(() => {
        startSyncPipeline();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [sellerId, isSyncing, startSyncPipeline]);

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
