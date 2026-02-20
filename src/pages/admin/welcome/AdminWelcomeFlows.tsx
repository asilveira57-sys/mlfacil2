import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Pencil, Copy, Trash2, MoreVertical, Settings, BarChart3,
  ArrowUp, ArrowDown, RefreshCw, CheckCircle2, XCircle, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminOnboardingFlows, useUpsertOnboardingFlow, useForceOnboardingReapply,
  type OnboardingFlow,
} from '@/hooks/useWelcomeOnboarding';

const PLANOS_OPTIONS = ['teste', 'basico', 'pro', 'enterprise'];
const PERFIS_OPTIONS = ['owner', 'collaborator', 'admin'];

interface Props {
  onEditSteps: (flow: OnboardingFlow) => void;
  onViewAudit: (flow: OnboardingFlow) => void;
}

function FlowFormDialog({
  open,
  onClose,
  initial,
  nextOrder,
}: {
  open: boolean;
  onClose: () => void;
  initial: Partial<OnboardingFlow> | null;
  nextOrder: number;
}) {
  const upsert = useUpsertOnboardingFlow();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState({
    slug: initial?.slug ?? '',
    nome: initial?.nome ?? '',
    descricao: initial?.descricao ?? '',
    ativo: initial?.ativo ?? true,
    prioridade: initial?.prioridade ?? nextOrder,
    exigir_conclusao: initial?.exigir_conclusao ?? true,
    aplicacao_planos: initial?.aplicacao_planos ?? [],
    aplicacao_perfis: initial?.aplicacao_perfis ?? [],
    versao: initial?.versao ?? 1,
  });

  const toggleArr = (arr: string[], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const handleSave = async () => {
    if (!form.slug.trim() || !form.nome.trim()) {
      toast.error('Slug e Nome são obrigatórios');
      return;
    }
    await upsert.mutateAsync({
      ...(initial?.id ? { id: initial.id } : {}),
      slug: form.slug.trim(),
      nome: form.nome.trim(),
      descricao: form.descricao || null,
      ativo: form.ativo,
      prioridade: form.prioridade,
      exigir_conclusao: form.exigir_conclusao,
      aplicacao_planos: form.aplicacao_planos.length > 0 ? form.aplicacao_planos : null,
      aplicacao_perfis: form.aplicacao_perfis.length > 0 ? form.aplicacao_perfis : null,
      versao: form.versao,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Fluxo' : 'Novo Fluxo de Boas-Vindas'}</DialogTitle>
          <DialogDescription>Configure o fluxo de onboarding</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug <span className="text-destructive">*</span></Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                placeholder="onboarding_padrao_2026"
                disabled={isEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="versao">Versão</Label>
              <Input
                id="versao"
                type="number"
                min={1}
                value={form.versao}
                onChange={(e) => setForm((p) => ({ ...p, versao: parseInt(e.target.value) || 1 }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome <span className="text-destructive">*</span></Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
              placeholder="Boas-Vindas 2026"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={form.descricao}
              onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              rows={2}
              placeholder="Fluxo padrão exibido na primeira sessão"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Planos aplicáveis <span className="text-xs text-muted-foreground">(vazio = todos)</span></Label>
            <div className="flex flex-wrap gap-2">
              {PLANOS_OPTIONS.map((p) => (
                <Badge
                  key={p}
                  variant={form.aplicacao_planos.includes(p) ? 'default' : 'outline'}
                  className="cursor-pointer select-none"
                  onClick={() => setForm((prev) => ({ ...prev, aplicacao_planos: toggleArr(prev.aplicacao_planos, p) }))}
                >
                  {p}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Perfis aplicáveis <span className="text-xs text-muted-foreground">(vazio = todos)</span></Label>
            <div className="flex flex-wrap gap-2">
              {PERFIS_OPTIONS.map((p) => (
                <Badge
                  key={p}
                  variant={form.aplicacao_perfis.includes(p) ? 'default' : 'outline'}
                  className="cursor-pointer select-none"
                  onClick={() => setForm((prev) => ({ ...prev, aplicacao_perfis: toggleArr(prev.aplicacao_perfis, p) }))}
                >
                  {p}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Input
                id="prioridade"
                type="number"
                value={form.prioridade}
                onChange={(e) => setForm((p) => ({ ...p, prioridade: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">Maior = exibido primeiro</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="ativo">Ativo</Label>
                <Switch
                  id="ativo"
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, ativo: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="exigir">Exigir conclusão</Label>
                <Switch
                  id="exigir"
                  checked={form.exigir_conclusao}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, exigir_conclusao: v }))}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? 'Salvando...' : 'Salvar Fluxo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminWelcomeFlows({ onEditSteps, onViewAudit }: Props) {
  const { data: flows, isLoading } = useAdminOnboardingFlows();
  const upsert = useUpsertOnboardingFlow();
  const forceReapply = useForceOnboardingReapply();
  const queryClient = useQueryClient();

  const [formDialog, setFormDialog] = useState<{ open: boolean; flow: Partial<OnboardingFlow> | null }>({
    open: false, flow: null,
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; flow: OnboardingFlow | null }>({
    open: false, flow: null,
  });
  const [forceDialog, setForceDialog] = useState<{ open: boolean; flow: OnboardingFlow | null }>({
    open: false, flow: null,
  });

  const handleDuplicate = async (flow: OnboardingFlow) => {
    const slug = `${flow.slug}_copia_${Date.now()}`;
    const newFlow = await upsert.mutateAsync({
      slug,
      nome: `${flow.nome} (Cópia)`,
      descricao: flow.descricao,
      ativo: false,
      prioridade: flow.prioridade - 1,
      exigir_conclusao: flow.exigir_conclusao,
      aplicacao_planos: flow.aplicacao_planos,
      aplicacao_perfis: flow.aplicacao_perfis,
      versao: 1,
    });
    if (newFlow?.id) {
      const { data: srcSteps } = await supabase
        .from('onboarding_steps')
        .select('*')
        .eq('flow_id', flow.id)
        .order('ordem');
      if (srcSteps && srcSteps.length > 0) {
        const newSteps = srcSteps.map(({ id: _id, created_at: _c, updated_at: _u, flow_id: _f, ...rest }) => ({
          ...rest,
          flow_id: newFlow.id,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from('onboarding_steps').insert(newSteps as any);
      }
      queryClient.invalidateQueries({ queryKey: ['admin-onboarding-flows'] });
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.flow) return;
    await supabase.from('onboarding_flows').delete().eq('id', deleteDialog.flow.id);
    queryClient.invalidateQueries({ queryKey: ['admin-onboarding-flows'] });
    toast.success('Fluxo excluído');
    setDeleteDialog({ open: false, flow: null });
  };

  const handleToggleActive = async (flow: OnboardingFlow) => {
    await upsert.mutateAsync({ id: flow.id, slug: flow.slug, nome: flow.nome, ativo: !flow.ativo });
  };

  const handlePriority = async (flow: OnboardingFlow, dir: 1 | -1) => {
    await upsert.mutateAsync({ id: flow.id, slug: flow.slug, nome: flow.nome, prioridade: flow.prioridade + dir * 10 });
  };

  const handleIncrementVersion = async (flow: OnboardingFlow) => {
    await upsert.mutateAsync({ id: flow.id, slug: flow.slug, nome: flow.nome, versao: flow.versao + 1 });
    toast.info(`Versão incrementada para ${flow.versao + 1}. Todos os usuários verão o fluxo novamente.`);
  };

  const handleForceReapply = async () => {
    if (!forceDialog.flow) return;
    await forceReapply.mutateAsync({ flowId: forceDialog.flow.id });
    setForceDialog({ open: false, flow: null });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Fluxos de Boas-Vindas</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os fluxos exibidos automaticamente ao usuário
          </p>
        </div>
        <Button onClick={() => setFormDialog({ open: true, flow: null })}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Fluxo
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {!flows || flows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">Nenhum fluxo cadastrado</p>
              <Button variant="outline" onClick={() => setFormDialog({ open: true, flow: null })}>
                <Plus className="h-4 w-4 mr-2" />
                Criar primeiro fluxo
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Prior.</TableHead>
                  <TableHead>Fluxo</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Planos</TableHead>
                  <TableHead className="text-center">Exigir</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flows.map((flow) => (
                  <TableRow key={flow.id}>
                    <TableCell>
                      <div className="flex flex-col items-center gap-0.5">
                        <Button
                          variant="ghost" size="icon" className="h-5 w-5"
                          onClick={() => handlePriority(flow, 1)}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <span className="text-xs font-mono font-medium">{flow.prioridade}</span>
                        <Button
                          variant="ghost" size="icon" className="h-5 w-5"
                          onClick={() => handlePriority(flow, -1)}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{flow.nome}</p>
                        <p className="text-xs text-muted-foreground font-mono">{flow.slug}</p>
                        {flow.descricao && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{flow.descricao}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">v{flow.versao}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {flow.aplicacao_planos?.length
                          ? flow.aplicacao_planos.map((p) => (
                              <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                            ))
                          : <span className="text-xs text-muted-foreground">Todos</span>
                        }
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {flow.exigir_conclusao
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                        : <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                      }
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleToggleActive(flow)}
                        title={flow.ativo ? 'Desativar' : 'Ativar'}
                      >
                        {flow.ativo
                          ? <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">Ativo</Badge>
                          : <Badge variant="secondary">Inativo</Badge>
                        }
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setFormDialog({ open: true, flow })}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEditSteps(flow)}>
                            <Settings className="h-4 w-4 mr-2" />
                            Gerenciar Etapas
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onViewAudit(flow)}>
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Ver Auditoria
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDuplicate(flow)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleIncrementVersion(flow)}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Incrementar Versão
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setForceDialog({ open: true, flow })}>
                            <Eye className="h-4 w-4 mr-2" />
                            Forçar Reapresentação
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteDialog({ open: true, flow })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Flow form dialog */}
      <FlowFormDialog
        open={formDialog.open}
        onClose={() => setFormDialog({ open: false, flow: null })}
        initial={formDialog.flow}
        nextOrder={(flows?.length ?? 0) * 10 + 100}
      />

      {/* Delete confirm */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(o) => setDeleteDialog((p) => ({ ...p, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Fluxo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Isso também apagará todas as etapas. O histórico de progresso dos usuários não será perdido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force reapply confirm */}
      <AlertDialog open={forceDialog.open} onOpenChange={(o) => setForceDialog((p) => ({ ...p, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forçar Reapresentação</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os usuários que já completaram ou pularam <strong>{forceDialog.flow?.nome}</strong> verão o fluxo novamente.
              O histórico anterior é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceReapply} disabled={forceReapply.isPending}>
              {forceReapply.isPending ? 'Processando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
