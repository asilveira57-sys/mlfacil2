import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plug, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { useFinanceAccounts, useConnectMpAccount, useRefreshMpToken } from '@/hooks/useFinanceAccounts';
import { useMlAccounts } from '@/hooks/useMlAccounts';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG = {
  connected: { label: 'Conectado', icon: CheckCircle2, color: 'bg-green-100 text-green-700 border-green-200' },
  attention: { label: 'Atenção', icon: AlertTriangle, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  revoked: { label: 'Revogado', icon: XCircle, color: 'bg-red-100 text-red-700 border-red-200' },
  disconnected: { label: 'Desconectado', icon: XCircle, color: 'bg-muted text-muted-foreground' },
  error: { label: 'Erro', icon: XCircle, color: 'bg-red-100 text-red-700 border-red-200' },
} as const;

export default function FinanceiroIntegracoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: financeAccounts, isLoading: loadingFinance } = useFinanceAccounts();
  const { data: mlAccounts, isLoading: loadingMl } = useMlAccounts({ onlyConnected: true });
  const connectMp = useConnectMpAccount();
  const refreshToken = useRefreshMpToken();

  // Handle OAuth redirect params
  useEffect(() => {
    if (searchParams.get('mp_connected') === 'true') {
      const nickname = searchParams.get('nickname') || '';
      toast.success(`Mercado Pago conectado${nickname ? `: ${nickname}` : ''}!`);
      setSearchParams({}, { replace: true });
    }
    if (searchParams.get('mp_error')) {
      const err = searchParams.get('mp_error');
      const messages: Record<string, string> = {
        token_exchange_failed: 'Falha ao trocar código de autorização. Tente novamente.',
        user_fetch_failed: 'Falha ao obter dados do usuário.',
        save_failed: 'Falha ao salvar credenciais.',
        missing_user_id: 'Sessão expirada. Faça login novamente.',
      };
      toast.error(messages[err || ''] || 'Erro ao conectar Mercado Pago.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const mpAccount = financeAccounts?.[0]; // Primary finance account
  const mlAccount = mlAccounts?.[0]; // Primary ML account

  const mpStatus = mpAccount?.connection_status || 'disconnected';
  const mlStatus = mlAccount ? 'connected' : 'disconnected';

  const mpConfig = STATUS_CONFIG[mpStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.disconnected;
  const mlConfig = STATUS_CONFIG[mlStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.disconnected;

  const MpIcon = mpConfig.icon;
  const MlIcon = mlConfig.icon;

  const handleConnectMp = () => {
    connectMp.mutate({
      ml_account_id: mlAccount?.id,
      companyId: '',
    });
  };

  const handleRefreshToken = () => {
    if (mpAccount) {
      refreshToken.mutate(mpAccount.id);
    }
  };

  const isLoading = loadingFinance || loadingMl;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Central de Integrações Financeiras</h1>
        <p className="text-muted-foreground">Gerencie conexões com Mercado Livre e Mercado Pago</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mercado Pago Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Mercado Pago</CardTitle>
                <Badge variant="outline" className={mpConfig.color}>
                  <MpIcon className="h-3 w-3 mr-1" />
                  {mpConfig.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Pagamentos, recebimentos e ledger da conta
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {mpAccount && (
                <>
                  <div className="text-sm">
                    <span className="font-medium">{mpAccount.nickname || mpAccount.mp_user_id}</span>
                    {mpAccount.email && (
                      <span className="text-muted-foreground ml-2">({mpAccount.email})</span>
                    )}
                  </div>
                  {mpAccount.last_api_ok_at && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Última conexão: {formatDistanceToNow(new Date(mpAccount.last_api_ok_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  )}
                  {mpAccount.last_api_error_code && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      Erro: {mpAccount.last_api_error_code}
                    </div>
                  )}
                </>
              )}
              <div className="flex gap-2 flex-wrap">
                {mpStatus === 'disconnected' ? (
                  <Button size="sm" onClick={handleConnectMp} disabled={connectMp.isPending}>
                    {connectMp.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Plug className="h-3 w-3 mr-1" />
                    )}
                    Conectar Mercado Pago
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={handleRefreshToken} disabled={refreshToken.isPending}>
                      {refreshToken.isPending ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      )}
                      Renovar Token
                    </Button>
                    {(mpStatus === 'revoked' || mpStatus === 'error') && (
                      <Button size="sm" onClick={handleConnectMp} disabled={connectMp.isPending}>
                        <Plug className="h-3 w-3 mr-1" />
                        Reconectar
                      </Button>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Mercado Livre Card (read-only, from ml_accounts) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Mercado Livre</CardTitle>
                <Badge variant="outline" className={mlConfig.color}>
                  <MlIcon className="h-3 w-3 mr-1" />
                  {mlConfig.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Pedidos e envios para conciliação
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {mlAccount ? (
                <div className="text-sm">
                  <span className="font-medium">{mlAccount.nickname || mlAccount.ml_user_id}</span>
                  {mlAccount.email && (
                    <span className="text-muted-foreground ml-2">({mlAccount.email})</span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Conecte sua conta do Mercado Livre no módulo principal para habilitar a conciliação de pedidos.
                </p>
              )}
              <div className="flex gap-2">
                {!mlAccount && (
                  <Button size="sm" variant="outline" onClick={() => window.location.href = '/dashboard'}>
                    Ir para Dashboard
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
