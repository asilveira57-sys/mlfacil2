import { lazy, Suspense } from 'react';

// Inline mini-widgets for catalog items
const ClockMini = lazy(() => import('./widgets/ClockMini'));
const WeatherMini = lazy(() => import('./widgets/WeatherMini'));
const CalculatorMini = lazy(() => import('./widgets/CalculatorMini'));
const NotesMini = lazy(() => import('./widgets/NotesMini'));
const TasksMini = lazy(() => import('./widgets/TasksMini'));
const CalendarMini = lazy(() => import('./widgets/CalendarMini'));
const StopwatchMini = lazy(() => import('./widgets/StopwatchMini'));
const CountdownMini = lazy(() => import('./widgets/CountdownMini'));
const PlaceholderWidget = lazy(() => import('./widgets/PlaceholderWidget'));

interface Props {
  slug: string;
  config: Record<string, any>;
  size: { w: number; h: number };
}

const WIDGET_MAP: Record<string, React.LazyExoticComponent<any>> = {
  clock: ClockMini,
  weather: WeatherMini,
  calculator: CalculatorMini,
  notes: NotesMini,
  tasks: TasksMini,
  calendar: CalendarMini,
  stopwatch: StopwatchMini,
  countdown: CountdownMini,
};

export function WidgetRenderer({ slug }: Props) {
  const Component = WIDGET_MAP[slug] ?? PlaceholderWidget;

  return (
    <Suspense fallback={<div className="h-20 animate-pulse rounded bg-muted/50" />}>
      <Component />
    </Suspense>
  );
}
