import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, RefreshCw, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface CompetitorMarketSearchProps {
  sellerId: string;
}

interface MarketSnapshot {
  id: string;
  snapshot_key: string;
  query_term: string | null;
  category_id: string | null;
  total_results: number;
  p10_price: number | null;
  p25_price: number | null;
  p50_price: number | null;
  p75_price: number | null;
  p90_price: number | null;
  min_price: number | null;
  max_price: number | null;
  avg_price: number | null;
  top_competitors_json: any[];
  collected_at: string;
  from_cache?: boolean;
}

export function CompetitorMarketSearch({ sellerId }: CompetitorMarketSearchProps) {
  const [queryTerm, setQueryTerm] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState('');
  const [shipping, setShipping] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<MarketSnapshot | null>(null);

  const handleSearch = async () => {
    if (!queryTerm.trim() && !categoryId.trim()) {
      toast.error('Informe um termo ou categoria');
      return;
    }

    setSearching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const filters: any = {};
      if (condition) filters.condition = condition;
      if (shipping) filters.shipping = shipping;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/market/search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seller_id: sellerId,
            query_term: queryTerm.trim() || undefined,
            category_id: categoryId.trim() || undefined,
            filters: Object.keys(filters).length > 0 ? filters : undefined,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setResult(data);
        if (data.from_cache) {
          toast.info('Resultado do cache (ainda válido)');
        } else {
          toast.success('Pesquisa concluída');
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro na pesquisa');
      }
    } catch (error) {
      console.error('Error searching:', error);
      toast.error('Erro ao pesquisar mercado');
    } finally {
      setSearching(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle>Pesquisar Mercado</CardTitle>
          <CardDescription>
            Analise a faixa de preços e concorrentes para um termo ou categoria
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="queryTerm">Termo de busca</Label>
              <Input
                id="queryTerm"
                placeholder="Ex: etiqueta térmica 40x60"
                value={queryTerm}
                onChange={(e) => setQueryTerm(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="categoryId">Categoria (opcional)</Label>
              <Input
                id="categoryId"
                placeholder="Ex: MLB123456"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Condição</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  <SelectItem value="new">Novo</SelectItem>
                  <SelectItem value="used">Usado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Envio</Label>
              <Select value={shipping} onValueChange={setShipping}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="full">Full (Fulfillment)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={searching} className="w-full">
                <Search className={`h-4 w-4 mr-2 ${searching ? 'animate-pulse' : ''}`} />
                {searching ? 'Pesquisando...' : 'Pesquisar'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Resultado da Pesquisa</span>
              {result.from_cache && (
                <Badge variant="outline">Cache</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {result.query_term && `Termo: "${result.query_term}"`}
              {result.category_id && ` | Categoria: ${result.category_id}`}
              {` | ${result.total_results} anúncios encontrados`}
              {` | Coletado: ${formatDate(result.collected_at)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Price Distribution */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Distribuição de Preços
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Mínimo</p>
                  <p className="font-semibold">{formatCurrency(result.min_price)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">P25</p>
                  <p className="font-semibold">{formatCurrency(result.p25_price)}</p>
                </div>
                <div className="p-3 bg-primary/10 rounded-lg text-center border-2 border-primary/30">
                  <p className="text-xs text-muted-foreground">Mediana (P50)</p>
                  <p className="font-bold text-primary">{formatCurrency(result.p50_price)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">P75</p>
                  <p className="font-semibold">{formatCurrency(result.p75_price)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Máximo</p>
                  <p className="font-semibold">{formatCurrency(result.max_price)}</p>
                </div>
              </div>
            </div>

            {/* Price Range Bar */}
            {result.min_price && result.max_price && result.p50_price && (
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm mb-2">Faixa de preço do mercado:</p>
                <div className="relative h-4 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-full">
                  <div 
                    className="absolute top-1/2 transform -translate-y-1/2 w-3 h-6 bg-white border-2 border-primary rounded-sm"
                    style={{ 
                      left: `${Math.min(100, Math.max(0, ((result.p50_price - result.min_price) / (result.max_price - result.min_price)) * 100))}%` 
                    }}
                    title={`Mediana: ${formatCurrency(result.p50_price)}`}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1 text-muted-foreground">
                  <span>{formatCurrency(result.min_price)}</span>
                  <span>{formatCurrency(result.max_price)}</span>
                </div>
              </div>
            )}

            {/* Top Competitors */}
            {result.top_competitors_json?.length > 0 && (
              <div>
                <h4 className="font-medium mb-3">Top Concorrentes</h4>
                <div className="space-y-2">
                  {result.top_competitors_json.map((comp: any, idx: number) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {comp.thumbnail && (
                          <img src={comp.thumbnail} alt="" className="w-10 h-10 object-cover rounded" />
                        )}
                        <div>
                          <p className="font-medium text-sm truncate max-w-[300px]">{comp.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{comp.seller_nickname || 'Vendedor'}</span>
                            {comp.shipping_full && <Badge className="text-xs bg-green-600">Full</Badge>}
                            {comp.shipping_free && <Badge variant="outline" className="text-xs">Frete Grátis</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(comp.price)}</p>
                        {comp.sold_quantity > 0 && (
                          <p className="text-xs text-muted-foreground">{comp.sold_quantity} vendidos</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
