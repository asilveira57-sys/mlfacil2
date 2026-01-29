import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Link2,
  Unlink,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings,
  History,
  Activity,
  Database,
  Loader2,
  Info,
  Wifi,
  WifiOff,
  LinkIcon,
  Sparkles,
} from 'lucide-react';
import { useAdsConnections, AdsConnection, AdsSyncJob, AdsSyncLog } from '@/hooks/useAdsConnections';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AdsConnectionsPanelProps {
  sellerId: string;
}

export function AdsConnectionsPanel({ sellerId }: AdsConnectionsPanelProps) {
  const {
    connections,
    currentConnection,
    mlAccount,
    syncJobs,
    syncLogs,
    freshness,
    stats,
    loading,
    syncing,
    autoLinking,
    disconnectAccount,
    triggerSync,
    updateSyncSettings,
  } = useAdsConnections(sellerId);

  const [activeTab, setActiveTab] = useState('status');

  if (loading || autoLinking) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          {autoLinking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Vinculando conta automaticamente...
            </div>
          )}
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  const hasConnection = !!currentConnection;
  const isConnected = currentConnection?.status === 'connected';
  const hasStaleData = freshness.some(f => f.is_stale);
  const isAutoLinked = !!mlAccount && hasConnection;

  return (
    <div className="space-y-6">
      {/* Auto-linked info banner */}
      {isAutoLinked && (
        <Alert className="border-primary/30 bg-primary/5">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary">Conta vinculada automaticamente</AlertTitle>
          <AlertDescription>
            A conta <strong>{mlAccount.nickname || mlAccount.email}</strong> do Mercado Livre foi detectada e vinculada automaticamente ao módulo de publicidade.
          </AlertDescription>
        </Alert>
      )}

      {/* Connection Status Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                isConnected ? "bg-success/10" : "bg-muted"
              )}>
                {isConnected ? (
                  <Wifi className="h-5 w-5 text-success" />
                ) : (
                  <WifiOff className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <CardTitle className="text-lg">Conexões de Dados</CardTitle>
                <CardDescription>
                  {isAutoLinked 
                    ? `Conta: ${mlAccount.nickname || mlAccount.email || sellerId}`
                    : 'Gerencie a integração com a API do Mercado Livre'
                  }
                </CardDescription>
              </div>
            </div>
            <ConnectionStatusBadge status={currentConnection?.status} isAutoLinked={isAutoLinked} />
          </div>
        </CardHeader>
        <CardContent>
          {!hasConnection ? (
            <NoMlAccountState />
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="status" className="gap-2">
                  <Activity className="h-4 w-4" />
                  <span className="hidden sm:inline">Status</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Configurações</span>
                </TabsTrigger>
                <TabsTrigger value="jobs" className="gap-2">
                  <Database className="h-4 w-4" />
                  <span className="hidden sm:inline">Jobs</span>
                  {stats.pendingJobs > 0 && (
                    <Badge variant="secondary" className="ml-1">{stats.pendingJobs}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="logs" className="gap-2">
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Logs</span>
                </TabsTrigger>
              </TabsList>

              {/* Status Tab */}
              <TabsContent value="status" className="mt-6 space-y-4">
                {/* Stale Data Warning */}
                {hasStaleData && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Dados desatualizados</AlertTitle>
                    <AlertDescription>
                      Alguns dados não foram sincronizados recentemente. A visualização pode estar incompleta.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Connection Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <StatusCard
                    label="Status da Conexão"
                    value={getStatusLabel(currentConnection.status)}
                    icon={getStatusIcon(currentConnection.status)}
                    color={getStatusColor(currentConnection.status)}
                    subtext={currentConnection.status_message}
                  />
                  <StatusCard
                    label="Última Sincronização"
                    value={currentConnection.last_sync_at 
                      ? formatDistanceToNow(new Date(currentConnection.last_sync_at), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })
                      : 'Nunca'
                    }
                    icon={<Clock className="h-5 w-5" />}
                    color={currentConnection.last_sync_status === 'error' ? 'destructive' : 'default'}
                    subtext={currentConnection.last_sync_message}
                  />
                </div>

                {/* ML Account Info */}
                {mlAccount && (
                  <Card className="border-border/50 bg-muted/30">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <LinkIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{mlAccount.nickname || 'Conta Mercado Livre'}</p>
                          <p className="text-sm text-muted-foreground">{mlAccount.email || `ID: ${mlAccount.ml_user_id}`}</p>
                        </div>
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3 text-success" />
                          Vinculada
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Data Freshness */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Frescor dos Dados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {['campaigns', 'ad_groups', 'items', 'daily_metrics'].map(dataType => {
                        const item = freshness.find(f => f.data_type === dataType);
                        const isStale = item?.is_stale || false;
                        const lastSync = item?.last_successful_sync_at;

                        return (
                          <div 
                            key={dataType} 
                            className={cn(
                              "p-3 rounded-lg border",
                              isStale ? "border-destructive/50 bg-destructive/5" : "border-border/50"
                            )}
                          >
                            <div className="text-xs text-muted-foreground mb-1">
                              {getDataTypeLabel(dataType)}
                            </div>
                            <div className="flex items-center gap-1">
                              {isStale ? (
                                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                              ) : lastSync ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              ) : (
                                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className="text-sm font-medium">
                                {lastSync
                                  ? formatDistanceToNow(new Date(lastSync), { locale: ptBR })
                                  : 'Não sincronizado'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <Button 
                    onClick={() => triggerSync(currentConnection.id, 'full')}
                    disabled={syncing}
                    className="gap-2"
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Sincronizar Agora
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => triggerSync(currentConnection.id, 'incremental')}
                    disabled={syncing}
                  >
                    Sync Incremental
                  </Button>
                  {isConnected && (
                    <Button 
                      variant="ghost" 
                      className="text-destructive hover:text-destructive ml-auto"
                      onClick={() => disconnectAccount(currentConnection.id)}
                    >
                      <Unlink className="h-4 w-4 mr-2" />
                      Desconectar
                    </Button>
                  )}
                </div>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="mt-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Sincronização Automática</Label>
                      <p className="text-sm text-muted-foreground">
                        Sincronizar dados automaticamente em intervalos regulares
                      </p>
                    </div>
                    <Switch
                      checked={currentConnection.auto_sync_enabled}
                      onCheckedChange={(checked) => 
                        updateSyncSettings(currentConnection.id, { auto_sync_enabled: checked })
                      }
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Intervalo de Sincronização</Label>
                    <Select
                      value={String(currentConnection.sync_interval_hours)}
                      onValueChange={(value) => 
                        updateSyncSettings(currentConnection.id, { sync_interval_hours: parseInt(value) })
                      }
                      disabled={!currentConnection.auto_sync_enabled}
                    >
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">A cada 2 horas</SelectItem>
                        <SelectItem value="6">A cada 6 horas</SelectItem>
                        <SelectItem value="12">A cada 12 horas</SelectItem>
                        <SelectItem value="24">Diariamente</SelectItem>
                      </SelectContent>
                    </Select>
                    {currentConnection.next_scheduled_sync_at && currentConnection.auto_sync_enabled && (
                      <p className="text-xs text-muted-foreground">
                        Próxima sincronização: {formatDistanceToNow(new Date(currentConnection.next_scheduled_sync_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Informações da Conta</Label>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Seller ID:</span>
                        <span className="ml-2 font-mono">{currentConnection.seller_id}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Conectado em:</span>
                        <span className="ml-2">
                          {currentConnection.connected_at 
                            ? new Date(currentConnection.connected_at).toLocaleDateString('pt-BR')
                            : '-'}
                        </span>
                      </div>
                      {mlAccount && (
                        <>
                          <div>
                            <span className="text-muted-foreground">Nickname:</span>
                            <span className="ml-2">{mlAccount.nickname || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Email:</span>
                            <span className="ml-2">{mlAccount.email || '-'}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Jobs Tab */}
              <TabsContent value="jobs" className="mt-6">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {syncJobs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Nenhum job de sincronização encontrado</p>
                        <p className="text-xs mt-1">Execute uma sincronização para ver o histórico</p>
                      </div>
                    ) : (
                      syncJobs.map(job => (
                        <JobCard key={job.id} job={job} />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Logs Tab */}
              <TabsContent value="logs" className="mt-6">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {syncLogs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Nenhum log encontrado</p>
                      </div>
                    ) : (
                      syncLogs.map(log => (
                        <LogCard key={log.id} log={log} />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Sub-components
function ConnectionStatusBadge({ status, isAutoLinked }: { status?: AdsConnection['status']; isAutoLinked?: boolean }) {
  if (!status) return null;

  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    connected: { label: isAutoLinked ? 'Vinculado' : 'Conectado', variant: 'default' },
    pending: { label: 'Pendente', variant: 'secondary' },
    expired: { label: 'Expirado', variant: 'destructive' },
    error: { label: 'Erro', variant: 'destructive' },
    disconnected: { label: 'Desconectado', variant: 'outline' },
  };

  const { label, variant } = config[status] || config.disconnected;

  return (
    <Badge variant={variant} className="gap-1">
      {status === 'connected' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'error' && <XCircle className="h-3 w-3" />}
      {status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </Badge>
  );
}

function NoMlAccountState() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
        <Link2 className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-2">Nenhuma conta do Mercado Livre conectada</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
        Para usar o módulo de publicidade, primeiro conecte sua conta do Mercado Livre 
        através das <strong>Configurações → Integrações</strong>.
      </p>
      <Button variant="outline" asChild>
        <Link to="/settings">
          <Settings className="h-4 w-4 mr-2" />
          Ir para Configurações
        </Link>
      </Button>
    </div>
  );
}

function StatusCard({ 
  label, 
  value, 
  icon, 
  color = 'default',
  subtext 
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode;
  color?: 'default' | 'success' | 'destructive';
  subtext?: string | null;
}) {
  return (
    <div className={cn(
      "p-4 rounded-lg border",
      color === 'success' && "border-success/30 bg-success/5",
      color === 'destructive' && "border-destructive/30 bg-destructive/5",
      color === 'default' && "border-border/50"
    )}>
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
        {icon}
        {label}
      </div>
      <div className="font-medium">{value}</div>
      {subtext && (
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      )}
    </div>
  );
}

function JobCard({ job }: { job: AdsSyncJob }) {
  const isRunning = job.status === 'running';
  const isPending = job.status === 'pending';
  const isFailed = job.status === 'failed';

  return (
    <div className={cn(
      "p-3 rounded-lg border text-sm",
      isFailed && "border-destructive/30 bg-destructive/5"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {isPending && <Clock className="h-4 w-4 text-muted-foreground" />}
          {job.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-success" />}
          {isFailed && <XCircle className="h-4 w-4 text-destructive" />}
          <span className="font-medium capitalize">{job.job_type.replace('_', ' ')}</span>
        </div>
        <Badge variant={
          job.status === 'completed' ? 'default' :
          job.status === 'failed' ? 'destructive' :
          job.status === 'running' ? 'secondary' : 'outline'
        }>
          {job.status}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="block text-foreground font-medium">{job.processed_records || 0}</span>
          Processados
        </div>
        <div>
          <span className="block text-foreground font-medium">{job.failed_records || 0}</span>
          Falhas
        </div>
        <div>
          <span className="block text-foreground font-medium">
            {job.started_at 
              ? formatDistanceToNow(new Date(job.started_at), { locale: ptBR })
              : '-'}
          </span>
          Iniciado
        </div>
      </div>
      {job.error_message && (
        <p className="text-xs text-destructive mt-2">{job.error_message}</p>
      )}
    </div>
  );
}

function LogCard({ log }: { log: AdsSyncLog }) {
  const isError = log.log_level === 'error';
  const isWarn = log.log_level === 'warn';

  return (
    <div className={cn(
      "p-3 rounded-lg border text-sm",
      isError && "border-destructive/30 bg-destructive/5",
      isWarn && "border-warning/30 bg-warning/5"
    )}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Badge variant={isError ? 'destructive' : isWarn ? 'secondary' : 'outline'} className="text-xs">
            {log.log_level}
          </Badge>
          <span className="font-medium">{log.log_type}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
        </span>
      </div>
      {log.message && (
        <p className="text-muted-foreground">{log.message}</p>
      )}
      {log.duration_ms && (
        <span className="text-xs text-muted-foreground">
          Duração: {log.duration_ms}ms
        </span>
      )}
    </div>
  );
}

// Helper functions
function getStatusLabel(status: AdsConnection['status']): string {
  const labels: Record<string, string> = {
    connected: 'Conectado',
    pending: 'Pendente',
    expired: 'Token Expirado',
    error: 'Erro na Conexão',
    disconnected: 'Desconectado',
  };
  return labels[status] || status;
}

function getStatusIcon(status: AdsConnection['status']): React.ReactNode {
  switch (status) {
    case 'connected': return <CheckCircle2 className="h-5 w-5 text-success" />;
    case 'pending': return <Loader2 className="h-5 w-5 animate-spin" />;
    case 'expired': return <AlertTriangle className="h-5 w-5 text-warning" />;
    case 'error': return <XCircle className="h-5 w-5 text-destructive" />;
    default: return <WifiOff className="h-5 w-5 text-muted-foreground" />;
  }
}

function getStatusColor(status: AdsConnection['status']): 'default' | 'success' | 'destructive' {
  switch (status) {
    case 'connected': return 'success';
    case 'error':
    case 'expired': return 'destructive';
    default: return 'default';
  }
}

function getDataTypeLabel(dataType: string): string {
  const labels: Record<string, string> = {
    campaigns: 'Campanhas',
    ad_groups: 'Grupos',
    items: 'Produtos',
    daily_metrics: 'Métricas',
  };
  return labels[dataType] || dataType;
}
