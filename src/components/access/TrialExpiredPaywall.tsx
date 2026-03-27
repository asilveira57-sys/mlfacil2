import { useNavigate, useLocation } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { AlertTriangle, Calendar, CreditCard, ArrowRight, Sparkles } from 'lucide-react';
import { useUserAccess } from '@/contexts/UserAccessContext';

export function TrialExpiredPaywall() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Safely access context - may not be available during error recovery renders
  let contextValue: ReturnType<typeof useUserAccess> | null = null;
  try {
    contextValue = useUserAccess();
  } catch {
    return null;
  }
  
  const { trialExpired, flags, selectedPlan, loading, isAuthenticated } = contextValue;

  // Don't show if user has an active subscription/payment
  const hasActiveSubscription = (flags as any)?.has_active_subscription === true;

  // Don't show on public or excluded pages
  const isOnExcludedPage = [
    '/planos', '/settings', '/auth', '/contato',
    '/home', '/blog', '/suporte', '/central-de-ajuda',
    '/termos-de-uso', '/politica-de-privacidade', '/politica-de-cookies',
    '/lgpd', '/status', '/criar-acesso', '/primeiro-acesso',
  ].some(p => location.pathname.startsWith(p));
  
  // Also exclude exact root path (landing page)
  const isLandingPage = location.pathname === '/';

  // Don't show if not authenticated, trial not expired, has active sub, or on excluded pages
  if (!isAuthenticated || !trialExpired || hasActiveSubscription || loading || isOnExcludedPage || isLandingPage) {
    return null;
  }

  const trialEndDate = flags?.trial_end_at 
    ? new Date(flags.trial_end_at).toLocaleDateString('pt-BR')
    : null;

  return (
    <Dialog open modal>
      <DialogContent 
        className="sm:max-w-md p-0 gap-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="bg-destructive/5 border-b border-destructive/10 px-6 py-5 text-center">
          <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Teste Finalizado</h2>
          {trialEndDate && (
            <Badge variant="outline" className="mt-2 text-xs">
              <Calendar className="w-3 h-3 mr-1" />
              Encerrado em {trialEndDate}
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Seu período de teste de 14 dias chegou ao fim. 
            Para continuar usando todas as funcionalidades, escolha um plano.
          </p>

          {/* Selected plan reminder */}
          {selectedPlan && (
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Plano selecionado</p>
                  <p className="font-semibold text-foreground">{selectedPlan.name}</p>
                </div>
                <Badge className="bg-primary/10 text-primary border-primary/30">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Sua escolha
                </Badge>
              </div>
            </Card>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => navigate('/settings?section=plano')}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              {selectedPlan ? 'Ativar meu plano' : 'Escolher um plano'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            {!selectedPlan && (
              <p className="text-xs text-center text-muted-foreground">
                Planos a partir de R$ 29,90/mês
              </p>
            )}
          </div>
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 bg-muted/30 border-t text-center">
          <p className="text-xs text-muted-foreground">
            Dúvidas? Entre em contato pelo suporte.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
