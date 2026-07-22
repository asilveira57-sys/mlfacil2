/**
 * Extrai uma chave de ordenação alfabética (nome do destinatário)
 * a partir de um bloco ZPL (^XA...^XZ).
 *
 * Heurística, em ordem de prioridade:
 *  1. Campo precedido por marcador "DESTINATÁRIO", "PARA", "CLIENTE", "NOME"
 *  2. Próximo ^FD logo após um ^FD que contenha esses rótulos
 *  3. Primeiro ^FD com texto "longo" (>= 6 chars), alfabético, com espaço,
 *     descartando códigos/dígitos/CEP/URLs/strings de marketplace
 *  4. Primeiro ^FD textual qualquer
 *  5. "\uFFFF" — joga p/ o fim do sort
 */

const MARKETPLACE_NOISE = [
  'MERCADO LIVRE', 'MERCADOLIVRE', 'MERCADO LÍVRE',
  'SHOPEE', 'FULL', 'REMETENTE', 'CD ', 'CENTRO DE DISTRIBUI',
  'AGENCIA', 'AGÊNCIA', 'CORREIOS', 'JADLOG', 'TOTAL EXPRESS',
  'LOGGI', 'AMAZON', 'MAGALU', 'AMERICANAS',
];

const LABEL_HINTS_RE = /(DESTINAT[ÁA]RIO|PARA[:\s]|CLIENTE|NOME[:\s]|RECIPIENT)/i;

function isJunkValue(v: string): boolean {
  const t = v.trim();
  if (!t || t.length < 4) return true;
  if (/^[\d\s\-\.\/]+$/.test(t)) return true;            // só dígitos/pontuação
  if (/^[>~^][;:]/.test(t)) return true;                  // GS1 / códigos
  if (/^https?:\/\//i.test(t)) return true;
  if (/^\d{5}-?\d{3}$/.test(t)) return true;              // CEP
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(t)) return true;     // data
  const up = t.toUpperCase();
  if (MARKETPLACE_NOISE.some((n) => up.includes(n))) return true;
  return false;
}

function looksLikeName(v: string): boolean {
  const t = v.trim();
  if (t.length < 6) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(t)) return false;
  if (!/\s/.test(t)) return false; // nomes têm pelo menos um espaço
  return !isJunkValue(t);
}

export function extractRecipientName(zplBlock: string): string {
  if (!zplBlock) return '\uFFFF';

  // Captura todos os ^FD...^FS
  const fdRe = /\^FD([^\^]*)\^FS/g;
  const fields: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fdRe.exec(zplBlock)) !== null) {
    fields.push(m[1]);
  }
  if (fields.length === 0) return '\uFFFF';

  // 1) Campo com rótulo embutido: "DESTINATÁRIO: NOME ..."
  for (const f of fields) {
    const match = f.match(/(?:DESTINAT[ÁA]RIO|PARA|CLIENTE|NOME)[:\s]+(.{4,})/i);
    if (match && looksLikeName(match[1])) {
      return normalizeKey(match[1]);
    }
  }

  // 2) Campo imediatamente após um rótulo
  for (let i = 0; i < fields.length - 1; i++) {
    if (LABEL_HINTS_RE.test(fields[i])) {
      const next = fields[i + 1];
      if (looksLikeName(next)) return normalizeKey(next);
    }
  }

  // 3) Primeiro ^FD que parece nome
  for (const f of fields) {
    if (looksLikeName(f)) return normalizeKey(f);
  }

  // 4) Fallback: primeiro ^FD não-junk
  for (const f of fields) {
    if (!isJunkValue(f)) return normalizeKey(f);
  }

  return '\uFFFF';
}

function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Extrai todos os campos ^FD de um bloco ZPL.
 */
function extractAllFdFields(zpl: string): string[] {
  const fdRe = /\^FD([^\^]*)\^FS/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fdRe.exec(zpl)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Estratégia cross-label:
 *  - Em etiquetas de marketplace (ML/Shopee/Full/Magalu), o nome do
 *    remetente/CD/empresa é IGUAL em todas as etiquetas do lote.
 *  - O nome do destinatário VARIA a cada etiqueta.
 *  - Descobrimos os campos ^FD que aparecem em quase todas as etiquetas
 *    (comuns → remetente) e os removemos das candidatas. O primeiro
 *    campo restante que "pareça nome" é o destinatário.
 */
function extractRecipientNameCrossLabel(
  zplBlock: string,
  commonFieldSet: Set<string>
): string {
  if (!zplBlock) return '\uFFFF';

  // 1) Estratégia original (rótulos explícitos): mantém prioridade máxima.
  const primary = extractRecipientName(zplBlock);
  const fields = extractAllFdFields(zplBlock);

  // Se a heurística original achou algo que NÃO é campo comum do lote,
  // confia nela.
  if (primary && primary !== '\uFFFF' && !commonFieldSet.has(normalizeKey(primary))) {
    return primary;
  }

  // 2) Varre ^FD ignorando junks E campos comuns do lote.
  for (const f of fields) {
    if (isJunkValue(f)) continue;
    if (commonFieldSet.has(normalizeKey(f))) continue;
    if (looksLikeName(f)) return normalizeKey(f);
  }

  // 3) Qualquer ^FD variável, mesmo sem espaço (ex.: "MARIA").
  for (const f of fields) {
    if (isJunkValue(f)) continue;
    if (commonFieldSet.has(normalizeKey(f))) continue;
    const t = f.trim();
    if (t.length >= 3 && /[A-Za-zÀ-ÿ]/.test(t)) return normalizeKey(t);
  }

  // 4) Fallback: heurística original.
  return primary;
}

export function sortLabelsAlphabetically(labels: string[]): string[] {
  if (labels.length <= 1) return [...labels];

  // Mapeia ^FD por etiqueta e conta ocorrências (normalizadas).
  const perLabel = labels.map((z) => extractAllFdFields(z).map(normalizeKey));
  const counts = new Map<string, number>();
  for (const fields of perLabel) {
    const uniq = new Set(fields);
    for (const f of uniq) {
      if (!f) continue;
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  }

  // Campos "comuns" = presentes em >= 80% das etiquetas (remetente,
  // marketplace, CD, endereço da empresa etc.).
  const threshold = Math.max(2, Math.ceil(labels.length * 0.8));
  const commonFieldSet = new Set<string>();
  for (const [val, count] of counts) {
    if (count >= threshold) commonFieldSet.add(val);
  }

  const withKeys = labels.map((zpl, idx) => ({
    zpl,
    key: extractRecipientNameCrossLabel(zpl, commonFieldSet),
    idx,
  }));

  // Debug leve — ajuda a diagnosticar se o utilizador reportar problema.
  try {
    // eslint-disable-next-line no-console
    console.debug('[ZPL sort] chaves ordenadas:', withKeys.map((w) => w.key));
  } catch { /* noop */ }

  return withKeys
    .sort((a, b) => {
      const c = a.key.localeCompare(b.key, 'pt-BR', { sensitivity: 'base' });
      return c !== 0 ? c : a.idx - b.idx;
    })
    .map((x) => x.zpl);
}
