import { CheckCircle, AlertTriangle, Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MlAccountRole } from '@/types/user-access';

interface OnboardingConnectMLProps {
  mlRole: MlAccountRole;
}

export function OnboardingConnectML({ mlRole }: OnboardingConnectMLProps) {
  const handleConnectML = () => {
    // TODO: Implement ML OAuth flow
    window.open('/auth?action=connect-ml', '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Conectar Mercado Livre</h2>
        <p className="text-muted-foreground text-sm">
          Para importar suas vendas, conecte sua conta do Mercado Livre
        </p>
      </div>

      {/* Status atual */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status da conexão</span>
          {mlRole === 'owner' && (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
              <CheckCircle className="w-3 h-3 mr-1" />
              Titular conectado
            </Badge>
          )}
          {mlRole === 'collaborator' && (
            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Colaborador
            </Badge>
          )}
          {mlRole === 'none' && (
            <Badge variant="secondary">
              <Link2 className="w-3 h-3 mr-1" />
              Não conectado
            </Badge>
          )}
        </div>

        {mlRole === 'collaborator' && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Conta colaborador detectada. A importação de vendas requer conta titular.
          </p>
        )}
      </div>

      {/* Ação */}
      <div className="space-y-3">
        {mlRole === 'none' && (
          <Button onClick={handleConnectML} className="w-full">
            <ExternalLink className="w-4 h-4 mr-2" />
            Conectar Mercado Livre
          </Button>
        )}

        {mlRole === 'collaborator' && (
          <>
            <Button onClick={handleConnectML} variant="outline" className="w-full">
              Conectar outra conta (titular)
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Ou continue para usar apenas o modo de impressão
            </p>
          </>
        )}

        {mlRole === 'owner' && (
          <div className="text-center text-sm text-green-600 dark:text-green-400">
            ✓ Sua conta está pronta para importar vendas!
          </div>
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground text-center">
        <p>A conexão é segura e usa OAuth oficial do Mercado Livre.</p>
      </div>
    </div>
  );
}
