import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Palette, Wand2, Lock, Sparkles, Eye, EyeOff, Check, ChevronDown,
  CalendarHeart, FolderTree, Loader2, Settings2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSellerVisualPreferences, useSellerVisualPreferencesMutations, type SellerAppearanceMode } from '@/hooks/useSellerVisualPreferences';
import { useThemeResolver, applyDesignTokens } from '@/hooks/useThemeResolver';
import { useTemplatesList } from '@/hooks/useTemplates';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { TemplateMiniPreview, TemplateColorPreview } from './templates/TemplateColorPreview';
import type { DesignTokens, TemplateVariant, Template } from '@/types/templates';
import { toast } from 'sonner';

// Fetch all variants for active templates (single query)
function useAllVariants() {
  return useQuery({
    queryKey: ['templates', 'all-variants-light'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_variants')
        .select('*')
        .eq('variant_key', 'light');
      if (error) throw error;
      return data as TemplateVariant[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

const MODE_OPTIONS: { key: SellerAppearanceMode; icon: typeof Wand2; label: string }[] = [
  { key: 'auto', icon: Wand2, label: 'Automático' },
  { key: 'fixed', icon: Lock, label: 'Fixo' },
  { key: 'clean', icon: Sparkles, label: 'Limpo' },
];

export function SellerAppearancePanel() {
  const { mode, fixedTemplateId, allowSeasonal, allowCategory, preferredIntensity, isLoading } = useSellerVisualPreferences();
  const { upsert } = useSellerVisualPreferencesMutations();
  const { data: templates = [], isLoading: templatesLoading } = useTemplatesList();
  const { data: variants = [], isLoading: variantsLoading } = useAllVariants();
  const { data: workspaceId } = useCurrentWorkspaceId();
  const { activeAccountId } = useActiveAccount();

  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const { resolved } = useThemeResolver({
    workspace_id: workspaceId,
    company_id: activeAccountId,
    current_date: new Date(),
    user_theme_preference: 'light',
  });

  const activeTemplates = templates.filter(t => t.is_active);
  const variantMap = new Map(variants.map(v => [v.template_id, v]));

  // Apply preview tokens temporarily
  useEffect(() => {
    if (!previewingId) return;
    const variant = variantMap.get(previewingId);
    if (variant) {
      applyDesignTokens(variant.design_tokens as DesignTokens);
    }
    return () => {
      // Restore original tokens on cancel
      if (resolved?.resolved_tokens) {
        applyDesignTokens(resolved.resolved_tokens);
      }
    };
  }, [previewingId]);

  const handleApply = (templateId: string) => {
    upsert.mutate(
      { mode: 'fixed', fixed_template_id: templateId },
      { onSuccess: () => setPreviewingId(null) }
    );
  };

  const handleModeChange = (newMode: SellerAppearanceMode) => {
    upsert.mutate({ mode: newMode });
  };

  if (isLoading || templatesLoading || variantsLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-56" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Aparência
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Visualize e aplique templates visuais na sua interface.
        </p>
      </div>

      {/* Compact mode selector */}
      <div className="flex gap-2">
        {MODE_OPTIONS.map(({ key, icon: Icon, label }) => {
          const isActive = mode === key;
          return (
            <Button
              key={key}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleModeChange(key)}
              disabled={upsert.isPending}
              className="gap-1.5"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {key === 'auto' && (
                <Badge variant="secondary" className="text-[9px] h-4 ml-1">Recomendado</Badge>
              )}
            </Button>
          );
        })}
      </div>

      {/* Clean mode notice */}
      {mode === 'clean' && (
        <Card className="border-muted">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Modo Limpo ativado</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Nenhum overlay visual ou gradiente temático será aplicado. Apenas a cor base do sistema.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active theme indicator */}
      {resolved && mode !== 'clean' && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-primary" />
              <span className="text-sm">
                Visual ativo: <strong>{resolved.template.name}</strong>
              </span>
              <span className="text-xs text-muted-foreground">— {resolved.resolution_source}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template Gallery */}
      {mode !== 'clean' && (
        <div>
          <h3 className="text-sm font-medium mb-3">Templates Disponíveis</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTemplates.map(template => {
              const variant = variantMap.get(template.id);
              const tokens = variant?.design_tokens as DesignTokens | undefined;
              const overlayUrl = variant?.overlay_url;
              const isCurrentlyApplied = resolved?.template.id === template.id;
              const isPreviewing = previewingId === template.id;
              const isFixedSelected = mode === 'fixed' && fixedTemplateId === template.id;

              return (
                <TemplateCard
                  key={template.id}
                  template={template}
                  tokens={tokens}
                  overlayUrl={overlayUrl}
                  isActive={isCurrentlyApplied || isFixedSelected}
                  isPreviewing={isPreviewing}
                  onPreview={() => setPreviewingId(isPreviewing ? null : template.id)}
                  onApply={() => handleApply(template.id)}
                  isApplying={upsert.isPending}
                />
              );
            })}
          </div>
          {activeTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum template ativo disponível.
            </p>
          )}
        </div>
      )}

      {/* Advanced settings accordion */}
      {mode !== 'clean' && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <Settings2 className="h-4 w-4" />
              Ajustes Avançados
              <ChevronDown className="h-3 w-3" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2">
              <CardContent className="pt-5 space-y-6">
                {/* Intensity slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Intensidade do Overlay</Label>
                    <span className="text-sm font-mono text-muted-foreground">
                      {preferredIntensity}/10
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={10}
                    step={1}
                    value={[preferredIntensity]}
                    onValueChange={([v]) => upsert.mutate({ preferred_intensity: v })}
                    className="w-full"
                  />
                </div>

                {/* Toggles for auto mode */}
                {mode === 'auto' && (
                  <>
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <CalendarHeart className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-sm">Temas Sazonais</Label>
                          <p className="text-xs text-muted-foreground">Ex: Natal, Black Friday</p>
                        </div>
                      </div>
                      <Switch
                        checked={allowSeasonal}
                        onCheckedChange={(v) => upsert.mutate({ allow_seasonal: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <FolderTree className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label className="text-sm">Visual por Categoria</Label>
                          <p className="text-xs text-muted-foreground">Tema automático por categoria</p>
                        </div>
                      </div>
                      <Switch
                        checked={allowCategory}
                        onCheckedChange={(v) => upsert.mutate({ allow_category: v })}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// --- Template Card Component ---
interface TemplateCardProps {
  template: Template;
  tokens?: DesignTokens;
  overlayUrl?: string | null;
  isActive: boolean;
  isPreviewing: boolean;
  onPreview: () => void;
  onApply: () => void;
  isApplying: boolean;
}

function TemplateCard({
  template,
  tokens,
  overlayUrl,
  isActive,
  isPreviewing,
  onPreview,
  onApply,
  isApplying,
}: TemplateCardProps) {
  return (
    <Card
      className={`overflow-hidden transition-all ${
        isActive ? 'ring-2 ring-primary shadow-md' : ''
      } ${isPreviewing ? 'ring-2 ring-amber-500 shadow-lg' : ''}`}
    >
      {/* Visual preview area */}
      <div className="relative h-36 bg-muted/30 overflow-hidden">
        {tokens && (
          <TemplateMiniPreview tokens={tokens} className="absolute inset-0 w-full h-full rounded-none border-0" />
        )}
        {overlayUrl && (
          <img
            src={overlayUrl}
            alt={`Overlay de ${template.name}`}
            className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-1">
          {isActive && (
            <Badge className="text-[10px] h-5 bg-primary">
              <Check className="h-3 w-3 mr-0.5" /> Ativo
            </Badge>
          )}
          {isPreviewing && (
            <Badge variant="outline" className="text-[10px] h-5 bg-accent text-accent-foreground border-accent">
              <Eye className="h-3 w-3 mr-0.5" /> Preview
            </Badge>
          )}
          {template.is_system_default && (
            <Badge variant="secondary" className="text-[10px] h-5">Padrão</Badge>
          )}
        </div>
      </div>

      <CardContent className="pt-3 pb-3 space-y-2">
        <div>
          <p className="text-sm font-medium truncate">{template.name}</p>
          {template.description && (
            <p className="text-xs text-muted-foreground truncate">{template.description}</p>
          )}
        </div>

        {/* Color bar */}
        {tokens && (
          <TemplateColorPreview tokens={tokens} size="sm" />
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant={isPreviewing ? 'secondary' : 'outline'}
            size="sm"
            className="flex-1 text-xs h-8"
            onClick={onPreview}
          >
            {isPreviewing ? (
              <><EyeOff className="h-3 w-3 mr-1" /> Cancelar</>
            ) : (
              <><Eye className="h-3 w-3 mr-1" /> Visualizar</>
            )}
          </Button>
          <Button
            size="sm"
            className="flex-1 text-xs h-8"
            onClick={onApply}
            disabled={isApplying || isActive}
          >
            {isApplying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isActive ? (
              <><Check className="h-3 w-3 mr-1" /> Aplicado</>
            ) : (
              'Aplicar'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
