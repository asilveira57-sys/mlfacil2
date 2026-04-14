/**
 * Persistence layer for Shipping Labels page state.
 * Keyed by sellerId so each account has independent state.
 * Uses sessionStorage for ephemeral UI state and localStorage for active jobs.
 */

const SESSION_KEY = 'sl_session_';
const JOB_KEY = 'sl_active_job';

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

// --- Active print job (localStorage — survives tab close) ---

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
    // Expire stale jobs (older than 10 minutes)
    const age = Date.now() - new Date(job.startedAt).getTime();
    if (age > 10 * 60 * 1000) {
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
