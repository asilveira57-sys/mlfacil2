import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useToast } from "@/hooks/use-toast";
import { invokeEdgeFunction } from "@/lib/edgeFunctionClient";
import { autoResolveNotifications } from "@/lib/notifications/autoResolve";
import type { PostSaleMessage } from "@/types/post-sale";

/** Fetch pending drafts for the active seller */
export function usePostSalePendingMessages() {
  const { sellerId } = useActiveAccount();

  return useQuery({
    queryKey: ["post-sale-pending", sellerId],
    queryFn: async (): Promise<PostSaleMessage[]> => {
      if (!sellerId) return [];

      const { data, error } = await supabase
        .from("post_sale_messages")
        .select("*")
        .eq("seller_id", sellerId)
        .eq("is_visible", true)
        .in("status", ["pendente", "rascunho"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PostSaleMessage[];
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/** Count of pending drafts for badge */
export function usePostSalePendingCount() {
  const { sellerId } = useActiveAccount();

  return useQuery({
    queryKey: ["post-sale-pending-count", sellerId],
    queryFn: async (): Promise<number> => {
      if (!sellerId) return 0;

      const { count, error } = await supabase
        .from("post_sale_messages")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .eq("is_visible", true)
        .in("status", ["pendente", "rascunho"]);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/** Approve a pending message — sends via Action Guide API */
export function useApprovePendingMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { activeAccount } = useActiveAccount();

  return useMutation({
    mutationFn: async ({
      message,
      editedText,
    }: {
      message: PostSaleMessage;
      editedText?: string;
    }) => {
      const textToSend = editedText || message.content_sent;
      const accountId = activeAccount?.id;

      // Use pack_id directly — no need for pre-existing conversation
      const packId = message.pack_id || message.order_id;

      // Send via ml-send-message with Action Guide using pack_id directly
      const result = await invokeEdgeFunction<{
        success: boolean;
        ml_message_id?: string;
        error?: string;
      }>("ml-send-message", {
        body: {
          pack_id: packId,
          order_id: message.order_id,
          buyer_id: message.buyer_id,
          seller_id: message.seller_id,
          account_id: accountId,
          text: textToSend,
          use_action_guide: true,
          action_guide_reason: "DELIVERY_PROMISE",
        },
      });

      if (!result.success) {
        throw new Error(result.error || "Erro ao enviar mensagem");
      }

      // Update the draft status to 'enviado'
      const { error: updateError } = await supabase
        .from("post_sale_messages")
        .update({
          status: "enviado",
          content_sent: textToSend,
          ml_message_id: result.data?.ml_message_id || null,
          sent_at: new Date().toISOString(),
        } as never)
        .eq("id", message.id);

      if (updateError) throw updateError;

      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-pending"] });
      queryClient.invalidateQueries({ queryKey: ["post-sale-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["post-sale-messages"] });
      queryClient.invalidateQueries({ queryKey: ["app-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
      queryClient.invalidateQueries({ queryKey: ["priority-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-counts"] });
      // Auto-resolve post_sale_blocked if no more pending
      if (variables.message.seller_id) {
        autoResolveNotifications("post_sale_blocked", variables.message.seller_id);
      }
      toast({ title: "Mensagem enviada", description: "A mensagem foi aprovada e enviada com sucesso." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro ao enviar", description: error.message });
    },
  });
}

/** Reject a pending message */
export function useRejectPendingMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from("post_sale_messages")
        .update({ is_visible: false } as never)
        .eq("id", messageId);

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
      toast({ title: "Rascunho descartado", description: "A mensagem foi removida da fila." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    },
  });
}
