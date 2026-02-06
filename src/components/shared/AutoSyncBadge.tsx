import { useSyncSchedulerStatus, formatRelativeTime } from "@/hooks/useSyncSchedulerStatus";

export function AutoSyncBadge() {
  const { pollingLastRun, pollingStatus, isLoading } = useSyncSchedulerStatus();

  if (isLoading) return null;

  const isRecent = pollingLastRun && (Date.now() - pollingLastRun.getTime()) < 15 * 60 * 1000;
  const timeAgo = formatRelativeTime(pollingLastRun);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          pollingStatus === "running"
            ? "bg-blue-500 animate-pulse"
            : isRecent
              ? "bg-emerald-500 animate-pulse"
              : "bg-amber-500"
        }`}
      />
      <span>
        {pollingStatus === "running" ? "Sincronizando..." : `Auto-sync: ${timeAgo}`}
      </span>
    </div>
  );
}
