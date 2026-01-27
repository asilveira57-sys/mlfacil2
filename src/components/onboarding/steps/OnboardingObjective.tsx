import { Printer, ShoppingCart, Layers } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { OnboardingObjectiveType } from '../OnboardingWizard';

interface OnboardingObjectiveProps {
  selected: OnboardingObjectiveType | null;
  onSelect: (objective: OnboardingObjectiveType) => void;
}

const OBJECTIVES = [
  {
    id: 'labels' as const,
    icon: Printer,
    title: 'Impressão de Etiquetas',
    description: 'Gerar etiquetas ZPL/EPL para envio rápido',
  },
  {
    id: 'sales' as const,
    icon: ShoppingCart,
    title: 'Importação de Vendas',
    description: 'Analisar vendas, custos e lucros',
  },
  {
    id: 'both' as const,
    icon: Layers,
    title: 'Ambos',
    description: 'Etiquetas + análise completa de vendas',
  },
];

export function OnboardingObjective({ selected, onSelect }: OnboardingObjectiveProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Qual seu objetivo principal?</h2>
        <p className="text-muted-foreground text-sm">
          Isso nos ajuda a personalizar sua experiência
        </p>
      </div>

      <div className="grid gap-4">
        {OBJECTIVES.map((obj) => {
          const Icon = obj.icon;
          const isSelected = selected === obj.id;

          return (
            <Card
              key={obj.id}
              onClick={() => onSelect(obj.id)}
              className={cn(
                'p-4 cursor-pointer transition-all hover:border-primary/50',
                isSelected && 'border-primary bg-primary/5 ring-2 ring-primary/20'
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  'w-12 h-12 rounded-lg flex items-center justify-center',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{obj.title}</h3>
                  <p className="text-sm text-muted-foreground">{obj.description}</p>
                </div>
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 transition-colors',
                  isSelected 
                    ? 'border-primary bg-primary' 
                    : 'border-muted-foreground/30'
                )}>
                  {isSelected && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
