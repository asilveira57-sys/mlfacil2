import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PrintQueueEntry {
  id: string;
  seller_id: string;
  format: string;
  shipment_ids: string[];
  total_labels: number;
  status: string;
  file_url: string | null;
  zpl_content: string | null;
  error_log: string | null;
  created_at: string;
}

export function usePrintHistory(sellerId: string | null, shipmentId?: string) {
  return useQuery({
    queryKey: ['print-history', sellerId, shipmentId],
    queryFn: async () => {
      if (!sellerId) return [];

      // Cost guard: do NOT pull pdf_base64 / zpl_content / large payloads in
      // the listing. Heavy fields are loaded on-demand when the user prints.
      let query = supabase
        .from('meli_print_queue')
        .select('id, seller_id, format, shipment_ids, total_labels, status, file_url, error_log, created_at')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching print history:', error);
        throw error;
      }

      // Filter by shipment_id if provided
      let entries = (data || []) as unknown as PrintQueueEntry[];
      
      if (shipmentId) {
        entries = entries.filter(entry => {
          const ids = entry.shipment_ids as unknown as string[];
          return Array.isArray(ids) && ids.includes(shipmentId);
        });
      }

      return entries;
    },
    enabled: !!sellerId,
  });
}
