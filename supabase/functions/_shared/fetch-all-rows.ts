/**
 * Pagination helper for Edge Functions (Deno)
 * Supabase has a default limit of 1000 rows per query.
 * This helper fetches ALL rows using automatic pagination.
 */

const PAGE_SIZE = 1000;

/**
 * Fetches all rows from a query using automatic pagination via .range()
 * 
 * @example
 * const allOrders = await fetchAllRows(
 *   supabase.from('orders').select('*').eq('seller_id', sellerId)
 * );
 */
export async function fetchAllRows<T = any>(baseQuery: any, maxRetries = 2): Promise<T[]> {
  const allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let lastError: any = null;
    let data: T[] | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { data: d, error } = await baseQuery.range(from, from + PAGE_SIZE - 1);
      if (!error) {
        data = d;
        lastError = null;
        break;
      }
      lastError = error;
      const errMsg = typeof error === 'object' ? (error.message || JSON.stringify(error)) : String(error);
      const isTransient = errMsg.includes('502') || errMsg.includes('Bad gateway') || errMsg.includes('503') || errMsg.includes('BOOT_ERROR');
      if (!isTransient || attempt === maxRetries) {
        console.error('[fetchAllRows] Error:', error);
        throw error;
      }
      console.warn(`[fetchAllRows] Transient error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${(attempt + 1) * 500}ms...`);
      await new Promise(r => setTimeout(r, (attempt + 1) * 500));
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...(data as T[]));
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    }
  }

  return allData;
}

/**
 * Fetches all rows using batched .in() filter
 * Supabase limits .in() to ~1000 values, so we split into batches
 */
export async function fetchWithBatchedIn<T = any>(
  supabase: any,
  table: string,
  selectFields: string,
  inColumn: string,
  inValues: string[],
  additionalFilters: { column: string; value: any; op?: string }[] = []
): Promise<T[]> {
  if (inValues.length === 0) return [];

  const BATCH_SIZE = 500;
  const allResults: T[] = [];

  for (let i = 0; i < inValues.length; i += BATCH_SIZE) {
    const batch = inValues.slice(i, i + BATCH_SIZE);
    let query = supabase.from(table).select(selectFields).in(inColumn, batch);

    for (const filter of additionalFilters) {
      const op = filter.op || 'eq';
      switch (op) {
        case 'eq': query = query.eq(filter.column, filter.value); break;
        case 'neq': query = query.neq(filter.column, filter.value); break;
        case 'gte': query = query.gte(filter.column, filter.value); break;
        case 'lte': query = query.lte(filter.column, filter.value); break;
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('[fetchWithBatchedIn] Error:', error);
      throw error;
    }
    if (data) allResults.push(...(data as T[]));
  }

  return allResults;
}
