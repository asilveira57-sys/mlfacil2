import { useCallback, useRef } from 'react';
import { MercadoTelemetryEvent } from '@/types/mercado';

const MAX_EVENTS = 100;

export function useMercadoTelemetry() {
  const events = useRef<MercadoTelemetryEvent[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const log = useCallback((event: MercadoTelemetryEvent) => {
    events.current.push(event);
    if (events.current.length > MAX_EVENTS) {
      events.current.shift();
    }
    
    // In development, log to console
    if (import.meta.env.DEV) {
      console.log('[Mercado Telemetry]', event);
    }
  }, []);

  const startTimer = useCallback((key: string) => {
    timers.current.set(key, performance.now());
  }, []);

  const endTimer = useCallback((
    key: string,
    eventType: string,
    categoryId?: string,
    dataType?: 'details' | 'metrics',
    cacheSource?: 'memory' | 'db' | 'network'
  ) => {
    const start = timers.current.get(key);
    if (start === undefined) return;

    const duration = Math.round(performance.now() - start);
    timers.current.delete(key);

    log({
      event_type: eventType,
      category_id: categoryId,
      data_type: dataType,
      cache_source: cacheSource,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    return duration;
  }, [log]);

  const getStats = useCallback(() => {
    const recentEvents = events.current.slice(-50);
    
    const cacheHits = recentEvents.filter(e => e.event_type === 'cache_hit').length;
    const cacheMisses = recentEvents.filter(e => e.event_type === 'cache_miss').length;
    const totalRequests = cacheHits + cacheMisses;
    
    const avgDrawerOpen = recentEvents
      .filter(e => e.event_type === 'drawer_open')
      .reduce((acc, e, _, arr) => acc + e.duration_ms / arr.length, 0);

    return {
      cacheHitRate: totalRequests > 0 ? (cacheHits / totalRequests * 100).toFixed(1) : '0',
      avgDrawerOpenMs: Math.round(avgDrawerOpen),
      totalEvents: events.current.length,
      recentEvents: recentEvents.slice(-10),
    };
  }, []);

  return {
    log,
    startTimer,
    endTimer,
    getStats,
  };
}
