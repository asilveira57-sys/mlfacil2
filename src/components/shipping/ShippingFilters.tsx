import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Clock } from 'lucide-react';
import { FinalStatus, PeriodFilter } from '@/hooks/useShippingLabels';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ShippingFiltersProps {
  statusFilter: FinalStatus;
  setStatusFilter: (status: FinalStatus) => void;
  periodFilter: PeriodFilter;
  setPeriodFilter: (period: PeriodFilter) => void;
  statusCounts: Record<FinalStatus, number>;
  isSyncing: boolean;
  onSync: () => void;
  lastSyncAt: string | null;
}

const STATUS_LABELS: Record<FinalStatus, string> = {
  all: 'Todos',
  pronta: 'Prontas para imprimir',
  aguardando_nf: 'Aguardando NF',
  sem_etiqueta: 'Sem etiqueta',
  erro: 'Erro',
};

const STATUS_VARIANTS: Record<FinalStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  all: 'outline',
  pronta: 'default',
  aguardando_nf: 'secondary',
  sem_etiqueta: 'outline',
  erro: 'destructive',
};

const PERIOD_OPTIONS: PeriodFilter[] = [7, 15, 30, 90];

export function ShippingFilters({
  statusFilter,
  setStatusFilter,
  periodFilter,
  setPeriodFilter,
  statusCounts,
  isSyncing,
  onSync,
  lastSyncAt,
}: ShippingFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Top bar with period and sync */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Período:</span>
          {PERIOD_OPTIONS.map((period) => (
            <Button
              key={period}
              variant={periodFilter === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodFilter(period)}
            >
              {period} dias
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {lastSyncAt && (
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
