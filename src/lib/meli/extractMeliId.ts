/**
 * Utility to extract Mercado Livre item IDs from URLs or raw strings.
 * Supports MLB, MLBU, MLA, MLC, MLM and other regional patterns.
 */

const MELI_ID_PATTERNS = [
  /\/up\/(MLB[A-Z]?\d+)/i,           // Universal product: /up/MLBU1234567890
  /\/p\/(MLB[A-Z]?[-]?\d+)/i,        // Product page: /p/MLB1234567890
  /item_id=(MLB[A-Z]?[-]?\d+)/i,     // Query param: item_id=MLB...
  /(MLB[A-Z]?[-]?\d{8,})/i,          // Any MLB ID in URL (8+ digits)
  /(ML[A-Z]{1,2}[-]?\d{8,})/i,       // Other countries: MLA, MLC, MLM, etc.
];

/**
 * Extracts item ID from a Mercado Livre URL or raw ID string.
 * Returns normalized ID (uppercase, no hyphens) or null if not found.
 */
export function extractMeliId(input: string): string | null {
  if (!input?.trim()) return null;
  
  const trimmed = input.trim();
  
  for (const pattern of MELI_ID_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      // Normalize: remove hyphens and uppercase
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      return id;
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
