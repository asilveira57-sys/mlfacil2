import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, Loader2, Circle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SyncStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

const INITIAL_STEPS: SyncStep[] = [
  { id: 'account', label: 'Verificando sua conta', status: 'pending' },
  { id: 'items', label: 'Importando anúncios', status: 'pending' },
  { id: 'orders', label: 'Importando vendas recentes', status: 'pending' },
  { id: 'dashboard', label: 'Preparando seu painel', status: 'pending' },
];

export default function Sincronizando() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [steps, setSteps] = useState<SyncStep[]>(INITIAL_STEPS);
  const [syncTriggered, setSyncTriggered] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const nickname = searchParams.get('nickname') || '';

  // Step 1: Mark account as verified immediately (OAuth already saved it)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSteps(prev => prev.map(s => s.id === 'account' ? { ...s, status: 'done' } : s));
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Step 2: Trigger actual sync after account verification
  const triggerSync = useCallback(async () => {
    if (syncTriggered) return;
    setSyncTriggered(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      // Mark items step as running
      setSteps(prev => prev.map(s => s.id === 'items' ? { ...s, status: 'running' } : s));

      // Trigger the 30-day order sync (which also syncs items)
      const response = await supabase.functions.invoke('ml-sync-orders', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) {
        console.error('[Sincronizando] Sync trigger error:', response.error);
      }

      // Mark items done, orders running
      setSteps(prev => prev.map(s => {
        if (s.id === 'items') return { ...s, status: 'done' };
        if (s.id === 'orders') return { ...s, status: 'running' };
        return s;
      }));

      // Simulate orders completion (the actual sync runs in background)
      await new Promise(r => setTimeout(r, 3000));

      setSteps(prev => prev.map(s => {
        if (s.id === 'orders') return { ...s, status: 'done' };
        if (s.id === 'dashboard') return { ...s, status: 'running' };
        return s;
      }));

      await new Promise(r => setTimeout(r, 2000));

      setSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
      setAllDone(true);

    } catch (err) {
      console.error('[Sincronizando] Error:', err);
      // Even on error, let user proceed to dashboard
      setSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
      setAllDone(true);
    }
  }, [syncTriggered, navigate]);

  // Trigger sync after account step completes
  useEffect(() => {
    const accountStep = steps.find(s => s.id === 'account');
    if (accountStep?.status === 'done' && !syncTriggered) {
      triggerSync();
    }
  }, [steps, syncTriggered, triggerSync]);

  // Auto-redirect after all done
  useEffect(() => {
    if (allDone) {
      const timer = setTimeout(() => navigate('/dashboard'), 4000);
      return () => clearTimeout(timer);
    }
  }, [allDone, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Animated sync icon */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-20" />
          <div className="relative w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            {allDone ? (
              <CheckCircle className="w-10 h-10 text-primary" />
            ) : (
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            )}
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            {allDone ? 'Tudo pronto!' : 'Conta conectada com sucesso'}
          </h1>
          {nickname && (
            <p className="text-sm text-primary font-medium">{nickname}</p>
          )}
          <p className="text-muted-foreground">
            {allDone
              ? 'Seus dados foram importados. Redirecionando para o painel...'
              : 'Estamos importando seus dados do Mercado Livre.'
            }
          </p>
        </div>

        {/* Info box */}
        {!allDone && (
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              Na primeira conexão o sistema precisa sincronizar algumas informações da sua conta.
            </p>
          </div>
        )}

        {/* Steps */}
        <div className="space-y-3 text-left">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
              {step.status === 'done' && (
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              )}
              {step.status === 'running' && (
                <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
              )}
              {step.status === 'pending' && (
                <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />
              )}
              <span className={`text-sm ${
                step.status === 'done' ? 'text-foreground' :
                step.status === 'running' ? 'text-foreground font-medium' :
                'text-muted-foreground'
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom message */}
        {!allDone && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Estamos atualizando seus dados.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Em alguns minutos o sistema estará totalmente disponível.
            </p>
          </div>
        )}

        {/* CTA Button */}
        <Button
          onClick={() => navigate('/dashboard')}
          variant={allDone ? 'default' : 'outline'}
          className="w-full"
        >
          Ir para o dashboard
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
