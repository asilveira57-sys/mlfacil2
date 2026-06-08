import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { toast as sonnerToast } from 'sonner';
import {
  saveActiveJobV2 as saveActiveJob,
  loadActiveJobV2 as loadActiveJob,
  clearActiveJobV2 as clearActiveJob,
  markActiveJobV2Stalled,
  type ActivePrintJob,
} from '@/lib/shippingLabelsSession';

// Re-export shared types from V1
export type { OrderItemSummary } from '@/hooks/useShippingLabels';
export type { LabelLayout, ShippingOrder, FinalStatus, PeriodFilter, SyncPhase, SortField, SortDirection, DateRange, GenerationProgress } from '@/hooks/useShippingLabels';

import type { ShippingOrder, LabelLayout, FinalStatus, PeriodFilter, SyncPhase, SortField, SortDirection, DateRange, GenerationProgress, OrderItemSummary } from '@/hooks/useShippingLabels';

const BRASILIA_TZ = 'America/Sao_Paulo';
const PAGE_SIZE = 30;
const SHIPMENT_SYNC_BATCH = 200;
const INVOICE_SYNC_BATCH = 300;

/** How long to poll for a "not found" job before marking stalled (ms).
 *  REGRA: mínimo 120s — jobs grandes podem demorar a aparecer no status endpoint. */
const JOB_RECOVERY_TIMEOUT_MS = 120_000;
/** Polling interval during recovery (ms) */
const JOB_POLL_INTERVAL_MS = 2_000;
/** Max consecutive not-found before marking stalled (60 × 2s = 120s) */
const MAX_NOT_FOUND_ATTEMPTS = 60;
/** Module identifier — para logs estruturados [recovery:*] */
const MODULE = 'label_teste';

const INITIAL_PROGRESS: GenerationProgress = {
  status: 'idle', total_labels: 0, processed_labels: 0,
  total_batches: 0, completed_batches: 0, error_batches: 0,
};

// ─── Debug helpers ───────────────────────────────────────────────────
function dbg(...args: any[]) {
  if (typeof window !== 'undefined' && (window as any).__labelsDebug) {
    console.log('[labels-v2]', ...args);
  }
}

function logRecovery(tag: string, ctx: Record<string, any> = {}) {
  // Logs estruturados obrigatórios: [recovery:tag] {module, seller_id, job_id, elapsed_ms, ...}
  const payload = { module: MODULE, ...ctx };
  console.info(`[recovery:${tag}]`, payload);
  dbg(`[recovery:${tag}]`, payload);
}

// ─── localStorage-based active job check (sync, no hooks) ────────────
function hasActiveGenerationJob(): boolean {
  const job = loadActiveJob();
  return !!job;
}

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

