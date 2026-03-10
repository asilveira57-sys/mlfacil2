import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/**
 * Persistent cache configuration for React Query.
 * 
 * Only stable/config data is persisted. Operational data is excluded
 * via the dehydrate filter in App.tsx.
 * 
 * Persisted query key prefixes (stable data):
 * - config-menu, dynamic-menu, system-modules
 * - tier-plans, billing-plans
 * - workspace-companies, current-workspace
 * - user-context, welcome-onboarding
 * - theme-resolver, visual-identity
 * - access-profiles-matrix
 * - br-locations
 * 
 * Max age: 12 hours for config, handled by buster version.
 */

const PERSIST_BUSTER = 'v1'; // bump to invalidate all persisted cache

export const queryPersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'mlfacil-rq-cache',
  throttleTime: 2000, // write at most every 2s
});

export const PERSIST_MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours
export const PERSIST_BUSTER_KEY = PERSIST_BUSTER;

/**
 * Query keys that should be persisted to localStorage.
 * Only stable/config data — never operational data.
 */
const PERSISTABLE_PREFIXES = [
  'config-menu',
  'dynamic-menu',
  'system-modules',
  'tier-plans',
  'billing-plans',
  'workspace-companies',
  'current-workspace',
  'user-context',
  'welcome-onboarding',
  'theme-resolver',
  'visual-identity',
  'access-profiles-matrix',
  'br-locations',
  'seller-categories',
  'seo-meta',
];

/**
 * Returns true if a query should be persisted to storage.
 */
export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const firstKey = queryKey[0];
  if (typeof firstKey !== 'string') return false;
  return PERSISTABLE_PREFIXES.some(prefix => firstKey.startsWith(prefix));
}
