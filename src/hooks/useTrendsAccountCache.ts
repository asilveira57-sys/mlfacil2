import { useCallback } from 'react';

/**
 * ACCOUNT-SPECIFIC CACHE - Isolated per account_id
 * 
 * Used for seller-dependent data:
 * - Detected categories (my categories)
 * - Eligibility/unlock status
 * - Account-specific metrics and performance data
 * 
 * Keys ALWAYS include account_id
 */

// TTL in milliseconds
const DETECTION_TTL = 12 * 60 * 60 * 1000; // 12 hours for category detection
const ELIGIBILITY_TTL = 60 * 60 * 1000; // 1 hour for eligibility status
const METRICS_TTL = 15 * 60 * 1000; // 15 minutes for seller metrics
const PERFORMANCE_TTL = 30 * 60 * 1000; // 30 minutes for performance data

// Storage key prefixes
const ACCOUNT_PREFIX = 'ml:account:';

interface CachedDetectedCategories {
  account_id: string;
  categories: Array<{
    category_id: string;
    category_name: string;
    is_pinned_auto: boolean;
    gmv_30d: number | null;
    orders_count_30d: number | null;
  }>;
  cached_at: number;
}

interface CachedEligibility {
  account_id: string;
  category_id: string;
  is_eligible: boolean;
  reason?: string;
  order_count?: number;
  cached_at: number;
}

interface CachedSellerMetrics {
  account_id: string;
  category_id: string;
  metrics: Record<string, unknown>;
  cached_at: number;
}

interface CachedLastSelection {
  account_id: string;
  category_id: string;
  category_name: string;
  cached_at: number;
}

// In-memory cache for fast access (keyed by account_id)
const accountDetectionCache = new Map<string, CachedDetectedCategories>();
const accountEligibilityCache = new Map<string, CachedEligibility>(); // key: account:category
const accountMetricsCache = new Map<string, CachedSellerMetrics>(); // key: account:category
const accountLastSelectionCache = new Map<string, CachedLastSelection>();

// Track in-flight requests to avoid duplicates
const accountInflightDetection = new Map<string, Promise<CachedDetectedCategories | null>>();
const accountInflightEligibility = new Map<string, Promise<CachedEligibility | null>>();
const accountInflightMetrics = new Map<string, Promise<CachedSellerMetrics | null>>();

