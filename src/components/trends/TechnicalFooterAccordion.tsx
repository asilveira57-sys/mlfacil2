import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Database, 
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import { useTrends } from '@/contexts/TrendsContext';

// ============================================================
// TECHNICAL FOOTER ACCORDION
// Objetivo: dar transparência sem confundir
// ============================================================

interface TechnicalFooterAccordionProps {
  onReload: () => void;
  isReloading: boolean;
  snapshotDate: string | null;
}

export function TechnicalFooterAccordion({ 
  onReload, 
  isReloading, 
  snapshotDate 
}: TechnicalFooterAccordionProps) {
  const { state, hasCategory, hasSeller } = useTrends();
  const { capabilities, ui } = state;
  
  const [isOpen, setIsOpen] = useState(false);
  
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Não disponível';
    try {
      return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };
  
  const getDataSource = () => {
    if (!hasCategory) return 'Aguardando seleção';
    if (capabilities.canUseSellerInsights) return 'Mercado (público) + Seller (liberado)';
    return 'Mercado (público)';
  };
  
  const getStateLabel = () => {
    if (!hasSeller) return 'NO_ACCOUNT';
    if (!hasCategory) return 'NO_CATEGORY';
    return capabilities.reason;
  };
  
  const getStateColor = () => {
    if (capabilities.canUseSellerInsights) return 'bg-green-500/10 text-green-600 border-green-500/30';
    if (capabilities.reason === 'INSUFFICIENT_CATEGORY_SALES') return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
    return 'bg-muted text-muted-foreground border-border';
  };
  
  const getStateIcon = () => {
    if (capabilities.canUseSellerInsights) return CheckCircle;
    if (capabilities.reason === 'INSUFFICIENT_CATEGORY_SALES') return AlertTriangle;
    return Info;
  };
  
  const StateIcon = getStateIcon();
  
  // Count active sections
  const activeSections = Object.entries(ui.loadingFlags).filter(([_, loading]) => !loading).length;
  const totalSections = Object.keys(ui.loadingFlags).length;
  
  return (
    <div className="mt-8 border-t pt-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <Database className="h-4 w-4" />
              <span className="text-xs">Detalhes técnicos</span>
              {isOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onReload}
            disabled={isReloading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isReloading ? 'animate-spin' : ''}`} />
            Recarregar
          </Button>
        </div>
        
        <CollapsibleContent className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/30">
            {/* Last update */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Última atualização
              </div>
              <p className="text-sm font-medium">
                {formatDate(ui.lastUpdatedAt || snapshotDate)}
              </p>
            </div>
            
            {/* Data source */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                Fonte dos dados
              </div>
              <p className="text-sm font-medium">{getDataSource()}</p>
            </div>
            
            {/* Technical state */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <StateIcon className="h-3.5 w-3.5" />
                Estado técnico
              </div>
              <Badge variant="outline" className={getStateColor()}>
                {getStateLabel()}
              </Badge>
            </div>
          </div>
          
          {/* Section status */}
          <div className="mt-4 p-4 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground mb-2">Status das seções</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ui.loadingFlags).map(([section, loading]) => {
                const hasError = ui.errors[section as keyof typeof ui.errors];
                const isEmpty = ui.emptyFlags[section as keyof typeof ui.emptyFlags];
                
                let status = 'ok';
                if (loading) status = 'loading';
                else if (hasError) status = 'error';
                else if (isEmpty) status = 'empty';
                
                const statusConfig = {
                  ok: 'bg-green-500/10 text-green-600 border-green-500/30',
                  loading: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
                  error: 'bg-red-500/10 text-red-600 border-red-500/30',
                  empty: 'bg-muted text-muted-foreground border-border',
                };
                
                return (
                  <Badge 
                    key={section} 
                    variant="outline" 
                    className={`text-xs ${statusConfig[status as keyof typeof statusConfig]}`}
                  >
                    {section}
                  </Badge>
                );
              })}
            </div>
          </div>
          
          {/* Logs summary */}
          <div className="mt-4 text-xs text-muted-foreground">
            <p>{activeSections}/{totalSections} seções carregadas • Nonce: {ui.requestNonce}</p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
