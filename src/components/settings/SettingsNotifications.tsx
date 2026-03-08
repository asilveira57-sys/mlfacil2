import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell, MessageCircle, Timer, TimerOff, XCircle,
  AlertTriangle, Settings, CheckCheck, Moon, Save,
  Loader2, Eye, LayoutDashboard, ShoppingBag,
  Inbox, Check, Clock, X, ChevronRight, Trash2,
  Filter, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useNotificationCounts,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useSnoozeNotification,
  useResolveNotification,
  useDismissNotification,
} from "@/hooks/useNotificationSystem";
import type { AppNotification } from "@/types/notifications";
import type { NotificationCategory, NotificationPriority } from "@/types/qa";
import { CATEGORY_CONFIG, SNOOZE_OPTIONS, PRIORITY_CONFIG } from "@/types/notifications";

// ─── Config tab types ───

interface NotificationPrefs {
  id?: string;
  qa_pending_enabled: boolean;
  qa_sla_warning_enabled: boolean;
  qa_sla_breached_enabled: boolean;
  qa_blocked_enabled: boolean;
  qa_send_error_enabled: boolean;
  post_sale_blocked_enabled: boolean;
  post_sale_error_enabled: boolean;
  system_alert_enabled: boolean;
  show_in_bell: boolean;
  show_in_dashboard: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

const DEFAULT_PREFS: NotificationPrefs = {
  qa_pending_enabled: true,
  qa_sla_warning_enabled: true,
  qa_sla_breached_enabled: true,
  qa_blocked_enabled: true,
  qa_send_error_enabled: true,
  post_sale_blocked_enabled: true,
  post_sale_error_enabled: true,
  system_alert_enabled: true,
  show_in_bell: true,
  show_in_dashboard: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
};

interface CategoryToggle {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
  icon: React.ReactNode;
  group: "qa" | "post_sale" | "system";
}

const CATEGORIES: CategoryToggle[] = [
  { key: "qa_pending_enabled", label: "Pergunta pendente", description: "Quando uma nova pergunta chega no Mercado Livre", icon: <MessageCircle className="h-4 w-4 text-blue-500" />, group: "qa" },
  { key: "qa_sla_warning_enabled", label: "SLA próximo do limite", description: "Alerta quando faltam poucas horas para o prazo de resposta", icon: <Timer className="h-4 w-4 text-amber-500" />, group: "qa" },
  { key: "qa_sla_breached_enabled", label: "SLA estourado", description: "Quando o prazo de resposta foi ultrapassado", icon: <TimerOff className="h-4 w-4 text-red-500" />, group: "qa" },
  { key: "qa_blocked_enabled", label: "Resposta bloqueada", description: "Quando uma resposta não pode ser enviada", icon: <XCircle className="h-4 w-4 text-red-500" />, group: "qa" },
  { key: "qa_send_error_enabled", label: "Erro de envio", description: "Quando ocorre erro ao enviar uma resposta ao ML", icon: <AlertTriangle className="h-4 w-4 text-red-500" />, group: "qa" },
  { key: "post_sale_blocked_enabled", label: "Pós-venda bloqueado", description: "Quando uma mensagem pós-venda não pode ser enviada", icon: <XCircle className="h-4 w-4 text-orange-500" />, group: "post_sale" },
  { key: "post_sale_error_enabled", label: "Erro pós-venda", description: "Quando ocorre erro no envio de mensagem pós-venda", icon: <AlertTriangle className="h-4 w-4 text-orange-500" />, group: "post_sale" },
  { key: "system_alert_enabled", label: "Alertas do sistema", description: "Atualizações do sistema, respostas de suporte, etc.", icon: <Settings className="h-4 w-4 text-purple-500" />, group: "system" },
];

const GROUP_CONFIG = {
  qa: { label: "Perguntas (Q&A)", icon: <MessageCircle className="h-5 w-5" />, color: "text-blue-600" },
  post_sale: { label: "Pós-Venda", icon: <ShoppingBag className="h-5 w-5" />, color: "text-orange-600" },
  system: { label: "Sistema", icon: <Settings className="h-5 w-5" />, color: "text-purple-600" },
};

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

const FILTER_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "unread", label: "Não lidas" },
  { value: "qa", label: "Perguntas" },
  { value: "post_sale", label: "Pós-venda" },
  { value: "system", label: "Sistema" },
];

