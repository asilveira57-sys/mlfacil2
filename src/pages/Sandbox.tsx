import { useSandboxSnapshots } from '@/hooks/useSandboxSnapshots';
import { SandboxGlobalSummary } from '@/components/sandbox/SandboxGlobalSummary';
import { SandboxCompanyCard } from '@/components/sandbox/SandboxCompanyCard';
import { RefreshCw, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';

export default function Sandbox() {
  const { data: snapshots = [], isLoading, refetch } = useSandboxSnapshots();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.functions.invoke('sandbox-snapshot-refresh', {
        body: { user_id: user.id },
      });

      if (error) throw error;
      await refetch();
      toast.success('Sandbox atualizado!');
    } catch (e: any) {
      toast.error('Erro ao atualizar: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setRefreshing(false);
    }

    // Log access
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('system_logs').insert({
          level: 'info',
          system_area: 'sandbox',
          action: 'manual_refresh',
          message: 'Manual sandbox refresh triggered',
          meta_json: { user_id: user.id },
        });
      }
    } catch {}
  };

  // Determine grid columns based on count
  const count = snapshots.length;
  let gridClass = 'grid gap-4 ';
  if (count === 1) gridClass += 'grid-cols-1 max-w-2xl mx-auto';
  else if (count === 2) gridClass += 'grid-cols-1 sm:grid-cols-2';
  else gridClass += 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

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
          <div className={gridClass}>
            {snapshots.map((snap) => (
              <SandboxCompanyCard key={snap.id} snapshot={snap} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
