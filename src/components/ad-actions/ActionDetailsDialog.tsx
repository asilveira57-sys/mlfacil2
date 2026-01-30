import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Link,
  Loader2,
  AlertCircle,
  Copy,
  Save,
  FilePlus,
  RotateCcw,
  CheckCircle,
  XCircle,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { extractMeliId, isCatalogMeliId } from '@/lib/meli/extractMeliId';
import { useUpdateAction, useDuplicateAction, useReopenAction } from '@/hooks/useAdActionsMutations';
import type { AdLifecycleAction, ActionStatus } from '@/types/ad-timeline';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ActionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: AdLifecycleAction | null;
  onDraftCreated?: () => void;
}

interface CloneChecklist {
  title?: boolean;
  description?: boolean;
  pictures?: boolean;
  attributes?: boolean;
  price?: boolean;
  source?: string;
  source_url?: string;
}

const statusConfig: Record<ActionStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  QUEUED: { label: 'Na fila', className: 'bg-blue-500/10 text-blue-600' },
  RUNNING: { label: 'Executando', className: 'bg-blue-500/10 text-blue-600' },
  SUCCESS: { label: 'Sucesso', className: 'bg-green-500/10 text-green-600' },
  FAILED: { label: 'Falhou', className: 'bg-red-500/10 text-red-600' },
  CANCELLED: { label: 'Cancelado', className: 'bg-muted text-muted-foreground' },
};

const actionTypeLabels: Record<string, string> = {
  END: 'Encerrar',
  RELIST: 'Republicar',
  CLONE: 'Clonar',
};

