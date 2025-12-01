import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, TrendingUp, Eye, ShoppingCart, Package, AlertTriangle } from "lucide-react";

interface AnalyzedItem {
  id: string;
  item_id: string;
  title: string;
  price: number;
  thumbnail: string;
  permalink: string;
  status: string;
  available_quantity: number;
  sold_quantity: number;
  analyzed_at: string;
}

interface ItemMetrics {
  visits_total: number;
  visits_7d: number;
  visits_30d: number;
  sold_quantity_7d: number;
  sold_quantity_30d: number;
  conversion_rate: number;
}

interface ItemWithMetrics extends AnalyzedItem {
  metrics?: ItemMetrics;
}

export const ListingsPanel = () => {
  const [items, setItems] = useState<ItemWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyzedItems();
  }, []);

  const fetchAnalyzedItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      // Buscar itens analisados
      const { data: analyzedItems, error: itemsError } = await supabase
        .from('analyzed_items')
        .select('*')
        .eq('user_id', user.id)
        .order('analyzed_at', { ascending: false });

      if (itemsError) throw itemsError;

      if (!analyzedItems || analyzedItems.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Buscar métricas para cada item
      const itemsWithMetrics = await Promise.all(
        analyzedItems.map(async (item) => {
          const { data: metrics } = await supabase
            .from('item_metrics')
            .select('*')
            .eq('analyzed_item_id', item.id)
            .order('collected_at', { ascending: false })
            .limit(1)
            .single();

          return {
            ...item,
            metrics: metrics || undefined,
          };
        })
      );

      setItems(itemsWithMetrics);
    } catch (error) {
      console.error('Erro ao buscar itens:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getStockStatus = (quantity: number) => {
    if (quantity === 0) return { label: 'Sem estoque', color: 'destructive' };
    if (quantity < 100) return { label: 'Estoque baixo', color: 'warning' };
    return { label: 'Estoque OK', color: 'success' };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Anúncios Analisados</CardTitle>
          <CardDescription>
            Nenhum anúncio analisado ainda. Use a extensão do Chrome para começar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Comece a Analisar
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Instale a extensão do Chrome e visite qualquer anúncio do Mercado Livre para ver métricas detalhadas.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anúncios Analisados</CardTitle>
        <CardDescription>
          Visualize métricas de performance dos seus anúncios do Mercado Livre
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Anúncio</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Eye className="w-4 h-4" />
                    Visitas 30d
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ShoppingCart className="w-4 h-4" />
                    Vendas 30d
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <TrendingUp className="w-4 h-4" />
                    Conversão
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Package className="w-4 h-4" />
                    Estoque
                  </div>
                </TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const stockStatus = getStockStatus(item.available_quantity || 0);
                
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <img
                        src={item.thumbnail || '/placeholder.svg'}
                        alt={item.title || 'Produto'}
                        className="w-12 h-12 object-cover rounded"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 max-w-md">
                        <span className="font-medium text-foreground line-clamp-2">
                          {item.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ID: {item.item_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-foreground">
                      {formatPrice(item.price || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-foreground">
                        {item.metrics?.visits_30d?.toLocaleString('pt-BR') || '0'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-foreground">
                        {item.metrics?.sold_quantity_30d?.toLocaleString('pt-BR') || '0'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.metrics?.conversion_rate ? (
                        <Badge variant="secondary" className="font-mono">
                          {formatPercent(item.metrics.conversion_rate)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-foreground">
                          {item.available_quantity?.toLocaleString('pt-BR') || '0'}
                        </span>
                        {stockStatus.color === 'warning' && (
                          <AlertTriangle className="w-4 h-4 text-warning" />
                        )}
                        {stockStatus.color === 'destructive' && (
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.permalink && (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="w-4 h-4 text-muted-foreground" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
