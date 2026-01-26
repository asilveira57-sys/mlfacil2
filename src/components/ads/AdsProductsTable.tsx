import { Package, TrendingUp, TrendingDown, Pause, Rocket, AlertTriangle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EnrichedAdsItem } from '@/types/ads';

interface AdsProductsTableProps {
  items: EnrichedAdsItem[];
  onSelectItem?: (item: EnrichedAdsItem) => void;
}

export function AdsProductsTable({ items, onSelectItem }: AdsProductsTableProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getSituationBadge = (situation: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Rocket }> = {
      scale: { label: 'Escalar', variant: 'default', icon: Rocket },
      maintain: { label: 'Manter', variant: 'secondary', icon: TrendingUp },
      adjust: { label: 'Ajustar', variant: 'outline', icon: AlertTriangle },
      pause: { label: 'Pausar', variant: 'destructive', icon: Pause },
    };
    const cfg = config[situation] || config.maintain;
    return (
      <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit">
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
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produto</TableHead>
            <TableHead>Promoção</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">Vendas</TableHead>
            <TableHead className="text-right">ACOS</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const acos = (item.acos || 0) * 100;
            const roas = item.roas || 0;
            const isHighAcos = acos > 30;
            const isGoodRoas = roas >= 3;

            return (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelectItem?.(item)}
              >
                <TableCell>
                  <div className="max-w-[300px]">
                    <p className="font-medium truncate">{item.title || item.item_id}</p>
                    <p className="text-xs text-muted-foreground">{item.item_id}</p>
                  </div>
                </TableCell>
                <TableCell>
                  {item.is_in_promotion ? (
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                      Em promoção
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(item.spent)}
                </TableCell>
                <TableCell className="text-right">
                  <div>
                    <p className="font-medium">{item.conversions}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.revenue_from_ads)}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className={`flex items-center justify-end gap-1 ${isHighAcos ? 'text-red-500' : 'text-green-500'}`}>
                    {isHighAcos ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {acos.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={isGoodRoas ? 'text-green-500 font-medium' : 'text-yellow-500'}>
                    {roas.toFixed(2)}x
                  </span>
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
