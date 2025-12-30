import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Clock, Loader2 } from 'lucide-react';
import { FinalStatus, PeriodFilter, SyncPhase } from '@/hooks/useShippingLabels';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ShippingFiltersProps {
  statusFilter: FinalStatus;
  setStatusFilter: (status: FinalStatus) => void;
  periodFilter: PeriodFilter;
  setPeriodFilter: (period: PeriodFilter) => void;
  statusCounts: Record<FinalStatus, number>;
  isSyncing: boolean;
  syncPhase?: SyncPhase;
  syncProgress?: string;
  onSync: () => void;
  lastSyncAt: string | null;
}

const STATUS_LABELS: Record<FinalStatus, string> = {
  all: 'Todos',
  pronta: 'Para imprimir',
  aguardando_nf: 'Aguardando NF',
  reimprimir: 'Reimprimir',
  erro: 'Erro',
};

const STATUS_VARIANTS: Record<FinalStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  all: 'outline',
  pronta: 'default',
  aguardando_nf: 'secondary',
  reimprimir: 'outline',
  erro: 'destructive',
};

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 0, label: 'Hoje' },
  { value: 7, label: '7 dias' },
  { value: 15, label: '15 dias' },
  { value: 30, label: '30 dias' },
];

const PHASE_LABELS: Record<SyncPhase, string> = {
  idle: '',
  orders: 'Buscando pedidos',
  shipments: 'Atualizando envios',
  invoices: 'Atualizando NFs',
  done: 'Concluído',
};

export function ShippingFilters({
  statusFilter,
  setStatusFilter,
  periodFilter,
  setPeriodFilter,
  statusCounts,
  isSyncing,
  syncPhase = 'idle',
  syncProgress = '',
  onSync,
  lastSyncAt,
}: ShippingFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Top bar with period and sync */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Período:</span>
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={periodFilter === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodFilter(option.value)}
              disabled={isSyncing}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {/* Sync progress indicator */}
          {isSyncing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="max-w-[200px] truncate">
                {syncProgress || PHASE_LABELS[syncPhase]}
              </span>
            </div>
          )}

          {/* Last sync time (only show when not syncing) */}
          {!isSyncing && lastSyncAt && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Sincronizado {formatDistanceToNow(new Date(lastSyncAt), { 
                  addSuffix: true, 
                  locale: ptBR 
                })}
              </span>
            </div>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_LABELS) as FinalStatus[]).map((status) => (
          <Badge
            key={status}
            variant={statusFilter === status ? STATUS_VARIANTS[status] : 'outline'}
            className={`cursor-pointer px-3 py-1.5 text-sm ${
              statusFilter === status ? '' : 'opacity-70 hover:opacity-100'
            }`}
            onClick={() => setStatusFilter(status)}
          >
            {STATUS_LABELS[status]}
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-background/20 text-xs">
              {statusCounts[status]}
            </span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
