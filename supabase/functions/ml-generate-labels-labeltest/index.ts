import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function respond(ok: boolean, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ ok, ...payload }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Layout sizes (mm) ──────────────────────────────────────────────
const MM_TO_PT = 2.83465;
const LABEL_W_MM = 100;
const LABEL_H_MM = 150;
const HEADER_H_MM = 25;

const LAYOUTS: Record<string, { widthMm: number; heightMm: number; includeHeader: boolean; includeDanfe: boolean }> = {
  'meli_100x150':               { widthMm: 100, heightMm: 150, includeHeader: false, includeDanfe: true },
  'meli_100x150_no_nf':         { widthMm: 100, heightMm: 150, includeHeader: false, includeDanfe: false },
  'mlfacil_100x175_header':     { widthMm: 100, heightMm: 175, includeHeader: true,  includeDanfe: true },
};

// ─── Labelary config per layout ─────────────────────────────────────
const LABELARY_DPMM = 8; // 8 dpmm = 203 DPI (thermal standard)

function getLabelaryParams(layout: string) {
  // 100mm ≈ 3.94in, 150mm ≈ 5.91in, 175mm ≈ 6.89in
  const layoutInfo = LAYOUTS[layout];
  const wInch = parseFloat((layoutInfo.widthMm / 25.4).toFixed(2));
  const hInch = parseFloat((layoutInfo.heightMm / 25.4).toFixed(2));
  return { dpmm: LABELARY_DPMM, wInch, hInch };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const getBackoff = (attempt: number) => Math.min(Math.pow(2, attempt - 1) * 1000, 8000);

// Pool de concorrência limitada — evita estourar rate limit do Labelary (~5 req/s).
// Mantém ganho do paralelismo (vs sequencial) sem disparar dezenas de requests simultâneos.
async function runWithConcurrency<T, R>(
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

function truncate(t: string, max: number) { return t.length <= max ? t : t.substring(0, max - 3) + '...'; }
function sanitize(t: string | null | undefined, max = 90) { if (!t) return ''; return truncate(t.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(), max); }

function wrapTextLines(text: string, maxChars: number): string[] {
  if (!text || text.length <= maxChars) return [text];
  const words = text.split(' '); const result: string[] = []; let current = '';
  for (const w of words) { if (!current) current = w; else if (current.length + 1 + w.length <= maxChars) current += ' ' + w; else { result.push(current); current = w; } }
  if (current) result.push(current);
  return result.length > 0 ? result : [text];
}

// Fallback: extrai variação do título quando vier no padrão "Title - Cor: Azul / Tamanho: M"
function extractVariationsFromTitle(title: string): { name: string; value: string }[] {
  if (!title) return [];
  const out: { name: string; value: string }[] = [];
  // Captura segmentos após " - " que contenham "Nome: Valor" separados por " / " ou ","
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
      // Fonte primária: variation_attributes do cache
      let attrs: { name: string; value: string }[] = [];
      if (Array.isArray(item.variation_attributes) && item.variation_attributes.length > 0) {
        for (const a of item.variation_attributes) {
          const n = a?.name || a?.id || '';
          const v = a?.value_name || a?.value || '';
          if (n && v) attrs.push({ name: n, value: v });
        }
      }
      // Fallback: parse do title quando attrs vier vazio
      if (attrs.length === 0) {
        attrs = extractVariationsFromTitle(item.title || item.title_short || '');
      }
      for (const a of attrs) {
        if (lines.length >= maxLines) break;
        lines.push({ text: truncate(`${a.name}: ${a.value}`, maxLen), bold: false });
      }
    }
  }
  return lines;
}

const DEFAULT_HEADER_PREFS = {
  show_customer: true, show_products: true, show_order_id: true,
  show_shipment_id: false, show_comment: true, show_sku: true,
  show_variation_attrs: true,
  line_order: ['customer', 'products', 'order', 'comment'],
  max_product_lines: 5, max_total_lines: 8, font_size: 9,
};

function buildHeaderLines(prefs: typeof DEFAULT_HEADER_PREFS, order: any, items: any[]) {
  const contents: Record<string, { text: string; bold: boolean }[]> = { customer: [], products: [], order: [], shipment: [], comment: [] };
  if (prefs.show_customer && order.buyer_name) contents.customer = [{ text: sanitize(order.buyer_name, 40), bold: false }];
  if (prefs.show_products && items.length > 0) contents.products = buildProductLines(items, prefs.max_product_lines, prefs.show_sku ?? true, prefs.show_variation_attrs ?? true);
  if (prefs.show_order_id) contents.order = [{ text: `Pedido: ${order.order_id}`, bold: false }];
  if (prefs.show_shipment_id && order.shipment_id) contents.shipment = [{ text: `Envio: ${order.shipment_id}`, bold: false }];
  if (prefs.show_comment && order.order_comment) { const c = sanitize(order.order_comment, 60); if (c) contents.comment = [{ text: `Obs: ${c}`, bold: false }]; }
  const lines: { text: string; bold: boolean }[] = [];
  if (contents.customer.length > 0) for (const l of contents.customer) { if (lines.length >= prefs.max_total_lines) break; lines.push(l); }
  for (const lt of prefs.line_order) { if (lt === 'customer') continue; for (const l of (contents[lt] || [])) { if (lines.length >= prefs.max_total_lines) break; lines.push(l); } if (lines.length >= prefs.max_total_lines) break; }
  return lines;
}

function hashCode(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36).substring(0, 6);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let b = ''; const cs = 32768;
  for (let i = 0; i < bytes.length; i += cs) { const c = bytes.subarray(i, i + cs); b += String.fromCharCode.apply(null, Array.from(c)); }
  return btoa(b);
}

