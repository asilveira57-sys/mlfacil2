import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { User, Store, AlertCircle, Paperclip, Image } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type {
  PostSaleConversation as ConversationType,
  PostSaleConversationMessage,
} from "@/types/post-sale-conversation";

interface PostSaleConversationProps {
  conversation: ConversationType;
  messages: PostSaleConversationMessage[];
  isLoading?: boolean;
}

export function PostSaleConversation({
  conversation,
  messages,
  isLoading,
}: PostSaleConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const buyerInitials = (conversation.buyer_name || "C")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {conversation.item_thumbnail && (
              <AvatarImage src={conversation.item_thumbnail} alt="" />
            )}
            <AvatarFallback>{buyerInitials}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">
              {conversation.buyer_name || "Comprador"}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {conversation.item_title || `Pedido ${conversation.order_id}`}
            </p>
          </div>

          {conversation.conversation_status === "blocked" && (
            <Badge variant="destructive" className="shrink-0">
              <AlertCircle className="h-3 w-3 mr-1" />
              Bloqueada
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-pulse text-muted-foreground">
              Carregando mensagens...
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Nenhuma mensagem nesta conversa
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                buyerId={conversation.buyer_id}
                buyerName={conversation.buyer_name}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface MessageBubbleProps {
  message: PostSaleConversationMessage;
  buyerId: string;
  buyerName?: string | null;
}

function MessageBubble({ message, buyerId, buyerName }: MessageBubbleProps) {
  const isBuyer = message.from_type === "buyer" || message.from_user_id === buyerId;
  const isModerated = message.moderation_status !== "clean";
  
  const formattedDate = format(new Date(message.message_date), "dd/MM HH:mm", {
    locale: ptBR,
  });

  return (
    <div
      className={cn(
        "flex gap-2",
        isBuyer ? "justify-start" : "justify-end"
      )}
    >
      {isBuyer && (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[75%] space-y-1",
          isBuyer ? "items-start" : "items-end"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2",
            isBuyer
              ? "bg-muted rounded-tl-sm"
              : "bg-primary text-primary-foreground rounded-tr-sm",
            isModerated && "opacity-60"
          )}
        >
          {isModerated ? (
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>Mensagem moderada</span>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.message_text || "(Mensagem sem texto)"}
            </p>
          )}

          {message.has_attachments && message.attachments?.length > 0 && (
            <div className="mt-2 pt-2 border-t border-current/20">
              <div className="flex items-center gap-1 text-xs opacity-80">
                <Paperclip className="h-3 w-3" />
                <span>{message.attachments.length} anexo(s)</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {message.attachments.slice(0, 3).map((att, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 text-xs bg-background/20 rounded px-2 py-1"
                  >
                    <Image className="h-3 w-3" />
                    <span className="truncate max-w-[100px]">
                      {att.original_filename || att.filename || "Arquivo"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex items-center gap-2 text-xs text-muted-foreground px-1",
            !isBuyer && "justify-end"
          )}
        >
          <span>{formattedDate}</span>
          {isModerated && message.moderation_reason && (
            <span className="text-destructive">
              • {message.moderation_reason}
            </span>
          )}
        </div>
      </div>

      {!isBuyer && (
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Store className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}
