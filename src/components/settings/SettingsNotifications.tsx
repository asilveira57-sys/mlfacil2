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
import {
  Bell, MessageCircle, Timer, TimerOff, XCircle,
  AlertTriangle, Settings, CheckCheck, Moon, Save,
  Loader2, Eye, LayoutDashboard, ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationCounts } from "@/hooks/useNotificationSystem";

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
  {
    key: "qa_pending_enabled",
    label: "Pergunta pendente",
    description: "Quando uma nova pergunta chega no Mercado Livre",
    icon: <MessageCircle className="h-4 w-4 text-blue-500" />,
    group: "qa",
  },
  {
    key: "qa_sla_warning_enabled",
    label: "SLA próximo do limite",
    description: "Alerta quando faltam poucas horas para o prazo de resposta",
    icon: <Timer className="h-4 w-4 text-amber-500" />,
    group: "qa",
  },
  {
    key: "qa_sla_breached_enabled",
    label: "SLA estourado",
    description: "Quando o prazo de resposta foi ultrapassado",
    icon: <TimerOff className="h-4 w-4 text-red-500" />,
    group: "qa",
  },
  {
    key: "qa_blocked_enabled",
    label: "Resposta bloqueada",
    description: "Quando uma resposta não pode ser enviada",
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    group: "qa",
  },
  {
    key: "qa_send_error_enabled",
    label: "Erro de envio",
    description: "Quando ocorre erro ao enviar uma resposta ao ML",
    icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
    group: "qa",
  },
  {
    key: "post_sale_blocked_enabled",
    label: "Pós-venda bloqueado",
    description: "Quando uma mensagem pós-venda não pode ser enviada",
    icon: <XCircle className="h-4 w-4 text-orange-500" />,
    group: "post_sale",
  },
  {
    key: "post_sale_error_enabled",
    label: "Erro pós-venda",
    description: "Quando ocorre erro no envio de mensagem pós-venda",
    icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
    group: "post_sale",
  },
  {
    key: "system_alert_enabled",
    label: "Alertas do sistema",
    description: "Atualizações do sistema, respostas de suporte, etc.",
    icon: <Settings className="h-4 w-4 text-purple-500" />,
    group: "system",
  },
];

const GROUP_CONFIG = {
  qa: { label: "Perguntas (Q&A)", icon: <MessageCircle className="h-5 w-5" />, color: "text-blue-600" },
  post_sale: { label: "Pós-Venda", icon: <ShoppingBag className="h-5 w-5" />, color: "text-orange-600" },
  system: { label: "Sistema", icon: <Settings className="h-5 w-5" />, color: "text-purple-600" },
};

export function SettingsNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: counts } = useNotificationCounts();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [hasChanges, setHasChanges] = useState(false);

  // Load preferences
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

  // Save preferences
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
        const { error } = await supabase
          .from("notification_preferences")
          .update(payload as never)
          .eq("id", newPrefs.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_preferences")
          .insert(payload as never);
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
    <div className="space-y-6 max-w-3xl">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Configurações de Notificações
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha quais notificações deseja receber no sino e no painel.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {counts && (counts.unread > 0 || counts.pending > 0) && (
            <Badge variant="secondary" className="text-xs">
              {counts.unread} não lida{counts.unread !== 1 ? "s" : ""}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {enabledCount}/{CATEGORIES.length} ativas
          </Badge>
        </div>
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
            <Switch
              checked={prefs.show_in_bell}
              onCheckedChange={(v) => updatePref("show_in_bell", v)}
            />
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
            <Switch
              checked={prefs.show_in_dashboard}
              onCheckedChange={(v) => updatePref("show_in_dashboard", v)}
            />
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
                    <Switch
                      checked={prefs[cat.key] as boolean}
                      onCheckedChange={(v) => updatePref(cat.key, v)}
                    />
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
          <CardDescription>
            Durante esse período, notificações não urgentes não emitem alerta visual
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Ativar horário silencioso</Label>
            <Switch
              checked={prefs.quiet_hours_enabled}
              onCheckedChange={(v) => updatePref("quiet_hours_enabled", v)}
            />
          </div>
          {prefs.quiet_hours_enabled && (
            <div className="flex items-center gap-4 pl-4 border-l-2 border-indigo-500/20">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Início</Label>
                <Input
                  type="time"
                  value={prefs.quiet_hours_start || "22:00"}
                  onChange={(e) => updatePref("quiet_hours_start", e.target.value)}
                  className="w-28 h-8 text-sm"
                />
              </div>
              <span className="text-muted-foreground mt-4">até</span>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fim</Label>
                <Input
                  type="time"
                  value={prefs.quiet_hours_end || "08:00"}
                  onChange={(e) => updatePref("quiet_hours_end", e.target.value)}
                  className="w-28 h-8 text-sm"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={() => saveMutation.mutate(prefs)}
            disabled={saveMutation.isPending}
            className="shadow-lg"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
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
