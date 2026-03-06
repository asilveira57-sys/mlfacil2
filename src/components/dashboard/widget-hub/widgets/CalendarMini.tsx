import { useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CalendarMini() {
  const [current, setCurrent] = useState(new Date());
  const today = new Date();
  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const start = startOfWeek(monthStart, { weekStartsOn: 0 });
  const end = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let d = start;
  while (d <= end) { days.push(d); d = addDays(d, 1); }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1))}>
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <span className="text-xs font-medium capitalize">{format(current, 'MMMM yyyy', { locale: ptBR })}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1))}>
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['D','S','T','Q','Q','S','S'].map((l,i) => <div key={i} className="text-[10px] text-muted-foreground font-medium">{l}</div>)}
        {days.map((day, i) => (
          <div key={i} className={cn(
            'text-[11px] h-6 flex items-center justify-center rounded-sm',
            !isSameMonth(day, current) && 'text-muted-foreground/40',
            isSameDay(day, today) && 'bg-primary text-primary-foreground font-bold',
          )}>
            {format(day, 'd')}
          </div>
        ))}
      </div>
    </div>
  );
}
