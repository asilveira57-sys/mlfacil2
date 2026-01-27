import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Tag, X, Check, Loader2 } from 'lucide-react';
import { useModuleTags, useSystemModules, useModuleTagAssignments, useTagMutations, useTagAssignmentMutations } from '@/hooks/useModuleTags';
import { ModuleTagBadge, ModuleTagsDisplay } from '@/components/admin/ModuleTagBadge';
import type { ModuleTag, SystemModule } from '@/types/module-tags';

export function AdminModuleTags() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Controle de Tags</h2>
        <p className="text-muted-foreground">
          Gerencie tags visuais para sinalização de status dos módulos
        </p>
      </div>

      <Tabs defaultValue="tags" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tags">Gestão de Tags</TabsTrigger>
          <TabsTrigger value="modules">Módulos</TabsTrigger>
        </TabsList>

        <TabsContent value="tags">
          <TagsManagement />
        </TabsContent>

        <TabsContent value="modules">
          <ModulesManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TagsManagement() {
  const { data: tags, isLoading } = useModuleTags();
  const { createTag, updateTag, deleteTag } = useTagMutations();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<ModuleTag | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    color: '#6366f1',
    style: 'badge' as 'badge' | 'selo',
    priority: 0,
  });

  const resetForm = () => {
    setFormData({ name: '', color: '#6366f1', style: 'badge', priority: 0 });
    setEditingTag(null);
  };

  const handleOpenDialog = (tag?: ModuleTag) => {
    if (tag) {
      setEditingTag(tag);
      setFormData({
        name: tag.name,
        color: tag.color,
        style: tag.style,
        priority: tag.priority,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (editingTag) {
      await updateTag.mutateAsync({ id: editingTag.id, ...formData });
    } else {
      await createTag.mutateAsync(formData);
    }
    setIsDialogOpen(false);
    resetForm();
  };

  const handleToggleActive = async (tag: ModuleTag) => {
    await updateTag.mutateAsync({ id: tag.id, is_active: !tag.is_active });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta tag?')) {
      await deleteTag.mutateAsync(id);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tags Disponíveis</CardTitle>
          <CardDescription>Crie e gerencie tags para identificar status dos módulos</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Tag
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTag ? 'Editar Tag' : 'Nova Tag'}</DialogTitle>
              <DialogDescription>
                Configure os detalhes da tag de módulo
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Novo, Beta, Em breve"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Cor</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#6366f1"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="style">Estilo</Label>
                <Select
                  value={formData.style}
                  onValueChange={(value) => setFormData({ ...formData, style: value as 'badge' | 'selo' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="badge">Badge (Arredondado)</SelectItem>
                    <SelectItem value="selo">Selo (Quadrado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Prioridade (ordem de exibição)</Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  min={0}
                />
              </div>
              <div className="pt-2">
                <Label>Pré-visualização</Label>
                <div className="mt-2 p-4 border rounded-lg bg-muted/30 flex items-center gap-4">
                  <ModuleTagBadge
                    tag={{
                      id: 'preview',
                      name: formData.name || 'Preview',
                      color: formData.color,
                      style: formData.style,
                      priority: formData.priority,
                      is_active: true,
                      created_at: '',
                      updated_at: '',
                    }}
                    size="md"
                  />
                  <span className="text-sm text-muted-foreground">← Visualização da tag</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={!formData.name || createTag.isPending || updateTag.isPending}
              >
                {(createTag.isPending || updateTag.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingTag ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Estilo</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags?.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell>
                  <ModuleTagBadge tag={tag} size="md" />
                </TableCell>
                <TableCell className="capitalize">{tag.style}</TableCell>
                <TableCell>{tag.priority}</TableCell>
                <TableCell>
                  <Switch
                    checked={tag.is_active}
                    onCheckedChange={() => handleToggleActive(tag)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(tag)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(tag.id)}
                      disabled={deleteTag.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!tags || tags.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhuma tag cadastrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ModulesManagement() {
  const { data: modules, isLoading: modulesLoading } = useSystemModules();
  const { data: tags, isLoading: tagsLoading } = useModuleTags();
  const { data: assignments } = useModuleTagAssignments();
  const { assignTag, removeTag } = useTagAssignmentMutations();

  const getModuleTags = (moduleId: string): ModuleTag[] => {
    if (!tags || !assignments) return [];
    const moduleAssignments = assignments.filter(a => a.module_id === moduleId);
    return tags.filter(t => moduleAssignments.some(a => a.tag_id === t.id));
  };

  const getAvailableTags = (moduleId: string): ModuleTag[] => {
    if (!tags || !assignments) return [];
    const assignedTagIds = assignments.filter(a => a.module_id === moduleId).map(a => a.tag_id);
    return tags.filter(t => !assignedTagIds.includes(t.id) && t.is_active);
  };

  const handleAssignTag = async (moduleId: string, tagId: string) => {
    await assignTag.mutateAsync({ moduleId, tagId });
  };

  const handleRemoveTag = async (moduleId: string, tagId: string) => {
    await removeTag.mutateAsync({ moduleId, tagId });
  };

  if (modulesLoading || tagsLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Módulos do Sistema</CardTitle>
        <CardDescription>Associe tags aos módulos para comunicação visual</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo</TableHead>
              <TableHead>Tags Aplicadas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules?.map((module) => {
              const moduleTags = getModuleTags(module.id);
              const availableTags = getAvailableTags(module.id);

              return (
                <TableRow key={module.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{module.name}</div>
                      <div className="text-sm text-muted-foreground">{module.route}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 flex-wrap">
                      {moduleTags.map((tag) => (
                        <div key={tag.id} className="flex items-center gap-1">
                          <ModuleTagBadge tag={tag} size="md" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => handleRemoveTag(module.id, tag.id)}
                            disabled={removeTag.isPending}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {moduleTags.length === 0 && (
                        <span className="text-sm text-muted-foreground">Sem tags</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {availableTags.length > 0 && (
                      <Select onValueChange={(tagId) => handleAssignTag(module.id, tagId)}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Adicionar tag" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTags.map((tag) => (
                            <SelectItem key={tag.id} value={tag.id}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: tag.color }}
                                />
                                {tag.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
