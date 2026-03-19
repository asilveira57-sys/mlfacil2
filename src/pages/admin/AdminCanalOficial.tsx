import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus, Edit2, Eye, EyeOff, BarChart2, Save, X, Radio, Users, BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminAnnouncements,
  useUpsertAnnouncement,
  useToggleAnnouncementActive,
  useAnnouncementMetrics,
  type Announcement,
} from '@/hooks/useOfficialChannel';

// ─── Formulário ───────────────────────────────────────────────────────────────

interface FormData {
  title: string;
  content: string;
  image_url: string;
  link_url: string;
  plan_target: string;
  priority: number;
  is_active: boolean;
  target_seller_id: string;
  expires_at: string;
}

const EMPTY_FORM: FormData = {
  title: '',
  content: '',
  image_url: '',
  link_url: '',
  plan_target: 'all',
  priority: 0,
  is_active: true,
  target_seller_id: '',
  expires_at: '',
};

function AnnouncementForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Announcement>;
  onSave: (data: FormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormData>({
    title: initial?.title ?? '',
    content: initial?.content ?? '',
    image_url: initial?.image_url ?? '',
    link_url: initial?.link_url ?? '',
    plan_target: initial?.plan_target ?? 'all',
    priority: initial?.priority ?? 0,
    is_active: initial?.is_active ?? true,
    target_seller_id: (initial as any)?.target_seller_id ?? '',
    expires_at: (initial as any)?.expires_at ?? '',
  });

  const set = (k: keyof FormData, v: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Título *</Label>
        <Input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Título do comunicado"
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Conteúdo *</Label>
        <Textarea
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
          placeholder="Conteúdo completo do comunicado..."
          rows={6}
          className="resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>URL da Imagem</Label>
          <Input
            value={form.image_url}
            onChange={(e) => set('image_url', e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-1.5">
          <Label>URL do Link</Label>
          <Input
            value={form.link_url}
            onChange={(e) => set('link_url', e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Plano Alvo</Label>
          <Select value={form.plan_target} onValueChange={(v) => set('plan_target', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Prioridade</Label>
          <Input
            type="number"
            min={0}
            max={999}
            value={form.priority}
            onChange={(e) => set('priority', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Seller Alvo (opcional)</Label>
        <Input
          value={form.target_seller_id}
          onChange={(e) => set('target_seller_id', e.target.value)}
          placeholder="ID do seller (deixe vazio para todos)"
        />
        <p className="text-[11px] text-muted-foreground">Se preenchido, só esse seller verá o comunicado.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Expira em (opcional)</Label>
        <Input
          type="datetime-local"
          value={form.expires_at ? form.expires_at.slice(0, 16) : ''}
          onChange={(e) => set('expires_at', e.target.value ? new Date(e.target.value).toISOString() : '')}
        />
        <p className="text-[11px] text-muted-foreground">Após essa data, o comunicado não será mais exibido.</p>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="is_active"
          checked={form.is_active}
          onCheckedChange={(v) => set('is_active', v)}
        />
        <Label htmlFor="is_active">Ativo (visível para usuários)</Label>
      </div>

      <Separator />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-1.5" />
          Cancelar
        </Button>
        <Button
          onClick={() => onSave(form)}
          disabled={!form.title.trim() || !form.content.trim()}
        >
          <Save className="h-4 w-4 mr-1.5" />
          Salvar
        </Button>
      </div>
    </div>
  );
}

// ─── Métricas por comunicado ──────────────────────────────────────────────────

function MetricsModal({
  ann,
  totalUsers,
  onClose,
}: {
  ann: Announcement;
  totalUsers: number;
  onClose: () => void;
}) {
  const { data: metrics, isLoading } = useAnnouncementMetrics(ann.id);

  const readCount = metrics?.totalReads ?? 0;
  const pct = totalUsers > 0 ? Math.round((readCount / totalUsers) * 100) : 0;
  const unread = Math.max(0, totalUsers - readCount);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Métricas do Comunicado</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground line-clamp-2 -mt-2">{ann.title}</p>
        <Separator />
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-2xl font-bold text-primary">{readCount}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Leituras</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-2xl font-bold text-foreground">{unread}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Não lidos</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-2xl font-bold text-foreground">{pct}%</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Abertura</p>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Painel principal ─────────────────────────────────────────────────────────

export function AdminCanalOficial() {
  const { data: announcements = [], isLoading } = useAdminAnnouncements();
  const upsert = useUpsertAnnouncement();
  const toggle = useToggleAnnouncementActive();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [metricsAnn, setMetricsAnn] = useState<Announcement | null>(null);

  // Estimativa de usuários (total de leituras distintas entre todos comunicados)
  const totalDistinctReads = announcements.length;

  const editing = editingId === 'new'
    ? undefined
    : announcements.find((a) => a.id === editingId);

  const handleSave = async (form: FormData) => {
    try {
      await upsert.mutateAsync({
        ...(editingId && editingId !== 'new' ? { id: editingId } : {}),
        title: form.title,
        content: form.content,
        image_url: form.image_url || null,
        link_url: form.link_url || null,
        plan_target: form.plan_target,
        priority: form.priority,
        is_active: form.is_active,
        target_seller_id: form.target_seller_id || null,
        expires_at: form.expires_at || null,
      toast({ title: 'Comunicado salvo com sucesso' });
      setEditingId(null);
    } catch {
      toast({ title: 'Erro ao salvar comunicado', variant: 'destructive' });
    }
  };

  const handleToggle = async (ann: Announcement) => {
    await toggle.mutateAsync({ id: ann.id, is_active: !ann.is_active });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            <Radio className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Canal Oficial MKTPFACIL</h2>
            <p className="text-sm text-muted-foreground">
              Gerencie comunicados institucionais da plataforma
            </p>
          </div>
        </div>
        <Button onClick={() => setEditingId('new')}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Comunicado
        </Button>
      </div>

      {/* Formulário de edição */}
      {editingId !== null && (
        <div className="border border-border rounded-lg p-5 bg-card">
          <h3 className="text-sm font-semibold mb-4">
            {editingId === 'new' ? 'Novo Comunicado' : 'Editar Comunicado'}
          </h3>
          <AnnouncementForm
            initial={editing}
            onSave={handleSave}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{announcements.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
            <BookOpen className="h-3 w-3" /> Total
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-primary">
            {announcements.filter((a) => a.is_active).length}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
            <Eye className="h-3 w-3" /> Ativos
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground">
            {announcements.filter((a) => !a.is_active).length}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
            <EyeOff className="h-3 w-3" /> Inativos
          </p>
        </div>
      </div>

      {/* Lista */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-muted/40 border-b border-border">
          <p className="text-sm font-medium">Comunicados</p>
        </div>
        <ScrollArea className="max-h-[520px]">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nenhum comunicado criado ainda.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Status indicator */}
                  <span
                    className={`mt-1.5 block w-2 h-2 rounded-full shrink-0 ${
                      ann.is_active ? 'bg-primary' : 'bg-muted-foreground/40'
                    }`}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ann.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {ann.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {ann.plan_target}
                      </Badge>
                      {(ann as any).target_seller_id && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-accent text-accent-foreground">
                          🎯 {(ann as any).target_seller_id.slice(0, 8)}…
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Prioridade {ann.priority}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(ann.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Métricas"
                      onClick={() => setMetricsAnn(ann)}
                    >
                      <BarChart2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Editar"
                      onClick={() => setEditingId(ann.id)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${ann.is_active ? 'text-primary' : 'text-muted-foreground'}`}
                      title={ann.is_active ? 'Desativar' : 'Ativar'}
                      onClick={() => handleToggle(ann)}
                    >
                      {ann.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Modal de métricas */}
      {metricsAnn && (
        <MetricsModal
          ann={metricsAnn}
          totalUsers={totalDistinctReads}
          onClose={() => setMetricsAnn(null)}
        />
      )}
    </div>
  );
}