// ─── ZPL validation ─────────────────────────────────────────────────
function validateZpl(raw: string): { valid: boolean; cleaned: string; reason_code?: string; reason_message?: string } {
  if (!raw || raw.trim().length === 0) {
    return { valid: false, cleaned: '', reason_code: 'INVALID_ZPL_EMPTY', reason_message: 'ZPL vazio recebido da API ML' };
  }
  // Remove BOM and invalid control chars (keep printable + common whitespace)
  let cleaned = raw.replace(/^\uFEFF/, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  if (!cleaned.includes('^XA') || !cleaned.includes('^XZ')) {
    return { valid: false, cleaned, reason_code: 'INVALID_ZPL_STRUCTURE', reason_message: 'ZPL não contém marcadores ^XA/^XZ válidos' };
  }
  return { valid: true, cleaned };
}

// ─── PDF-first PROIBIDO no labelTest ────────────────────────────────
// Pipeline único = ZPL-first (shipment_labels?response_type=zpl2 → Labelary → PDF).
// Direct PDF fetch da ML foi removido por gerar páginas A4 deformadas
// e quebrar determinismo visual com o engine legado.

// ─── ZPL block splitter ─────────────────────────────────────────────
// ML retorna por shipment um payload com N blocos ^XA...^XZ
// (etiqueta + DANFE; ocasionalmente blocos extras de separação que NÃO vêm em ZPL — vêm em PDF A4 separado).
// Como pedimos response_type=zpl2, A4 PDF nunca chega aqui. Todo bloco ZPL válido é mantido.
function splitZplBlocks(zpl: string): string[] {
  if (!zpl) return [];
  const regex = /\^XA[\s\S]*?\^XZ/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(zpl)) !== null) {
    const block = m[0].trim();
    if (block.length > 0) out.push(block);
  }
  return out;
}

// ─── ZPL fetch from ML API ──────────────────────────────────────────
// ML retorna ZIP (PK..) quando response_type=zpl2. Caso seja texto puro (^XA), aceita direto.
async function extractZplFromBytes(bytes: Uint8Array, shipmentId: string): Promise<string | null> {
  // Heurística: começa com texto ZPL?
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 64))).trim();
  if (head.startsWith('^XA')) {
    return new TextDecoder().decode(bytes);
  }
  // ZIP magic bytes: 0x50 0x4B (PK)
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
      if (parts.length > 0) {
        console.log(`[labeltest] ZIP extracted ${shipmentId}: ${parts.length} ZPL file(s)`);
        return parts.join('\n');
      }
      console.error(`[labeltest] ZIP ${shipmentId}: no ZPL files found inside`);
    } catch (e: any) {
      console.error(`[labeltest] ZIP extract error ${shipmentId}: ${e.message}`);
    }
    return null;
  }
  // fallback: tenta como texto
  const asText = new TextDecoder().decode(bytes);
  return asText.includes('^XA') ? asText : null;
}

