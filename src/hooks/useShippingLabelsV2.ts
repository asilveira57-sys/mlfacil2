import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { toast as sonnerToast } from 'sonner';

// Re-export shared types from V1
export type { OrderItemSummary } from '@/hooks/useShippingLabels';
export type { LabelLayout, ShippingOrder, FinalStatus, PeriodFilter, SyncPhase, SortField, SortDirection, DateRange, GenerationProgress } from '@/hooks/useShippingLabels';

import type { ShippingOrder, LabelLayout, FinalStatus, PeriodFilter, SyncPhase, SortField, SortDirection, DateRange, GenerationProgress, OrderItemSummary } from '@/hooks/useShippingLabels';

const BRASILIA_TZ = 'America/Sao_Paulo';
const PAGE_SIZE = 30;
const SHIPMENT_SYNC_BATCH = 200;
const INVOICE_SYNC_BATCH = 300;

const INITIAL_PROGRESS: GenerationProgress = {
  status: 'idle', total_labels: 0, processed_labels: 0,
  total_batches: 0, completed_batches: 0, error_batches: 0,
};

async function getAuthHeaders(): Promise<{ Authorization: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return { Authorization: `Bearer ${session.access_token}` };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function isTrialExpiredResponse(response: { data?: any; error?: any }): boolean {
  const errorBody = response.error?.context?.body || response.error?.message || '';
  const parsed = typeof errorBody === 'string' ? (() => { try { return JSON.parse(errorBody); } catch { return null; } })() : errorBody;
  if (parsed?.error_code === 'TRIAL_EXPIRED') return true;
  if (response.data?.error_code === 'TRIAL_EXPIRED') return true;
  return false;
}

async function fetchAllRowsPaginated<T>(
  queryFn: (offset: number, limit: number) => Promise<{ data: T[] | null; error: Error | null }>,
  batchSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset, batchSize);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }
  return all;
}

interface UseShippingLabelsV2Options {
  sellerId: string | null;
}

export interface PrintJobV2 {
  id: string;
  seller_id: string;
  format: string;
  layout: string;
  shipment_ids: string[];
  total_labels: number;
  processed_labels: number;
  status: string;
  page_width_mm: number | null;
  page_height_mm: number | null;
  total_pages: number | null;
  error_log: string | null;
  download_filename: string | null;
  duration_ms: number | null;
  created_at: string;
}

