import { Users, Key, Shield } from 'lucide-react';

export function OnboardingAccess() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Users className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Acessos e Permissões</h2>
        <p className="text-muted-foreground text-sm">
          Entenda como funcionam os acessos no sistema
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-sm">Login no Sistema</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Qualquer pessoa com email e senha cadastrados pode acessar o sistema.
              Você controla quem tem acesso.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-medium text-sm">Permissões do Mercado Livre</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Dependem da conta conectada (titular ou colaborador), não do login do sistema.
              A importação de vendas requer conta titular.
            </p>
          </div>
        </div>
      </div>

      <div className="text-center p-4 bg-primary/5 rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Resumo:</strong> Login = acesso ao sistema. 
          Conexão ML = determina o que você pode importar.
        </p>
      </div>
    </div>
  );
}