async function fetchZplFromMl(shipmentId: string, token: string): Promise<{ zpl: string | null; reason_code?: string; reason_message?: string }> {
  for (let a = 1; a <= 3; a++) {
    const t0 = Date.now();
    try {
      const r = await fetch(
        `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentId}&response_type=zpl2`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const latency = Date.now() - t0;
      if ((r.status === 429 || r.status >= 500) && a < 3) {
        console.warn(`[labeltest] ML ZPL ${shipmentId} attempt ${a}: status=${r.status} latency=${latency}ms — retrying`);
        await sleep(getBackoff(a));
        continue;
      }
      if (!r.ok) {
        console.error(`[labeltest] ML ZPL error ${shipmentId}: status=${r.status} latency=${latency}ms`);
        return { zpl: null, reason_code: 'ML_ZPL_FETCH_FAILED', reason_message: `API ML retornou status ${r.status}` };
      }
      const bytes = new Uint8Array(await r.arrayBuffer());
      const ct = r.headers.get('content-type') || '';
      const zpl = await extractZplFromBytes(bytes, shipmentId);
      if (!zpl) {
        console.error(`[labeltest] ML ZPL ${shipmentId}: could not extract ZPL (content-type=${ct}, ${bytes.length} bytes)`);
        return { zpl: null, reason_code: 'ML_ZPL_PARSE_FAILED', reason_message: 'Resposta da ML não contém ZPL extraível' };
      }
      console.log(`[labeltest] ML ZPL fetched: ${shipmentId} ${zpl.length} chars ${latency}ms (raw ${bytes.length}b, ct=${ct})`);
      return { zpl };
    } catch (e: any) {
      const latency = Date.now() - t0;
      console.error(`[labeltest] ZPL fetch error ${shipmentId} attempt ${a}: ${e.message} ${latency}ms`);
      if (a < 3) await sleep(getBackoff(a));
    }
  }
  return { zpl: null, reason_code: 'ML_ZPL_FETCH_TIMEOUT', reason_message: 'Falha ao buscar ZPL após 3 tentativas' };
}

/**
 * Busca ZPL em BATCH (único request com vários shipment_ids), igual ao módulo v2 que funciona.
 * A ML retorna um único payload com todos os blocos ^XA...^XZ concatenados na ordem solicitada.
 * Retorna o ZPL bruto (string) ou erro de batch.
 */
async function fetchZplBatchFromMl(shipmentIds: string[], token: string): Promise<{ zpl: string | null; reason_code?: string; reason_message?: string }> {
  const url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipmentIds.join(',')}&response_type=zpl2`;
  for (let a = 1; a <= 3; a++) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const latency = Date.now() - t0;
      if ((r.status === 429 || r.status >= 500) && a < 3) {
        console.warn(`[labeltest] ML ZPL batch attempt ${a}: status=${r.status} latency=${latency}ms — retrying`);
        await sleep(getBackoff(a));
        continue;
      }
      if (!r.ok) {
        const bodyText = await r.text().catch(() => '');
        console.error(`[labeltest] ML ZPL batch error: status=${r.status} latency=${latency}ms ids=${shipmentIds.length} body=${bodyText.slice(0, 200)}`);
        return { zpl: null, reason_code: 'ML_ZPL_FETCH_FAILED', reason_message: `API ML retornou status ${r.status}` };
      }
      const bytes = new Uint8Array(await r.arrayBuffer());
      const ct = r.headers.get('content-type') || '';
      const zpl = await extractZplFromBytes(bytes, `batch_${shipmentIds.length}`);
      if (!zpl) {
        console.error(`[labeltest] ML ZPL batch: could not extract ZPL (content-type=${ct}, ${bytes.length} bytes)`);
        return { zpl: null, reason_code: 'ML_ZPL_PARSE_FAILED', reason_message: 'Resposta da ML não contém ZPL extraível' };
      }
      console.log(`[labeltest] ML ZPL batch fetched: ${shipmentIds.length} ids → ${zpl.length} chars ${latency}ms (raw ${bytes.length}b, ct=${ct})`);
      return { zpl };
    } catch (e: any) {
      const latency = Date.now() - t0;
      console.error(`[labeltest] ZPL batch fetch error attempt ${a}: ${e.message} ${latency}ms`);
      if (a < 3) await sleep(getBackoff(a));
    }
  }
  return { zpl: null, reason_code: 'ML_ZPL_FETCH_TIMEOUT', reason_message: 'Falha ao buscar ZPL após 3 tentativas' };
}

// ─── ZPL → PNG via Labelary (resilient with per-layout dimensions) ──
async function zplToImage(
  zplContent: string,
  shipmentId: string,
  layout: string,
  maxAttempts = 5,
): Promise<{ image: Uint8Array | null; reason_code?: string; reason_message?: string; error_category?: 'rate_limit' | 'labelary_other' | 'timeout' | 'other' }> {
  const { dpmm, wInch, hInch } = getLabelaryParams(layout);
  const url = `http://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${wInch}x${hInch}/0/`;

  let lastWas429 = false;
  for (let a = 1; a <= maxAttempts; a++) {
    const t0 = Date.now();
    const timeoutMs = 10000 + (a * 2000); // progressive timeout: 12s..20s
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'image/png' },
        body: zplContent,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latency = Date.now() - t0;

      if (r.status === 429) {
        lastWas429 = true;
        const retryAfter = parseInt(r.headers.get('retry-after') || '0', 10);
        await r.text().catch(() => '');
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : getBackoff(a);
        console.warn(`[labeltest] Labelary ${shipmentId} 429 attempt ${a}/${maxAttempts}: latency=${latency}ms wait=${waitMs}ms`);
        if (a < maxAttempts) { await sleep(waitMs); continue; }
        return { image: null, reason_code: 'LABELARY_RATE_LIMIT', reason_message: `Labelary rate limit (429) após ${maxAttempts} tentativas`, error_category: 'rate_limit' };
      }

      if (r.status >= 500) {
        lastWas429 = false;
        const snippet = (await r.text().catch(() => '')).substring(0, 100);
        console.warn(`[labeltest] Labelary ${shipmentId} ${r.status} attempt ${a}/${maxAttempts}: latency=${latency}ms snippet="${snippet}"`);
        if (a < maxAttempts) { await sleep(getBackoff(a)); continue; }
        return { image: null, reason_code: 'LABELARY_SERVER_ERROR', reason_message: `Labelary retornou ${r.status} após ${maxAttempts} tentativas`, error_category: 'labelary_other' };
      }

      if (!r.ok) {
        const snippet = (await r.text().catch(() => '')).substring(0, 200);
        console.error(`[labeltest] Labelary ${shipmentId}: status=${r.status} latency=${latency}ms body="${snippet}"`);
        return { image: null, reason_code: 'LABELARY_CONVERSION_FAILED', reason_message: `Labelary retornou status ${r.status}: ${snippet.substring(0, 80)}`, error_category: 'labelary_other' };
      }

      const bytes = new Uint8Array(await r.arrayBuffer());
      console.log(`[labeltest] Labelary OK: ${shipmentId} ${(bytes.length / 1024).toFixed(0)}KB ${latency}ms dpmm=${dpmm} ${wInch}x${hInch}in${a > 1 ? ` (attempt ${a})` : ''}`);
      return { image: bytes };
    } catch (e: any) {
      const latency = Date.now() - t0;
      const isTimeout = e.name === 'AbortError';
      console.error(`[labeltest] Labelary ${shipmentId} attempt ${a}/${maxAttempts}: ${isTimeout ? 'TIMEOUT' : e.message} ${latency}ms`);
      if (a < maxAttempts) await sleep(getBackoff(a));
      else return { image: null, reason_code: isTimeout ? 'LABELARY_TIMEOUT' : 'LABELARY_NETWORK_ERROR', reason_message: isTimeout ? `Timeout após ${maxAttempts} tentativas` : `Erro de rede: ${e.message}`, error_category: isTimeout ? 'timeout' : 'other' };
    }
  }
  return { image: null, reason_code: lastWas429 ? 'LABELARY_RATE_LIMIT' : 'LABELARY_CONVERSION_FAILED', reason_message: `Conversão Labelary falhou após ${maxAttempts} tentativas`, error_category: lastWas429 ? 'rate_limit' : 'labelary_other' };
}

// DANFE pipeline = mesmo bloco ZPL adicional retornado pela ML.
// Não buscamos mais PDF A4 da ML (era a porta de entrada da lista de separação).

