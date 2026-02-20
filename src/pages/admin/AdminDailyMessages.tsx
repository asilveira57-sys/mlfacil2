import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BookOpen,
  AtSign,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Save,
  Loader2,
} from 'lucide-react';
import {
  useAdminDailyMessages,
  useAdminSignature,
  useAdminAiSuggestions,
} from '@/hooks/useDailyMessage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TEMAS = [
  { value: 'empreendedorismo', label: 'Empreendedorismo' },
  { value: 'raul_inspirado', label: 'Raul Inspirado' },
  { value: 'biblica', label: 'Bíblica' },
  { value: 'crista', label: 'Cristã' },
  { value: 'atitude', label: 'Atitude' },
  { value: 'geral', label: 'Geral' },
];

export function AdminDailyMessages() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mensagem do Dia</h1>
        <p className="text-muted-foreground">Gerencie frases, assinatura e sugestões de IA</p>
      </div>

      <Tabs defaultValue="biblioteca">
        <TabsList>
          <TabsTrigger value="biblioteca" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            Biblioteca
          </TabsTrigger>
          <TabsTrigger value="assinatura" className="gap-1.5">
            <AtSign className="h-4 w-4" />
            Assinatura
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            Sugestões IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="biblioteca">
          <BibliotecaTab />
        </TabsContent>
        <TabsContent value="assinatura">
          <AssinaturaTab />
        </TabsContent>
        <TabsContent value="ia">
          <SugestoesIATab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Biblioteca ───
