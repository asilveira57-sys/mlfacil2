import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to register events in the account_events table.
 * Fail-safe: errors are caught silently to never break the caller.
 */
export function useOnboardingEvents() {
  const registerEvent = useCallback(async (
    eventType: string,
    eventData: Record<string, unknown> = {},
    companyId?: string | null,
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('account_events').insert({
        user_id: user.id,
        tenant_id: companyId ?? null,
        company_id: companyId ?? null,
        event_type: eventType,
        event_data: {
          ...eventData,
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
        },
      } as any);

      console.info(`[AccountEvent] ${eventType}`, eventData);
    } catch (err) {
      console.warn('[AccountEvent] Failed to register event:', eventType, err);
    }
  }, []);

  return { registerEvent };
}
