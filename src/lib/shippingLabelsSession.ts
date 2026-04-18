/**
 * Persistence layer for Shipping Labels page state.
 * Keyed by sellerId so each account has independent state.
 * Uses sessionStorage for ephemeral UI state and localStorage for active jobs.
 */

const SESSION_KEY = 'sl_session_';
const JOB_KEY = 'sl_active_job';        // V1 (shipping-labels) — não tocar
const JOB_KEY_V2 = 'sl_active_job_v2';  // V2 (label-teste)

// TTL separado por versão. V1 mantém comportamento legado (10 min).
// V2 estende para 120 min, suportando geração longa + navegação entre rotas.
const TTL_V1_MS = 10 * 60 * 1000;
const TTL_V2_MS = 120 * 60 * 1000;

export interface ShippingFiltersState {
  statusFilter: string;
  periodFilter: string;
  searchQuery: string;
  sortField: string;
  sortDirection: string;
  currentPage: number;
  logisticFilter: string;
  selectedIds: string[];
}

export interface ActivePrintJob {
  jobId: string;
  sellerId: string;
  format: 'pdf' | 'zpl';
  layout: string;
  shipmentIds: string[];
  startedAt: string;
  /** V2 only: marca recovery em estado "stalled" (esperando reanexar) */
  stalled?: boolean;
  /** The original response data if the call already completed before navigation */
  completedData?: any;
}

// --- Filters / UI state (sessionStorage) ---

export function saveFiltersState(sellerId: string, state: ShippingFiltersState): void {
  try {
    sessionStorage.setItem(SESSION_KEY + sellerId, JSON.stringify(state));
  } catch { /* quota exceeded, ignore */ }
}

export function loadFiltersState(sellerId: string): ShippingFiltersState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY + sellerId);
    if (!raw) return null;
    return JSON.parse(raw) as ShippingFiltersState;
  } catch {
    return null;
  }
}

// --- Active print job V1 (legado, shipping-labels) ---

export function saveActiveJob(job: ActivePrintJob): void {
  try {
    localStorage.setItem(JOB_KEY, JSON.stringify(job));
  } catch { /* ignore */ }
}

export function loadActiveJob(): ActivePrintJob | null {
  try {
    const raw = localStorage.getItem(JOB_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as ActivePrintJob;
    const age = Date.now() - new Date(job.startedAt).getTime();
    if (age > TTL_V1_MS) {
      clearActiveJob();
      return null;
    }
    return job;
  } catch {
    return null;
  }
}

export function clearActiveJob(): void {
  try {
    localStorage.removeItem(JOB_KEY);
  } catch { /* ignore */ }
}

// --- Active print job V2 (label-teste) ---
// Chave separada do V1 e TTL longo, para suportar geração demorada + navegação.

export function saveActiveJobV2(job: ActivePrintJob): void {
  try {
    localStorage.setItem(JOB_KEY_V2, JSON.stringify(job));
  } catch { /* ignore */ }
}

export function loadActiveJobV2(): ActivePrintJob | null {
  try {
    const raw = localStorage.getItem(JOB_KEY_V2);
    if (!raw) return null;
    const job = JSON.parse(raw) as ActivePrintJob;
    const age = Date.now() - new Date(job.startedAt).getTime();
    if (age > TTL_V2_MS) {
      clearActiveJobV2();
      return null;
    }
    return job;
  } catch {
    return null;
  }
}

export function clearActiveJobV2(): void {
  try {
    localStorage.removeItem(JOB_KEY_V2);
  } catch { /* ignore */ }
}

export function markActiveJobV2Stalled(stalled: boolean): void {
  try {
    const raw = localStorage.getItem(JOB_KEY_V2);
    if (!raw) return;
    const job = JSON.parse(raw) as ActivePrintJob;
    job.stalled = stalled;
    localStorage.setItem(JOB_KEY_V2, JSON.stringify(job));
  } catch { /* ignore */ }
}
