import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeEdgeFunction } from '@/lib/edgeFunctionClient';
import { toast } from 'sonner';

interface SyncResult {
  totalFetched: number;
  processedRecords: number;
  failedRecords: number;
  jobId: string;
}

export function useSyncPayments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (financeAccountId: string) => {
      const result = await invokeEdgeFunction<SyncResult>('mp-sync-payments', {
        body: { finance_account_id: financeAccountId },
      });

      if (!result.success) {
        throw new Error(result.error || 'Erro ao sincronizar pagamentos');
      }

      return result.data!;
    },
    onSuccess: (data) => {
      toast.success(`${data.processedRecords} pagamentos sincronizados`);
      queryClient.invalidateQueries({ queryKey: ['mp-payments'] });
      queryClient.invalidateQueries({ queryKey: ['finance-job-runs'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useSyncMovements() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (financeAccountId: string) => {
      const result = await invokeEdgeFunction<SyncResult>('mp-sync-movements', {
        body: { finance_account_id: financeAccountId },
      });

      if (!result.success) {
        throw new Error(result.error || 'Erro ao sincronizar movimentos');
      }

      return result.data!;
    },
    onSuccess: (data) => {
      toast.success(`${data.processedRecords} movimentos sincronizados`);
      queryClient.invalidateQueries({ queryKey: ['mp-movements'] });
      queryClient.invalidateQueries({ queryKey: ['finance-job-runs'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
