import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EmailSendLogEntry {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Deduplicated: keeps only the latest status per message_id */
export interface DeduplicatedEmailEntry {
  message_id: string;
  template_name: string | null;
  recipient_email: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export function useEmailSendLog(filters?: { search?: string; status?: string; template?: string }) {
  return useQuery({
    queryKey: ['admin', 'email-send-log', filters],
    queryFn: async () => {
      let query = supabase
        .from('email_send_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.template) {
        query = query.eq('template_name', filters.template);
      }
      if (filters?.search) {
        query = query.ilike('recipient_email', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const raw = (data || []) as unknown as EmailSendLogEntry[];

      // Deduplicate by message_id — keep latest status
      const byMessageId = new Map<string, DeduplicatedEmailEntry>();
      for (const entry of raw) {
        const key = entry.message_id || entry.id;
        const existing = byMessageId.get(key);
        if (!existing || new Date(entry.created_at) > new Date(existing.created_at)) {
          byMessageId.set(key, {
            message_id: key,
            template_name: entry.template_name,
            recipient_email: entry.recipient_email,
            status: entry.status,
            error_message: entry.error_message,
            created_at: entry.created_at,
          });
        }
      }

      return Array.from(byMessageId.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });
}
