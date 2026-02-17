import { Package, Percent, PlayCircle, Trash2, ExternalLink, AlertCircle, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { EnrichedPromotionItem } from '@/hooks/useEnrichedPromotionItems';

interface PromotionItemCardProps {
  item: EnrichedPromotionItem;
  promotionStatus: string;
  selected: boolean;
  onToggleSelect: (itemId: string) => void;
  onAdhere?: (item: EnrichedPromotionItem) => void;
  onRemove?: (item: EnrichedPromotionItem) => void;
  actionLoading: boolean;
}

function ItemStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    started: { label: 'Participando', className: 'bg-success/15 text-success border-success/30' },
    candidate: { label: 'Candidato', className: 'bg-warning/15 text-warning border-warning/30' },
    pending: { label: 'Pendente', className: 'bg-warning/15 text-warning border-warning/30' },
    ineligible: { label: 'Inelegível', className: 'bg-destructive/15 text-destructive border-destructive/30' },
    finished: { label: 'Finalizado', className: 'bg-muted text-muted-foreground border-muted' },
  };

  const { label, className } = config[status] || { label: status, className: 'bg-muted text-muted-foreground' };

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

function ListingTypeBadge({ listingTypeId }: { listingTypeId: string | null }) {
  if (!listingTypeId) return null;
  const labels: Record<string, string> = {
    gold_special: 'Clássico',
    gold_pro: 'Premium',
    gold: 'Gold',
    free: 'Grátis',
  };
  const label = labels[listingTypeId] || listingTypeId;
  return (
    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
      {label}
    </span>
  );
}

export function PromotionItemCard({ 
  item, 
  promotionStatus, 
  selected,
  onToggleSelect,
  onAdhere, 
  onRemove, 
  actionLoading 
}: PromotionItemCardProps) {
  const hasDiscount = item.computedDiscount && item.computedDiscount > 0;
  const itemLink = item.permalink || `https://www.mercadolivre.com.br/p/${item.item_id}`;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
      {/* Checkbox */}
      <div className="flex-shrink-0">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(item.item_id)}
          aria-label={`Selecionar ${item.title || item.item_id}`}
        />
      </div>

      {/* Thumbnail */}
      <div className="flex-shrink-0 w-14 h-14 rounded-md overflow-hidden bg-muted flex items-center justify-center border">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.title || item.item_id}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <Package className={`h-6 w-6 text-muted-foreground ${item.thumbnail ? 'hidden' : ''}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Title */}
        <p className="text-sm font-medium leading-tight line-clamp-2">
          {item.title || item.item_id}
        </p>

        {/* SKU + MLB ID + Listing Type */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {item.sku && (
            <span className="font-mono truncate max-w-[120px]" title={item.sku}>
              SKU: {item.sku}
            </span>
          )}
          {item.sku && <span>•</span>}
          <a
            href={itemLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-primary hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
          >
            {item.item_id}
            <ExternalLink className="h-3 w-3" />
          </a>
          <ListingTypeBadge listingTypeId={item.listing_type_id} />
        </div>

        {/* Error reason for ineligible */}
        {item.item_status === 'ineligible' && item.error_reason && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-xs text-destructive cursor-help">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{item.error_reason}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-sm">{item.error_reason}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Price Block */}
      <div className="flex-shrink-0 text-right space-y-0.5 min-w-[110px]">
        {item.finalPrice ? (
          <>
            <span className="line-through text-xs text-muted-foreground block">
              R$ {item.original_price?.toFixed(2)}
            </span>
            <span className="font-semibold text-sm text-success block">
              R$ {item.finalPrice.toFixed(2)}
            </span>
          </>
        ) : (
          <span className="text-sm font-medium block">
            R$ {item.original_price?.toFixed(2) || '-'}
          </span>
        )}
        {hasDiscount && (
          <Badge variant="outline" className="gap-0.5 text-xs bg-primary/10 text-primary border-primary/30">
            <Percent className="h-2.5 w-2.5" />
            {item.computedDiscount}%
          </Badge>
        )}
      </div>

      {/* Net Proceeds + Fee Reduction */}
      <div className="flex-shrink-0 text-right min-w-[120px] space-y-0.5">
        <span className="text-[10px] text-muted-foreground block uppercase tracking-wide">Você recebe</span>
        {item.net_proceeds_amount ? (
          <span className="text-sm font-semibold text-foreground flex items-center justify-end gap-0.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            R$ {item.net_proceeds_amount.toFixed(2)}
          </span>
        ) : !item.feeReductionAmount ? (
          <span className="text-sm text-muted-foreground">-</span>
        ) : null}
        {item.feeReductionAmount && item.feeReductionAmount > 0 && (
          <span className="text-[11px] text-success leading-tight block">
            Reduzimos R$ {item.feeReductionAmount.toFixed(2)} das suas tarifas por cada venda
          </span>
        )}
      </div>

      {/* Status + Action */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1.5 min-w-[110px]">
        <ItemStatusBadge status={item.item_status} />

        {item.item_status === 'candidate' && promotionStatus === 'started' && onAdhere && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-primary"
            onClick={() => onAdhere(item)}
            disabled={actionLoading}
          >
            <PlayCircle className="h-3 w-3" />
            Aderir
          </Button>
        )}
        {item.item_status === 'started' && onRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-destructive"
            onClick={() => onRemove(item)}
            disabled={actionLoading}
          >
            <Trash2 className="h-3 w-3" />
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
