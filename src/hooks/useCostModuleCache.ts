// Simple in-memory cache with TTL for the Cost module
const cacheStore = new Map<string, { data: any; ts: number }>();
let currentSellerId: string | null = null;

const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes

export function getCostCache(key: string): any | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > DEFAULT_TTL_MS) {
    cacheStore.delete(key);
    return null;
  }
  return entry.data;
}

export function setCostCache(key: string, data: any) {
  cacheStore.set(key, { data, ts: Date.now() });
}

export function invalidateCostCache(prefix?: string) {
  if (prefix) {
    for (const key of cacheStore.keys()) {
      if (key.startsWith(prefix)) cacheStore.delete(key);
    }
  } else {
    cacheStore.clear();
  }
}

export function checkSellerChange(sellerId: string | null) {
  if (sellerId !== currentSellerId) {
    cacheStore.clear();
    currentSellerId = sellerId;
  }
}
