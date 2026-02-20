import { useState, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Lightbulb, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useCalendarEvents,
  useCalendarPreferences,
  useCurrentUser,
  logCalendarEngagement,
  SocialCalendarEvent,
} from '@/hooks/useSocialCalendar';
import { SocialCalendarIdeasDrawer } from './SocialCalendarIdeasDrawer';

const CATEGORY_COLORS: Record<string, string> = {
  tematica: 'bg-blue-500/15 text-blue-700 border-blue-200',
  feriado: 'bg-red-500/15 text-red-700 border-red-200',
  comercial: 'bg-green-500/15 text-green-700 border-green-200',
  sazonal: 'bg-orange-500/15 text-orange-700 border-orange-200',
};

const CATEGORY_LABELS: Record<string, string> = {
  tematica: 'Temática',
  feriado: 'Feriado',
  comercial: 'Comercial',
  sazonal: 'Sazonal',
};

export function SocialCalendarMainView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<SocialCalendarEvent | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const userId = useCurrentUser();

  const { data: preferences } = useCalendarPreferences();
  const countryCode = preferences?.country_code ?? 'BR';
  const { data: events = [], isLoading } = useCalendarEvents(currentMonth, countryCode);

  // Group events by date
  const eventsByDate = events.reduce<Record<string, SocialCalendarEvent[]>>((acc, ev) => {
    const key = ev.event_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  // Days in current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const handleOpenIdeas = useCallback(async (event: SocialCalendarEvent) => {
    setSelectedEvent(event);
    setIdeasOpen(true);
    await logCalendarEngagement(userId, 'click', event.id, { title: event.title });
  }, [userId]);

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </h2>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-sm">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <span key={key} className={cn('px-2 py-0.5 rounded-full border text-xs font-medium', CATEGORY_COLORS[key])}>
            {label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground animate-pulse">Carregando calendário...</div>
      ) : (
        <div className="space-y-2">
          {days.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDate[dateKey] ?? [];
            const isToday = dateKey === format(new Date(), 'yyyy-MM-dd');

            return (
              <div
                key={dateKey}
                className={cn(
                  'border rounded-xl p-3 transition-colors',
                  isToday ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                  dayEvents.length === 0 && 'opacity-60'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Day number */}
                  <div className={cn(
                    'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm',
                    isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    {format(day, 'd')}
                  </div>

                  {/* Events for this day */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1 capitalize">
                      {format(day, 'EEEE', { locale: ptBR })}
                    </p>
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-muted-foreground/50 italic">Sem eventos</p>
                    ) : (
                      <div className="space-y-2">
                        {dayEvents.map((ev) => (
                          <div key={ev.id} className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge
                                variant="outline"
                                className={cn('text-xs shrink-0', CATEGORY_COLORS[ev.category])}
                              >
                                {CATEGORY_LABELS[ev.category]}
                              </Badge>
                              <span className="text-sm font-medium truncate">{ev.title}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs shrink-0"
                              onClick={() => handleOpenIdeas(ev)}
                            >
                              <Lightbulb className="h-3 w-3" />
                              Ver ideias
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ideas Drawer */}
      {selectedEvent && (
        <SocialCalendarIdeasDrawer
          open={ideasOpen}
          onClose={() => setIdeasOpen(false)}
          event={selectedEvent}
          preferences={preferences}
        />
      )}
    </div>
  );
}