export function ActionDetailsDialog({
  open,
  onOpenChange,
  action,
  onDraftCreated,
}: ActionDetailsDialogProps) {
  const [link, setLink] = useState('');
  const [reason, setReason] = useState('');
  const [checklist, setChecklist] = useState<CloneChecklist>({
    title: true,
    description: true,
    pictures: true,
    attributes: true,
    price: true,
  });
  const [linkError, setLinkError] = useState<string | null>(null);

  const updateAction = useUpdateAction();
  const duplicateAction = useDuplicateAction();
  const reopenAction = useReopenAction();

  const isClone = action?.action_type === 'CLONE';
  const isDraft = action?.action_status === 'DRAFT';
  const isFailed = action?.action_status === 'FAILED';
  const isCancelled = action?.action_status === 'CANCELLED';
  const isSuccess = action?.action_status === 'SUCCESS';

  // Load action data into form when dialog opens
  useEffect(() => {
    if (action && open) {
      const actionChecklist = (action.checklist as CloneChecklist) || {};
      
      // Use source_url if available, otherwise use item_id
      setLink(actionChecklist.source_url || action.item_id || '');
      setReason(action.reason || '');
      setChecklist({
        title: actionChecklist.title ?? true,
        description: actionChecklist.description ?? true,
        pictures: actionChecklist.pictures ?? true,
        attributes: actionChecklist.attributes ?? true,
        price: actionChecklist.price ?? true,
        source: actionChecklist.source,
        source_url: actionChecklist.source_url,
      });
      setLinkError(null);
    }
  }, [action, open]);

  const detectedId = extractMeliId(link);

  const handleCopyDiagnostic = () => {
    if (!action) return;

    const diagnostic = {
      action_id: action.id,
      item_id: action.item_id,
      action_type: action.action_type,
      action_status: action.action_status,
      reason: action.reason,
      checklist: action.checklist,
      result: action.result,
      source_snapshot: action.source_snapshot,
      updated_at: action.updated_at,
      created_at: action.created_at,
    };

    navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
    toast.success('Diagnóstico copiado para a área de transferência');
  };

  const handleSave = async () => {
    if (!action || !isDraft) return;

    const itemId = detectedId || link.trim();
    if (!itemId) {
      setLinkError('Informe o link ou ID do anúncio');
      return;
    }

    const newChecklist: CloneChecklist = isClone
      ? { ...checklist, source_url: link.trim() }
      : { source_url: link.trim() };

    await updateAction.mutateAsync({
      actionId: action.id,
      itemId,
      reason: reason.trim() || undefined,
      checklist: newChecklist,
    });

    onOpenChange(false);
  };

  const handleDuplicate = async () => {
    if (!action) return;

    const itemId = detectedId || link.trim();
    if (!itemId) {
      setLinkError('Informe o link ou ID do anúncio');
      return;
    }

    const newChecklist: CloneChecklist = isClone
      ? { ...checklist, source_url: link.trim() }
      : { source_url: link.trim() };

    await duplicateAction.mutateAsync({
      originalAction: action,
      itemId,
      reason: reason.trim() || undefined,
      checklist: newChecklist,
    });

    onOpenChange(false);
    onDraftCreated?.();
  };

  const handleReopen = async () => {
    if (!action || (!isFailed && !isCancelled)) return;

    await reopenAction.mutateAsync(action.id);
    onOpenChange(false);
    onDraftCreated?.();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
      setLinkError(null);
    } catch {
      toast.error('Não foi possível acessar a área de transferência');
    }
  };

  const result = action?.result as Record<string, any> | null;
  const hasError = result?.error || result?.message || result?.api_error;

  const isLoading = updateAction.isPending || duplicateAction.isPending || reopenAction.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Detalhes da Ação
          </DialogTitle>
          <DialogDescription>
            {isDraft
              ? 'Edite os dados antes de executar'
              : isFailed || isCancelled
              ? 'Veja o erro e reenvie como novo rascunho'
              : 'Veja os detalhes da ação executada'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {/* Status Badge */}
            {action && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={statusConfig[action.action_status as ActionStatus]?.className}>
                  {statusConfig[action.action_status as ActionStatus]?.label}
                </Badge>
                <Badge variant="outline">
                  {actionTypeLabels[action.action_type] || action.action_type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Atualizado em {format(new Date(action.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                </span>
              </div>
            )}

            {/* Error Display (for FAILED) */}
            {isFailed && hasError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-destructive">
                      {result?.error || result?.message || 'Erro desconhecido'}
                    </p>
                    {result?.api_error && (
                      <p className="text-xs text-muted-foreground mt-1">
                        API: {typeof result.api_error === 'string' ? result.api_error : JSON.stringify(result.api_error)}
                      </p>
                    )}
                    {result?.code && (
                      <p className="text-xs text-muted-foreground">
                        Código: {result.code}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={handleCopyDiagnostic}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copiar diagnóstico
                </Button>
              </div>
            )}

            {/* Success Display */}
            {isSuccess && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">
                      {result?.message || 'Ação executada com sucesso'}
                    </p>
                    {result?.new_item_id && (
                      <a
                        href={`https://www.mercadolivre.com.br/p/${result.new_item_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Ver novo anúncio: {result.new_item_id}
                      </a>
                    )}
                    {result?.catalog_info && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Clonado do catálogo {result.catalog_info.original_catalog_id} 
                        {result.catalog_info.product_name && ` (${result.catalog_info.product_name})`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Catalog Info Display (for failed catalog clones) */}
            {isFailed && result?.is_catalog && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Produto de catálogo: {result.catalog_id}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tente colar o link de um anúncio específico (MLB) em vez da página de catálogo.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Catalog Warning for MLBU IDs */}
            {link && detectedId && isCatalogMeliId(detectedId) && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Este é um produto de catálogo. O clone será feito com base no 
                  vendedor que está vencendo a buy box neste momento.
                </p>
              </div>
            )}

            {/* Link Input */}
            <div className="space-y-2">
              <Label htmlFor="action-link">Link ou ID do anúncio</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="action-link"
                    placeholder="https://www.mercadolivre.com.br/... ou MLB..."
                    value={link}
                    onChange={(e) => {
                      setLink(e.target.value);
                      setLinkError(null);
                    }}
                    className="pl-9"
                    disabled={isSuccess}
                  />
                </div>
                <Button variant="outline" onClick={handlePaste} type="button" disabled={isSuccess}>
                  Colar
                </Button>
              </div>
              {linkError && (
                <div className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {linkError}
                </div>
              )}
              {link && detectedId && (
                <p className="text-xs text-muted-foreground">
                  ID detectado: <span className="font-mono">{detectedId}</span>
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="action-reason">Motivo (opcional)</Label>
              <Input
                id="action-reason"
                placeholder="Ex: Anúncio sem vendas há 60 dias"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSuccess}
              />
            </div>

            {/* Clone Checklist (only for CLONE type) */}
            {isClone && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-medium">O que manter do anúncio original?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="keep_title"
                        checked={checklist.title}
                        onCheckedChange={(checked) =>
                          setChecklist((prev) => ({ ...prev, title: !!checked }))
                        }
                        disabled={isSuccess}
                      />
                      <Label htmlFor="keep_title" className="text-sm font-normal">
                        Título
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="keep_description"
                        checked={checklist.description}
                        onCheckedChange={(checked) =>
                          setChecklist((prev) => ({ ...prev, description: !!checked }))
                        }
                        disabled={isSuccess}
                      />
                      <Label htmlFor="keep_description" className="text-sm font-normal">
                        Descrição
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="keep_pictures"
                        checked={checklist.pictures}
                        onCheckedChange={(checked) =>
                          setChecklist((prev) => ({ ...prev, pictures: !!checked }))
                        }
                        disabled={isSuccess}
                      />
                      <Label htmlFor="keep_pictures" className="text-sm font-normal">
                        Imagens
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="keep_attributes"
                        checked={checklist.attributes}
                        onCheckedChange={(checked) =>
                          setChecklist((prev) => ({ ...prev, attributes: !!checked }))
                        }
                        disabled={isSuccess}
                      />
                      <Label htmlFor="keep_attributes" className="text-sm font-normal">
                        Atributos
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="keep_price"
                        checked={checklist.price}
                        onCheckedChange={(checked) =>
                          setChecklist((prev) => ({ ...prev, price: !!checked }))
                        }
                        disabled={isSuccess}
                      />
                      <Label htmlFor="keep_price" className="text-sm font-normal">
                        Preço
                      </Label>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Copy Diagnostic - always available */}
          <Button variant="ghost" size="sm" onClick={handleCopyDiagnostic} className="sm:mr-auto">
            <Copy className="h-4 w-4 mr-1" />
            Copiar diagnóstico
          </Button>

          <div className="flex gap-2 flex-wrap justify-end">
            {/* Reopen as Draft (only for FAILED/CANCELLED) */}
            {(isFailed || isCancelled) && (
              <Button
                variant="outline"
                onClick={handleReopen}
                disabled={isLoading}
              >
                {reopenAction.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-1" />
                )}
                Reabrir
              </Button>
            )}

            {/* Save (only for DRAFT) */}
            {isDraft && (
              <Button onClick={handleSave} disabled={isLoading}>
                {updateAction.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Salvar
              </Button>
            )}

            {/* Duplicate as new draft (for FAILED/CANCELLED/DRAFT) */}
            {(isFailed || isCancelled || isDraft) && (
              <Button
                variant={isDraft ? 'outline' : 'default'}
                onClick={handleDuplicate}
                disabled={isLoading}
              >
                {duplicateAction.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FilePlus className="h-4 w-4 mr-1" />
                )}
                Novo rascunho
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
