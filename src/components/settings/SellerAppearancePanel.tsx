import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Palette, Wand2, Lock, Sparkles, LayoutTemplate, CalendarHeart,
  FolderTree, CheckCircle2, Eye, Loader2,
} from 'lucide-react';
import { useSellerVisualPreferences, useSellerVisualPreferencesMutations, type SellerAppearanceMode } from '@/hooks/useSellerVisualPreferences';
import { useThemeResolver } from '@/hooks/useThemeResolver';
import { useTemplatesList } from '@/hooks/useTemplates';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { TemplateMiniPreview, TemplateColorPreview } from './templates/TemplateColorPreview';
import type { DesignTokens } from '@/types/templates';

const MODE_CONFIG = {
  auto: {
    icon: Wand2,
    title: 'Automático',
    description: 'O sistema escolhe o melhor visual com base na sua categoria principal e sazonalidade.',
    badge: 'Recomendado',
    badgeVariant: 'default' as const,
  },
  fixed: {
    icon: Lock,
    title: 'Template Fixo',
    description: 'Escolha manualmente qual template aplicar, ignorando regras automáticas.',
    badge: null,
    badgeVariant: 'outline' as const,
  },
  clean: {
    icon: Sparkles,
    title: 'Limpo',
    description: 'Interface neutra sem overlays ou gradientes temáticos. Apenas a cor da empresa.',
    badge: null,
    badgeVariant: 'outline' as const,
  },
};

export function SellerAppearancePanel() {
  const { mode, fixedTemplateId, allowSeasonal, allowCategory, preferredIntensity, isLoading } = useSellerVisualPreferences();
  const { upsert } = useSellerVisualPreferencesMutations();
  const { data: templates = [], isLoading: templatesLoading } = useTemplatesList();
  const { data: workspaceId } = useCurrentWorkspaceId();
  const { activeAccountId } = useActiveAccount();

  const [localMode, setLocalMode] = useState<SellerAppearanceMode | null>(null);
  const [localFixedId, setLocalFixedId] = useState<string | null>(null);
  const [localSeasonal, setLocalSeasonal] = useState<boolean | null>(null);
  const [localCategory, setLocalCategory] = useState<boolean | null>(null);
  const [localIntensity, setLocalIntensity] = useState<number | null>(null);

  // Effective values (local overrides for unsaved changes)
  const effectiveMode = localMode ?? mode;
  const effectiveFixedId = localFixedId ?? fixedTemplateId;
  const effectiveSeasonal = localSeasonal ?? allowSeasonal;
  const effectiveCategory = localCategory ?? allowCategory;
  const effectiveIntensity = localIntensity ?? preferredIntensity;

  const hasChanges = localMode !== null || localFixedId !== null || localSeasonal !== null || localCategory !== null || localIntensity !== null;

  const { resolved, isLoading: resolverLoading } = useThemeResolver({
    workspace_id: workspaceId,
    company_id: activeAccountId,
    current_date: new Date(),
    user_theme_preference: 'light',
  });

  const activeTemplates = templates.filter(t => t.is_active);

  const handleSave = () => {
    const updates: Record<string, any> = {};
    if (localMode !== null) updates.mode = localMode;
    if (localFixedId !== null) updates.fixed_template_id = localFixedId;
    if (localSeasonal !== null) updates.allow_seasonal = localSeasonal;
    if (localCategory !== null) updates.allow_category = localCategory;
    if (localIntensity !== null) updates.preferred_intensity = localIntensity;

    upsert.mutate(updates, {
      onSuccess: () => {
        setLocalMode(null);
        setLocalFixedId(null);
        setLocalSeasonal(null);
        setLocalCategory(null);
        setLocalIntensity(null);
      },
    });
  };

  const handleDiscard = () => {
    setLocalMode(null);
    setLocalFixedId(null);
    setLocalSeasonal(null);
    setLocalCategory(null);
    setLocalIntensity(null);
  };

  if (isLoading || templatesLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Aparência
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure como o visual da sua interface é aplicado.
        </p>
      </div>

      {/* Current resolved theme preview */}
      {resolved && effectiveMode !== 'clean' && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-4">
              <TemplateMiniPreview
                tokens={resolved.resolved_tokens}
                className="w-28 h-18 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Visual ativo:</span>
                  <span className="text-sm font-semibold">{resolved.template.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {resolved.resolution_source}
                </p>
                <TemplateColorPreview
                  tokens={resolved.resolved_tokens}
                  size="sm"
                  className="mt-2 max-w-[200px]"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mode selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Modo de Aparência</CardTitle>
          <CardDescription>
            Escolha como o sistema determina seu visual
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={effectiveMode}
            onValueChange={(v) => setLocalMode(v as SellerAppearanceMode)}
            className="space-y-3"
          >
            {(Object.entries(MODE_CONFIG) as [SellerAppearanceMode, typeof MODE_CONFIG['auto']][]).map(([key, config]) => {
              const Icon = config.icon;
              const isSelected = effectiveMode === key;

              return (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <RadioGroupItem value={key} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-medium text-sm">{config.title}</span>
                      {config.badge && (
                        <Badge variant={config.badgeVariant} className="text-[10px] h-5">
                          {config.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {config.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Fixed template selector */}
      {effectiveMode === 'fixed' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4" />
              Template Fixo
            </CardTitle>
            <CardDescription>
              Selecione o template que será sempre aplicado
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum template ativo disponível. Solicite ao administrador.
              </p>
            ) : (
              <Select
                value={effectiveFixedId || ''}
                onValueChange={(v) => setLocalFixedId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um template..." />
                </SelectTrigger>
                <SelectContent>
                  {activeTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <span>{t.name}</span>
                        {t.is_system_default && (
                          <Badge variant="secondary" className="text-[10px] h-4">Padrão</Badge>
                        )}
                        {t.source_group_id && (
                          <Badge variant="outline" className="text-[10px] h-4">Admin</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      )}

      {/* Controls (only for auto/fixed modes) */}
      {effectiveMode !== 'clean' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Controles</CardTitle>
            <CardDescription>
              Ajuste fino do comportamento visual
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Intensity slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Intensidade do Overlay</Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {effectiveIntensity}/10
                </span>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[effectiveIntensity]}
                onValueChange={([v]) => setLocalIntensity(v)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Quanto maior, mais visível o gradiente e overlay na interface.
              </p>
            </div>

            {/* Toggles */}
            {effectiveMode === 'auto' && (
              <>
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <CalendarHeart className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label className="text-sm">Temas Sazonais</Label>
                      <p className="text-xs text-muted-foreground">
                        Ex: Natal, Carnaval, Black Friday
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={effectiveSeasonal}
                    onCheckedChange={(v) => setLocalSeasonal(v)}
                  />
                </div>

                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label className="text-sm">Visual por Categoria</Label>
                      <p className="text-xs text-muted-foreground">
                        Tema automático baseado na categoria principal
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={effectiveCategory}
                    onCheckedChange={(v) => setLocalCategory(v)}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Clean mode info */}
      {effectiveMode === 'clean' && (
        <Card className="border-muted">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Modo Limpo ativado</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  A interface usará apenas o tema base do sistema e a cor da sua empresa.
                  Nenhum overlay visual, gradiente temático ou decoração sazonal será aplicado.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save bar */}
      {hasChanges && (
        <div className="sticky bottom-4 bg-card border border-border rounded-lg p-3 shadow-lg flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Alterações não salvas
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleDiscard}>
              Descartar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
