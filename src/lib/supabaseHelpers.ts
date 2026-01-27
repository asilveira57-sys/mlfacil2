/**
 * Supabase Helpers - Funções auxiliares para evitar limite de 1000 registros
 * 
 * O Supabase possui um limite padrão de 1000 registros por query.
 * Estas funções implementam paginação automática para buscar todos os dados.
 */

import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 1000;

/**
 * Busca todos os registros de uma tabela usando paginação automática.
 * Útil quando você precisa de TODOS os dados, não apenas os primeiros 1000.
 * 
 * @example
 * const allOrders = await fetchAllRows<Order>(
 *   supabase.from('orders').select('*').eq('seller_id', sellerId)
 * );
 */
export async function fetchAllRows<T>(
  baseQuery: any
): Promise<T[]> {
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    // Clone the query and apply range
    const { data, error } = await baseQuery.range(from, from + PAGE_SIZE - 1);
    
    if (error) {
      console.error('[fetchAllRows] Error:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = [...allData, ...(data as T[])];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    }
  }

  return allData;
}

/**
 * Versão para Edge Functions (Deno) - usa o cliente Supabase passado
 */
export async function fetchAllRowsDeno<T>(
  supabaseClient: any,
  table: string,
  selectFields: string,
  filters: { column: string; value: any; op?: 'eq' | 'in' | 'gte' | 'lte' | 'neq' }[] = [],
  orderBy?: { column: string; ascending?: boolean }
): Promise<T[]> {
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseClient.from(table).select(selectFields);
    
    // Apply filters
    for (const filter of filters) {
      const op = filter.op || 'eq';
      switch (op) {
        case 'eq':
          query = query.eq(filter.column, filter.value);
          break;
        case 'in':
          query = query.in(filter.column, filter.value);
          break;
        case 'gte':
          query = query.gte(filter.column, filter.value);
          break;
        case 'lte':
          query = query.lte(filter.column, filter.value);
          break;
        case 'neq':
          query = query.neq(filter.column, filter.value);
          break;
      }
    }
    
    // Apply ordering
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }
    
    // Apply pagination
    query = query.range(from, from + PAGE_SIZE - 1);
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[fetchAllRowsDeno] Error:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = [...allData, ...(data as T[])];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    }
  }

  return allData;
}

/**
 * Busca todos os registros usando batches para queries com .in()
 * O Supabase limita .in() a ~1000 valores, então dividimos em batches
 */
export async function fetchWithBatchedIn<T>(
  supabaseClient: any,
  table: string,
  selectFields: string,
  inColumn: string,
  inValues: string[],
  additionalFilters: { column: string; value: any }[] = []
): Promise<T[]> {
  if (inValues.length === 0) return [];
  
  const BATCH_SIZE = 500;
  const allResults: T[] = [];
  
  for (let i = 0; i < inValues.length; i += BATCH_SIZE) {
    const batch = inValues.slice(i, i + BATCH_SIZE);
    
    let query = supabaseClient.from(table).select(selectFields).in(inColumn, batch);
    
    for (const filter of additionalFilters) {
      query = query.eq(filter.column, filter.value);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[fetchWithBatchedIn] Error:', error);
      throw error;
    }
    
    if (data) {
      allResults.push(...(data as T[]));
    }
  }
  
  return allResults;
}
