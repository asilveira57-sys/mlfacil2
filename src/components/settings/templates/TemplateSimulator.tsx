import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Sun, Moon, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Template, TemplateVariant, TemplateRule, ThemeResolverInput } from '@/types/templates';

// Inline resolver to avoid circular deps
function resolveForSimulator(
  input: ThemeResolverInput,
  templates: Template[],
  variants: TemplateVariant[],
  rules: TemplateRule[]
) {
  const { company_id, category_key, subcategory_key, current_date = new Date(), user_theme_preference = 'light' } = input;
  const activeTemplates = templates.filter(t => t.is_active);
  const enabledRules = [...rules.filter(r => r.is_enabled)].sort((a, b) => a.priority - b.priority);

  let baseRule: TemplateRule | null = null;
  let seasonalRule: TemplateRule | null = null;
  const chain: string[] = [];

  function isDateInRange(date: Date, sm: number | null, sd: number | null, em: number | null, ed: number | null) {
    if (!sm || !sd || !em || !ed) return false;
    const m = date.getMonth() + 1, d = date.getDate();
    if (sm > em || (sm === em && sd > ed)) {
      return (m > sm || (m === sm && d >= sd)) || (m < em || (m === em && d <= ed));
    }
    return (m > sm || (m === sm && d >= sd)) && (m < em || (m === em && d <= ed));
  }

  for (const rule of enabledRules) {
    const tpl = activeTemplates.find(t => t.id === rule.template_id);
    if (!tpl) continue;

    if (rule.rule_type === 'company_override' && company_id && rule.company_id === company_id && !baseRule) {
      baseRule = rule; chain.push(`Override empresa (p${rule.priority})`);
    } else if (rule.rule_type === 'global_default' && !baseRule) {
      baseRule = rule; chain.push(`Default global (p${rule.priority})`);
    } else if (rule.rule_type === 'subcategory' && subcategory_key && rule.subcategory_key === subcategory_key && !baseRule) {
      baseRule = rule; chain.push(`Subcategoria: ${subcategory_key} (p${rule.priority})`);
    } else if (rule.rule_type === 'category' && category_key && rule.category_key === category_key && !baseRule) {
      baseRule = rule; chain.push(`Categoria: ${category_key} (p${rule.priority})`);
    } else if (rule.rule_type === 'seasonal' && !seasonalRule && isDateInRange(current_date, rule.start_month, rule.start_day, rule.end_month, rule.end_day)) {
      seasonalRule = rule; chain.push(`Sazonal: ${rule.seasonal_key}`);
    }
  }

  if (!baseRule) {
    const sys = activeTemplates.find(t => t.is_system_default);
    if (sys) {
      chain.push('Template padrão do sistema (fallback)');
      baseRule = { id: 'sys', template_id: sys.id, rule_type: 'global_default', priority: 9999 } as TemplateRule;
    }
  }

  if (!baseRule) return null;

  const baseTpl = activeTemplates.find(t => t.id === baseRule!.template_id);
  const baseVar = variants.find(v => v.template_id === baseRule!.template_id && v.variant_key === user_theme_preference)
    || variants.find(v => v.template_id === baseRule!.template_id && v.variant_key === 'light');

  return {
    template: baseTpl,
    variant: baseVar,
    has_seasonal: !!seasonalRule,
    seasonal_key: seasonalRule?.seasonal_key,
    chain,
    source: chain[0] || 'Não resolvido',
  };
}

