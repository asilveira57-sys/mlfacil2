import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrendingUp, Search, Package, ExternalLink, Tag, RefreshCw } from 'lucide-react';
import { useMarketTrends, useMarketHighlights } from '@/hooks/useTrendsApi';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Common ML categories - aligned with backend POPULAR_CATEGORIES
const CATEGORIES = [
  { id: 'all', label: 'Todas (Geral)' },
  { id: 'MLB5672', label: 'Acessórios para Veículos' },
  { id: 'MLB1384', label: 'Bebês' },
  { id: 'MLB1574', label: 'Casa, Móveis e Decoração' },
  { id: 'MLB1051', label: 'Celulares e Telefones' },
  { id: 'MLB1648', label: 'Computadores' },
  { id: 'MLB1144', label: 'Eletrodomésticos' },
  { id: 'MLB1000', label: 'Eletrônicos' },
  { id: 'MLB1276', label: 'Esportes e Fitness' },
  { id: 'MLB263532', label: 'Ferramentas' },
  { id: 'MLB1499', label: 'Indústria e Comércio' },
  { id: 'MLB1182', label: 'Instrumentos Musicais' },
  { id: 'MLB3937', label: 'Joias e Relógios' },
  { id: 'MLB1196', label: 'Livros, Revistas e Comics' },
  { id: 'MLB1168', label: 'Música, Filmes e Seriados' },
  { id: 'MLB264586', label: 'Saúde' },
  { id: 'MLB1430', label: 'Roupas e Acessórios' },
];

export function TrendsMarketTab() {
  const [categoryId, setCategoryId] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);

  const actualCategoryId = categoryId === 'all' ? undefined : categoryId;
  const { data: trends, isLoading: trendsLoading } = useMarketTrends('MLB', actualCategoryId);
  const { data: highlights, isLoading: highlightsLoading, refetch: refetchHighlights } = useMarketHighlights('MLB', actualCategoryId);

  const filteredTrends = trends?.trends?.filter(t => 
    !searchKeyword || t.keyword.toLowerCase().includes(searchKeyword.toLowerCase())
  ) || [];

  const handleCollectHighlights = async () => {
    if (!categoryId || categoryId === 'all') return;
    
    setIsCollecting(true);
    try {
      const { error } = await supabase.functions.invoke('trends-collect-public', {
        body: {
          site_id: 'MLB',
          category_id: categoryId,
          collect_type: 'highlights'
        }
      });
      
      if (error) throw error;
      
      toast.success('Coleta iniciada! Aguarde alguns segundos e atualize a página.');
      
      // Refetch after a delay
      setTimeout(() => {
        refetchHighlights();
        setIsCollecting(false);
      }, 5000);
    } catch (err) {
      console.error('Error collecting highlights:', err);
      toast.error('Erro ao coletar mais vendidos');
      setIsCollecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Selecione uma categoria" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar tendências..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trends Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                Em Alta
              </div>
              {trends?.snapshot_date && (
                <Badge variant="outline" className="text-xs font-normal">
                  {new Date(trends.snapshot_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : trends?.message ? (
              <div className="text-center py-8">
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{trends.message}</p>
              </div>
            ) : filteredTrends.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-4">
                  {filteredTrends.map((trend, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <span className="text-lg font-bold text-primary w-8 text-center">
                        {idx + 1}
                      </span>
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{trend.keyword}</span>
                      {trend.url && (
                        <a
                          href={trend.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Nenhuma tendência encontrada
              </p>
            )}
          </CardContent>
        </Card>

        {/* Highlights Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-green-500" />
                Mais Vendidos
              </div>
              <div className="flex items-center gap-2">
                {highlights?.snapshot_date && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {new Date(highlights.snapshot_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </Badge>
                )}
                {categoryId !== 'all' && !highlightsLoading && !highlights?.items?.length && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleCollectHighlights}
                    disabled={isCollecting}
                    className="h-7 text-xs"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${isCollecting ? 'animate-spin' : ''}`} />
                    Coletar
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryId === 'all' ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Selecione uma categoria para ver os mais vendidos</p>
              </div>
            ) : highlightsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : highlights?.message ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{highlights.message}</p>
              </div>
            ) : highlights?.items?.length ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-4">
                  {highlights.items.map((item) => (
                    <div 
                      key={item.item_id} 
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <span className="text-lg font-bold text-green-500 w-8 text-center">
                        {item.rank}
                      </span>
                      {item.thumbnail && (
                        <img 
                          src={item.thumbnail} 
                          alt="" 
                          className="w-12 h-12 rounded object-cover border border-border"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {item.price && (
                            <Badge variant="outline" className="text-xs">
                              R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </Badge>
                          )}
                          {item.sold_quantity && (
                            <span className="text-xs text-muted-foreground">
                              {item.sold_quantity.toLocaleString('pt-BR')} vendidos
                            </span>
                          )}
                        </div>
                      </div>
                      {item.permalink && (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Nenhum item encontrado
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Keywords (if available) */}
      {trends?.keywords && trends.keywords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-blue-500" />
              Palavras-chave em Alta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {trends.keywords.map((kw, idx) => (
                <Badge key={idx} variant="secondary" className="text-sm py-1 px-3">
                  {kw.keyword}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
