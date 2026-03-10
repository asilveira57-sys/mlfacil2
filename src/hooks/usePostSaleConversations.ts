import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invokeEdgeFunction, getUserFriendlyError } from "@/lib/edgeFunctionClient";
import type {
  PostSaleConversation,
  PostSaleConversationMessage,
  ConversationFilters,
  SyncMessagesResult,
  SendMessageResult,
  MessageAttachment,
} from "@/types/post-sale-conversation";

// Fetch all conversations for a seller
export function usePostSaleConversations(sellerId: string | null, filters?: ConversationFilters) {
  return useQuery({
    queryKey: ["post-sale-conversations", sellerId, filters],
    queryFn: async (): Promise<PostSaleConversation[]> => {
      if (!sellerId) return [];

      let query = supabase
        .from("post_sale_conversations")
        .select("*")
        .eq("seller_id", sellerId)
        .order("last_message_date", { ascending: false, nullsFirst: false });

      if (filters?.unreadOnly) {
        query = query.gt("unread_count", 0);
      }

      if (filters?.status) {
        query = query.eq("conversation_status", filters.status);
      }

      if (filters?.search) {
        query = query.or(
          `buyer_name.ilike.%${filters.search}%,order_id.ilike.%${filters.search}%,item_title.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as PostSaleConversation[];
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Fetch a single conversation with its messages
export function usePostSaleConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ["post-sale-conversation", conversationId],
    queryFn: async (): Promise<{
      conversation: PostSaleConversation;
      messages: PostSaleConversationMessage[];
    } | null> => {
      if (!conversationId) return null;

      // Fetch conversation
      const { data: conversation, error: convError } = await supabase
        .from("post_sale_conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      if (convError) throw convError;

      // Fetch messages
      const { data: messages, error: msgError } = await supabase
        .from("post_sale_conversation_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("message_date", { ascending: true });

      if (msgError) throw msgError;

      // Map messages to typed format
      const typedMessages: PostSaleConversationMessage[] = (messages || []).map((msg) => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        ml_message_id: msg.ml_message_id,
        from_user_id: msg.from_user_id,
        from_type: msg.from_type as 'buyer' | 'seller',
        message_text: msg.message_text,
        message_status: msg.message_status || 'available',
        moderation_status: msg.moderation_status || 'clean',
        moderation_reason: msg.moderation_reason,
        has_attachments: msg.has_attachments || false,
        attachments: Array.isArray(msg.attachments) ? (msg.attachments as MessageAttachment[]) : [],
        message_date: msg.message_date,
        read_at: msg.read_at,
        created_at: msg.created_at,
      }));

      return {
        conversation: conversation as PostSaleConversation,
        messages: typedMessages,
      };
    },
    enabled: !!conversationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Sync messages from Mercado Livre - using standardized edge function client
export function useSyncPostSaleMessages() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      sellerId,
      accountId,
      daysBack = 60,
    }: {
      sellerId: string;
      accountId?: string; // UUID of ml_accounts - preferred for credential lookup
      daysBack?: number;
    }): Promise<SyncMessagesResult> => {
      const result = await invokeEdgeFunction<SyncMessagesResult>("ml-sync-messages", {
        body: { 
          seller_id: sellerId, 
          account_id: accountId, // Pass account_id for proper credential lookup
          days_back: daysBack 
        },
      });

      if (!result.success) {
        // Return structured error for UI handling
        return {
          success: false,
          error: getUserFriendlyError(result.errorCode, result.error || "Erro ao sincronizar"),
        };
      }

      return result.data || { success: true, synced: 0 };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-conversations", variables.sellerId] });

      if (data.success) {
        toast({
          title: "Sincronização concluída",
          description: `${data.synced || 0} conversas sincronizadas, ${data.unread || 0} não lidas (seller: ${variables.sellerId})`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erro ao sincronizar",
          description: data.error || "Não foi possível sincronizar as mensagens",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao sincronizar",
        description: error.message,
      });
    },
  });
}

// Send a message
export function useSendPostSaleMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      conversationId,
      sellerId,
      accountId,
      text,
    }: {
      conversationId: string;
      sellerId: string;
      accountId?: string; // UUID of ml_accounts - preferred for credential lookup
      text: string;
    }): Promise<SendMessageResult> => {
      const { data, error } = await supabase.functions.invoke("ml-send-message", {
        body: {
          conversation_id: conversationId,
          seller_id: sellerId,
          account_id: accountId, // Pass account_id for proper credential lookup
          text,
        },
      });

      if (error) throw error;
      return data as SendMessageResult;
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["post-sale-conversation", variables.conversationId] });
        queryClient.invalidateQueries({ queryKey: ["post-sale-conversations"] });
        
        toast({
          title: "Mensagem enviada",
          description: "Sua resposta foi enviada com sucesso",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erro ao enviar",
          description: data.error || "Não foi possível enviar a mensagem",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao enviar",
        description: error.message,
      });
    },
  });
}

// Mark conversation as read
export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string): Promise<void> => {
      // Mark all messages as read
      await supabase
        .from("post_sale_conversation_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .is("read_at", null);

      // Reset unread count
      await supabase
        .from("post_sale_conversations")
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["post-sale-conversations"] });
    },
  });
}

// Get unread count for badge
export function useUnreadConversationsCount(sellerId: string | null) {
  return useQuery({
    queryKey: ["post-sale-unread-count", sellerId],
    queryFn: async (): Promise<number> => {
      if (!sellerId) return 0;

      const { count, error } = await supabase
        .from("post_sale_conversations")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .gt("unread_count", 0);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
