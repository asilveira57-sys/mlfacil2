/**
 * Client-side ML seller resolution.
 * 
 * Calls the ML public API directly from the user's browser to resolve
 * a seller_id from item URLs. This bypasses server-side IP blocks (PolicyAgent 403)
 * that affect edge functions running on shared infrastructure.
 */

import { extractMeliIdWithType } from './extractMeliId';

const ML_API = 'https://api.mercadolibre.com';

export interface ResolvedSeller {
  ml_seller_id: string;
  ml_nickname: string;
  reputation: any;
  total_items: number;
}

/**
 * Fetch from ML public API (no auth needed for public data).
 * Runs in user's browser so no PolicyAgent IP block.
 */
async function fetchMLPublic(path: string): Promise<any> {
  const res = await fetch(`${ML_API}${path}`);
  if (!res.ok) {
    const text = await res.text();
    console.warn(`[resolveSellerFromLink] ML API ${res.status} for ${path}:`, text.substring(0, 200));
    throw new Error(`ML API ${res.status}: ${path}`);
  }
  return res.json();
}

/**
 * Try to fetch item data, with batch fallback.
 */
async function fetchItemData(itemId: string): Promise<{ seller_id: number } | null> {
  // Try individual endpoint first
  try {
    const data = await fetchMLPublic(`/items/${itemId}?attributes=id,seller_id,title`);
    if (data?.seller_id) return data;
  } catch (e) {
    console.log(`[resolveSellerFromLink] Individual fetch failed for ${itemId}, trying batch...`);
  }

  // Batch fallback
  try {
    const res = await fetch(`${ML_API}/items?ids=${itemId}&attributes=id,seller_id,title`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.code === 200 && data[0]?.body?.seller_id) {
        return data[0].body;
      }
    }
  } catch (e) {
    console.log(`[resolveSellerFromLink] Batch fetch failed for ${itemId}`);
  }

  return null;
}

/**
 * Resolve seller info from user data (public endpoint).
 */
async function fetchUserPublic(sellerId: string | number): Promise<{ id: number; nickname: string; seller_reputation: any }> {
  return fetchMLPublic(`/users/${sellerId}`);
}


/**
 * Try to resolve a seller from the URL slug (title portion of ML URLs).
 * Works even when the item itself is inactive/removed because ML search
 * can find related active listings from the same seller category.
 */
