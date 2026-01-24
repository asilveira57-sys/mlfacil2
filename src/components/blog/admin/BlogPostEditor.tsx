import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Eye, Calendar, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBlog } from '@/hooks/useBlog';
import { validateSeoBeforePublish } from '@/types/blog';
import type { BlogPost, BlogCategory, BlogPostStatus, BlogPostInsert, BlogPostUpdate } from '@/types/blog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function BlogPostEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = id === 'novo';
  
  const { fetchPostById, createPost, updatePost, fetchCategories, loading } = useBlog();
  
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [activeTab, setActiveTab] = useState('conteudo');
  const [seoErrors, setSeoErrors] = useState<string[]>([]);
  
  // Form state
  const [formData, setFormData] = useState<Partial<BlogPost>>({
    titulo: '',
    resumo: '',
    conteudo_principal: '',
    imagem_capa: '',
    status: 'rascunho',
    autor: '',
    categoria_id: null,
    tags: [],
    data_agendada: null,
    meta_title: '',
    meta_description: '',
    meta_keywords: '',
    canonical_url: ''
  });
  
  const [tagsInput, setTagsInput] = useState('');
  const [originalPost, setOriginalPost] = useState<BlogPost | null>(null);

  useEffect(() => {
    loadCategories();
    if (!isNew && id) {
      loadPost(id);
    }
  }, [id, isNew]);

  const loadCategories = async () => {
    const data = await fetchCategories();
    setCategories(data);
  };

  const loadPost = async (postId: string) => {
    const post = await fetchPostById(postId);
    if (post) {
      setOriginalPost(post);
      setFormData(post);
      setTagsInput(post.tags?.join(', ') || '');
    }
  };

  const handleChange = (field: keyof BlogPost, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (newStatus?: BlogPostStatus) => {
    const statusToSave = newStatus || formData.status;
    
    // Validate SEO before publishing
    if (statusToSave === 'publicado') {
      const validation = validateSeoBeforePublish(formData as BlogPost);
      if (!validation.isValid) {
        setSeoErrors(validation.errors);
        setActiveTab('seo');
        return;
      }
    }
    
    setSeoErrors([]);
    
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    
    const payload: BlogPostInsert | BlogPostUpdate = {
      ...formData,
      tags,
      status: statusToSave
    };
    
    let result;
    if (isNew) {
      result = await createPost(payload as BlogPostInsert);
    } else if (id) {
      result = await updatePost(id, payload as BlogPostUpdate);
    }
    
    if (result) {
      navigate('/admin/blog');
    }
  };

  const canEditSlug = !originalPost || originalPost.status !== 'publicado';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/blog')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">
              {isNew ? 'Novo Post' : 'Editar Post'}
            </h2>
            {!isNew && originalPost && (
              <p className="text-muted-foreground text-sm">
                Slug: /{originalPost.slug}
                {!canEditSlug && (
                  <Badge variant="secondary" className="ml-2">Slug bloqueado</Badge>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {formData.status === 'publicado' && (
            <Button variant="outline" onClick={() => window.open(`/blog/${originalPost?.slug}`, '_blank')}>
              <Eye className="h-4 w-4 mr-2" />
              Ver
            </Button>
          )}
          <Button variant="outline" onClick={() => handleSave()} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Rascunho
          </Button>
          {formData.status !== 'publicado' && (
            <Button onClick={() => handleSave('publicado')} disabled={loading}>
              Publicar
            </Button>
          )}
        </div>
      </div>

      {/* SEO Errors */}
      {seoErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {seoErrors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Editor Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="conteudo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Conteúdo do Post</CardTitle>
              <CardDescription>Título, resumo e conteúdo principal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título *</Label>
                <Input
                  id="titulo"
                  value={formData.titulo || ''}
                  onChange={(e) => handleChange('titulo', e.target.value)}
                  placeholder="Digite o título do post"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resumo">Resumo</Label>
                <Textarea
                  id="resumo"
                  value={formData.resumo || ''}
                  onChange={(e) => handleChange('resumo', e.target.value)}
                  placeholder="Breve resumo do post (aparece na listagem)"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="conteudo">Conteúdo Principal</Label>
                <Textarea
                  id="conteudo"
                  value={formData.conteudo_principal || ''}
                  onChange={(e) => handleChange('conteudo_principal', e.target.value)}
                  placeholder="Conteúdo completo do post (suporta Markdown)"
                  rows={15}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Suporta Markdown para formatação
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="imagem_capa">URL da Imagem de Capa</Label>
                <Input
                  id="imagem_capa"
                  value={formData.imagem_capa || ''}
                  onChange={(e) => handleChange('imagem_capa', e.target.value)}
                  placeholder="https://exemplo.com/imagem.jpg"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEO Tab */}
        <TabsContent value="seo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Otimização para Buscadores</CardTitle>
              <CardDescription>
                Campos obrigatórios para publicação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meta_title">
                  Meta Título *
                  <span className="text-muted-foreground ml-2">
                    ({(formData.meta_title || '').length}/60)
                  </span>
                </Label>
                <Input
                  id="meta_title"
                  value={formData.meta_title || ''}
                  onChange={(e) => handleChange('meta_title', e.target.value)}
                  placeholder="Título para mecanismos de busca"
                  maxLength={60}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta_description">
                  Meta Descrição *
                  <span className="text-muted-foreground ml-2">
                    ({(formData.meta_description || '').length}/160)
                  </span>
                </Label>
                <Textarea
                  id="meta_description"
                  value={formData.meta_description || ''}
                  onChange={(e) => handleChange('meta_description', e.target.value)}
                  placeholder="Descrição para mecanismos de busca"
                  rows={3}
                  maxLength={160}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta_keywords">Palavras-chave</Label>
                <Input
                  id="meta_keywords"
                  value={formData.meta_keywords || ''}
                  onChange={(e) => handleChange('meta_keywords', e.target.value)}
                  placeholder="keyword1, keyword2, keyword3"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="canonical_url">URL Canônica</Label>
                <Input
                  id="canonical_url"
                  value={formData.canonical_url || ''}
                  onChange={(e) => handleChange('canonical_url', e.target.value)}
                  placeholder="https://seusite.com/blog/post-slug"
                />
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para usar a URL padrão do post
                </p>
              </div>

              {/* SEO Preview */}
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Preview no Google:</p>
                <div className="space-y-1">
                  <p className="text-blue-600 text-lg hover:underline cursor-pointer">
                    {formData.meta_title || formData.titulo || 'Título do Post'}
                  </p>
                  <p className="text-green-700 text-sm">
                    mlfacil2.lovable.app/blog/{originalPost?.slug || 'seu-post'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formData.meta_description || formData.resumo || 'Descrição do post aparecerá aqui...'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="configuracoes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configurações do Post</CardTitle>
              <CardDescription>Categoria, tags, autor e agendamento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(v) => handleChange('status', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="publicado">Publicado</SelectItem>
                      <SelectItem value="arquivado">Arquivado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={formData.categoria_id || 'none'}
                    onValueChange={(v) => handleChange('categoria_id', v === 'none' ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="autor">Autor</Label>
                <Input
                  id="autor"
                  value={formData.autor || ''}
                  onChange={(e) => handleChange('autor', e.target.value)}
                  placeholder="Nome do autor"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="tag1, tag2, tag3"
                />
                <p className="text-xs text-muted-foreground">
                  Separe as tags por vírgula
                </p>
              </div>

              <div className="space-y-2">
                <Label>Agendar Publicação</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <Calendar className="h-4 w-4 mr-2" />
                      {formData.data_agendada 
                        ? format(new Date(formData.data_agendada), "PPP", { locale: ptBR })
                        : 'Selecionar data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent
                      mode="single"
                      selected={formData.data_agendada ? new Date(formData.data_agendada) : undefined}
                      onSelect={(date) => handleChange('data_agendada', date?.toISOString() || null)}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  O post será publicado automaticamente na data selecionada
                </p>
              </div>

              {/* Automation info (read-only) */}
              {!isNew && originalPost && (
                <div className="pt-4 border-t space-y-2">
                  <p className="text-sm font-medium">Informações de Automação</p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div>Origem: <Badge variant="outline">{originalPost.origem}</Badge></div>
                    {originalPost.modulo_vinculado && (
                      <div>Módulo: {originalPost.modulo_vinculado}</div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
