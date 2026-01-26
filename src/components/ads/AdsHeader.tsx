import { RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdsSyncState, useAdsAlerts } from '@/hooks/useAds';

interface AdsHeaderProps {
  sellerId?: string;
}

export function AdsHeader({ sellerId }: AdsHeaderProps) {
  const { syncState, triggerSync } = useAdsSyncState(sellerId);
  const { unreadCount } = useAdsAlerts(sellerId);

  const isSyncing = syncState?.status === 'syncing';
  const lastSync = syncState?.last_sync_at
    ? new Date(syncState.last_sync_at).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <TrendingUp className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mercado ADS</h1>
          <p className="text-sm text-muted-foreground">
            Análise inteligente de publicidade
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {unreadCount > 0 && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {unreadCount} alertas
          </Badge>
        )}

        {lastSync && (
          <span className="text-xs text-muted-foreground">
            Última sync: {lastSync}
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={triggerSync}
          disabled={isSyncing || !sellerId}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </Button>
      </div>
    </div>
  );
}
