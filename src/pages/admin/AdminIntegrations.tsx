import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plug, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShoppingCart,
  CreditCard,
  BarChart,
  Zap
} from 'lucide-react';
import { useIntegrations } from '@/hooks/useAdmin';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const integrationIcons: Record<string, React.ElementType> = {
  mercado_livre: ShoppingCart,
  mercado_pago: CreditCard,
  google_analytics: BarChart,
  meta_pixel: Zap,
  google_tag_manager: BarChart,
};

export function AdminIntegrations() {
  const { data: integrations, isLoading, updateIntegration } = useIntegrations();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-100 text-green-700">
            <CheckCircle className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        );
      case 'inactive':
        return (
          <Badge variant="outline">
            <XCircle className="h-3 w-3 mr-1" />
            Inativo
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Erro
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleToggleStatus = async (integration: { id: string; status: string }) => {
    const newStatus = integration.status === 'active' ? 'inactive' : 'active';
    await updateIntegration.mutateAsync({ id: integration.id, status: newStatus as 'active' | 'inactive' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-muted-foreground">
          Gerencie as integrações externas da plataforma
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {integrations?.map((integration) => {
            const IconComponent = integrationIcons[integration.integration_name] || Plug;
            
            return (
              <Card key={integration.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{integration.display_name}</CardTitle>
                      <CardDescription className="text-xs">
                        {integration.integration_name}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(integration.status)}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Last Sync */}
                  {integration.last_sync_at && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Última sincronização</span>
                      <span>
                        {formatDistanceToNow(new Date(integration.last_sync_at), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                      </span>
                    </div>
                  )}

                  {/* Error Display */}
                  {integration.status === 'error' && integration.last_error && (
                    <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                      <p className="font-medium">Erro:</p>
                      <p className="text-xs mt-1">{integration.last_error}</p>
                      {integration.error_count > 0 && (
                        <p className="text-xs mt-1 opacity-70">
                          {integration.error_count} erro(s) consecutivo(s)
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={integration.status === 'active'}
                        onCheckedChange={() => handleToggleStatus(integration)}
                        disabled={updateIntegration.isPending}
                      />
                      <span className="text-sm text-muted-foreground">
                        {integration.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    
                    {integration.status === 'active' && (
                      <Button variant="ghost" size="sm">
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Sincronizar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Future Integrations Note */}
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <Plug className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              Novas integrações serão adicionadas aqui
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
