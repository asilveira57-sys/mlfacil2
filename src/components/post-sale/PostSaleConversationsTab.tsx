import { useState, useEffect } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import type { ConversationFilters } from "@/types/post-sale-conversation";

export function PostSaleConversationsTab() {
  // Use ActiveAccountContext as single source of truth
  const { 
    activeAccount, 
    accounts, 
    loading: isLoadingAccount, 
    initialized,
    setActiveAccount 
  } = useActiveAccount();

  // Derive sellerId from context
  const sellerId = activeAccount?.sellerId || null;
  const accountId = activeAccount?.id || null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ConversationFilters>({});

  // Queries - now using sellerId from context
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

  // Reset selected conversation when account changes
  useEffect(() => {
    setSelectedId(null);
  }, [sellerId]);

  const handleRefresh = () => {
    if (!sellerId || !accountId) return;
    // Pass account_id for proper credential lookup
    syncMutation.mutate({ sellerId, accountId });
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedId || !sellerId || !accountId) return;

    const result = await sendMutation.mutateAsync({
      conversationId: selectedId,
      sellerId,
      accountId,
      text,
    });

    if (!result.success) {
      throw new Error(result.error);
    }
  };

  const handleAccountChange = async (mlUserId: string) => {
    // Find account by ml_user_id and switch using context
    const account = accounts.find((a) => a.sellerId === mlUserId);
    if (account) {
      await setActiveAccount(account.id);
    }
  };

  // Show loading while context initializes
  if (!initialized || isLoadingAccount) {
    return (
      <Card className="h-[600px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  // No account connected
  if (accounts.length === 0) {
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

  // Account selector component - shows which account is being used
  const AccountSelector = () => {
    // Filter to only show connected accounts for selection
    const connectedAccounts = accounts.filter(
      a => a.status === 'connected' || a.status === 'attention'
    );
    
    if (connectedAccounts.length <= 1) {
      // Show current account info even if only one
      if (activeAccount) {
        return (
          <div className="px-4 py-2 border-b bg-muted/30 text-sm text-muted-foreground">
            Conta: {activeAccount.nickname || activeAccount.email || activeAccount.sellerId}
          </div>
        );
      }
      return null;
    }
    
    return (
      <div className="px-4 py-2 border-b bg-muted/30">
        <Select value={sellerId || ""} onValueChange={handleAccountChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione uma conta" />
          </SelectTrigger>
          <SelectContent>
            {connectedAccounts.map((account) => (
              <SelectItem key={account.sellerId} value={account.sellerId}>
                {account.nickname || account.email || account.sellerId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  // Empty state with sync option
  if (!isLoadingConversations && conversations.length === 0 && !syncMutation.isPending) {
    return (
      <Card className="h-[600px] overflow-hidden">
        <div className="flex h-full flex-col">
          <AccountSelector />
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma conversa encontrada</h3>
            <p className="text-muted-foreground mb-4">
              Sincronize as mensagens do Mercado Livre para visualizar as conversas
              {sellerId && (
                <span className="block text-xs mt-1">
                  Conta: {activeAccount?.nickname || sellerId}
                </span>
              )}
            </p>
            <Button onClick={handleRefresh} disabled={!sellerId}>
              Sincronizar Mensagens
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] overflow-hidden">
      <div className="flex h-full">
        {/* Inbox - Left Panel */}
        <div className="w-[320px] shrink-0 flex flex-col">
          <AccountSelector />
          <div className="flex-1 overflow-hidden">
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