export function useShippingLabelsV2({ sellerId }: UseShippingLabelsV2Options) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<FinalStatus>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('7d');
  const [customDateRange, setCustomDateRange] = useState<DateRange>({ from: null, to: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at_meli');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const [syncProgress, setSyncProgress] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>(INITIAL_PROGRESS);
  const [isJobGenerating, setIsJobGenerating] = useState(false);
  const lastSyncTimeRef = useRef(0);
  const hasAutoSyncedRef = useRef(false);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, periodFilter, customDateRange, searchQuery, sortField, sortDirection]);

  const getDateRange = useCallback((): { dateFrom: string | null; dateTo: string | null } => {
    const now = new Date();
    const nowBrasilia = toZonedTime(now, BRASILIA_TZ);
    let dateFrom: Date | null = null;
    let dateTo: Date | null = null;
    switch (periodFilter) {
      case 'all': dateFrom = startOfDay(subDays(nowBrasilia, 30)); dateTo = endOfDay(nowBrasilia); break;
      case 'today_sales': return { dateFrom: fromZonedTime(startOfDay(nowBrasilia), BRASILIA_TZ).toISOString(), dateTo: fromZonedTime(endOfDay(nowBrasilia), BRASILIA_TZ).toISOString() };
      case 'today': return { dateFrom: null, dateTo: null };
      case '7d': dateFrom = startOfDay(subDays(nowBrasilia, 7)); dateTo = endOfDay(nowBrasilia); break;
      case '15d': dateFrom = startOfDay(subDays(nowBrasilia, 15)); dateTo = endOfDay(nowBrasilia); break;
      case '30d': dateFrom = startOfDay(subDays(nowBrasilia, 30)); dateTo = endOfDay(nowBrasilia); break;
      case 'custom':
        if (customDateRange.from) dateFrom = fromZonedTime(startOfDay(customDateRange.from), BRASILIA_TZ);
        if (customDateRange.to) dateTo = fromZonedTime(endOfDay(customDateRange.to), BRASILIA_TZ);
        break;
    }
    return { dateFrom: dateFrom?.toISOString() ?? null, dateTo: dateTo?.toISOString() ?? null };
  }, [periodFilter, customDateRange]);

  // Main orders query
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['shipping-orders-v2', sellerId, statusFilter, periodFilter, customDateRange, currentPage, searchQuery, sortField, sortDirection],
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
      if (error) { console.error('V2 RPC error:', error); return { orders: [], totalCount: 0, statusCounts: { all: 0, pronta: 0, aguardando_nf: 0, reimprimir: 0 } }; }
      const result = data as any;
      return { orders: result.orders || [], totalCount: result.total_count || 0, statusCounts: result.status_counts || { all: 0, pronta: 0, aguardando_nf: 0, reimprimir: 0 } };
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
  });

  const orders = ordersData?.orders ?? [];
  const totalCount = ordersData?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const statusCounts = ordersData?.statusCounts ?? { all: 0, pronta: 0, aguardando_nf: 0, reimprimir: 0 };

  // Order items
  const { data: orderItemsData } = useQuery({
    queryKey: ['order-items-v2', sellerId, orders.map((o: ShippingOrder) => o.order_id).join(',')],
    queryFn: async () => {
      if (!sellerId || orders.length === 0) return new Map<string, OrderItemSummary[]>();
      const packShipmentIds = orders.filter((o: ShippingOrder) => o.pack_id && o.shipment_id).map((o: ShippingOrder) => o.shipment_id!);
      let allOrderIds = orders.map((o: ShippingOrder) => o.order_id);
      if (packShipmentIds.length > 0) {
        const { data: siblings } = await supabase.from('meli_orders_cache').select('order_id, shipment_id').eq('seller_id', sellerId).in('shipment_id', packShipmentIds);
        if (siblings) allOrderIds = [...new Set([...allOrderIds, ...siblings.map((s: any) => s.order_id)])];
      }
      const { data: items } = await supabase.from('meli_order_items_cache').select('order_id, item_id, variation_id, variation_attributes, sku, title_short, title, quantity, unit_price, permalink, catalog_product_id, thumbnail').eq('seller_id', sellerId).in('order_id', allOrderIds);
      const rawByOrder = new Map<string, OrderItemSummary[]>();
      (items || []).forEach((item: any) => {
        const arr = rawByOrder.get(item.order_id) || [];
        arr.push({ item_id: item.item_id, variation_id: item.variation_id, variation_attributes: item.variation_attributes, sku: item.sku, title_short: item.title_short, title: item.title, quantity: item.quantity, unit_price: item.unit_price, permalink: item.permalink, catalog_product_id: item.catalog_product_id, thumbnail: item.thumbnail });
        rawByOrder.set(item.order_id, arr);
      });
      // Shipment-to-orders mapping for packs
      const s2o = new Map<string, string[]>();
      for (const o of orders) { if (o.shipment_id) { const e = s2o.get(o.shipment_id) || []; if (!e.includes(o.order_id)) e.push(o.order_id); s2o.set(o.shipment_id, e); } }
      if (packShipmentIds.length > 0) {
        const { data: siblings } = await supabase.from('meli_orders_cache').select('order_id, shipment_id').eq('seller_id', sellerId).in('shipment_id', packShipmentIds);
        for (const s of (siblings || [])) { if (!s.shipment_id) continue; const e = s2o.get(s.shipment_id) || []; if (!e.includes(s.order_id)) e.push(s.order_id); s2o.set(s.shipment_id, e); }
      }
      const result = new Map<string, OrderItemSummary[]>();
      for (const o of orders) {
        if (o.pack_id && o.shipment_id) {
          const sids = s2o.get(o.shipment_id) || [o.order_id];
          const all: OrderItemSummary[] = [];
          for (const oid of sids) all.push(...(rawByOrder.get(oid) || []));
          result.set(o.order_id, all);
        } else {
          result.set(o.order_id, rawByOrder.get(o.order_id) || []);
        }
      }
      return result;
    },
    enabled: !!sellerId && orders.length > 0,
    staleTime: 60000,
  });
  const orderItems = orderItemsData ?? new Map<string, OrderItemSummary[]>();

  // Sync pipeline (reuses V1 edge functions)
  const waitForJob = useCallback(async (jobId: string, silent: boolean, maxAttempts = 22): Promise<boolean> => {
    let attempts = 0;
    let notFound = 0;
    while (attempts < maxAttempts) {
      await sleep(2000); attempts++;
      const { data: job } = await supabase.from('sync_jobs').select('status, metadata').eq('id', jobId).maybeSingle();
      if (!job) { notFound++; if (notFound >= 3) return true; continue; }
      const status = job.status;
      if (status === 'success' || status === 'done') return true;
      if (status === 'failed' || status === 'error' || status === 'canceled') return false;
      if (!silent) { const meta = (job.metadata as any) || {}; if (meta.total_records && meta.processed_records) setSyncProgress(`${meta.processed_records}/${meta.total_records}`); }
    }
    return false;
  }, []);

  const startSyncPipeline = useCallback(async (silent = false) => {
    const now = Date.now();
    if (isSyncing || (now - lastSyncTimeRef.current) < 5000) return;
    lastSyncTimeRef.current = now;
    if (!silent) { setIsSyncing(true); setSyncPhase('orders'); setSyncProgress('Sincronizando pedidos...'); }
    const headers = await getAuthHeaders();
    if (!headers || !sellerId) { if (!silent) { setIsSyncing(false); setSyncPhase('idle'); setSyncProgress(''); } return; }
    try {
      const { dateFrom, dateTo } = getDateRange();
      const ordersResp = await supabase.functions.invoke('ml-sync-orders', { headers, body: { seller_id: sellerId, date_from: dateFrom || subDays(new Date(), 30).toISOString(), date_to: dateTo || new Date().toISOString() } });
      if (isTrialExpiredResponse(ordersResp)) { sonnerToast.error('Período de teste expirou.', { id: 'trial-expired' }); setIsSyncing(false); setSyncPhase('idle'); setSyncProgress(''); return; }
      if (ordersResp.data?.job_id) { if (!silent) setSyncProgress('Aguardando pedidos...'); await waitForJob(ordersResp.data.job_id, silent); }
      await refetch();
      if (!silent) { setSyncPhase('shipments'); setSyncProgress('Verificando envios...'); }
      type OWS = { order_id: string; shipment_id: string | null };
      const allOrders = await fetchAllRowsPaginated<OWS>(async (off, lim) => { const { data, error } = await supabase.from('meli_orders_cache').select('order_id, shipment_id').eq('seller_id', sellerId).not('order_status', 'in', '(cancelled)').gte('created_at_meli', dateFrom || subDays(new Date(), 30).toISOString()).order('created_at_meli', { ascending: false }).range(off, off + lim - 1); return { data: data as OWS[] | null, error }; });
      const orderIds = allOrders.map(o => o.order_id);
      const allShipmentIds = [...new Set(allOrders.map(o => o.shipment_id).filter(Boolean))] as string[];
      const existingSet = new Set<string>();
      for (let i = 0; i < allShipmentIds.length; i += 200) { const batch = allShipmentIds.slice(i, i + 200); const { data: ex } = await supabase.from('meli_shipments_cache').select('shipment_id').eq('seller_id', sellerId).in('shipment_id', batch); (ex || []).forEach((s: any) => existingSet.add(s.shipment_id)); }
      const missing = allShipmentIds.filter(id => !existingSet.has(id));
      if (missing.length > 0) { for (let i = 0; i < missing.length; i += SHIPMENT_SYNC_BATCH) { const batch = missing.slice(i, i + SHIPMENT_SYNC_BATCH); if (!silent) setSyncProgress(`Envios ${Math.floor(i / SHIPMENT_SYNC_BATCH) + 1}/${Math.ceil(missing.length / SHIPMENT_SYNC_BATCH)}`); const r = await supabase.functions.invoke('ml-sync-shipments', { headers, body: { seller_id: sellerId, shipment_ids: batch } }); if (isTrialExpiredResponse(r)) throw new Error('TRIAL_EXPIRED'); if (r.data?.job_id) await waitForJob(r.data.job_id, silent); if (i + SHIPMENT_SYNC_BATCH < missing.length) await sleep(500); } }
      // Re-check active
      if (!silent) setSyncProgress('Atualizando status...');
      const { data: active } = await supabase.from('meli_shipments_cache').select('shipment_id').eq('seller_id', sellerId).in('shipment_status', ['ready_to_ship', 'handling', 'pending']).order('last_sync_at', { ascending: true }).limit(150);
      const activeIds = (active || []).map((s: any) => s.shipment_id);
      if (activeIds.length > 0) { for (let i = 0; i < activeIds.length; i += SHIPMENT_SYNC_BATCH) { const batch = activeIds.slice(i, i + SHIPMENT_SYNC_BATCH); const r = await supabase.functions.invoke('ml-sync-shipments', { headers, body: { seller_id: sellerId, shipment_ids: batch } }); if (isTrialExpiredResponse(r)) throw new Error('TRIAL_EXPIRED'); if (r.data?.job_id) await waitForJob(r.data.job_id, silent); } }
      // Invoices
      if (!silent) { setSyncPhase('invoices'); setSyncProgress('Sincronizando NFs...'); }
      if (orderIds.length > 0) { const { data: exInv } = await supabase.from('meli_invoices_cache').select('order_id').eq('seller_id', sellerId).in('order_id', orderIds); const invoiced = new Set((exInv || []).map((i: any) => i.order_id)); const pending = orderIds.filter(id => !invoiced.has(id)); if (pending.length > 0) { for (let i = 0; i < pending.length; i += INVOICE_SYNC_BATCH) { const batch = pending.slice(i, i + INVOICE_SYNC_BATCH); const r = await supabase.functions.invoke('ml-sync-invoices', { headers, body: { seller_id: sellerId, order_ids: batch } }); if (isTrialExpiredResponse(r)) throw new Error('TRIAL_EXPIRED'); if (r.data?.job_id) await waitForJob(r.data.job_id, silent); } } }
      setLastSyncAt(new Date().toISOString());
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['shipping-orders-v2'] });
      if (!silent) { setSyncPhase('done'); setSyncProgress('Concluído!'); setTimeout(() => { setIsSyncing(false); setSyncPhase('idle'); setSyncProgress(''); }, 1500); }
    } catch (error: any) {
      console.error('V2 sync error:', error);
      if (error.message === 'TRIAL_EXPIRED') { sonnerToast.error('Período de teste expirou.', { id: 'trial-expired' }); } else if (!silent) { toast({ title: 'Erro na sincronização', description: error.message, variant: 'destructive' }); }
      setIsSyncing(false); setSyncPhase('idle'); setSyncProgress('');
    }
  }, [isSyncing, sellerId, getDateRange, refetch, queryClient, toast, waitForJob]);

  // Auto sync on mount
  useEffect(() => {
    if (!sellerId || hasAutoSyncedRef.current) return;
    hasAutoSyncedRef.current = true;
    const check = async () => {
      const { data: scheduler } = await supabase.from('sync_scheduler').select('last_run_at').eq('job_name', 'shipping-labels-sync').maybeSingle();
      if (scheduler?.last_run_at) { setLastSyncAt(scheduler.last_run_at); } else {
        const { data: lastJob } = await supabase.from('sync_jobs').select('created_at').eq('module', 'labels_orders_list').eq('status', 'success').order('created_at', { ascending: false }).limit(1).maybeSingle();
        setLastSyncAt(lastJob?.created_at || null);
        if (!lastJob?.created_at) startSyncPipeline(false);
      }
    };
    const t = setTimeout(check, 300);
    return () => clearTimeout(t);
  }, [sellerId, startSyncPipeline]);

  // Label generation — calls V2 edge function
  const generateLabelsMutation = useMutation({
    mutationFn: async ({ format, layout, shipmentId }: { format: 'pdf' | 'zpl'; layout: LabelLayout; shipmentId?: string }) => {
      if (!sellerId) throw new Error('Seller ID not set');
      const headers = await getAuthHeaders();
      if (!headers) throw new Error('Not authenticated');
      let shipmentIds: string[];
      if (shipmentId) { shipmentIds = [shipmentId]; }
      else {
        if (selectedIds.size === 0) throw new Error('Nenhum envio selecionado');
        shipmentIds = orders.filter((o: ShippingOrder) => selectedIds.has(o.id)).map((o: ShippingOrder) => o.shipment_id).filter(Boolean) as string[];
      }
      if (shipmentIds.length === 0) throw new Error('Nenhum envio válido selecionado');

      setGenerationProgress({ status: 'processing', total_labels: shipmentIds.length, processed_labels: 0, total_batches: 1, completed_batches: 0, error_batches: 0 });
      setIsJobGenerating(true);

      // Call V2 edge function
      const response = await supabase.functions.invoke('ml-generate-labels-v2', {
        headers,
        body: { seller_id: sellerId, shipment_ids: shipmentIds, format, layout },
      });
      if (response.error) throw new Error(response.error.message);
      if (!response.data.success) {
        const ve = response.data.validationErrors as Array<{ shipment_id: string; reason: string }> | undefined;
        if (ve && ve.length > 0) { const reasons = [...new Set(ve.map(e => e.reason))]; throw new Error(`${ve.length} envio(s) inválido(s): ${reasons.join('; ')}`); }
        throw new Error(response.data.message || 'Erro ao gerar etiquetas');
      }
      return response.data;
    },
    onSuccess: (data, variables) => {
      setIsJobGenerating(false);
      if (!variables.shipmentId) setSelectedIds(new Set());
      setGenerationProgress({ status: data.error_batches > 0 ? 'partial' : 'completed', total_labels: data.total_labels || 0, processed_labels: data.total_labels || 0, total_batches: 1, completed_batches: 1, error_batches: data.error_batches || 0 });
      // Download
      if (variables.format === 'pdf' && data.pdf_base64) {
        const binary = atob(data.pdf_base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.download_filename || `etiquetas_v2_${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'PDF gerado (V2)', description: `${data.total_labels} etiqueta(s) — ${data.page_width_mm || 100}x${data.page_height_mm || 150}mm` });
      } else if (variables.format === 'zpl' && data.zpl_content) {
        const blob = new Blob([data.zpl_content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.download_filename || `etiquetas_v2_${Date.now()}.zpl`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'ZPL gerado (V2)', description: `${data.total_labels} etiqueta(s)` });
      }
      if (data.error_batches > 0) toast({ title: 'Atenção', description: `${data.error_batches} envio(s) falharam`, variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['print-history-v2'] });
      setTimeout(() => setGenerationProgress(INITIAL_PROGRESS), 3000);
    },
    onError: (error: any) => {
      console.error('V2 generate error:', error);
      setIsJobGenerating(false);
      setGenerationProgress(prev => ({ ...prev, status: 'error' }));
      toast({ title: 'Erro ao gerar etiquetas', description: error.message, variant: 'destructive' });
      setTimeout(() => setGenerationProgress(INITIAL_PROGRESS), 3000);
    },
  });

  // Selection
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);
  const selectAll = useCallback((visible?: ShippingOrder[]) => {
    const src = visible ?? orders;
    setSelectedIds(new Set(src.filter((o: ShippingOrder) => o.selectable).map((o: ShippingOrder) => o.id)));
  }, [orders]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const sync = useCallback(() => { startSyncPipeline(); }, [startSyncPipeline]);
  const setDateRange = useCallback((range: DateRange) => { setCustomDateRange(range); if (range.from || range.to) setPeriodFilter('custom'); }, []);
  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
  }, [sortField]);

  return {
    orders, isLoading, refetch, statusFilter, setStatusFilter,
    periodFilter, setPeriodFilter, customDateRange, setDateRange,
    searchQuery, setSearchQuery, sortField, sortDirection, toggleSort,
    currentPage, setCurrentPage, totalCount, totalPages, pageSize: PAGE_SIZE,
    selectedIds, toggleSelection, selectAll, clearSelection,
    isSyncing, syncPhase, syncProgress, sync, lastSyncAt, statusCounts,
    generateLabels: generateLabelsMutation.mutate,
    isGenerating: generateLabelsMutation.isPending || isJobGenerating,
    generationProgress, orderItems,
  };
}

// Print history for V2 jobs
export function usePrintHistoryV2(sellerId: string | null) {
  return useQuery({
    queryKey: ['print-history-v2', sellerId],
    queryFn: async () => {
      if (!sellerId) return [];
      const { data, error } = await supabase
        .from('meli_print_queue_v2' as any)
        .select('*')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) { console.error('V2 history error:', error); throw error; }
      return (data || []) as unknown as PrintJobV2[];
    },
    enabled: !!sellerId,
  });
}