export function useTrendsAccountCache() {
  // =========== DETECTED CATEGORIES (12h TTL) ===========

  const isDetectionValid = useCallback((entry: CachedDetectedCategories | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.cached_at < DETECTION_TTL;
  }, []);

  const getDetectedCategories = useCallback((accountId: string): CachedDetectedCategories | null => {
    const key = accountId;
    const cached = accountDetectionCache.get(key);
    if (isDetectionValid(cached)) {
      return cached!;
    }
    // Try localStorage
    try {
      const stored = localStorage.getItem(`${ACCOUNT_PREFIX}${accountId}:detection`);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedDetectedCategories;
        if (isDetectionValid(parsed)) {
          accountDetectionCache.set(key, parsed);
          return parsed;
        } else {
          localStorage.removeItem(`${ACCOUNT_PREFIX}${accountId}:detection`);
        }
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }, [isDetectionValid]);

  const setDetectedCategories = useCallback((accountId: string, categories: CachedDetectedCategories['categories']): void => {
    const entry: CachedDetectedCategories = {
      account_id: accountId,
      categories,
      cached_at: Date.now(),
    };
    accountDetectionCache.set(accountId, entry);
    try {
      localStorage.setItem(`${ACCOUNT_PREFIX}${accountId}:detection`, JSON.stringify(entry));
    } catch (e) {
      // Ignore
    }
  }, []);

  const getDetectionInflight = useCallback((accountId: string): Promise<CachedDetectedCategories | null> | null => {
    return accountInflightDetection.get(accountId) || null;
  }, []);

  const setDetectionInflight = useCallback((accountId: string, promise: Promise<CachedDetectedCategories | null>): void => {
    accountInflightDetection.set(accountId, promise);
    promise.finally(() => {
      accountInflightDetection.delete(accountId);
    });
  }, []);

  // =========== ELIGIBILITY (1h TTL) ===========

  const isEligibilityValid = useCallback((entry: CachedEligibility | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.cached_at < ELIGIBILITY_TTL;
  }, []);

  const getEligibility = useCallback((accountId: string, categoryId: string): CachedEligibility | null => {
    const key = `${accountId}:${categoryId}`;
    const cached = accountEligibilityCache.get(key);
    if (isEligibilityValid(cached)) {
      return cached!;
    }
    // Try localStorage
    try {
      const stored = localStorage.getItem(`${ACCOUNT_PREFIX}${accountId}:eligibility:${categoryId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedEligibility;
        if (isEligibilityValid(parsed)) {
          accountEligibilityCache.set(key, parsed);
          return parsed;
        } else {
          localStorage.removeItem(`${ACCOUNT_PREFIX}${accountId}:eligibility:${categoryId}`);
        }
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }, [isEligibilityValid]);

  const setEligibility = useCallback((accountId: string, categoryId: string, isEligible: boolean, reason?: string, orderCount?: number): void => {
    const key = `${accountId}:${categoryId}`;
    const entry: CachedEligibility = {
      account_id: accountId,
      category_id: categoryId,
      is_eligible: isEligible,
      reason,
      order_count: orderCount,
      cached_at: Date.now(),
    };
    accountEligibilityCache.set(key, entry);
    try {
      localStorage.setItem(`${ACCOUNT_PREFIX}${accountId}:eligibility:${categoryId}`, JSON.stringify(entry));
    } catch (e) {
      // Ignore
    }
  }, []);

  const getEligibilityInflight = useCallback((accountId: string, categoryId: string): Promise<CachedEligibility | null> | null => {
    return accountInflightEligibility.get(`${accountId}:${categoryId}`) || null;
  }, []);

  const setEligibilityInflight = useCallback((accountId: string, categoryId: string, promise: Promise<CachedEligibility | null>): void => {
    const key = `${accountId}:${categoryId}`;
    accountInflightEligibility.set(key, promise);
    promise.finally(() => {
      accountInflightEligibility.delete(key);
    });
  }, []);

  // =========== SELLER METRICS (15min TTL) ===========

  const isMetricsValid = useCallback((entry: CachedSellerMetrics | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.cached_at < METRICS_TTL;
  }, []);

  const getSellerMetrics = useCallback((accountId: string, categoryId: string): CachedSellerMetrics | null => {
    const key = `${accountId}:${categoryId}`;
    const cached = accountMetricsCache.get(key);
    if (isMetricsValid(cached)) {
      return cached!;
    }
    // Metrics are short-lived, don't persist to localStorage
    return null;
  }, [isMetricsValid]);

  const setSellerMetrics = useCallback((accountId: string, categoryId: string, metrics: Record<string, unknown>): void => {
    const key = `${accountId}:${categoryId}`;
    const entry: CachedSellerMetrics = {
      account_id: accountId,
      category_id: categoryId,
      metrics,
      cached_at: Date.now(),
    };
    accountMetricsCache.set(key, entry);
    // Short-lived metrics don't need localStorage persistence
  }, []);

  const getMetricsInflight = useCallback((accountId: string, categoryId: string): Promise<CachedSellerMetrics | null> | null => {
    return accountInflightMetrics.get(`${accountId}:${categoryId}`) || null;
  }, []);

  const setMetricsInflight = useCallback((accountId: string, categoryId: string, promise: Promise<CachedSellerMetrics | null>): void => {
    const key = `${accountId}:${categoryId}`;
    accountInflightMetrics.set(key, promise);
    promise.finally(() => {
      accountInflightMetrics.delete(key);
    });
  }, []);

  // =========== LAST SELECTION (7 days TTL) ===========

  const SELECTION_TTL = 7 * 24 * 60 * 60 * 1000;

  const isSelectionValid = useCallback((entry: CachedLastSelection | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.cached_at < SELECTION_TTL;
  }, []);

  const getLastSelection = useCallback((accountId: string): CachedLastSelection | null => {
    const cached = accountLastSelectionCache.get(accountId);
    if (isSelectionValid(cached)) {
      return cached!;
    }
    // Try localStorage
    try {
      const stored = localStorage.getItem(`${ACCOUNT_PREFIX}${accountId}:last_selection`);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedLastSelection;
        if (isSelectionValid(parsed)) {
          accountLastSelectionCache.set(accountId, parsed);
          return parsed;
        } else {
          localStorage.removeItem(`${ACCOUNT_PREFIX}${accountId}:last_selection`);
        }
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }, [isSelectionValid]);

  const setLastSelection = useCallback((accountId: string, categoryId: string, categoryName: string): void => {
    const entry: CachedLastSelection = {
      account_id: accountId,
      category_id: categoryId,
      category_name: categoryName,
      cached_at: Date.now(),
    };
    accountLastSelectionCache.set(accountId, entry);
    try {
      localStorage.setItem(`${ACCOUNT_PREFIX}${accountId}:last_selection`, JSON.stringify(entry));
    } catch (e) {
      // Ignore
    }
  }, []);

  // =========== UTILS ===========

  const clearAccountCache = useCallback((accountId: string): void => {
    // Clear all entries for this account
    accountDetectionCache.delete(accountId);
    accountLastSelectionCache.delete(accountId);
    
    // Clear eligibility and metrics entries
    for (const key of accountEligibilityCache.keys()) {
      if (key.startsWith(`${accountId}:`)) {
        accountEligibilityCache.delete(key);
      }
    }
    for (const key of accountMetricsCache.keys()) {
      if (key.startsWith(`${accountId}:`)) {
        accountMetricsCache.delete(key);
      }
    }
    
    // Clear localStorage entries
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${ACCOUNT_PREFIX}${accountId}:`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      // Ignore
    }
  }, []);

  const getStats = useCallback(() => ({
    detectionEntries: accountDetectionCache.size,
    eligibilityEntries: accountEligibilityCache.size,
    metricsEntries: accountMetricsCache.size,
    selectionEntries: accountLastSelectionCache.size,
    inflightDetection: accountInflightDetection.size,
    inflightEligibility: accountInflightEligibility.size,
    inflightMetrics: accountInflightMetrics.size,
  }), []);

  const clearAll = useCallback((): void => {
    accountDetectionCache.clear();
    accountEligibilityCache.clear();
    accountMetricsCache.clear();
    accountLastSelectionCache.clear();
    accountInflightDetection.clear();
    accountInflightEligibility.clear();
    accountInflightMetrics.clear();
  }, []);

  return {
    // Detection
    getDetectedCategories,
    setDetectedCategories,
    getDetectionInflight,
    setDetectionInflight,
    
    // Eligibility
    getEligibility,
    setEligibility,
    getEligibilityInflight,
    setEligibilityInflight,
    
    // Metrics
    getSellerMetrics,
    setSellerMetrics,
    getMetricsInflight,
    setMetricsInflight,
    
    // Last Selection
    getLastSelection,
    setLastSelection,
    
    // Utils
    clearAccountCache,
    getStats,
    clearAll,
  };
}

// Export types
export type { CachedDetectedCategories, CachedEligibility, CachedSellerMetrics, CachedLastSelection };
