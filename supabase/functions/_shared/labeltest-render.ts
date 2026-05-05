// Shared rendering primitives for ml-generate-labels-labeltest (dispatcher)
// and ml-generate-labels-labeltest-batch (worker).
// Extracted to avoid 600+ lines of duplication between the two functions.
//
// IMPORTANT: ZPL → Labelary PNG → pdf-lib is CPU-heavy; the dispatcher
// MUST NOT call renderChunkToPdf inline (will trigger CPU exceeded for >5 shipments).
// Only the worker invokes renderChunkToPdf, and only on a single chunk of ≤5 shipments.

import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import JSZip from "npm:jszip@3.10.1";

// ─── Constants & layouts ────────────────────────────────────────────
export const MM_TO_PT = 2.83465;
export const LABEL_W_MM = 100;
export const LABEL_H_MM = 150;
export const HEADER_H_MM = 25;

export const LAYOUTS: Record<string, { widthMm: number; heightMm: number; includeHeader: boolean; includeDanfe: boolean }> = {
  'meli_100x150':           { widthMm: 100, heightMm: 150, includeHeader: false, includeDanfe: true },
  'meli_100x150_no_nf':     { widthMm: 100, heightMm: 175, includeHeader: true,  includeDanfe: false },
  'mlfacil_100x175_header': { widthMm: 100, heightMm: 175, includeHeader: true,  includeDanfe: true },
};

const LABELARY_DPMM = 8;
const HEADER_PADDING_TOP = 8;
const HEADER_LINE_HEIGHT_FACTOR = 1.3;

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const getBackoff = (attempt: number) => Math.min(Math.pow(2, attempt - 1) * 1000, 8000);

export function getLabelaryParams(layout: string) {
  const info = LAYOUTS[layout];
  return {
    dpmm: LABELARY_DPMM,
    wInch: parseFloat((info.widthMm / 25.4).toFixed(2)),
    hInch: parseFloat((info.heightMm / 25.4).toFixed(2)),
  };
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let b = ''; const cs = 32768;
  for (let i = 0; i < bytes.length; i += cs) {
    const c = bytes.subarray(i, i + cs);
    b += String.fromCharCode.apply(null, Array.from(c));
  }
  return btoa(b);
}

export function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hashCode(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36).substring(0, 6);
}

// ─── Concurrency ────────────────────────────────────────────────────
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const runnersCount = Math.min(limit, items.length);
  for (let i = 0; i < runnersCount; i++) {
    runners.push((async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        results[idx] = await worker(items[idx], idx);
      }
    })());
  }
  await Promise.all(runners);
  return results;
}

// ─── Text helpers (header lines) ────────────────────────────────────
function truncate(t: string, max: number) { return t.length <= max ? t : t.substring(0, max - 3) + '...'; }
function sanitize(t: string | null | undefined, max = 90) { if (!t) return ''; return truncate(t.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(), max); }

function wrapTextLines(text: string, maxChars: number): string[] {
  if (!text || text.length <= maxChars) return [text];
  const words = text.split(' '); const result: string[] = []; let current = '';
  for (const w of words) { if (!current) current = w; else if (current.length + 1 + w.length <= maxChars) current += ' ' + w; else { result.push(current); current = w; } }
  if (current) result.push(current);
  return result.length > 0 ? result : [text];
}

function extractVariationsFromTitle(title: string): { name: string; value: string }[] {
  if (!title) return [];
  const out: { name: string; value: string }[] = [];
  const dashIdx = title.lastIndexOf(' - ');
  if (dashIdx < 0) return [];
  const tail = title.substring(dashIdx + 3);
  const parts = tail.split(/\s*[\/,]\s*/);
  for (const p of parts) {
    const m = p.match(/^([A-Za-zÀ-ÿ ]+)\s*:\s*(.+)$/);
    if (m) out.push({ name: m[1].trim(), value: m[2].trim() });
  }
  return out;
}

function buildProductLines(items: any[], maxLines: number, showSku: boolean, showVarAttrs: boolean, maxLen = 58) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.quantity !== a.quantity ? b.quantity - a.quantity : (a.sku || a.title_short || '').localeCompare(b.sku || b.title_short || ''));
  const lines: { text: string; bold: boolean }[] = [];
  for (const item of sorted) {
    if (lines.length >= maxLines) break;
    const title = sanitize(item.title || item.title_short || item.sku || 'Item', 200);
    for (const tl of wrapTextLines(title, maxLen)) { if (lines.length >= maxLines) break; lines.push({ text: tl, bold: true }); }
    if (lines.length < maxLines) { const sku = showSku && item.sku ? ` - Apelido: ${item.sku}` : ''; lines.push({ text: truncate(`Quantidade: ${item.quantity}${sku}`, maxLen), bold: false }); }
    if (showVarAttrs && lines.length < maxLines) {
      let attrs: { name: string; value: string }[] = [];
      if (Array.isArray(item.variation_attributes) && item.variation_attributes.length > 0) {
        for (const a of item.variation_attributes) {
          const n = a?.name || a?.id || '';
          const v = a?.value_name || a?.value || '';
          if (n && v) attrs.push({ name: n, value: v });
        }
      }
      if (attrs.length === 0) attrs = extractVariationsFromTitle(item.title || item.title_short || '');
      for (const a of attrs) {
        if (lines.length >= maxLines) break;
        lines.push({ text: truncate(`${a.name}: ${a.value}`, maxLen), bold: false });
      }
    }
  }
  return lines;
}

