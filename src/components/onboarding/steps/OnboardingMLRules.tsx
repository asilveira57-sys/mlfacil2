import { AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MlAccountRole } from '@/types/user-access';

interface OnboardingMLRulesProps {
  mlRole: MlAccountRole;
}

export function OnboardingMLRules({ mlRole }: OnboardingMLRulesProps) {
  if (mlRole !== 'collaborator') {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="text-xl font-semibold">Regras do Mercado Livre</h2>
        <p className="text-muted-foreground text-sm">
          Entenda as limitações da conta colaborador
        </p>
      </div>

      <Alert className="border-amber-500/30 bg-amber-500/5">
        <Info className="w-4 h-4 text-amber-500" />
        <AlertDescription className="text-sm">
          <strong>Conta Colaborador Detectada</strong>
          <p className="mt-1 text-muted-foreground">
            O Mercado Livre não permite que contas colaboradoras acessem dados de vendas via API.
            Isso é uma regra do próprio ML, não do nosso sistema.
          </p>
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <h3 className="font-medium">Seus caminhos:</h3>
        
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">1</span>
            </div>
            <div>
              <p className="font-medium text-sm">Conectar conta titular</p>
              <p className="text-xs text-muted-foreground">
                Se você tem acesso à conta principal, conecte-a para liberar importação de vendas
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">2</span>
            </div>
            <div>
              <p className="font-medium text-sm">Usar modo impressão (ZPL/EPL)</p>
              <p className="text-xs text-muted-foreground">
                Continue sem importação de vendas e use apenas as ferramentas de etiquetas
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        <p>Você pode alterar a conexão a qualquer momento nas Configurações.</p>
      </div>
    </div>
  );
}
