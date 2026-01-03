import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Save, Package, Calculator, RefreshCw, CheckCircle2, CloudOff, AlertTriangle, Link2, Zap, Play } from 'lucide-react';
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

interface SyncState {
  status: string;
  movements_synced: number;
  last_sync_finished_at: string | null;
  last_error: string | null;
  cursor_or_offset: string | null;
}

interface BillingStatus {
  total_orders: number;
  orders_with_billing: number;
  movements_count: number;
  last_sync: string | null;
}

export function CostSettings({ sellerId }: CostSettingsProps) {
  const [settings, setSettings] = useState<Settings>({
    packaging: { default_packaging_cost: 0, packaging_cost_mode: 'por_pedido' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<'full' | 'delta'>('delta');
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>({
    total_orders: 0,
    orders_with_billing: 0,
    movements_count: 0,
    last_sync: null,
  });

  const loadBillingStatus = useCallback(async () => {
    try {
      // Count orders
      const { count: totalOrders } = await supabase
        .from('meli_orders_cache')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .eq('order_status', 'paid');

      // Count orders with real financial data
      const { count: ordersWithBilling } = await supabase
        .from('order_cost_breakdown_cache')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .eq('has_real_financial', true);

      // Count movements
      const { count: movementsCount } = await supabase
        .from('meli_financial_movements_cache')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', sellerId);

      // Get sync state
      const { data: state } = await supabase
        .from('meli_financial_sync_state')
        .select('*')
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (state) {
        setSyncState(state);
        if (state.status === 'running') {
          setSyncing(true);
        }
        if (state.last_error === 'RECONNECT_REQUIRED') {
          setNeedsReconnect(true);
        }
      }

      setBillingStatus({
        total_orders: totalOrders || 0,
        orders_with_billing: ordersWithBilling || 0,
        movements_count: movementsCount || 0,
        last_sync: state?.last_sync_finished_at || null,
      });
    } catch (error) {
      console.error('Error loading billing status:', error);
    }
  }, [sellerId]);

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

      await loadBillingStatus();

    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  // Poll for sync progress
  useEffect(() => {
    if (!syncing || !sellerId) return;

    const interval = setInterval(async () => {
      const { data: state } = await supabase
        .from('meli_financial_sync_state')
        .select('*')
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (state) {
        setSyncState(state);

        if (state.status === 'idle') {
          setSyncing(false);
          toast.success(`Sincronização concluída: ${state.movements_synced} movimentos`);
          loadBillingStatus();
        } else if (state.status === 'error') {
          setSyncing(false);
          if (state.last_error === 'RECONNECT_REQUIRED') {
            setNeedsReconnect(true);
            toast.error('Conexão com o Mercado Livre expirou');
          } else {
            toast.error(state.last_error || 'Erro na sincronização');
          }
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncing, sellerId, loadBillingStatus]);

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

  const handleSyncFinancial = async (mode: 'full' | 'delta', continueSync = false) => {
    setSyncing(true);
    setSyncMode(mode);
    setNeedsReconnect(false);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('ml-sync-financial', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { 
          seller_id: sellerId, 
          days: mode === 'full' ? 180 : 30,
          mode,
          continue_sync: continueSync
        },
      });

      if (response.data?.code === 'RECONNECT_REQUIRED') {
        setNeedsReconnect(true);
        setSyncing(false);
        toast.error('Conexão com o Mercado Livre expirou');
        return;
      }

      if (response.data?.status === 'already_running') {
        toast.info('Sincronização já em andamento');
        return;
      }

      if (response.data?.status === 'started') {
        toast.success(`Sincronização ${mode === 'delta' ? 'incremental' : 'completa'} iniciada`);
      } else {
        toast.error('Erro ao iniciar sincronização');
        setSyncing(false);
      }
    } catch (error) {
      console.error('Error syncing financial:', error);
      toast.error('Erro ao sincronizar dados financeiros');
      setSyncing(false);
    }
  };

  const handleReconnect = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('ml-auth-url', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {},
      });

      if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        toast.error('Erro ao obter URL de autorização');
      }
    } catch (error) {
      console.error('Error getting auth URL:', error);
      toast.error('Erro ao reconectar');
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

  const getTimeSinceLastSync = () => {
    if (!billingStatus.last_sync) return null;
    const lastSync = new Date(billingStatus.last_sync);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'menos de 1 hora';
    if (diffHours < 24) return `${diffHours} horas`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} dias`;
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
      {/* Reconnection Alert */}
      {needsReconnect && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Reconexão necessária</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Sua conexão com o Mercado Livre expirou. Reconecte para sincronizar os dados financeiros.</span>
            <Button variant="outline" size="sm" onClick={handleReconnect} className="ml-4">
              <Link2 className="h-4 w-4 mr-2" />
              Reconectar Conta
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Financial Sync Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Dados Financeiros do Mercado Livre
          </CardTitle>
          <CardDescription>
            Os custos reais (tarifa, frete, parcelamento) são obtidos automaticamente da API do ML
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sync Progress */}
          {syncing && syncState && (
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {syncMode === 'delta' ? 'Sincronização Incremental' : 'Sincronização Completa'}
                </span>
                <Badge variant="secondary" className="animate-pulse">
                  Processando...
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  {syncState.movements_synced} movimentos sincronizados
                </span>
              </div>
              {syncState.cursor_or_offset && (
                <p className="text-xs text-muted-foreground">
                  Cursor: {syncState.cursor_or_offset}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Última sincronização:</span>
                <span className="text-sm font-medium">{formatDate(billingStatus.last_sync)}</span>
                {billingStatus.last_sync && (
                  <span className="text-xs text-muted-foreground">({getTimeSinceLastSync()} atrás)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Movimentos:</span>
                <span className="text-sm font-medium">{billingStatus.movements_count.toLocaleString()}</span>
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
            
            <div className="flex gap-2">
              {/* Continue sync if interrupted */}
              {syncState?.status === 'error' && syncState.cursor_or_offset && (
                <Button 
                  variant="outline" 
                  onClick={() => handleSyncFinancial(syncMode, true)} 
                  disabled={syncing}
                  title="Continuar sincronização de onde parou"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Continuar
                </Button>
              )}
              
              {/* Delta Sync */}
              <Button 
                variant="default" 
                onClick={() => handleSyncFinancial('delta')} 
                disabled={syncing}
                title="Busca apenas movimentos novos (últimos 30 dias)"
              >
                <Zap className={`h-4 w-4 mr-2 ${syncing && syncMode === 'delta' ? 'animate-pulse' : ''}`} />
                {syncing && syncMode === 'delta' ? 'Sincronizando...' : 'Atualizar'}
              </Button>
              
              {/* Full Sync */}
              <Button 
                variant="outline" 
                onClick={() => handleSyncFinancial('full')} 
                disabled={syncing}
                title="Reprocessa todos os movimentos dos últimos 6 meses"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing && syncMode === 'full' ? 'animate-spin' : ''}`} />
                {syncing && syncMode === 'full' ? 'Sincronizando...' : 'Completa'}
              </Button>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            <strong>Atualizar:</strong> Busca movimentos dos últimos 30 dias (mais rápido). 
            <strong className="ml-2">Completa:</strong> Reprocessa os últimos 6 meses.
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
                  R$ {settings.packaging.packaging_cost_mode === 'por_pedido'
                    ? settings.packaging.default_packaging_cost.toFixed(2)
                    : (settings.packaging.default_packaging_cost * 2).toFixed(2)}
                </strong>
                {settings.packaging.packaging_cost_mode === 'por_item' && ' (2 × custo)'}
              </li>
              <li>Taxas ML: <strong>Dados reais da API</strong></li>
              <li>Custo produto: <strong>Do catálogo de custos</strong></li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}
