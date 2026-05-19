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

export function sortLabelsAlphabetically(labels: string[]): string[] {
  return [...labels]
    .map((zpl, idx) => ({ zpl, key: extractRecipientName(zpl), idx }))
    .sort((a, b) => {
      const c = a.key.localeCompare(b.key, 'pt-BR', { sensitivity: 'base' });
      return c !== 0 ? c : a.idx - b.idx;
    })
    .map((x) => x.zpl);
}
