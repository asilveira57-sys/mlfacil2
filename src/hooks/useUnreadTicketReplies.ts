/**
 * Hook to count tickets with unread support replies
 * Counts tickets where the latest message is from 'support' (not yet replied by user)
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';

export function useUnreadTicketReplies() {
  const { currentWorkspace } = useWorkspace();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!currentWorkspace) return;

    const fetchCount = async () => {
      try {
        // Get all non-closed tickets for this workspace
        const { data: tickets, error: ticketsError } = await supabase
          .from('support_tickets')
          .select('id')
          .eq('workspace_id', currentWorkspace.id)
          .eq('status', 'waiting_response');

        if (ticketsError || !tickets?.length) {
          setCount(0);
          return;
        }

        // For each waiting_response ticket, the last message should be from support
        // This is already implied by the status, so count = tickets.length
        setCount(tickets.length);
      } catch {
        setCount(0);
      }
    };

    fetchCount();

    // Refresh every 60s
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [currentWorkspace]);

  return count;
}
