import { Package, Percent, PlayCircle, Trash2, ExternalLink, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { EnrichedPromotionItem } from '@/hooks/useEnrichedPromotionItems';

interface PromotionItemCardProps {
  item: EnrichedPromotionItem;
  promotionStatus: string;
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

export function PromotionItemCard({ 
  item, 
  promotionStatus, 
  onAdhere, 
  onRemove, 
  actionLoading 
}: PromotionItemCardProps) {
  const hasDiscount = item.discount_percent && item.discount_percent > 0;
  const itemLink = item.permalink || `https://www.mercadolivre.com.br/p/${item.item_id}`;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
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

        {/* SKU + MLB ID */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
      <div className="flex-shrink-0 text-right space-y-0.5 min-w-[100px]">
        {item.promo_price ? (
          <>
            <span className="line-through text-xs text-muted-foreground block">
              R$ {item.original_price?.toFixed(2)}
            </span>
            <span className="font-semibold text-sm text-success block">
              R$ {item.promo_price.toFixed(2)}
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
            {item.discount_percent}%
          </Badge>
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
