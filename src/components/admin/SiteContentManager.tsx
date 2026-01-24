import { useState, useEffect } from 'react';
import { useSiteContent, SiteContent, SiteContentInsert } from '@/hooks/useSiteContent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, FileText, Eye, EyeOff, Save, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGES = [
  { value: 'home', label: 'Página Inicial' },
  { value: 'planos', label: 'Planos' },
  { value: 'faq', label: 'FAQ' },
  { value: 'legal', label: 'Termos e Políticas' },
  { value: 'about', label: 'Sobre' },
  { value: 'contact', label: 'Contato' },
];

const SECTIONS = {
  home: ['header', 'hero', 'benefits', 'modules', 'howitworks', 'integrations', 'demo', 'pricing', 'testimonials', 'faq', 'cta', 'footer'],
  planos: ['header', 'cards', 'comparison', 'faq'],
  faq: ['general', 'payments', 'security', 'support'],
  legal: ['terms', 'privacy', 'cookies', 'lgpd'],
  about: ['hero', 'story', 'team', 'values'],
  contact: ['form', 'info', 'faq'],
};

interface ContentEditorProps {
  content: SiteContent | null;
  onSave: (data: SiteContentInsert) => Promise<void>;
  onClose: () => void;
  isNew?: boolean;
}

function ContentEditor({ content, onSave, onClose, isNew = false }: ContentEditorProps) {
  const [formData, setFormData] = useState<SiteContentInsert>({
    chave: content?.chave || '',
    texto: content?.texto || '',
    pagina: content?.pagina || 'home',
    secao: content?.secao || '',
    tipo: content?.tipo || 'text',
    descricao: content?.descricao || '',
    status: content?.status || 'ativo',
    ordem: content?.ordem || 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.chave.trim()) {
      toast.error('Chave é obrigatória');
      return;
    }
    
    setSaving(true);
    try {
      await onSave(formData);
      toast.success(isNew ? 'Conteúdo criado com sucesso' : 'Conteúdo atualizado com sucesso');
      onClose();
    } catch (error) {
      toast.error('Erro ao salvar conteúdo');
    } finally {
      setSaving(false);
    }
  };

  const sections = SECTIONS[formData.pagina as keyof typeof SECTIONS] || [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pagina">Página</Label>
          <Select
            value={formData.pagina}
            onValueChange={(value) => setFormData(prev => ({ ...prev, pagina: value, secao: '' }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGES.map(page => (
                <SelectItem key={page.value} value={page.value}>
                  {page.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="secao">Seção</Label>
          <Select
            value={formData.secao || ''}
            onValueChange={(value) => setFormData(prev => ({ ...prev, secao: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {sections.map(section => (
                <SelectItem key={section} value={section}>
                  {section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="chave">Chave identificadora</Label>
        <Input
          id="chave"
          value={formData.chave}
          onChange={(e) => setFormData(prev => ({ ...prev, chave: e.target.value }))}
          placeholder="Ex: home.hero.title"
          disabled={!isNew}
        />
        <p className="text-xs text-muted-foreground">
          Use o formato: pagina.secao.elemento (ex: home.hero.title)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Input
          id="descricao"
          value={formData.descricao || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
          placeholder="Descrição do conteúdo para referência"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="texto">Texto</Label>
        <Textarea
          id="texto"
          value={formData.texto}
          onChange={(e) => setFormData(prev => ({ ...prev, texto: e.target.value }))}
          placeholder="Digite o conteúdo aqui..."
          rows={8}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Suporta Markdown para formatação básica.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ordem">Ordem</Label>
          <Input
            id="ordem"
            type="number"
            value={formData.ordem}
            onChange={(e) => setFormData(prev => ({ ...prev, ordem: parseInt(e.target.value) || 0 }))}
          />
        </div>

        <div className="flex items-center justify-between pt-6">
          <Label htmlFor="status">Ativo</Label>
          <Switch
            id="status"
            checked={formData.status === 'ativo'}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, status: checked ? 'ativo' : 'inativo' }))}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function SiteContentManager() {
  const { allContent, loading, fetchAllContent, createContent, updateContent, deleteContent, defaultTexts } = useSiteContent();
  const [search, setSearch] = useState('');
  const [filterPage, setFilterPage] = useState<string>('all');
  const [editingContent, setEditingContent] = useState<SiteContent | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDefaults, setShowDefaults] = useState(false);

  useEffect(() => {
    fetchAllContent();
  }, [fetchAllContent]);

  const filteredContent = allContent.filter(item => {
    const matchesSearch = search === '' || 
      item.chave.toLowerCase().includes(search.toLowerCase()) ||
      item.texto.toLowerCase().includes(search.toLowerCase()) ||
      item.descricao?.toLowerCase().includes(search.toLowerCase());
    
    const matchesPage = filterPage === 'all' || item.pagina === filterPage;
    
    return matchesSearch && matchesPage;
  });

  // Get default texts that haven't been customized yet
  const uncustomizedDefaults = Object.entries(defaultTexts).filter(
    ([key]) => !allContent.some(item => item.chave === key)
  );

  const handleEdit = (content: SiteContent) => {
    setEditingContent(content);
    setIsNew(false);
    setShowEditor(true);
  };

  const handleNew = () => {
    setEditingContent(null);
    setIsNew(true);
    setShowEditor(true);
  };

  const handleCreateFromDefault = (key: string, texto: string) => {
    const [pagina, secao] = key.split('.');
    setEditingContent({
      id: '',
      chave: key,
      texto,
      pagina,
      secao,
      tipo: 'text',
      descricao: `Default: ${key}`,
      status: 'ativo',
      ordem: 0,
      created_at: '',
      updated_at: ''
    });
    setIsNew(true);
    setShowEditor(true);
  };

  const handleSave = async (data: SiteContentInsert) => {
    if (isNew) {
      const result = await createContent(data);
      if (result) {
        await fetchAllContent();
      }
    } else if (editingContent) {
      const result = await updateContent(editingContent.id, data);
      if (result) {
        await fetchAllContent();
      }
    }
  };

  const handleDelete = async () => {
    if (deleteId) {
      const success = await deleteContent(deleteId);
      if (success) {
        toast.success('Conteúdo excluído');
        await fetchAllContent();
      } else {
        toast.error('Erro ao excluir');
      }
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Conteúdo do Site</h2>
          <p className="text-muted-foreground">Gerencie textos institucionais da landing page</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAllContent}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Button onClick={handleNew}>
            <Plus className="w-4 h-4 mr-2" />
            Novo conteúdo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por chave ou texto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterPage} onValueChange={setFilterPage}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por página" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as páginas</SelectItem>
                {PAGES.map(page => (
                  <SelectItem key={page.value} value={page.value}>
                    {page.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="custom">
        <TabsList>
          <TabsTrigger value="custom">
            Conteúdos personalizados ({filteredContent.length})
          </TabsTrigger>
          <TabsTrigger value="defaults">
            Textos padrão não customizados ({uncustomizedDefaults.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="custom" className="mt-4">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Carregando...
              </CardContent>
            </Card>
          ) : filteredContent.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum conteúdo encontrado</p>
                <p className="text-sm mt-2">Crie um novo conteúdo ou personalize os textos padrão</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredContent.map(item => (
                <Card key={item.id} className={cn(
                  "transition-opacity",
                  item.status === 'inativo' && "opacity-60"
                )}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                            {item.chave}
                          </code>
                          <Badge variant={item.status === 'ativo' ? 'default' : 'secondary'}>
                            {item.status}
                          </Badge>
                          <Badge variant="outline">{item.pagina}</Badge>
                          {item.secao && <Badge variant="outline">{item.secao}</Badge>}
                        </div>
                        {item.descricao && (
                          <p className="text-sm text-muted-foreground mb-2">{item.descricao}</p>
                        )}
                        <p className="text-sm text-foreground line-clamp-2">{item.texto}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(item.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="defaults" className="mt-4">
          {uncustomizedDefaults.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>Todos os textos padrão já foram personalizados!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {uncustomizedDefaults.map(([key, texto]) => (
                <Card key={key}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {key}
                          </code>
                          <Badge variant="outline">Padrão</Badge>
                        </div>
                        <p className="text-sm text-foreground line-clamp-2">{texto}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleCreateFromDefault(key, texto)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Personalizar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isNew ? 'Novo conteúdo' : 'Editar conteúdo'}
            </DialogTitle>
            <DialogDescription>
              {isNew 
                ? 'Crie um novo texto editável para o site' 
                : 'Altere o texto conforme necessário'}
            </DialogDescription>
          </DialogHeader>
          <ContentEditor
            content={editingContent}
            onSave={handleSave}
            onClose={() => setShowEditor(false)}
            isNew={isNew}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conteúdo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O texto voltará a usar o valor padrão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
