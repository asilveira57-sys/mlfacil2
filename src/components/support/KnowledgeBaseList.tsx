/**
 * Knowledge Base List
 * Articles and guides searchable list
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Search,
  BookOpen,
  FileText,
  ThumbsUp,
  ThumbsDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Article {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  category: string;
  tags: string[] | null;
  view_count: number | null;
  helpful_count: number | null;
  not_helpful_count: number | null;
}

interface KnowledgeBaseListProps {
  onOpenChat?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Primeiros Passos',
  'features': 'Funcionalidades',
  'integrations': 'Integrações',
  'billing': 'Faturamento',
  'troubleshooting': 'Resolução de Problemas',
  'faq': 'Perguntas Frequentes',
};

export function KnowledgeBaseList({ onOpenChat }: KnowledgeBaseListProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  useEffect(() => {
    const fetchArticles = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('knowledge_base_articles')
          .select('*')
          .eq('is_published', true)
          .order('view_count', { ascending: false });

        if (error) throw error;
        setArticles(data || []);
      } catch (error) {
        console.error('[KnowledgeBase] Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, []);

  const filteredArticles = articles.filter(article =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const groupedArticles = filteredArticles.reduce((acc, article) => {
    const category = article.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(article);
    return acc;
  }, {} as Record<string, Article[]>);

  const handleArticleClick = async (article: Article) => {
    setSelectedArticle(article);
    
    // Increment view count
    await supabase
      .from('knowledge_base_articles')
      .update({ view_count: (article.view_count || 0) + 1 })
      .eq('id', article.id);
  };

  const handleFeedback = async (helpful: boolean) => {
    if (!selectedArticle) return;

    try {
      const field = helpful ? 'helpful_count' : 'not_helpful_count';
      const currentCount = helpful ? selectedArticle.helpful_count : selectedArticle.not_helpful_count;
      
      await supabase
        .from('knowledge_base_articles')
        .update({ [field]: (currentCount || 0) + 1 })
        .eq('id', selectedArticle.id);

      toast({
        title: 'Obrigado pelo feedback!',
        description: helpful 
          ? 'Ficamos felizes que o artigo foi útil.' 
          : 'Vamos melhorar este conteúdo.',
      });
    } catch (error) {
      console.error('[KnowledgeBase] Feedback error:', error);
    }
  };

  if (selectedArticle) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedArticle(null)}>
              ← Voltar
            </Button>
          </div>
          <Badge variant="secondary" className="w-fit mb-2">
            {CATEGORY_LABELS[selectedArticle.category] || selectedArticle.category}
          </Badge>
          <CardTitle>{selectedArticle.title}</CardTitle>
          {selectedArticle.summary && (
            <CardDescription>{selectedArticle.summary}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div 
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
            />
          </ScrollArea>
          
          <div className="mt-6 pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-3">Este artigo foi útil?</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => handleFeedback(true)}>
                <ThumbsUp className="h-4 w-4" />
                Sim
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => handleFeedback(false)}>
                <ThumbsDown className="h-4 w-4" />
                Não
              </Button>
            </div>
          </div>

          {selectedArticle.tags && selectedArticle.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1">
              {selectedArticle.tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Base de Conhecimento
            </CardTitle>
            <CardDescription>
              Artigos, guias e tutoriais para te ajudar
            </CardDescription>
          </div>
          {onOpenChat && (
            <Button variant="outline" size="sm" className="gap-2" onClick={onOpenChat}>
              <Sparkles className="h-4 w-4" />
              Perguntar à IA
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar artigos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : Object.keys(groupedArticles).length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {searchQuery 
                ? 'Nenhum artigo encontrado para sua busca' 
                : 'Nenhum artigo disponível ainda'
              }
            </p>
            {onOpenChat && (
              <Button variant="outline" className="mt-4 gap-2" onClick={onOpenChat}>
                <Sparkles className="h-4 w-4" />
                Pergunte à IA
              </Button>
            )}
          </div>
        ) : (
          <Accordion type="multiple" className="w-full">
            {Object.entries(groupedArticles).map(([category, categoryArticles]) => (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{CATEGORY_LABELS[category] || category}</span>
                    <Badge variant="secondary" className="ml-2">
                      {categoryArticles.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-1 pl-6">
                    {categoryArticles.map(article => (
                      <button
                        key={article.id}
                        className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between group"
                        onClick={() => handleArticleClick(article)}
                      >
                        <div>
                          <p className="font-medium text-sm">{article.title}</p>
                          {article.summary && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {article.summary}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                      </button>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
