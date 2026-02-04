import { useState, useEffect } from "react";
import { Send, AlertTriangle, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PostSaleConversation } from "@/types/post-sale-conversation";

interface PostSaleReplyEditorProps {
  conversation: PostSaleConversation;
  onSend: (text: string) => Promise<void>;
  isSending: boolean;
}

const MAX_CHARS = 350;

export function PostSaleReplyEditor({
  conversation,
  onSend,
  isSending,
}: PostSaleReplyEditorProps) {
  const [text, setText] = useState("");
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isBlocked = conversation.conversation_status === "blocked";
  const canSend = text.trim().length > 0 && !isOverLimit && !isSending && !isBlocked;

  // Simple client-side validation for common blocked patterns
  useEffect(() => {
    const warnings: string[] = [];

    // Check for phone patterns
    if (/\d{2}[\s.-]?\d{4,5}[\s.-]?\d{4}/.test(text)) {
      warnings.push("Possível número de telefone detectado");
    }

    // Check for email patterns
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) {
      warnings.push("E-mail detectado");
    }

    // Check for WhatsApp mentions
    if (/whats|wpp|zap/i.test(text)) {
      warnings.push("Menção a WhatsApp detectada");
    }

    // Check for external links
    if (/https?:\/\/|www\.|\.com|\.br/i.test(text)) {
      warnings.push("Link externo detectado");
    }

    setValidationWarnings(warnings);
  }, [text]);

  const handleSend = async () => {
    if (!canSend) return;
    
    await onSend(text);
    setText("");
    setValidationWarnings([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSend) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isBlocked) {
    return (
      <div className="p-4 border-t border-border bg-muted/50">
        <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
          <AlertTriangle className="h-5 w-5" />
          <span>Esta conversa está bloqueada e não permite novas mensagens</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-background">
      {/* Validation Warnings */}
      {validationWarnings.length > 0 && (
        <div className="px-4 pt-3 space-y-1">
          {validationWarnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{warning} - pode ser bloqueado pelo Mercado Livre</span>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="p-4">
        <div className="relative">
          <Textarea
            placeholder="Digite sua resposta..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "min-h-[80px] pr-24 resize-none",
              isOverLimit && "border-destructive focus-visible:ring-destructive"
            )}
            disabled={isSending}
          />

          {/* Character counter */}
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            <Badge
              variant={isOverLimit ? "destructive" : "secondary"}
              className={cn(
                "text-xs font-mono",
                charCount > MAX_CHARS * 0.9 && !isOverLimit && "bg-amber-100 text-amber-800"
              )}
            >
              {charCount}/{MAX_CHARS}
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            Pressione Ctrl+Enter para enviar
          </span>

          <Button
            onClick={handleSend}
            disabled={!canSend}
            size="sm"
            className="gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
