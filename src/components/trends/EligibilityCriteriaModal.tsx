/**
 * Component: EligibilityCriteriaModal
 * 
 * Disparo:
 * - Clique em "Entender critérios"
 * 
 * Texto estático (sem API):
 * - Explica liberação por volume mínimo
 * - Reforça uso de dados oficiais do Mercado Livre
 */

import { Info, CheckCircle, BarChart3, Target } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EligibilityCriteriaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EligibilityCriteriaModal({ 
  open, 
  onOpenChange 
}: EligibilityCriteriaModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Quando metas e desempenho ficam disponíveis
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <DialogDescription className="text-sm leading-relaxed">
            As métricas de metas, evolução e comparativos dependem de um volume mínimo 
            de vendas por categoria. Quando esse volume é atingido, o Mercado Livre 
            passa a liberar automaticamente esses dados.
          </DialogDescription>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Volume mínimo</p>
                <p className="text-xs text-muted-foreground">
                  Aproximadamente 10 pedidos por categoria no período analisado.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <BarChart3 className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Dados oficiais</p>
                <p className="text-xs text-muted-foreground">
                  Todas as métricas são obtidas diretamente da API oficial do Mercado Livre.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Target className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Enquanto isso</p>
                <p className="text-xs text-muted-foreground">
                  Use a Visão de Mercado (tendências, palavras-chave, ranking público) 
                  para apoiar decisões de entrada e expansão.
                </p>
              </div>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground text-center pt-2">
            Essa política segue as diretrizes do Mercado Livre para proteção de dados.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
