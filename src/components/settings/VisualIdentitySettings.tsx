import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Palette, Eye, Sparkles, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useVisualIdentity, useVisualIdentityMutations } from '@/hooks/useVisualIdentity';
import { VisualOverlay } from '@/components/visual-identity/VisualOverlay';

export function VisualIdentitySettings() {
  const { settings, groups, activeGroup, isLoading, gradient, intensity } = useVisualIdentity();
  const { upsertSettings } = useVisualIdentityMutations();

  const [modo, setModo] = useState<'automatico' | 'manual' | 'clean'>('automatico');
  const [grupoManual, setGrupoManual] = useState<string>('');
  const [intensidade, setIntensidade] = useState(5);
  const [aplicarDashboard, setAplicarDashboard] = useState(true);
  const [aplicarMenu, setAplicarMenu] = useState(false);
  const [aplicarCards, setAplicarCards] = useState(false);

  useEffect(() => {
    if (settings) {
      setModo(settings.modo_identidade as any);
      setGrupoManual(settings.grupo_visual_manual || '');
      setIntensidade(settings.intensidade_overlay);
      setAplicarDashboard(settings.aplicar_dashboard);
      setAplicarMenu(settings.aplicar_menu);
      setAplicarCards(settings.aplicar_cards);
    }
  }, [settings]);

  const handleSave = () => {
    upsertSettings.mutate(
      {
        modo_identidade: modo,
        grupo_visual_manual: modo === 'manual' ? grupoManual : null,
        intensidade_overlay: intensidade,
        aplicar_dashboard: aplicarDashboard,
        aplicar_menu: aplicarMenu,
        aplicar_cards: aplicarCards,
      } as any,
      {
        onSuccess: () => toast.success('Identidade visual salva!'),
        onError: (err) => toast.error(err.message),
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const previewGroup = modo === 'manual'
    ? groups.find((g) => g.slug === grupoManual)
    : activeGroup;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Identidade Visual
          </CardTitle>
          <CardDescription>
            Configure como o sistema adapta a aparência com base no seu segmento principal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Modo */}
          <div className="space-y-2">
            <Label>Modo de Identidade</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatico">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Automático — detecta sua categoria principal
                  </div>
                </SelectItem>
                <SelectItem value="manual">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    Manual — escolha o grupo visual
                  </div>
                </SelectItem>
                <SelectItem value="clean">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    Clean — sem overlay, apenas cor da empresa
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Grupo manual */}
          {modo === 'manual' && (
            <div className="space-y-2">
              <Label>Grupo Visual</Label>
              <Select value={grupoManual} onValueChange={setGrupoManual}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um grupo" />
                </SelectTrigger>
                <SelectContent>
                  {groups.filter((g) => g.ativo).map((g) => (
                    <SelectItem key={g.slug} value={g.slug}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-sm border"
                          style={{
                            background: `linear-gradient(135deg, ${g.gradiente_inicio}, ${g.gradiente_fim})`,
                          }}
                        />
                        {g.nome}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Categoria detectada (modo automático) */}
          {modo === 'automatico' && settings?.categoria_detectada && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <span className="text-muted-foreground">Categoria detectada:</span>{' '}
              <Badge variant="secondary">{settings.categoria_detectada}</Badge>
              {settings.grupo_visual_aplicado && (
                <>
                  {' → '}
                  <Badge>{settings.grupo_visual_aplicado}</Badge>
                </>
              )}
            </div>
          )}

          {/* Intensidade */}
          {modo !== 'clean' && (
            <div className="space-y-2">
              <Label>Intensidade do Overlay: {intensidade}/10</Label>
              <Slider
                value={[intensidade]}
                min={1}
                max={10}
                step={1}
                onValueChange={([v]) => setIntensidade(v)}
              />
              <p className="text-xs text-muted-foreground">
                Menor = sutil, Maior = mais visível
              </p>
            </div>
          )}

          {/* Onde aplicar */}
          {modo !== 'clean' && (
            <div className="space-y-3">
              <Label>Aplicar em</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Dashboard principal</span>
                  <Switch checked={aplicarDashboard} onCheckedChange={setAplicarDashboard} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Menu lateral</span>
                  <Switch checked={aplicarMenu} onCheckedChange={setAplicarMenu} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Cards hero</span>
                  <Switch checked={aplicarCards} onCheckedChange={setAplicarCards} />
                </div>
              </div>
            </div>
          )}

          <Button onClick={handleSave} disabled={upsertSettings.isPending} className="gap-2 w-full">
            {upsertSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Configurações
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      {modo !== 'clean' && previewGroup && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VisualOverlay target="dashboard" className="rounded-lg overflow-hidden">
              <div className="p-8 bg-card rounded-lg">
                <h3 className="text-lg font-bold">{previewGroup.nome}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Este é um preview de como o overlay ficará com intensidade {intensidade}/10.
                </p>
                <div className="flex gap-2 mt-3">
                  <Badge>Categoria</Badge>
                  <Badge variant="secondary">Visual</Badge>
                </div>
              </div>
            </VisualOverlay>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