// ─── Main Component ───

export function SettingsNotifications() {
  const { data: counts } = useNotificationCounts();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notificações
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e leia suas notificações do sistema.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {counts && counts.unread > 0 && (
            <Badge variant="secondary" className="text-xs">
              {counts.unread} não lida{counts.unread !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="inbox" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" />
            Central
            {counts && counts.unread > 0 && (
              <Badge variant="destructive" className="text-[10px] h-5 min-w-5 p-0 flex items-center justify-center ml-1">
                {counts.unread > 99 ? "99+" : counts.unread}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-6">
          <NotificationInbox />
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          <NotificationConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Inbox Tab ───

function NotificationInbox() {
  const [filter, setFilter] = useState("all");
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["all-notifications", filter],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from("app_notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filter === "unread") {
        query = query.eq("is_read", false);
      } else if (filter === "qa") {
        query = query.in("category", ["qa_pending", "qa_sla_warning", "qa_sla_breached", "qa_blocked", "qa_send_error"]);
      } else if (filter === "post_sale") {
        query = query.in("category", ["post_sale_blocked", "post_sale_error"]);
      } else if (filter === "system") {
        query = query.in("category", ["system_alert", "task_assigned", "promotion_alert"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AppNotification[];
    },
    staleTime: 30_000,
  });

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const snooze = useSnoozeNotification();
  const resolve = useResolveNotification();
  const dismiss = useDismissNotification();

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {notifications && (
            <span className="text-xs text-muted-foreground">
              {notifications.length} notificação{notifications.length !== 1 ? "ões" : ""}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleMarkAllRead}>
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : !notifications || notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Check className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium">Nenhuma notificação</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {filter === "unread"
                ? "Você leu todas as notificações."
                : "Não há notificações nesta categoria ainda."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ScrollArea className="max-h-[600px]">
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <InboxNotificationRow
                  key={notification.id}
                  notification={notification}
                  onMarkRead={() => {
                    markRead.mutate(notification.id, {
                      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-notifications"] }),
                    });
                  }}
                  onDismiss={() => {
                    dismiss.mutate(notification.id, {
                      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-notifications"] }),
                    });
                  }}
                  onResolve={() => {
                    resolve.mutate(notification.id, {
                      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-notifications"] }),
                    });
                  }}
                  onSnooze={(hours) => {
                    snooze.mutate({ notificationId: notification.id, hours }, {
                      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-notifications"] }),
                    });
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

// ─── Single notification row in inbox ───

interface InboxNotificationRowProps {
  notification: AppNotification;
  onMarkRead: () => void;
  onDismiss: () => void;
  onResolve: () => void;
  onSnooze: (hours: number) => void;
}

function InboxNotificationRow({ notification, onMarkRead, onDismiss, onResolve, onSnooze }: InboxNotificationRowProps) {
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  const catConfig = CATEGORY_CONFIG[notification.category];
  const priorityConfig = PRIORITY_CONFIG[notification.priority];
  const isUrgent = notification.priority === "urgent" || notification.priority === "high";

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 transition-colors group hover:bg-accent/30",
        !notification.is_read && "bg-primary/5"
      )}
    >
      {/* Icon */}
      <div className={cn("shrink-0 mt-0.5 rounded-full p-1.5", catConfig?.bgColor || "bg-muted")}>
        {CATEGORY_ICONS[notification.category] || <Bell className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("text-sm leading-tight", !notification.is_read && "font-semibold")}>
              {notification.title}
            </p>
            {notification.body && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {notification.body}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {!notification.is_read && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onMarkRead(); }}
                title="Marcar como lida"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {!notification.is_read && (
                  <DropdownMenuItem onClick={onMarkRead}>
                    <Eye className="h-3.5 w-3.5 mr-2" />
                    Marcar como lida
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onResolve}>
                  <Check className="h-3.5 w-3.5 mr-2" />
                  Resolver
                </DropdownMenuItem>
                {SNOOZE_OPTIONS.map((opt) => (
                  <DropdownMenuItem key={opt.value} onClick={() => onSnooze(opt.value)}>
                    <Clock className="h-3.5 w-3.5 mr-2" />
                    Adiar {opt.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={onDismiss} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Remover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border-0", catConfig?.bgColor, catConfig?.color)}>
            {catConfig?.label || notification.category}
          </Badge>
          {isUrgent && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border-0", priorityConfig.bgColor, priorityConfig.color)}>
              {priorityConfig.label}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
          {notification.is_read && (
            <span className="text-[10px] text-muted-foreground/60">• Lida</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Config Tab (existing logic) ───

function NotificationConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: counts } = useNotificationCounts();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: savedPrefs, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as NotificationPrefs | null;
    },
  });

  useEffect(() => {
    if (savedPrefs) {
      setPrefs({
        id: savedPrefs.id,
        qa_pending_enabled: savedPrefs.qa_pending_enabled ?? true,
        qa_sla_warning_enabled: savedPrefs.qa_sla_warning_enabled ?? true,
        qa_sla_breached_enabled: savedPrefs.qa_sla_breached_enabled ?? true,
        qa_blocked_enabled: savedPrefs.qa_blocked_enabled ?? true,
        qa_send_error_enabled: savedPrefs.qa_send_error_enabled ?? true,
        post_sale_blocked_enabled: savedPrefs.post_sale_blocked_enabled ?? true,
        post_sale_error_enabled: savedPrefs.post_sale_error_enabled ?? true,
        system_alert_enabled: savedPrefs.system_alert_enabled ?? true,
        show_in_bell: savedPrefs.show_in_bell ?? true,
        show_in_dashboard: savedPrefs.show_in_dashboard ?? true,
        quiet_hours_enabled: savedPrefs.quiet_hours_enabled ?? false,
        quiet_hours_start: savedPrefs.quiet_hours_start ?? "22:00",
        quiet_hours_end: savedPrefs.quiet_hours_end ?? "08:00",
      });
    }
  }, [savedPrefs]);

  const saveMutation = useMutation({
    mutationFn: async (newPrefs: NotificationPrefs) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const payload = {
        user_id: user.id,
        qa_pending_enabled: newPrefs.qa_pending_enabled,
        qa_sla_warning_enabled: newPrefs.qa_sla_warning_enabled,
        qa_sla_breached_enabled: newPrefs.qa_sla_breached_enabled,
        qa_blocked_enabled: newPrefs.qa_blocked_enabled,
        qa_send_error_enabled: newPrefs.qa_send_error_enabled,
        post_sale_blocked_enabled: newPrefs.post_sale_blocked_enabled,
        post_sale_error_enabled: newPrefs.post_sale_error_enabled,
        system_alert_enabled: newPrefs.system_alert_enabled,
        show_in_bell: newPrefs.show_in_bell,
        show_in_dashboard: newPrefs.show_in_dashboard,
        quiet_hours_enabled: newPrefs.quiet_hours_enabled,
        quiet_hours_start: newPrefs.quiet_hours_start,
        quiet_hours_end: newPrefs.quiet_hours_end,
        updated_at: new Date().toISOString(),
      };
      if (newPrefs.id) {
        const { error } = await supabase.from("notification_preferences").update(payload as never).eq("id", newPrefs.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_preferences").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      setHasChanges(false);
      toast({ title: "Preferências salvas", description: "Suas configurações de notificação foram atualizadas." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const updatePref = (key: keyof NotificationPrefs, value: boolean | string | null) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const enabledCount = CATEGORIES.filter((c) => prefs[c.key] as boolean).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex items-center justify-end">
        <Badge variant="outline" className="text-xs">
          {enabledCount}/{CATEGORIES.length} ativas
        </Badge>
      </div>

      {/* Display Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Onde exibir
          </CardTitle>
          <CardDescription>Escolha onde as notificações devem aparecer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">Sino (header)</Label>
                <p className="text-xs text-muted-foreground">Mostra badge com contagem e popover com lista</p>
              </div>
            </div>
            <Switch checked={prefs.show_in_bell} onCheckedChange={(v) => updatePref("show_in_bell", v)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">Painel (dashboard)</Label>
                <p className="text-xs text-muted-foreground">Widget de notificações prioritárias no dashboard</p>
              </div>
            </div>
            <Switch checked={prefs.show_in_dashboard} onCheckedChange={(v) => updatePref("show_in_dashboard", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Categories by group */}
      {(["qa", "post_sale", "system"] as const).map((group) => {
        const groupCategories = CATEGORIES.filter((c) => c.group === group);
        const config = GROUP_CONFIG[group];
        const groupEnabled = groupCategories.filter((c) => prefs[c.key] as boolean).length;
        return (
          <Card key={group}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={cn("text-base flex items-center gap-2", config.color)}>
                  {config.icon}
                  {config.label}
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {groupEnabled}/{groupCategories.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {groupCategories.map((cat, idx) => (
                <div key={cat.key}>
                  {idx > 0 && <Separator className="my-3" />}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3">
                      {cat.icon}
                      <div>
                        <Label className="text-sm font-medium">{cat.label}</Label>
                        <p className="text-xs text-muted-foreground">{cat.description}</p>
                      </div>
                    </div>
                    <Switch checked={prefs[cat.key] as boolean} onCheckedChange={(v) => updatePref(cat.key, v)} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* Quiet Hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Moon className="h-4 w-4 text-indigo-500" />
            Horário Silencioso
          </CardTitle>
          <CardDescription>Durante esse período, notificações não urgentes não emitem alerta visual</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Ativar horário silencioso</Label>
            <Switch checked={prefs.quiet_hours_enabled} onCheckedChange={(v) => updatePref("quiet_hours_enabled", v)} />
          </div>
          {prefs.quiet_hours_enabled && (
            <div className="flex items-center gap-4 pl-4 border-l-2 border-indigo-500/20">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Início</Label>
                <Input type="time" value={prefs.quiet_hours_start || "22:00"} onChange={(e) => updatePref("quiet_hours_start", e.target.value)} className="w-28 h-8 text-sm" />
              </div>
              <span className="text-muted-foreground mt-4">até</span>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fim</Label>
                <Input type="time" value={prefs.quiet_hours_end || "08:00"} onChange={(e) => updatePref("quiet_hours_end", e.target.value)} className="w-28 h-8 text-sm" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={() => saveMutation.mutate(prefs)} disabled={saveMutation.isPending} className="shadow-lg">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar preferências
          </Button>
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4" />
          Como funcionam as notificações
        </h4>
        <ul className="text-xs text-muted-foreground space-y-1.5">
          <li>• <strong>Perguntas:</strong> Notificação automática quando chega uma nova pergunta no Mercado Livre</li>
          <li>• <strong>SLA:</strong> Alerta quando o prazo de resposta (15h) está próximo ou foi estourado</li>
          <li>• <strong>Pós-venda:</strong> Aviso quando uma mensagem pós-venda falha ou é bloqueada</li>
          <li>• <strong>Sistema:</strong> Respostas do suporte, atualizações do sistema e avisos importantes</li>
          <li>• <strong>E-mails:</strong> E-mails importantes (segurança, billing) são enviados separadamente e não aparecem aqui</li>
        </ul>
      </div>
    </div>
  );
}
