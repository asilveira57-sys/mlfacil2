import { useState, useCallback, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  useCalendarEvents,
  useCalendarPreferences,
  useCurrentUser,
  logCalendarEngagement,
  SocialCalendarEvent,
} from '@/hooks/useSocialCalendar';
import { useBrFeriados, BrFeriado } from '@/hooks/useBrLocation';
import { SocialCalendarIdeasDrawer } from './SocialCalendarIdeasDrawer';

const CATEGORY_COLORS: Record<string, string> = {
  tematica: 'bg-blue-500/15 text-blue-700 border-blue-200',
  feriado: 'bg-red-500/15 text-red-700 border-red-200',
  comercial: 'bg-green-500/15 text-green-700 border-green-200',
  sazonal: 'bg-orange-500/15 text-orange-700 border-orange-200',
};

const CATEGORY_DOT: Record<string, string> = {
  tematica: 'bg-blue-500',
  feriado: 'bg-red-500',
  comercial: 'bg-green-500',
  sazonal: 'bg-orange-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  tematica: 'Temática',
  feriado: 'Feriado',
  comercial: 'Comercial',
  sazonal: 'Sazonal',
};

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_VISIBLE_EVENTS = 2;

/** Convert BrFeriado to SocialCalendarEvent for display */
function feriadoToEvent(f: BrFeriado): SocialCalendarEvent {
  return {
    id: f.id,
    source: 'br_feriados',
    country_code: 'BR',
    event_date: f.data,
    title: f.nome,
    description: f.descricao,
    tags: [f.tipo.toLowerCase()],
    category: 'feriado',
    is_active: true,
    created_at: '',
    updated_at: '',
  };
}

export function SocialCalendarMainView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<SocialCalendarEvent | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const userId = useCurrentUser();

  const { data: preferences } = useCalendarPreferences();
  const countryCode = preferences?.country_code ?? 'BR';
  const userUf = (preferences as any)?.uf as string | null | undefined;
  const userCodigoIbge = (preferences as any)?.codigo_ibge as number | null | undefined;

  const { data: events = [], isLoading } = useCalendarEvents(currentMonth, countryCode);
  const { data: brFeriados = [] } = useBrFeriados(currentMonth, userUf, userCodigoIbge);

  // Merge events + feriados BR, deduplicate by title+date
  const allEvents = useMemo(() => {
    const feriadoEvents = brFeriados.map(feriadoToEvent);
    const merged = [...events];
    const existingKeys = new Set(events.map((e) => `${e.event_date}|${e.title.toLowerCase()}`));

    for (const fe of feriadoEvents) {
      const key = `${fe.event_date}|${fe.title.toLowerCase()}`;
      if (!existingKeys.has(key)) {
        merged.push(fe);
        existingKeys.add(key);
      }
    }

    return merged.sort((a, b) => a.event_date.localeCompare(b.event_date));
  }, [events, brFeriados]);

  // Group events by date
  const eventsByDate = useMemo(() => allEvents.reduce<Record<string, SocialCalendarEvent[]>>((acc, ev) => {
    const key = ev.event_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {}), [allEvents]);

  // Build grid weeks
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { locale: ptBR });
    const gridEnd = endOfWeek(monthEnd, { locale: ptBR });
    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

    const result: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      result.push(allDays.slice(i, i + 7));
    }
    return result;
  }, [currentMonth]);

  const handleOpenIdeas = useCallback(async (event: SocialCalendarEvent) => {
    setSelectedEvent(event);
    setIdeasOpen(true);
    await logCalendarEngagement(userId, 'click', event.id, { title: event.title });
  }, [userId]);

  return (
    <div className="space-y-2 max-w-4xl mx-auto">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <h2 className="text-base font-semibold capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </h2>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 text-sm">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <span key={key} className={cn('px-1.5 py-0 rounded-full border text-[10px] font-medium', CATEGORY_COLORS[key])}>
            {label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground animate-pulse text-sm">Carregando calendário...</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 bg-muted/50">
            {WEEKDAY_HEADERS.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1 border-b">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayEvents = eventsByDate[dateKey] ?? [];
                const inMonth = isSameMonth(day, currentMonth);
                const today = isToday(day);
                const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
                const overflowCount = dayEvents.length - MAX_VISIBLE_EVENTS;

                return (
                  <div
                    key={dateKey}
                    className={cn(
                      'min-h-[44px] border-b border-r p-0.5 flex flex-col gap-0.5 transition-colors',
                      !inMonth && 'bg-muted/30',
                      today && 'bg-primary/5',
                    )}
                  >
                    {/* Day number */}
                    <div className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold self-end',
                      today && 'bg-primary text-primary-foreground',
                      !today && inMonth && 'text-foreground',
                      !today && !inMonth && 'text-muted-foreground/40',
                    )}>
                      {format(day, 'd')}
                    </div>

                    {/* Event badges – desktop */}
                    <div className="hidden sm:flex flex-col gap-0.5 flex-1 min-w-0">
                      {visibleEvents.map((ev) => (
                        <button
                          key={ev.id}
                          onClick={() => handleOpenIdeas(ev)}
                          className={cn(
                            'text-[9px] leading-tight px-1 py-px rounded border truncate text-left font-medium hover:opacity-80 transition-opacity',
                            CATEGORY_COLORS[ev.category],
                          )}
                          title={ev.title}
                        >
                          {ev.title}
                        </button>
                      ))}

                      {overflowCount > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-[10px] text-muted-foreground hover:text-foreground font-medium text-left px-1">
                              +{overflowCount} mais
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2 space-y-1" align="start">
                            <p className="text-xs font-semibold text-muted-foreground mb-1">
                              {format(day, "dd 'de' MMMM", { locale: ptBR })}
                            </p>
                            {dayEvents.map((ev) => (
                              <button
                                key={ev.id}
                                onClick={() => handleOpenIdeas(ev)}
                                className={cn(
                                  'w-full text-xs px-2 py-1 rounded border truncate text-left font-medium hover:opacity-80 transition-opacity',
                                  CATEGORY_COLORS[ev.category],
                                )}
                              >
                                {ev.title}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>

                    {/* Event dots – mobile */}
                    {dayEvents.length > 0 && (
                      <div className="flex sm:hidden gap-0.5 flex-wrap mt-auto">
                        {dayEvents.slice(0, 4).map((ev) => (
                          <button
                            key={ev.id}
                            onClick={() => handleOpenIdeas(ev)}
                            className={cn('w-2 h-2 rounded-full', CATEGORY_DOT[ev.category])}
                            title={ev.title}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
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