export function TemplateSimulator() {
  const [companyId, setCompanyId] = useState('');
  const [categoryKey, setCategoryKey] = useState('');
  const [subcategoryKey, setSubcategoryKey] = useState('');
  const [simDate, setSimDate] = useState(new Date().toISOString().split('T')[0]);
  const [isDark, setIsDark] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['theme-resolver', 'simulator-data'],
    queryFn: async () => {
      const [t, v, r] = await Promise.all([
        supabase.from('templates').select('*'),
        supabase.from('template_variants').select('*'),
        supabase.from('template_rules').select('*'),
      ]);
      return {
        templates: (t.data || []) as Template[],
        variants: (v.data || []) as TemplateVariant[],
        rules: (r.data || []) as TemplateRule[],
      };
    },
    staleTime: 60_000,
  });

  const result = useMemo(() => {
    if (!data) return null;
    return resolveForSimulator(
      {
        company_id: companyId || null,
        category_key: categoryKey || null,
        subcategory_key: subcategoryKey || null,
        current_date: new Date(simDate),
        user_theme_preference: isDark ? 'dark' : 'light',
      },
      data.templates,
      data.variants,
      data.rules
    );
  }, [data, companyId, categoryKey, subcategoryKey, simDate, isDark]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Simulador de Template
          </CardTitle>
          <CardDescription>
            Teste como o tema é resolvido para diferentes cenários
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Input controls */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-xs">ID da Empresa (opcional)</Label>
              <Input
                value={companyId}
                onChange={e => setCompanyId(e.target.value)}
                placeholder="UUID da conta ML"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Categoria (opcional)</Label>
              <Input
                value={categoryKey}
                onChange={e => setCategoryKey(e.target.value)}
                placeholder="embalagem"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Subcategoria (opcional)</Label>
              <Input
                value={subcategoryKey}
                onChange={e => setSubcategoryKey(e.target.value)}
                placeholder="fita_gomada"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Data Simulada</Label>
              <Input
                type="date"
                value={simDate}
                onChange={e => setSimDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Modo</Label>
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-warning" />
                <Switch checked={isDark} onCheckedChange={setIsDark} />
                <Moon className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground ml-1">
                  {isDark ? 'Escuro' : 'Claro'}
                </span>
              </div>
            </div>
          </div>

          {/* Result */}
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : result ? (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold">
                    {result.template?.name || 'Template não encontrado'}
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Origem: <strong>{result.source}</strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {result.chain.map((step, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {i + 1}. {step}
                  </Badge>
                ))}
              </div>

              {result.has_seasonal && (
                <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 text-xs">
                  🎉 Overlay sazonal <strong>{result.seasonal_key}</strong> aplicado
                </div>
              )}

              {/* Mock preview */}
              {result.variant && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Preview (mock):</p>
                  <div className="grid grid-cols-3 gap-2 h-32">
                    {/* Dashboard mock */}
                    <div
                      className="rounded-lg border overflow-hidden relative"
                      style={{
                        background: result.variant.design_tokens?.background
                          ? `hsl(${(result.variant.design_tokens as any).background})`
                          : undefined,
                      }}
                    >
                      <div
                        className="absolute left-0 top-0 bottom-0 w-8"
                        style={{
                          background: result.variant.design_tokens?.sidebar_background
                            ? `hsl(${(result.variant.design_tokens as any).sidebar_background})`
                            : 'hsl(var(--sidebar-background))',
                        }}
                      />
                      <div className="absolute top-2 left-10 right-2 space-y-1.5">
                        <div className="h-2 rounded-sm bg-primary/20 w-3/4" />
                        <div className="grid grid-cols-2 gap-1">
                          <div className="h-6 rounded-sm bg-card border" />
                          <div className="h-6 rounded-sm bg-card border" />
                        </div>
                      </div>
                      <p className="absolute bottom-1 left-10 text-[8px] text-muted-foreground">Dashboard</p>
                    </div>
                    {/* Perguntas mock */}
                    <div className="rounded-lg border bg-background p-2 relative">
                      <div className="space-y-1">
                        <div className="h-2 rounded-sm bg-primary/30 w-1/2" />
                        <div className="h-4 rounded-sm border bg-card" />
                        <div className="h-4 rounded-sm border bg-card" />
                        <div className="h-4 rounded-sm border bg-card" />
                      </div>
                      <p className="absolute bottom-1 left-2 text-[8px] text-muted-foreground">Perguntas</p>
                    </div>
                    {/* Impressão mock */}
                    <div className="rounded-lg border bg-background p-2 relative">
                      <div className="flex items-center gap-1 mb-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-success" />
                        <div className="h-1.5 rounded-sm bg-muted flex-1" />
                      </div>
                      <div className="border rounded-sm h-14 bg-card flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-dashed border-muted-foreground/20 rounded" />
                      </div>
                      <p className="absolute bottom-1 left-2 text-[8px] text-muted-foreground">ZPL</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Nenhum template resolve para estes parâmetros.</p>
              <p className="text-xs mt-1">Crie regras e templates para ver resultados aqui.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
