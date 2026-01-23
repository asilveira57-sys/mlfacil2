import { useState } from 'react';
import { Clock, RefreshCw, Database, Server, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataState } from '@/hooks/useCategoryEligibility';

interface TechnicalFooterProps {
  lastUpdate?: string | null;
  dataState: DataState;
  onReload: () => void;
  isReloading: boolean;
}

export function TechnicalFooter({
  lastUpdate,
  dataState,
  onReload,
  isReloading,
}: TechnicalFooterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sourceLabel = dataState === 'DADOS_LIBERADOS_SELLER' 
    ? 'Mercado + Seller'
    : 'Mercado (público)';

  return (
    <div className="border-t bg-muted/30">
      <div className="container mx-auto px-4">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full flex items-center justify-between py-3 h-auto"
            >
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    Última atualização: {lastUpdate 
                      ? new Date(lastUpdate).toLocaleString('pt-BR', { 
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'Nunca'
                    }
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  <span>Fonte: {sourceLabel}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Detalhes técnicos</span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                <div className="flex items-center gap-6 text-xs">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span>Estado: </span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {dataState}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">
                    Atualização diária às 02:00
                  </div>
                </div>
                
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={onReload}
                  disabled={isReloading}
                  className="h-7"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isReloading ? 'animate-spin' : ''}`} />
                  Recarregar
                </Button>
              </div>
              
              <p className="text-[10px] text-muted-foreground">
                Os dados são atualizados automaticamente uma vez por dia. 
                Use "Recarregar" apenas se precisar forçar uma nova leitura do cache.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
