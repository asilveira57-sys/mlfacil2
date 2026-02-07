import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, Palette, LayoutTemplate, ListChecks, ArrowRight } from 'lucide-react';
import { useThemeResolver } from '@/hooks/useThemeResolver';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';

interface TemplatesOverviewProps {
  onNavigate: (tab: string) => void;
}

const SCOPE_LABELS: Record<string, string> = {
  global_default: 'Default Global',
  company_override: 'Override Empresa',
  category: 'Categoria',
  subcategory: 'Subcategoria',
  seasonal: 'Sazonal',
};

export function TemplatesOverview({ onNavigate }: TemplatesOverviewProps) {
  const { data: workspaceId } = useCurrentWorkspaceId();
  const { activeAccountId } = useActiveAccount();

  const { resolved, isLoading, templates, rules } = useThemeResolver({
    workspace_id: workspaceId,
    company_id: activeAccountId,
    current_date: new Date(),
    user_theme_preference: 'light',
  });

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

  return (
    <div className="space-y-6">
      {/* Current template card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Template em Uso
              </CardTitle>
              <CardDescription className="mt-1">
                Template atualmente aplicado no sistema
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
              {/* Template info */}
              <div className="flex items-center gap-4">
                {/* Mini preview */}
                <div className="w-24 h-16 rounded-lg border overflow-hidden flex-shrink-0 relative">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: resolved.resolved_tokens.background
                        ? `hsl(${resolved.resolved_tokens.background})`
                        : undefined,
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-6"
                      style={{
                        background: resolved.resolved_tokens.sidebar_background
                          ? `hsl(${resolved.resolved_tokens.sidebar_background})`
                          : 'hsl(var(--sidebar-background))',
                      }}
                    />
                    <div
                      className="absolute top-2 left-8 right-2 h-2 rounded-sm"
                      style={{
                        background: resolved.resolved_tokens.primary
                          ? `hsl(${resolved.resolved_tokens.primary})`
                          : 'hsl(var(--primary))',
                      }}
                    />
                    <div
                      className="absolute top-6 left-8 right-6 h-1.5 rounded-sm opacity-60"
                      style={{
                        background: resolved.resolved_tokens.muted
                          ? `hsl(${resolved.resolved_tokens.muted})`
                          : 'hsl(var(--muted))',
                      }}
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg">{resolved.template.name}</h3>
                  {resolved.template.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {resolved.template.description}
                    </p>
                  )}
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
                    🎉 Overlay sazonal ativo
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
