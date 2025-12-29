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

      let query = supabase
        .from('meli_print_queue')
        .select('*')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(50);

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