export const DEFAULT_HEADER_PREFS = {
  show_customer: true, show_products: true, show_order_id: true,
  show_shipment_id: false, show_comment: true, show_sku: true,
  show_variation_attrs: true,
  line_order: ['customer', 'products', 'order', 'comment'],
  max_product_lines: 5, max_total_lines: 8, font_size: 9,
};

export function buildHeaderLines(prefs: typeof DEFAULT_HEADER_PREFS, order: any, items: any[], cart?: { isCart: boolean; itemCount: number }) {
  const contents: Record<string, { text: string; bold: boolean }[]> = { customer: [], products: [], order: [], shipment: [], comment: [] };
  if (prefs.show_customer && order.buyer_name) contents.customer = [{ text: sanitize(order.buyer_name, 40), bold: false }];
  if (prefs.show_products && items.length > 0) contents.products = buildProductLines(items, prefs.max_product_lines, prefs.show_sku ?? true, prefs.show_variation_attrs ?? true);
  if (prefs.show_order_id) contents.order = [{ text: `Pedido: ${order.order_id}`, bold: false }];
  if (prefs.show_shipment_id && order.shipment_id) contents.shipment = [{ text: `Envio: ${order.shipment_id}`, bold: false }];
  if (prefs.show_comment && order.order_comment) { const c = sanitize(order.order_comment, 60); if (c) contents.comment = [{ text: `Obs: ${c}`, bold: false }]; }
  const lines: { text: string; bold: boolean }[] = [];
  // Cart marker: SOMENTE quando o envio é carrinho (>1 item agregado)
  if (cart?.isCart) {
    if (lines.length < prefs.max_total_lines) lines.push({ text: `CARRINHO: ${cart.itemCount} itens`, bold: true });
  }
  if (contents.customer.length > 0) for (const l of contents.customer) { if (lines.length >= prefs.max_total_lines) break; lines.push(l); }
  for (const lt of prefs.line_order) {
    if (lt === 'customer') continue;
    const block = contents[lt] || [];
    // Para carrinho, se products não couber inteiro, adiciona aviso final
    if (lt === 'products' && cart?.isCart) {
      const remaining = prefs.max_total_lines - lines.length;
      if (remaining <= 0) break;
      // reservar 1 linha para o aviso quando não couber tudo
      const willOverflow = block.length > remaining;
      const slice = willOverflow ? block.slice(0, Math.max(0, remaining - 1)) : block;
      for (const l of slice) { if (lines.length >= prefs.max_total_lines) break; lines.push(l); }
      if (willOverflow && lines.length < prefs.max_total_lines) {
        const missing = block.length - slice.length;
        lines.push({ text: `Verificar itens do carrinho (+${missing})`, bold: true });
      }
      continue;
    }
    for (const l of block) { if (lines.length >= prefs.max_total_lines) break; lines.push(l); }
    if (lines.length >= prefs.max_total_lines) break;
  }
  return lines;
}

// ─── ZPL validation & parsing ───────────────────────────────────────
export function validateZpl(raw: string): { valid: boolean; cleaned: string; reason_code?: string; reason_message?: string } {
  if (!raw || raw.trim().length === 0) return { valid: false, cleaned: '', reason_code: 'INVALID_ZPL_EMPTY', reason_message: 'ZPL vazio recebido da API ML' };
  const cleaned = raw.replace(/^\uFEFF/, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  if (!cleaned.includes('^XA') || !cleaned.includes('^XZ')) return { valid: false, cleaned, reason_code: 'INVALID_ZPL_STRUCTURE', reason_message: 'ZPL não contém marcadores ^XA/^XZ válidos' };
  return { valid: true, cleaned };
}

export function splitZplBlocks(zpl: string): string[] {
  if (!zpl) return [];
  const regex = /\^XA[\s\S]*?\^XZ/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(zpl)) !== null) { const block = m[0].trim(); if (block.length > 0) out.push(block); }
  return out;
}

async function extractZplFromBytes(bytes: Uint8Array, tag: string): Promise<string | null> {
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 64))).trim();
  if (head.startsWith('^XA')) return new TextDecoder().decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B) {
    try {
      const zip = await JSZip.loadAsync(bytes);
      const parts: string[] = [];
      for (const name of Object.keys(zip.files)) {
        const f = zip.files[name];
        if (f.dir) continue;
        const txt = await f.async('string');
        if (txt.includes('^XA')) parts.push(txt);
      }
      if (parts.length > 0) { console.log(`[labeltest-shared] ZIP extracted ${tag}: ${parts.length} ZPL file(s)`); return parts.join('\n'); }
      console.error(`[labeltest-shared] ZIP ${tag}: no ZPL files found inside`);
    } catch (e: any) { console.error(`[labeltest-shared] ZIP extract error ${tag}: ${e.message}`); }
    return null;
  }
  const asText = new TextDecoder().decode(bytes);
  return asText.includes('^XA') ? asText : null;
}

