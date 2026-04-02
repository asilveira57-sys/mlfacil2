import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay, subDays, subHours } from 'date-fns';
import { toast as sonnerToast } from 'sonner';

/** Check if edge function response indicates trial expired (402) */
function isTrialExpiredResponse(response: { data?: any; error?: any }): boolean {
  const errorBody = response.error?.context?.body || response.error?.message || '';
  const parsed = typeof errorBody === 'string' ? (() => { try { return JSON.parse(errorBody); } catch { return null; } })() : errorBody;
  if (parsed?.error_code === 'TRIAL_EXPIRED') return true;
  if (response.data?.error_code === 'TRIAL_EXPIRED') return true;
  return false;
}

export type FinalStatus = 'pronta' | 'aguardando_nf' | 'reimprimir' | 'full' | 'enviado' | 'outros' | 'pendente_sync' | 'all';
export type PeriodFilter = 'all' | 'today_sales' | 'today' | '7d' | '15d' | '30d' | 'custom';
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
  estimated_handling_limit: string | null;
}

export interface OrderItemSummary {
  item_id: string;
  variation_id: string | null;
  variation_attributes: { name: string; value: string }[] | null;
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
// Max poll attempts removed - now passed as parameter to waitForJob

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
    
    allRows.push(...data); // Accumulate data in array
    
    if (data.length < batchSize) break; // Last page - data already added
    offset += batchSize;
  }
  
  return allRows;
}

export function useShippingLabels({ sellerId }: UseShippingLabelsOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState<FinalStatus>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('7d'); // Default: 7 days to include pending shipments from previous days
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
        // Cap to 30 days max — shipping labels only deal with recent open orders
        dateFrom = startOfDay(subDays(nowBrasilia, 30));
        dateTo = endOfDay(nowBrasilia);
        break;
      case 'today_sales': {
        // "Hoje" (vendas) - filter by created_at_meli of current day
        const todayStart = startOfDay(nowBrasilia);
        const todayEnd = endOfDay(nowBrasilia);
        return {
          dateFrom: fromZonedTime(todayStart, BRASILIA_TZ).toISOString(),
          dateTo: fromZonedTime(todayEnd, BRASILIA_TZ).toISOString(),
        };
      }
      case 'today':
        // "Envios de hoje" - handled by p_period_type='today_dispatch' in RPC
        // No date range needed, RPC filters by estimated_handling_limit
        return { dateFrom: null, dateTo: null };

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
      if (!sellerId) return { orders: [], totalCount: 0, statusCounts: { all: 0, pronta: 0, aguardando_nf: 0, reimprimir: 0 } };

      const { dateFrom, dateTo } = getDateRange();

      const { data, error } = await supabase.rpc('get_shipping_orders', {
        p_seller_id: sellerId,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_status_filter: statusFilter,
        p_search_query: searchQuery.trim(),
        p_sort_field: sortField,
        p_sort_dir: sortDirection,
        p_page: currentPage,
        p_page_size: PAGE_SIZE,
        p_period_type: periodFilter === 'today' ? 'today_dispatch' : 'date_range',
      } as any);

      if (error) {
        console.error('RPC get_shipping_orders error:', error);
        return { orders: [], totalCount: 0, statusCounts: { all: 0, pronta: 0, aguardando_nf: 0, reimprimir: 0 } };
      }

      const result = data as unknown as {
        orders: ShippingOrder[];
        total_count: number;
        status_counts: { all: number; pronta: number; aguardando_nf: number; reimprimir: number };
      };

      return {
        orders: result.orders || [],
        totalCount: result.total_count || 0,
        statusCounts: result.status_counts || { all: 0, pronta: 0, aguardando_nf: 0, reimprimir: 0 },
      };
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
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
        .select('order_id, item_id, variation_id, variation_attributes, sku, title_short, title, quantity, unit_price, permalink, catalog_product_id, thumbnail')
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
          variation_attributes: (item as any).variation_attributes || null,
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

  // === DIAGNOSTIC INFO - only on demand, not on mount ===
  const updateDiagnosticInfo = useCallback(async () => {
    if (!sellerId) return;
    
    try {
      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30).toISOString();

      // Single query to get count + last date
      const { data: recentOrders, count } = await supabase
        .from('meli_orders_cache')
        .select('shipment_id', { count: 'exact' })
        .eq('seller_id', sellerId)
        .gte('created_at_meli', thirtyDaysAgo)
        .not('shipment_id', 'is', null)
        .limit(1000);

      setDiagnosticInfo({
        lastOrderDate: null,
        missingShipments30d: 0,
        lastShipmentSyncAt: null,
        totalOrders30d: count || 0,
      });
    } catch (err) {
      console.error('Error updating diagnostic info:', err);
    }
  }, [sellerId]);

  // === SYNC PIPELINE (background, silent by default) ===

