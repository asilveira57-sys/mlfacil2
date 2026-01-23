import { AlertTriangle, TrendingUp, FolderTree, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  EligibilityState, 
  DataState, 
  ELIGIBILITY_TEXTS 
} from '@/hooks/useCategoryEligibility';

interface EligibilityBannerProps {
  eligibilityState: EligibilityState;
  dataState: DataState;
  ordersCount?: number;
  thresholdOrders?: number;
  onActionClick?: () => void;
  className?: string;
}

/**
 * Banner que explica por que dados seller-based não estão disponíveis
 * 
 * REGRA: Ausência de dados não é erro, é condição normal
 * Este banner mostra alternativas (dados de mercado) sem tratar como falha
 */
export function EligibilityBanner({
  eligibilityState,
  dataState,
  ordersCount = 0,
  thresholdOrders = 10,
  onActionClick,
  className = '',
}: EligibilityBannerProps) {
  // Não mostra banner se dados estão liberados ou carregando
  if (dataState === 'DADOS_LIBERADOS_SELLER' || eligibilityState === 'loading' || eligibilityState === 'unknown') {
    return null;
  }

  // Seleciona textos baseado no estado
  const texts = eligibilityState === 'inactive' 
    ? ELIGIBILITY_TEXTS.inactive 
    : ELIGIBILITY_TEXTS.low_base;

  // Define ícone e cor baseado no estado
  const Icon = eligibilityState === 'inactive' ? FolderTree : AlertTriangle;
  const iconColor = eligibilityState === 'inactive' ? 'text-muted-foreground' : 'text-amber-500';
  const borderColor = eligibilityState === 'inactive' 
    ? 'border-muted-foreground/30 bg-muted/30' 
    : 'border-amber-500/30 bg-amber-500/5';

  return (
    <Alert className={`${borderColor} ${className}`}>
      <Icon className={`h-5 w-5 ${iconColor}`} />
      <AlertTitle className="text-base font-medium">{texts.title}</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm text-muted-foreground mb-4">
          {texts.description}
        </p>
        
        {/* Indicador de estado de dados */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 bg-background/50 rounded px-2 py-1 w-fit">
          <Info className="h-3 w-3" />
          <span>Estado: <code className="font-mono">{dataState}</code></span>
        </div>
        
        {eligibilityState === 'low_base' && ordersCount > 0 && (
          <p className="text-xs text-muted-foreground mb-3">
            <span className="font-medium text-foreground">{ordersCount}</span> pedidos encontrados 
            (mínimo: <span className="font-medium">{thresholdOrders}</span>)
          </p>
        )}

        {onActionClick && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onActionClick}
            className="mt-2"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            {texts.action}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