export async function fetchZplBatchFromMl(shipmentIds: string[], token: string): Promise<{ zpl: string | null; reason_code?: string; reason_message?: string }> {
  const url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentIds.join(',')}&response_type=zpl2`;
  for (let a = 1; a <= 3; a++) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const latency = Date.now() - t0;
      if ((r.status === 429 || r.status >= 500) && a < 3) { console.warn(`[labeltest-shared] ML ZPL batch attempt ${a}: status=${r.status} latency=${latency}ms — retrying`); await sleep(getBackoff(a)); continue; }
      if (!r.ok) { const bodyText = await r.text().catch(() => ''); console.error(`[labeltest-shared] ML ZPL batch error: status=${r.status} latency=${latency}ms ids=${shipmentIds.length} body=${bodyText.slice(0, 200)}`); return { zpl: null, reason_code: 'ML_ZPL_FETCH_FAILED', reason_message: `API ML retornou status ${r.status}` }; }
      const bytes = new Uint8Array(await r.arrayBuffer());
      const ct = r.headers.get('content-type') || '';
      const zpl = await extractZplFromBytes(bytes, `batch_${shipmentIds.length}`);
      if (!zpl) { console.error(`[labeltest-shared] ML ZPL batch: could not extract ZPL (content-type=${ct}, ${bytes.length} bytes)`); return { zpl: null, reason_code: 'ML_ZPL_PARSE_FAILED', reason_message: 'Resposta da ML não contém ZPL extraível' }; }
      console.log(`[labeltest-shared] ML ZPL batch fetched: ${shipmentIds.length} ids → ${zpl.length} chars ${latency}ms (raw ${bytes.length}b, ct=${ct})`);
      return { zpl };
    } catch (e: any) { const latency = Date.now() - t0; console.error(`[labeltest-shared] ZPL batch fetch error attempt ${a}: ${e.message} ${latency}ms`); if (a < 3) await sleep(getBackoff(a)); }
  }
  return { zpl: null, reason_code: 'ML_ZPL_FETCH_TIMEOUT', reason_message: 'Falha ao buscar ZPL após 3 tentativas' };
}

// ─── Per-shipment ZPL fetch (DETERMINÍSTICO, identity-based) ──────────
// CRÍTICO: este é o caminho usado quando a distribuição posicional do batch
// não bate (mistura Flex/Coleta com NF/sem NF). Cada chamada à ML carrega
// EXATAMENTE 1 shipment, então não há ambiguidade entre blocos retornados
// e shipment de origem. Concorrência alta (8) compensa o overhead.
//
// Retorna SEMPRE um Map shipment_id → blocos[]; entradas vazias indicam
// falha individual (sem corromper o resto do lote).
export async function fetchZplPerShipmentDeterministic(
  shipmentIds: string[],
  token: string,
  concurrency = 8,
): Promise<{
  blocksByShipment: Map<string, string[]>;
  errors: { shipment_id: string; reason_code: string; reason_message: string }[];
}> {
  const blocksByShipment = new Map<string, string[]>();
  const errors: { shipment_id: string; reason_code: string; reason_message: string }[] = [];
  const t0 = Date.now();

  await runWithConcurrency(shipmentIds, concurrency, async (sid) => {
    const url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${sid}&response_type=zpl2`;
    let lastErr = '';
    // 5 retries, including 404 (ML às vezes responde 404 enquanto a etiqueta é gerada)
    for (let a = 1; a <= 5; a++) {
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 429 || r.status >= 500 || r.status === 404) {
          lastErr = `HTTP ${r.status}`;
          if (a < 5) { await sleep(getBackoff(a)); continue; }
          break;
        }
        if (!r.ok) {
          const body = await r.text().catch(() => '');
          lastErr = `HTTP ${r.status}: ${body.slice(0, 120)}`;
          break;
        }
        const bytes = new Uint8Array(await r.arrayBuffer());
        const zpl = await extractZplFromBytes(bytes, `single_${sid}`);
        if (!zpl) { lastErr = 'ZPL inválido/vazio'; break; }
        const validation = validateZpl(zpl);
        if (!validation.valid) { lastErr = validation.reason_message || 'ZPL malformado'; break; }
        const blocks = splitZplBlocks(validation.cleaned);
        if (blocks.length === 0) { lastErr = 'Nenhum bloco ^XA encontrado'; break; }
        blocksByShipment.set(sid, blocks);
        return;
      } catch (e: any) {
        lastErr = e?.message || 'erro de rede';
        if (a < 5) await sleep(getBackoff(a));
      }
    }
    console.error(`[labeltest-shared] per-shipment ZPL FAIL sid=${sid}: ${lastErr}`);
    errors.push({ shipment_id: sid, reason_code: 'ML_ZPL_PER_SHIPMENT_FAILED', reason_message: lastErr || 'Falha desconhecida' });
  });

  console.log(`[labeltest-shared] per-shipment ZPL: ${blocksByShipment.size}/${shipmentIds.length} OK, ${errors.length} falhas em ${Date.now() - t0}ms`);
  return { blocksByShipment, errors };
}