const HEADER_HEIGHT_PT = HEADER_H_MM * MM_TO_PT;
const LABEL_W_PT = LABEL_W_MM * MM_TO_PT;
const LABEL_H_PT = LABEL_H_MM * MM_TO_PT;
const HEADER_PADDING_TOP = 8;
const HEADER_LINE_HEIGHT_FACTOR = 1.3;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return respond(false, { error: 'Missing auth' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return respond(false, { error: 'Not authenticated' }, 401);

    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, user.id);
    if (!gate.allowed) return respond(false, { error: 'Access denied', error_code: 'TRIAL_EXPIRED' }, 403);

    let body: any;
    try { body = await req.json(); } catch { return respond(false, { error: 'Invalid JSON body' }, 400); }

    const { seller_id, shipment_ids, format, layout = 'meli_100x150' } = body;
    if (!seller_id || !shipment_ids?.length) return respond(false, { error: 'seller_id and shipment_ids required' }, 400);
    if (!['pdf', 'zpl'].includes(format)) return respond(false, { error: 'format must be pdf or zpl' }, 400);
    if (!LAYOUTS[layout]) return respond(false, { error: 'Invalid layout' }, 400);

    const layoutInfo = LAYOUTS[layout];
    const targetWPt = layoutInfo.widthMm * MM_TO_PT;
    const targetHPt = layoutInfo.heightMm * MM_TO_PT;

    console.log(`[labeltest] Starting: seller=${seller_id} format=${format} layout=${layout} size=${layoutInfo.widthMm}x${layoutInfo.heightMm}mm shipments=${shipment_ids.length}`);

    // Get ML account
    const { data: mlAccount } = await supabaseAdmin
      .from('ml_accounts').select('access_token, ml_user_id')
      .eq('user_id', user.id).eq('ml_user_id', seller_id).eq('is_active', true).maybeSingle();
    if (!mlAccount) return respond(false, { error: 'ML account not found' }, 404);

    // Validate shipments — reprint-aware eligibility
    const REPRINT_SUBSTATUSES = new Set([
      'ready_to_print', 'printed', 'ready_for_pickup', 'in_packing_list',
      'invoice_issued', 'invoice_validated', 'not_required',
    ]);

    const validationErrors: { shipment_id: string; reason_code: string; reason_message: string }[] = [];
    const validIds: string[] = [];
    const { data: shipments } = await supabaseAdmin
      .from('meli_shipments_cache').select('shipment_id, order_id, label_available, logistic_type, shipment_substatus, shipment_status')
      .eq('seller_id', seller_id).in('shipment_id', shipment_ids);
    const shipMap = new Map((shipments || []).map((s: any) => [s.shipment_id, s]));

    for (const sid of shipment_ids) {
      const s = shipMap.get(sid);
      if (!s) {
        validationErrors.push({ shipment_id: sid, reason_code: 'shipment_nao_encontrado', reason_message: 'Envio não encontrado no cache' });
        continue;
      }
      if (s.logistic_type === 'fulfillment') {
        validationErrors.push({ shipment_id: sid, reason_code: 'full', reason_message: 'Pedido Full (ML envia)' });
        continue;
      }
      if (!s.label_available) {
        const sub = s.shipment_substatus || '';
        if (!REPRINT_SUBSTATUSES.has(sub)) {
          validationErrors.push({ shipment_id: sid, reason_code: 'sem_label_available', reason_message: `Etiqueta não disponível (substatus: ${sub || 'vazio'})` });
          continue;
        }
        console.log(`[labeltest] ${sid}: label_available=false but substatus=${sub} → allowing reprint`);
      }
      validIds.push(sid);
    }

    if (validIds.length === 0) {
      return respond(false, {
        error: 'Nenhum envio válido',
        data: {
          success_count: 0, error_count: validationErrors.length,
          errors: validationErrors,
        },
      }, 422);
    }

    const fileHash = hashCode(`${seller_id}_${validIds.join(',')}_${Date.now()}`);
    const ext = format === 'pdf' ? 'pdf' : 'zpl';
    const downloadFilename = `etiquetas_labeltest_${layout}_${validIds.length}un_${fileHash}.${ext}`;

    // Create job record
    const { data: job } = await supabaseAdmin.from('meli_print_queue_v2').insert({
      user_id: user.id, seller_id, format, layout, shipment_ids: validIds,
      total_labels: validIds.length, status: 'processando',
      page_width_mm: layoutInfo.widthMm, page_height_mm: layoutInfo.heightMm,
      download_filename: downloadFilename,
      job_started_at: new Date().toISOString(),
      module: 'labeltest',
    } as any).select('id').single();
    const jobId = job?.id;

    let finalPdfBase64: string | null = null;
    let finalZplContent: string | null = null;
    let totalSuccess = 0;
    let totalPages = 0;
    const perShipmentErrors: { shipment_id: string; reason_code: string; reason_message: string }[] = [];
    const perShipmentLog: any[] = [];

    // ─── STEP 1: Fetch ZPL em BATCH ÚNICO (igual ao v2 que funciona) ───────
    // Um único request com todos os shipment_ids retorna TODOS os blocos ^XA...^XZ.
    // A lista de separação NUNCA chega aqui pois pedimos response_type=zpl2 (vem só em PDF A4 separado).
    // Distribuição: blocos divididos igualmente entre shipments (etiqueta + DANFE = 2 blocos por shipment).
    console.log(`[labeltest] pipeline=zpl_first Step 1: Fetching ZPL BATCH for ${validIds.length} shipments`);
    const zplBlocksByShipment = new Map<string, string[]>();
    const rawZplByShipment = new Map<string, string>();

    const batchResult = await fetchZplBatchFromMl(validIds, mlAccount.access_token);
    if (!batchResult.zpl) {
      // Fallback: se batch falhou, tenta um a um (recupera shipments válidos individualmente)
      console.warn(`[labeltest] Batch failed (${batchResult.reason_code}), falling back to per-shipment fetch`);
      for (const sid of validIds) {
        const result = await fetchZplFromMl(sid, mlAccount.access_token);
        if (!result.zpl) {
          perShipmentErrors.push({ shipment_id: sid, reason_code: result.reason_code || 'ML_ZPL_FETCH_FAILED', reason_message: result.reason_message || 'Falha ao baixar ZPL' });
          perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'ml_zpl_fetch', error: result.reason_message });
          continue;
        }
        const validation = validateZpl(result.zpl);
        if (!validation.valid) {
          perShipmentErrors.push({ shipment_id: sid, reason_code: validation.reason_code!, reason_message: validation.reason_message! });
          perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'zpl_validation', error: validation.reason_message });
          continue;
        }
        const blocks = splitZplBlocks(validation.cleaned);
        if (blocks.length === 0) {
          perShipmentErrors.push({ shipment_id: sid, reason_code: 'ZPL_NO_BLOCKS', reason_message: 'ZPL retornado não contém blocos ^XA...^XZ' });
          perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'zpl_split', error: 'no blocks' });
          continue;
        }
        if (blocks.length < 2) {
          perShipmentErrors.push({ shipment_id: sid, reason_code: 'DANFE_MISSING', reason_message: 'Nota fiscal indisponível na ML — tente novamente em alguns minutos' });
          perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'danfe_missing', zpl_blocks_total: blocks.length, error: 'apenas 1 bloco ZPL recebido' });
          continue;
        }
        zplBlocksByShipment.set(sid, blocks);
        rawZplByShipment.set(sid, validation.cleaned);
        await sleep(150);
      }
    } else {
      // Batch ok: extrai todos os blocos e distribui pelos shipments
      const validation = validateZpl(batchResult.zpl);
      if (!validation.valid) {
        for (const sid of validIds) {
          perShipmentErrors.push({ shipment_id: sid, reason_code: validation.reason_code!, reason_message: validation.reason_message! });
          perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'zpl_validation', error: validation.reason_message });
        }
      } else {
        const allBlocks = splitZplBlocks(validation.cleaned);
        console.log(`[labeltest] Batch ZPL: ${allBlocks.length} blocos totais para ${validIds.length} shipments`);

        if (allBlocks.length === 0) {
          for (const sid of validIds) {
            perShipmentErrors.push({ shipment_id: sid, reason_code: 'ZPL_NO_BLOCKS', reason_message: 'ZPL retornado não contém blocos ^XA...^XZ' });
            perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'zpl_split', error: 'no blocks' });
          }
        } else if (allBlocks.length % validIds.length === 0) {
          // Distribuição uniforme: N blocos por shipment (geralmente 2: etiqueta + nota)
          const blocksPerShipment = allBlocks.length / validIds.length;
          console.log(`[labeltest] Distribuição uniforme: ${blocksPerShipment} blocos por shipment`);
          for (let i = 0; i < validIds.length; i++) {
            const sid = validIds[i];
            const blocks = allBlocks.slice(i * blocksPerShipment, (i + 1) * blocksPerShipment);
            if (blocks.length < 2) {
              perShipmentErrors.push({ shipment_id: sid, reason_code: 'DANFE_MISSING', reason_message: 'Nota fiscal indisponível na ML — tente novamente em alguns minutos' });
              perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'danfe_missing', zpl_blocks_total: blocks.length });
              continue;
            }
            zplBlocksByShipment.set(sid, blocks);
            rawZplByShipment.set(sid, blocks.join('\n'));
            console.log(`[labeltest] ZPL distributed: ${sid} → ${blocks.length} blocos`);
          }
        } else {
          // Distribuição não-uniforme: provavelmente alguns shipments tiveram falha/sem DANFE.
          // Estratégia: assume 2 blocos/shipment (etiqueta+nota) e marca o resto como erro.
          // Se não bater, marca todos sem garantia como DANFE_MISSING e segue com os que deram match.
          console.warn(`[labeltest] Distribuição não-uniforme: ${allBlocks.length} blocos / ${validIds.length} shipments. Tentando pares de 2.`);
          const pairs = Math.floor(allBlocks.length / 2);
          const shipmentsCovered = Math.min(pairs, validIds.length);
          for (let i = 0; i < validIds.length; i++) {
            const sid = validIds[i];
            if (i < shipmentsCovered) {
              const blocks = allBlocks.slice(i * 2, (i + 1) * 2);
              zplBlocksByShipment.set(sid, blocks);
              rawZplByShipment.set(sid, blocks.join('\n'));
              console.log(`[labeltest] ZPL paired: ${sid} → 2 blocos`);
            } else {
              perShipmentErrors.push({ shipment_id: sid, reason_code: 'DANFE_MISSING', reason_message: 'Nota fiscal indisponível na ML — tente novamente em alguns minutos' });
              perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'danfe_missing' });
            }
          }
        }
      }
    }

    if (format === 'zpl') {
      // ─── ZPL format: concatenate raw payloads (todos os blocos válidos) ─────────────
      const zplParts: string[] = [];
      for (const sid of validIds) {
        const raw = rawZplByShipment.get(sid);
        const blocks = zplBlocksByShipment.get(sid);
        if (raw && blocks) {
          // Concatena todos os blocos do shipment (etiqueta + DANFE)
          zplParts.push(blocks.join('\n'));
          totalSuccess++;
          totalPages += blocks.length;
          perShipmentLog.push({ shipment_id: sid, status: 'ok', pipeline: 'zpl_first', source: 'ml_zpl_raw', zpl_blocks: blocks.length });
        }
      }
      finalZplContent = zplParts.join('\n');
    } else {
      // ─── PDF format: ZPL → Labelary PNG → pdf-lib PDF (CHUNKED) ────────
      // Para cada shipment processamos TODOS os blocos ZPL retornados:
      //   bloco 0 = etiqueta (recebe cabeçalho quando layout exige)
      //   blocos 1..N = páginas adicionais (DANFE, etc.) — sem cabeçalho.
      // Lista de separação A4 NUNCA chega: pedimos response_type=zpl2.
      const CHUNK_SIZE = 10;
      const sidsForPdf = validIds.filter(sid => zplBlocksByShipment.has(sid));
      const chunks: string[][] = [];
      for (let i = 0; i < sidsForPdf.length; i += CHUNK_SIZE) {
        chunks.push(sidsForPdf.slice(i, i + CHUNK_SIZE));
      }
      console.log(`[labeltest] pipeline=zpl_first chunks_total=${chunks.length} chunk_size=${CHUNK_SIZE} total_shipments=${sidsForPdf.length}`);

      // ─── Pré-carrega header prefs e order/items uma vez (compartilhado entre chunks) ──
      let headerPrefs = { ...DEFAULT_HEADER_PREFS };
      const orderItemsMap = new Map<string, any[]>();
      const ordersMap = new Map<string, any>();

      if (layoutInfo.includeHeader) {
        const { data: hp } = await supabaseAdmin
          .from('meli_label_header_preferences').select('*')
          .eq('user_id', user.id).eq('seller_id', seller_id).maybeSingle();
        if (hp) headerPrefs = { ...DEFAULT_HEADER_PREFS, ...hp };
        // Força exibição de variação no labelTest, alinhado ao engine legado
        headerPrefs.show_variation_attrs = true;

        const orderIds = validIds.map(sid => shipMap.get(sid)?.order_id).filter(Boolean);
        if (orderIds.length > 0) {
          const { data: orders } = await supabaseAdmin
            .from('meli_orders_cache').select('order_id, buyer_name, order_comment')
            .eq('seller_id', seller_id).in('order_id', orderIds);
          for (const o of (orders || [])) ordersMap.set(o.order_id, o);

          const { data: items } = await supabaseAdmin
            .from('meli_order_items_cache').select('order_id, title, title_short, sku, quantity, variation_attributes')
            .eq('seller_id', seller_id)  // ← FIX: filtra por seller_id (multi-conta)
            .in('order_id', orderIds);
          for (const item of (items || [])) {
            const arr = orderItemsMap.get(item.order_id) || [];
            arr.push(item);
            orderItemsMap.set(item.order_id, arr);
          }
        }
      }

      const chunkPdfs: Uint8Array[] = [];
      const bytesPerChunk: number[] = [];
      let chunksOk = 0;

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];
        console.log(`[labeltest] === Chunk ${chunkIdx + 1}/${chunks.length} (${chunk.length} shipments) ===`);

        // ── Step A: Labelary PNG para CADA bloco ZPL ──
        // Pool de concorrência limitada (4 simultâneos) — mantém ganho do paralelismo
        // sem estourar rate limit do Labelary (~5 req/s na cota gratuita).
        const imagesByShipment = new Map<string, Uint8Array[]>();
        const renderErrorsByShipment = new Map<string, { reason: string; category: string }>();

        type RenderTask = { sid: string; bi: number; zpl: string };
        const tasks: RenderTask[] = [];
        for (const sid of chunk) {
          const blocks = zplBlocksByShipment.get(sid)!;
          for (let bi = 0; bi < blocks.length; bi++) {
            tasks.push({ sid, bi, zpl: blocks[bi] });
          }
        }

        const LABELARY_CONCURRENCY = 4;
        const results = await runWithConcurrency(tasks, LABELARY_CONCURRENCY, (t) =>
          zplToImage(t.zpl, `${t.sid}#${t.bi}`, layout)
        );

        // Agrupa resultados por shipment + identifica tasks 429 que merecem retry serial
        type Entry = { imgs: (Uint8Array | null)[]; err: string | null; category: string | null };
        const tmpBySid = new Map<string, Entry>();
        const retryQueue: { sid: string; bi: number; zpl: string }[] = [];
        for (let k = 0; k < tasks.length; k++) {
          const t = tasks[k];
          const r = results[k];
          let entry = tmpBySid.get(t.sid);
          if (!entry) {
            const total = zplBlocksByShipment.get(t.sid)!.length;
            entry = { imgs: new Array(total).fill(null), err: null, category: null };
            tmpBySid.set(t.sid, entry);
          }
          if (r.image) {
            entry.imgs[t.bi] = r.image;
          } else {
            if (r.error_category === 'rate_limit') {
              retryQueue.push({ sid: t.sid, bi: t.bi, zpl: t.zpl });
            }
            if (!entry.err) {
              entry.err = r.reason_message || 'Conversão Labelary falhou';
              entry.category = r.error_category || 'other';
            }
          }
        }

        // ── Step A.2: Retry serial para 429 ─────────────────────────
        // Rede de segurança: refaz só os blocos que caíram em rate limit, 1 por vez,
        // com pausa de 250ms entre cada. Evita aborto por 429 transitório.
        if (retryQueue.length > 0) {
          console.log(`[labeltest] Chunk ${chunkIdx + 1}: retry serial de ${retryQueue.length} bloco(s) em rate_limit`);
          for (const t of retryQueue) {
            await sleep(250);
            const r = await zplToImage(t.zpl, `${t.sid}#${t.bi}~retry`, layout, 3);
            if (r.image) {
              const entry = tmpBySid.get(t.sid)!;
              entry.imgs[t.bi] = r.image;
              // Limpa erro se todos os blocos agora têm imagem
              if (entry.imgs.every(x => x !== null)) { entry.err = null; entry.category = null; }
            }
          }
        }

        for (const sid of chunk) {
          const entry = tmpBySid.get(sid)!;
          const imgs = entry.imgs.filter((x): x is Uint8Array => x !== null);
          const blocksTotal = zplBlocksByShipment.get(sid)!.length;
          if (entry.err || imgs.length < 2 || imgs.length !== blocksTotal) {
            const reason = entry.err || `Apenas ${imgs.length}/${blocksTotal} bloco(s) renderizado(s)`;
            const category = entry.category || 'other';
            const reasonCode = category === 'rate_limit' ? 'LABELARY_RATE_LIMIT'
              : category === 'timeout' ? 'LABELARY_TIMEOUT'
              : 'LABELARY_CONVERSION_FAILED';
            perShipmentErrors.push({ shipment_id: sid, reason_code: reasonCode, reason_message: reason });
            perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'labelary', chunk_index: chunkIdx, zpl_blocks_total: blocksTotal, blocks_rendered: imgs.length, error_category: category, error: reason });
            renderErrorsByShipment.set(sid, { reason, category });
          } else {
            imagesByShipment.set(sid, imgs);
          }
        }

        if (imagesByShipment.size === 0) {
          console.warn(`[labeltest] Chunk ${chunkIdx + 1}: nenhum shipment com blocos válidos — pulando merge desse chunk`);
          await sleep(300);
          await new Promise((r) => setTimeout(r, 0));
          continue;
        }

        // ── Step B: Build chunk PDF ───────────────────────────────
        const chunkPdf = await PDFDocument.create();
        let font: any = null;
        let fontBold: any = null;
        if (layoutInfo.includeHeader) {
          font = await chunkPdf.embedFont(StandardFonts.Helvetica);
          fontBold = await chunkPdf.embedFont(StandardFonts.HelveticaBold);
        }

        let chunkPages = 0;

        for (const sid of chunk) {
          const blockImages = imagesByShipment.get(sid);
          if (!blockImages || blockImages.length === 0) continue;

          try {
            // ── Bloco 0: ETIQUETA (recebe cabeçalho quando layout exige) ──
            const labelImg = await chunkPdf.embedPng(blockImages[0]);

            if (layoutInfo.includeHeader) {
              const page = chunkPdf.addPage([targetWPt, targetHPt]);
              const labelAreaY = 0;
              const labelAreaH = LABEL_H_PT;
              const imgAspect = labelImg.width / labelImg.height;
              const targetAspect = LABEL_W_PT / labelAreaH;

              let drawW: number, drawH: number, drawX: number, drawY: number;
              if (imgAspect > targetAspect) {
                drawW = LABEL_W_PT; drawH = LABEL_W_PT / imgAspect; drawX = 0; drawY = labelAreaY + (labelAreaH - drawH) / 2;
              } else {
                drawH = labelAreaH; drawW = labelAreaH * imgAspect; drawX = (LABEL_W_PT - drawW) / 2; drawY = labelAreaY;
              }
              page.drawImage(labelImg, { x: drawX, y: drawY, width: drawW, height: drawH });

              const orderId = shipMap.get(sid)?.order_id;
              const orderData = ordersMap.get(orderId) || { order_id: orderId, buyer_name: '', shipment_id: sid };
              const orderItems = orderItemsMap.get(orderId) || [];
              const lines = buildHeaderLines(headerPrefs, { ...orderData, shipment_id: sid }, orderItems);

              const fontSize = headerPrefs.font_size || 9;
              const lineH = fontSize * HEADER_LINE_HEIGHT_FACTOR;
              let yPos = targetHPt - HEADER_PADDING_TOP;

              for (const line of lines) {
                const f = line.bold ? fontBold : font;
                page.drawText(line.text, { x: 8, y: yPos, size: fontSize, font: f, color: rgb(0, 0, 0) });
                yPos -= lineH;
              }

              const sepY = LABEL_H_PT;
              page.drawLine({ start: { x: 4, y: sepY }, end: { x: LABEL_W_PT - 4, y: sepY }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
              chunkPages++;
            } else {
              const page = chunkPdf.addPage([targetWPt, targetHPt]);
              const imgAspect = labelImg.width / labelImg.height;
              const pageAspect = targetWPt / targetHPt;

              let drawW: number, drawH: number, drawX: number, drawY: number;
              if (imgAspect > pageAspect) {
                drawW = targetWPt; drawH = targetWPt / imgAspect; drawX = 0; drawY = (targetHPt - drawH) / 2;
              } else {
                drawH = targetHPt; drawW = targetHPt * imgAspect; drawX = (targetWPt - drawW) / 2; drawY = 0;
              }
              page.drawImage(labelImg, { x: drawX, y: drawY, width: drawW, height: drawH });
              chunkPages++;
            }

            // ── Blocos 1..N: DANFE e demais (sem cabeçalho, ocupam página inteira) ──
            let danfePagesAdded = 0;
            for (let bi = 1; bi < blockImages.length; bi++) {
              const extraImg = await chunkPdf.embedPng(blockImages[bi]);
              const page = chunkPdf.addPage([targetWPt, targetHPt]);
              const imgAspect = extraImg.width / extraImg.height;
              const pageAspect = targetWPt / targetHPt;

              let drawW: number, drawH: number, drawX: number, drawY: number;
              if (imgAspect > pageAspect) {
                drawW = targetWPt; drawH = targetWPt / imgAspect; drawX = 0; drawY = (targetHPt - drawH) / 2;
              } else {
                drawH = targetHPt; drawW = targetHPt * imgAspect; drawX = (targetWPt - drawW) / 2; drawY = 0;
              }
              page.drawImage(extraImg, { x: drawX, y: drawY, width: drawW, height: drawH });
              chunkPages++;
              danfePagesAdded++;
            }

            await new Promise((r) => setTimeout(r, 0));

            totalSuccess++;
            perShipmentLog.push({
              shipment_id: sid, status: 'ok', pipeline: 'zpl_first', source: 'zpl_labelary',
              chunk_index: chunkIdx,
              output_w_mm: layoutInfo.widthMm, output_h_mm: layoutInfo.heightMm,
              include_header: layoutInfo.includeHeader,
              zpl_blocks_total: blockImages.length,
              danfe_pages_added: danfePagesAdded,
              danfe_status: danfePagesAdded > 0 ? 'attached' : 'missing',
            });
          } catch (embedErr: any) {
            console.error(`[labeltest] Embed error for ${sid}:`, embedErr);
            perShipmentErrors.push({ shipment_id: sid, reason_code: 'PDF_EMBED_FAILED', reason_message: `Erro ao embutir imagem: ${embedErr.message}` });
            perShipmentLog.push({ shipment_id: sid, status: 'error', pipeline: 'zpl_first', stage: 'pdf_embed', chunk_index: chunkIdx, error: 'PDF embed failed: ' + embedErr.message });
          }
        }

        // ── Step C: Save chunk PDF ────────────────────────────────
        if (chunkPages > 0) {
          const chunkBytes = await chunkPdf.save({ useObjectStreams: false, addDefaultPage: false });
          chunkPdfs.push(chunkBytes);
          bytesPerChunk.push(chunkBytes.length);
          totalPages += chunkPages;
          chunksOk++;
          console.log(`[labeltest] Chunk ${chunkIdx + 1} saved: ${chunkPages} pages, ${(chunkBytes.length / 1024).toFixed(0)}KB`);
        }

        // Yield CPU + folga rate-limit Labelary entre chunks
        await new Promise((r) => setTimeout(r, 0));
        await sleep(300);
      }

      // ─── Merge final dos chunkPdfs ─────────────────────────────
      console.log(`[labeltest] Merging ${chunkPdfs.length} chunk PDFs into final document`);
      if (chunkPdfs.length > 0) {
        const finalPdf = await PDFDocument.create();
        for (let i = 0; i < chunkPdfs.length; i++) {
          try {
            const src = await PDFDocument.load(chunkPdfs[i], { updateMetadata: false });
            const pages = await finalPdf.copyPages(src, src.getPageIndices());
            for (const p of pages) finalPdf.addPage(p);
            // Libera memória do chunk após merge
            chunkPdfs[i] = new Uint8Array(0);
            await new Promise((r) => setTimeout(r, 0));
          } catch (mergeErr: any) {
            console.error(`[labeltest] Chunk ${i + 1} merge error:`, mergeErr.message);
          }
        }
        const pdfBytes = await finalPdf.save({ useObjectStreams: false, addDefaultPage: false });
        finalPdfBase64 = uint8ToBase64(pdfBytes);
        console.log(`[labeltest] Final PDF: chunks_total=${chunks.length} chunks_ok=${chunksOk} success=${totalSuccess}/${validIds.length} pages=${totalPages} size=${(pdfBytes.length / 1024).toFixed(0)}KB bytes_per_chunk=[${bytesPerChunk.map(b => (b / 1024).toFixed(0) + 'KB').join(',')}]`);
      } else {
        console.warn(`[labeltest] PDF has 0 chunks — will NOT generate file`);
      }
    }


    // Update job record
    const elapsed = Date.now() - t0;
    const finalStatus = totalSuccess === validIds.length ? 'concluido' : totalSuccess > 0 ? 'parcial' : 'erro';

    // Merge all errors
    const allErrors = [...validationErrors, ...perShipmentErrors];

    // Categoriza erros para diagnóstico claro (rate_limit vs danfe vs ml_api vs other)
    const errorsByCategory = { rate_limit: 0, danfe_missing: 0, ml_api_error: 0, labelary_other: 0, validation: 0, other: 0 };
    for (const e of allErrors) {
      const code = e.reason_code || '';
      if (code === 'LABELARY_RATE_LIMIT') errorsByCategory.rate_limit++;
      else if (code === 'DANFE_MISSING') errorsByCategory.danfe_missing++;
      else if (code.startsWith('ML_ZPL_')) errorsByCategory.ml_api_error++;
      else if (code.startsWith('LABELARY_')) errorsByCategory.labelary_other++;
      else if (['shipment_nao_encontrado', 'full', 'sem_label_available'].includes(code)) errorsByCategory.validation++;
      else errorsByCategory.other++;
    }

    // Structured log summary
    console.log(`[labeltest] === GENERATION SUMMARY ===`);
    console.log(JSON.stringify({
      requested_shipments: shipment_ids.length,
      valid_shipments: validIds.length,
      processed_labels: totalSuccess,
      error_count: allErrors.length,
      errors_by_category: errorsByCategory,
      total_pages: totalPages,
      pdf_size_bytes: finalPdfBase64 ? Math.round(finalPdfBase64.length * 0.75) : 0,
      zpl_size_bytes: finalZplContent?.length || 0,
      status: finalStatus,
      elapsed_ms: elapsed,
      errors: allErrors,
    }));

    if (jobId) {
      await supabaseAdmin.from('meli_print_queue_v2').update({
        status: finalStatus,
        processed_labels: totalSuccess,
        total_pages: totalPages,
        job_completed_at: new Date().toISOString(),
      } as any).eq('id', jobId);
    }

    // CRITICAL: If 0 labels succeeded, return failure
    if (totalSuccess <= 0) {
      console.error(`[labeltest] ZERO labels generated — returning error`);
      return respond(false, {
        error: 'Nenhuma etiqueta válida foi gerada',
        data: {
          job_id: jobId,
          success_count: 0,
          error_count: allErrors.length,
          errors: allErrors,
          errors_by_category: errorsByCategory,
          per_shipment: perShipmentLog,
          processing_time_ms: elapsed,
        },
      }, 422);
    }

    return respond(true, {
      data: {
        job_id: jobId,
        pdf_base64: finalPdfBase64,
        zpl_content: finalZplContent,
        success_count: totalSuccess,
        error_count: perShipmentErrors.length,
        errors: allErrors,
        total_success: totalSuccess,
        total_pages: totalPages,
        per_shipment: perShipmentLog,
        layout,
        page_width_mm: layoutInfo.widthMm,
        page_height_mm: layoutInfo.heightMm,
        processing_time_ms: elapsed,
        download_filename: downloadFilename,
      },
    });
  } catch (error: any) {
    console.error(`[labeltest] Unhandled error:`, error);
    return respond(false, {
      error: error.message || 'Internal server error',
      diagnostics: { error_stage: 'unhandled', processing_time_ms: Date.now() - t0 },
    }, 500);
  }
});
