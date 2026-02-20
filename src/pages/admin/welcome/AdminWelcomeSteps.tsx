import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Pencil, Trash2, ArrowLeft, GripVertical, ChevronUp, ChevronDown,
  Type, Image, Video, CheckSquare, HelpCircle, AlertTriangle, Zap, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminOnboardingSteps, useUpsertOnboardingStep, useDeleteOnboardingStep,
  type OnboardingFlow, type OnboardingStep,
} from '@/hooks/useWelcomeOnboarding';

const TIPOS: { value: OnboardingStep['tipo']; label: string; icon: React.ElementType }[] = [
  { value: 'texto', label: 'Texto', icon: Type },
  { value: 'midia', label: 'Imagem/Mídia', icon: Image },
  { value: 'video', label: 'Vídeo', icon: Video },
  { value: 'checklist', label: 'Checklist', icon: CheckSquare },
  { value: 'pergunta', label: 'Pergunta', icon: HelpCircle },
  { value: 'aviso', label: 'Aviso', icon: AlertTriangle },
  { value: 'acao', label: 'Ação/CTA', icon: Zap },
];

function getTipoIcon(tipo: OnboardingStep['tipo']) {
  const found = TIPOS.find((t) => t.value === tipo);
  if (!found) return Type;
  return found.icon;
}

interface StepFormDialogProps {
  open: boolean;
  onClose: () => void;
  initial: Partial<OnboardingStep> | null;
  flowId: string;
  nextOrdem: number;
}