// ─── Distribuição IDENTITY-BASED (substitui posicional) ────────────────
// Estratégia em 2 etapas:
//   1) Tenta batch (1 chamada à ML com todos os ids). Se quantidade de blocos
//      bate EXATAMENTE com o esperado (sem ambiguidade), distribui posicional.
//   2) Se NÃO bate (qualquer divergência), faz fallback automático para
//      per-shipment determinístico — garante que NUNCA perdemos etiqueta
//      por má distribuição.
//
// Esta função substitui `distributeZplBlocks` em todos os call sites quando
// chamada via `distributeZplBlocksSafe`. A antiga `distributeZplBlocks`
// permanece para compatibilidade mas só deve ser usada quando o caller
// já validou que o batch é homogêneo.
export async function distributeZplBlocksSafe(
  allBlocks: string[],
  shipmentIds: string[],
  token: string,
  opts: { flexShipmentIds?: Set<string>; includeDanfe?: boolean },
): Promise<{
  blocksByShipment: Map<string, string[]>;
  errors: { shipment_id: string; reason_code: string; reason_message: string }[];
  usedFallback: boolean;
}> {
  const flexSet = opts.flexShipmentIds || new Set<string>();
  const includeDanfe = opts.includeDanfe !== false;

  // Flex pode ter 1 OU 2 blocos. Para o caminho posicional rápido, assumimos
  // o tamanho mais provável (2 quando includeDanfe, 1 caso contrário). Se a
  // contagem real não bater, caímos automaticamente no fallback per-shipment.
  const expected = shipmentIds.map(_sid => (includeDanfe ? 2 : 1));
  const expectedTotal = expected.reduce((a, b) => a + b, 0);

  // CASO IDEAL: bate exatamente — distribui posicional (rápido).
  if (allBlocks.length === expectedTotal && allBlocks.length > 0) {
    const blocksByShipment = new Map<string, string[]>();
    let cursor = 0;
    for (let i = 0; i < shipmentIds.length; i++) {
      const sid = shipmentIds[i];
      const take = expected[i];
      const blocks = allBlocks.slice(cursor, cursor + take);
      cursor += take;
      if (blocks.length > 0) blocksByShipment.set(sid, blocks);
    }
    if (blocksByShipment.size === shipmentIds.length) {
      console.log(`[labeltest-shared] distributeZplBlocksSafe: posicional OK (${shipmentIds.length} shipments, ${allBlocks.length} blocos)`);
      return { blocksByShipment, errors: [], usedFallback: false };
    }
  }

  // FALLBACK: divergência detectada — refaz per-shipment (determinístico).
  console.warn(`[labeltest-shared] distributeZplBlocksSafe: distribuição ambígua (esperado=${expectedTotal}, recebido=${allBlocks.length}). Refazendo per-shipment...`);
  const result = await fetchZplPerShipmentDeterministic(shipmentIds, token);

  // Regra real: Flex PODE ter 1 OU 2 blocos (1 sem NF, 2 com NF/DANFE).
  // Imprimir o que vier disponível — nunca forçar Flex a 1 bloco.
  // Único caso em que recortamos: layout explicitamente sem DANFE (labels-only).
  const trimmed = new Map<string, string[]>();
  for (const [sid, blocks] of result.blocksByShipment.entries()) {
    if (!blocks || blocks.length === 0) continue;
    const finalBlocks = includeDanfe ? blocks.slice(0, 2) : [blocks[0]];
    trimmed.set(sid, finalBlocks);
  }
  console.log(`[labeltest-shared] distributeZplBlocksSafe fallback: ${trimmed.size} shipments, includeDanfe=${includeDanfe} (Flex aceita 1 ou 2 blocos)`);
  return { blocksByShipment: trimmed, errors: result.errors, usedFallback: true };
}

// ─── Enriquecimento de variação via ML API ──────────────────────────
// O cache local (meli_order_items_cache) raramente tem variation_attributes populado
// (legado + sync nem sempre captura). Buscamos /items?attributes=variations on-the-fly
// para os items únicos do batch e devolvemos um Map (item_id|variation_id) → attrs[].
//
// Custo: ~1 fetch por item único (~150ms). Para batch de 5 envios → ≤5 fetches paralelos.
export async function fetchVariationAttributesMap(
  pairs: { item_id: string; variation_id: string | null }[],
  token: string,
): Promise<Map<string, { name: string; value_name: string }[]>> {
  const result = new Map<string, { name: string; value_name: string }[]>();

  // Items únicos (uma chamada por item_id, mesmo se houver várias variations)
  const uniqueItems = [...new Set(pairs.map(p => p.item_id).filter(Boolean))];
  if (uniqueItems.length === 0) return result;

  await runWithConcurrency(uniqueItems, 4, async (itemId) => {
    try {
      const url = `https://api.mercadolibre.com/items/${itemId}?attributes=variations`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        console.warn(`[labeltest-shared] variation fetch ${itemId}: status=${r.status}`);
        return;
      }
      const json = await r.json().catch(() => null);
      const variations: any[] = json?.variations || [];
      for (const v of variations) {
        const vid = v?.id ? String(v.id) : null;
        const combos: any[] = v?.attribute_combinations || [];
        const attrs = combos
          .map((c: any) => ({ name: String(c?.name || c?.id || ''), value_name: String(c?.value_name || c?.value || '') }))
          .filter(a => a.name && a.value_name);
        if (attrs.length === 0) continue;
        // Chave: itemId|variationId (e também itemId| para fallback sem variation)
        if (vid) result.set(`${itemId}|${vid}`, attrs);
      }
    } catch (e: any) {
      console.warn(`[labeltest-shared] variation fetch ${itemId} error: ${e.message}`);
    }
  });

  console.log(`[labeltest-shared] variation enrichment: ${uniqueItems.length} items → ${result.size} variation maps`);
  return result;
}

