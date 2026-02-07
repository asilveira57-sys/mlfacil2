import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Check, Trash2, AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  usePostSalePendingMessages,
  useApprovePendingMessage,
  useRejectPendingMessage,
} from "@/hooks/usePostSalePendingMessages";
import { useRejectAllPendingMessages } from "@/hooks/useRejectAllPendingMessages";
import type { PostSaleMessage } from "@/types/post-sale";
import { DraftCard } from "./DraftCard";

function MLRestrictionsWarning() {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="space-y-1 text-sm">
        <p className="font-medium text-amber-700">Restrições do Mercado Livre</p>
        <p className="text-muted-foreground">
          O Mercado Livre limita o envio de mensagens proativas. Após enviar via Action Guide, 
          é necessário aguardar a resposta do comprador antes de enviar novamente. 
          Algumas conversas podem ser bloqueadas automaticamente pela plataforma.
        </p>
      </div>
    </div>
  );
}

export function PostSalePendingDrafts() {
  const { data: messages, isLoading } = usePostSalePendingMessages();
  const approveMutation = useApprovePendingMessage();
  const rejectMutation = useRejectPendingMessage();
  const rejectAllMutation = useRejectAllPendingMessages();

  const handleApprove = (message: PostSaleMessage, editedText?: string) => {
    approveMutation.mutate({ message, editedText });
  };

  const handleReject = (id: string) => {
    rejectMutation.mutate(id);
  };

  const handleRejectAll = () => {
    if (messages && messages.length > 0) {
      rejectAllMutation.mutate(messages.map((m) => m.id));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Check className="h-12 w-12 text-primary mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Nenhuma mensagem pendente
        </h3>
        <p className="text-sm text-muted-foreground">
          Mensagens automáticas que requerem aprovação aparecerão aqui
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <MLRestrictionsWarning />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Mensagens Pendentes</h2>
          <p className="text-sm text-muted-foreground">
            {messages.length} {messages.length === 1 ? "mensagem aguardando" : "mensagens aguardando"} aprovação
          </p>
        </div>

        {messages.length > 1 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={rejectAllMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                {rejectAllMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" />
                )}
                Descartar Todos ({messages.length})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Descartar todos os rascunhos?</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <span>
                      {messages.length} {messages.length === 1 ? "mensagem será removida" : "mensagens serão removidas"} da fila. 
                      Nenhuma será enviada ao comprador. Esta ação não pode ser desfeita.
                    </span>
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRejectAll}>
                  Descartar Todos
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="space-y-3">
        {messages.map((msg) => (
          <DraftCard
            key={msg.id}
            message={msg}
            onApprove={handleApprove}
            onReject={handleReject}
            isApproving={approveMutation.isPending && approveMutation.variables?.message.id === msg.id}
            isRejecting={rejectMutation.isPending && rejectMutation.variables === msg.id}
          />
        ))}
      </div>
    </div>
  );
}
