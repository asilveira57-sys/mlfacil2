import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plug, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface IntegrationCardProps {
  title: string;
  description: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
  nextSync?: string;
}

function IntegrationCard({ title, description, status, lastSync, nextSync }: IntegrationCardProps) {
  const statusConfig = {
    connected: { label: 'Conectado', icon: CheckCircle2, color: 'bg-green-100 text-green-700 border-green-200' },
    disconnected: { label: 'Desconectado', icon: XCircle, color: 'bg-muted text-muted-foreground' },
    error: { label: 'Erro', icon: XCircle, color: 'bg-red-100 text-red-700 border-red-200' },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="outline" className={config.color}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastSync && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            Última sync: {lastSync}
          </div>
        )}
        {nextSync && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            Próxima: {nextSync}
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={status === 'disconnected'}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Sincronizar agora
          </Button>
          <Button size="sm" variant="outline" disabled={status === 'disconnected'}>
            Reprocessar período
          </Button>
          {status === 'disconnected' && (
            <Button size="sm">
              <Plug className="h-3 w-3 mr-1" />
              Conectar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinanceiroIntegracoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Central de Integrações Financeiras</h1>
        <p className="text-muted-foreground">Gerencie conexões com Mercado Livre e Mercado Pago</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IntegrationCard
          title="Mercado Livre"
          description="Pedidos e envios para conciliação"
          status="disconnected"
        />
        <IntegrationCard
          title="Mercado Pago"
          description="Pagamentos, recebimentos e ledger da conta"
          status="disconnected"
        />
      </div>
    </div>
  );
}
