import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';

// ============================================================
// TRENDS DATA CACHE - Cache-first strategy
// TTLs: ranking=6h, trends=2h, seller metrics=30min
// ============================================================

const CACHE_KEYS = {
  LAST_CATEGORY: 'trends:lastCategory',
  MARKET_TRENDS: 'trends:marketTrends',
  HIGHLIGHTS: 'trends:highlights',
  ELIGIBILITY: 'trends:eligibility',
} as const;

interface CachedMarketData {
  trends: TrendItem[];
  keywords: TrendItem[];
  snapshotDate: string | null;
  cachedAt: number;
}

interface CachedHighlights {
  items: HighlightItem[];
  snapshotDate: string | null;
  cachedAt: number;
}

interface CachedEligibility {
  eligibilityState: string;
  ordersCount: number;
  revenue: number;
  hasHistory: boolean;
  cachedAt: number;
}

export interface TrendItem {
  keyword: string;
  url?: string;
}

export interface HighlightItem {
  item_id: string;
  rank: number;
  title: string | null;
  thumbnail: string | null;
  price: number | null;
  sold_quantity: number | null;
  permalink: string | null;
  estimated_revenue?: number | null;
}

const TTL = {
  MARKET_TRENDS: 2 * 60 * 60 * 1000, // 2 hours
  HIGHLIGHTS: 6 * 60 * 60 * 1000, // 6 hours
  ELIGIBILITY: 30 * 60 * 1000, // 30 minutes
};

// Memory cache (session-level, faster than localStorage)
const memoryCache = new Map<string, { data: unknown; cachedAt: number; ttl: number }>();

function getCacheKey(type: string, ...args: (string | null)[]): string {
  return `${type}:${args.filter(Boolean).join(':')}`;
}

function getFromCache<T>(key: string, ttl: number): T | null {
  const entry = memoryCache.get(key);
  if (entry && Date.now() - entry.cachedAt < ttl) {
    return entry.data as T;
  }
  return null;
}

function setToCache<T>(key: string, data: T, ttl: number): void {
  memoryCache.set(key, { data, cachedAt: Date.now(), ttl });
}

// ============================================================
// LAST CATEGORY PERSISTENCE (per account)
// ============================================================