async function tryResolveFromUrlSlug(url: string): Promise<ResolvedSeller | null> {
  // Extract slug from ML URL patterns like /titulo-do-produto-MLB12345 or /titulo-do-produto/up/MLBU...
  const slugMatch = url.match(/mercadolivre\.com\.br\/([^\/\?#]+)/i) 
    || url.match(/mercadolibre\.com[^\/]*\/([^\/\?#]+)/i);
  if (!slugMatch) return null;

  const slug = slugMatch[1]
    .replace(/-MLB\d+.*$/i, '')  // remove MLB ID suffix
    .replace(/-MLBU\d+.*$/i, '') // remove MLBU ID suffix
    .replace(/-/g, ' ')
    .substring(0, 60)
    .trim();
  
  if (!slug || slug.length < 5) return null;
  
  console.log(`[resolveSellerFromLink] Trying slug search: "${slug}"`);
  
  try {
    const searchRes = await fetchMLPublic(`/sites/MLB/search?q=${encodeURIComponent(slug)}&limit=3`);
    for (const result of searchRes?.results || []) {
      if (result?.seller?.id) {
        const userData = await fetchUserPublic(String(result.seller.id));
        const totalItems = await fetchSellerItemCount(String(userData.id));
        return {
          ml_seller_id: String(userData.id),
          ml_nickname: userData.nickname || `Seller ${userData.id}`,
          reputation: userData.seller_reputation || null,
          total_items: totalItems,
        };
      }
    }
  } catch (e) {
    console.log(`[resolveSellerFromLink] Slug search failed:`, e);
  }
  
  return null;
}

/**
 * Get total active items for a seller.
 */
async function fetchSellerItemCount(sellerId: string): Promise<number> {
  try {
    const data = await fetchMLPublic(`/sites/MLB/search?seller_id=${sellerId}&limit=1`);
    return data?.paging?.total || 0;
  } catch {
    return 0;
  }
}

/**
 * Resolve a seller from any user input (URL, MLB ID, seller ID, nickname, etc).
 * Runs entirely client-side in the browser.
 */
export async function resolveSellerFromLink(input: string): Promise<ResolvedSeller> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Informe um link ou ID');

  // 1. Direct numeric seller ID
  if (/^\d{5,}$/.test(trimmed)) {
    const userData = await fetchUserPublic(trimmed);
    const totalItems = await fetchSellerItemCount(String(userData.id));
    return {
      ml_seller_id: String(userData.id),
      ml_nickname: userData.nickname || `Seller ${userData.id}`,
      reputation: userData.seller_reputation || null,
      total_items: totalItems,
    };
  }

  // 2. Extract MLB/MLBU from URL or text
  const extracted = extractMeliIdWithType(trimmed);
  if (extracted) {
    console.log(`[resolveSellerFromLink] Extracted ${extracted.type}: ${extracted.id}`);

    if (extracted.type === 'MLB' || extracted.type === 'REGIONAL') {
      // Try fetching the item directly to get seller_id
      const itemData = await fetchItemData(extracted.id);
      if (itemData?.seller_id) {
        const userData = await fetchUserPublic(String(itemData.seller_id));
        const totalItems = await fetchSellerItemCount(String(userData.id));
        return {
          ml_seller_id: String(userData.id),
          ml_nickname: userData.nickname || `Seller ${userData.id}`,
          reputation: userData.seller_reputation || null,
          total_items: totalItems,
        };
      }
      
      // Item fetch failed — try MLBU catalog search if present
      const mlbuMatch = trimmed.match(/(MLBU\d+)/i);
      if (mlbuMatch) {
        try {
          return await resolveFromCatalog(mlbuMatch[1].toUpperCase(), trimmed);
        } catch {
          // Continue to slug fallback
        }
      }
      
      // Fallback: search by URL slug to find the seller
      const sellerFromSlug = await tryResolveFromUrlSlug(trimmed);
      if (sellerFromSlug) return sellerFromSlug;
      
      throw new Error(`Não foi possível acessar o anúncio ${extracted.id}. Ele pode estar inativo ou removido.`);
    }

    if (extracted.type === 'MLBU') {
      // MLBU: try catalog search, then slug fallback
      try {
        return await resolveFromCatalog(extracted.id, trimmed);
      } catch {
        const sellerFromSlug = await tryResolveFromUrlSlug(trimmed);
        if (sellerFromSlug) return sellerFromSlug;
        throw new Error(`Não foi possível encontrar vendedores para o produto ${extracted.id}. Tente colar o link de um anúncio específico.`);
      }
    }
  }

  // 3. Try as nickname via search
  try {
    const searchRes = await fetchMLPublic(`/sites/MLB/search?nickname=${encodeURIComponent(trimmed)}&limit=1`);
    if (searchRes?.results?.[0]?.seller?.id) {
      const sellerId = searchRes.results[0].seller.id;
      const userData = await fetchUserPublic(String(sellerId));
      if (userData.nickname?.toLowerCase() === trimmed.toLowerCase()) {
        const totalItems = await fetchSellerItemCount(String(userData.id));
        return {
          ml_seller_id: String(userData.id),
          ml_nickname: userData.nickname,
          reputation: userData.seller_reputation || null,
          total_items: totalItems,
        };
      }
    }
  } catch (e) {
    console.log(`[resolveSellerFromLink] Nickname search failed:`, e);
  }

  // 4. General search as last resort
  try {
    const searchRes = await fetchMLPublic(`/sites/MLB/search?q=${encodeURIComponent(trimmed)}&limit=5`);
    for (const r of searchRes?.results || []) {
      if (r.seller?.id) {
        const userData = await fetchUserPublic(String(r.seller.id));
        if (userData.nickname?.toLowerCase() === trimmed.toLowerCase()) {
          const totalItems = await fetchSellerItemCount(String(userData.id));
          return {
            ml_seller_id: String(userData.id),
            ml_nickname: userData.nickname,
            reputation: userData.seller_reputation || null,
            total_items: totalItems,
          };
        }
      }
    }
  } catch (e) {
    console.log(`[resolveSellerFromLink] General search failed:`, e);
  }

  throw new Error('Não foi possível identificar o vendedor. Tente colar o link de um anúncio ativo do concorrente.');
}

/**
 * Resolve seller from a MLBU catalog product ID.
 */
async function resolveFromCatalog(mlbuId: string, originalInput: string): Promise<ResolvedSeller> {
  // Try catalog search
  try {
    const searchRes = await fetchMLPublic(`/sites/MLB/search?catalog_product_id=${mlbuId}&limit=1`);
    if (searchRes?.results?.[0]?.seller?.id) {
      const sellerId = searchRes.results[0].seller.id;
      const userData = await fetchUserPublic(String(sellerId));
      const totalItems = await fetchSellerItemCount(String(userData.id));
      return {
        ml_seller_id: String(userData.id),
        ml_nickname: userData.nickname || `Seller ${userData.id}`,
        reputation: userData.seller_reputation || null,
        total_items: totalItems,
      };
    }
  } catch (e) {
    console.log(`[resolveSellerFromLink] Catalog search failed for ${mlbuId}`);
  }

  // Try title from URL slug
  const slugMatch = originalInput.match(/mercadolivre\.com\.br\/([^\/]+)\/(?:up|p)\//i);
  if (slugMatch) {
    try {
      const titleQuery = slugMatch[1].replace(/-/g, ' ').substring(0, 60);
      const searchRes = await fetchMLPublic(`/sites/MLB/search?q=${encodeURIComponent(titleQuery)}&limit=1`);
      if (searchRes?.results?.[0]?.seller?.id) {
        const sellerId = searchRes.results[0].seller.id;
        const userData = await fetchUserPublic(String(sellerId));
        const totalItems = await fetchSellerItemCount(String(userData.id));
        return {
          ml_seller_id: String(userData.id),
          ml_nickname: userData.nickname || `Seller ${userData.id}`,
          reputation: userData.seller_reputation || null,
          total_items: totalItems,
        };
      }
    } catch (e) {
      console.log(`[resolveSellerFromLink] Title search fallback failed`);
    }
  }

  throw new Error(`Não foi possível encontrar vendedores para o produto ${mlbuId}. Tente colar o link de um anúncio específico.`);
}