// Wait for a specific job to complete - tolerant to both old and new schema
  const waitForJob = useCallback(async (jobId: string, silent: boolean, maxAttempts = 22): Promise<boolean> => {
    let attempts = 0;
    let notFoundCount = 0;
    
    while (attempts < maxAttempts) {
      await sleep(2000);
      attempts++;
      
      const { data: job } = await supabase
        .from('sync_jobs')
        .select('status, metadata')
        .eq('id', jobId)
        .maybeSingle();
      
      if (!job) {
        notFoundCount++;
        // Fail-fast: if job not found after 3 attempts, stop waiting
        if (notFoundCount >= 3) {
          console.warn(`Job ${jobId} not found after ${notFoundCount} attempts, skipping wait`);
          return true; // Continue pipeline instead of blocking
        }
        continue;
      }
      
      const meta = (job.metadata as Record<string, unknown>) || {};
      const procRec = (meta.processed_records as number) || 0;
      const totRec = (meta.total_records as number) || 0;
      const status = job.status;
      
      // Accept both old (done) and new (success) completion statuses
      if (status === 'success' || status === 'done') {
        console.log(`Job ${jobId} completed: ${procRec}/${totRec}`);
        return true;
      }
      
      // Accept both old (error) and new (failed/canceled) failure statuses
      if (status === 'failed' || status === 'error' || status === 'canceled') {
        console.error(`Job ${jobId} failed with status: ${status}`);
        return false;
      }
      
      // Update progress
      if (!silent && totRec && procRec) {
        setSyncProgress(`${procRec}/${totRec}`);
      }
    }
    
    console.warn(`Job ${jobId} timed out after ${maxAttempts * 2} seconds`);
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

      // Abort if trial expired
      if (isTrialExpiredResponse(ordersResponse)) {
        sonnerToast.error('Seu período de teste expirou. Assine um plano para continuar sincronizando.', { id: 'trial-expired' });
        setIsSyncing(false);
        setSyncPhase('idle');
        setSyncProgress('');
        return;
      }

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
          
          if (isTrialExpiredResponse(shipmentsResponse)) {
            throw new Error('TRIAL_EXPIRED');
          }
          
          if (shipmentsResponse.data?.job_id) {
            await waitForJob(shipmentsResponse.data.job_id, silent);
          }
          
          // Small delay between batches
          if (i + SHIPMENT_SYNC_BATCH < missingShipmentIds.length) {
            await sleep(500);
          }
        }
      }

      // === PHASE 4.5: Re-check active shipments for status changes ===
      // This catches cases where labels were printed in ML but cache is stale
      if (!silent) {
        setSyncProgress('Atualizando status...');
      }

      // Get active shipment IDs that might have changed status
      const { data: activeShipments } = await supabase
        .from('meli_shipments_cache')
        .select('shipment_id')
        .eq('seller_id', sellerId)
        .in('shipment_status', ['ready_to_ship', 'handling', 'pending'])
        .order('last_sync_at', { ascending: true })
        .limit(150); // Check oldest-synced active shipments including pending

      const activeIds = (activeShipments || []).map(s => s.shipment_id);
      console.log(`Phase 4.5: Re-checking ${activeIds.length} active shipments for status changes`);

      if (activeIds.length > 0) {
        // Send in batches
        for (let i = 0; i < activeIds.length; i += SHIPMENT_SYNC_BATCH) {
          const batch = activeIds.slice(i, i + SHIPMENT_SYNC_BATCH);
          const resp = await supabase.functions.invoke('ml-sync-shipments', {
            headers,
            body: { seller_id: sellerId, shipment_ids: batch },
          });
          
          if (isTrialExpiredResponse(resp)) {
            throw new Error('TRIAL_EXPIRED');
          }
          if (resp.data?.job_id) {
            await waitForJob(resp.data.job_id, silent);
          }
          if (i + SHIPMENT_SYNC_BATCH < activeIds.length) {
            await sleep(500);
          }
        }
      }

      // === PHASE 5: Sync invoices ONLY for orders missing invoice data ===
      if (!silent) {
        setSyncPhase('invoices');
        setSyncProgress('Sincronizando notas fiscais...');
      }

      if (orderIds.length > 0) {
        // Only fetch invoices for orders that don't have invoice data in invoices cache
        const { data: existingInvoices } = await supabase
          .from('meli_invoices_cache')
          .select('order_id')
          .eq('seller_id', sellerId)
          .in('order_id', orderIds);

        const invoicedOrderIds = new Set((existingInvoices || []).map(i => i.order_id));
        const ordersWithoutInvoice = orderIds
          .filter(id => !invoicedOrderIds.has(id))
          .map(order_id => ({ order_id }));

        const pendingInvoiceIds = ordersWithoutInvoice.map(o => o.order_id);
        console.log(`Invoices: ${orderIds.length} total orders, ${pendingInvoiceIds.length} missing invoice`);

        if (pendingInvoiceIds.length > 0) {
          const totalInvoiceBatches = Math.ceil(pendingInvoiceIds.length / INVOICE_SYNC_BATCH);
          
          for (let i = 0; i < pendingInvoiceIds.length; i += INVOICE_SYNC_BATCH) {
            const batchNum = Math.floor(i / INVOICE_SYNC_BATCH) + 1;
            const batch = pendingInvoiceIds.slice(i, i + INVOICE_SYNC_BATCH);
            
            if (!silent && totalInvoiceBatches > 1) {
              setSyncProgress(`NFs ${batchNum}/${totalInvoiceBatches}`);
            }
            
            const invoicesResponse = await supabase.functions.invoke('ml-sync-invoices', {
              headers,
              body: { seller_id: sellerId, order_ids: batch },
            });
            
            if (isTrialExpiredResponse(invoicesResponse)) {
              throw new Error('TRIAL_EXPIRED');
            }
            
            if (invoicesResponse.data?.job_id) {
              await waitForJob(invoicesResponse.data.job_id, silent);
            }
            
            if (i + INVOICE_SYNC_BATCH < pendingInvoiceIds.length) {
              await sleep(300);
            }
          }
        }
      }

      // === PHASE 6: Complete ===
      setLastSyncAt(new Date().toISOString());
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['shipping-orders'] });
      queryClient.invalidateQueries({ queryKey: ['shipping-orders-all'] });

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
  }, [isSyncing, sellerId, getDateRange, refetch, queryClient, toast, waitForJob]);

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
  }, [isSyncing, sellerId, refetch, toast, waitForJob]);

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

        // Block mixed Flex + Coleta in same file
        const hasFlex = selectedOrders.some(o => o.logistic_type === 'self_service');
        const hasColeta = selectedOrders.some(o => o.logistic_type && o.logistic_type !== 'self_service' && o.logistic_type !== 'fulfillment');
        if (hasFlex && hasColeta) {
          throw new Error('Não é possível gerar etiquetas de Flex e Coleta no mesmo arquivo. Filtre por tipo de logística e gere separadamente.');
        }

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
      if (!response.data.success) {
        // Show specific validation errors if available
        const validationErrors = response.data.validationErrors as Array<{ shipment_id: string; reason: string }> | undefined;
        if (validationErrors && validationErrors.length > 0) {
          const reasons = [...new Set(validationErrors.map((e: { reason: string }) => e.reason))];
          throw new Error(`${validationErrors.length} envio(s) inválido(s): ${reasons.join('; ')}`);
        }
        throw new Error(response.data.message || 'Erro ao gerar etiquetas');
      }

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

  // Status counts come directly from the RPC result
  const statusCounts = ordersData?.statusCounts ?? {
    all: 0,
    pronta: 0,
    aguardando_nf: 0,
    reimprimir: 0,
  };

  // === SILENT AUTO-REFRESH: Update shipment statuses every 5 minutes ===
  const refreshShipmentStatuses = useCallback(async () => {
    if (!sellerId || isSyncing) return;

    try {
      // Query only active shipments (status that can change) from local DB
      const { data: activeShipments } = await supabase
        .from('meli_shipments_cache')
        .select('shipment_id')
        .eq('seller_id', sellerId)
        .in('shipment_status', ['ready_to_ship', 'handling', 'pending']);

      if (!activeShipments || activeShipments.length === 0) return;

      console.log(`[auto-refresh] Found ${activeShipments.length} active shipments, refreshing from DB...`);

      // Just refetch from local DB (backend cron/webhook keeps it updated)
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['shipping-orders-all', sellerId] });
    } catch (err) {
      console.error('[auto-refresh] Error:', err);
    }
  }, [sellerId, isSyncing, refetch, queryClient]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!sellerId) return;
    const interval = setInterval(refreshShipmentStatuses, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [sellerId, refreshShipmentStatuses]);

  // Auto-sync on first load: only fetch last sync time, skip heavy pipeline
  // The server-side cron (shipping-labels-sync) handles the heavy sync now
  useEffect(() => {
    if (!sellerId || hasAutoSyncedRef.current) return;
    
    hasAutoSyncedRef.current = true;
    
    const checkLastSync = async () => {
      // Check last sync from scheduler (cron job)
      const { data: scheduler } = await supabase
        .from('sync_scheduler')
        .select('last_run_at')
        .eq('job_name', 'shipping-labels-sync')
        .maybeSingle();
      
      if (scheduler?.last_run_at) {
        setLastSyncAt(scheduler.last_run_at);
      } else {
        // Fallback: check sync_jobs
        const { data: lastJob } = await supabase
          .from('sync_jobs')
          .select('created_at')
          .eq('module', 'labels_orders_list')
          .eq('status', 'success')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        setLastSyncAt(lastJob?.created_at || null);
        
        // If never synced at all, trigger manual sync for first-time setup
        if (!lastJob?.created_at) {
          startSyncPipeline(false);
        }
      }
    };
    
    const timer = setTimeout(checkLastSync, 300);
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
