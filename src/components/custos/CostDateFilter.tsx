import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
  periodDays: number;
}

const QUICK_FILTERS = [
  { label: 'Ontem', days: 1 },
  { label: '7d', days: 7 },
  { label: '15d', days: 15 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: '365d', days: 365 },
];

interface CostDateFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function CostDateFilter({ value, onChange }: CostDateFilterProps) {
  const [customFrom, setCustomFrom] = useState<Date | undefined>(value.from);
  const [customTo, setCustomTo] = useState<Date | undefined>(value.to);
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);

  const handleQuick = (days: number, label: string) => {
    const to = new Date();
    const from = days === 1 ? subDays(to, 1) : subDays(to, days);
    setCustomFrom(from);
    setCustomTo(to);
    onChange({ from, to, label, periodDays: days });
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      const diffMs = customTo.getTime() - customFrom.getTime();
      const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      onChange({
        from: customFrom,
        to: customTo,
        label: `${format(customFrom, 'dd/MM')} - ${format(customTo, 'dd/MM')}`,
        periodDays: diffDays,
      });
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {QUICK_FILTERS.map((f) => (
        <Button
          key={f.days}
          size="sm"
          variant={value.label === f.label ? 'default' : 'outline'}
          className="h-8 px-3 text-xs"
          onClick={() => handleQuick(f.days, f.label)}
        >
          {f.label}
        </Button>
      ))}

      <div className="flex items-center gap-1 ml-1">
        <Popover open={openFrom} onOpenChange={setOpenFrom}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-8 px-2 text-xs justify-start',
                !customFrom && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="h-3 w-3 mr-1" />
              {customFrom ? format(customFrom, 'dd/MM/yy') : 'De'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={customFrom}
              onSelect={(d) => { setCustomFrom(d); setOpenFrom(false); }}
              disabled={(date) => date > new Date()}
              initialFocus
              locale={ptBR}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Popover open={openTo} onOpenChange={setOpenTo}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-8 px-2 text-xs justify-start',
                !customTo && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="h-3 w-3 mr-1" />
              {customTo ? format(customTo, 'dd/MM/yy') : 'Até'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={customTo}
              onSelect={(d) => { setCustomTo(d); setOpenTo(false); }}
              disabled={(date) => date > new Date()}
              initialFocus
              locale={ptBR}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          variant={value.label !== 'Ontem' && !QUICK_FILTERS.some(f => f.label === value.label) ? 'default' : 'outline'}
          className="h-8 px-3 text-xs"
          onClick={handleCustomApply}
          disabled={!customFrom || !customTo}
        >
          Aplicar
        </Button>
      </div>
    </div>
  );
}

export function getDefaultDateRange(): DateRange {
  return {
    from: subDays(new Date(), 30),
    to: new Date(),
    label: '30d',
    periodDays: 30,
  };
}
