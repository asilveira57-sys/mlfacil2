import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchConfigMenuItems } from '@/hooks/useConfigMenu';

const SYNC_COOLDOWN_KEY = 'postlogin_sync_';
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours per account

/**
 * Check if current hour (BRT) is within allowed sync window (09:00–15:00).
 */
function isWithinSyncWindow(): boolean {
  const now = new Date();
  // Get BRT hour (UTC-3)
  const utcHour = now.getUTCHours();
  const brtHour = (utcHour - 3 + 24) % 24;
  return brtHour >= 9 && brtHour < 15;
}

/**
 * Check cooldown per account using localStorage.
 */
function canSyncAccount(sellerId: string): boolean {
  const key = SYNC_COOLDOWN_KEY + sellerId;
  const lastSync = localStorage.getItem(key);
  if (!lastSync) return true;
  return Date.now() - parseInt(lastSync, 10) > COOLDOWN_MS;
}

function markSynced(sellerId: string): void {
  const key = SYNC_COOLDOWN_KEY + sellerId;
  localStorage.setItem(key, Date.now().toString());
}

/**
 * Prefetches critical data right after login so pages load instantly.
 * Also triggers background order sync for all seller accounts (2h cooldown, 09–15h BRT window).
 * Runs once per session (tracked via ref).
 */
export function usePostLoginPrefetch() {
  const queryClient = useQueryClient();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (hasPrefetched.current) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !hasPrefetched.current) {
        hasPrefetched.current = true;
        
        setTimeout(() => {
          // Prefetch config menu — uses the SAME queryFn as useConfigMenu
          queryClient.prefetchQuery({
            queryKey: ['config-menu'],
            queryFn: fetchConfigMenuItems,
            staleTime: 30 * 60 * 1000,
          });

          // Prefetch workspace companies
          queryClient.prefetchQuery({
            queryKey: ['workspace-companies'],
            queryFn: async () => {
              const { data } = await (supabase as any).from('company_members').select('company_id, role, companies(id, name, slug)');
              return data;
            },
            staleTime: 30 * 60 * 1000,
          });

          // Prefetch visual identity
          queryClient.prefetchQuery({
            queryKey: ['visual-identity'],
            queryFn: async () => {
              const { data } = await (supabase as any).from('visual_identity').select('*').limit(1).maybeSingle();
              return data;
            },
            staleTime: 30 * 60 * 1000,
          });

          // === Proactive background sync for orders ===
          if (isWithinSyncWindow()) {
            triggerBackgroundOrderSync();
          } else if (import.meta.env.DEV) {
            console.info('[Prefetch] Outside sync window (09–15h BRT), skipping background sync');
          }

          if (import.meta.env.DEV) {
            console.info('[Prefetch] Post-login prefetch triggered');
          }
        }, 300);
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);
}

/**
 * Triggers background order sync for all ML accounts that haven't been synced in 2h.
 * Non-blocking, fire-and-forget.
 */
async function triggerBackgroundOrderSync() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Get all active ML accounts for this user
    const { data: accounts } = await (supabase as any)
      .from('ml_accounts')
      .select('id, ml_user_id, nickname')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    if (!accounts || accounts.length === 0) return;

    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);

    const formatDate = (d: Date, time: string) =>
      `${d.toISOString().split('T')[0]}T${time}-03:00`;

    const dateFrom = formatDate(twoDaysAgo, '00:00:00.000');
    const dateTo = formatDate(now, '23:59:59.999');

    for (const account of accounts) {
      const sellerId = account.ml_user_id;
      if (!sellerId || !canSyncAccount(sellerId)) {
        if (import.meta.env.DEV) {
          console.info(`[Prefetch] Skipping sync for ${account.nickname || sellerId} (cooldown)`);
        }
        continue;
      }

      // Mark as synced immediately to prevent duplicate triggers
      markSynced(sellerId);

      if (import.meta.env.DEV) {
        console.info(`[Prefetch] Background sync for ${account.nickname || sellerId}`);
      }

      // Fire-and-forget — don't await, don't block
      supabase.functions.invoke('ml-sync-orders', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          seller_id: sellerId,
          date_from: dateFrom,
          date_to: dateTo,
        },
      }).catch((err) => {
        console.warn(`[Prefetch] Background sync failed for ${sellerId}:`, err);
      });

      // Small stagger between accounts to avoid thundering herd
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    console.warn('[Prefetch] Background sync error:', err);
  }
}
