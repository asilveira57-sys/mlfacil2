import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Check,
  X,
  Pencil,
  Clock,
  Package,
  User,
  FileText,
  Send,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { triggerEventLabels, messageTypeLabels, type PostSaleMessage } from "@/types/post-sale";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DraftCardProps {
  message: PostSaleMessage;
  onApprove: (message: PostSaleMessage, editedText?: string) => void;
  onReject: (id: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
}

export function DraftCard({ message, onApprove, onReject, isApproving, isRejecting }: DraftCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(message.content_sent);

  const handleApprove = () => {
    const textChanged = editedText !== message.content_sent;
    onApprove(message, textChanged ? editedText : undefined);
  };

  const timeAgo = formatDistanceToNow(new Date(message.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  return (
    <Card className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/30">
              <Clock className="h-3 w-3 mr-1" />
              Pendente
            </Badge>
            <Badge variant="outline" className="text-xs">
              {triggerEventLabels[message.trigger_event]}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {messageTypeLabels[message.message_type]}
            </Badge>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {message.buyer_name && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {message.buyer_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              #{message.order_id}
            </span>
          </div>

          {message.listing_title && (
            <p className="text-xs text-muted-foreground truncate">
              <FileText className="h-3 w-3 inline mr-1" />
              {message.listing_title}
            </p>
          )}
        </div>

        <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo}</span>
      </div>

      {/* Message content */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={4}
            className="text-sm"
            placeholder="Edite a mensagem..."
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEditing(false);
                setEditedText(message.content_sent);
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={() => setIsEditing(false)}>
              Salvar edição
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap cursor-pointer hover:bg-muted/70 transition-colors"
          onClick={() => setIsEditing(true)}
          title="Clique para editar"
        >
          {editedText}
        </div>
      )}

      {/* Block warning */}
      {message.block_reason && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Atenção: {message.block_reason}</p>
            {message.suggested_fix && (
              <p className="mt-1 text-muted-foreground">{message.suggested_fix}</p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(true)}
          disabled={isApproving || isRejecting}
          className="text-muted-foreground"
        >
          <Pencil className="h-4 w-4 mr-1" />
          Editar
        </Button>

        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isApproving || isRejecting}
                className="text-destructive hover:text-destructive"
              >
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-1" />
                )}
                Descartar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Descartar rascunho?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta mensagem não será enviada ao comprador. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => onReject(message.id)}>
                  Descartar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            size="sm"
            onClick={handleApprove}
            disabled={isApproving || isRejecting || isEditing}
          >
            {isApproving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Aprovar e Enviar
          </Button>
        </div>
      </div>
    </Card>
  );
}
