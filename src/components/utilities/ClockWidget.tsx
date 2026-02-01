import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClockWidgetProps {
  timezone?: string;
  hourFormat?: '12h' | '24h';
  variant?: 'compact' | 'full';
  className?: string;
}

export function ClockWidget({
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  hourFormat = '24h',
  variant = 'compact',
  className,
}: ClockWidgetProps) {
  const { i18n } = useTranslation();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formattedTime = useMemo(() => {
    return new Intl.DateTimeFormat(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      second: variant === 'full' ? '2-digit' : undefined,
      hour12: hourFormat === '12h',
      timeZone: timezone,
    }).format(currentTime);
  }, [currentTime, i18n.language, hourFormat, timezone, variant]);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat(i18n.language, {
      weekday: variant === 'full' ? 'long' : 'short',
      day: 'numeric',
      month: variant === 'full' ? 'long' : 'short',
      year: variant === 'full' ? 'numeric' : undefined,
      timeZone: timezone,
    }).format(currentTime);
  }, [currentTime, i18n.language, timezone, variant]);

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Clock className="h-4 w-4" />
        <span className="font-medium tabular-nums">{formattedTime}</span>
        <span className="hidden sm:inline text-xs">•</span>
        <span className="hidden sm:inline text-xs">{formattedDate}</span>
      </div>
    );
  }

  return (
    <div className={cn('p-4 rounded-lg border bg-card', className)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Clock className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{formattedTime}</div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
