import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** Reject all pending messages at once */
export function useRejectAllPendingMessages() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (messageIds.length === 0) return;

      const { error } = await supabase
        .from("post_sale_messages")
        .update({ is_visible: false } as never)
        .in("id", messageIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-pending"] });
      queryClient.invalidateQueries({ queryKey: ["post-sale-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["post-sale-messages"] });
      toast({ title: "Rascunhos descartados", description: "Todas as mensagens pendentes foram removidas da fila." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    },
  });
}
