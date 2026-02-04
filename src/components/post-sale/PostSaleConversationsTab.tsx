import { useState, useEffect } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PostSaleInbox } from "./PostSaleInbox";
import { PostSaleConversation } from "./PostSaleConversation";
import { PostSaleReplyEditor } from "./PostSaleReplyEditor";
import {
  usePostSaleConversations,
  usePostSaleConversation,
  useSyncPostSaleMessages,
  useSendPostSaleMessage,
  useMarkConversationRead,
} from "@/hooks/usePostSaleConversations";
import { useMlAccounts } from "@/hooks/useMlAccounts";
import type { ConversationFilters } from "@/types/post-sale-conversation";

export function PostSaleConversationsTab() {
  const { data: mlAccounts = [], isLoading: isLoadingAccount } = useMlAccounts();
  const mlAccount = mlAccounts[0] || null;
  const sellerId = mlAccount?.ml_user_id || null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ConversationFilters>({});

  // Queries
  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
    refetch: refetchConversations,
  } = usePostSaleConversations(sellerId, filters);

  const {
    data: conversationData,
    isLoading: isLoadingConversation,
  } = usePostSaleConversation(selectedId);

  // Mutations
  const syncMutation = useSyncPostSaleMessages();
  const sendMutation = useSendPostSaleMessage();
  const markReadMutation = useMarkConversationRead();

  // Mark as read when selecting a conversation
  useEffect(() => {
    if (selectedId && conversationData?.conversation?.unread_count > 0) {
      markReadMutation.mutate(selectedId);
    }
  }, [selectedId, conversationData?.conversation?.unread_count]);

  // Initial sync if no conversations
  useEffect(() => {
    if (sellerId && conversations.length === 0 && !isLoadingConversations && !syncMutation.isPending) {
      // Only auto-sync once on first load if there are no conversations
    }
  }, [sellerId, conversations.length, isLoadingConversations]);

  const handleRefresh = () => {
    if (!sellerId) return;
    syncMutation.mutate({ sellerId });
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedId || !sellerId) return;

    const result = await sendMutation.mutateAsync({
      conversationId: selectedId,
      sellerId,
      text,
    });

    if (!result.success) {
      throw new Error(result.error);
    }
  };

  // Loading state
  if (isLoadingAccount) {
    return (
      <Card className="h-[600px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  // No account connected
  if (!sellerId) {
    return (
      <Card className="h-[600px] flex flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Conta não conectada</h3>
        <p className="text-muted-foreground mb-4">
          Conecte sua conta do Mercado Livre para visualizar as mensagens pós-venda
        </p>
      </Card>
    );
  }

  // Empty state with sync option
  if (!isLoadingConversations && conversations.length === 0 && !syncMutation.isPending) {
    return (
      <Card className="h-[600px] flex flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Nenhuma conversa encontrada</h3>
        <p className="text-muted-foreground mb-4">
          Sincronize as mensagens do Mercado Livre para visualizar as conversas
        </p>
        <Button onClick={handleRefresh}>
          Sincronizar Mensagens
        </Button>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] overflow-hidden">
      <div className="flex h-full">
        {/* Inbox - Left Panel */}
        <div className="w-[320px] shrink-0">
          <PostSaleInbox
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRefresh={handleRefresh}
            isRefreshing={syncMutation.isPending}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Conversation - Right Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedId && conversationData?.conversation ? (
            <>
              <PostSaleConversation
                conversation={conversationData.conversation}
                messages={conversationData.messages || []}
                isLoading={isLoadingConversation}
              />
              <PostSaleReplyEditor
                conversation={conversationData.conversation}
                onSend={handleSendMessage}
                isSending={sendMutation.isPending}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-3 opacity-50" />
              <p>Selecione uma conversa para visualizar</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
