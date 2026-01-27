import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, 
  CreditCard, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  UserPlus,
  Timer
} from 'lucide-react';
import { useAdminDashboardStats, useWebhookLogs } from '@/hooks/useAdmin';

export function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useAdminDashboardStats();
  const { data: webhooks, isLoading: webhooksLoading } = useWebhookLogs();

  const pendingWebhooks = webhooks?.filter(w => !w.processed_at) || [];
  const errorWebhooks = webhooks?.filter(w => w.error_message) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard Admin</h1>
        <p className="text-muted-foreground">
          Visão geral da plataforma
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.total_users || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">
              +{stats?.recent_signups_7d || 0} nos últimos 7 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Em Teste</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.trial_users || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats?.trials_expiring_soon || 0} expirando em breve
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-primary">
                {stats?.active_subscriptions || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Vencidas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-destructive">
                {stats?.expired_subscriptions || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Trials Expiring */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Testes Expirando
            </CardTitle>
            <CardDescription>
              Usuários com teste expirando nos próximos 3 dias
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : stats?.trials_expiring_soon ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {stats.trials_expiring_soon} usuário(s)
                </Badge>
                <span className="text-sm text-muted-foreground">
                  precisam de atenção
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum teste expirando em breve
              </p>
            )}
          </CardContent>
        </Card>

        {/* Webhook Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Webhooks
            </CardTitle>
            <CardDescription>
              Status dos webhooks de pagamento
            </CardDescription>
          </CardHeader>
          <CardContent>
            {webhooksLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {pendingWebhooks.length} pendente(s)
                  </Badge>
                  {errorWebhooks.length > 0 && (
                    <Badge variant="destructive">
                      {errorWebhooks.length} com erro
                    </Badge>
                  )}
                </div>
                {errorWebhooks.length === 0 && pendingWebhooks.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Todos os webhooks processados com sucesso
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Resumo Rápido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <UserPlus className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Novos usuários (7d)</p>
                <p className="text-xl font-bold">{stats?.recent_signups_7d || 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <CreditCard className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Taxa de conversão</p>
                <p className="text-xl font-bold">
                  {stats?.total_users 
                    ? ((stats.active_subscriptions / stats.total_users) * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Em período de teste</p>
                <p className="text-xl font-bold">
                  {stats?.total_users 
                    ? ((stats.trial_users / stats.total_users) * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
