import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Settings } from 'lucide-react';
import { toast } from 'sonner';

interface CompetitorSettingsProps {
  sellerId: string;
}

interface Settings {
  default_snapshot_ttl_hours: number;
  max_requests_per_minute: number;
  margin_floor_percent: number;
  target_margin_percent: number;
  auto_monitor_abc_a: boolean;
  auto_monitor_trending: boolean;
}

export function CompetitorSettings({ sellerId }: CompetitorSettingsProps) {
  const [settings, setSettings] = useState<Settings>({
    default_snapshot_ttl_hours: 12,
    max_requests_per_minute: 10,
    margin_floor_percent: 8,
    target_margin_percent: 15,
    auto_monitor_abc_a: true,
    auto_monitor_trending: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/settings?seller_id=${sellerId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setSettings({
          default_snapshot_ttl_hours: data.default_snapshot_ttl_hours || 12,
          max_requests_per_minute: data.max_requests_per_minute || 10,
          margin_floor_percent: data.margin_floor_percent || 8,
          target_margin_percent: data.target_margin_percent || 15,
          auto_monitor_abc_a: data.auto_monitor_abc_a !== false,
          auto_monitor_trending: data.auto_monitor_trending !== false,
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/settings/update`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seller_id: sellerId,
            ...settings,
          }),
        }
      );

      if (response.ok) {
        toast.success('Configurações salvas');
      } else {
        toast.error('Erro ao salvar');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações de Margem
          </CardTitle>
          <CardDescription>
            Defina os parâmetros de margem para alertas e recomendações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="targetMargin">Margem Alvo (%)</Label>
              <Input
                id="targetMargin"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={settings.target_margin_percent}
                onChange={(e) => setSettings(s => ({ ...s, target_margin_percent: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Margem ideal para seus produtos
              </p>
            </div>
            <div>
              <Label htmlFor="floorMargin">Margem Mínima (%)</Label>
              <Input
                id="floorMargin"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={settings.margin_floor_percent}
                onChange={(e) => setSettings(s => ({ ...s, margin_floor_percent: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Abaixo disso, alerta de margem baixa
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configurações de Cache</CardTitle>
          <CardDescription>
            Controle a frequência de atualização dos snapshots de mercado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="ttl">TTL do Snapshot (horas)</Label>
              <Input
                id="ttl"
                type="number"
                min="1"
                max="168"
                value={settings.default_snapshot_ttl_hours}
                onChange={(e) => setSettings(s => ({ ...s, default_snapshot_ttl_hours: parseInt(e.target.value) || 12 }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tempo de validade dos dados de mercado em cache
              </p>
            </div>
            <div>
              <Label htmlFor="rateLimit">Limite de requisições/minuto</Label>
              <Input
                id="rateLimit"
                type="number"
                min="1"
                max="60"
                value={settings.max_requests_per_minute}
                onChange={(e) => setSettings(s => ({ ...s, max_requests_per_minute: parseInt(e.target.value) || 10 }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Evita exceder limite da API do ML
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monitoramento Automático</CardTitle>
          <CardDescription>
            Configure quais produtos serão monitorados automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Monitorar produtos Classe A</Label>
              <p className="text-xs text-muted-foreground">
                Prioriza análise de concorrência para produtos mais lucrativos
              </p>
            </div>
            <Switch
              checked={settings.auto_monitor_abc_a}
              onCheckedChange={(v) => setSettings(s => ({ ...s, auto_monitor_abc_a: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Monitorar produtos em tendência</Label>
              <p className="text-xs text-muted-foreground">
                Acompanha produtos com aumento de vendas/visitas
              </p>
            </div>
            <Switch
              checked={settings.auto_monitor_trending}
              onCheckedChange={(v) => setSettings(s => ({ ...s, auto_monitor_trending: v }))}
            />
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
