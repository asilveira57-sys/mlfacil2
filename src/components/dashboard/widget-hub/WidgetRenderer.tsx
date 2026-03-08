import { lazy, Suspense } from 'react';

// Retry wrapper for lazy imports — handles stale chunk hashes after deploys
function lazyRetry(factory: () => Promise<any>) {
  return lazy(() =>
    factory().catch((err) => {
      console.warn('Lazy import failed, retrying...', err);
      // Force a fresh import by adding a cache-buster
      return new Promise<any>((resolve) => {
        setTimeout(() => resolve(factory()), 1500);
      });
    })
  );
}

// Inline mini-widgets for catalog items
const ClockMini = lazyRetry(() => import('./widgets/ClockMini'));
const WeatherMini = lazyRetry(() => import('./widgets/WeatherMini'));
const CalculatorMini = lazyRetry(() => import('./widgets/CalculatorMini'));
const NotesMini = lazyRetry(() => import('./widgets/NotesMini'));
const TasksMini = lazyRetry(() => import('./widgets/TasksMini'));
const CalendarMini = lazyRetry(() => import('./widgets/CalendarMini'));
const StopwatchMini = lazyRetry(() => import('./widgets/StopwatchMini'));
const CountdownMini = lazyRetry(() => import('./widgets/CountdownMini'));
const DollarRateMini = lazyRetry(() => import('./widgets/DollarRateMini'));
const CryptoRateMini = lazyRetry(() => import('./widgets/CryptoRateMini'));
const NewsMini = lazyRetry(() => import('./widgets/NewsMini'));
const SystemAlertsMini = lazyRetry(() => import('./widgets/SystemAlertsMini'));
const SalesSummaryMini = lazyRetry(() => import('./widgets/SalesSummaryMini'));
const FinancialSummaryMini = lazyRetry(() => import('./widgets/FinancialSummaryMini'));
const RecentOrdersMini = lazyRetry(() => import('./widgets/RecentOrdersMini'));
const ImportantNotificationsMini = lazyRetry(() => import('./widgets/ImportantNotificationsMini'));
const PlaceholderWidget = lazyRetry(() => import('./widgets/PlaceholderWidget'));

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
  'dollar-rate': DollarRateMini,
  'crypto-rate': CryptoRateMini,
  news: NewsMini,
  'system-alerts': SystemAlertsMini,
  'sales-summary': SalesSummaryMini,
  'financial-summary': FinancialSummaryMini,
  'recent-orders': RecentOrdersMini,
  'important-notifications': ImportantNotificationsMini,
};

export function WidgetRenderer({ slug }: Props) {
  const Component = WIDGET_MAP[slug] ?? PlaceholderWidget;

  return (
    <Suspense fallback={<div className="h-20 animate-pulse rounded bg-muted/50" />}>
      <Component />
    </Suspense>
  );
}