// Distribuição de blocos ZPL para shipments — Flex-aware.
// Regras:
//   - Coleta (xd_drop_off, cross_docking, etc.): ML devolve 2 blocos (etiqueta + DANFE).
//   - Flex (self_service): ML devolve 1 bloco (só etiqueta, sem DANFE).
//   - Layout sem DANFE (`includeDanfe = false`): aceitamos 1 bloco por shipment (descarta excedente).
// Quando `flexShipmentIds` é fornecido, distribuímos sequencialmente respeitando o
// "tamanho esperado" de cada shipment (1 para Flex, 2 para Coleta).
export function distributeZplBlocks(
  allBlocks: string[],
  shipmentIds: string[],
  opts?: { flexShipmentIds?: Set<string>; includeDanfe?: boolean },
): {
  blocksByShipment: Map<string, string[]>;
  rawBySid: Map<string, string>;
  errors: { shipment_id: string; reason_code: string; reason_message: string }[];
} {
  const blocksByShipment = new Map<string, string[]>();
  const rawBySid = new Map<string, string>();
  const errors: { shipment_id: string; reason_code: string; reason_message: string }[] = [];
  const flexSet = opts?.flexShipmentIds || new Set<string>();
  const includeDanfe = opts?.includeDanfe !== false; // default true (compat legado)

  if (allBlocks.length === 0) {
    for (const sid of shipmentIds) errors.push({ shipment_id: sid, reason_code: 'ZPL_NO_BLOCKS', reason_message: 'ZPL retornado não contém blocos ^XA...^XZ' });
    return { blocksByShipment, rawBySid, errors };
  }

  // Tamanho esperado por shipment:
  //   Flex            → 1 bloco
  //   Coleta + DANFE  → 2 blocos
  //   Coleta sem NF / layout sem DANFE → 1 bloco (ML pode mandar só etiqueta, ou descartamos o 2º)
  const expected = shipmentIds.map(sid => {
    if (flexSet.has(sid)) return 1;
    return includeDanfe ? 2 : 1;
  });
  const expectedTotal = expected.reduce((a, b) => a + b, 0);

  // Caso A: bate exatamente com o que ML mandou — distribui sequencialmente.
  if (allBlocks.length === expectedTotal) {
    let cursor = 0;
    for (let i = 0; i < shipmentIds.length; i++) {
      const sid = shipmentIds[i];
      const take = expected[i];
      const blocks = allBlocks.slice(cursor, cursor + take);
      cursor += take;
      if (blocks.length === 0) { errors.push({ shipment_id: sid, reason_code: 'ZPL_NO_BLOCKS', reason_message: 'ML não retornou blocos para este envio' }); continue; }
      blocksByShipment.set(sid, blocks); rawBySid.set(sid, blocks.join('\n'));
    }
    return { blocksByShipment, rawBySid, errors };
  }

  // Caso B: ML mandou 1 bloco por shipment para todos (ex.: tudo Flex, ou layout sem DANFE).
  if (allBlocks.length === shipmentIds.length) {
    for (let i = 0; i < shipmentIds.length; i++) {
      const sid = shipmentIds[i];
      const blocks = [allBlocks[i]];
      blocksByShipment.set(sid, blocks); rawBySid.set(sid, blocks.join('\n'));
      // Sinaliza apenas como log informativo: Coleta com DANFE solicitado mas ML mandou 1 bloco
      if (!flexSet.has(sid) && includeDanfe) {
        errors.push({ shipment_id: sid, reason_code: 'DANFE_MISSING', reason_message: 'Nota fiscal indisponível na ML — etiqueta gerada sem DANFE' });
      }
    }
    return { blocksByShipment, rawBySid, errors };
  }

  // Caso C: ML mandou N blocos por shipment de forma uniforme.
  // IMPORTANTE: Flex PODE ter 1 OU 2 blocos (1 se sem NF; 2 se com NF/DANFE).
  // Nunca descartamos blocos retornados pela ML — se vieram, devem ser impressos.
  // O `includeDanfe=false` (layout "só etiquetas") é o ÚNICO caso em que recortamos para 1.
  if (allBlocks.length % shipmentIds.length === 0) {
    const blocksPerShipment = allBlocks.length / shipmentIds.length;
    for (let i = 0; i < shipmentIds.length; i++) {
      const sid = shipmentIds[i];
      const blocks = allBlocks.slice(i * blocksPerShipment, (i + 1) * blocksPerShipment);
      // Só recorta quando o layout explicitamente NÃO inclui DANFE (labels-only).
      // Para Flex+NF, mantemos os 2 blocos (etiqueta + DANFE) — não descartar!
      const finalBlocks = includeDanfe ? blocks : [blocks[0]];
      blocksByShipment.set(sid, finalBlocks); rawBySid.set(sid, finalBlocks.join('\n'));
    }
    return { blocksByShipment, rawBySid, errors };
  }

  // Caso D: distribuição ambígua — best-effort: tenta consumir conforme expected,
  // restantes são marcados como erro.
  let cursor = 0;
  for (let i = 0; i < shipmentIds.length; i++) {
    const sid = shipmentIds[i];
    const take = Math.min(expected[i], allBlocks.length - cursor);
    if (take <= 0) { errors.push({ shipment_id: sid, reason_code: 'ZPL_NO_BLOCKS', reason_message: 'ML não retornou blocos suficientes' }); continue; }
    const blocks = allBlocks.slice(cursor, cursor + take);
    cursor += take;
    blocksByShipment.set(sid, blocks); rawBySid.set(sid, blocks.join('\n'));
    if (!flexSet.has(sid) && includeDanfe && blocks.length < 2) {
      errors.push({ shipment_id: sid, reason_code: 'DANFE_MISSING', reason_message: 'Nota fiscal indisponível na ML — etiqueta gerada sem DANFE' });
    }
  }
  return { blocksByShipment, rawBySid, errors };
}

