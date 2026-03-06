import { useNavigate, useLocation } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, ArrowRight, Building2, CheckCircle2 } from 'lucide-react';
import { useUserAccess } from '@/contexts/UserAccessContext';

/**
 * BillingDataGate — blocks access after payment until fiscal data is complete.
 * Shows a modal directing the user to fill in PF/PJ billing data in Settings.
 */
export function BillingDataGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const { flags, loading, isAuthenticated } = useUserAccess();

  // Allow access to settings page (where billing data is filled)
  const isOnSettingsPage = location.pathname === '/settings';
  const isOnPlanosPage = location.pathname === '/planos';
  const isPublicRoute = ['/', '/home', '/auth', '/criar-acesso', '/primeiro-acesso', '/reconnecting', '/blog', '/planos', '/termos-de-uso', '/politica-de-privacidade', '/politica-de-cookies', '/lgpd', '/contato', '/suporte', '/central-de-ajuda', '/status'].some(r => location.pathname.startsWith(r));

  const requiresBilling = flags?.requires_billing ?? false;

  if (!isAuthenticated || !requiresBilling || loading || isOnSettingsPage || isOnPlanosPage || isPublicRoute) {
    return null;
  }

  return (
    <Dialog open modal>
      <DialogContent 
        className="sm:max-w-md p-0 gap-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="bg-primary/5 border-b border-primary/10 px-6 py-5 text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Dados Fiscais Pendentes</h2>
          <Badge variant="outline" className="mt-2 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Pagamento confirmado
          </Badge>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Para ativar sua conta e emitir notas fiscais, precisamos dos seus dados cadastrais.
            Preencha as informações de Pessoa Física ou Jurídica nas configurações.
          </p>

          <div className="space-y-2">
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => navigate('/settings')}
            >
              <FileText className="w-4 h-4 mr-2" />
              Preencher dados fiscais
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-muted/30 border-t text-center">
          <p className="text-xs text-muted-foreground">
            Seus dados são necessários para emissão de nota fiscal.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
