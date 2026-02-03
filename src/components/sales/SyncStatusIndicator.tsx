import { useSyncSchedulerStatus, getMostRecentSyncTime, formatRelativeTime } from '@/hooks/useSyncSchedulerStatus';
import { Clock, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SyncStatusIndicatorProps {
  isBackgroundSyncing?: boolean;
}

export function SyncStatusIndicator({ isBackgroundSyncing }: SyncStatusIndicatorProps) {
  const { nightlyLastRun, hourlyLastRun, nightlyStatus, hourlyStatus, isLoading } = useSyncSchedulerStatus();
  
  const mostRecent = getMostRecentSyncTime(nightlyLastRun, hourlyLastRun);
  const relativeTime = formatRelativeTime(mostRecent);
  
  const isAnyRunning = nightlyStatus === 'running' || hourlyStatus === 'running' || isBackgroundSyncing;
  
  if (isLoading) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-md text-xs text-muted-foreground cursor-default">
            {isAnyRunning ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Sincronizando...</span>
              </>
            ) : mostRecent ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-success" />
                <span>{relativeTime}</span>
              </>
            ) : (
              <>
                <Clock className="w-3 h-3" />
                <span>Aguardando sync</span>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <p className="font-medium">Status da sincronização</p>
            {nightlyLastRun && (
              <p>Noturna: {formatRelativeTime(nightlyLastRun)}</p>
            )}
            {hourlyLastRun && (
              <p>Horária: {formatRelativeTime(hourlyLastRun)}</p>
            )}
            {!nightlyLastRun && !hourlyLastRun && (
              <p>Nenhuma sincronização automática ainda</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
