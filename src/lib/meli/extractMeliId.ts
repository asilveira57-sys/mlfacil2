/**
 * Utility to extract Mercado Livre item IDs from URLs or raw strings.
 * 
 * REGRA OFICIAL DE RESOLUÇÃO:
 * 1. PRIORIDADE MÁXIMA: Extrair MLB do link (anúncio real)
 * 2. MLBU é apenas camada de apresentação - só usado como fallback residual
 * 
 * O anúncio sempre nasce como MLB. MLBU é apenas camada pública de exibição (PDP de catálogo).
 */

/**
 * Pattern priority order (MLB first, MLBU only as fallback):
 * 1. item_id parameter (explicit MLB reference)
 * 2. Direct MLB in URL path or query
 * 3. pdp_filters with item_id
 * 4. MLBU in /up/ path (fallback only)
 */
const MLB_PRIORITY_PATTERNS = [
  // Priority 1: Explicit item_id parameter (highest priority)
  /item_id[=:]?(MLB\d{8,})/i,
  // Priority 2: pdp_filters containing item_id
  /pdp_filters=item_id[=:]?(MLB\d{8,})/i,
  // Priority 3: Direct MLB in URL (not MLBU)
  /\/(MLB\d{8,})/i,
  // Priority 4: MLB in query params
  /[?&]id=(MLB\d{8,})/i,
  // Priority 5: MLB anywhere in text (but not MLBU)
  /(?<!MLBU?)(MLB\d{8,})/i,
];

// MLBU patterns - only used as fallback when no MLB found
const MLBU_FALLBACK_PATTERNS = [
  /\/up\/(MLBU\d+)/i,           // Universal product: /up/MLBU1234567890
  /\/p\/(MLBU\d+)/i,            // Product page: /p/MLBU1234567890
  /(MLBU\d{8,})/i,              // Any MLBU ID in URL
];

// Other regional patterns (MLA, MLC, MLM, etc.) - lower priority
const REGIONAL_PATTERNS = [
  /\/up\/(ML[A-Z]{1,2}\d+)/i,   // Universal product with regional prefix
  /\/p\/(ML[A-Z]{1,2}[-]?\d+)/i, // Product page
  /item_id=(ML[A-Z]{1,2}[-]?\d+)/i, // Query param
  /(ML[A-Z]{1,2}[-]?\d{8,})/i,  // Other countries: MLA, MLC, MLM, etc.
];

export interface ExtractResult {
  id: string;
  type: 'MLB' | 'MLBU' | 'REGIONAL';
  /** True if MLB was extracted from a link that also contained MLBU */
  resolvedFromCatalogLink: boolean;
}

/**
 * Extracts item ID from a Mercado Livre URL or raw ID string.
 * 
 * REGRA OFICIAL:
 * 1. Prioriza MLB (anúncio real) sobre MLBU (catálogo)
 * 2. Se encontrar MLB → usa direto, ignora MLBU
 * 3. MLBU só é usado como fallback quando não há MLB no link
 * 
 * Returns normalized ID (uppercase, no hyphens) or null if not found.
 */
export function extractMeliId(input: string): string | null {
  const result = extractMeliIdWithType(input);
  return result?.id ?? null;
}

/**
 * Enhanced extraction that returns both ID and type information.
 * Use this when you need to know if the ID came from a catalog link.
 */
export function extractMeliIdWithType(input: string): ExtractResult | null {
  if (!input?.trim()) return null;
  
  const trimmed = input.trim();
  const hasMLBU = /MLBU\d+/i.test(trimmed);
  
  // STEP 1: Try to extract MLB first (highest priority)
  for (const pattern of MLB_PRIORITY_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      // Verify it's actually MLB, not MLBU
      if (/^MLB\d+$/.test(id)) {
        return {
          id,
          type: 'MLB',
          resolvedFromCatalogLink: hasMLBU,
        };
      }
    }
  }
  
  // STEP 2: Try MLBU fallback (only if no MLB found)
  for (const pattern of MLBU_FALLBACK_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      return {
        id,
        type: 'MLBU',
        resolvedFromCatalogLink: false,
      };
    }
  }
  
  // STEP 3: Try regional patterns (MLA, MLC, etc.)
  for (const pattern of REGIONAL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      // Skip if it matches MLBU (already handled above)
      if (/^MLBU/i.test(id)) continue;
      return {
        id,
        type: 'REGIONAL',
        resolvedFromCatalogLink: false,
      };
    }
  }
  
  return null;
}

/**
 * Validates if a string looks like a valid Mercado Livre ID format.
 */
export function isValidMeliId(id: string): boolean {
  if (!id) return false;
  return /^ML[A-Z]{0,2}\d{8,}$/i.test(id.trim());
}

/**
 * Checks if the ID is a catalog/universal product ID (MLBU).
 * MLBU IDs represent catalog products where multiple sellers compete,
 * not individual listings that can be cloned directly.
 */
export function isCatalogMeliId(id: string): boolean {
  if (!id) return false;
  return /^MLBU/i.test(id.trim());
}

/**
 * Checks if the ID is a regular item ID (MLB - clonable).
 */
export function isRegularItemId(id: string): boolean {
  if (!id) return false;
  // MLB followed by digits, but not MLBU
  return /^MLB\d+$/i.test(id.trim());
}
