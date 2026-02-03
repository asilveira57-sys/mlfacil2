import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay, subDays, subHours } from 'date-fns';

export type FinalStatus = 'pronta' | 'aguardando_nf' | 'reimprimir' | 'full' | 'enviado' | 'outros' | 'pendente_sync' | 'all';
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
  permalink: string | null;
  catalog_product_id: string | null;
  thumbnail: string | null;
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

export interface DiagnosticInfo {
  lastOrderDate: string | null;
  missingShipments30d: number;
  lastShipmentSyncAt: string | null;
  totalOrders30d: number;
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
// For sync operations: limit per batch query to avoid timeouts
const SYNC_QUERY_BATCH = 1000;
// Batch size for shipment sync requests to edge function
const SHIPMENT_SYNC_BATCH = 200;
// Batch size for invoice sync requests
const INVOICE_SYNC_BATCH = 300;
// Max poll attempts (2 min timeout)
const MAX_POLL_ATTEMPTS = 60;

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
  pendente_sync: 4,
  full: 5,
  enviado: 6,
  outros: 7,
};

/**
 * Fetch all rows using pagination to bypass Supabase's 1000 row limit
 */
async function fetchAllRowsPaginated<T>(
  queryFn: (offset: number, limit: number) => Promise<{ data: T[] | null; error: Error | null }>,
  batchSize: number = SYNC_QUERY_BATCH
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  
  while (true) {
    const { data, error } = await queryFn(offset, batchSize);
    
    if (error) {
      console.error('Pagination query error:', error);
      break;
    }
    
    if (!data || data.length === 0) break;
    
    if (data.length < batchSize) break; // Last page
    offset += batchSize;
  }
  
  return allRows;
}

