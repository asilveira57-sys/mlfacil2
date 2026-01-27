import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bell,
  MessageCircle,
  AlertTriangle,
  Timer,
  TimerOff,
  XCircle,
  ChevronRight,
  Check,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import type { AppNotification } from "@/types/notifications";
import type { NotificationCategory } from "@/types/qa";
import { CATEGORY_CONFIG, PRIORITY_CONFIG } from "@/types/notifications";
import {
  usePriorityNotifications,
  useNotificationCounts,
  useMarkNotificationRead,
  useResolveNotification,
} from "@/hooks/useNotificationSystem";

const CATEGORY_ICONS: Record<NotificationCategory, React.ReactNode> = {
  qa_pending: <MessageCircle className="h-4 w-4" />,
  qa_sla_warning: <Timer className="h-4 w-4" />,
  qa_sla_breached: <TimerOff className="h-4 w-4" />,
  qa_blocked: <XCircle className="h-4 w-4" />,
  qa_send_error: <AlertTriangle className="h-4 w-4" />,
  post_sale_blocked: <XCircle className="h-4 w-4" />,
  post_sale_error: <AlertTriangle className="h-4 w-4" />,
  system_alert: <Bell className="h-4 w-4" />,
  task_assigned: <Check className="h-4 w-4" />,
  promotion_alert: <Bell className="h-4 w-4" />,
};

interface PriorityInboxProps {
  workspaceId?: string | null;
  sellerId?: string | null;
  className?: string;
}

export function PriorityInbox({ workspaceId, sellerId, className }: PriorityInboxProps) {
  const navigate = useNavigate();
  const { data: notifications, isLoading } = usePriorityNotifications({
    workspaceId,
    sellerId,
  });
  const { data: counts } = useNotificationCounts(workspaceId);
  const markRead = useMarkNotificationRead();
  const resolve = useResolveNotification();

  // Don't render if no pending notifications
  if (!isLoading && (!notifications || notifications.length === 0)) {
    return null;
  }

  const handleClick = (notification: AppNotification) => {
    markRead.mutate(notification.id);
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const handleResolve = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    resolve.mutate(notificationId);
  };

  const pendingCount = counts?.pending || 0;
  const remainingCount = Math.max(0, pendingCount - 5);

  return (
    <Card className={cn("border-amber-500/20 bg-amber-500/5", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Bell className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Pendências Prioritárias</CardTitle>
              <p className="text-xs text-muted-foreground">
                Ações que exigem sua atenção
              </p>
            </div>
          </div>
          {pendingCount > 0 && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
              {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {notifications?.slice(0, 5).map((notification) => (
              <PriorityItem
                key={notification.id}
                notification={notification}
                onClick={() => handleClick(notification)}
                onResolve={(e) => handleResolve(e, notification.id)}
              />
            ))}

            {remainingCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-9 text-xs text-muted-foreground hover:text-foreground gap-1"
                onClick={() => {
                  // Could open notification panel or navigate to a notifications page
                }}
              >
                Ver mais {remainingCount} pendência{remainingCount !== 1 ? "s" : ""}
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface PriorityItemProps {
  notification: AppNotification & { priority_score?: number };
  onClick: () => void;
  onResolve: (e: React.MouseEvent) => void;
}

function PriorityItem({ notification, onClick, onResolve }: PriorityItemProps) {
  const categoryConfig = CATEGORY_CONFIG[notification.category];
  const priorityConfig = PRIORITY_CONFIG[notification.priority];
  const isUrgent = notification.priority === "urgent" || notification.priority === "high";

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: false,
    locale: ptBR,
  });

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group",
        "hover:shadow-sm hover:border-primary/30",
        isUrgent 
          ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10" 
          : "bg-background border-border"
      )}
    >
      {/* Icon */}
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", categoryConfig?.bgColor || "bg-muted")}>
        <span className={categoryConfig?.color || "text-muted-foreground"}>
          {CATEGORY_ICONS[notification.category]}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium line-clamp-1">{notification.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
          {isUrgent && (
            <Badge 
              variant="outline" 
              className={cn("text-[10px] px-1.5 py-0 border-0", priorityConfig.bgColor, priorityConfig.color)}
            >
              {priorityConfig.label}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {categoryConfig?.label || notification.category}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onResolve}
          title="Marcar como resolvido"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
