/**
 * Persistence layer for Shipping Labels page state.
 * Keyed by sellerId so each account has independent state.
 *
 * REGRA CRÍTICA: cada módulo (label-teste / label-shipping) tem chave própria.
 * Proibido usar chave global única — isso causava cruzamento de jobs entre as
 * duas telas e perda de estado ao alternar entre /shipping-labels e /label-teste.
 */

const SESSION_KEY = 'sl_session_';

// Chaves de job ativo — UMA POR MÓDULO. Não compartilhar.
const JOB_KEY_LABEL_SHIPPING = 'sl_active_job_label_shipping'; // V1 (/shipping-labels)
const JOB_KEY_LABEL_TESTE    = 'sl_active_job_label_teste';    // V2 (/label-teste)

// Chaves legadas (apenas para migração silenciosa de jobs em andamento de versões antigas).
const LEGACY_JOB_KEY_V1 = 'sl_active_job';
const LEGACY_JOB_KEY_V2 = 'sl_active_job_v2';

// TTL longo (120 min) em ambos os módulos. Geração de lotes grandes + navegação
// pode facilmente passar de 10 min, e o TTL curto antigo descartava jobs válidos.
const TTL_MS = 120 * 60 * 1000;

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
  /** Marca recovery em estado "stalled" (esperando reanexar) */
  stalled?: boolean;
  /** Module owner — defensivo, ajuda a debugar cruzamentos */
  module?: 'label_shipping' | 'label_teste';
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

// ─── Active print job — helpers genéricos por chave ──────────────────

function readJob(key: string): ActivePrintJob | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const job = JSON.parse(raw) as ActivePrintJob;
    const age = Date.now() - new Date(job.startedAt).getTime();
    if (age > TTL_MS) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      return null;
    }
    return job;
  } catch {
    return null;
  }
}

function writeJob(key: string, job: ActivePrintJob): void {
  try {
    localStorage.setItem(key, JSON.stringify(job));
  } catch { /* ignore */ }
}

function removeJob(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

function markStalled(key: string, stalled: boolean): void {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const job = JSON.parse(raw) as ActivePrintJob;
    job.stalled = stalled;
    localStorage.setItem(key, JSON.stringify(job));
  } catch { /* ignore */ }
}

// ─── V1 (label-shipping / /shipping-labels) ──────────────────────────

export function saveActiveJob(job: ActivePrintJob): void {
  writeJob(JOB_KEY_LABEL_SHIPPING, { ...job, module: 'label_shipping' });
}

export function loadActiveJob(): ActivePrintJob | null {
  // Migração silenciosa do legado (única vez)
  const legacy = readJob(LEGACY_JOB_KEY_V1);
  if (legacy && !readJob(JOB_KEY_LABEL_SHIPPING)) {
    writeJob(JOB_KEY_LABEL_SHIPPING, { ...legacy, module: 'label_shipping' });
    removeJob(LEGACY_JOB_KEY_V1);
  }
  return readJob(JOB_KEY_LABEL_SHIPPING);
}

export function clearActiveJob(): void {
  removeJob(JOB_KEY_LABEL_SHIPPING);
  // Limpa legado também para evitar ressurgir em mounts futuros
  removeJob(LEGACY_JOB_KEY_V1);
}

export function markActiveJobStalled(stalled: boolean): void {
  markStalled(JOB_KEY_LABEL_SHIPPING, stalled);
}

// ─── V2 (label-teste / /label-teste) ─────────────────────────────────

export function saveActiveJobV2(job: ActivePrintJob): void {
  writeJob(JOB_KEY_LABEL_TESTE, { ...job, module: 'label_teste' });
}

export function loadActiveJobV2(): ActivePrintJob | null {
  // Migração silenciosa do legado
  const legacy = readJob(LEGACY_JOB_KEY_V2);
  if (legacy && !readJob(JOB_KEY_LABEL_TESTE)) {
    writeJob(JOB_KEY_LABEL_TESTE, { ...legacy, module: 'label_teste' });
    removeJob(LEGACY_JOB_KEY_V2);
  }
  return readJob(JOB_KEY_LABEL_TESTE);
}

export function clearActiveJobV2(): void {
  removeJob(JOB_KEY_LABEL_TESTE);
  removeJob(LEGACY_JOB_KEY_V2);
}

export function markActiveJobV2Stalled(stalled: boolean): void {
  markStalled(JOB_KEY_LABEL_TESTE, stalled);
}
