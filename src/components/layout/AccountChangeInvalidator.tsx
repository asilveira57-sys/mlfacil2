import { useAccountChangeInvalidation } from '@/hooks/useAccountChangeInvalidation';

/**
 * Component that sets up cache invalidation on account changes.
 * Must be placed inside QueryClientProvider and ActiveAccountProvider.
 */
export function AccountChangeInvalidator() {
  useAccountChangeInvalidation();
  return null;
}
