import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface TasksOnboardingProps {
  onEnable: () => Promise<boolean>;
}

export function TasksOnboarding({ onEnable }: TasksOnboardingProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleEnable = async () => {
    setLoading(true);
    const success = await onEnable();
    setLoading(false);
    if (!success) {
      console.error('Failed to enable tasks');
    }
  };

  const handleSkip = () => {
    navigate('/dashboard');
  };

  return (
    <div className="container mx-auto p-6 flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckSquare className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Gestão de Tarefas</CardTitle>
          <CardDescription className="text-base mt-2">
            Organize suas atividades, acompanhe pendências e automatize processos 
            relacionados às suas vendas no Mercado Livre.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium text-primary">1</span>
              </div>
              <span>Crie tarefas manuais ou deixe o sistema criar automaticamente</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium text-primary">2</span>
              </div>
              <span>Configure regras para gerar tarefas a partir de eventos do sistema</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium text-primary">3</span>
              </div>
              <span>Acompanhe tudo em listas ou quadro Kanban</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button 
            onClick={handleEnable} 
            className="w-full" 
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Ativar gestão de tarefas
          </Button>
          <Button 
            variant="ghost" 
            onClick={handleSkip} 
            className="w-full"
            disabled={loading}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Agora não
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
