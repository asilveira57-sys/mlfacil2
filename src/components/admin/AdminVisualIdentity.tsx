import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Palette, Eye, Sparkles, Trash2, Plus, Save, History, Loader2, Upload, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import type { VisualCategoryGroup } from '@/hooks/useVisualIdentity';

export function AdminVisualIdentity() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Palette className="h-6 w-6 text-primary" />
          Identidade Visual por Categoria
        </h2>
        <p className="text-muted-foreground mt-1">
          Gerencie os grupos visuais e veja os logs de aplicação automática.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CategoryGroupsManager />
        </div>
        <div>
          <VisualIdentityLogs />
        </div>
      </div>
    </div>
  );
}

function OverlayImageField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<'upload' | 'url'>(value && value.startsWith('http') ? 'url' : 'upload');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `overlay-${Date.now()}.${ext}`;
      const filePath = `visual-identity/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('public-assets')
        .getPublicUrl(filePath);

      onChange(publicUrl);
      toast.success('Imagem enviada!');
    } catch (err) {
      console.error('[OverlayImageField] upload error:', err);
      toast.error('Erro ao enviar imagem');
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Imagem Overlay (opcional)</Label>
        <div className="flex gap-1">
          <Button type="button" variant={mode === 'upload' ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] px-2" onClick={() => setMode('upload')}>
            <Upload className="h-3 w-3 mr-1" /> Upload
          </Button>
          <Button type="button" variant={mode === 'url' ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] px-2" onClick={() => setMode('url')}>
            URL
          </Button>
        </div>
      </div>

      {mode === 'upload' ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'} ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs text-muted-foreground">Enviando...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Arraste ou clique para enviar</p>
            </div>
          )}
        </div>
      ) : (
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="https://..."
        />
      )}

      {value && (
        <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
          <img src={value} alt="Overlay preview" className="h-10 w-10 rounded object-cover" />
          <span className="text-xs text-muted-foreground truncate flex-1">{value.split('/').pop()}</span>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => onChange(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

function CategoryGroupsManager() {
  const queryClient = useQueryClient();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['admin-visual-category-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visual_category_groups')
        .select('*')
        .order('prioridade', { ascending: true });
      if (error) throw error;
      return data as VisualCategoryGroup[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('visual_category_groups')
        .update({ ativo })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-visual-category-groups'] });
      toast.success('Grupo atualizado');
    },
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<VisualCategoryGroup> & { id: string }) => {
      const { error } = await supabase
        .from('visual_category_groups')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-visual-category-groups'] });
      toast.success('Grupo salvo');
    },
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<VisualCategoryGroup>>({});

  const startEdit = (group: VisualCategoryGroup) => {
    setEditingId(group.id);
    setEditForm({
      nome: group.nome,
      gradiente_inicio: group.gradiente_inicio,
      gradiente_fim: group.gradiente_fim,
      intensidade_padrao: group.intensidade_padrao,
      prioridade: group.prioridade,
      categorias_ml: group.categorias_ml,
      imagem_overlay_url: group.imagem_overlay_url,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateGroup.mutate({ id: editingId, ...editForm });
    setEditingId(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Grupos Visuais
        </CardTitle>
        <CardDescription>
          Cada grupo mapeia categorias do Mercado Livre a um tema visual.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Color preview */}
                <div
                  className="w-10 h-10 rounded-lg shrink-0 border"
                  style={{
                    background: `linear-gradient(135deg, ${group.gradiente_inicio}, ${group.gradiente_fim})`,
                  }}
                />
                <div>
                  <h4 className="font-medium">{group.nome}</h4>
                  <p className="text-xs text-muted-foreground">
                    {group.categorias_ml.length > 0
                      ? `Categorias: ${group.categorias_ml.join(', ')}`
                      : 'Nenhuma categoria mapeada'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={group.ativo ? 'default' : 'secondary'} className="text-xs">
                  {group.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
                <Switch
                  checked={group.ativo}
                  onCheckedChange={(checked) => toggleActive.mutate({ id: group.id, ativo: checked })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (editingId === group.id ? setEditingId(null) : startEdit(group))}
                >
                  {editingId === group.id ? 'Cancelar' : 'Editar'}
                </Button>
              </div>
            </div>

            {editingId === group.id && (
              <div className="border-t pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Nome</Label>
                    <Input
                      value={editForm.nome || ''}
                      onChange={(e) => setEditForm((p) => ({ ...p, nome: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade (menor = maior)</Label>
                    <Input
                      type="number"
                      value={editForm.prioridade || 100}
                      onChange={(e) => setEditForm((p) => ({ ...p, prioridade: parseInt(e.target.value) || 100 }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Cor Início</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={editForm.gradiente_inicio || '#1a1a2e'}
                        onChange={(e) => setEditForm((p) => ({ ...p, gradiente_inicio: e.target.value }))}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                      <Input
                        value={editForm.gradiente_inicio || ''}
                        onChange={(e) => setEditForm((p) => ({ ...p, gradiente_inicio: e.target.value }))}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Cor Fim</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={editForm.gradiente_fim || '#16213e'}
                        onChange={(e) => setEditForm((p) => ({ ...p, gradiente_fim: e.target.value }))}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                      <Input
                        value={editForm.gradiente_fim || ''}
                        onChange={(e) => setEditForm((p) => ({ ...p, gradiente_fim: e.target.value }))}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Intensidade Padrão: {editForm.intensidade_padrao}</Label>
                  <Slider
                    value={[editForm.intensidade_padrao || 4]}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={([v]) => setEditForm((p) => ({ ...p, intensidade_padrao: v }))}
                    className="mt-1"
                  />
                </div>
                <OverlayImageField
                  value={editForm.imagem_overlay_url || null}
                  onChange={(url) => setEditForm((p) => ({ ...p, imagem_overlay_url: url }))}
                />
                <div>
                  <Label className="text-xs">Categorias ML (separadas por vírgula)</Label>
                  <Input
                    value={(editForm.categorias_ml || []).join(', ')}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        categorias_ml: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      }))
                    }
                    placeholder="MLB5672, MLB1648"
                  />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={saveEdit} disabled={updateGroup.isPending} className="gap-2">
                    <Save className="h-4 w-4" />
                    Salvar
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function VisualIdentityLogs() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['visual-identity-logs-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visual_identity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Logs Recentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-4 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum log registrado.</p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {logs.map((log: any) => (
                <div key={log.id} className="border rounded p-2 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">
                      {log.origem}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p>
                    <span className="text-muted-foreground">Modo:</span> {log.modo_aplicado}
                    {log.grupo_visual_aplicado && (
                      <>
                        {' · '}
                        <span className="text-muted-foreground">Grupo:</span> {log.grupo_visual_aplicado}
                      </>
                    )}
                  </p>
                  {log.categoria_detectada && (
                    <p>
                      <span className="text-muted-foreground">Categoria:</span> {log.categoria_detectada}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
