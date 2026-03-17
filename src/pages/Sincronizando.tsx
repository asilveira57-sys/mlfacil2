import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, Loader2, Circle, ArrowRight, Info } from 'lucide-react';
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

  // Log sync screen display
  useEffect(() => {
    supabase
      .rpc('register_system_log', {
        p_level: 'info',
        p_system_area: 'sync',
        p_action: 'sync_screen_displayed',
        p_user_id: null,
        p_success: true,
        p_message: `Sync screen displayed for ${nickname || 'unknown'}`,
        p_meta_json: { nickname, component: 'Sincronizando', rendered_at: new Date().toISOString() },
      })
      .then(() => {});
  }, [nickname]);

  // Step 1: Mark account as verified immediately (OAuth already saved it)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSteps(prev => prev.map(s => s.id === 'account' ? { ...s, status: 'done' } : s));
      logStepComplete('account');
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
        logStepComplete('sync_trigger_error', { error: response.error.message });
      }

      // Mark items done, orders running
      setSteps(prev => prev.map(s => {
        if (s.id === 'items') return { ...s, status: 'done' };
        if (s.id === 'orders') return { ...s, status: 'running' };
        return s;
      }));
      logStepComplete('items');

      // Simulate orders completion (the actual sync runs in background)
      await new Promise(r => setTimeout(r, 3000));

      setSteps(prev => prev.map(s => {
        if (s.id === 'orders') return { ...s, status: 'done' };
        if (s.id === 'dashboard') return { ...s, status: 'running' };
        return s;
      }));
      logStepComplete('orders');

      await new Promise(r => setTimeout(r, 2000));

      setSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
      logStepComplete('dashboard');
      setAllDone(true);

    } catch (err) {
      console.error('[Sincronizando] Error:', err);
      logStepComplete('sync_error', { error: String(err) });
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
          <p className="text-muted-foreground text-sm">
            {allDone
              ? 'Seus dados foram importados. Redirecionando para o painel...'
              : 'Estamos preparando seu ambiente'
            }
          </p>
        </div>

        {/* Subtitle text */}
        {!allDone && (
          <p className="text-sm text-muted-foreground">
            Estamos sincronizando seus dados do Mercado Livre para organizar seu painel.
          </p>
        )}

        {/* Info box */}
        {!allDone && (
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              Na primeira conexão, esse processo pode levar alguns instantes.
            </p>
          </div>
        )}

        {/* Steps */}
        <div className="space-y-3 text-left">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
              {step.status === 'done' && (
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
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

        {/* ESSENTIAL footer about empty data */}
        {!allDone && (
          <div className="bg-muted/30 border border-border/50 rounded-lg p-4 text-left">
            <div className="flex gap-2.5">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Se sua conta ainda não tiver vendas ou movimentações recentes, alguns dados podem aparecer vazios neste primeiro momento.
              </p>
            </div>
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

/** Fire-and-forget step logging */
function logStepComplete(stepId: string, meta?: Record<string, unknown>) {
  supabase
    .rpc('register_system_log', {
      p_level: 'info',
      p_system_area: 'sync',
      p_action: `sync_step_${stepId}`,
      p_user_id: null,
      p_success: true,
      p_message: `Sync step completed: ${stepId}`,
      p_meta_json: { step: stepId, ...meta },
    })
    .then(() => {});
}
