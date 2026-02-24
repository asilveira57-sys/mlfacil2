import { Package, TrendingUp, TrendingDown, Pause, Rocket, AlertTriangle, Tag, BookOpen, Truck } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EnrichedAdsItem } from '@/types/ads';
import { cn } from '@/lib/utils';

interface AdsProductsTableProps {
  items: EnrichedAdsItem[];
  onSelectItem?: (item: EnrichedAdsItem) => void;
  listingInfoMap?: Map<string, { isCatalog: boolean; isFull: boolean; outOfStock: boolean; listingStatus: string | null }>;
}

export function AdsProductsTable({ items, onSelectItem, listingInfoMap }: AdsProductsTableProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getSituationBadge = (situation: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Rocket; className: string }> = {
      scale: { label: 'Escalar', variant: 'default', icon: Rocket, className: 'bg-success/10 text-success border-success/30' },
      maintain: { label: 'Manter', variant: 'secondary', icon: TrendingUp, className: '' },
      adjust: { label: 'Ajustar', variant: 'outline', icon: AlertTriangle, className: 'bg-warning/10 text-warning border-warning/30' },
      pause: { label: 'Pausar', variant: 'destructive', icon: Pause, className: '' },
    };
    const cfg = config[situation] || config.maintain;
    return (
      <Badge variant={cfg.variant} className={`flex items-center gap-1 w-fit ${cfg.className}`}>
        <cfg.icon className="h-3 w-3" />
        {cfg.label}
      </Badge>
    );
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhum produto com ADS encontrado</p>
        <p className="text-sm mt-1">Sincronize seus dados ou aplique filtros diferentes</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[250px]">Produto</TableHead>
            <TableHead className="text-right">Preço</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">Vendas</TableHead>
            <TableHead className="text-right">ACOS</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
            <TableHead className="text-right">Margem</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const acos = (item.acos || 0) * 100;
            const roas = item.roas || 0;
            const isHighAcos = acos > 30;
            const isGoodRoas = roas >= 3;
            const margin = item.margin_percent;
            const info = listingInfoMap?.get(item.item_id);
            const isDimmed = item.status === 'paused' || info?.outOfStock || info?.listingStatus === 'paused';

            return (
              <TableRow
                key={item.id}
                className={cn("cursor-pointer hover:bg-muted/50", isDimmed && "opacity-50")}
                onClick={() => onSelectItem?.(item)}
              >
                <TableCell>
                    <div className="max-w-[300px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium truncate">{item.title || item.item_id}</p>
                        {info?.isCatalog && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5 border-primary/40 text-primary">
                            <BookOpen className="h-2.5 w-2.5" />
                            Catálogo
                          </Badge>
                        )}
                        {info?.isFull && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5 border-blue-500/40 text-blue-500">
                            <Truck className="h-2.5 w-2.5" />
                            Full
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{item.item_id}</span>
                        {item.is_in_promotion && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-warning/10 text-warning border-warning/30">
                            <Tag className="h-2.5 w-2.5 mr-0.5" />
                            Promoção
                          </Badge>
                        )}
                        {info?.outOfStock && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0">Sem Estoque</Badge>
                        )}
                        {info?.listingStatus === 'paused' && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">Pausado</Badge>
                        )}
                      </div>
                    </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-medium">
                    {item.current_price ? formatCurrency(item.current_price) : '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium text-destructive">
                  {formatCurrency(item.spent)}
                </TableCell>
                <TableCell className="text-right">
                  <div>
                    <p className="font-medium">{item.conversions} un</p>
                    <p className="text-xs text-success">
                      {formatCurrency(item.revenue_from_ads)}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className={`flex items-center justify-end gap-1 font-medium ${isHighAcos ? 'text-destructive' : 'text-success'}`}>
                    {isHighAcos ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {acos.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={`font-medium ${isGoodRoas ? 'text-success' : 'text-warning'}`}>
                    {roas.toFixed(2)}x
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {margin !== undefined ? (
                    <span className={`font-medium ${margin > 20 ? 'text-success' : margin > 10 ? 'text-warning' : 'text-destructive'}`}>
                      {margin.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell>{getSituationBadge(item.situation)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
