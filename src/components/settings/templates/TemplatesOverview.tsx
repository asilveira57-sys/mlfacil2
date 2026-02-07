import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, Palette, LayoutTemplate, ListChecks, ArrowRight, CheckCircle2, Zap } from 'lucide-react';
import { useThemeResolver } from '@/hooks/useThemeResolver';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useTemplateVariants } from '@/hooks/useTemplates';
import { TemplateMiniPreview, TemplateColorPreview } from './TemplateColorPreview';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DesignTokens, Template } from '@/types/templates';

interface TemplatesOverviewProps {
  onNavigate: (tab: string) => void;
}

export function TemplatesOverview({ onNavigate }: TemplatesOverviewProps) {
  const { data: workspaceId } = useCurrentWorkspaceId();
  const { activeAccountId } = useActiveAccount();
  const qc = useQueryClient();

  const { resolved, isLoading, templates, rules } = useThemeResolver({
    workspace_id: workspaceId,
    company_id: activeAccountId,
    current_date: new Date(),
    user_theme_preference: 'light',
  });

  const handleQuickSwitch = async (template: Template) => {
    try {
      // Deactivate current system default and activate selected one
      const { error } = await supabase
        .from('templates')
        .update({ is_active: true } as any)
        .eq('id', template.id);
      if (error) throw error;

      // Log audit
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('template_audit_log').insert({
        actor_user_id: user?.id,
        action: 'quick_switch',
        template_id: template.id,
        payload: { switched_from: resolved?.template?.id },
      } as any);

      qc.invalidateQueries({ queryKey: ['templates'] });
      qc.invalidateQueries({ queryKey: ['theme-resolver'] });
      toast.success(`Template "${template.name}" ativado`);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  const inactiveTemplates = templates.filter(t => !t.is_active);

  return (
    <div className="space-y-6">
      {/* Current template card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Aparência Atual
              </CardTitle>
              <CardDescription className="mt-1">
                Template visual ativo no sistema
              </CardDescription>
            </div>
            {resolved && (
              <Badge variant="outline" className="text-xs">
                {resolved.resolution_source}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {resolved ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {/* Live mini preview */}
                <TemplateMiniPreview
                  tokens={resolved.resolved_tokens}
                  className="w-32 h-20 flex-shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{resolved.template.name}</h3>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  {resolved.template.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {resolved.template.description}
                    </p>
                  )}
                  <TemplateColorPreview
                    tokens={resolved.resolved_tokens}
                    size="sm"
                    className="mt-3 max-w-xs"
                  />
                </div>
              </div>

              {/* Resolution chain */}
              {resolved.resolution_chain.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Cadeia de resolução:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {resolved.resolution_chain.map((step, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {step}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Seasonal overlay info */}
              {resolved.seasonal_overlay && (
                <div className="bg-accent/10 border border-accent/20 rounded-lg p-3">
                  <p className="text-xs font-medium text-accent-foreground">
                    🎉 Overlay sazonal ativo — aplicação automática por data
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <LayoutTemplate className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum template configurado.</p>
              <p className="text-xs mt-1">Crie o primeiro template ou ative o padrão do sistema.</p>
              <Button variant="outline" className="mt-4" onClick={() => onNavigate('templates')}>
                Configurar Templates
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick switch — available templates */}
      {inactiveTemplates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              Troca Rápida
            </CardTitle>
            <CardDescription>
              Ative outro template com um clique
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inactiveTemplates.slice(0, 6).map(template => (
                <QuickSwitchCard
                  key={template.id}
                  template={template}
                  onActivate={() => handleQuickSwitch(template)}
                />
              ))}
            </div>
            {inactiveTemplates.length > 6 && (
              <Button variant="link" className="mt-3 text-xs" onClick={() => onNavigate('templates')}>
                Ver todos os templates →
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate('templates')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{templates.length}</p>
                <p className="text-sm text-muted-foreground">Templates</p>
              </div>
              <LayoutTemplate className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate('rules')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{rules.length}</p>
                <p className="text-sm text-muted-foreground">Regras Ativas</p>
              </div>
              <ListChecks className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate('simulator')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Simulador</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Teste combinações de empresa, categoria e data
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Quick switch card for inactive templates */
function QuickSwitchCard({ template, onActivate }: { template: Template; onActivate: () => void }) {
  return (
    <div className="border rounded-lg p-3 bg-card hover:border-primary/40 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium truncate">{template.name}</h4>
          {template.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {template.description}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onActivate}
        >
          Ativar
        </Button>
      </div>
    </div>
  );
}
