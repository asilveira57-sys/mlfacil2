import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Rocket, ArrowRight, ShoppingCart, BarChart3, Tag, Shield } from 'lucide-react';

interface WelcomeScreenProps {
  onContinue: () => void;
  userName?: string;
}

export function WelcomeScreen({ onContinue, userName }: WelcomeScreenProps) {
  const [step, setStep] = useState<'welcome' | 'info'>('welcome');

  if (step === 'welcome') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardHeader className="space-y-4 pb-2">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Rocket className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-2xl">
              {userName ? `Bem-vindo, ${userName}!` : 'Bem-vindo ao Marketplace Fácil!'}
            </CardTitle>
            <CardDescription className="text-base">
              Sua conta foi criada e verificada com sucesso. Estamos prontos para
              ajudá-lo a gerenciar suas vendas no Mercado Livre.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-3 text-left">
              {[
                { icon: ShoppingCart, label: 'Gestão de vendas', desc: 'Acompanhe pedidos e entregas' },
                { icon: BarChart3, label: 'Analytics completo', desc: 'Métricas e relatórios' },
                { icon: Tag, label: 'Gestão de ADS', desc: 'Campanhas publicitárias' },
                { icon: Shield, label: 'Custos e lucros', desc: 'Controle financeiro' },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                  <item.icon className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button size="lg" className="w-full gap-2" onClick={() => setStep('info')}>
              Começar <ArrowRight className="w-5 h-5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-xl">Próximo passo: Conectar Mercado Livre</CardTitle>
          <CardDescription>
            Para utilizar as ferramentas do sistema, é necessário conectar sua conta do Mercado Livre.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium text-foreground">⚠️ Atenção antes de conectar:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>A conta conectada será a que estiver <strong>logada no navegador</strong> neste momento.</li>
              <li>Se você estiver logado em outra conta do Mercado Livre, a conexão será feita nessa conta.</li>
              <li>Verifique qual conta está ativa antes de prosseguir.</li>
            </ul>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p>
              Após a conexão, importaremos automaticamente <strong>30 dias de dados</strong> para 
              alimentar os módulos de análise, pedidos e custos.
            </p>
          </div>

          <Button size="lg" className="w-full gap-2" onClick={onContinue}>
            Ir para o painel <ArrowRight className="w-5 h-5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