/** Check if a job status is terminal */
function isTerminalStatus(status: string): boolean {
  return ['completed', 'partial', 'error', 'failed', 'cancelled'].includes(status);
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

/**
 * Compute initial "has active job" once at module load / hook init.
 * This is a STABLE value read once so useQuery options don't flip between renders.
 */
function computeInitialActiveJob(): boolean {
  return hasActiveGenerationJob();
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

  // ─── Active job state (single source of truth) ─────────────────────
  // Use useState so it's reactive AND stable for useQuery options.
  const [activeJobState, setActiveJobState] = useState<ActivePrintJob | null>(() => {
    const persisted = loadActiveJob();
    if (persisted && sellerId && persisted.sellerId === sellerId) return persisted;
    if (persisted && !sellerId) return persisted; // will validate seller on effect
    return null;
  });

  const hasActiveJob = !!activeJobState;

  const lastSyncTimeRef = useRef(0);
  const hasAutoSyncedRef = useRef(false);
  const recoveryAbortRef = useRef<AbortController | null>(null);
  // Identifica o job_id do polling em andamento — evita que dois pollers
  // (recovery on mount + mutation onSuccess) corram pelo mesmo job.
  const activePollJobIdRef = useRef<string | null>(null);

  // ─── Recovery on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!sellerId) return;

    const persisted = loadActiveJob();
    if (!persisted || persisted.sellerId !== sellerId) {
      // No active job for this seller
      if (activeJobState && activeJobState.sellerId !== sellerId) {
        setActiveJobState(null);
      }
      return;
    }

    logRecovery('start', { seller_id: sellerId, job_id: persisted.jobId, format: persisted.format, shipments: persisted.shipmentIds.length });

    // Restore UI state
    setActiveJobState(persisted);
    setGenerationProgress({
      status: persisted.stalled ? ('recovering_stalled' as any) : 'processing',
      total_labels: persisted.shipmentIds.length,
      processed_labels: 0,
      total_batches: 1,
      completed_batches: 0,
      error_batches: 0,
    });

    // Stalled: aguarda usuário clicar "Retomar verificação".
    if (persisted.stalled) {
      logRecovery('poll', { phase: 'stalled-wait-resume', seller_id: sellerId, job_id: persisted.jobId });
      return;
    }

    // If we already had completed data cached, use it directly
    if (persisted.completedData) {
      logRecovery('cached-data', { seller_id: sellerId, job_id: persisted.jobId, msg: 'Using cached completed data' });
      handleGenerationComplete(persisted.completedData, persisted.format);
      return;
    }

    // Evita double-poll: se já há um poller ativo para esse job, não inicia outro.
    if (activePollJobIdRef.current === persisted.jobId) {
      logRecovery('poll', { phase: 'skip-already-polling', seller_id: sellerId, job_id: persisted.jobId });
      return;
    }

    // If jobId is still "pending", poll until we get a real ID or timeout
    recoveryAbortRef.current?.abort();
    const abort = new AbortController();
    recoveryAbortRef.current = abort;
    activePollJobIdRef.current = persisted.jobId;
    pollJobUntilDone(persisted.jobId, persisted.format, abort.signal);

    return () => { abort.abort(); activePollJobIdRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => { recoveryAbortRef.current?.abort(); };
  }, []);

  // ─── Poll a print job until terminal status ────────────────────────
  async function pollJobUntilDone(jobId: string, format: string, signal: AbortSignal) {
    const startedAt = Date.now();
    let notFoundCount = 0;
    let attempt = 0;

    logRecovery('poll', { phase: 'start', seller_id: sellerId, job_id: jobId });

    try {
      while (!signal.aborted) {
        await sleep(JOB_POLL_INTERVAL_MS);
        if (signal.aborted) return;

        attempt++;
        const elapsed = Date.now() - startedAt;
        dbg(`[poll] attempt=${attempt}, elapsed=${elapsed}ms, jobId=${jobId}`);

        // For "pending" jobs, we need to re-read localStorage in case the mutation updated it
        if (jobId === 'pending') {
          const refreshed = loadActiveJob();
          if (refreshed && refreshed.jobId !== 'pending') {
            jobId = refreshed.jobId;
            activePollJobIdRef.current = jobId;
            logRecovery('poll', { phase: 'pending-resolved', seller_id: sellerId, job_id: jobId, elapsed_ms: elapsed });
          } else if (elapsed > JOB_RECOVERY_TIMEOUT_MS) {
            logRecovery('terminal', { status: 'stalled', reason: 'pending-timeout', seller_id: sellerId, job_id: jobId, elapsed_ms: elapsed });
            markActiveJobV2Stalled(true);
            setActiveJobState(prev => prev ? { ...prev, stalled: true } : prev);
            setGenerationProgress(prev => ({ ...prev, status: 'recovering_stalled' as any }));
            return;
          } else {
            logRecovery('poll', { phase: 'pending-waiting', seller_id: sellerId, attempt, elapsed_ms: elapsed });
            continue;
          }
        }

        try {
          const headers = await getAuthHeaders();
          if (!headers) {
            dbg('[poll] no auth headers, retrying...');
            continue;
          }

          const { data, error } = await supabase.functions.invoke('ml-generate-labels-status-v2', {
            headers,
            body: { job_id: jobId },
          });

          if (error || !data) {
            notFoundCount++;
            logRecovery('not_found', { seller_id: sellerId, job_id: jobId, attempt: notFoundCount, max: MAX_NOT_FOUND_ATTEMPTS, elapsed_ms: elapsed });

            // V2: NÃO limpa activeJob no timeout — o job pode existir em meli_print_queue_v2
            // e estar simplesmente lento. Marca como "stalled" e deixa o usuário decidir
            // quando retomar (botão "Retomar verificação" na UI).
            if (notFoundCount >= MAX_NOT_FOUND_ATTEMPTS || elapsed > JOB_RECOVERY_TIMEOUT_MS) {
              logRecovery('terminal', { status: 'stalled', reason: 'not-found-timeout', seller_id: sellerId, job_id: jobId, not_found: notFoundCount, elapsed_ms: elapsed });
              markActiveJobV2Stalled(true);
              setActiveJobState(prev => prev ? { ...prev, stalled: true } : prev);
              setGenerationProgress(prev => ({ ...prev, status: 'recovering_stalled' as any }));
              return;
            }
            continue;
          }

          // Reset not-found counter on any successful response
          notFoundCount = 0;

          const status = data.status as string;
          dbg(`[poll] status=${status}, processed=${data.processed_labels}/${data.total_labels}`);

          setGenerationProgress({
            status: isTerminalStatus(status) ? (status === 'completed' ? 'completed' : status === 'partial' ? 'partial' : 'error') : 'processing',
            total_labels: data.total_labels || 0,
            processed_labels: data.processed_labels || 0,
            total_batches: data.total_batches || 1,
            completed_batches: data.completed_batches || 0,
            error_batches: data.error_batches || 0,
          });

          if (isTerminalStatus(status)) {
            logRecovery('terminal', { status, seller_id: sellerId, job_id: jobId, elapsed_ms: elapsed });
            // V2 grava pdf_base64 (não file_url). Se houver QUALQUER artefato baixável,
            // dispara o download — mesmo que o usuário tenha navegado durante a geração.
            const hasArtifact =
              (typeof data.pdf_base64 === 'string' && data.pdf_base64.length > 100) ||
              (typeof data.zpl_content === 'string' && data.zpl_content.length > 10) ||
              !!data.file_url;
            if (hasArtifact) {
              handleGenerationComplete(data, format);
            } else {
              finalizeJob(status as any);
            }
            return;
          }

          logRecovery('poll', { phase: 'in-progress', seller_id: sellerId, job_id: jobId, status, processed: data.processed_labels, total: data.total_labels });
        } catch (err) {
          console.error('[V2] Poll error:', err);
          dbg('[poll] transient error, continuing...', err);
          // Continue polling on transient errors
        }
      }
    } finally {
      // Libera o slot de polling — permite resume futuro sem race.
      if (activePollJobIdRef.current === jobId) activePollJobIdRef.current = null;
    }
  }

  function handleGenerationComplete(data: any, format: string) {
    const labelCount = data.success_count ?? data.total_success ?? data.total_labels ?? 0;
    const errorCount = data.error_count ?? data.error_batches ?? 0;
    const errors: Array<{ shipment_id: string; reason_code: string; reason_message: string }> = data.errors || data.validation_errors || [];
    logRecovery('clear', { reason: 'complete', seller_id: sellerId, labels: labelCount, errors: errorCount });

    setActiveJobState(null);
    clearActiveJob();

    // CRITICAL: Block download if 0 labels — never download empty PDF
    if (labelCount <= 0) {
      setGenerationProgress({ status: 'error', total_labels: 0, processed_labels: 0, total_batches: 1, completed_batches: 1, error_batches: 1 });
      // Show detailed reasons if available
      if (errors.length > 0) {
        const reasons = [...new Set(errors.map(e => e.reason_message || e.reason_code))];
        sonnerToast.error(`Nenhuma etiqueta gerada. Motivos: ${reasons.join('; ')}`, { duration: 10000 });
      } else {
        sonnerToast.error('Nenhuma etiqueta válida foi gerada. Verifique seleção, status e nota fiscal dos envios.', { duration: 8000 });
      }
      queryClient.invalidateQueries({ queryKey: ['print-history-v2'] });
      setTimeout(() => setGenerationProgress(INITIAL_PROGRESS), 5000);
      return;
    }

    const status = errorCount > 0 ? 'partial' : 'completed';
    setGenerationProgress({
      status,
      total_labels: labelCount + errorCount,
      processed_labels: labelCount,
      total_batches: 1,
      completed_batches: 1,
      error_batches: errorCount,
    });

    // Download file — validate content before triggering
    const hasPdf = format === 'pdf' && typeof data.pdf_base64 === 'string' && data.pdf_base64.length > 100;
    const hasZpl = format === 'zpl' && typeof data.zpl_content === 'string' && data.zpl_content.length > 10;

    if (hasPdf) {
      downloadPdf(data.pdf_base64, data.download_filename);
      toast({ title: 'PDF gerado (V2)', description: `${labelCount} etiqueta(s) — ${data.page_width_mm || 100}x${data.page_height_mm || 150}mm` });
    } else if (hasZpl) {
      downloadZpl(data.zpl_content, data.download_filename);
      toast({ title: 'ZPL gerado (V2)', description: `${labelCount} etiqueta(s)` });
    } else if (data.file_url) {
      window.open(data.file_url, '_blank');
      toast({ title: 'Etiqueta gerada (V2)', description: `${labelCount} etiqueta(s)` });
    } else {
      sonnerToast.error('Etiquetas processadas mas arquivo final não foi gerado. Tente novamente.', { duration: 6000 });
    }

    // Show partial failure details
    if (errorCount > 0 && errors.length > 0) {
      const failedIds = errors.map(e => e.shipment_id).filter(Boolean);
      const reasons = [...new Set(errors.map(e => e.reason_message || e.reason_code))];
      sonnerToast.warning(
        `${labelCount} gerada(s), ${errorCount} falharam: ${reasons.join('; ')}${failedIds.length > 0 ? ` — Envios: ${failedIds.slice(0, 5).join(', ')}${failedIds.length > 5 ? '...' : ''}` : ''}`,
        { duration: 10000 },
      );
    } else if (errorCount > 0) {
      toast({ title: 'Atenção', description: `${errorCount} envio(s) falharam`, variant: 'destructive' });
    }

    queryClient.invalidateQueries({ queryKey: ['print-history-v2'] });
    setTimeout(() => setGenerationProgress(INITIAL_PROGRESS), 3000);
  }

  function finalizeJob(status: 'completed' | 'partial' | 'error' | string) {
    logRecovery('clear', { reason: 'finalize', seller_id: sellerId, status });

    setActiveJobState(null);
    clearActiveJob();
    setGenerationProgress(prev => ({ ...prev, status: status === 'completed' ? 'completed' : status === 'partial' ? 'partial' : 'error' }));
    if (status === 'error') {
      toast({ title: 'Erro na geração', description: 'Job não concluiu com sucesso.', variant: 'destructive' });
    }
    queryClient.invalidateQueries({ queryKey: ['print-history-v2'] });
    setTimeout(() => setGenerationProgress(INITIAL_PROGRESS), 3000);
  }

  function downloadPdf(base64: string, filename?: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `etiquetas_v2_${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadZpl(content: string, filename?: string) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `etiquetas_v2_${Date.now()}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Date range ────────────────────────────────────────────────────
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

  // ─── Main orders query ─────────────────────────────────────────────
  // CRITICAL: use stable initial value to avoid hook queue issues.
  // hasActiveJob is a state var so it's stable across renders.
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['shipping-orders-v2', sellerId, statusFilter, periodFilter, customDateRange, currentPage, searchQuery, sortField, sortDirection],
    queryFn: async () => {
      const emptyCounts = { all: 0, aguardando_nf: 0, para_imprimir: 0, pronta_enviar: 0, reimprimir: 0, agendadas: 0 };
      if (!sellerId) return { orders: [], totalCount: 0, statusCounts: emptyCounts };

      dbg('[query] fetching orders, hasActiveJob=', hasActiveJob);

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
      if (error) { console.error('V2 RPC error:', error); return { orders: [], totalCount: 0, statusCounts: emptyCounts }; }
      const result = data as any;
      const sc = result.status_counts || {};
      return {
        orders: result.orders || [],
        totalCount: result.total_count || 0,
        statusCounts: {
          all: sc.all ?? 0,
          aguardando_nf: sc.aguardando_nf ?? 0,
          para_imprimir: sc.para_imprimir ?? 0,
          pronta_enviar: sc.pronta_enviar ?? 0,
          reimprimir: sc.reimprimir ?? 0,
        },
      };
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: !hasActiveJob,
    refetchOnReconnect: !hasActiveJob,
    placeholderData: (prev: any) => prev,
  });

  const orders = ordersData?.orders ?? [];
  const totalCount = ordersData?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const statusCounts = ordersData?.statusCounts ?? { all: 0, aguardando_nf: 0, para_imprimir: 0, pronta_enviar: 0, reimprimir: 0 };

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
    refetchOnMount: !hasActiveJob,
    refetchOnReconnect: !hasActiveJob,
  });
  const orderItems = orderItemsData ?? new Map<string, OrderItemSummary[]>();

  // ─── Sync pipeline ─────────────────────────────────────────────────
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
    // CRITICAL: block sync while a generation job is active
    if (hasActiveJob) {
      if (!silent) console.info('[V2] Sync blocked — active generation job');
      dbg('[sync] blocked by active job');
      return;
    }

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
      if (!silent) setSyncProgress('Atualizando status...');
      const { data: active } = await supabase.from('meli_shipments_cache').select('shipment_id').eq('seller_id', sellerId).in('shipment_status', ['ready_to_ship', 'handling', 'pending']).order('last_sync_at', { ascending: true }).limit(150);
      const activeIds = (active || []).map((s: any) => s.shipment_id);
      if (activeIds.length > 0) { for (let i = 0; i < activeIds.length; i += SHIPMENT_SYNC_BATCH) { const batch = activeIds.slice(i, i + SHIPMENT_SYNC_BATCH); const r = await supabase.functions.invoke('ml-sync-shipments', { headers, body: { seller_id: sellerId, shipment_ids: batch } }); if (isTrialExpiredResponse(r)) throw new Error('TRIAL_EXPIRED'); if (r.data?.job_id) await waitForJob(r.data.job_id, silent); } }
      if (!silent) { setSyncPhase('invoices'); setSyncProgress('Sincronizando NFs...'); }
      if (orderIds.length > 0) { const { data: exInv } = await supabase.from('meli_invoices_cache').select('order_id').eq('seller_id', sellerId).in('order_id', orderIds); const invoiced = new Set((exInv || []).map((i: any) => i.order_id)); const pending = orderIds.filter(id => !invoiced.has(id)); if (pending.length > 0) { for (let i = 0; i < pending.length; i += INVOICE_SYNC_BATCH) { const batch = pending.slice(i, i + INVOICE_SYNC_BATCH); const r = await supabase.functions.invoke('ml-sync-invoices', { headers, body: { seller_id: sellerId, order_ids: batch } }); if (isTrialExpiredResponse(r)) throw new Error('TRIAL_EXPIRED'); if (r.data?.job_id) await waitForJob(r.data.job_id, silent); } } }
      {
        const nowIso = new Date().toISOString();
        setLastSyncAt(nowIso);
        try { if (sellerId) localStorage.setItem(`shipping_last_sync_${sellerId}`, nowIso); } catch {}
      }
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['shipping-orders-v2'] });
      if (!silent) { setSyncPhase('done'); setSyncProgress('Concluído!'); setTimeout(() => { setIsSyncing(false); setSyncPhase('idle'); setSyncProgress(''); }, 1500); }
    } catch (error: any) {
      console.error('V2 sync error:', error);
      if (error.message === 'TRIAL_EXPIRED') { sonnerToast.error('Período de teste expirou.', { id: 'trial-expired' }); } else if (!silent) { toast({ title: 'Erro na sincronização', description: error.message, variant: 'destructive' }); }
      setIsSyncing(false); setSyncPhase('idle'); setSyncProgress('');
    }
  }, [hasActiveJob, isSyncing, sellerId, getDateRange, refetch, queryClient, toast, waitForJob]);

  // Auto sync on mount — blocked during generation
  useEffect(() => {
    if (!sellerId || hasAutoSyncedRef.current || hasActiveJob) return;
    hasAutoSyncedRef.current = true;
    const check = async () => {
      let localIso: string | null = null;
      try { localIso = localStorage.getItem(`shipping_last_sync_${sellerId}`); } catch {}
      const { data: scheduler } = await supabase.from('sync_scheduler').select('last_run_at').eq('job_name', 'shipping-labels-sync').maybeSingle();
      const { data: lastJob } = await supabase.from('sync_jobs').select('created_at').eq('module', 'labels_orders_list').eq('status', 'success').order('created_at', { ascending: false }).limit(1).maybeSingle();
      const candidates = [localIso, scheduler?.last_run_at, lastJob?.created_at].filter(Boolean) as string[];
      const mostRecent = candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
      setLastSyncAt(mostRecent);
      if (!mostRecent) startSyncPipeline(false);
    };
    const t = setTimeout(check, 300);
    return () => clearTimeout(t);
  }, [sellerId, startSyncPipeline, hasActiveJob]);

  // ─── Label generation — V2 edge function ───────────────────────────
  const generateLabelsMutation = useMutation({
    mutationFn: async ({ format, layout, shipmentId }: { format: 'pdf' | 'zpl'; layout: LabelLayout; shipmentId?: string }) => {
      if (!sellerId) throw new Error('Seller ID not set');
      // Anti-duplo-disparo: se já existe job em andamento, bloqueia para evitar 2 PDFs do mesmo lote
      if (hasActiveGenerationJob()) {
        throw new Error('Já existe uma geração em andamento. Aguarde a conclusão antes de iniciar outra.');
      }
      const headers = await getAuthHeaders();
      if (!headers) throw new Error('Not authenticated');
      let shipmentIds: string[];
      if (shipmentId) { shipmentIds = [shipmentId]; }
      else {
        if (selectedIds.size === 0) throw new Error('Nenhum envio selecionado');
        shipmentIds = orders.filter((o: ShippingOrder) => selectedIds.has(o.id)).map((o: ShippingOrder) => o.shipment_id).filter(Boolean) as string[];
      }
      // CRÍTICO: deduplicar shipment_ids — vendas de carrinho compartilham o mesmo shipment_id
      // entre vários order_ids. Sem isso, o ML retorna 2+ etiquetas para o mesmo envio.
      shipmentIds = [...new Set(shipmentIds)];
      if (shipmentIds.length === 0) throw new Error('Nenhum envio válido selecionado');

      setGenerationProgress({ status: 'processing', total_labels: shipmentIds.length, processed_labels: 0, total_batches: 1, completed_batches: 0, error_batches: 0 });

      // Persist active job BEFORE the call so we can recover on navigation
      const jobEntry: ActivePrintJob = {
        jobId: 'pending', // will update after response
        sellerId,
        format,
        layout,
        shipmentIds,
        startedAt: new Date().toISOString(),
      };
      setActiveJobState(jobEntry);
      saveActiveJob(jobEntry);

      dbg('[generate] started, shipments=', shipmentIds.length);

      // Call labeltest edge function (dimension-normalized)
      const response = await supabase.functions.invoke('ml-generate-labels-labeltest', {
        headers,
        body: { seller_id: sellerId, shipment_ids: shipmentIds, format, layout },
      });
      if (response.error) throw new Error(response.error.message || 'Edge Function returned a non-2xx status code');
      const resData = response.data;
      // Handle { ok: true/false, data: {...}, error: "..." } format
      if (resData?.ok === false) {
        const ve = resData?.data?.validation_errors as Array<{ shipment_id: string; reason_code: string; reason_message: string }> | undefined;
        const perShipment = resData?.data?.per_shipment as Array<{ shipment_id: string; status: string; error?: string }> | undefined;
        if (ve && ve.length > 0) {
          const reasons = [...new Set(ve.map(e => e.reason_message || e.reason_code))];
          throw new Error(`${ve.length} envio(s) inválido(s): ${reasons.join('; ')}`);
        }
        if (perShipment) {
          const failed = perShipment.filter(p => p.status === 'error');
          if (failed.length > 0) {
            const reasons = [...new Set(failed.map(f => f.error || 'erro desconhecido'))];
            throw new Error(`${failed.length} envio(s) falharam: ${reasons.join('; ')}`);
          }
        }
        throw new Error(resData?.error || 'Erro ao gerar etiquetas');
      }
      // Also handle legacy { success: false } format
      if (resData?.success === false && !resData?.ok) {
        throw new Error(resData?.error || resData?.message || 'Erro ao gerar etiquetas');
      }

      // Extract inner data (new format nests under .data)
      const resultData = resData?.data || resData;

      // Update persisted job with real job_id and completed data
      if (resultData.job_id) {
        jobEntry.jobId = resultData.job_id;
        dbg('[generate] real jobId=', resultData.job_id);
      }
      jobEntry.completedData = resultData;
      saveActiveJob(jobEntry);

      return resultData;
    },
    onSuccess: (data, variables) => {
      if (!variables.shipmentId) setSelectedIds(new Set());

      // ── PDF assíncrono (lote V2): dispatcher só criou o job, workers rodam em background.
      // Delega ao poller V2 que já existe — ele anima processed_labels/total_labels e baixa
      // o pdf_base64 quando status='concluido'.
      if (data?.async_job && data?.job_id) {
        const job = loadActiveJob();
        if (job) {
          job.jobId = data.job_id;
          saveActiveJob(job);
          setActiveJobState({ ...job });
        }
        setGenerationProgress({
          status: 'processing',
          total_labels: data.total_labels || 0,
          processed_labels: 0,
          total_batches: data.total_batches || 1,
          completed_batches: 0,
          error_batches: 0,
        });
        // Evita double-poll: aborta qualquer poller anterior e marca o slot.
        recoveryAbortRef.current?.abort();
        const abort = new AbortController();
        recoveryAbortRef.current = abort;
        activePollJobIdRef.current = data.job_id;
        pollJobUntilDone(data.job_id, variables.format, abort.signal);
        return;
      }

      // ZPL inline (single-shot) ou resposta legada com pdf_base64 imediato
      handleGenerationComplete(data, variables.format);
    },
    onError: (error: any) => {
      console.error('V2 generate error:', error);
      setActiveJobState(null);
      clearActiveJob();
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

  // V2: retomar verificação após estado "stalled" (timeout sem perda do activeJob)
  const resumeStalledRecovery = useCallback(() => {
    const job = loadActiveJob();
    if (!job) return;
    logRecovery('poll', { phase: 'resume-stalled', seller_id: sellerId, job_id: job.jobId });
    markActiveJobV2Stalled(false);
    setActiveJobState({ ...job, stalled: false });
    setGenerationProgress(prev => ({ ...prev, status: 'processing' }));
    recoveryAbortRef.current?.abort();
    const abort = new AbortController();
    recoveryAbortRef.current = abort;
    activePollJobIdRef.current = job.jobId;
    pollJobUntilDone(job.jobId, job.format, abort.signal);
  }, []);

  const cancelStalledRecovery = useCallback(() => {
    logRecovery('clear', { reason: 'user-cancel', seller_id: sellerId });
    recoveryAbortRef.current?.abort();
    setActiveJobState(null);
    clearActiveJob();
    setGenerationProgress(INITIAL_PROGRESS);
  }, []);

  return {
    orders, isLoading, refetch, statusFilter, setStatusFilter,
    periodFilter, setPeriodFilter, customDateRange, setDateRange,
    searchQuery, setSearchQuery, sortField, sortDirection, toggleSort,
    currentPage, setCurrentPage, totalCount, totalPages, pageSize: PAGE_SIZE,
    selectedIds, toggleSelection, selectAll, clearSelection,
    isSyncing, syncPhase, syncProgress, sync, lastSyncAt, statusCounts,
    generateLabels: generateLabelsMutation.mutate,
    isGenerating: generateLabelsMutation.isPending || hasActiveJob,
    isStalled: !!activeJobState?.stalled,
    resumeStalledRecovery, cancelStalledRecovery,
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
