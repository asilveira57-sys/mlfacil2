import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Eye, Calendar, AlertCircle, Sparkles, Wand2,
  Upload, CheckCircle2, AlertTriangle, ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBlog } from '@/hooks/useBlog';
import { useBlogAI } from '@/hooks/useBlogAI';
import { supabase } from '@/integrations/supabase/client';
import {
  validateSeoBeforePublish, readingTimeMin, countWords,
} from '@/types/blog';
import type { BlogPost, BlogCategory, BlogPostStatus, BlogPostInsert, BlogPostUpdate } from '@/types/blog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RichTextEditor } from './RichTextEditor';
import { toast } from 'sonner';

interface AuditState {
  score: number;
  problemas: string[];
  sugestoes: string[];
  pontos_fortes: string[];
}

export function BlogPostEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = id === 'novo';

  const { fetchPostById, createPost, updatePost, fetchCategories, loading } = useBlog();
  const ai = useBlogAI();

  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [activeTab, setActiveTab] = useState('conteudo');
  const [seoErrors, setSeoErrors] = useState<string[]>([]);
  const [audit, setAudit] = useState<AuditState | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [formData, setFormData] = useState<Partial<BlogPost>>({
    titulo: '',
    resumo: '',
    conteudo_principal: '',
    imagem_capa: '',
    imagem_capa_alt: '',
    status: 'rascunho',
    autor: '',
    categoria_id: null,
    tags: [],
    data_agendada: null,
    meta_title: '',
    meta_description: '',
    meta_keywords: '',
    canonical_url: '',
    tempo_leitura_min: null,
    seo_score: null,
  });

  const [tagsInput, setTagsInput] = useState('');
  const [originalPost, setOriginalPost] = useState<BlogPost | null>(null);

  useEffect(() => {
    fetchCategories().then(setCategories);
    if (!isNew && id) {
      fetchPostById(id).then((post) => {
        if (post) {
          setOriginalPost(post);
          setFormData(post);
          setTagsInput(post.tags?.join(', ') || '');
          if (post.seo_score != null) {
            setAudit({ score: post.seo_score, problemas: [], sugestoes: [], pontos_fortes: [] });
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  const wordCount = useMemo(() => countWords(formData.conteudo_principal || ''), [formData.conteudo_principal]);
  const readingTime = useMemo(() => readingTimeMin(formData.conteudo_principal || ''), [formData.conteudo_principal]);

  const handleChange = (field: keyof BlogPost, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (newStatus?: BlogPostStatus) => {
    const statusToSave = newStatus || formData.status;

    if (statusToSave === 'publicado') {
      const validation = validateSeoBeforePublish(formData as BlogPost);
      if (!validation.isValid) {
        setSeoErrors(validation.errors);
        setActiveTab('seo');
        return;
      }
      if (formData.imagem_capa && !formData.imagem_capa_alt) {
        setSeoErrors(['Texto alternativo (alt) da imagem de capa é obrigatório.']);
        setActiveTab('conteudo');
        return;
      }
    }

    setSeoErrors([]);
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);

    const payload: BlogPostInsert | BlogPostUpdate = {
      ...formData,
      tags,
      status: statusToSave,
      tempo_leitura_min: readingTime,
    };

    const result = isNew
      ? await createPost(payload as BlogPostInsert)
      : id ? await updatePost(id, payload as BlogPostUpdate) : null;

    if (result) navigate('/admin/blog');
  };

  const handleAutoSEO = async () => {
    const meta = await ai.generateMeta({
      titulo: formData.titulo, resumo: formData.resumo || '', conteudo: formData.conteudo_principal || '',
    });
    if (meta) {
      setFormData((prev) => ({
        ...prev,
        meta_title: meta.meta_title?.slice(0, 60) || prev.meta_title,
        meta_description: meta.meta_description?.slice(0, 160) || prev.meta_description,
        meta_keywords: meta.meta_keywords || prev.meta_keywords,
      }));
      toast.success('Meta tags geradas pela IA.');
    }
  };

  const handleGenerateAlt = async () => {
    if (!formData.imagem_capa) {
      toast.error('Adicione a imagem de capa primeiro.');
      return;
    }
    const res = await ai.generateAlt({ imagem_url: formData.imagem_capa, contexto: formData.titulo });
    if (res?.alt) {
      handleChange('imagem_capa_alt', res.alt.slice(0, 125));
      toast.success('Alt gerado pela IA.');
    }
  };

  const generateAltForEditorImage = async (url: string): Promise<string> => {
    const res = await ai.generateAlt({ imagem_url: url, contexto: formData.titulo });
    return res?.alt?.slice(0, 125) || '';
  };

  const handleSeoAudit = async () => {
    const res = await ai.seoAudit({
      titulo: formData.titulo, resumo: formData.resumo || '',
      conteudo: formData.conteudo_principal || '', contexto: formData.meta_title || '',
    });
    if (res) {
      setAudit(res);
      handleChange('seo_score', res.score);
      toast.success(`Auditoria SEO concluída — score ${res.score}/100`);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('blog-media').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('blog-media').getPublicUrl(path);
      handleChange('imagem_capa', data.publicUrl);
      toast.success('Capa carregada.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha no upload';
      toast.error(message);
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  const canEditSlug = !originalPost || originalPost.status !== 'publicado';
  const scoreColor = audit ? (audit.score >= 80 ? 'text-green-600' : audit.score >= 50 ? 'text-yellow-600' : 'text-red-600') : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/blog')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{isNew ? 'Novo Post' : 'Editar Post'}</h2>
            {!isNew && originalPost && (
              <p className="text-muted-foreground text-sm">
                Slug: /{originalPost.slug}
                {!canEditSlug && <Badge variant="secondary" className="ml-2">Slug bloqueado</Badge>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{wordCount} palavras</Badge>
          <Badge variant="outline">{readingTime} min de leitura</Badge>
          {audit && <Badge className={scoreColor} variant="outline">SEO: {audit.score}/100</Badge>}
          {formData.status === 'publicado' && originalPost && (
            <Button variant="outline" onClick={() => window.open(`/blog/${originalPost.slug}`, '_blank')}>
              <Eye className="h-4 w-4 mr-2" /> Ver
            </Button>
          )}
          <Button variant="outline" onClick={() => handleSave()} disabled={loading}>
            <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
          </Button>
          {formData.status !== 'publicado' && (
            <Button onClick={() => handleSave('publicado')} disabled={loading}>Publicar</Button>
          )}
        </div>
      </div>

      {seoErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {seoErrors.map((error, i) => <li key={i}>{error}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>
          <TabsTrigger value="seo">SEO + IA</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
        </TabsList>

        {/* Conteúdo */}
        <TabsContent value="conteudo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Conteúdo do Post</CardTitle>
              <CardDescription>Editor rich text com suporte a imagens, vídeos e atalhos do Word/Docs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título *</Label>
                <Input id="titulo" value={formData.titulo || ''} onChange={(e) => handleChange('titulo', e.target.value)} placeholder="Digite o título do post" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resumo">Resumo</Label>
                <Textarea id="resumo" value={formData.resumo || ''} onChange={(e) => handleChange('resumo', e.target.value)} placeholder="Breve resumo do post (aparece na listagem)" rows={3} />
              </div>

              <div className="space-y-2">
                <Label>Imagem de Capa</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={formData.imagem_capa || ''}
                    onChange={(e) => handleChange('imagem_capa', e.target.value)}
                    placeholder="URL da imagem ou faça upload"
                  />
                  <label>
                    <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                    <Button type="button" variant="outline" asChild disabled={uploadingCover}>
                      <span><Upload className="h-4 w-4 mr-2" />{uploadingCover ? 'Enviando…' : 'Upload'}</span>
                    </Button>
                  </label>
                </div>
                {formData.imagem_capa && (
                  <div className="aspect-video w-full max-w-md overflow-hidden rounded-md border bg-muted">
                    <img src={formData.imagem_capa} alt={formData.imagem_capa_alt || ''} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                  <div className="flex-1 space-y-2 w-full">
                    <Label htmlFor="imagem_capa_alt">
                      Texto alternativo (alt) da capa *
                      <span className="text-muted-foreground ml-2">({(formData.imagem_capa_alt || '').length}/125)</span>
                    </Label>
                    <Input
                      id="imagem_capa_alt"
                      value={formData.imagem_capa_alt || ''}
                      onChange={(e) => handleChange('imagem_capa_alt', e.target.value.slice(0, 125))}
                      placeholder="Descreva a imagem para acessibilidade e SEO"
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={handleGenerateAlt} disabled={ai.loading === 'generate_alt' || !formData.imagem_capa}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {ai.loading === 'generate_alt' ? 'Gerando…' : 'Gerar alt com IA'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Conteúdo Principal</Label>
                <RichTextEditor
                  value={formData.conteudo_principal || ''}
                  onChange={(html) => handleChange('conteudo_principal', html)}
                  onGenerateAltForImage={generateAltForEditorImage}
                  placeholder="Comece a escrever ou cole conteúdo do Word/Docs/WordPress…"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEO + IA */}
        <TabsContent value="seo" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Otimização para Buscadores</CardTitle>
                <CardDescription>Use a IA para gerar e auditar suas meta tags</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" onClick={handleAutoSEO} disabled={ai.loading === 'generate_meta'}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  {ai.loading === 'generate_meta' ? 'Gerando…' : 'Auto-SEO ✨'}
                </Button>
                <Button variant="outline" onClick={handleSeoAudit} disabled={ai.loading === 'seo_audit'}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {ai.loading === 'seo_audit' ? 'Auditando…' : 'Auditar SEO'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meta_title">
                  Meta Título *
                  <span className="text-muted-foreground ml-2">({(formData.meta_title || '').length}/60)</span>
                </Label>
                <Input id="meta_title" value={formData.meta_title || ''} onChange={(e) => handleChange('meta_title', e.target.value)} placeholder="Título para mecanismos de busca" maxLength={60} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta_description">
                  Meta Descrição *
                  <span className="text-muted-foreground ml-2">({(formData.meta_description || '').length}/160)</span>
                </Label>
                <Textarea id="meta_description" value={formData.meta_description || ''} onChange={(e) => handleChange('meta_description', e.target.value)} placeholder="Descrição para mecanismos de busca" rows={3} maxLength={160} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta_keywords">Palavras-chave</Label>
                <Input id="meta_keywords" value={formData.meta_keywords || ''} onChange={(e) => handleChange('meta_keywords', e.target.value)} placeholder="keyword1, keyword2, keyword3" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="canonical_url">URL Canônica</Label>
                <Input id="canonical_url" value={formData.canonical_url || ''} onChange={(e) => handleChange('canonical_url', e.target.value)} placeholder="https://www.mktpfacil.com/blog/post-slug" />
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Preview no Google:</p>
                <div className="space-y-1">
                  <p className="text-blue-600 text-lg hover:underline cursor-pointer">{formData.meta_title || formData.titulo || 'Título do Post'}</p>
                  <p className="text-green-700 text-sm">www.mktpfacil.com/blog/{originalPost?.slug || 'seu-post'}</p>
                  <p className="text-sm text-muted-foreground">{formData.meta_description || formData.resumo || 'Descrição do post aparecerá aqui…'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auditoria SEO */}
          {audit && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Auditoria SEO</span>
                  <span className={scoreColor}>{audit.score}/100</span>
                </CardTitle>
                <Progress value={audit.score} className="mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                {audit.problemas?.length > 0 && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-yellow-600" />Problemas</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                      {audit.problemas.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
                {audit.sugestoes?.length > 0 && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-primary" />Sugestões</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                      {audit.sugestoes.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
                {audit.pontos_fortes?.length > 0 && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Pontos fortes</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                      {audit.pontos_fortes.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Configurações */}
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
                  <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="publicado">Publicado</SelectItem>
                      <SelectItem value="arquivado">Arquivado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={formData.categoria_id || 'none'} onValueChange={(v) => handleChange('categoria_id', v === 'none' ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categories.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="autor">Autor</Label>
                <Input id="autor" value={formData.autor || ''} onChange={(e) => handleChange('autor', e.target.value)} placeholder="Nome do autor" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input id="tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="tag1, tag2, tag3" />
                <p className="text-xs text-muted-foreground">Separe as tags por vírgula</p>
              </div>

              <div className="space-y-2">
                <Label>Agendar Publicação</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <Calendar className="h-4 w-4 mr-2" />
                      {formData.data_agendada
                        ? format(new Date(formData.data_agendada), 'PPP', { locale: ptBR })
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
                <p className="text-xs text-muted-foreground">O post será publicado automaticamente na data selecionada</p>
              </div>

              {!isNew && originalPost && (
                <div className="pt-4 border-t space-y-2">
                  <p className="text-sm font-medium">Informações de Automação</p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div>Origem: <Badge variant="outline">{originalPost.origem}</Badge></div>
                    {originalPost.modulo_vinculado && <div>Módulo: {originalPost.modulo_vinculado}</div>}
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