export function useLastCategory() {
  const get = useCallback((accountId: string | null): { id: string; name: string } | null => {
    if (!accountId) return null;
    try {
      const stored = localStorage.getItem(`${CACHE_KEYS.LAST_CATEGORY}:${accountId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check 7 day TTL
        if (Date.now() - parsed.savedAt < 7 * 24 * 60 * 60 * 1000) {
          return { id: parsed.id, name: parsed.name };
        }
      }
    } catch (e) {
      console.warn('[useTrendsDataCache] Failed to read last category:', e);
    }
    return null;
  }, []);

  const set = useCallback((accountId: string | null, categoryId: string, categoryName: string): void => {
    if (!accountId) return;
    try {
      localStorage.setItem(`${CACHE_KEYS.LAST_CATEGORY}:${accountId}`, JSON.stringify({
        id: categoryId,
        name: categoryName,
        savedAt: Date.now(),
      }));
    } catch (e) {
      console.warn('[useTrendsDataCache] Failed to save last category:', e);
    }
  }, []);

  return { get, set };
}

// ============================================================
// MARKET TRENDS (cache-first)
// ============================================================

export function useMarketTrendsCached(siteId: string, categoryId: string | null) {
  const cacheKey = getCacheKey('marketTrends', siteId, categoryId);
  
  return useQuery({
    queryKey: ['trends-cached', 'market', siteId, categoryId],
    queryFn: async (): Promise<CachedMarketData> => {
      // 1. Check memory cache first
      const cached = getFromCache<CachedMarketData>(cacheKey, TTL.MARKET_TRENDS);
      if (cached) {
        console.log('[useTrendsDataCache] Market trends cache hit');
        // Trigger background refresh if older than half TTL
        if (Date.now() - cached.cachedAt > TTL.MARKET_TRENDS / 2) {
          fetchFreshMarketTrends(siteId, categoryId, cacheKey);
        }
        return cached;
      }

      // 2. Fetch from API
      console.log('[useTrendsDataCache] Market trends cache miss, fetching...');
      return fetchFreshMarketTrends(siteId, categoryId, cacheKey);
    },
    staleTime: TTL.MARKET_TRENDS / 2,
    gcTime: TTL.MARKET_TRENDS,
    enabled: !!categoryId,
    placeholderData: (prev) => prev,
  });
}

async function fetchFreshMarketTrends(siteId: string, categoryId: string | null, cacheKey: string): Promise<CachedMarketData> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const params = new URLSearchParams({ site_id: siteId });
  if (categoryId) params.append('category_id', categoryId);

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trends-api/mercado/trends?${params}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const apiData = await response.json();
  const result: CachedMarketData = {
    trends: apiData.trends || [],
    keywords: apiData.keywords || apiData.trends || [],
    snapshotDate: apiData.snapshot_date || null,
    cachedAt: Date.now(),
  };

  setToCache(cacheKey, result, TTL.MARKET_TRENDS);
  return result;
}

// ============================================================
// HIGHLIGHTS / BEST SELLERS (cache-first)
// ============================================================

export function useHighlightsCached(siteId: string, categoryId: string | null) {
  const cacheKey = getCacheKey('highlights', siteId, categoryId);
  
  return useQuery({
    queryKey: ['trends-cached', 'highlights', siteId, categoryId],
    queryFn: async (): Promise<CachedHighlights> => {
      // Validate category before making request
      if (!categoryId) {
        console.warn('[useTrendsDataCache] Highlights: categoryId is empty/null, skipping fetch');
        return {
          items: [],
          snapshotDate: null,
          cachedAt: Date.now(),
        };
      }

      // 1. Check memory cache first
      const cached = getFromCache<CachedHighlights>(cacheKey, TTL.HIGHLIGHTS);
      if (cached) {
        console.log('[useTrendsDataCache] Highlights cache hit', { 
          categoryId, 
          itemsCount: cached.items.length,
          cachedAgo: Math.round((Date.now() - cached.cachedAt) / 1000) + 's'
        });
        // Trigger background refresh if older than half TTL
        if (Date.now() - cached.cachedAt > TTL.HIGHLIGHTS / 2) {
          fetchFreshHighlights(siteId, categoryId, cacheKey).catch(err => {
            console.warn('[useTrendsDataCache] Background refresh failed:', err);
          });
        }
        return cached;
      }

      // 2. Fetch from API
      console.log('[useTrendsDataCache] Highlights cache miss, fetching...', { categoryId, siteId });
      return fetchFreshHighlights(siteId, categoryId, cacheKey);
    },
    staleTime: TTL.HIGHLIGHTS / 2,
    gcTime: TTL.HIGHLIGHTS,
    enabled: !!categoryId,
    placeholderData: (prev) => prev,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

async function fetchFreshHighlights(siteId: string, categoryId: string | null, cacheKey: string): Promise<CachedHighlights> {
  const startTime = Date.now();
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trends-api/mercado/highlights`;
  
  console.log('[useTrendsDataCache] fetchFreshHighlights starting', { siteId, categoryId });
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('[useTrendsDataCache] fetchFreshHighlights: Not authenticated');
    throw new Error('Not authenticated');
  }

  const params = new URLSearchParams({ site_id: siteId });
  if (categoryId) {
    params.append('category_id', categoryId);
  } else {
    params.append('all', 'true');
  }

  const fullUrl = `${endpoint}?${params}`;
  console.log('[useTrendsDataCache] Fetching highlights:', fullUrl);
  
  const response = await fetch(fullUrl, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  const elapsed = Date.now() - startTime;
  
  if (!response.ok) {
    console.error('[useTrendsDataCache] Highlights API error', {
      status: response.status,
      categoryId,
      elapsed: `${elapsed}ms`,
    });
    throw new Error(`API error: ${response.status}`);
  }

  const apiData = await response.json();
  
  // Robust parsing: accept any items with item_id OR catalog_id
  const rawItems = apiData.items || [];
  const parsedItems = rawItems
    .filter((item: any) => item.item_id || item.catalog_id)
    .map((item: any, index: number) => ({
      item_id: item.item_id || item.catalog_id || `unknown-${index}`,
      rank: item.rank || index + 1,
      title: item.title || null,
      thumbnail: item.thumbnail || item.image || null,
      price: item.price ?? null,
      sold_quantity: item.sold_quantity ?? item.sold ?? null,
      permalink: item.permalink || item.url || null,
      estimated_revenue: item.estimated_revenue ?? null,
      entity_type: item.entity_type || 'ITEM',
    }))
    .slice(0, 20); // Keep up to 20 items
  
  console.log('[useTrendsDataCache] Highlights fetched', {
    categoryId,
    rawCount: rawItems.length,
    parsedCount: parsedItems.length,
    snapshotDate: apiData.snapshot_date,
    elapsed: `${elapsed}ms`,
    message: apiData.message || null,
  });
  
  const result: CachedHighlights = {
    items: parsedItems,
    snapshotDate: apiData.snapshot_date || null,
    cachedAt: Date.now(),
  };

  setToCache(cacheKey, result, TTL.HIGHLIGHTS);
  return result;
}

// ============================================================
// ELIGIBILITY (cache-first)
// ============================================================

export function useEligibilityCached(sellerId: string | null, categoryId: string | null, periodDays: number) {
  const periodKey = `last_${periodDays}d`;
  const cacheKey = getCacheKey('eligibility', sellerId, categoryId, periodKey);
  
  return useQuery({
    queryKey: ['trends-cached', 'eligibility', sellerId, categoryId, periodKey],
    queryFn: async (): Promise<CachedEligibility> => {
      if (!sellerId) {
        return {
          eligibilityState: 'unknown',
          ordersCount: 0,
          revenue: 0,
          hasHistory: false,
          cachedAt: Date.now(),
        };
      }

      // 1. Check memory cache first
      const cached = getFromCache<CachedEligibility>(cacheKey, TTL.ELIGIBILITY);
      if (cached) {
        console.log('[useTrendsDataCache] Eligibility cache hit');
        return cached;
      }

      // 2. Check database cache
      const { data: dbCached } = await supabase
        .from('seller_category_eligibility')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('category_id', categoryId || '')
        .eq('period_key', periodKey)
        .maybeSingle();

      if (dbCached && new Date(dbCached.expires_at) > new Date()) {
        const result: CachedEligibility = {
          eligibilityState: dbCached.eligibility_state,
          ordersCount: dbCached.orders_count,
          revenue: Number(dbCached.revenue),
          hasHistory: dbCached.orders_count > 0,
          cachedAt: Date.now(),
        };
        setToCache(cacheKey, result, TTL.ELIGIBILITY);
        return result;
      }

      // 3. Calculate fresh
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return {
          eligibilityState: 'unknown',
          ordersCount: 0,
          revenue: 0,
          hasHistory: false,
          cachedAt: Date.now(),
        };
      }

      const { data: calculated } = await supabase.rpc('calculate_category_eligibility', {
        p_user_id: session.user.id,
        p_seller_id: sellerId,
        p_category_id: categoryId || '',
        p_period_days: periodDays,
        p_threshold_orders: 10,
      });

      const calcResult = calculated?.[0] || { eligibility_state: 'inactive', orders_count: 0, revenue: 0 };
      
      const result: CachedEligibility = {
        eligibilityState: calcResult.eligibility_state,
        ordersCount: calcResult.orders_count,
        revenue: Number(calcResult.revenue),
        hasHistory: calcResult.orders_count > 0,
        cachedAt: Date.now(),
      };

      setToCache(cacheKey, result, TTL.ELIGIBILITY);
      return result;
    },
    staleTime: TTL.ELIGIBILITY / 2,
    gcTime: TTL.ELIGIBILITY,
    enabled: !!sellerId,
    placeholderData: (prev) => prev,
  });
}

// ============================================================
// REFRESH UTILITY
// ============================================================

export function useTrendsRefresh() {
  const queryClient = useQueryClient();
  
  const refresh = useCallback(() => {
    // Clear memory cache
    memoryCache.clear();
    
    // Invalidate queries (will refetch in background)
    queryClient.invalidateQueries({ queryKey: ['trends-cached'] });
    
    console.log('[useTrendsDataCache] Cache cleared, refreshing...');
  }, [queryClient]);

  return refresh;
}