function BibliotecaTab() {
  const { messages, isLoading, upsertMessage, deleteMessage } = useAdminDailyMessages();
  const [editMsg, setEditMsg] = useState<any>(null);
  const [filterTema, setFilterTema] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = messages.filter((m: any) => {
    if (filterTema !== 'all' && m.tema !== filterTema) return false;
    if (search && !m.texto.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSave = () => {
    if (!editMsg?.texto?.trim()) {
      toast.error('Texto obrigatório');
      return;
    }
    upsertMessage.mutate(editMsg, {
      onSuccess: () => {
        toast.success('Frase salva');
        setEditMsg(null);
      },
      onError: () => toast.error('Erro ao salvar'),
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Excluir esta frase?')) return;
    deleteMessage.mutate(id, {
      onSuccess: () => toast.success('Frase excluída'),
      onError: () => toast.error('Erro ao excluir'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Biblioteca de Frases</CardTitle>
            <CardDescription>{messages.length} frases cadastradas</CardDescription>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setEditMsg({ tema: 'geral', texto: '', referencia: '', ativa: true, ordem_rotacao: null })
            }
          >
            <Plus className="h-4 w-4" /> Nova Frase
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Select value={filterTema} onValueChange={setFilterTema}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os temas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os temas</SelectItem>
              {TEMAS.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Buscar por palavra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Tema</TableHead>
                <TableHead>Texto</TableHead>
                <TableHead className="w-[80px]">Ativa</TableHead>
                <TableHead className="w-[80px]">Ordem</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhuma frase encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {TEMAS.find((t) => t.value === m.tema)?.label || m.tema}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="line-clamp-2 text-sm">{m.texto}</p>
                      {m.referencia && (
                        <p className="text-xs text-muted-foreground mt-0.5">— {m.referencia}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={m.ativa}
                        onCheckedChange={(v) => upsertMessage.mutate({ id: m.id, ativa: v })}
                      />
                    </TableCell>
                    <TableCell className="text-center text-sm">{m.ordem_rotacao ?? '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditMsg(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(m.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Edit/Create Dialog */}
        <Dialog open={!!editMsg} onOpenChange={(o) => !o && setEditMsg(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editMsg?.id ? 'Editar Frase' : 'Nova Frase'}</DialogTitle>
            </DialogHeader>
            {editMsg && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tema</Label>
                  <Select value={editMsg.tema} onValueChange={(v) => setEditMsg({ ...editMsg, tema: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEMAS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Texto</Label>
                  <Textarea
                    value={editMsg.texto}
                    onChange={(e) => setEditMsg({ ...editMsg, texto: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Referência (opcional)</Label>
                  <Input
                    value={editMsg.referencia || ''}
                    onChange={(e) => setEditMsg({ ...editMsg, referencia: e.target.value })}
                    placeholder='Ex: Inspirado em Raul Seixas'
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ordem de rotação</Label>
                    <Input
                      type="number"
                      value={editMsg.ordem_rotacao ?? ''}
                      onChange={(e) => setEditMsg({ ...editMsg, ordem_rotacao: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      checked={editMsg.ativa}
                      onCheckedChange={(v) => setEditMsg({ ...editMsg, ativa: v })}
                    />
                    <Label>Ativa</Label>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditMsg(null)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={upsertMessage.isPending} className="gap-1.5">
                <Save className="h-4 w-4" /> Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Assinatura ───
function AssinaturaTab() {
  const { arroba, updateSignature } = useAdminSignature();
  const [value, setValue] = useState<string | null>(null);
  const current = value ?? arroba;

  const handleSave = () => {
    updateSignature.mutate(current, {
      onSuccess: () => toast.success('Assinatura atualizada'),
      onError: () => toast.error('Erro ao salvar'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AtSign className="h-5 w-5" />
          Assinatura Global
        </CardTitle>
        <CardDescription>
          O @ exibido no rodapé dos cards gerados para redes sociais
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-md">
          <Label>@ do rodapé</Label>
          <div className="flex gap-2">
            <Input
              value={current}
              onChange={(e) => setValue(e.target.value)}
              placeholder="@marketplacefacil"
            />
            <Button onClick={handleSave} disabled={updateSignature.isPending} className="gap-1.5">
              <Save className="h-4 w-4" /> Salvar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Deixe vazio para não exibir assinatura no card.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sugestões IA ───
function SugestoesIATab() {
  const { suggestions, isLoading, approveSuggestion, rejectSuggestion } = useAdminAiSuggestions();
  const [generating, setGenerating] = useState(false);
  const [genTema, setGenTema] = useState('geral');

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-message-suggestions', {
        body: { tema: genTema, count: 5 },
      });
      if (error) throw error;
      toast.success(`${data?.count || 0} sugestões geradas`);
      // Refresh
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar sugestões');
    } finally {
      setGenerating(false);
    }
  };

  const pending = suggestions.filter((s: any) => s.status === 'pendente');
  const history = suggestions.filter((s: any) => s.status !== 'pendente');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Gerar Sugestões por IA
              </CardTitle>
              <CardDescription>
                Sugestões ficam pendentes até sua aprovação
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={genTema} onValueChange={setGenTema}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMAS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleGenerate} disabled={generating} className="gap-1.5">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Gerar
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Pending */}
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pendentes ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((s: any) => (
              <div key={s.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge variant="outline" className="text-xs mb-1">
                      {TEMAS.find((t) => t.value === s.tema)?.label || s.tema}
                    </Badge>
                    <p className="text-sm font-medium">"{s.texto}"</p>
                    {s.referencia && (
                      <p className="text-xs text-muted-foreground">— {s.referencia}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() =>
                        approveSuggestion.mutate(s, {
                          onSuccess: () => toast.success('Sugestão aprovada e adicionada à biblioteca'),
                        })
                      }
                      disabled={approveSuggestion.isPending}
                    >
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-destructive"
                      onClick={() =>
                        rejectSuggestion.mutate(
                          { id: s.id },
                          { onSuccess: () => toast.success('Sugestão reprovada') }
                        )
                      }
                      disabled={rejectSuggestion.isPending}
                    >
                      <X className="h-3.5 w-3.5" /> Reprovar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.slice(0, 20).map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                  <Badge
                    variant={s.status === 'aprovada' ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {s.status === 'aprovada' ? 'Aprovada' : 'Reprovada'}
                  </Badge>
                  <span className="line-clamp-1 flex-1">{s.texto}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {TEMAS.find((t) => t.value === s.tema)?.label || s.tema}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
