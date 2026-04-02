import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';

interface TrialExpiredScreenProps {
  title?: string;
}

export function TrialExpiredScreen({ title = 'Etiquetas de Envio' }: TrialExpiredScreenProps) {
  const navigate = useNavigate();

  return (
    <PageContainer title={title}>
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-4 max-w-md mx-auto px-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">
            Período de teste finalizado
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Seu período de teste expirou. Os dados já importados continuam disponíveis, 
            mas a sincronização e impressão de etiquetas ficaram bloqueadas. 
            Assine um plano para continuar utilizando todas as funcionalidades.
          </p>
          <div className="pt-2">
            <Button onClick={() => navigate('/settings?section=plano')} size="lg">
              Ver planos
            </Button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
