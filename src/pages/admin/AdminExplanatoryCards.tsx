import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, RotateCcw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAllExplanatoryCards,
  useUpsertExplanatoryCard,
  useDeleteExplanatoryCard,
  useResetCardViews,
  type ExplanatoryCard,
} from '@/hooks/useExplanatoryCards';
import { useSystemModules } from '@/hooks/useSystemModules';

const TIPOS = [
  { value: 'texto', label: 'Texto' },
  { value: 'imagem', label: 'Imagem' },
  { value: 'video', label: 'Vídeo' },
  { value: 'carrossel', label: 'Carrossel' },
];

type CardTipo = ExplanatoryCard['tipo'];

type FormData = {
  id?: string;
  module_slug: string;
  titulo: string;
  tipo: CardTipo;
  conteudo: string; // raw JSON string
  ordem: number;
  ativo: boolean;
  obrigatorio: boolean;
};

const emptyForm: FormData = {
  module_slug: '',
  titulo: '',
  tipo: 'texto',
  conteudo: '{"texto": ""}',
  ordem: 1,
  ativo: true,
  obrigatorio: true,
};

export function AdminExplanatoryCards() {
  const { data: cards = [], isLoading } = useAllExplanatoryCards();
  const { modules } = useSystemModules();
  const upsert = useUpsertExplanatoryCard();
  const deleteCard = useDeleteExplanatoryCard();
  const resetViews = useResetCardViews();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);

  const openNew = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (card: ExplanatoryCard) => {
    setForm({
      id: card.id,
      module_slug: card.module_slug,
      titulo: card.titulo,
      tipo: card.tipo,
      conteudo: JSON.stringify(card.conteudo, null, 2),
      ordem: card.ordem,
      ativo: card.ativo,
      obrigatorio: card.obrigatorio,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const parsed = JSON.parse(form.conteudo);
      await upsert.mutateAsync({
        id: form.id,
        module_slug: form.module_slug,
        titulo: form.titulo,
        tipo: form.tipo,
        conteudo: parsed,
        ordem: form.ordem,
        ativo: form.ativo,
        obrigatorio: form.obrigatorio,
      });
      toast.success(form.id ? 'Card atualizado!' : 'Card criado!');
      setDialogOpen(false);
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        toast.error('JSON inválido no conteúdo');
      } else {
        toast.error(e.message || 'Erro ao salvar');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este card?')) return;
    await deleteCard.mutateAsync(id);
    toast.success('Card excluído');
  };

  const handleReset = async (moduleSlug: string) => {
    if (!confirm(`Resetar visualizações do módulo "${moduleSlug}" para todos os usuários?`)) return;
    await resetViews.mutateAsync(moduleSlug);
    toast.success('Visualizações resetadas');
  };

  // Group cards by module_slug
  const grouped = cards.reduce<Record<string, ExplanatoryCard[]>>((acc, c) => {
    (acc[c.module_slug] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Cards Explicativos</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os cards de introdução exibidos ao acessar cada módulo pela primeira vez.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Card
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum card cadastrado. Clique em "Novo Card" para criar.
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([slug, moduleCards]) => (
          <Card key={slug}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">{slug}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReset(slug)}
                className="gap-1 text-xs"
              >
                <RotateCcw className="h-3 w-3" /> Resetar visualizações
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {moduleCards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={card.ativo ? 'default' : 'secondary'}>
                      {card.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Badge variant="outline">{card.tipo}</Badge>
                    <span className="text-sm font-medium truncate">{card.titulo}</span>
                    <span className="text-xs text-muted-foreground">#{card.ordem}</span>
                    {card.obrigatorio && (
                      <Badge variant="destructive" className="text-[10px]">Obrigatório</Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(card)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(card.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {/* Dialog form */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar Card' : 'Novo Card'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Módulo</Label>
              <Select value={form.module_slug} onValueChange={(v) => setForm({ ...form, module_slug: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o módulo" /></SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Título do card"
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as CardTipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Conteúdo (JSON)</Label>
              <Textarea
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                rows={8}
                className="font-mono text-xs"
                placeholder='{"texto": "..."}'
              />
            </div>

            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: parseInt(e.target.value) || 1 })}
                min={1}
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                <Label>Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.obrigatorio} onCheckedChange={(v) => setForm({ ...form, obrigatorio: v })} />
                <Label>Obrigatório</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.module_slug || !form.titulo || upsert.isPending}>
              {upsert.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
