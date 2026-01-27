import { CheckCircle, Printer, BarChart3, TrendingUp, FileText } from 'lucide-react';
import { OnboardingObjectiveType } from '../OnboardingWizard';

interface OnboardingCompleteProps {
  objective: OnboardingObjectiveType | null;
}

export function OnboardingComplete({ objective }: OnboardingCompleteProps) {
  const shortcuts = [
    ...(objective === 'labels' || objective === 'both' 
      ? [{ icon: Printer, label: 'Etiquetas', path: '/etiquetas' }]
      : []),
    ...(objective === 'sales' || objective === 'both'
      ? [
          { icon: BarChart3, label: 'Dashboard', path: '/dashboard' },
          { icon: FileText, label: 'Custos', path: '/custos' },
        ]
      : []),
    { icon: TrendingUp, label: 'Tendências', path: '/tendencias' },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold">Tudo pronto!</h2>
        <p className="text-muted-foreground text-sm">
          Sua conta está configurada. Vamos começar?
        </p>
      </div>

      {/* Quick shortcuts based on objective */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-center">Atalhos sugeridos para você:</p>
        <div className="grid grid-cols-2 gap-3">
          {shortcuts.map((shortcut, idx) => {
            const Icon = shortcut.icon;
            return (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
              >
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium">{shortcut.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        <p>Clique em "Concluir e Começar" para ir ao Dashboard.</p>
      </div>
    </div>
  );
}
