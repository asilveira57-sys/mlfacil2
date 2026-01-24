import { useCallback, useRef } from 'react';
import { TelemetryEvent } from '@/types/trends-explorer';

const MAX_LOGS = 100;

export function useTrendsTelemetry() {
  const logs = useRef<TelemetryEvent[]>([]);
  const startTimes = useRef<Map<string, number>>(new Map());

  // Log a telemetry event
  const log = useCallback((event: TelemetryEvent) => {
    logs.current.push(event);
    
    // Keep only last N logs
    if (logs.current.length > MAX_LOGS) {
      logs.current = logs.current.slice(-MAX_LOGS);
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.log('[Telemetry]', event.event_type, {
        category: event.category_id,
        type: event.data_type,
        duration: `${event.duration_ms.toFixed(0)}ms`,
        cache: event.cache_layer,
      });
    }
  }, []);

  // Start timing an operation
  const startTimer = useCallback((key: string) => {
    startTimes.current.set(key, performance.now());
  }, []);

  // End timing and log
  const endTimer = useCallback((
    key: string,
    eventType: TelemetryEvent['event_type'],
    categoryId: string,
    dataType: 'details' | 'metrics',
    cacheLayer?: 'memory' | 'db' | 'network'
  ) => {
    const startTime = startTimes.current.get(key);
    if (!startTime) return;

    const duration = performance.now() - startTime;
    startTimes.current.delete(key);

    log({
      event_type: eventType,
      category_id: categoryId,
      data_type: dataType,
      duration_ms: duration,
      cache_layer: cacheLayer,
      timestamp: new Date().toISOString(),
    });

    return duration;
  }, [log]);

  // Get aggregated stats
  const getStats = useCallback(() => {
    const stats = {
      total_events: logs.current.length,
      avg_drawer_open_ms: 0,
      avg_kpis_loaded_ms: 0,
      avg_lists_loaded_ms: 0,
      cache_hit_rate: 0,
    };

    const drawerOpenTimes: number[] = [];
    const kpiTimes: number[] = [];
    const listTimes: number[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    logs.current.forEach(event => {
      switch (event.event_type) {
        case 'drawer_open':
          drawerOpenTimes.push(event.duration_ms);
          break;
        case 'kpis_loaded':
          kpiTimes.push(event.duration_ms);
          break;
        case 'lists_loaded':
          listTimes.push(event.duration_ms);
          break;
        case 'cache_hit':
          cacheHits++;
          break;
        case 'cache_miss':
          cacheMisses++;
          break;
      }
    });

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    stats.avg_drawer_open_ms = avg(drawerOpenTimes);
    stats.avg_kpis_loaded_ms = avg(kpiTimes);
    stats.avg_lists_loaded_ms = avg(listTimes);
    stats.cache_hit_rate = (cacheHits + cacheMisses) > 0 
      ? cacheHits / (cacheHits + cacheMisses) 
      : 0;

    return stats;
  }, []);

  // Export logs for debugging
  const exportLogs = useCallback(() => {
    return [...logs.current];
  }, []);

  // Clear logs
  const clearLogs = useCallback(() => {
    logs.current = [];
    startTimes.current.clear();
  }, []);

  return {
    log,
    startTimer,
    endTimer,
    getStats,
    exportLogs,
    clearLogs,
  };
}
