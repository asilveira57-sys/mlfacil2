/**
 * Singleton para o job de conversão ZPL → PDF do /zpl-converter.
 * Sobrevive a desmontagens da página (troca de rota), preserva o blob
 * gerado e tenta reentregar o download automaticamente quando o usuário
 * volta para a aba/página.
 */

export type ZplJobPhase = 'idle' | 'running' | 'ready' | 'error';

export interface ZplJobState {
  phase: ZplJobPhase;
  progress: number;
  estimatedSeconds: number;
  fileName: string | null;
  error: string | null;
  /** true quando o PDF está pronto mas o navegador bloqueou o download automático */
  pendingDownload: boolean;
  /** id único do job atual (muda a cada nova conversão) */
  jobId: string | null;
  /** timestamp de início do job (ms) — usado p/ contador real */
  startedAt: number | null;
  /** marca se já tentamos auto-download desse jobId */
  autoDownloadAttempted: boolean;
}

const STORAGE_KEY = 'zpl_converter_job_v1';
const TTL_MS = 60 * 60 * 1000; // 1h

let state: ZplJobState = {
  phase: 'idle',
  progress: 0,
  estimatedSeconds: 0,
  fileName: null,
  error: null,
  pendingDownload: false,
  jobId: null,
  startedAt: null,
  autoDownloadAttempted: false,
};
let resultBlob: Blob | null = null;
let resultBlobUrl: string | null = null;
const listeners = new Set<(s: ZplJobState) => void>();

function emit() {
  listeners.forEach((l) => l(state));
}

function update(patch: Partial<ZplJobState>) {
  state = { ...state, ...patch };
  emit();
}

export function subscribeJob(cb: (s: ZplJobState) => void): () => void {
  listeners.add(cb);
  cb(state);
  return () => { listeners.delete(cb); };
}

export function getJobState(): ZplJobState {
  return state;
}

export function getResultBlob(): Blob | null {
  return resultBlob;
}

// ---- Persistência do blob (base64) em sessionStorage --------------------

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl: string): Blob | null {
  try {
    const [meta, b64] = dataUrl.split(',');
    const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'application/pdf';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch { return null; }
}

async function persistResult(blob: Blob, fileName: string, jobId: string, startedAt: number) {
  try {
    const dataUrl = await blobToBase64(blob);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      fileName,
      dataUrl,
      jobId,
      startedAt,
      autoDownloadAttempted: state.autoDownloadAttempted,
    }));
  } catch { /* quota — silencia */ }
}

export function tryRehydrate(): void {
  if (resultBlob) return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const { savedAt, fileName, dataUrl, jobId, startedAt, autoDownloadAttempted } = parsed;
    if (Date.now() - savedAt > TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const blob = base64ToBlob(dataUrl);
    if (!blob) return;
    resultBlob = blob;
    update({
      phase: 'ready',
      progress: 100,
      fileName,
      pendingDownload: !autoDownloadAttempted,
      jobId: jobId ?? null,
      startedAt: startedAt ?? null,
      autoDownloadAttempted: !!autoDownloadAttempted,
    });
  } catch { /* ignore */ }
}

export function clearJob(): void {
  if (resultBlobUrl) {
    try { URL.revokeObjectURL(resultBlobUrl); } catch { /* ignore */ }
    resultBlobUrl = null;
  }
  resultBlob = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  state = {
    phase: 'idle',
    progress: 0,
    estimatedSeconds: 0,
    fileName: null,
    error: null,
    pendingDownload: false,
    jobId: null,
    startedAt: null,
    autoDownloadAttempted: false,
  };
  emit();
}

// ---- Download ------------------------------------------------------------

/**
 * Dispara o download. Se a aba estiver visível, o navegador aceita.
 * Retorna true se o disparo ocorreu (não garante que o usuário salvou).
 */
export function triggerDownload(blob: Blob, fileName: string): boolean {
  try {
    if (resultBlobUrl) {
      try { URL.revokeObjectURL(resultBlobUrl); } catch { /* ignore */ }
    }
    resultBlobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = resultBlobUrl;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch { /* ignore */ }
    }, 0);
    return true;
  } catch (e) {
    console.warn('[zpl-job] triggerDownload failed', e);
    return false;
  }
}

/**
 * Tenta o auto-download UMA ÚNICA VEZ por jobId. Se a aba estiver visível,
 * dispara e marca como entregue. Se não, deixa pendingDownload=true para o usuário
 * baixar manualmente — não tenta de novo automaticamente.
 */
export function attemptAutoDownload(): void {
  if (!resultBlob || !state.fileName) return;
  if (state.autoDownloadAttempted) return; // ← evita o loop de downloads
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    triggerDownload(resultBlob, state.fileName);
    update({ pendingDownload: false, autoDownloadAttempted: true });
    // Persiste a flag para sobreviver a remount/refresh
    if (state.jobId && state.startedAt) {
      void persistResult(resultBlob, state.fileName, state.jobId, state.startedAt);
    }
  } else {
    update({ pendingDownload: true });
  }
}

// ---- API de execução do job ---------------------------------------------

export interface RunJobCallbacks {
  /** Executa todo o pipeline atual e retorna { blob, fileName }. */
  run: (onProgress: (p: number) => void) => Promise<{ blob: Blob; fileName: string }>;
  estimatedSeconds: number;
}

let runningPromise: Promise<void> | null = null;

export function isRunning(): boolean {
  return state.phase === 'running';
}

function genJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function runJob(cbs: RunJobCallbacks): Promise<void> {
  if (runningPromise) return runningPromise;

  // Limpa resultado anterior antes de iniciar novo job
  if (resultBlobUrl) {
    try { URL.revokeObjectURL(resultBlobUrl); } catch { /* ignore */ }
    resultBlobUrl = null;
  }
  resultBlob = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

  const jobId = genJobId();
  const startedAt = Date.now();

  update({
    phase: 'running',
    progress: 0,
    estimatedSeconds: cbs.estimatedSeconds,
    fileName: null,
    error: null,
    pendingDownload: false,
    jobId,
    startedAt,
    autoDownloadAttempted: false,
  });

  runningPromise = (async () => {
    try {
      const { blob, fileName } = await cbs.run((p) => {
        update({ progress: p });
      });
      resultBlob = blob;
      update({ phase: 'ready', progress: 100, fileName });
      await persistResult(blob, fileName, jobId, startedAt);
      attemptAutoDownload();
    } catch (e: any) {
      update({ phase: 'error', error: e?.message || 'Erro ao gerar PDF' });
    } finally {
      runningPromise = null;
    }
  })();

  return runningPromise;
}
