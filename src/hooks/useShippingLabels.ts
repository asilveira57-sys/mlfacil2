import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay, subDays, subHours } from 'date-fns';

export type FinalStatus = 'pronta' | 'aguardando_nf' | 'reimprimir' | 'full' | 'enviado' | 'outros' | 'all';
export type PeriodFilter = 'all' | 'today' | '7d' | '15d' | '30d' | 'custom';
export type SyncPhase = 'idle' | 'orders' | 'shipments' | 'invoices' | 'done';
export type SortField = 'created_at_meli' | 'buyer_nickname' | 'final_status';
export type SortDirection = 'asc' | 'desc';

const BRASILIA_TZ = 'America/Sao_Paulo';

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

export interface OrderItemSummary {
  item_id: string;
  variation_id: string | null;
  sku: string | null;
  title_short: string | null;
  title: string | null;
  quantity: number;
  unit_price: number;
}

export type LabelLayout = 'meli_100x150' | 'mlfacil_100x175_header';

export interface PrintQueueEntry {
  id: string;
  seller_id: string;
  format: string;
  shipment_ids: string[];
  total_labels: number;
  processed_labels: number;
  status: string;
  file_url: string | null;
  zpl_content: string | null;
  error_log: string | null;
  created_at: string;
  batches: BatchInfo[];
}

export interface BatchInfo {
  batch_id: number;
  shipment_ids: string[];
  status: 'pending' | 'processing' | 'retrying' | 'success' | 'error';
  retry_count: number;
  error_message?: string;
}

export interface GenerationProgress {
  status: 'idle' | 'processing' | 'completed' | 'partial' | 'error';
  total_labels: number;
  processed_labels: number;
  total_batches: number;
  completed_batches: number;
  error_batches: number;
  batch_details?: {
    batch_id: number;
    status: string;
    label_count: number;
    retry_count: number;
    error?: string;
  }[];
}

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

interface UseShippingLabelsOptions {
  sellerId: string | null;
}

const INITIAL_GENERATION_PROGRESS: GenerationProgress = {
  status: 'idle',
  total_labels: 0,
  processed_labels: 0,
  total_batches: 0,
  completed_batches: 0,
  error_batches: 0,
};

