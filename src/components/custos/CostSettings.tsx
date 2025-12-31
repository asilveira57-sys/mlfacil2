import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Package, Percent, Calculator } from 'lucide-react';
import { toast } from 'sonner';

interface CostSettingsProps {
  sellerId: string;
}

interface Settings {
  packaging: {
    default_packaging_cost: number;
    packaging_cost_mode: 'por_pedido' | 'por_item';
  };
  fees: {
    fee_mode: 'percentual' | 'fixo' | 'misto';
    fee_percent_default: number;
    fee_fixed_default: number;
  };
}

export function CostSettings({ sellerId }: CostSettingsProps) {
  const [settings, setSettings] = useState<Settings>({
    packaging: { default_packaging_cost: 0, packaging_cost_mode: 'por_pedido' },
    fees: { fee_mode: 'percentual', fee_percent_default: 16, fee_fixed_default: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          fees: {
            fee_mode: data.fees?.fee_mode || 'percentual',
            fee_percent_default: data.fees?.fee_percent_default || 16,
            fee_fixed_default: data.fees?.fee_fixed_default || 0,
          },
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
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
            fees: settings.fees,
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Taxa do Marketplace
          </CardTitle>
          <CardDescription>
            Configure a taxa do Mercado Livre para cálculo de custos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tipo de taxa</Label>
            <RadioGroup
              value={settings.fees.fee_mode}
              onValueChange={(value: 'percentual' | 'fixo' | 'misto') =>
                setSettings(s => ({
                  ...s,
                  fees: { ...s.fees, fee_mode: value },
                }))
              }
              className="mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="percentual" id="percentual" />
                <Label htmlFor="percentual" className="font-normal">Percentual sobre a venda</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fixo" id="fixo" />
                <Label htmlFor="fixo" className="font-normal">Valor fixo por venda</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="misto" id="misto" />
                <Label htmlFor="misto" className="font-normal">Percentual + valor fixo</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(settings.fees.fee_mode === 'percentual' || settings.fees.fee_mode === 'misto') && (
              <div>
                <Label htmlFor="feePercent">Taxa percentual (%)</Label>
                <Input
                  id="feePercent"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={settings.fees.fee_percent_default}
                  onChange={(e) =>
                    setSettings(s => ({
                      ...s,
                      fees: { ...s.fees, fee_percent_default: parseFloat(e.target.value) || 0 },
                    }))
                  }
                  className="mt-1"
                />
              </div>
            )}

            {(settings.fees.fee_mode === 'fixo' || settings.fees.fee_mode === 'misto') && (
              <div>
                <Label htmlFor="feeFixed">Taxa fixa (R$)</Label>
                <Input
                  id="feeFixed"
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.fees.fee_fixed_default}
                  onChange={(e) =>
                    setSettings(s => ({
                      ...s,
                      fees: { ...s.fees, fee_fixed_default: parseFloat(e.target.value) || 0 },
                    }))
                  }
                  className="mt-1"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
                Taxa marketplace: <strong>
                  R$ {(
                    (settings.fees.fee_mode === 'percentual' || settings.fees.fee_mode === 'misto'
                      ? (100 * settings.fees.fee_percent_default) / 100
                      : 0) +
                    (settings.fees.fee_mode === 'fixo' || settings.fees.fee_mode === 'misto'
                      ? settings.fees.fee_fixed_default
                      : 0)
                  ).toFixed(2)}
                </strong>
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
