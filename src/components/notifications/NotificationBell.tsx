import { useState, useCallback, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bell,
  MessageCircle,
  AlertTriangle,
  Timer,
  TimerOff,
  XCircle,
  Settings,
  CheckCheck,
  ChevronRight,
  X,
  Clock,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import type { AppNotification } from "@/types/notifications";
import type { NotificationCategory } from "@/types/qa";
import { CATEGORY_CONFIG, SNOOZE_OPTIONS, PRIORITY_CONFIG } from "@/types/notifications";
import {
  useActiveNotifications,
  useNotificationCounts,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useSnoozeNotification,
  useResolveNotification,
  useDismissNotification,
  useNotificationsRealtime,
  groupNotificationsByCategory,
} from "@/hooks/useNotificationSystem";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";

const CATEGORY_ICONS: Record<NotificationCategory, React.ReactNode> = {
  qa_pending: <MessageCircle className="h-4 w-4 text-blue-500" />,
  qa_sla_warning: <Timer className="h-4 w-4 text-amber-500" />,
  qa_sla_breached: <TimerOff className="h-4 w-4 text-red-500" />,
  qa_blocked: <XCircle className="h-4 w-4 text-red-500" />,
  qa_send_error: <AlertTriangle className="h-4 w-4 text-red-500" />,
  post_sale_blocked: <XCircle className="h-4 w-4 text-orange-500" />,
  post_sale_error: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  system_alert: <Settings className="h-4 w-4 text-purple-500" />,
  task_assigned: <CheckCheck className="h-4 w-4 text-green-500" />,
  promotion_alert: <Bell className="h-4 w-4 text-pink-500" />,
};

interface NotificationBellProps {
  workspaceId?: string | null;
  sellerId?: string | null;
}

export function NotificationBell({ workspaceId, sellerId }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const userId = useCurrentUserId();

  const { data: notifications, isLoading, refetch } = useActiveNotifications({
    workspaceId,
    sellerId,
  });
  const { data: counts } = useNotificationCounts(workspaceId);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const snooze = useSnoozeNotification();
  const resolve = useResolveNotification();
  const dismiss = useDismissNotification();

  // Realtime notifications
  const handleNewNotification = useCallback(
    (notification: AppNotification) => {
      refetch();
      // Only toast for high priority
      if (notification.priority === 'urgent' || notification.priority === 'high') {
        toast({
          title: notification.title,
          description: notification.body || undefined,
        });
      }
    },
    [refetch, toast]
  );

  useNotificationsRealtime(userId, handleNewNotification);

  const handleNotificationClick = (notification: AppNotification) => {
    markRead.mutate(notification.id);
    if (notification.action_url) {
      navigate(notification.action_url);
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(workspaceId || undefined);
  };

  const handleSnooze = (e: React.MouseEvent, notificationId: string, hours: number) => {
    e.stopPropagation();
    snooze.mutate({ notificationId, hours });
  };

  const handleResolve = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    resolve.mutate(notificationId);
  };

  const handleDismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dismiss.mutate(id);
  };

  const groupedNotifications = notifications
    ? groupNotificationsByCategory(notifications)
    : {};

  const pendingCount = counts?.pending || 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {pendingCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center text-[10px]"
            >
              {pendingCount > 99 ? "99+" : pendingCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="end">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Notificações</span>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          {pendingCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Marcar lidas
            </Button>
          )}
        </div>

        {/* Content */}
        <ScrollArea className="h-[420px]">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Check className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium">Nenhuma ação pendente</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Você está em dia com suas notificações.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Object.entries(groupedNotifications).map(([category, items]) => {
                const notificationItems = items as AppNotification[];
                return (
                  <div key={category}>
                    {/* Category Header */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 sticky top-0 z-10">
                      {CATEGORY_ICONS[category as NotificationCategory]}
                      <span className="text-xs font-medium text-muted-foreground">
                        {CATEGORY_CONFIG[category as NotificationCategory]?.label || category}
                      </span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {notificationItems.length}
                      </Badge>
                    </div>

                    {/* Items */}
                    {notificationItems.slice(0, 5).map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onClick={() => handleNotificationClick(notification)}
                        onSnooze={(e, hours) => handleSnooze(e, notification.id, hours)}
                        onResolve={(e) => handleResolve(e, notification.id)}
                        onDismiss={(e) => handleDismiss(e, notification.id)}
                      />
                    ))}

                    {notificationItems.length > 5 && (
                      <button
                        className="w-full text-center py-2 text-xs text-primary hover:underline bg-muted/30"
                        onClick={() => {
                          setIsOpen(false);
                          // Navigate to full list or expand
                        }}
                      >
                        Ver mais {notificationItems.length - 5} notificações
                    </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => {
              setIsOpen(false);
              navigate("/settings?tab=notifications");
            }}
          >
            <Settings className="h-3 w-3 mr-1" />
            Configurar notificações
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface NotificationItemProps {
  notification: AppNotification;
  onClick: () => void;
  onSnooze: (e: React.MouseEvent, hours: number) => void;
  onResolve: (e: React.MouseEvent) => void;
  onDismiss: (e: React.MouseEvent) => void;
}

function NotificationItem({ 
  notification, 
  onClick, 
  onSnooze, 
  onResolve, 
  onDismiss 
}: NotificationItemProps) {
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  const isUrgent = notification.priority === "urgent" || notification.priority === "high";
  const priorityConfig = PRIORITY_CONFIG[notification.priority];

  return (
    <div
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 hover:bg-accent/50 transition-colors group cursor-pointer",
        !notification.is_read && "bg-primary/5",
        isUrgent && !notification.is_read && "bg-destructive/5 hover:bg-destructive/10"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {CATEGORY_ICONS[notification.category]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "text-sm line-clamp-1",
                !notification.is_read && "font-medium"
              )}
            >
              {notification.title}
            </p>
            
            {/* Quick Actions */}
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Resolve */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onResolve}
                title="Marcar como resolvido"
              >
                <Check className="h-3 w-3" />
              </Button>
              
              {/* Snooze */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => e.stopPropagation()}
                    title="Adiar"
                  >
                    <Clock className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  {SNOOZE_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSnooze(e as unknown as React.MouseEvent, option.value);
                      }}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Dismiss */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onDismiss}
                title="Dispensar"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {notification.body && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {notification.body}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
            {isUrgent && (
              <Badge 
                variant="outline" 
                className={cn("text-[10px] px-1 py-0 border-0", priorityConfig.bgColor, priorityConfig.color)}
              >
                {priorityConfig.label}
              </Badge>
            )}
          </div>
        </div>

        {notification.action_url && (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
}