// ─── Labelary ZPL → PNG ────────────────────────────────────────────
export async function zplToImage(
  zplContent: string, tag: string, layout: string, maxAttempts = 5,
): Promise<{ image: Uint8Array | null; reason_code?: string; reason_message?: string; error_category?: 'rate_limit' | 'labelary_other' | 'timeout' | 'other' }> {
  const { dpmm, wInch, hInch } = getLabelaryParams(layout);
  const url = `http://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${wInch}x${hInch}/0/`;
  let lastWas429 = false;
  for (let a = 1; a <= maxAttempts; a++) {
    const t0 = Date.now();
    const timeoutMs = 10000 + (a * 2000);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'image/png' }, body: zplContent, signal: controller.signal });
      clearTimeout(timer);
      const latency = Date.now() - t0;
      if (r.status === 429) {
        lastWas429 = true;
        const retryAfter = parseInt(r.headers.get('retry-after') || '0', 10);
        await r.text().catch(() => '');
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : getBackoff(a);
        console.warn(`[labeltest-shared] Labelary ${tag} 429 attempt ${a}/${maxAttempts}: latency=${latency}ms wait=${waitMs}ms`);
        if (a < maxAttempts) { await sleep(waitMs); continue; }
        return { image: null, reason_code: 'LABELARY_RATE_LIMIT', reason_message: `Labelary rate limit (429) após ${maxAttempts} tentativas`, error_category: 'rate_limit' };
      }
      if (r.status >= 500) {
        lastWas429 = false;
        const snippet = (await r.text().catch(() => '')).substring(0, 100);
        console.warn(`[labeltest-shared] Labelary ${tag} ${r.status} attempt ${a}/${maxAttempts}: latency=${latency}ms snippet="${snippet}"`);
        if (a < maxAttempts) { await sleep(getBackoff(a)); continue; }
        return { image: null, reason_code: 'LABELARY_SERVER_ERROR', reason_message: `Labelary retornou ${r.status} após ${maxAttempts} tentativas`, error_category: 'labelary_other' };
      }
      if (!r.ok) {
        const snippet = (await r.text().catch(() => '')).substring(0, 200);
        console.error(`[labeltest-shared] Labelary ${tag}: status=${r.status} latency=${latency}ms body="${snippet}"`);
        return { image: null, reason_code: 'LABELARY_CONVERSION_FAILED', reason_message: `Labelary retornou status ${r.status}: ${snippet.substring(0, 80)}`, error_category: 'labelary_other' };
      }
      const bytes = new Uint8Array(await r.arrayBuffer());
      console.log(`[labeltest-shared] Labelary OK: ${tag} ${(bytes.length / 1024).toFixed(0)}KB ${latency}ms${a > 1 ? ` (attempt ${a})` : ''}`);
      return { image: bytes };
    } catch (e: any) {
      const latency = Date.now() - t0;
      const isTimeout = e.name === 'AbortError';
      console.error(`[labeltest-shared] Labelary ${tag} attempt ${a}/${maxAttempts}: ${isTimeout ? 'TIMEOUT' : e.message} ${latency}ms`);
      if (a < maxAttempts) await sleep(getBackoff(a));
      else return { image: null, reason_code: isTimeout ? 'LABELARY_TIMEOUT' : 'LABELARY_NETWORK_ERROR', reason_message: isTimeout ? `Timeout após ${maxAttempts} tentativas` : `Erro de rede: ${e.message}`, error_category: isTimeout ? 'timeout' : 'other' };
    }
  }
  return { image: null, reason_code: lastWas429 ? 'LABELARY_RATE_LIMIT' : 'LABELARY_CONVERSION_FAILED', reason_message: `Conversão Labelary falhou após ${maxAttempts} tentativas`, error_category: lastWas429 ? 'rate_limit' : 'labelary_other' };
}

// ─── Render a single chunk (≤5 shipments) into a PDF ────────────────
// CPU-safe: ≤5 shipments × ≤2 blocos = ≤10 PNG embeds per invocation.
export interface RenderChunkInput {
  shipmentIds: string[];
  zplBlocksByShipment: Map<string, string[]>;
  layout: string;
  shipMap: Map<string, any>;
  ordersMap: Map<string, any>;
  orderItemsMap: Map<string, any[]>;
  headerPrefs: typeof DEFAULT_HEADER_PREFS;
}

export interface RenderChunkResult {
  pdfBytes: Uint8Array | null;
  pages: number;
  successCount: number;
  errors: { shipment_id: string; reason_code: string; reason_message: string }[];
  log: any[];
}

