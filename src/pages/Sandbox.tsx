import { useEffect, useCallback, useState } from 'react';
import { useSandboxSnapshots } from '@/hooks/useSandboxSnapshots';
import { useOperationalQuickSync, type QuickSyncStatus } from '@/hooks/useOperationalQuickSync';
import { SandboxGlobalSummary } from '@/components/sandbox/SandboxGlobalSummary';
import { SandboxCompanyCard } from '@/components/sandbox/SandboxCompanyCard';
import { RefreshCw, LayoutGrid, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ── Smart grid logic ─────────────────────────────────────────────────────────
function getGridClass(count: number): string {
  if (count === 1) return 'grid-cols-1 max-w-md mx-auto';
  if (count === 2) return 'grid-cols-2';
  if (count === 3) return 'grid-cols-3';
  if (count === 4) return 'grid-cols-2';
  // 5: use 6-column grid so first 3 = 2/6 each, last 2 = 3/6 each (centered)
  if (count === 5) return 'grid-cols-6';
  return 'grid-cols-3'; // 6, 7, 8, 9+
}

function getItemClass(index: number, total: number): string {
  if (total === 5) {
    return index < 3 ? 'col-span-2' : 'col-span-3';
  }
  return '';
}

async function logSandboxEvent(action: string, meta: Record<string, unknown> = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase.from('system_logs').insert({
      level: 'info',
      system_area: 'sandbox',
      action,
      message: `Sandbox: ${action}`,
      meta_json: { user_id: session.user.id, ...meta },
    });
  } catch { /* fail-safe */ }
}

export default function Sandbox() {
  const { data: snapshots = [], allSnapshots = [], isLoading, refetch } = useSandboxSnapshots();
  const [refreshing, setRefreshing] = useState(false);

  // Usar o primeiro snapshot para o quick sync (multi-empresa: itera internamente)
  const firstSnap = snapshots[0] ?? null;

  const onChangesDetected = useCallback(() => {
    refetch();
    toast.success('Dados operacionais atualizados!', { duration: 2000 });
  }, [refetch]);

  const { status: quickSyncStatus, triggerManualSync } = useOperationalQuickSync({
    sellerId: firstSnap?.seller_id ?? null,
    companyId: firstSnap?.company_id ?? null,
    enabled: snapshots.length > 0,
    onChangesDetected,
  });

  // Log page access on mount
  useEffect(() => {
    logSandboxEvent('page_access');
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      logSandboxEvent('manual_refresh_start', { companies: snapshots.length });

      const { error } = await supabase.functions.invoke('sandbox-snapshot-refresh', {
        body: { user_id: session.user.id },
      });

      if (error) throw error;

      // Também disparar quick sync imediato
      await triggerManualSync();
      await refetch();

      toast.success('Sandbox atualizado!');
      logSandboxEvent('manual_refresh_success', { companies: snapshots.length });
    } catch (e: any) {
      toast.error('Erro ao atualizar: ' + (e.message || 'Erro desconhecido'));
      logSandboxEvent('manual_refresh_error', { error: e.message });
    } finally {
      setRefreshing(false);
    }
  }, [snapshots.length, refetch, triggerManualSync]);

  const count = snapshots.length;
  const gridClass = getGridClass(count);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Sandbox Operacional</h1>
            <p className="text-xs text-muted-foreground">
              Visão geral de todas as suas empresas em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick sync status pill */}
          {snapshots.length > 0 && (
            <QuickSyncPill status={quickSyncStatus} onManualSync={triggerManualSync} />
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : snapshots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LayoutGrid className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-medium text-foreground">Nenhuma empresa encontrada</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Conecte uma conta do Mercado Livre e clique em "Atualizar" para gerar o primeiro snapshot.
          </p>
        </div>
      ) : (
        <>
          <SandboxGlobalSummary snapshots={snapshots} />
          <div className={`grid gap-3 ${gridClass}`}>
            {snapshots.map((snap, i) => (
              <div key={snap.id} className={getItemClass(i, count)}>
                <SandboxCompanyCard
                  snapshot={snap}
                  isQuickSyncing={quickSyncStatus.isRunning}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── QuickSync status pill ────────────────────────────────────────────────────
function QuickSyncPill({
  status,
  onManualSync,
}: {
  status: QuickSyncStatus;
  onManualSync: () => void;
}) {
  if (status.isRunning) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-primary font-medium px-2 py-1 bg-primary/10 rounded-full">
        <Zap className="h-3 w-3 animate-pulse" />
        Sincronizando...
      </span>
    );
  }

  if (status.inCooldown) {
    return (
      <span className="text-[11px] text-muted-foreground px-2 py-1 bg-muted/50 rounded-full">
        Próx. sync em {status.secondsUntilCooldownEnd}s
      </span>
    );
  }

  return (
    <button
      onClick={onManualSync}
      className="flex items-center gap-1.5 text-[11px] text-primary font-medium px-2 py-1 bg-primary/10 rounded-full hover:bg-primary/20 transition-colors"
    >
      <Zap className="h-3 w-3" />
      Atualizar agora
    </button>
  );
}
