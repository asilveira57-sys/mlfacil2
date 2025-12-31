import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ExternalLink, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  CheckCircle2,
  Target,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';

interface CompetitorProductDetailProps {
  sellerId: string;
  listing: {
    item_id: string;
    variation_id: string;
    title: string;
    price: number;
    catalog_product_id: string | null;
    permalink: string | null;
    thumbnail: string | null;
  };
}

interface ProductDetail {
  listing: any;
  cost: number | null;
  has_cost: boolean;
  catalog_snapshot: any | null;
  abc_classification: any[];
  margin_info: {
    cost: number;
    current_margin_percent: number;
    estimated_profit: number;
    min_price_target: number;
    min_price_floor: number;
    target_margin_percent: number;
    floor_margin_percent: number;
    status: 'healthy' | 'attention' | 'risk';
  } | null;
}

export function CompetitorProductDetail({ sellerId, listing }: CompetitorProductDetailProps) {
  const [data, setData] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({
        seller_id: sellerId,
        item_id: listing.item_id,
        variation_id: listing.variation_id || '',
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/product?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error loading product detail:', error);
      toast.error('Erro ao carregar detalhes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [sellerId, listing.item_id]);

  const handleRefreshCatalog = async () => {
    if (!listing.catalog_product_id) return;
    
    setRefreshingCatalog(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/catalog/refresh`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seller_id: sellerId,
            catalog_product_id: listing.catalog_product_id,
            your_item_id: listing.item_id,
            your_price: listing.price,
          }),
        }
      );

      if (response.ok) {
        toast.success('Dados do catálogo atualizados');
        loadDetail();
      } else {
        toast.error('Erro ao atualizar catálogo');
      }
    } catch (error) {
      console.error('Error refreshing catalog:', error);
      toast.error('Erro ao atualizar');
    } finally {
      setRefreshingCatalog(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-muted-foreground">Produto não encontrado</p>;
  }

  const marginInfo = data.margin_info;
  const catalogSnapshot = data.catalog_snapshot;

  return (
    <div className="space-y-6">
      {/* Product Header */}
      <div className="flex items-start gap-4">
        {listing.thumbnail && (
          <img 
            src={listing.thumbnail} 
            alt="" 
            className="w-20 h-20 object-cover rounded-lg"
          />
        )}
        <div className="flex-1">
          <h3 className="font-semibold">{listing.title}</h3>
          <p className="text-sm text-muted-foreground">{listing.item_id}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xl font-bold">{formatCurrency(listing.price)}</span>
            {listing.permalink && (
              <Button variant="ghost" size="sm" asChild>
                <a href={listing.permalink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Margin Info */}
      {marginInfo ? (
        <Card className={`border-2 ${
          marginInfo.status === 'healthy' ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' :
          marginInfo.status === 'attention' ? 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20' :
          'border-red-500/50 bg-red-50/50 dark:bg-red-950/20'
        }`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5" />
              Análise de Margem
              <Badge variant={marginInfo.status === 'healthy' ? 'default' : marginInfo.status === 'attention' ? 'secondary' : 'destructive'}>
                {marginInfo.status === 'healthy' ? 'Saudável' : marginInfo.status === 'attention' ? 'Atenção' : 'Risco'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Custo</p>
                <p className="font-semibold">{formatCurrency(marginInfo.cost)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Margem Atual</p>
                <p className={`font-semibold ${marginInfo.current_margin_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {marginInfo.current_margin_percent.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Preço Mín. (alvo {marginInfo.target_margin_percent}%)</p>
                <p className="font-semibold">{formatCurrency(marginInfo.min_price_target)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Preço Mín. (piso {marginInfo.floor_margin_percent}%)</p>
                <p className="font-semibold">{formatCurrency(marginInfo.min_price_floor)}</p>
              </div>
            </div>

            {marginInfo.status === 'risk' && (
              <div className="flex items-center gap-2 mt-4 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-sm">Margem abaixo do mínimo! Considere aumentar o preço.</span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium">Custo não preenchido</p>
              <p className="text-sm text-muted-foreground">
                Vá ao módulo de Custos para cadastrar o custo deste produto e habilitar recomendações de preço.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Catalog Section */}
      {listing.catalog_product_id && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Concorrência no Catálogo
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefreshCatalog}
                disabled={refreshingCatalog}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshingCatalog ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
            <CardDescription>
              Produto de catálogo: {listing.catalog_product_id}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {catalogSnapshot ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Menor Preço</p>
                    <p className="font-semibold">{formatCurrency(catalogSnapshot.market_price_min || 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Mediana</p>
                    <p className="font-semibold">{formatCurrency(catalogSnapshot.market_price_median || 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Maior Preço</p>
                    <p className="font-semibold">{formatCurrency(catalogSnapshot.market_price_max || 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sua Posição</p>
                    <p className="font-semibold">
                      {catalogSnapshot.your_position ? `${catalogSnapshot.your_position}º de ${catalogSnapshot.total_offers}` : '-'}
                    </p>
                  </div>
                </div>

                {catalogSnapshot.competitor_offers_json?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Top Concorrentes:</p>
                    <div className="space-y-2">
                      {catalogSnapshot.competitor_offers_json.slice(0, 5).map((comp: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{idx + 1}.</span>
                            <span className="truncate max-w-[200px]">{comp.seller_nickname || 'Vendedor'}</span>
                            {comp.shipping_full && <Badge className="text-xs bg-green-600">Full</Badge>}
                          </div>
                          <span className="font-semibold">{formatCurrency(comp.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price Positioning */}
                {catalogSnapshot.market_price_median && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm">
                      Seu preço está{' '}
                      {listing.price < catalogSnapshot.market_price_median ? (
                        <span className="text-green-600 font-medium">
                          {((1 - listing.price / catalogSnapshot.market_price_median) * 100).toFixed(0)}% abaixo
                        </span>
                      ) : listing.price > catalogSnapshot.market_price_median ? (
                        <span className="text-amber-600 font-medium">
                          {((listing.price / catalogSnapshot.market_price_median - 1) * 100).toFixed(0)}% acima
                        </span>
                      ) : (
                        <span className="font-medium">na mediana</span>
                      )}
                      {' '}do mercado.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-2">Nenhum snapshot de catálogo ainda.</p>
                <Button variant="outline" size="sm" onClick={handleRefreshCatalog} disabled={refreshingCatalog}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshingCatalog ? 'animate-spin' : ''}`} />
                  Buscar Concorrentes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ABC Classification */}
      {data.abc_classification.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Classificação ABC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {data.abc_classification.map((abc: any, idx: number) => (
                <Badge key={idx} variant={abc.class === 'A' ? 'default' : abc.class === 'B' ? 'secondary' : 'outline'}>
                  {abc.metric}: Classe {abc.class}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