export async function renderChunkToPdf(input: RenderChunkInput): Promise<RenderChunkResult> {
  const { shipmentIds, zplBlocksByShipment, layout, shipMap, ordersMap, orderItemsMap, headerPrefs } = input;
  const layoutInfo = LAYOUTS[layout];
  const targetWPt = layoutInfo.widthMm * MM_TO_PT;
  const targetHPt = layoutInfo.heightMm * MM_TO_PT;
  const LABEL_W_PT = LABEL_W_MM * MM_TO_PT;
  const LABEL_H_PT = LABEL_H_MM * MM_TO_PT;

  const errors: { shipment_id: string; reason_code: string; reason_message: string }[] = [];
  const log: any[] = [];

  // Step A: Labelary PNGs for each block
  type RenderTask = { sid: string; bi: number; zpl: string };
  const tasks: RenderTask[] = [];
  for (const sid of shipmentIds) {
    const blocks = zplBlocksByShipment.get(sid);
    if (!blocks) continue;
    for (let bi = 0; bi < blocks.length; bi++) tasks.push({ sid, bi, zpl: blocks[bi] });
  }

  const LABELARY_CONCURRENCY = 2;
  const results = await runWithConcurrency(tasks, LABELARY_CONCURRENCY, t => zplToImage(t.zpl, `${t.sid}#${t.bi}`, layout));

  type Entry = { imgs: (Uint8Array | null)[]; err: string | null; category: string | null };
  const tmpBySid = new Map<string, Entry>();
  const retryQueue: RenderTask[] = [];
  for (let k = 0; k < tasks.length; k++) {
    const t = tasks[k]; const r = results[k];
    let entry = tmpBySid.get(t.sid);
    if (!entry) { const total = zplBlocksByShipment.get(t.sid)!.length; entry = { imgs: new Array(total).fill(null), err: null, category: null }; tmpBySid.set(t.sid, entry); }
    if (r.image) entry.imgs[t.bi] = r.image;
    else { if (r.error_category === 'rate_limit') retryQueue.push(t); if (!entry.err) { entry.err = r.reason_message || 'Conversão Labelary falhou'; entry.category = r.error_category || 'other'; } }
  }
  if (retryQueue.length > 0) {
    console.log(`[labeltest-render] retry serial de ${retryQueue.length} bloco(s) em rate_limit`);
    for (const t of retryQueue) {
      await sleep(250);
      const r = await zplToImage(t.zpl, `${t.sid}#${t.bi}~retry`, layout, 3);
      if (r.image) { const entry = tmpBySid.get(t.sid)!; entry.imgs[t.bi] = r.image; if (entry.imgs.every(x => x !== null)) { entry.err = null; entry.category = null; } }
    }
  }

  const imagesByShipment = new Map<string, Uint8Array[]>();
  for (const sid of shipmentIds) {
    const entry = tmpBySid.get(sid); if (!entry) continue;
    const blocksTotal = zplBlocksByShipment.get(sid)!.length;
    const labelImg = entry.imgs[0];
    // Regra: a etiqueta (bloco 0) é OBRIGATÓRIA. Blocos extras (DANFE) são
    // OPCIONAIS — se o Labelary devolver "ZPL generated no labels" para um
    // bloco extra, ignoramos esse bloco e mantemos a etiqueta do envio.
    if (!labelImg) {
      const reason = entry.err || 'Etiqueta não renderizada';
      const category = entry.category || 'other';
      const reasonCode = category === 'rate_limit' ? 'LABELARY_RATE_LIMIT' : category === 'timeout' ? 'LABELARY_TIMEOUT' : 'LABELARY_CONVERSION_FAILED';
      errors.push({ shipment_id: sid, reason_code: reasonCode, reason_message: reason });
      log.push({ shipment_id: sid, status: 'error', stage: 'labelary', zpl_blocks_total: blocksTotal, blocks_rendered: 0, error_category: category, error: reason });
      continue;
    }
    const renderedExtras = entry.imgs.slice(1).filter((x): x is Uint8Array => x !== null);
    const droppedExtras = (entry.imgs.length - 1) - renderedExtras.length;
    if (droppedExtras > 0) {
      log.push({ shipment_id: sid, status: 'warning', stage: 'labelary_extra', zpl_blocks_total: blocksTotal, blocks_rendered: 1 + renderedExtras.length, dropped_extras: droppedExtras, warning: 'Bloco extra (DANFE) não renderizado pelo Labelary — etiqueta gerada sem ele' });
    }
    imagesByShipment.set(sid, [labelImg, ...renderedExtras]);
  }

  if (imagesByShipment.size === 0) return { pdfBytes: null, pages: 0, successCount: 0, errors, log };

  // Step B: Build PDF
  const pdf = await PDFDocument.create();
  let font: any = null, fontBold: any = null;
  if (layoutInfo.includeHeader) { font = await pdf.embedFont(StandardFonts.Helvetica); fontBold = await pdf.embedFont(StandardFonts.HelveticaBold); }

  let pages = 0; let successCount = 0;
  for (const sid of shipmentIds) {
    const blockImages = imagesByShipment.get(sid); if (!blockImages?.length) continue;
    try {
      const labelImg = await pdf.embedPng(blockImages[0]);
      if (layoutInfo.includeHeader) {
        const page = pdf.addPage([targetWPt, targetHPt]);
        const labelAreaY = 0; const labelAreaH = LABEL_H_PT;
        const imgAspect = labelImg.width / labelImg.height; const targetAspect = LABEL_W_PT / labelAreaH;
        let drawW: number, drawH: number, drawX: number, drawY: number;
        if (imgAspect > targetAspect) { drawW = LABEL_W_PT; drawH = LABEL_W_PT / imgAspect; drawX = 0; drawY = labelAreaY + (labelAreaH - drawH) / 2; }
        else { drawH = labelAreaH; drawW = labelAreaH * imgAspect; drawX = (LABEL_W_PT - drawW) / 2; drawY = labelAreaY; }
        page.drawImage(labelImg, { x: drawX, y: drawY, width: drawW, height: drawH });
        const orderId = shipMap.get(sid)?.order_id;
        const orderData = ordersMap.get(orderId) || { order_id: orderId, buyer_name: '', shipment_id: sid };
        const items = orderItemsMap.get(orderId) || [];
        const lines = buildHeaderLines(headerPrefs, { ...orderData, shipment_id: sid }, items);
        const fontSize = headerPrefs.font_size || 9; const lineH = fontSize * HEADER_LINE_HEIGHT_FACTOR;
        let yPos = targetHPt - HEADER_PADDING_TOP;
        for (const line of lines) { const f = line.bold ? fontBold : font; page.drawText(line.text, { x: 8, y: yPos, size: fontSize, font: f, color: rgb(0, 0, 0) }); yPos -= lineH; }
        page.drawLine({ start: { x: 4, y: LABEL_H_PT }, end: { x: LABEL_W_PT - 4, y: LABEL_H_PT }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
        pages++;
      } else {
        const page = pdf.addPage([targetWPt, targetHPt]);
        const imgAspect = labelImg.width / labelImg.height; const pageAspect = targetWPt / targetHPt;
        let drawW: number, drawH: number, drawX: number, drawY: number;
        if (imgAspect > pageAspect) { drawW = targetWPt; drawH = targetWPt / imgAspect; drawX = 0; drawY = (targetHPt - drawH) / 2; }
        else { drawH = targetHPt; drawW = targetHPt * imgAspect; drawX = (targetWPt - drawW) / 2; drawY = 0; }
        page.drawImage(labelImg, { x: drawX, y: drawY, width: drawW, height: drawH });
        pages++;
      }
      let danfePagesAdded = 0;
      for (let bi = 1; bi < blockImages.length; bi++) {
        const extraImg = await pdf.embedPng(blockImages[bi]);
        const page = pdf.addPage([targetWPt, targetHPt]);
        const imgAspect = extraImg.width / extraImg.height; const pageAspect = targetWPt / targetHPt;
        let drawW: number, drawH: number, drawX: number, drawY: number;
        if (imgAspect > pageAspect) { drawW = targetWPt; drawH = targetWPt / imgAspect; drawX = 0; drawY = (targetHPt - drawH) / 2; }
        else { drawH = targetHPt; drawW = targetHPt * imgAspect; drawX = (targetWPt - drawW) / 2; drawY = 0; }
        page.drawImage(extraImg, { x: drawX, y: drawY, width: drawW, height: drawH });
        pages++; danfePagesAdded++;
      }
      await new Promise(r => setTimeout(r, 0));
      successCount++;
      log.push({ shipment_id: sid, status: 'ok', source: 'zpl_labelary', output_w_mm: layoutInfo.widthMm, output_h_mm: layoutInfo.heightMm, include_header: layoutInfo.includeHeader, zpl_blocks_total: blockImages.length, danfe_pages_added: danfePagesAdded, danfe_status: danfePagesAdded > 0 ? 'attached' : 'missing' });
    } catch (embedErr: any) {
      console.error(`[labeltest-render] Embed error for ${sid}:`, embedErr);
      errors.push({ shipment_id: sid, reason_code: 'PDF_EMBED_FAILED', reason_message: `Erro ao embutir imagem: ${embedErr.message}` });
      log.push({ shipment_id: sid, status: 'error', stage: 'pdf_embed', error: 'PDF embed failed: ' + embedErr.message });
    }
  }

  if (pages === 0) return { pdfBytes: null, pages: 0, successCount: 0, errors, log };

  const pdfBytes = await pdf.save({ useObjectStreams: false, addDefaultPage: false });
  return { pdfBytes, pages, successCount, errors, log };
}

// ─── Final merge of N batch PDFs (used by worker on last batch) ─────
export async function mergeChunkPdfs(chunkPdfs: Uint8Array[]): Promise<Uint8Array> {
  if (chunkPdfs.length === 1) return chunkPdfs[0];
  const finalPdf = await PDFDocument.create();
  for (let i = 0; i < chunkPdfs.length; i++) {
    try {
      const src = await PDFDocument.load(chunkPdfs[i], { updateMetadata: false });
      const pages = await finalPdf.copyPages(src, src.getPageIndices());
      for (const p of pages) finalPdf.addPage(p);
      chunkPdfs[i] = new Uint8Array(0);
      await new Promise(r => setTimeout(r, 0));
    } catch (e: any) { console.error(`[labeltest-shared] merge chunk ${i} error:`, e.message); }
  }
  return await finalPdf.save({ useObjectStreams: false, addDefaultPage: false });
}
