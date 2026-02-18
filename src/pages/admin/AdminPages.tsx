import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ExternalLink, Pencil, Eye, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useSiteContentContext } from '@/contexts/SiteContentContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FrontPage {
  id: string;
  title: string;
  path: string;
  contentKey: string;
  description: string;
}

const FRONT_PAGES: FrontPage[] = [
  {
    id: 'termos',
    title: 'Termos de Uso',
    path: '/termos-de-uso',
    contentKey: 'termos.content',
    description: 'Termos e condições de uso da plataforma MKTP Fácil.'
  },
  {
    id: 'privacidade',
    title: 'Política de Privacidade',
    path: '/politica-de-privacidade',
    contentKey: 'privacidade.content',
    description: 'Política de tratamento de dados pessoais conforme LGPD.'
  },
  {
    id: 'cookies',
    title: 'Política de Cookies',
    path: '/politica-de-cookies',
    contentKey: 'cookies.content',
    description: 'Política de uso de cookies e tecnologias de rastreamento.'
  },
  {
    id: 'lgpd',
    title: 'LGPD',
    path: '/lgpd',
    contentKey: 'lgpd.content',
    description: 'Página sobre a Lei Geral de Proteção de Dados e conformidade.'
  }
];

export function AdminPages() {
  const navigate = useNavigate();
  const { getText, refresh } = useSiteContentContext();
  const [editingPage, setEditingPage] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [seoData, setSeoData] = useState<Record<string, { meta_title: string; meta_description: string; meta_keywords: string }>>({});

  // Load SEO data for all pages
  useEffect(() => {
    const loadSeo = async () => {
      const paths = FRONT_PAGES.map(p => p.path);
      const { data } = await supabase
        .from('seo_page_settings')
        .select('page_path, meta_title, meta_description, meta_keywords')
        .in('page_path', paths);

      if (data) {
        const map: typeof seoData = {};
        data.forEach(row => {
          map[row.page_path] = {
            meta_title: row.meta_title || '',
            meta_description: row.meta_description || '',
            meta_keywords: row.meta_keywords || ''
          };
        });
        setSeoData(map);
      }
    };
    loadSeo();
  }, []);

  const handleStartEdit = (page: FrontPage) => {
    const content = getText(page.contentKey);
    const hasContent = content !== page.contentKey;
    setEditValue(hasContent ? content : '');
    setEditingPage(page.id);
  };

  const handleSave = async (page: FrontPage) => {
    setSaving(true);
    try {
      const pagina = page.contentKey.split('.')[0];
      const secao = page.contentKey.split('.')[1] || 'content';

      const { error } = await supabase
        .from('site_content')
        .upsert({
          chave: page.contentKey,
          texto: editValue,
          pagina,
          secao,
          tipo: 'texto',
          status: 'ativo',
          updated_at: new Date().toISOString()
        }, { onConflict: 'chave' });

      if (error) throw error;
      await refresh();
      setEditingPage(null);
      toast.success(`${page.title} atualizada!`);
    } catch (error) {
      console.error('Error saving page:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSeo = async (page: FrontPage, field: string, value: string) => {
    try {
      const { error } = await supabase
        .from('seo_page_settings')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('page_path', page.path);

      if (error) throw error;
      setSeoData(prev => ({
        ...prev,
        [page.path]: { ...prev[page.path], [field]: value }
      }));
      toast.success('SEO atualizado!');
    } catch (error) {
      console.error('Error saving SEO:', error);
      toast.error('Erro ao salvar SEO');
    }
  };

  if (editingPage) {
    const page = FRONT_PAGES.find(p => p.id === editingPage)!;
    const seo = seoData[page.path] || { meta_title: '', meta_description: '', meta_keywords: '' };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{page.title}</h2>
            <p className="text-sm text-muted-foreground">{page.path}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditingPage(null)} disabled={saving}>
              Voltar
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(page.path, '_blank')}>
              <Eye className="w-4 h-4 mr-2" />
              Visualizar
            </Button>
            <Button size="sm" onClick={() => handleSave(page)} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar conteúdo'}
            </Button>
          </div>
        </div>

        {/* SEO Fields */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="w-4 h-4" />
              SEO da Página
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Meta Title (máx 60 caracteres)</label>
              <Input
                value={seo.meta_title}
                onChange={(e) => setSeoData(prev => ({ ...prev, [page.path]: { ...prev[page.path], meta_title: e.target.value } }))}
                onBlur={(e) => handleSaveSeo(page, 'meta_title', e.target.value)}
                maxLength={60}
              />
              <span className="text-xs text-muted-foreground">{seo.meta_title.length}/60</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Meta Description (máx 160 caracteres)</label>
              <Textarea
                value={seo.meta_description}
                onChange={(e) => setSeoData(prev => ({ ...prev, [page.path]: { ...prev[page.path], meta_description: e.target.value } }))}
                onBlur={(e) => handleSaveSeo(page, 'meta_description', e.target.value)}
                maxLength={160}
                rows={2}
              />
              <span className="text-xs text-muted-foreground">{seo.meta_description.length}/160</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Keywords (separadas por vírgula)</label>
              <Input
                value={seo.meta_keywords}
                onChange={(e) => setSeoData(prev => ({ ...prev, [page.path]: { ...prev[page.path], meta_keywords: e.target.value } }))}
                onBlur={(e) => handleSaveSeo(page, 'meta_keywords', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Content Editor */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Conteúdo da Página (Markdown)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              Use Markdown: # Título, ## Subtítulo, ### Sub-subtítulo, **negrito**, - item de lista
            </p>
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="min-h-[500px] font-mono text-sm"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Páginas do Front-end</h2>
        <p className="text-sm text-muted-foreground">Gerencie o conteúdo e SEO das páginas públicas da plataforma.</p>
      </div>

      <div className="grid gap-4">
        {FRONT_PAGES.map(page => {
          const content = getText(page.contentKey);
          const hasContent = content !== page.contentKey;
          const seo = seoData[page.path];

          return (
            <Card key={page.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">{page.title}</h3>
                      <p className="text-xs text-muted-foreground">{page.path}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={hasContent ? 'default' : 'secondary'} className="text-xs">
                      {hasContent ? 'Publicada' : 'Padrão'}
                    </Badge>
                    {seo && (
                      <Badge variant="outline" className="text-xs">
                        SEO ✓
                      </Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={() => window.open(page.path, '_blank')}>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={() => handleStartEdit(page)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Editar
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{page.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
