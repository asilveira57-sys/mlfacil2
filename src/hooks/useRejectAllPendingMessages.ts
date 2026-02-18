import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { autoResolveNotifications } from "@/lib/notifications/autoResolve";

/** Reject all pending messages at once */
export function useRejectAllPendingMessages() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { sellerId } = useActiveAccount();

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
      queryClient.invalidateQueries({ queryKey: ["app-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
      queryClient.invalidateQueries({ queryKey: ["priority-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-counts"] });
      // All drafts rejected — resolve post_sale_blocked notifications
      if (sellerId) {
        autoResolveNotifications("post_sale_blocked", sellerId);
      }
      toast({ title: "Rascunhos descartados", description: "Todas as mensagens pendentes foram removidas da fila." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    },
  });
}
