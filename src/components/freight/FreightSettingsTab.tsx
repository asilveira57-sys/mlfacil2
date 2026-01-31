import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFreightRulesets } from '@/hooks/useFreightRulesets';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Loader2 } from 'lucide-react';
import { useState } from 'react';

export function FreightSettingsTab() {
  const { settings, updateSettings, loading } = useFreightRulesets();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    tolerance_value: settings?.tolerance_value || 5,
    tolerance_percent: settings?.tolerance_percent || 10,
    comparison_mode: settings?.comparison_mode || 'paid_vs_expected',
    profile_a_weight_max: settings?.profile_a_weight_max || 0.5,
    profile_a_dimensions_sum: settings?.profile_a_dimensions_sum || 60,
    profile_b_weight_max: settings?.profile_b_weight_max || 5,
    profile_b_dimensions_sum: settings?.profile_b_dimensions_sum || 150,
  });

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateSettings(formData);
      toast({
        title: 'Configurações salvas',
        description: 'As configurações de frete foram atualizadas com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Configurações de Frete</h2>
          <p className="text-sm text-muted-foreground">
            Defina tolerâncias, modos de comparação e perfis de frete.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar Alterações
        </Button>
      </div>

      {/* Tolerance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Tolerância de Divergência
          </CardTitle>
          <CardDescription>
            Defina quando uma diferença de frete é considerada divergente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tolerance_value">Tolerância em R$</Label>
              <Input
                id="tolerance_value"
                type="number"
                step="0.01"
                value={formData.tolerance_value}
                onChange={(e) => setFormData({ ...formData, tolerance_value: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Diferenças abaixo deste valor não são alertadas.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tolerance_percent">Tolerância em %</Label>
              <Input
                id="tolerance_percent"
                type="number"
                step="0.1"
                value={formData.tolerance_percent}
                onChange={(e) => setFormData({ ...formData, tolerance_percent: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Diferenças abaixo deste percentual não são alertadas.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="comparison_mode">Modo de Comparação</Label>
              <Select
                value={formData.comparison_mode}
                onValueChange={(value) => setFormData({ ...formData, comparison_mode: value as typeof formData.comparison_mode })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid_vs_expected">Custo Pago vs Esperado</SelectItem>
                  <SelectItem value="charged_vs_expected">Receita Cobrada vs Esperada</SelectItem>
                  <SelectItem value="both">Ambos</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Qual valor comparar com o esperado.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfis de Frete (A/B/C)</CardTitle>
          <CardDescription>
            Defina os limites para classificação automática de produtos por perfil.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            {/* Profile A */}
            <div className="space-y-4 p-4 rounded-lg border bg-green-50/50 dark:bg-green-950/20">
              <div className="font-medium text-green-700 dark:text-green-400">Perfil A (Pequeno)</div>
              <div className="space-y-2">
                <Label className="text-xs">Peso Máximo (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.profile_a_weight_max}
                  onChange={(e) => setFormData({ ...formData, profile_a_weight_max: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Soma Lados Máx. (cm)</Label>
                <Input
                  type="number"
                  value={formData.profile_a_dimensions_sum}
                  onChange={(e) => setFormData({ ...formData, profile_a_dimensions_sum: parseInt(e.target.value) })}
                />
              </div>
            </div>

            {/* Profile B */}
            <div className="space-y-4 p-4 rounded-lg border bg-yellow-50/50 dark:bg-yellow-950/20">
              <div className="font-medium text-yellow-700 dark:text-yellow-400">Perfil B (Médio)</div>
              <div className="space-y-2">
                <Label className="text-xs">Peso Máximo (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.profile_b_weight_max}
                  onChange={(e) => setFormData({ ...formData, profile_b_weight_max: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Soma Lados Máx. (cm)</Label>
                <Input
                  type="number"
                  value={formData.profile_b_dimensions_sum}
                  onChange={(e) => setFormData({ ...formData, profile_b_dimensions_sum: parseInt(e.target.value) })}
                />
              </div>
            </div>

            {/* Profile C */}
            <div className="space-y-4 p-4 rounded-lg border bg-red-50/50 dark:bg-red-950/20">
              <div className="font-medium text-red-700 dark:text-red-400">Perfil C (Grande)</div>
              <p className="text-xs text-muted-foreground">
                Produtos acima dos limites do Perfil B são automaticamente classificados como C.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
