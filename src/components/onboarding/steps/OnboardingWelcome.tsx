import { Rocket, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface OnboardingWelcomeProps {
  trialEndDate: string | null;
}

export function OnboardingWelcome({ trialEndDate }: OnboardingWelcomeProps) {
  return (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
        <Rocket className="w-8 h-8 text-primary" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Bem-vindo ao Mktpfacil!</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Sua central de ferramentas para vender mais no Mercado Livre. 
          Vamos configurar tudo em poucos passos.
        </p>
      </div>

      {trialEndDate && (
        <Badge variant="secondary" className="py-2 px-4 text-sm">
          <Calendar className="w-4 h-4 mr-2 inline" />
          Teste ativo até {trialEndDate}
        </Badge>
      )}

      <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground max-w-sm mx-auto">
        <p>
          Durante o teste, você terá acesso a todos os recursos. 
          Ao final, escolha o plano que melhor atende suas necessidades.
        </p>
      </div>
    </div>
  );
}