const PAGE_SIZE = 30;

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
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all'); // Default: sem filtro
  const [customDateRange, setCustomDateRange] = useState<DateRange>({ from: null, to: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at_meli');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>(INITIAL_GENERATION_PROGRESS);
  const syncAbortRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(0);
  const hasAutoSyncedRef = useRef(false);
  const isSilentSyncRef = useRef(false);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, periodFilter, customDateRange, searchQuery, sortField, sortDirection]);

  // Calculate date range with Brasília timezone
  const getDateRange = useCallback((): { dateFrom: string | null; dateTo: string | null } => {
    const now = new Date();
    const nowBrasilia = toZonedTime(now, BRASILIA_TZ);
    
    let dateFrom: Date | null = null;
    let dateTo: Date | null = null;
    
    switch (periodFilter) {
      case 'all':
        // No date filter
        return { dateFrom: null, dateTo: null };
      case 'today':
        // Últimas 24 horas (rolling window)
        dateFrom = subHours(now, 24);
        dateTo = now;
        break;
      case '7d':
        dateFrom = startOfDay(subDays(nowBrasilia, 7));
        dateTo = endOfDay(nowBrasilia);
        break;
      case '15d':
        dateFrom = startOfDay(subDays(nowBrasilia, 15));
        dateTo = endOfDay(nowBrasilia);
        break;
      case '30d':
        dateFrom = startOfDay(subDays(nowBrasilia, 30));
        dateTo = endOfDay(nowBrasilia);
        break;
      case 'custom':
        if (customDateRange.from) {
          // Convert to Brasília time at start of day
          dateFrom = fromZonedTime(startOfDay(customDateRange.from), BRASILIA_TZ);
        }
        if (customDateRange.to) {
          // Convert to Brasília time at end of day
          dateTo = fromZonedTime(endOfDay(customDateRange.to), BRASILIA_TZ);
        }
        break;
    }
    
    return {
      dateFrom: dateFrom ? dateFrom.toISOString() : null,
      dateTo: dateTo ? dateTo.toISOString() : null,
    };
  }, [periodFilter, customDateRange]);

  // FAST LOAD: Query local cache with joins - with pagination
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['shipping-orders', sellerId, statusFilter, periodFilter, customDateRange, currentPage, searchQuery, sortField, sortDirection],
    queryFn: async () => {
      if (!sellerId) return { orders: [], totalCount: 0 };

      const { dateFrom, dateTo } = getDateRange();

      // Build base query - exclude cancelled
      let query = supabase
        .from('meli_orders_cache')
        .select('*', { count: 'exact' })
        .eq('seller_id', sellerId)
        .not('order_status', 'in', `(${COMPLETED_ORDER_STATUSES.join(',')})`)
        .order('created_at_meli', { ascending: false });

      // Apply date filters if set
      if (dateFrom) {
        query = query.gte('created_at_meli', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at_meli', dateTo);
      }

      const { data: ordersRaw, error: ordersError, count } = await query;

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        throw ordersError;
      }

      if (!ordersRaw || ordersRaw.length === 0) {
        return { orders: [], totalCount: 0 };
      }

      // Step 2: Get shipment_ids and order_ids for joins
      const shipmentIds = ordersRaw
        .map(o => o.shipment_id)
        .filter(Boolean) as string[];
      const orderIds = ordersRaw.map(o => o.order_id);

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
      const combinedOrders: ShippingOrder[] = ordersRaw
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

          // Selectable for bulk printing: pronta (new) or reimprimir (reprint)
          const selectable = finalStatus === 'pronta' || finalStatus === 'reimprimir';

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

      let uniqueOrders = Array.from(groupedByShipment.values());

      // Apply status filter - "all" shows everything
      if (statusFilter !== 'all') {
        uniqueOrders = uniqueOrders.filter(o => o.final_status === statusFilter);
      }

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        uniqueOrders = uniqueOrders.filter(o => 
          o.order_id.toLowerCase().includes(query) ||
          o.buyer_nickname?.toLowerCase().includes(query) ||
          o.shipment_id?.toLowerCase().includes(query) ||
          o.receiver_name?.toLowerCase().includes(query)
        );
      }

      // Apply sorting
      uniqueOrders.sort((a, b) => {
        let comparison = 0;
        
        if (sortField === 'created_at_meli') {
          const dateA = a.created_at_meli ? new Date(a.created_at_meli).getTime() : 0;
          const dateB = b.created_at_meli ? new Date(b.created_at_meli).getTime() : 0;
          comparison = dateA - dateB;
        } else if (sortField === 'buyer_nickname') {
          const nameA = (a.buyer_nickname || '').toLowerCase();
          const nameB = (b.buyer_nickname || '').toLowerCase();
          comparison = nameA.localeCompare(nameB);
        } else if (sortField === 'final_status') {
          const priorityA = STATUS_PRIORITY[a.final_status || ''] || 99;
          const priorityB = STATUS_PRIORITY[b.final_status || ''] || 99;
          comparison = priorityA - priorityB;
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
      });

      const totalCount = uniqueOrders.length;

      // Apply pagination
      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const paginatedOrders = uniqueOrders.slice(startIndex, startIndex + PAGE_SIZE);

      return { orders: paginatedOrders, totalCount };
    },
    enabled: !!sellerId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  const orders = ordersData?.orders ?? [];
  const totalCount = ordersData?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch order items for displayed orders
  const { data: orderItemsData } = useQuery({
    queryKey: ['order-items', sellerId, orders.map(o => o.order_id).join(',')],
    queryFn: async () => {
      if (!sellerId || orders.length === 0) return new Map<string, OrderItemSummary[]>();

      const orderIds = orders.map(o => o.order_id);
      
      const { data: items, error } = await supabase
        .from('meli_order_items_cache')
        .select('order_id, item_id, variation_id, sku, title_short, title, quantity, unit_price')
        .eq('seller_id', sellerId)
        .in('order_id', orderIds);

      if (error) {
        console.error('Error fetching order items:', error);
        return new Map<string, OrderItemSummary[]>();
      }

      // Group items by order_id
      const itemsMap = new Map<string, OrderItemSummary[]>();
      (items || []).forEach(item => {
        const existing = itemsMap.get(item.order_id) || [];
        existing.push({
          item_id: item.item_id,
          variation_id: item.variation_id,
          sku: item.sku,
          title_short: item.title_short,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unit_price,
        });
        itemsMap.set(item.order_id, existing);
      });

      return itemsMap;
    },
    enabled: !!sellerId && orders.length > 0,
    staleTime: 60000, // 1 minute
  });

  const orderItems = orderItemsData ?? new Map<string, OrderItemSummary[]>();

  // === SYNC PIPELINE (background, silent by default) ===

  // Poll for sync job completion (silent mode - no UI updates)
  const pollSyncJobs = useCallback(async (jobIds: string[], silent: boolean) => {
    const maxAttempts = 60; // 2 minutes max
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      await sleep(2000); // Poll every 2 seconds
      attempts++;
      
      const { data: jobs } = await supabase
        .from('sync_jobs')
        .select('id, status, job_type, processed_records, total_records')
        .in('id', jobIds);
      
      if (!jobs) continue;
      
      const allDone = jobs.every(j => j.status === 'done' || j.status === 'error');
      
      if (allDone) {
        console.log('All sync jobs completed (silent:', silent, ')');
        break;
      }
    }
    
    // Refresh UI after all jobs complete
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['shipping-orders'] });
    queryClient.invalidateQueries({ queryKey: ['shipping-orders-all'] });
  }, [refetch, queryClient]);

  // Core sync pipeline - silent mode available
  const startSyncPipeline = useCallback(async (silent = false) => {
    const now = Date.now();
    if (isSyncing || (now - lastSyncTimeRef.current) < 5000) {
      console.log('Sync skipped: already syncing or debounced');
      return;
    }

    lastSyncTimeRef.current = now;
    syncAbortRef.current = false;
    isSilentSyncRef.current = silent;
    
    // Only update UI if not silent
    if (!silent) {
      setIsSyncing(true);
      setSyncPhase('orders');
    }

    const headers = await getAuthHeaders();
    if (!headers || !sellerId) {
      if (!silent) {
        setIsSyncing(false);
        setSyncPhase('idle');
      }
      return;
    }

    const jobIds: string[] = [];

    try {
      // Phase 1: Start orders sync
      const { dateFrom, dateTo } = getDateRange();
      const ordersResponse = await supabase.functions.invoke('ml-sync-orders', {
        headers,
        body: {
          seller_id: sellerId,
          date_from: dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          date_to: dateTo || new Date().toISOString(),
        },
      });

      if (ordersResponse.data?.job_id) {
        jobIds.push(ordersResponse.data.job_id);
      }

      // Wait a bit for orders to start populating
      await sleep(1500);

      // Refresh UI with whatever data exists
      await refetch();

      // Get shipment IDs from cache for next phase
      const { data: ordersWithShipments } = await supabase
        .from('meli_orders_cache')
        .select('order_id, shipment_id')
        .eq('seller_id', sellerId)
        .not('order_status', 'in', `(cancelled)`);

      const orderIds = (ordersWithShipments || []).map(o => o.order_id);
      const shipmentIds = [...new Set((ordersWithShipments || []).map(o => o.shipment_id).filter(Boolean))] as string[];

      if (!silent) {
        setSyncPhase('shipments');
      }

      // Phase 2: Start shipments sync
      if (shipmentIds.length > 0) {
        const shipmentsResponse = await supabase.functions.invoke('ml-sync-shipments', {
          headers,
          body: { seller_id: sellerId, shipment_ids: shipmentIds },
        });
        if (shipmentsResponse.data?.job_id) {
          jobIds.push(shipmentsResponse.data.job_id);
        }
      }

      if (!silent) {
        setSyncPhase('invoices');
      }

      // Phase 3: Start invoices sync
      if (orderIds.length > 0) {
        const invoicesResponse = await supabase.functions.invoke('ml-sync-invoices', {
          headers,
          body: { seller_id: sellerId, order_ids: orderIds },
        });
        if (invoicesResponse.data?.job_id) {
          jobIds.push(invoicesResponse.data.job_id);
        }
      }

      // Poll for completion in background
      if (jobIds.length > 0) {
        pollSyncJobs(jobIds, silent).then(() => {
          setLastSyncAt(new Date().toISOString());
          
          if (!silent) {
            setSyncPhase('done');
            setTimeout(() => {
              setIsSyncing(false);
              setSyncPhase('idle');
            }, 1000);
          }
        });
      } else {
        if (!silent) {
          setIsSyncing(false);
          setSyncPhase('idle');
        }
      }

    } catch (error) {
      console.error('Sync pipeline error:', error);
      if (!silent) {
        toast({
          title: 'Erro na sincronização',
          description: error instanceof Error ? error.message : 'Erro desconhecido',
          variant: 'destructive',
        });
        setIsSyncing(false);
        setSyncPhase('idle');
      }
    }
  }, [isSyncing, sellerId, getDateRange, refetch, queryClient, toast, pollSyncJobs]);

  // Generate labels mutation with batch support
  const generateLabelsMutation = useMutation({
    mutationFn: async ({ format, layout, shipmentId }: { format: 'pdf' | 'zpl'; layout: LabelLayout; shipmentId?: string }) => {
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

      // Set initial progress
      const totalBatches = Math.ceil(shipmentIds.length / 50);
      setGenerationProgress({
        status: 'processing',
        total_labels: shipmentIds.length,
        processed_labels: 0,
        total_batches: totalBatches,
        completed_batches: 0,
        error_batches: 0,
      });

      const response = await supabase.functions.invoke('ml-generate-labels', {
        headers,
        body: {
          seller_id: sellerId,
          shipment_ids: shipmentIds,
          format,
          layout,
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

      // Update progress to completed
      const status = data.error_batches > 0 ? 'partial' : 'completed';
      setGenerationProgress({
        status,
        total_labels: data.total_labels || 0,
        processed_labels: data.total_labels || 0,
        total_batches: data.total_batches || 1,
        completed_batches: data.success_batches || data.total_batches || 1,
        error_batches: data.error_batches || 0,
        batch_details: data.batch_errors?.map((b: { batch_id: number; shipment_ids: string[]; error: string }) => ({
          batch_id: b.batch_id,
          status: 'error',
          label_count: b.shipment_ids.length,
          retry_count: 5,
          error: b.error,
        })),
      });
      
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
          description: `${data.total_labels} etiqueta(s) em ${data.total_batches || 1} lote(s)`,
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
          description: `${data.total_labels} etiqueta(s) em ${data.total_batches || 1} lote(s)`,
        });
      }

      // Show warning if there were partial failures
      if (data.error_batches > 0 && data.batch_errors) {
        toast({
          title: 'Alguns lotes falharam',
          description: `${data.error_batches} lote(s) não foram processados após 5 tentativas`,
          variant: 'destructive',
        });
      }

      // Reset progress after 3 seconds
      setTimeout(() => {
        setGenerationProgress(INITIAL_GENERATION_PROGRESS);
      }, 3000);
    },
    onError: (error) => {
      console.error('Generate labels error:', error);
      setGenerationProgress(prev => ({
        ...prev,
        status: 'error',
      }));
      toast({
        title: 'Erro ao gerar etiquetas',
        description: error.message,
        variant: 'destructive',
      });

      // Reset progress after 3 seconds
      setTimeout(() => {
        setGenerationProgress(INITIAL_GENERATION_PROGRESS);
      }, 3000);
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
    queryKey: ['shipping-orders-all', sellerId, periodFilter, customDateRange],
    queryFn: async () => {
      if (!sellerId) return [];

      const { dateFrom, dateTo } = getDateRange();

      // Get all orders for counting - exclude cancelled
      let query = supabase
        .from('meli_orders_cache')
        .select('order_id, shipment_id')
        .eq('seller_id', sellerId)
        .not('order_status', 'in', `(${COMPLETED_ORDER_STATUSES.join(',')})`);

      if (dateFrom) {
        query = query.gte('created_at_meli', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at_meli', dateTo);
      }

      const { data: ordersData } = await query;

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

  // Auto-sync on first load with staleness check
  useEffect(() => {
    if (!sellerId || hasAutoSyncedRef.current) return;
    
    hasAutoSyncedRef.current = true;
    
    const checkAndSync = async () => {
      // Check last sync from database
      const { data: lastJob } = await supabase
        .from('sync_jobs')
        .select('created_at')
        .eq('seller_id', sellerId)
        .eq('status', 'done')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const lastSync = lastJob?.created_at;
      setLastSyncAt(lastSync || null);
      
      if (!lastSync) {
        // Never synced - do visible sync
        startSyncPipeline(false);
        return;
      }
      
      const staleMinutes = (Date.now() - new Date(lastSync).getTime()) / 60000;
      
      if (staleMinutes > 15) {
        // Very stale - show minimal indicator
        startSyncPipeline(false);
      } else if (staleMinutes > 2) {
        // Slightly stale - silent background sync
        startSyncPipeline(true);
      }
      // else: Fresh data, no sync needed
    };
    
    // Small delay to let UI render first with cached data
    const timer = setTimeout(checkAndSync, 300);
    return () => clearTimeout(timer);
  }, [sellerId, startSyncPipeline]);

  // Set custom date range helper
  const setDateRange = useCallback((range: DateRange) => {
    setCustomDateRange(range);
    if (range.from || range.to) {
      setPeriodFilter('custom');
    }
  }, []);

  // Toggle sort helper
  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  return {
    orders,
    isLoading,
    refetch,
    statusFilter,
    setStatusFilter,
    periodFilter,
    setPeriodFilter,
    customDateRange,
    setDateRange,
    searchQuery,
    setSearchQuery,
    sortField,
    sortDirection,
    toggleSort,
    currentPage,
    setCurrentPage,
    totalCount,
    totalPages,
    pageSize: PAGE_SIZE,
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
    generationProgress,
    orderItems,
  };
}
