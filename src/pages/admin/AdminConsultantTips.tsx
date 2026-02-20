import { useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Plus, Eye, EyeOff, Pin, PinOff, Pencil, Trash2, BarChart3, Sparkles,
} from 'lucide-react';
import { useAdminConsultantTips, useAdminTipMutations, useAdminTipGlobalMetrics } from '@/hooks/useConsultantTips';
import { useToast } from '@/hooks/use-toast';
import type { ConsultantTip } from '@/hooks/useConsultantTips';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const NIVEL_LABELS: Record<string, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
};

function TipFormDialog({
  open,
  onClose,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  initialData?: Partial<ConsultantTip>;
}) {
  const { createTip, updateTip } = useAdminTipMutations();
  const { toast } = useToast();
  const isEdit = !!initialData?.id;

  const [form, setForm] = useState({
    titulo: initialData?.titulo ?? '',
    slug: initialData?.slug ?? '',
    tipo: initialData?.tipo ?? 'texto',
    categoria: initialData?.categoria ?? '',
    modulo_relacionado: initialData?.modulo_relacionado ?? '',
    nivel: initialData?.nivel ?? 'iniciante',
    tags: initialData?.tags?.join(', ') ?? '',
    body: (initialData?.conteudo_json as { body?: string })?.body ?? '',
    highlights: (initialData?.conteudo_json as { highlights?: string[] })?.highlights?.join('\n') ?? '',
    fixada_dashboard: initialData?.fixada_dashboard ?? false,
    ativa: initialData?.ativa ?? true,
  });

  const generateSlug = (titulo: string) =>
    titulo.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim().replace(/\s+/g, '-');

  const handleSubmit = async () => {
    if (!form.titulo || !form.slug) {
      toast({ title: 'Preencha o título e o slug', variant: 'destructive' });
      return;
    }
    try {
      const payload = {
        titulo: form.titulo,
        slug: form.slug,
        tipo: form.tipo as ConsultantTip['tipo'],
        categoria: form.categoria || null,
        modulo_relacionado: form.modulo_relacionado || null,
        nivel: form.nivel as ConsultantTip['nivel'],
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
        conteudo_json: {
          body: form.body,
          highlights: form.highlights ? form.highlights.split('\n').filter(Boolean) : [],
        },
        fixada_dashboard: form.fixada_dashboard,
        ativa: form.ativa,
      };
      if (isEdit && initialData?.id) {
        await updateTip.mutateAsync({ id: initialData.id, ...payload });
        toast({ title: 'Dica atualizada com sucesso!' });
      } else {
        await createTip.mutateAsync(payload);
        toast({ title: 'Dica criada com sucesso!' });
      }
      onClose();
    } catch (err: unknown) {
      toast({ title: 'Erro ao salvar dica', description: err instanceof Error ? err.message : 'Tente novamente', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Dica' : 'Nova Dica de Consultor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Título *</Label>
              <Input
                value={form.titulo}
                onChange={e => {
                  setForm(f => ({
                    ...f,
                    titulo: e.target.value,
                    slug: f.slug || generateSlug(e.target.value),
                  }));
                }}
                placeholder="Ex: Como precificar corretamente"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Slug *</Label>
              <Input
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="como-precificar-corretamente"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as ConsultantTip['tipo'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="texto">Texto</SelectItem>
                  <SelectItem value="imagem">Imagem</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="carrossel">Carrossel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nível</Label>
              <Select value={form.nivel} onValueChange={v => setForm(f => ({ ...f, nivel: v as ConsultantTip['nivel'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="iniciante">Iniciante</SelectItem>
                  <SelectItem value="intermediario">Intermediário</SelectItem>
                  <SelectItem value="avancado">Avançado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Ex: Precificação" />
            </div>
            <div className="space-y-1.5">
              <Label>Módulo relacionado</Label>
              <Input value={form.modulo_relacionado} onChange={e => setForm(f => ({ ...f, modulo_relacionado: e.target.value }))} placeholder="Ex: precificacao" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="precificacao, margem, marketplace" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Conteúdo / Texto principal</Label>
              <Textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={5}
                placeholder="Escreva a dica principal..."
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Destaques / Highlights (um por linha)</Label>
              <Textarea
                value={form.highlights}
                onChange={e => setForm(f => ({ ...f, highlights: e.target.value }))}
                rows={3}
                placeholder="Dica 1&#10;Dica 2&#10;Dica 3"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.fixada_dashboard} onCheckedChange={v => setForm(f => ({ ...f, fixada_dashboard: v }))} />
              <Label>Fixar no Dashboard</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.ativa} onCheckedChange={v => setForm(f => ({ ...f, ativa: v }))} />
              <Label>Ativa</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createTip.isPending || updateTip.isPending}>
            {isEdit ? 'Salvar alterações' : 'Criar dica'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminConsultantTips() {
  const { data: tips = [], isLoading } = useAdminConsultantTips();
  const { data: metrics } = useAdminTipGlobalMetrics();
  const { toggleTip, deleteTip, toggleDashboard } = useAdminTipMutations();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editTip, setEditTip] = useState<ConsultantTip | undefined>();

  const handleEdit = (tip: ConsultantTip) => {
    setEditTip(tip);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta dica?')) return;
    try {
      await deleteTip.mutateAsync(id);
      toast({ title: 'Dica excluída.' });
    } catch {
      toast({ title: 'Erro ao excluir.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: metrics.total_tips },
            { label: 'Ativas', value: metrics.active_tips },
            { label: 'Visualizações', value: metrics.total_views },
            { label: 'Likes', value: metrics.total_likes },
            { label: 'Salvamentos', value: metrics.total_saves },
            { label: 'Compartilhamentos', value: metrics.total_shares },
          ].map(m => (
            <div key={m.label} className="rounded-lg border border-border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{m.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-semibold">{tips.length} dicas cadastradas</span>
        </div>
        <Button
          onClick={() => { setEditTip(undefined); setFormOpen(true); }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Nova Dica
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Dashboard</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(9)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : tips.map(tip => (
              <TableRow key={tip.id}>
                <TableCell className="font-medium max-w-[200px] truncate">{tip.titulo}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{tip.categoria ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{tip.modulo_relacionado ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">{NIVEL_LABELS[tip.nivel]}</Badge>
                </TableCell>
                <TableCell className="text-center text-sm">{tip.versao}</TableCell>
                <TableCell>
                  <Badge variant={tip.ativa ? 'default' : 'secondary'} className="text-[10px]">
                    {tip.ativa ? 'Ativa' : 'Inativa'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={tip.fixada_dashboard ? 'default' : 'outline'} className="text-[10px]">
                    {tip.fixada_dashboard ? 'Fixada' : 'Não'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(tip.created_at), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title={tip.ativa ? 'Desativar' : 'Ativar'}
                      onClick={() => toggleTip.mutate({ id: tip.id, ativa: !tip.ativa })}
                    >
                      {tip.ativa ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title={tip.fixada_dashboard ? 'Desafixar' : 'Fixar no Dashboard'}
                      onClick={() => toggleDashboard.mutate({ id: tip.id, fixada: !tip.fixada_dashboard })}
                    >
                      {tip.fixada_dashboard ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="Editar"
                      onClick={() => handleEdit(tip)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Excluir"
                      onClick={() => handleDelete(tip.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Form dialog */}
      {formOpen && (
        <TipFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditTip(undefined); }}
          initialData={editTip}
        />
      )}
    </div>
  );
}