export function useShippingLabels({ sellerId }: UseShippingLabelsOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState<FinalStatus>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30d'); // Default: 30 days for performance
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
  const [diagnosticInfo, setDiagnosticInfo] = useState<DiagnosticInfo>({
    lastOrderDate: null,
    missingShipments30d: 0,
    lastShipmentSyncAt: null,
    totalOrders30d: 0,
  });
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
        // For "all", default to last 30 days for performance
        dateFrom = startOfDay(subDays(nowBrasilia, 30));
        dateTo = endOfDay(nowBrasilia);
        break;
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
  // IMPORTANT: Now shows orders even without shipment cache (pendente_sync status)
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['shipping-orders', sellerId, statusFilter, periodFilter, customDateRange, currentPage, searchQuery, sortField, sortDirection],
    queryFn: async () => {
      if (!sellerId) return { orders: [], totalCount: 0 };

      const { dateFrom, dateTo } = getDateRange();

      // Build base query - exclude cancelled, order by recent first
      let query = supabase
        .from('meli_orders_cache')
        .select('*', { count: 'exact' })
        .eq('seller_id', sellerId)
        .not('order_status', 'in', `(${COMPLETED_ORDER_STATUSES.join(',')})`)
        .order('created_at_meli', { ascending: false });

      // Apply date filters
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

      // Step 3: Fetch shipments and invoices in batches to avoid URL length limits
      const BATCH_SIZE = 100;
      
      // Fetch shipments in batches
      const shipmentsData: Array<Record<string, unknown>> = [];
      for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
        const batchIds = shipmentIds.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from('meli_shipments_cache')
          .select('*')
          .eq('seller_id', sellerId)
          .in('shipment_id', batchIds);
        
        if (error) {
          console.error('Error fetching shipments:', error);
          continue;
        }
        if (data) shipmentsData.push(...data);
      }

      // Fetch invoices in batches
      const invoicesData: Array<Record<string, unknown>> = [];
      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batchIds = orderIds.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from('meli_invoices_cache')
          .select('*')
          .eq('seller_id', sellerId)
          .in('order_id', batchIds);
        
        if (error) {
          console.error('Error fetching invoices:', error);
          continue;
        }
        if (data) invoicesData.push(...data);
      }

      const shipmentsMap = new Map(
        shipmentsData.map(s => [s.shipment_id as string, s])
      );
      const invoicesMap = new Map(
        invoicesData.map(i => [i.order_id as string, i])
      );

      // Step 4: Build combined view - INCLUDE orders even without shipment cache
      const combinedOrders: ShippingOrder[] = ordersRaw
        .map(order => {
          const shipment = order.shipment_id ? shipmentsMap.get(order.shipment_id) : null;
          const invoice = invoicesMap.get(order.order_id);

          // Calculate final_status
          let finalStatus: string;
          let selectable = false;

          // If no shipment data in cache yet, show as pending sync
          if (!shipment && order.shipment_id) {
            finalStatus = 'pendente_sync';
            selectable = false;
          } else if (!order.shipment_id) {
            // No shipment ID at all - other status
            finalStatus = 'outros';
            selectable = false;
          } else {
            const logisticType = shipment?.logistic_type as string | null;
            const labelAvailable = (shipment?.label_available as boolean | null) ?? false;
            const substatus = shipment?.shipment_substatus as string | null;
            const shipmentStatus = shipment?.shipment_status as string | null;

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
              selectable = true;
            }
            // Waiting for NF emission at ML
            else if (substatus === 'invoice_pending') {
              finalStatus = 'aguardando_nf';
            }
            // Ready to print (NF already emitted)
            else if (substatus === 'ready_to_print' && labelAvailable) {
              finalStatus = 'pronta';
              selectable = true;
            }
            // Other statuses (in_hub, packed, etc.)
            else {
              finalStatus = 'outros';
            }
          }

          const logisticType = shipment?.logistic_type as string | null ?? null;

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
            shipment_status: (shipment?.shipment_status as string | null) ?? null,
            shipment_substatus: (shipment?.shipment_substatus as string | null) ?? null,
            tracking_number: (shipment?.tracking_number as string | null) ?? null,
            label_available: (shipment?.label_available as boolean | null) ?? false,
            receiver_name: (shipment?.receiver_name as string | null) ?? null,
            shipment_sync_at: (shipment?.last_sync_at as string | null) ?? null,
            invoice_status: (invoice?.invoice_status as string | null) ?? 'pendente',
            invoice_number: (invoice?.invoice_number as string | null) ?? null,
            invoice_key: (invoice?.invoice_key as string | null) ?? null,
            issued_at: (invoice?.issued_at as string | null) ?? null,
            invoice_sync_at: (invoice?.last_sync_at as string | null) ?? null,
            final_status: finalStatus,
            selectable,
            logistic_type: logisticType,
          };
        });

      // Group by shipment_id to handle shopping cart orders (multiple orders = one shipment)
      // Keep the one with higher priority status
      const groupedByShipment = new Map<string, ShippingOrder>();
      combinedOrders.forEach(order => {
        // For orders without shipment_id, use order_id as key
        const key = order.shipment_id || order.order_id;
        
        const existing = groupedByShipment.get(key);
        if (!existing) {
          groupedByShipment.set(key, order);
        } else {
          // Keep the one with higher priority (lower number = higher priority)
          const existingPriority = STATUS_PRIORITY[existing.final_status || ''] || 99;
          const newPriority = STATUS_PRIORITY[order.final_status || ''] || 99;
          if (newPriority < existingPriority) {
            groupedByShipment.set(key, order);
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
        .select('order_id, item_id, variation_id, sku, title_short, title, quantity, unit_price, permalink, catalog_product_id, thumbnail')
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
          permalink: item.permalink,
          catalog_product_id: item.catalog_product_id,
          thumbnail: item.thumbnail,
        });
        itemsMap.set(item.order_id, existing);
      });

      return itemsMap;
    },
    enabled: !!sellerId && orders.length > 0,
    staleTime: 60000, // 1 minute
  });

  const orderItems = orderItemsData ?? new Map<string, OrderItemSummary[]>();

  // === DIAGNOSTIC INFO ===
  const updateDiagnosticInfo = useCallback(async () => {
    if (!sellerId) return;
    
    try {
      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30).toISOString();

      // Get last order date
      const { data: lastOrder } = await supabase
        .from('meli_orders_cache')
        .select('created_at_meli')
        .eq('seller_id', sellerId)
        .order('created_at_meli', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get orders in last 30 days with shipment_id
      const { data: recentOrders } = await supabase
        .from('meli_orders_cache')
        .select('shipment_id')
        .eq('seller_id', sellerId)
        .gte('created_at_meli', thirtyDaysAgo)
        .not('shipment_id', 'is', null);

      const recentShipmentIds = [...new Set((recentOrders || []).map(o => o.shipment_id).filter(Boolean))] as string[];

      // Check how many are in shipments cache (batch query)
      let existingCount = 0;
      const BATCH_SIZE = 200;
      for (let i = 0; i < recentShipmentIds.length; i += BATCH_SIZE) {
        const batch = recentShipmentIds.slice(i, i + BATCH_SIZE);
        const { count } = await supabase
          .from('meli_shipments_cache')
          .select('shipment_id', { count: 'exact', head: true })
          .eq('seller_id', sellerId)
          .in('shipment_id', batch);
        existingCount += count || 0;
      }

      const missingCount = recentShipmentIds.length - existingCount;

      // Get last shipment sync
      const { data: lastShipmentSync } = await supabase
        .from('sync_jobs')
        .select('created_at')
        .eq('seller_id', sellerId)
        .eq('job_type', 'shipments')
        .eq('status', 'done')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setDiagnosticInfo({
        lastOrderDate: lastOrder?.created_at_meli || null,
        missingShipments30d: Math.max(0, missingCount),
        lastShipmentSyncAt: lastShipmentSync?.created_at || null,
        totalOrders30d: recentOrders?.length || 0,
      });
    } catch (err) {
      console.error('Error updating diagnostic info:', err);
    }
  }, [sellerId]);

  // Update diagnostics on mount and after sync
  useEffect(() => {
    if (sellerId) {
      updateDiagnosticInfo();
    }
  }, [sellerId, updateDiagnosticInfo]);

  // === SYNC PIPELINE (background, silent by default) ===

  // Wait for a specific job to complete
  const waitForJob = useCallback(async (jobId: string, silent: boolean): Promise<boolean> => {
    let attempts = 0;
    
    while (attempts < MAX_POLL_ATTEMPTS) {
      await sleep(2000);
      attempts++;
      
      const { data: job } = await supabase
        .from('sync_jobs')
        .select('status, processed_records, total_records')
        .eq('id', jobId)
        .maybeSingle();
      
      if (!job) continue;
      
      if (job.status === 'done') {
        console.log(`Job ${jobId} completed: ${job.processed_records}/${job.total_records}`);
        return true;
      }
      
      if (job.status === 'error') {
        console.error(`Job ${jobId} failed`);
        return false;
      }
      
      // Update progress
      if (!silent && job.total_records && job.processed_records) {
        setSyncProgress(`${job.processed_records}/${job.total_records}`);
      }
    }
    
    console.warn(`Job ${jobId} timed out after ${MAX_POLL_ATTEMPTS * 2} seconds`);
    return false;
  }, []);

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
      setSyncProgress('Sincronizando pedidos...');
    }

    const headers = await getAuthHeaders();
    if (!headers || !sellerId) {
      if (!silent) {
        setIsSyncing(false);
        setSyncPhase('idle');
        setSyncProgress('');
      }
      return;
    }

    try {
      // === PHASE 1: Sync Orders and WAIT for completion ===
      const { dateFrom, dateTo } = getDateRange();
      const ordersResponse = await supabase.functions.invoke('ml-sync-orders', {
        headers,
        body: {
          seller_id: sellerId,
          date_from: dateFrom || subDays(new Date(), 30).toISOString(),
          date_to: dateTo || new Date().toISOString(),
        },
      });

      if (ordersResponse.data?.job_id) {
        if (!silent) setSyncProgress('Aguardando pedidos...');
        await waitForJob(ordersResponse.data.job_id, silent);
      }

      // Refresh UI with new orders
      await refetch();

      // === PHASE 2: Collect shipment_ids using ORDERED + PAGINATED query ===
      if (!silent) {
        setSyncPhase('shipments');
        setSyncProgress('Verificando envios...');
      }

      // Use paginated fetch to get ALL orders (bypass 1000 limit)
      type OrderWithShipment = { order_id: string; shipment_id: string | null; created_at_meli: string | null };
      
      const allOrders = await fetchAllRowsPaginated<OrderWithShipment>(
        async (offset, limit) => {
          const { data, error } = await supabase
            .from('meli_orders_cache')
            .select('order_id, shipment_id, created_at_meli')
            .eq('seller_id', sellerId)
            .not('order_status', 'in', `(cancelled)`)
            .gte('created_at_meli', dateFrom || subDays(new Date(), 30).toISOString())
            .order('created_at_meli', { ascending: false })
            .range(offset, offset + limit - 1);
          return { data: data as OrderWithShipment[] | null, error };
        }
      );

      const orderIds = allOrders.map(o => o.order_id);
      const allShipmentIds = [...new Set(allOrders.map(o => o.shipment_id).filter(Boolean))] as string[];

      console.log(`Fetched ${allOrders.length} orders with ${allShipmentIds.length} unique shipment IDs`);

      // === PHASE 3: Find MISSING shipments using batched verification ===
      const existingShipmentSet = new Set<string>();
      const VERIFY_BATCH = 200;
      
      for (let i = 0; i < allShipmentIds.length; i += VERIFY_BATCH) {
        const batch = allShipmentIds.slice(i, i + VERIFY_BATCH);
        const { data: existing } = await supabase
          .from('meli_shipments_cache')
          .select('shipment_id')
          .eq('seller_id', sellerId)
          .in('shipment_id', batch);
        
        (existing || []).forEach(s => existingShipmentSet.add(s.shipment_id));
      }

      const missingShipmentIds = allShipmentIds.filter(id => !existingShipmentSet.has(id));
      console.log(`Shipments: ${allShipmentIds.length} total, ${existingShipmentSet.size} cached, ${missingShipmentIds.length} missing`);

      // === PHASE 4: Sync MISSING shipments in batches with progress ===
      if (missingShipmentIds.length > 0) {
        const totalBatches = Math.ceil(missingShipmentIds.length / SHIPMENT_SYNC_BATCH);
        
        for (let i = 0; i < missingShipmentIds.length; i += SHIPMENT_SYNC_BATCH) {
          const batchNum = Math.floor(i / SHIPMENT_SYNC_BATCH) + 1;
          const batch = missingShipmentIds.slice(i, i + SHIPMENT_SYNC_BATCH);
          
          if (!silent) {
            setSyncProgress(`Envios ${batchNum}/${totalBatches} (${batch.length} itens)`);
          }
          
          const shipmentsResponse = await supabase.functions.invoke('ml-sync-shipments', {
            headers,
            body: { seller_id: sellerId, shipment_ids: batch },
          });
          
          if (shipmentsResponse.data?.job_id) {
            await waitForJob(shipmentsResponse.data.job_id, silent);
          }
          
          // Small delay between batches
          if (i + SHIPMENT_SYNC_BATCH < missingShipmentIds.length) {
            await sleep(500);
          }
        }
      }

      // === PHASE 5: Sync invoices in batches ===
      if (!silent) {
        setSyncPhase('invoices');
        setSyncProgress('Sincronizando notas fiscais...');
      }

      if (orderIds.length > 0) {
        const totalInvoiceBatches = Math.ceil(orderIds.length / INVOICE_SYNC_BATCH);
        
        for (let i = 0; i < orderIds.length; i += INVOICE_SYNC_BATCH) {
          const batchNum = Math.floor(i / INVOICE_SYNC_BATCH) + 1;
          const batch = orderIds.slice(i, i + INVOICE_SYNC_BATCH);
          
          if (!silent && totalInvoiceBatches > 1) {
            setSyncProgress(`NFs ${batchNum}/${totalInvoiceBatches}`);
          }
          
          const invoicesResponse = await supabase.functions.invoke('ml-sync-invoices', {
            headers,
            body: { seller_id: sellerId, order_ids: batch },
          });
          
          if (invoicesResponse.data?.job_id) {
            await waitForJob(invoicesResponse.data.job_id, silent);
          }
          
          // Small delay between batches
          if (i + INVOICE_SYNC_BATCH < orderIds.length) {
            await sleep(300);
          }
        }
      }

      // === PHASE 6: Complete ===
      setLastSyncAt(new Date().toISOString());
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['shipping-orders'] });
      queryClient.invalidateQueries({ queryKey: ['shipping-orders-all'] });
      await updateDiagnosticInfo();

      if (!silent) {
        setSyncPhase('done');
        setSyncProgress('Concluído!');
        setTimeout(() => {
          setIsSyncing(false);
          setSyncPhase('idle');
          setSyncProgress('');
        }, 1500);
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
        setSyncProgress('');
      }
    }
  }, [isSyncing, sellerId, getDateRange, refetch, queryClient, toast, waitForJob, updateDiagnosticInfo]);

  // Repair sync: force sync of all missing shipments (last 30 days)
  const repairSync = useCallback(async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setSyncPhase('shipments');
    setSyncProgress('Reparando envios faltantes...');
    
    const headers = await getAuthHeaders();
    if (!headers || !sellerId) {
      setIsSyncing(false);
      setSyncPhase('idle');
      setSyncProgress('');
      return;
    }

    try {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      
      // Get all orders with shipment_id from last 30 days
      type OrderWithShipment = { shipment_id: string | null };
      const allOrders = await fetchAllRowsPaginated<OrderWithShipment>(
        async (offset, limit) => {
          const { data, error } = await supabase
            .from('meli_orders_cache')
            .select('shipment_id')
            .eq('seller_id', sellerId)
            .gte('created_at_meli', thirtyDaysAgo)
            .not('shipment_id', 'is', null)
            .order('created_at_meli', { ascending: false })
            .range(offset, offset + limit - 1);
          return { data: data as OrderWithShipment[] | null, error };
        }
      );

      const allShipmentIds = [...new Set(allOrders.map(o => o.shipment_id).filter(Boolean))] as string[];

      // Find missing
      const existingSet = new Set<string>();
      const BATCH = 200;
      for (let i = 0; i < allShipmentIds.length; i += BATCH) {
        const batch = allShipmentIds.slice(i, i + BATCH);
        const { data } = await supabase
          .from('meli_shipments_cache')
          .select('shipment_id')
          .eq('seller_id', sellerId)
          .in('shipment_id', batch);
        (data || []).forEach(s => existingSet.add(s.shipment_id));
      }

      const missing = allShipmentIds.filter(id => !existingSet.has(id));
      console.log(`Repair: ${missing.length} shipments missing`);

      if (missing.length === 0) {
        toast({ title: 'Tudo sincronizado!', description: 'Nenhum envio faltando.' });
        setIsSyncing(false);
        setSyncPhase('idle');
        setSyncProgress('');
        return;
      }

      // Sync all missing
      const totalBatches = Math.ceil(missing.length / SHIPMENT_SYNC_BATCH);
      for (let i = 0; i < missing.length; i += SHIPMENT_SYNC_BATCH) {
        const batchNum = Math.floor(i / SHIPMENT_SYNC_BATCH) + 1;
        const batch = missing.slice(i, i + SHIPMENT_SYNC_BATCH);
        
        setSyncProgress(`Reparando ${batchNum}/${totalBatches} (${batch.length} envios)`);
        
        const resp = await supabase.functions.invoke('ml-sync-shipments', {
          headers,
          body: { seller_id: sellerId, shipment_ids: batch },
        });
        
        if (resp.data?.job_id) {
          await waitForJob(resp.data.job_id, false);
        }
        
        if (i + SHIPMENT_SYNC_BATCH < missing.length) {
          await sleep(500);
        }
      }

      setLastSyncAt(new Date().toISOString());
      await refetch();
      await updateDiagnosticInfo();
      
      toast({
        title: 'Reparo concluído!',
        description: `${missing.length} envios sincronizados.`,
      });

      setSyncPhase('done');
      setSyncProgress('');
      setTimeout(() => {
        setIsSyncing(false);
        setSyncPhase('idle');
      }, 1000);

    } catch (error) {
      console.error('Repair error:', error);
      toast({
        title: 'Erro no reparo',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
      setIsSyncing(false);
      setSyncPhase('idle');
      setSyncProgress('');
    }
  }, [isSyncing, sellerId, refetch, toast, waitForJob, updateDiagnosticInfo]);

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
  // FIXED: Use batched queries to avoid truncation
  const { data: allOrdersForCounts = [] } = useQuery({
    queryKey: ['shipping-orders-all', sellerId, periodFilter, customDateRange],
    queryFn: async () => {
      if (!sellerId) return [];

      const { dateFrom, dateTo } = getDateRange();

      // Get orders using pagination to avoid 1000 limit
      type OrderBasic = { order_id: string; shipment_id: string | null };
      const ordersData = await fetchAllRowsPaginated<OrderBasic>(
        async (offset, limit) => {
          let q = supabase
            .from('meli_orders_cache')
            .select('order_id, shipment_id')
            .eq('seller_id', sellerId)
            .not('order_status', 'in', `(${COMPLETED_ORDER_STATUSES.join(',')})`);
          
          if (dateFrom) q = q.gte('created_at_meli', dateFrom);
          if (dateTo) q = q.lte('created_at_meli', dateTo);
          
          const { data, error } = await q
            .order('created_at_meli', { ascending: false })
            .range(offset, offset + limit - 1);
          
          return { data: data as OrderBasic[] | null, error };
        }
      );

      if (ordersData.length === 0) return [];

      const shipmentIds = ordersData.map(o => o.shipment_id).filter(Boolean) as string[];

      // Fetch shipments in batches
      const shipmentsMap = new Map<string, {
        shipment_id: string;
        label_available: boolean | null;
        shipment_status: string | null;
        shipment_substatus: string | null;
        logistic_type: string | null;
      }>();
      
      const BATCH_SIZE = 200;
      for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
        const batch = shipmentIds.slice(i, i + BATCH_SIZE);
        const { data } = await supabase
          .from('meli_shipments_cache')
          .select('shipment_id, label_available, shipment_status, shipment_substatus, logistic_type')
          .eq('seller_id', sellerId)
          .in('shipment_id', batch);
        
        (data || []).forEach(s => shipmentsMap.set(s.shipment_id, s));
      }

      // Build list with deduplication by shipment_id and priority
      const groupedByShipment = new Map<string, { finalStatus: string; priority: number }>();
      
      ordersData.forEach(o => {
        const shipment = o.shipment_id ? shipmentsMap.get(o.shipment_id) : null;
        const key = o.shipment_id || o.order_id;

        let finalStatus: string;

        // If order has shipment_id but not in cache yet
        if (o.shipment_id && !shipment) {
          finalStatus = 'pendente_sync';
        } else if (!o.shipment_id) {
          finalStatus = 'outros';
        } else {
          const substatus = shipment!.shipment_substatus;
          const labelAvailable = shipment!.label_available ?? false;
          const logisticType = shipment!.logistic_type;
          const shipmentStatus = shipment!.shipment_status;

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
        }

        const priority = STATUS_PRIORITY[finalStatus] || 99;
        const existing = groupedByShipment.get(key);
        
        if (!existing || priority < existing.priority) {
          groupedByShipment.set(key, { finalStatus, priority });
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
    repairSync,
    lastSyncAt,
    statusCounts,
    generateLabels: generateLabelsMutation.mutate,
    isGenerating: generateLabelsMutation.isPending,
    generationProgress,
    orderItems,
    diagnosticInfo,
  };
}
