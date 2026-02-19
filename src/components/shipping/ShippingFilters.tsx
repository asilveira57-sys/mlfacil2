import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RefreshCw, Clock, CalendarIcon, Search, X } from 'lucide-react';
import { FinalStatus, PeriodFilter, SyncPhase, DateRange } from '@/hooks/useShippingLabels';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
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

const STATUS_VARIANTS: Record<FilterStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  all: 'outline',
  pronta: 'default',
  aguardando_nf: 'secondary',
  reimprimir: 'outline',
};

type QuickPeriod = Exclude<PeriodFilter, 'custom'>;

const PERIOD_KEYS: { value: QuickPeriod; labelKey: string }[] = [
  { value: 'all', labelKey: 'all' },
  { value: 'today_sales', labelKey: 'today_sales' },
  { value: 'today', labelKey: 'today' },
  { value: '7d', labelKey: 'days_7' },
  { value: '15d', labelKey: 'days_15' },
  { value: '30d', labelKey: 'days_30' },
];

const STATUS_KEYS: { value: FilterStatus; labelKey: string }[] = [
  { value: 'all', labelKey: 'status.all' },
  { value: 'pronta', labelKey: 'status.ready' },
  { value: 'aguardando_nf', labelKey: 'status.waiting_nf' },
  { value: 'reimprimir', labelKey: 'status.reprint' },
];

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
  const { t, i18n } = useTranslation('shipping');
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Get locale for date-fns
  const getDateLocale = () => {
    switch (i18n.language) {
      case 'en': return enUS;
      case 'es': return es;
      default: return ptBR;
    }
  };

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
    if (!customDateRange.from) return t('custom');
    if (!customDateRange.to) return format(customDateRange.from, 'dd/MM/yyyy', { locale: getDateLocale() });
    return `${format(customDateRange.from, 'dd/MM/yyyy', { locale: getDateLocale() })} - ${format(customDateRange.to, 'dd/MM/yyyy', { locale: getDateLocale() })}`;
  };

  const getOrdersCountText = () => {
    return totalCount === 1 
      ? t('orders_count', { count: totalCount })
      : t('orders_count_plural', { count: totalCount });
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('search_placeholder')}
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
          <span className="text-sm text-muted-foreground">{t('period')}:</span>
          {PERIOD_KEYS.map((option) => (
            <Button
              key={option.value}
              variant={periodFilter === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleQuickPeriod(option.value)}
              disabled={isSyncing}
            >
              {t(option.labelKey)}
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
                {periodFilter === 'custom' ? formatDateRange() : t('custom')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-3 border-b">
                <p className="text-sm text-muted-foreground">
                  {!customDateRange.from 
                    ? t('select_start_date') 
                    : !customDateRange.to 
                      ? t('select_end_date') 
                      : t('period_selected')}
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
                locale={getDateLocale()}
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
                    {t('clear_period')}
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
                  locale: getDateLocale() 
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
            {!isSyncing && t('refresh')}
          </Button>
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_KEYS.map((status) => (
            <Badge
              key={status.value}
              variant={statusFilter === status.value ? STATUS_VARIANTS[status.value] : 'outline'}
              className={`cursor-pointer px-3 py-1.5 text-sm ${
                statusFilter === status.value ? '' : 'opacity-70 hover:opacity-100'
              }`}
              onClick={() => setStatusFilter(status.value)}
            >
              {t(status.labelKey)}
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-background/20 text-xs">
                {statusCounts[status.value]}
              </span>
            </Badge>
          ))}
        </div>
        
        <span className="text-sm text-muted-foreground">
          {getOrdersCountText()}
        </span>
      </div>
    </div>
  );
}
