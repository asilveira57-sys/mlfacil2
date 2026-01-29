import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play,
  XCircle,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileText,
  ListChecks,
  History,
  Link,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAdLifecycleActions, useExecuteAction, useCancelAction } from "@/hooks/useAdTimeline";
import type { AdLifecycleAction, ActionStatus } from "@/types/ad-timeline";
import { CloneByLinkDialog } from "@/components/ad-timeline/CloneByLinkDialog";

const statusConfig: Record<ActionStatus, { label: string; icon: React.ReactNode; className: string }> = {
  DRAFT: { label: 'Rascunho', icon: <FileText className="h-4 w-4" />, className: 'bg-muted text-muted-foreground' },
  QUEUED: { label: 'Na fila', icon: <ListChecks className="h-4 w-4" />, className: 'bg-blue-500/10 text-blue-600' },
  RUNNING: { label: 'Executando', icon: <Loader2 className="h-4 w-4 animate-spin" />, className: 'bg-blue-500/10 text-blue-600' },
  SUCCESS: { label: 'Sucesso', icon: <CheckCircle className="h-4 w-4" />, className: 'bg-green-500/10 text-green-600' },
  FAILED: { label: 'Falhou', icon: <XCircle className="h-4 w-4" />, className: 'bg-red-500/10 text-red-600' },
  CANCELLED: { label: 'Cancelado', icon: <XCircle className="h-4 w-4" />, className: 'bg-muted text-muted-foreground' },
};

const actionTypeLabels: Record<string, string> = {
  END: 'Encerrar',
  RELIST: 'Republicar',
  CLONE: 'Clonar',
};

export default function AdActionsCenter() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setWorkspaceId(data.user.id);
    });
  }, []);

  const [activeTab, setActiveTab] = useState("drafts");
  const [confirmAction, setConfirmAction] = useState<AdLifecycleAction | null>(null);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);

  const statusFilters: Record<string, string> = {
    drafts: 'DRAFT',
    queue: 'QUEUED,RUNNING',
    completed: 'SUCCESS,FAILED,CANCELLED',
  };

  const { data: actions, isLoading } = useAdLifecycleActions(workspaceId, statusFilters[activeTab]);
  const executeAction = useExecuteAction();
  const cancelAction = useCancelAction();

  const handleExecute = (action: AdLifecycleAction) => {
    setConfirmAction(action);
  };

  const handleConfirmExecute = async () => {
    if (!confirmAction) return;
    await executeAction.mutateAsync({ actionId: confirmAction.id, confirm: true });
    setConfirmAction(null);
  };

  const handleCancel = async (actionId: string) => {
    await cancelAction.mutateAsync(actionId);
  };

  const renderActionRow = (action: AdLifecycleAction) => {
    const status = statusConfig[action.action_status as ActionStatus] || statusConfig.DRAFT;
    
    return (
      <TableRow key={action.id}>
        <TableCell>
          <div className="font-medium text-sm">{action.item_id}</div>
          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
            {action.reason || "—"}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline">{actionTypeLabels[action.action_type] || action.action_type}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={status.className}>
            <span className="mr-1">{status.icon}</span>
            {status.label}
          </Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {format(new Date(action.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}
        </TableCell>
        <TableCell>
          {action.action_status === 'DRAFT' && (
            <div className="flex gap-1">
              <Button
                size="sm"
                onClick={() => handleExecute(action)}
                disabled={executeAction.isPending}
              >
                <Play className="h-3 w-3 mr-1" />
                Executar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCancel(action.id)}
                disabled={cancelAction.isPending}
              >
                <XCircle className="h-3 w-3" />
              </Button>
            </div>
          )}
          {action.action_status === 'QUEUED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCancel(action.id)}
              disabled={cancelAction.isPending}
            >
              Cancelar
            </Button>
          )}
          {action.action_status === 'SUCCESS' && action.result?.new_item_id && (
            <a
              href={`https://www.mercadolivre.com.br/p/${action.result.new_item_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              Ver novo anúncio
            </a>
          )}
          {action.action_status === 'FAILED' && (
            <span className="text-xs text-destructive truncate max-w-[150px] block">
              {action.result?.error || 'Erro desconhecido'}
            </span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <PageContainer
      title="Central de Ações"
      subtitle="Gerencie ações de encerramento, republicação e clonagem"
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList>
              <TabsTrigger value="drafts" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Rascunhos
              </TabsTrigger>
              <TabsTrigger value="queue" className="flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                Fila
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Concluídas
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button onClick={() => setCloneDialogOpen(true)} className="gap-2">
            <Link className="h-4 w-4" />
            Clonar por Link
          </Button>
        </div>

          <TabsContent value={activeTab} className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Anúncio</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Atualizado</TableHead>
                      <TableHead className="w-[150px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                        </TableRow>
                      ))
                    ) : actions?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Clock className="h-8 w-8" />
                            <p>Nenhuma ação encontrada</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      actions?.map(renderActionRow)
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Confirmar execução
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a executar a ação{" "}
              <strong>{actionTypeLabels[confirmAction?.action_type || ''] || confirmAction?.action_type}</strong>{" "}
              para o anúncio <strong>{confirmAction?.item_id}</strong>.
              <br /><br />
              Esta ação não pode ser desfeita automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExecute} disabled={executeAction.isPending}>
              {executeAction.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar e Executar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clone by Link Dialog */}
      <CloneByLinkDialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen} />
    </PageContainer>
  );
}
