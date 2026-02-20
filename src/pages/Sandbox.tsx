import { useEffect, useCallback } from 'react';
import { useSandboxSnapshots } from '@/hooks/useSandboxSnapshots';
import { SandboxGlobalSummary } from '@/components/sandbox/SandboxGlobalSummary';
import { SandboxCompanyCard } from '@/components/sandbox/SandboxCompanyCard';
import { RefreshCw, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('system_logs').insert({
      level: 'info',
      system_area: 'sandbox',
      action,
      message: `Sandbox: ${action}`,
      meta_json: { user_id: user.id, ...meta },
    });
  } catch { /* fail-safe */ }
}

export default function Sandbox() {
  const { data: snapshots = [], isLoading, refetch } = useSandboxSnapshots();
  const [refreshing, setRefreshing] = useState(false);

  // Log page access on mount
  useEffect(() => {
    logSandboxEvent('page_access');
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      logSandboxEvent('manual_refresh_start', { companies: snapshots.length });

      const { error } = await supabase.functions.invoke('sandbox-snapshot-refresh', {
        body: { user_id: user.id },
      });

      if (error) throw error;
      await refetch();
      toast.success('Sandbox atualizado!');
      logSandboxEvent('manual_refresh_success', { companies: snapshots.length });
    } catch (e: any) {
      toast.error('Erro ao atualizar: ' + (e.message || 'Erro desconhecido'));
      logSandboxEvent('manual_refresh_error', { error: e.message });
    } finally {
      setRefreshing(false);
    }
  }, [snapshots.length, refetch]);

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
                <SandboxCompanyCard snapshot={snap} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
