import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, RefreshCw, DollarSign, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';

interface CompetitorMarketSearchProps {
  sellerId: string;
}

interface MarketSnapshot {
  id?: string;
  snapshot_key?: string;
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
  // Extended stats for frontend fallback
  condition_counts?: Record<string, number>;
  shipping_counts?: Record<string, number>;
  bottom_10_prices?: number[];
  top_10_prices?: number[];
  iqr?: number;
}

interface BackendErrorResponse {
  error: boolean;
  error_code: string;
  httpStatus: number;
  message: string;
  request_id?: string;
  query_term?: string;
  category_id?: string;
  filters?: any;
}

// Browser cache for fallback results (10 minutes TTL)
const searchCache = new Map<string, { data: MarketSnapshot; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCacheKey(queryTerm: string, categoryId: string, condition: string, shipping: string): string {
  return `${queryTerm}|${categoryId}|${condition}|${shipping}`;
}

function calculateStats(prices: number[]): Partial<MarketSnapshot> {
  if (prices.length === 0) {
    return {
      min_price: null,
      max_price: null,
      avg_price: null,
      p10_price: null,
      p25_price: null,
      p50_price: null,
      p75_price: null,
      p90_price: null,
      iqr: 0,
      top_10_prices: [],
      bottom_10_prices: [],
    };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const len = sorted.length;

  const percentile = (p: number) => {
    const idx = (p / 100) * (len - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  };

  const sum = sorted.reduce((a, b) => a + b, 0);
  const p25 = percentile(25);
  const p75 = percentile(75);

  return {
    min_price: sorted[0],
    max_price: sorted[len - 1],
    avg_price: sum / len,
    p10_price: percentile(10),
    p25_price: p25,
    p50_price: percentile(50),
    p75_price: p75,
    p90_price: percentile(90),
    iqr: p75 - p25,
    top_10_prices: sorted.slice(-10).reverse(),
    bottom_10_prices: sorted.slice(0, 10),
  };
}

async function fetchViaProxy(
  sellerId: string,
  queryTerm: string,
  categoryId: string,
  condition: string,
  shipping: string,
  sessionToken: string
): Promise<MarketSnapshot> {
  const filters: any = {};
  if (condition && condition !== 'all') filters.condition = condition;
  if (shipping && shipping !== 'all') filters.shipping = shipping;

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/market/proxy-search`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
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

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.message || `Proxy error: ${response.status}`);
  }

  return data as MarketSnapshot;
}

// Direct browser-to-ML public API search (JSONP alternative using iframe/postMessage)
async function fetchViaPublicML(
  queryTerm: string,
  categoryId: string,
  condition: string,
  shipping: string
): Promise<MarketSnapshot> {
  // Build URL for public ML API
  const params = new URLSearchParams();
  if (queryTerm.trim()) params.set('q', queryTerm.trim());
  if (categoryId.trim()) params.set('category', categoryId.trim());
  params.set('limit', '50');
  
  if (condition && condition !== 'all') {
    params.set('ITEM_CONDITION', condition);
  }
  if (shipping === 'full') {
    params.set('shipping', 'fulfillment');
  }

  const searchUrl = `https://api.mercadolibre.com/sites/MLB/search?${params.toString()}`;
  
  // Try direct fetch (may work on some browsers/networks)
  const response = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`ML API error: ${response.status}`);
  }

  const data = await response.json();
  const results = data.results || [];
  const totalResults = data.paging?.total || results.length;

  // Extract prices and calculate stats
  const prices = results.map((r: any) => r.price).filter((p: number) => p > 0);
  const stats = calculateStats(prices);

  // Condition counts
  const conditionCounts: Record<string, number> = {};
  results.forEach((r: any) => {
    const cond = r.condition || 'unknown';
    conditionCounts[cond] = (conditionCounts[cond] || 0) + 1;
  });

  // Shipping counts
  const shippingCounts: Record<string, number> = { free: 0, full: 0, paid: 0 };
  results.forEach((r: any) => {
    if (r.shipping?.logistic_type === 'fulfillment') {
      shippingCounts.full++;
    } else if (r.shipping?.free_shipping) {
      shippingCounts.free++;
    } else {
      shippingCounts.paid++;
    }
  });

  // Top competitors
  const topCompetitors = results.slice(0, 10).map((r: any) => ({
    item_id: r.id,
    title: r.title,
    price: r.price,
    permalink: r.permalink,
    seller_id: r.seller?.id,
    seller_nickname: r.seller?.nickname,
    condition: r.condition,
    sold_quantity: r.sold_quantity || 0,
    shipping_free: r.shipping?.free_shipping || false,
    shipping_full: r.shipping?.logistic_type === 'fulfillment',
    thumbnail: r.thumbnail,
  }));

  return {
    query_term: queryTerm.trim() || null,
    category_id: categoryId.trim() || null,
    total_results: totalResults,
    ...stats,
    top_competitors_json: topCompetitors,
    collected_at: new Date().toISOString(),
    from_cache: false,
    condition_counts: conditionCounts,
    shipping_counts: shippingCounts,
  } as MarketSnapshot;
}

export function CompetitorMarketSearch({ sellerId }: CompetitorMarketSearchProps) {
  const [queryTerm, setQueryTerm] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState('all');
  const [shipping, setShipping] = useState('all');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<MarketSnapshot | null>(null);
  const [compatMode, setCompatMode] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSearch = async () => {
    if (!queryTerm.trim() && !categoryId.trim()) {
      toast.error('Informe um termo ou categoria');
      return;
    }

    // Check browser cache first
    const cacheKey = getCacheKey(queryTerm, categoryId, condition, shipping);
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setResult({ ...cached.data, from_cache: true });
      setCompatMode(cached.data.condition_counts !== undefined); // was from fallback
      setErrorState(null);
      toast.info('Resultado do cache local');
      return;
    }

    setSearching(true);
    setErrorState(null);
    setCompatMode(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada');
        return;
      }

      const filters: any = {};
      if (condition && condition !== 'all') filters.condition = condition;
      if (shipping && shipping !== 'all') filters.shipping = shipping;

      // Try backend first
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

      const data = await response.json();

      // Check if backend returned ML_FORBIDDEN_SEARCH error
      if (data.error && data.error_code === 'ML_FORBIDDEN_SEARCH') {
        console.warn('[CompetitorMarketSearch] Backend blocked, trying proxy fallback...');
        await handleProxyFallback(cacheKey, session.access_token);
        return;
      }

      // Check for other errors
      if (data.error) {
        throw new Error(data.message || 'Erro na pesquisa');
      }

      // Success from backend
      setResult(data);
      setCompatMode(false);

      // Cache the result
      searchCache.set(cacheKey, { data, timestamp: Date.now() });

      if (data.from_cache) {
        toast.info('Resultado do cache (ainda válido)');
      } else {
        toast.success('Pesquisa concluída');
      }
    } catch (error: any) {
      console.error('Error searching:', error);

      // Try proxy fallback on any error
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await handleProxyFallback(cacheKey, session.access_token);
        } else {
          throw new Error('Sessão expirada');
        }
      } catch (fallbackError: any) {
        console.error('Fallback also failed:', fallbackError);
        setErrorState(fallbackError.message || 'Erro na pesquisa. Tente novamente.');
        toast.error('Falha na pesquisa');
      }
    } finally {
      setSearching(false);
    }
  };

  const handleProxyFallback = async (cacheKey: string, sessionToken: string) => {
    // First try proxy
    try {
      toast.info('Tentando busca alternativa via proxy...');
      const fallbackResult = await fetchViaProxy(
        sellerId,
        queryTerm,
        categoryId,
        condition,
        shipping,
        sessionToken
      );
      setResult(fallbackResult);
      setCompatMode(true);
      setErrorState(null);

      // Cache the fallback result
      searchCache.set(cacheKey, { data: fallbackResult, timestamp: Date.now() });

      toast.success('Busca concluída (modo compatível)');
      return;
    } catch (proxyErr: any) {
      console.warn('[CompetitorMarketSearch] Proxy failed, trying direct browser fetch...', proxyErr.message);
    }
    
    // If proxy also fails, try direct browser-to-ML
    try {
      toast.info('Tentando busca direta do navegador...');
      const directResult = await fetchViaPublicML(
        queryTerm,
        categoryId,
        condition,
        shipping
      );
      setResult(directResult);
      setCompatMode(true);
      setErrorState(null);

      // Cache the result
      searchCache.set(cacheKey, { data: directResult, timestamp: Date.now() });

      toast.success('Busca concluída (modo direto)');
    } catch (directErr: any) {
      console.error('[CompetitorMarketSearch] Direct fetch also failed:', directErr);
      throw new Error('Servidor e navegador bloqueados pelo ML. Tente novamente mais tarde.');
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
      {/* Compat Mode Banner */}
      {compatMode && result && (
        <Alert className="bg-amber-500/10 border-amber-500/30">
          <Info className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            Busca em modo compatível — os dados foram obtidos diretamente do Mercado Livre.
          </AlertDescription>
        </Alert>
      )}

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
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
                  <SelectItem value="all">Todas</SelectItem>
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
                  <SelectItem value="all">Todos</SelectItem>
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

      {/* Error State */}
      {errorState && (
        <Card className="border-destructive/50">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="font-semibold mb-2">Erro na pesquisa</h3>
            <p className="text-muted-foreground mb-4">{errorState}</p>
            <Button onClick={handleSearch} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && !errorState && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Resultado da Pesquisa</span>
              <div className="flex gap-2">
                {result.from_cache && (
                  <Badge variant="outline">Cache</Badge>
                )}
                {compatMode && (
                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Modo Compatível</Badge>
                )}
              </div>
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

            {/* Extended Stats (from fallback) */}
            {result.iqr !== undefined && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Média</p>
                  <p className="font-semibold">{formatCurrency(result.avg_price)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">IQR (P75-P25)</p>
                  <p className="font-semibold">{formatCurrency(result.iqr)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">P10</p>
                  <p className="font-semibold">{formatCurrency(result.p10_price)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">P90</p>
                  <p className="font-semibold">{formatCurrency(result.p90_price)}</p>
                </div>
              </div>
            )}

            {/* Condition & Shipping Counts (from fallback) */}
            {result.condition_counts && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm font-medium mb-2">Por Condição</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.condition_counts).map(([cond, count]) => (
                      <Badge key={cond} variant="outline">
                        {cond === 'new' ? 'Novo' : cond === 'used' ? 'Usado' : cond}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
                {result.shipping_counts && (
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm font-medium mb-2">Por Tipo de Envio</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
                        Full: {result.shipping_counts.full}
                      </Badge>
                      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                        Frete Grátis: {result.shipping_counts.free}
                      </Badge>
                      <Badge variant="outline">
                        Pago: {result.shipping_counts.paid}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            )}

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

            {/* Bottom/Top 10 Prices (from fallback) */}
            {result.bottom_10_prices && result.bottom_10_prices.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                  <p className="text-sm font-medium mb-2 text-green-700 dark:text-green-400">10 Menores Preços</p>
                  <div className="flex flex-wrap gap-1">
                    {result.bottom_10_prices.map((price, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {formatCurrency(price)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <p className="text-sm font-medium mb-2 text-red-700 dark:text-red-400">10 Maiores Preços</p>
                  <div className="flex flex-wrap gap-1">
                    {result.top_10_prices?.map((price, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {formatCurrency(price)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
