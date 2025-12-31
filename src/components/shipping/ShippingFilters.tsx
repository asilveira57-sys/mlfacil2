import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RefreshCw, Clock, CalendarIcon, Search, X } from 'lucide-react';
import { FinalStatus, PeriodFilter, SyncPhase, DateRange } from '@/hooks/useShippingLabels';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Filter status types (only the ones shown as filter chips)
type FilterStatus = 'all' | 'pronta' | 'aguardando_nf' | 'reimprimir';

interface ShippingFiltersProps {
  statusFilter: FinalStatus;
  setStatusFilter: (status: FinalStatus) => void;
  periodFilter: PeriodFilter;
  setPeriodFilter: (period: PeriodFilter) => void;
  customDateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusCounts: { all: number; pronta: number; aguardando_nf: number; reimprimir: number };
  isSyncing: boolean;
  syncPhase?: SyncPhase;
  syncProgress?: string;
  onSync: () => void;
  lastSyncAt: string | null;
  totalCount: number;
}

const STATUS_LABELS: Record<FilterStatus, string> = {
  all: 'Todos',
  pronta: 'Para imprimir',
  aguardando_nf: 'Aguardando NF',
  reimprimir: 'Reimprimir',
};

const STATUS_VARIANTS: Record<FilterStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  all: 'outline',
  pronta: 'default',
  aguardando_nf: 'secondary',
  reimprimir: 'outline',
};

type QuickPeriod = Exclude<PeriodFilter, 'custom'>;

const PERIOD_OPTIONS: { value: QuickPeriod; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '15d', label: '15 dias' },
  { value: '30d', label: '30 dias' },
];

// Phase labels kept for reference but not displayed anymore
// const PHASE_LABELS: Record<SyncPhase, string> = { ... };

export function ShippingFilters({
  statusFilter,
  setStatusFilter,
  periodFilter,
  setPeriodFilter,
  customDateRange,
  setDateRange,
  searchQuery,
  setSearchQuery,
  statusCounts,
  isSyncing,
  syncPhase = 'idle',
  syncProgress = '',
  onSync,
  lastSyncAt,
  totalCount,
}: ShippingFiltersProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const handleQuickPeriod = (period: PeriodFilter) => {
    setPeriodFilter(period);
    if (period !== 'custom') {
      setDateRange({ from: null, to: null });
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    if (!customDateRange.from || (customDateRange.from && customDateRange.to)) {
      // Start new range
      setDateRange({ from: date, to: null });
    } else {
      // Complete range
      if (date < customDateRange.from) {
        setDateRange({ from: date, to: customDateRange.from });
      } else {
        setDateRange({ from: customDateRange.from, to: date });
      }
      setDatePickerOpen(false);
    }
  };

  const formatDateRange = () => {
    if (!customDateRange.from) return 'Selecionar período';
    if (!customDateRange.to) return format(customDateRange.from, 'dd/MM/yyyy', { locale: ptBR });
    return `${format(customDateRange.from, 'dd/MM/yyyy', { locale: ptBR })} - ${format(customDateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`;
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar pedido, comprador ou destinatário..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Top bar with period and sync */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Período:</span>
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={periodFilter === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleQuickPeriod(option.value)}
              disabled={isSyncing}
            >
              {option.label}
            </Button>
          ))}
          
          {/* Custom date range picker */}
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={periodFilter === 'custom' ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'min-w-[140px] justify-start text-left font-normal',
                  periodFilter === 'custom' && 'bg-primary text-primary-foreground'
                )}
                disabled={isSyncing}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {periodFilter === 'custom' ? formatDateRange() : 'Personalizado'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-3 border-b">
                <p className="text-sm text-muted-foreground">
                  {!customDateRange.from 
                    ? 'Selecione a data inicial' 
                    : !customDateRange.to 
                      ? 'Selecione a data final' 
                      : 'Período selecionado'}
                </p>
                {customDateRange.from && (
                  <p className="text-sm font-medium mt-1">
                    {formatDateRange()}
                  </p>
                )}
              </div>
              <Calendar
                mode="single"
                selected={customDateRange.to || customDateRange.from || undefined}
                onSelect={handleDateSelect}
                locale={ptBR}
                disabled={(date) => date > new Date()}
                modifiers={{
                  range_start: customDateRange.from || undefined,
                  range_end: customDateRange.to || undefined,
                  range_middle: customDateRange.from && customDateRange.to
                    ? { from: customDateRange.from, to: customDateRange.to }
                    : undefined,
                }}
                modifiersStyles={{
                  range_start: { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' },
                  range_end: { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' },
                  range_middle: { backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' },
                }}
                className="pointer-events-auto"
              />
              {(customDateRange.from || customDateRange.to) && (
                <div className="p-3 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setDateRange({ from: null, to: null });
                      setPeriodFilter('all');
                      setDatePickerOpen(false);
                    }}
                  >
                    Limpar período
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-3">
          {/* Last sync time - always visible */}
          {lastSyncAt && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {formatDistanceToNow(new Date(lastSyncAt), { 
                  addSuffix: true, 
                  locale: ptBR 
                })}
              </span>
            </div>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onSync}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin text-primary' : ''}`} />
            {!isSyncing && 'Atualizar'}
          </Button>
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as FilterStatus[]).map((status) => (
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
        
        <span className="text-sm text-muted-foreground">
          {totalCount} pedido{totalCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
