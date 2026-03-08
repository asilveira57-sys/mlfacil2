/**
 * Client-side ML listing resolution for competitor tracking.
 * Resolves a ML URL to item data (MLB ID, title, price, thumbnail).
 */

import { extractMeliIdWithType, isCatalogMeliId } from './extractMeliId';

const ML_API = 'https://api.mercadolibre.com';

export interface ResolvedListing {
  mlb_id: string;
  title: string;
  price: number | null;
  thumbnail: string | null;
  seller_id: number | null;
  status: string;
  is_catalog: boolean;
}

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Resolve a listing from any ML URL or ID.
 * Returns item data including MLB ID, title, price, thumbnail.
 * Throws if unable to resolve.
 */
export async function resolveListingFromLink(input: string): Promise<ResolvedListing> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Informe um link ou ID');

  const extracted = extractMeliIdWithType(trimmed);

  // Case 1: Direct MLB ID
  if (extracted && (extracted.type === 'MLB' || extracted.type === 'REGIONAL')) {
    try {
      return await fetchItemById(extracted.id);
    } catch {
      // Item fetch failed (inactive/removed) — try slug search fallback
      const slugResult = await trySearchByUrlSlug(trimmed);
      if (slugResult) return slugResult;
      throw new Error(`Anúncio ${extracted.id} não encontrado ou indisponível.`);
    }
  }

  // Case 2: MLBU (catalog) - search for an actual listing
  if (extracted && extracted.type === 'MLBU') {
    try {
      return await resolveFromCatalog(extracted.id, trimmed);
    } catch {
      const slugResult = await trySearchByUrlSlug(trimmed);
      if (slugResult) return slugResult;
      throw new Error(`Produto de catálogo ${extracted.id} sem anúncios encontrados. Tente um link de anúncio específico.`);
    }
  }

  // Case 4: Try to extract from URL slug
  const slugMatch = trimmed.match(/mercadolivre\.com\.br\/([^\/]+)/i);
  if (slugMatch) {
    const query = slugMatch[1].replace(/-/g, ' ').substring(0, 60);
    try {
      const searchRes = await fetchJSON(`${ML_API}/sites/MLB/search?q=${encodeURIComponent(query)}&limit=1`);
      if (searchRes?.results?.[0]?.id) {
        return itemToResolved(searchRes.results[0], false);
      }
    } catch { /* fall through */ }
  }

  throw new Error('Não foi possível identificar o anúncio. Cole o link de um anúncio ativo do Mercado Livre.');
}

/**
 * Try to find a listing by searching the URL slug text.
 */
async function trySearchByUrlSlug(url: string): Promise<ResolvedListing | null> {
  const slugMatch = url.match(/mercadolivre\.com\.br\/([^\/\?#]+)/i)
    || url.match(/mercadolibre\.com[^\/]*\/([^\/\?#]+)/i);
  if (!slugMatch) return null;

  const slug = slugMatch[1]
    .replace(/-MLB\d+.*$/i, '')
    .replace(/-MLBU\d+.*$/i, '')
    .replace(/-/g, ' ')
    .substring(0, 60)
    .trim();

  if (!slug || slug.length < 5) return null;

  try {
    const searchRes = await fetchJSON(`${ML_API}/sites/MLB/search?q=${encodeURIComponent(slug)}&limit=1`);
    if (searchRes?.results?.[0]?.id) {
      return itemToResolved(searchRes.results[0], false);
    }
  } catch { /* fall through */ }

  return null;
}

async function fetchItemById(itemId: string): Promise<ResolvedListing> {
  // Try individual endpoint
  try {
    const data = await fetchJSON(`${ML_API}/items/${itemId}`);
    if (data?.id) return itemToResolved(data, false);
  } catch { /* try batch */ }

  // Batch fallback
  try {
    const res = await fetch(`${ML_API}/items?ids=${itemId}`);
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr[0]?.code === 200 && arr[0]?.body?.id) {
        return itemToResolved(arr[0].body, false);
      }
    }
  } catch { /* fall through */ }

  throw new Error(`Anúncio ${itemId} não encontrado ou indisponível.`);
}

async function resolveFromCatalog(mlbuId: string, originalInput: string): Promise<ResolvedListing> {
  // Try catalog search
  try {
    const searchRes = await fetchJSON(`${ML_API}/sites/MLB/search?catalog_product_id=${mlbuId}&limit=1`);
    if (searchRes?.results?.[0]?.id) {
      return itemToResolved(searchRes.results[0], true);
    }
  } catch { /* continue */ }

  // Fallback: slug from URL
  const slugMatch = originalInput.match(/mercadolivre\.com\.br\/([^\/]+)\/(?:up|p)\//i);
  if (slugMatch) {
    try {
      const query = slugMatch[1].replace(/-/g, ' ').substring(0, 60);
      const searchRes = await fetchJSON(`${ML_API}/sites/MLB/search?q=${encodeURIComponent(query)}&limit=1`);
      if (searchRes?.results?.[0]?.id) {
        return itemToResolved(searchRes.results[0], true);
      }
    } catch { /* fall through */ }
  }

  throw new Error(
    `Este é um link de catálogo (${mlbuId}). Não foi possível encontrar um anúncio específico. ` +
    `Tente colar o link de um anúncio individual ou use a aba "Sellers" para monitorar o vendedor.`
  );
}

function itemToResolved(data: any, isCatalog: boolean): ResolvedListing {
  return {
    mlb_id: String(data.id).replace(/-/g, ''),
    title: data.title || 'Sem título',
    price: data.price ?? null,
    thumbnail: data.thumbnail || data.pictures?.[0]?.url || null,
    seller_id: data.seller?.id || data.seller_id || null,
    status: data.status || 'unknown',
    is_catalog: isCatalog,
  };
}
