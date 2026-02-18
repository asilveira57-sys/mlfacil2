import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronUp, Package, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CampaignProduct {
  id: string;
  item_id: string;
  title: string;
  thumbnail: string | null;
  sku: string | null;
  price: number;
  spent: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  cpc: number;
  acos: number;
  roas: number;
  tacos: number;
  status: string;
}

interface AdsCampaignProductsProps {
  mlCampaignId: string;
  sellerId: string;
  onClose: () => void;
}

export function AdsCampaignProducts({ mlCampaignId, sellerId, onClose }: AdsCampaignProductsProps) {
  const [products, setProducts] = useState<CampaignProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);

      // Items have campaign_id in raw_data
      const { data, error } = await supabase
        .from('ads_items')
        .select('*')
        .eq('seller_id', sellerId);

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Filter by campaign_id in raw_data (ML stores as number)
      const campaignItems = data.filter((item) => {
        const rawCampaignId = String((item.raw_data as Record<string, unknown>)?.campaign_id || '');
        return rawCampaignId === mlCampaignId;
      });

      const mapped: CampaignProduct[] = campaignItems.map((item) => {
        const raw = (item.raw_data || {}) as Record<string, unknown>;
        const metrics = (raw.metrics || {}) as Record<string, number>;
        const spent = metrics.cost || item.spent || 0;
        const revenue = metrics.total_amount || item.revenue_from_ads || 0;
        const clicks = metrics.clicks || item.clicks || 0;
        const impressions = metrics.prints || item.impressions || 0;
        const conversions = item.conversions || 0;
        const cpc = metrics.cpc || (clicks > 0 ? spent / clicks : 0);
        const acos = metrics.acos || (revenue > 0 ? (spent / revenue) * 100 : 0);
        const roas = metrics.roas || (spent > 0 ? revenue / spent : 0);
        // TACOS = total ad cost of sales (same as ACOS for product-level, shown for reference)
        const tacos = revenue > 0 ? (spent / revenue) * 100 : 0;

        return {
          id: item.id,
          item_id: item.item_id,
          title: item.title || item.item_id,
          thumbnail: (raw.thumbnail as string) || null,
          sku: (raw.user_product_id as string) || item.product_key || null,
          price: (raw.price as number) || item.current_price || 0,
          spent,
          revenue,
          clicks,
          impressions,
          conversions,
          cpc,
          acos,
          roas,
          tacos,
          status: (raw.status as string) || item.status || 'active',
        };
      });

      // Sort by spent desc
      mapped.sort((a, b) => b.spent - a.spent);
      setProducts(mapped);
      setLoading(false);
    };

    fetchProducts();
  }, [mlCampaignId, sellerId]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (loading) {
    return (
      <div className="p-4 space-y-3 bg-muted/30 border-t">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground bg-muted/30 border-t">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhum produto encontrado nesta campanha</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={onClose}>
          <ChevronUp className="h-4 w-4 mr-1" /> Fechar
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-muted/20 border-t">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
        <span className="text-sm font-medium text-muted-foreground">
          {products.length} produto(s) nesta campanha
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ChevronUp className="h-4 w-4 mr-1" /> Fechar
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="min-w-[280px]">Produto</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">Gasto</TableHead>
              <TableHead className="text-right">Receita</TableHead>
              <TableHead className="text-right">Cliques</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">ACOS</TableHead>
              <TableHead className="text-right">TACOS</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const isHighAcos = product.acos > 30;
              const isGoodRoas = product.roas >= 3;

              return (
                <TableRow key={product.id} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {product.thumbnail ? (
                        <img
                          src={product.thumbnail}
                          alt={product.title}
                          className="h-10 w-10 rounded object-cover border bg-background flex-shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate max-w-[220px]">{product.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">{product.item_id}</span>
                          {product.sku && (
                            <span className="text-[11px] text-muted-foreground">
                              SKU: {product.sku}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(product.price)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-destructive">
                    {formatCurrency(product.spent)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-success">
                    {formatCurrency(product.revenue)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {product.clicks}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(product.cpc)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={`flex items-center justify-end gap-1 font-medium ${isHighAcos ? 'text-destructive' : 'text-success'}`}>
                      {isHighAcos ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                      {product.acos.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={`font-medium ${product.tacos > 30 ? 'text-destructive' : product.tacos > 15 ? 'text-warning' : 'text-success'}`}>
                      {product.tacos.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={`font-medium ${isGoodRoas ? 'text-success' : 'text-warning'}`}>
                      {product.roas.toFixed(2)}x
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {product.status === 'active' ? 'Ativo' : 'Pausado'}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
