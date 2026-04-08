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

export function useEmailSendLog() {
  return useQuery({
    queryKey: ['admin', 'email-send-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_send_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as EmailSendLogEntry[];
    },
  });
}
