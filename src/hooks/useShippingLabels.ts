import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type FinalStatus = 'pronta' | 'aguardando_nf' | 'sem_etiqueta' | 'erro' | 'all';
export type PeriodFilter = 7 | 15 | 30 | 90;

export interface ShippingOrder {
  id: string;
  user_id: string;
  seller_id: string;
  order_id: string;
  created_at_meli: string | null;
  order_status: string | null;
  shipment_id: string | null;
  buyer_nickname: string | null;
  total_amount: number | null;
  order_sync_at: string | null;
  shipment_status: string | null;
  shipment_substatus: string | null;
  tracking_number: string | null;
  label_available: boolean | null;
  receiver_name: string | null;
  shipment_sync_at: string | null;
  invoice_status: string | null;
  invoice_number: string | null;
  invoice_key: string | null;
  issued_at: string | null;
  invoice_sync_at: string | null;
  final_status: string | null;
  selectable: boolean | null;
}

export interface PrintQueueEntry {
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

interface UseShippingLabelsOptions {
  sellerId: string | null;
}

// Helper to get auth headers
async function getAuthHeaders(): Promise<{ Authorization: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return { Authorization: `Bearer ${session.access_token}` };
}

export function useShippingLabels({ sellerId }: UseShippingLabelsOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState<FinalStatus>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(30);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch orders from view
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['shipping-orders', sellerId, statusFilter, periodFilter],
    queryFn: async () => {
      if (!sellerId) return [];

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - periodFilter);

      let query = supabase
        .from('meli_orders_ready_view')
        .select('*')
        .eq('seller_id', sellerId)
        .gte('created_at_meli', dateFrom.toISOString())
        .order('created_at_meli', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('final_status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching orders:', error);
        throw error;
      }

      return (data || []) as ShippingOrder[];
    },
    enabled: !!sellerId,
  });

  // Get last sync time
  const lastSyncAt = orders.length > 0 
    ? orders.reduce((latest, order) => {
        const syncAt = order.order_sync_at;
        if (!syncAt) return latest;
        if (!latest) return syncAt;
        return new Date(syncAt) > new Date(latest) ? syncAt : latest;
      }, null as string | null)
    : null;

  // Sync orders mutation
  const syncOrdersMutation = useMutation({
    mutationFn: async () => {
      if (!sellerId) throw new Error('Seller ID not set');

      const headers = await getAuthHeaders();
      if (!headers) throw new Error('Not authenticated');

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - periodFilter);

      // Step 1: Sync orders
      const ordersResponse = await supabase.functions.invoke('ml-sync-orders', {
        headers,
        body: {
          seller_id: sellerId,
          date_from: dateFrom.toISOString(),
          date_to: new Date().toISOString(),
        },
      });

      if (ordersResponse.error) throw new Error(ordersResponse.error.message);
      
      console.log('Orders synced:', ordersResponse.data);

      // Step 2: Get order IDs with shipments
      const { data: ordersWithShipments } = await supabase
        .from('meli_orders_cache')
        .select('order_id, shipment_id')
        .eq('seller_id', sellerId)
        .not('shipment_id', 'is', null);

      if (ordersWithShipments && ordersWithShipments.length > 0) {
        const orderIds = ordersWithShipments.map(o => o.order_id);
        const shipmentIds = ordersWithShipments.map(o => o.shipment_id).filter(Boolean);

        // Step 3: Sync shipments
        if (shipmentIds.length > 0) {
          const shipmentsResponse = await supabase.functions.invoke('ml-sync-shipments', {
            headers,
            body: {
              seller_id: sellerId,
              shipment_ids: shipmentIds,
            },
          });
          console.log('Shipments synced:', shipmentsResponse.data);
        }

        // Step 4: Sync invoices
        if (orderIds.length > 0) {
          const invoicesResponse = await supabase.functions.invoke('ml-sync-invoices', {
            headers,
            body: {
              seller_id: sellerId,
              order_ids: orderIds,
            },
          });
          console.log('Invoices synced:', invoicesResponse.data);
        }
      }

      return ordersResponse.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipping-orders'] });
      toast({
        title: 'Sincronização concluída',
        description: 'Pedidos, envios e notas fiscais atualizados.',
      });
    },
    onError: (error) => {
      console.error('Sync error:', error);
      toast({
        title: 'Erro na sincronização',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Generate labels mutation
  const generateLabelsMutation = useMutation({
    mutationFn: async ({ format, shipmentId }: { format: 'pdf' | 'zpl'; shipmentId?: string }) => {
      if (!sellerId) throw new Error('Seller ID not set');
      
      const headers = await getAuthHeaders();
      if (!headers) throw new Error('Not authenticated');

      let shipmentIds: string[];
      
      if (shipmentId) {
        // Single shipment (reprint)
        shipmentIds = [shipmentId];
      } else {
        // Bulk from selection
        if (selectedIds.size === 0) throw new Error('Nenhum envio selecionado');
        const selectedOrders = orders.filter(o => selectedIds.has(o.id));
        shipmentIds = selectedOrders
          .map(o => o.shipment_id)
          .filter(Boolean) as string[];
      }

      if (shipmentIds.length === 0) {
        throw new Error('Nenhum envio válido selecionado');
      }

      const response = await supabase.functions.invoke('ml-generate-labels', {
        headers,
        body: {
          seller_id: sellerId,
          shipment_ids: shipmentIds,
          format,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data.success) throw new Error(response.data.message || 'Erro ao gerar etiquetas');

      return response.data;
    },
    onSuccess: (data, variables) => {
      if (!variables.shipmentId) {
        // Only clear selection for bulk operations
        setSelectedIds(new Set());
      }
      
      if (variables.format === 'pdf' && data.pdf_base64) {
        // Download PDF from base64
        const binary = atob(data.pdf_base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiquetas_${new Date().getTime()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: 'PDF gerado com sucesso',
          description: `${data.total_labels} etiqueta(s) gerada(s)`,
        });
      } else if (variables.format === 'zpl' && data.zpl_content) {
        // Download ZPL as file
        const blob = new Blob([data.zpl_content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiquetas_${new Date().getTime()}.zpl`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: 'ZPL gerado com sucesso',
          description: `${data.total_labels} etiqueta(s) gerada(s)`,
        });
      }
    },
    onError: (error) => {
      console.error('Generate labels error:', error);
      toast({
        title: 'Erro ao gerar etiquetas',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Selection helpers
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const selectableOrders = orders.filter(o => o.selectable);
    setSelectedIds(new Set(selectableOrders.map(o => o.id)));
  }, [orders]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Sync function
  const sync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncOrdersMutation.mutateAsync();
    } finally {
      setIsSyncing(false);
    }
  }, [syncOrdersMutation]);

  // Get counts by status
  const statusCounts = {
    all: orders.length,
    pronta: orders.filter(o => o.final_status === 'pronta').length,
    aguardando_nf: orders.filter(o => o.final_status === 'aguardando_nf').length,
    sem_etiqueta: orders.filter(o => o.final_status === 'sem_etiqueta').length,
    erro: orders.filter(o => o.final_status === 'erro').length,
  };

  return {
    orders,
    isLoading,
    refetch,
    statusFilter,
    setStatusFilter,
    periodFilter,
    setPeriodFilter,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isSyncing,
    sync,
    lastSyncAt,
    statusCounts,
    generateLabels: generateLabelsMutation.mutate,
    isGenerating: generateLabelsMutation.isPending,
  };
}
