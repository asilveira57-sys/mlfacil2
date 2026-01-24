import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useBlog } from '@/hooks/useBlog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { BlogCategory } from '@/types/blog';

type ArticleType = 'educacional' | 'tecnico' | 'comparativo' | 'guia';

interface GenerationResult {
  success: boolean;
  post?: {
    id: string;
    titulo: string;
    slug: string;
    status: string;
  };
  message?: string;
  error?: string;
}

export function BlogArticleGenerator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { fetchCategories } = useBlog();
  
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  
  // Form state
  const [tema, setTema] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [palavraChavePrincipal, setPalavraChavePrincipal] = useState('');
  const [palavrasChaveSecundarias, setPalavrasChaveSecundarias] = useState('');
  const [tipoArtigo, setTipoArtigo] = useState<ArticleType>('educacional');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const data = await fetchCategories();
    setCategories(data);
  };

  const handleGenerate = async () => {
    if (!tema.trim() || !categoriaId || !palavraChavePrincipal.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha tema, categoria e palavra-chave principal.',
        variant: 'destructive'
      });
      return;
    }

    setIsGenerating(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('blog-generate-article', {
        body: {
          tema: tema.trim(),
          categoria_id: categoriaId,
          palavra_chave_principal: palavraChavePrincipal.trim(),
          palavras_chave_secundarias: palavrasChaveSecundarias
            .split(',')
            .map(k => k.trim())
            .filter(Boolean),
          tipo_artigo: tipoArtigo
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      setResult(data);

      if (data.success) {
        toast({
          title: 'Artigo gerado!',
          description: 'O artigo foi criado como rascunho.'
        });
        // Clear form
        setTema('');
        setPalavraChavePrincipal('');
        setPalavrasChaveSecundarias('');
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      setResult({
        success: false,
        error: error.message || 'Erro ao gerar artigo'
      });
      toast({
        title: 'Erro na geração',
        description: error.message || 'Erro ao gerar artigo',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const articleTypes: { value: ArticleType; label: string; description: string }[] = [
    { 
      value: 'educacional', 
      label: 'Educacional', 
      description: 'Ensina conceitos de forma clara e progressiva' 
    },
    { 
      value: 'tecnico', 
      label: 'Técnico', 
      description: 'Aprofunda detalhes técnicos com precisão' 
    },
    { 
      value: 'comparativo', 
      label: 'Comparativo', 
      description: 'Compara opções com prós e contras' 
    },
    { 
      value: 'guia', 
      label: 'Guia Prático', 
      description: 'Passo-a-passo acionável' 
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerador de Artigos com IA
          </CardTitle>
          <CardDescription>
            Gere artigos completos, estruturados e otimizados para SEO. 
            Todos os artigos são criados como rascunho para revisão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Tema */}
          <div className="space-y-2">
            <Label htmlFor="tema">Tema Principal *</Label>
            <Textarea
              id="tema"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="Descreva o tema do artigo com detalhes. Quanto mais contexto, melhor o resultado."
              rows={3}
              disabled={isGenerating}
            />
            <p className="text-xs text-muted-foreground">
              Exemplo: "Como otimizar anúncios no Mercado Livre para aumentar conversão em categorias competitivas"
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Categoria */}
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Crie categorias primeiro na aba Categorias
                </p>
              )}
            </div>

            {/* Tipo de Artigo */}
            <div className="space-y-2">
              <Label>Tipo de Artigo</Label>
              <Select value={tipoArtigo} onValueChange={(v) => setTipoArtigo(v as ArticleType)} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {articleTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex flex-col">
                        <span>{type.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {articleTypes.find(t => t.value === tipoArtigo)?.description}
              </p>
            </div>
          </div>

          {/* Palavras-chave */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="keyword">Palavra-chave Principal *</Label>
              <Input
                id="keyword"
                value={palavraChavePrincipal}
                onChange={(e) => setPalavraChavePrincipal(e.target.value)}
                placeholder="ex: otimizar anúncios mercado livre"
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keywords-secondary">Palavras-chave Secundárias</Label>
              <Input
                id="keywords-secondary"
                value={palavrasChaveSecundarias}
                onChange={(e) => setPalavrasChaveSecundarias(e.target.value)}
                placeholder="ex: SEO marketplace, conversão, vendas"
                disabled={isGenerating}
              />
              <p className="text-xs text-muted-foreground">
                Separe por vírgula
              </p>
            </div>
          </div>

          {/* Info box */}
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertTitle>O que será gerado</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Artigo completo com introdução, desenvolvimento e conclusão</li>
                <li>Meta title (até 60 caracteres)</li>
                <li>Meta description (até 155 caracteres)</li>
                <li>Slug otimizado baseado na palavra-chave</li>
                <li>Tags relevantes</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Generate Button */}
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !tema.trim() || !categoriaId || !palavraChavePrincipal.trim()}
            size="lg"
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando artigo... (pode levar até 30s)
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar Artigo
              </>
            )}
          </Button>

          {/* Result */}
          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'}>
              {result.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertTitle>
                {result.success ? 'Artigo gerado com sucesso!' : 'Erro na geração'}
              </AlertTitle>
              <AlertDescription>
                {result.success && result.post ? (
                  <div className="mt-2 space-y-2">
                    <p><strong>Título:</strong> {result.post.titulo}</p>
                    <p><strong>Slug:</strong> /{result.post.slug}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Badge variant="secondary">Rascunho</Badge>
                      <Button 
                        size="sm" 
                        onClick={() => navigate(`/admin/blog/${result.post!.id}`)}
                      >
                        Editar Artigo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p>{result.error || 'Erro desconhecido'}</p>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Usage Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dicas para Melhores Resultados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>Tema detalhado:</strong> Quanto mais contexto você fornecer no tema, 
            mais específico e útil será o artigo gerado.
          </p>
          <p>
            <strong>Palavra-chave estratégica:</strong> Escolha uma palavra-chave que 
            seu público realmente busca. Use ferramentas de SEO para pesquisar.
          </p>
          <p>
            <strong>Revise sempre:</strong> O artigo é salvo como rascunho. 
            Revise, ajuste e personalize antes de publicar.
          </p>
          <p>
            <strong>Evite duplicação:</strong> Cada artigo gerado é único, mas 
            evite temas muito similares para não competir consigo mesmo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
