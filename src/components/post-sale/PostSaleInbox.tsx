import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, RefreshCw, MessageCircle, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PostSaleConversation, ConversationFilters } from "@/types/post-sale-conversation";

interface PostSaleInboxProps {
  conversations: PostSaleConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  filters: ConversationFilters;
  onFiltersChange: (filters: ConversationFilters) => void;
}

export function PostSaleInbox({
  conversations,
  selectedId,
  onSelect,
  onRefresh,
  isRefreshing,
  filters,
  onFiltersChange,
}: PostSaleInboxProps) {
  const [searchValue, setSearchValue] = useState(filters.search || "");

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    // Debounce the actual filter update
    const timeout = setTimeout(() => {
      onFiltersChange({ ...filters, search: value || undefined });
    }, 300);
    return () => clearTimeout(timeout);
  };

  const totalUnread = conversations.reduce((acc, c) => acc + c.unread_count, 0);

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Conversas</h2>
            {totalUnread > 0 && (
              <Badge variant="destructive" className="ml-1">
                {totalUnread}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-8 w-8"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por comprador ou pedido..."
            className="pl-9 h-9"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Button
            variant={filters.unreadOnly ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => onFiltersChange({ ...filters, unreadOnly: !filters.unreadOnly })}
          >
            Não lidas
            {totalUnread > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                {totalUnread}
              </Badge>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                <Filter className="h-3 w-3" />
                Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onFiltersChange({ ...filters, status: undefined })}>
                Todos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onFiltersChange({ ...filters, status: "active" })}>
                Ativas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onFiltersChange({ ...filters, status: "blocked" })}>
                Bloqueadas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {filters.unreadOnly
                ? "Nenhuma conversa não lida"
                : "Nenhuma conversa encontrada"}
            </p>
            <Button variant="link" size="sm" onClick={onRefresh} className="mt-2">
              Sincronizar mensagens
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedId === conversation.id}
                onClick={() => onSelect(conversation.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: PostSaleConversation;
  isSelected: boolean;
  onClick: () => void;
}

function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  const hasUnread = conversation.unread_count > 0;
  const timeAgo = conversation.last_message_date
    ? formatDistanceToNow(new Date(conversation.last_message_date), {
        addSuffix: true,
        locale: ptBR,
      })
    : null;

  const initials = (conversation.buyer_name || "C")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-3 text-left hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent",
        hasUnread && "bg-primary/5"
      )}
    >
      <div className="flex gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          {conversation.item_thumbnail && (
            <AvatarImage src={conversation.item_thumbnail} alt="" />
          )}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-sm truncate",
                hasUnread ? "font-semibold" : "font-medium"
              )}
            >
              {conversation.buyer_name || "Comprador"}
            </span>
            {timeAgo && (
              <span className="text-xs text-muted-foreground shrink-0">
                {timeAgo}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {conversation.item_title || `Pedido ${conversation.order_id}`}
          </p>

          {conversation.last_message_text && (
            <p
              className={cn(
                "text-xs truncate mt-1",
                hasUnread ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {conversation.last_message_from === "seller" && (
                <span className="text-muted-foreground">Você: </span>
              )}
              {conversation.last_message_text}
            </p>
          )}
        </div>

        {hasUnread && (
          <Badge
            variant="destructive"
            className="h-5 w-5 shrink-0 rounded-full p-0 flex items-center justify-center text-xs"
          >
            {conversation.unread_count}
          </Badge>
        )}
      </div>

      {conversation.conversation_status === "blocked" && (
        <Badge variant="secondary" className="mt-2 text-xs">
          Bloqueada
        </Badge>
      )}
    </button>
  );
}
