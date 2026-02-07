import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useToast } from "@/hooks/use-toast";
import { invokeEdgeFunction } from "@/lib/edgeFunctionClient";
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
    staleTime: 15_000,
    refetchInterval: 30_000,
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
    staleTime: 15_000,
    refetchInterval: 30_000,
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

      // We need a conversation to send via — look up by order_id
      const { data: conversation } = await supabase
        .from("post_sale_conversations")
        .select("id")
        .eq("seller_id", message.seller_id)
        .eq("order_id", message.order_id)
        .maybeSingle();

      if (!conversation) {
        throw new Error("Conversa não encontrada para este pedido. Sincronize as mensagens primeiro.");
      }

      // Send via ml-send-message with Action Guide
      const result = await invokeEdgeFunction<{
        success: boolean;
        ml_message_id?: string;
        error?: string;
      }>("ml-send-message", {
        body: {
          conversation_id: conversation.id,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-pending"] });
      queryClient.invalidateQueries({ queryKey: ["post-sale-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["post-sale-messages"] });
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
      toast({ title: "Rascunho descartado", description: "A mensagem foi removida da fila." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    },
  });
}
