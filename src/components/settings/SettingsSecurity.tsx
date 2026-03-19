import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Shield, KeyRound, Activity, Bell, Monitor,
  Smartphone, Globe, CheckCircle2, XCircle, Eye, EyeOff, LogOut,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSecurityEvents, useSecuritySettings, useChangePassword, useActiveSessions, useSignOutOtherSessions } from '@/hooks/useSecurity';

const EVENT_LABELS: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  login: { label: 'Login realizado', icon: CheckCircle2, color: 'text-emerald-500' },
  logout: { label: 'Logout', icon: Activity, color: 'text-muted-foreground' },
  password_changed: { label: 'Senha alterada', icon: KeyRound, color: 'text-amber-500' },
  email_changed: { label: 'E-mail alterado', icon: Activity, color: 'text-amber-500' },
  new_device: { label: 'Novo dispositivo', icon: Monitor, color: 'text-blue-500' },
  failed_login: { label: 'Tentativa de login falhou', icon: XCircle, color: 'text-destructive' },
};

function getDeviceIcon(userAgent: string | null) {
  if (!userAgent) return Globe;
  if (/mobile|android|iphone/i.test(userAgent)) return Smartphone;
  return Monitor;
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const changePassword = useChangePassword();

  const isValid = newPassword.length >= 8 && newPassword === confirmPassword;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    changePassword.mutate(
      { newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5 text-primary" />
          Alterar Senha
        </CardTitle>
        <CardDescription>
          Escolha uma senha forte com pelo menos 8 caracteres
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="current-pw">Senha atual</Label>
            <Input
              id="current-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-pw">Nova senha</Label>
            <div className="relative">
              <Input
                id="new-pw"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-destructive">A senha precisa ter pelo menos 8 caracteres</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-pw">Confirmar nova senha</Label>
            <div className="relative">
              <Input
                id="confirm-pw"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {confirmPassword.length > 0 && confirmPassword !== newPassword && (
              <p className="text-xs text-destructive">As senhas não conferem</p>
            )}
          </div>

          <Button type="submit" disabled={!isValid || changePassword.isPending}>
            {changePassword.isPending ? 'Alterando...' : 'Alterar Senha'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AlertsSection() {
  const { data: settings, isLoading, updateSettings } = useSecuritySettings();

  if (isLoading) {
    return <Skeleton className="h-48" />;
  }

  const newDeviceAlerts = settings?.new_device_alerts ?? true;
  const loginAlerts = settings?.login_alerts ?? false;
  const passwordChangeAlerts = settings?.password_change_alerts ?? true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5 text-primary" />
          Alertas de Segurança
        </CardTitle>
        <CardDescription>
          Receba notificações sobre atividades suspeitas na sua conta
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Login em novo dispositivo</Label>
            <p className="text-xs text-muted-foreground">Alerta quando um login é feito de um dispositivo desconhecido</p>
          </div>
          <Switch
            checked={newDeviceAlerts}
            onCheckedChange={(checked) => updateSettings.mutate({ new_device_alerts: checked })}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Todo login realizado</Label>
            <p className="text-xs text-muted-foreground">Alerta para cada login na conta</p>
          </div>
          <Switch
            checked={loginAlerts}
            onCheckedChange={(checked) => updateSettings.mutate({ login_alerts: checked })}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Alteração de senha</Label>
            <p className="text-xs text-muted-foreground">Alerta quando a senha for alterada</p>
          </div>
          <Switch
            checked={passwordChangeAlerts}
            onCheckedChange={(checked) => updateSettings.mutate({ password_change_alerts: checked })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function parseUserAgent(userAgent: string | null) {
  if (!userAgent) return { browser: 'Desconhecido', os: 'Desconhecido' };
  
  let browser = 'Navegador';
  let os = 'Sistema';
  
  // Browser detection
  if (/edg/i.test(userAgent)) browser = 'Edge';
  else if (/chrome/i.test(userAgent)) browser = 'Chrome';
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
  else if (/firefox/i.test(userAgent)) browser = 'Firefox';
  else if (/opera|opr/i.test(userAgent)) browser = 'Opera';
  
  // OS detection
  if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/mac os/i.test(userAgent)) os = 'macOS';
  else if (/linux/i.test(userAgent)) os = 'Linux';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/iphone|ipad/i.test(userAgent)) os = 'iOS';
  
  return { browser, os };
}

function ActiveSessionsSection() {
  const { data: sessions, isLoading } = useActiveSessions();
  const signOutOthers = useSignOutOtherSessions();

  const otherSessionsCount = sessions?.filter(s => !s.is_current).length || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Monitor className="h-5 w-5 text-primary" />
            Sessões Ativas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Monitor className="h-5 w-5 text-primary" />
          Sessões Ativas
        </CardTitle>
        <CardDescription>
          Dispositivos conectados à sua conta
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!sessions || sessions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Monitor className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma sessão registrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => {
              const DeviceIcon = getDeviceIcon(session.user_agent);
              const { browser, os } = parseUserAgent(session.user_agent);
              
              return (
                <div
                  key={session.id}
                  className="flex items-center gap-3 py-3 px-3 rounded-md bg-muted/30 border border-border/50"
                >
                  <div className="flex-shrink-0 text-muted-foreground">
                    <DeviceIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{browser} · {os}</span>
                      {session.is_current && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Sessão atual
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(session.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                      {session.ip_address && (
                        <>
                          <span>•</span>
                          <span>{session.ip_address}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {!session.is_current && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={signOutOthers.isPending}
                          className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2 text-xs"
                        >
                          <LogOut className="h-3.5 w-3.5 mr-1" />
                          Desconectar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Desconectar dispositivo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A sessão em <strong>{browser} · {os}</strong> será encerrada.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={signOutOthers.isPending}>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => signOutOthers.mutate(session.id)}
                            disabled={signOutOthers.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {signOutOthers.isPending ? 'Desconectando...' : 'Desconectar'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {otherSessionsCount > 0 && (
          <>
            <Separator />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" size="sm" disabled={signOutOthers.isPending}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Desconectar todos os outros dispositivos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desconectar outros dispositivos?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso vai encerrar a sessão em todos os outros dispositivos conectados à sua conta.
                    Você precisará fazer login novamente nesses dispositivos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={signOutOthers.isPending}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => signOutOthers.mutate(undefined)}
                    disabled={signOutOthers.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {signOutOthers.isPending ? 'Desconectando...' : 'Desconectar todos'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityLogSection() {
  const { data: events, isLoading } = useSecurityEvents(30);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Atividade Recente
        </CardTitle>
        <CardDescription>
          Últimas atividades de segurança da sua conta
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!events || events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma atividade registrada ainda</p>
          </div>
        ) : (
          <div className="space-y-1">
            {events.map((event) => {
              const config = EVENT_LABELS[event.event_type] || {
                label: event.event_type,
                icon: Activity,
                color: 'text-muted-foreground',
              };
              const DeviceIcon = getDeviceIcon(event.user_agent);
              const EventIcon = config.icon;

              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className={`flex-shrink-0 ${config.color}`}>
                    <EventIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{config.label}</span>
                      {event.is_new_device && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Novo dispositivo
                        </Badge>
                      )}
                      {!event.success && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          Falhou
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <DeviceIcon className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(new Date(event.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                      {event.ip_address && (
                        <>
                          <span>•</span>
                          <span>{event.ip_address}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                    {format(new Date(event.created_at), 'dd/MM HH:mm')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsSecurity() {
  return (
    <div className="space-y-6">
      <PasswordSection />
      <ActiveSessionsSection />
      <AlertsSection />
      <ActivityLogSection />
    </div>
  );
}
