import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Save, Package, Calculator, RefreshCw, CheckCircle2, CloudOff } from 'lucide-react';
import { toast } from 'sonner';

interface CostSettingsProps {
  sellerId: string;
}

interface Settings {
  packaging: {
    default_packaging_cost: number;
    packaging_cost_mode: 'por_pedido' | 'por_item';
  };
}

interface BillingStatus {
  total_orders: number;
  orders_with_billing: number;
  last_sync: string | null;
}

export function CostSettings({ sellerId }: CostSettingsProps) {
  const [settings, setSettings] = useState<Settings>({
    packaging: { default_packaging_cost: 0, packaging_cost_mode: 'por_pedido' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>({
    total_orders: 0,
    orders_with_billing: 0,
    last_sync: null,
  });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/settings?seller_id=${sellerId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setSettings({
          packaging: {
            default_packaging_cost: data.packaging?.default_packaging_cost || 0,
            packaging_cost_mode: data.packaging?.packaging_cost_mode || 'por_pedido',
          },
        });
      }

      // Load billing status
      await loadBillingStatus(session.access_token);

    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const loadBillingStatus = async (accessToken: string) => {
    try {
      // Count orders
      const { count: totalOrders } = await supabase
        .from('meli_orders_cache')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .eq('order_status', 'paid');

      // Count orders with billing data
      const { count: ordersWithBilling } = await supabase
        .from('meli_order_financials_cache')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', sellerId);

      // Get last sync
      const { data: lastSync } = await supabase
        .from('meli_order_financials_cache')
        .select('synced_at')
        .eq('seller_id', sellerId)
        .order('synced_at', { ascending: false })
        .limit(1);

      setBillingStatus({
        total_orders: totalOrders || 0,
        orders_with_billing: ordersWithBilling || 0,
        last_sync: lastSync?.[0]?.synced_at || null,
      });
    } catch (error) {
      console.error('Error loading billing status:', error);
    }
  };

  useEffect(() => {
    if (sellerId) {
      loadSettings();
    }
  }, [sellerId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/settings/update`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seller_id: sellerId,
            packaging: settings.packaging,
          }),
        }
      );

      if (response.ok) {
        toast.success('Configurações salvas com sucesso');
      } else {
        toast.error('Erro ao salvar configurações');
      }
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncBilling = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('ml-sync-billing', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { seller_id: sellerId, months: 6 },
      });

      if (response.data?.job_id) {
        toast.success('Sincronização de dados financeiros iniciada');
        
        // Poll for completion
        const pollInterval = setInterval(async () => {
          const { data: job } = await supabase
            .from('sync_jobs')
            .select('status')
            .eq('id', response.data.job_id)
            .single();

          if (job?.status === 'done' || job?.status === 'error') {
            clearInterval(pollInterval);
            setSyncing(false);
            if (job.status === 'done') {
              toast.success('Dados financeiros sincronizados');
              loadBillingStatus(session.access_token);
            } else {
              toast.error('Erro na sincronização');
            }
          }
        }, 2000);

        // Timeout after 2 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          setSyncing(false);
        }, 120000);
      } else {
        toast.error('Erro ao iniciar sincronização');
        setSyncing(false);
      }
    } catch (error) {
      console.error('Error syncing billing:', error);
      toast.error('Erro ao sincronizar dados financeiros');
      setSyncing(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Nunca';
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const billingCoverage = billingStatus.total_orders > 0
    ? Math.round((billingStatus.orders_with_billing / billingStatus.total_orders) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Billing Sync Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Dados Financeiros do Mercado Livre
          </CardTitle>
          <CardDescription>
            Os custos da venda (tarifa, frete, parcelamento) são obtidos automaticamente da API do ML
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Última sincronização:</span>
                <span className="text-sm font-medium">{formatDate(billingStatus.last_sync)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Cobertura:</span>
                <span className="text-sm font-medium">
                  {billingStatus.orders_with_billing} de {billingStatus.total_orders} pedidos
                </span>
                {billingCoverage >= 80 ? (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    {billingCoverage}% com dados reais
                  </Badge>
                ) : billingCoverage > 0 ? (
                  <Badge variant="outline" className="text-amber-600 border-amber-600">
                    {billingCoverage}% com dados reais
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <CloudOff className="h-3 w-3 mr-1" />
                    Sem dados
                  </Badge>
                )}
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={handleSyncBilling} 
              disabled={syncing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Os dados financeiros são sincronizados automaticamente ao conectar sua conta. 
            Use o botão acima para buscar dados mais recentes.
          </p>
        </CardContent>
      </Card>

      {/* Packaging Cost Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Custo de Embalagem
          </CardTitle>
          <CardDescription>
            Defina o custo padrão de embalagem para seus pedidos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="packagingCost">Custo de embalagem (R$)</Label>
            <Input
              id="packagingCost"
              type="number"
              step="0.01"
              min="0"
              value={settings.packaging.default_packaging_cost}
              onChange={(e) =>
                setSettings(s => ({
                  ...s,
                  packaging: { ...s.packaging, default_packaging_cost: parseFloat(e.target.value) || 0 },
                }))
              }
              className="w-48 mt-1"
            />
          </div>

          <div>
            <Label>Modo de aplicação</Label>
            <RadioGroup
              value={settings.packaging.packaging_cost_mode}
              onValueChange={(value: 'por_pedido' | 'por_item') =>
                setSettings(s => ({
                  ...s,
                  packaging: { ...s.packaging, packaging_cost_mode: value },
                }))
              }
              className="mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="por_pedido" id="porPedido" />
                <Label htmlFor="porPedido" className="font-normal">Por pedido (1x por venda)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="por_item" id="porItem" />
                <Label htmlFor="porItem" className="font-normal">Por item (multiplica pela quantidade)</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Preview Card */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-5 w-5" />
            Preview do Cálculo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-1 text-muted-foreground">
            <p>Para um pedido de <strong>R$ 100,00</strong> com 2 itens:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>
                Embalagem: <strong>
                  R$ {(settings.packaging.packaging_cost_mode === 'por_pedido'
                    ? settings.packaging.default_packaging_cost
                    : settings.packaging.default_packaging_cost * 2
                  ).toFixed(2)}
                </strong>
              </li>
              <li>
                Tarifas ML: <Badge variant="outline" className="ml-1 text-green-600 border-green-600">Dados Reais</Badge>
                <span className="text-xs ml-1">(busca automática da API)</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}