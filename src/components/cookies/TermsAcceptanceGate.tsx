import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Shield, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { recordConsentOnServer } from '@/lib/cookies/api';

interface Props {
  children: React.ReactNode;
}

export function TermsAcceptanceGate({ children }: Props) {
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [checking, setChecking] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    checkTermsAcceptance();
  }, []);

  async function checkTermsAcceptance() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setChecking(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_consents')
        .select('id')
        .eq('consent_scope', 'terms')
        .limit(1);

      if (error) {
        console.warn('[Terms] Error checking:', error);
        setChecking(false);
        return;
      }

      setNeedsAcceptance(!data || data.length === 0);
    } catch (err) {
      console.warn('[Terms] Check failed:', err);
    } finally {
      setChecking(false);
    }
  }

  async function handleAcceptTerms() {
    setAccepting(true);
    try {
      const result = await recordConsentOnServer({
        consent_scope: 'terms',
        consent_type: 'accepted',
        source: 'system',
      });

      if (result) {
        setNeedsAcceptance(false);
        toast.success('Termos aceitos com sucesso!');
      } else {
        toast.error('Erro ao registrar aceite. Tente novamente.');
      }
    } catch {
      toast.error('Erro ao registrar aceite');
    } finally {
      setAccepting(false);
    }
  }

  if (checking) return <>{children}</>;

  return (
    <>
      {children}
      <Dialog open={needsAcceptance} onOpenChange={() => {/* Prevent close */}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Aceite dos Termos de Uso
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Para continuar utilizando a plataforma, é necessário aceitar os{' '}
              <Link to="/termos-de-uso" target="_blank" className="text-primary underline hover:text-primary/80">
                Termos de Uso
              </Link>.
            </p>
            <p className="text-xs text-muted-foreground">
              Ao clicar em "Aceitar Termos", você concorda com todas as condições estabelecidas no documento.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={handleAcceptTerms} disabled={accepting} className="w-full">
              {accepting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Aceitar Termos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