function StepFormDialog({ open, onClose, initial, flowId, nextOrdem }: StepFormDialogProps) {
  const upsert = useUpsertOnboardingStep();
  const isEdit = !!initial?.id;

  // Checklist items state
  const existingItems = (initial?.validacao_schema?.items ?? []) as Array<{ id: string; label: string; required: boolean }>;
  const [checklistItems, setChecklistItems] = useState(existingItems);

  const [form, setForm] = useState({
    titulo: initial?.titulo ?? '',
    tipo: initial?.tipo ?? ('texto' as OnboardingStep['tipo']),
    conteudo: initial?.conteudo ?? '',
    media_url: initial?.media_url ?? '',
    video_url: initial?.video_url ?? '',
    cta_label: initial?.cta_label ?? '',
    cta_route: initial?.cta_route ?? '',
    obrigatoria: initial?.obrigatoria ?? false,
    ordem: initial?.ordem ?? nextOrdem,
  });

  const addChecklistItem = () => {
    setChecklistItems((p) => [
      ...p,
      { id: `item_${Date.now()}`, label: '', required: false },
    ]);
  };

  const updateChecklistItem = (idx: number, key: 'label' | 'required', value: string | boolean) => {
    setChecklistItems((p) => p.map((item, i) => i === idx ? { ...item, [key]: value } : item));
  };

  const removeChecklistItem = (idx: number) => {
    setChecklistItems((p) => p.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!form.titulo.trim()) {
      toast.error('Título é obrigatório');
      return;
    }
    let validacao_schema: Record<string, unknown> | null = null;
    if (form.tipo === 'checklist') {
      validacao_schema = { type: 'checklist', items: checklistItems };
    } else if (form.tipo === 'pergunta') {
      validacao_schema = { type: 'pergunta', required: form.obrigatoria };
    }

    await upsert.mutateAsync({
      ...(initial?.id ? { id: initial.id } : {}),
      flow_id: flowId,
      ordem: form.ordem,
      tipo: form.tipo,
      titulo: form.titulo.trim(),
      conteudo: form.conteudo || null,
      media_url: form.media_url || null,
      video_url: form.video_url || null,
      cta_label: form.cta_label || null,
      cta_route: form.cta_route || null,
      obrigatoria: form.obrigatoria,
      validacao_schema,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Etapa' : 'Nova Etapa'}</DialogTitle>
          <DialogDescription>Configure o conteúdo desta etapa do wizard</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((p) => ({ ...p, tipo: v as OnboardingStep['tipo'] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <t.icon className="h-3.5 w-3.5" />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.ordem}
                onChange={(e) => setForm((p) => ({ ...p, ordem: parseInt(e.target.value) || 1 }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título <span className="text-destructive">*</span></Label>
            <Input
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="Bem-vindo ao Marketplace Fácil!"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Conteúdo <span className="text-xs text-muted-foreground">(markdown: **negrito**, quebra de linha)</span></Label>
            <Textarea
              value={form.conteudo}
              onChange={(e) => setForm((p) => ({ ...p, conteudo: e.target.value }))}
              rows={4}
              placeholder="Texto da etapa..."
            />
          </div>

          {(form.tipo === 'midia') && (
            <div className="space-y-1.5">
              <Label>URL da Imagem</Label>
              <Input
                value={form.media_url}
                onChange={(e) => setForm((p) => ({ ...p, media_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          )}

          {(form.tipo === 'video') && (
            <div className="space-y-1.5">
              <Label>URL do Vídeo <span className="text-xs text-muted-foreground">(embed do YouTube/Vimeo)</span></Label>
              <Input
                value={form.video_url}
                onChange={(e) => setForm((p) => ({ ...p, video_url: e.target.value }))}
                placeholder="https://www.youtube.com/embed/..."
              />
            </div>
          )}

          {(form.tipo === 'checklist') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Itens do Checklist</Label>
                <Button variant="outline" size="sm" onClick={addChecklistItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Item
                </Button>
              </div>
              <div className="space-y-2">
                {checklistItems.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/20">
                    <Input
                      value={item.label}
                      onChange={(e) => updateChecklistItem(idx, 'label', e.target.value)}
                      placeholder={`Item ${idx + 1}...`}
                      className="flex-1 h-8 text-sm"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Label className="text-xs text-muted-foreground">Obrig.</Label>
                      <Switch
                        checked={item.required}
                        onCheckedChange={(v) => updateChecklistItem(idx, 'required', v)}
                        className="scale-75"
                      />
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => removeChecklistItem(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {checklistItems.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum item. Clique em "+ Item"</p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Label do CTA <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input
                value={form.cta_label}
                onChange={(e) => setForm((p) => ({ ...p, cta_label: e.target.value }))}
                placeholder="Configurar agora"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rota do CTA</Label>
              <Input
                value={form.cta_route}
                onChange={(e) => setForm((p) => ({ ...p, cta_route: e.target.value }))}
                placeholder="/settings"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="obrigatoria">Etapa obrigatória</Label>
              <p className="text-xs text-muted-foreground">Impede avançar sem completar</p>
            </div>
            <Switch
              id="obrigatoria"
              checked={form.obrigatoria}
              onCheckedChange={(v) => setForm((p) => ({ ...p, obrigatoria: v }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? 'Salvando...' : 'Salvar Etapa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Preview de uma etapa ───────────────────────────────────────────────────────
function StepPreview({ step }: { step: OnboardingStep }) {
  const TipoIcon = getTipoIcon(step.tipo);
  const tipoLabel = TIPOS.find((t) => t.value === step.tipo)?.label ?? step.tipo;

  return (
    <div className="space-y-2 p-3 bg-muted/20 rounded-lg border border-border text-sm">
      <div className="flex items-center gap-2">
        <TipoIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium">{tipoLabel}</span>
        {step.obrigatoria && <Badge variant="destructive" className="text-xs py-0">Obrigatória</Badge>}
      </div>
      {step.conteudo && (
        <p className="text-xs text-muted-foreground line-clamp-2">{step.conteudo}</p>
      )}
      {step.cta_label && step.cta_route && (
        <div className="flex items-center gap-1 text-xs text-primary">
          <Zap className="h-3 w-3" />
          <span>{step.cta_label} → {step.cta_route}</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  flow: OnboardingFlow;
  onBack: () => void;
}

export function AdminWelcomeSteps({ flow, onBack }: Props) {
  const { data: steps, isLoading } = useAdminOnboardingSteps(flow.id);
  const deleteStep = useDeleteOnboardingStep();
  const upsertStep = useUpsertOnboardingStep();
  const queryClient = useQueryClient();

  const [formDialog, setFormDialog] = useState<{ open: boolean; step: Partial<OnboardingStep> | null }>({
    open: false, step: null,
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; step: OnboardingStep | null }>({
    open: false, step: null,
  });
  const [previewStep, setPreviewStep] = useState<OnboardingStep | null>(null);

  const handleReorder = async (step: OnboardingStep, dir: -1 | 1) => {
    const sorted = [...(steps ?? [])].sort((a, b) => a.ordem - b.ordem);
    const idx = sorted.findIndex((s) => s.id === step.id);
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    const other = sorted[targetIdx];
    await Promise.all([
      upsertStep.mutateAsync({ id: step.id, flow_id: flow.id, ordem: other.ordem, tipo: step.tipo, titulo: step.titulo }),
      upsertStep.mutateAsync({ id: other.id, flow_id: flow.id, ordem: step.ordem, tipo: other.tipo, titulo: other.titulo }),
    ]);
    queryClient.invalidateQueries({ queryKey: ['admin-onboarding-steps', flow.id] });
  };

  const handleDelete = async () => {
    if (!deleteDialog.step) return;
    await deleteStep.mutateAsync({ stepId: deleteDialog.step.id, flowId: flow.id });
    setDeleteDialog({ open: false, step: null });
  };

  const sorted = [...(steps ?? [])].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{flow.nome}</h2>
          <p className="text-sm text-muted-foreground">
            Editor de etapas · <span className="font-mono">v{flow.versao}</span>
            {' · '}{sorted.length} etapa{sorted.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setFormDialog({ open: true, step: null })}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Etapa
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">Nenhuma etapa cadastrada neste fluxo</p>
            <Button variant="outline" onClick={() => setFormDialog({ open: true, step: null })}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar primeira etapa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((step, idx) => {
            const TipoIcon = getTipoIcon(step.tipo);
            const tipoLabel = TIPOS.find((t) => t.value === step.tipo)?.label ?? step.tipo;
            const isFirst = idx === 0;
            const isLast = idx === sorted.length - 1;

            return (
              <Card key={step.id} className="group">
                <CardContent className="flex items-start gap-3 p-4">
                  {/* Drag handle + ordem indicator */}
                  <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-mono font-bold text-muted-foreground">{step.ordem}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <TipoIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="font-medium text-sm truncate">{step.titulo}</p>
                      <Badge variant="outline" className="text-xs shrink-0">{tipoLabel}</Badge>
                      {step.obrigatoria && (
                        <Badge variant="destructive" className="text-xs shrink-0 py-0">Obrig.</Badge>
                      )}
                    </div>
                    {step.conteudo && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{step.conteudo}</p>
                    )}
                    {step.cta_label && (
                      <p className="text-xs text-primary mt-0.5">CTA: {step.cta_label} → {step.cta_route}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      disabled={isFirst}
                      onClick={() => handleReorder(step, -1)}
                      title="Mover para cima"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      disabled={isLast}
                      onClick={() => handleReorder(step, 1)}
                      title="Mover para baixo"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setPreviewStep(previewStep?.id === step.id ? null : step)}
                      title="Preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setFormDialog({ open: true, step })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteDialog({ open: true, step })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>

                {/* Inline preview */}
                {previewStep?.id === step.id && (
                  <div className="px-4 pb-4 border-t border-border pt-3">
                    <StepPreview step={step} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Step form */}
      <StepFormDialog
        open={formDialog.open}
        onClose={() => setFormDialog({ open: false, step: null })}
        initial={formDialog.step}
        flowId={flow.id}
        nextOrdem={(sorted.at(-1)?.ordem ?? 0) + 1}
      />

      {/* Delete confirm */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(o) => setDeleteDialog((p) => ({ ...p, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Etapa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a etapa <strong>"{deleteDialog.step?.titulo}"</strong>? Essa ação não pode ser desfeita.
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
    </div>
  );
}
