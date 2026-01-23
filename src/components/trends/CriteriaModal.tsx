import { CheckCircle2, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ELIGIBILITY_TEXTS, ELIGIBILITY_THRESHOLDS } from '@/hooks/useCategoryEligibility';

interface CriteriaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CriteriaModal({ open, onOpenChange }: CriteriaModalProps) {
  const texts = ELIGIBILITY_TEXTS.criteria_modal;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            {texts.title}
          </DialogTitle>
          <DialogDescription className="pt-3">
            {texts.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Lista de critérios */}
          <ul className="space-y-3">
            {texts.bullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{bullet}</span>
              </li>
            ))}
          </ul>

          {/* Thresholds atuais */}
          <div className="bg-muted/50 rounded-lg p-4 mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Critérios atuais para elegibilidade:
            </p>
            <ul className="text-sm space-y-1">
              <li className="flex justify-between">
                <span className="text-muted-foreground">Pedidos no período:</span>
                <span className="font-medium">≥ {ELIGIBILITY_THRESHOLDS.MIN_ORDERS_ELIGIBLE}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">ou Faturamento:</span>
                <span className="font-medium">
                  ≥ R$ {ELIGIBILITY_THRESHOLDS.MIN_REVENUE_ELIGIBLE.toLocaleString('pt-BR')}
                </span>
              </li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground italic">
            Esses critérios são baseados no volume mínimo necessário para que o Mercado Livre 
            disponibilize métricas detalhadas de desempenho.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
