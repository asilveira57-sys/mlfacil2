import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Sun, Moon, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabaseHelpers';
import { TemplateMiniPreview, TemplateColorPreview } from './TemplateColorPreview';
import { VisualIdentityControls, CombinedPreview } from './VisualIdentityPreview';
import type { Template, TemplateVariant, TemplateRule, ThemeResolverInput, DesignTokens } from '@/types/templates';

// Inline resolver
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

  // Merge seasonal tokens
  let resolvedTokens = baseVar ? { ...(baseVar.design_tokens as DesignTokens) } : {};
  if (seasonalRule) {
    const seasonalVar = variants.find(v => v.template_id === seasonalRule!.template_id && v.variant_key === user_theme_preference)
      || variants.find(v => v.template_id === seasonalRule!.template_id && v.variant_key === 'light');
    if (seasonalVar) {
      const overlay = seasonalVar.design_tokens as DesignTokens;
      for (const [key, value] of Object.entries(overlay)) {
        if (value !== undefined && value !== null && value !== '') {
          (resolvedTokens as any)[key] = value;
        }
      }
    }
  }

  return {
    template: baseTpl,
    variant: baseVar,
    resolved_tokens: resolvedTokens as DesignTokens,
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
  const [visualGroupSlug, setVisualGroupSlug] = useState('none');
  const [visualIntensity, setVisualIntensity] = useState(5);

  const { data, isLoading } = useQuery({
    queryKey: ['theme-resolver', 'simulator-data'],
    queryFn: async () => {
      const [templates, variants, rules, groupsRes] = await Promise.all([
        fetchAllRows<Template>(supabase.from('templates').select('*')),
        fetchAllRows<TemplateVariant>(supabase.from('template_variants').select('*')),
        fetchAllRows<TemplateRule>(supabase.from('template_rules').select('*')),
        supabase.from('visual_category_groups').select('slug,nome,gradiente_inicio,gradiente_fim,imagem_overlay_url,intensidade_padrao').eq('ativo', true).order('prioridade'),
      ]);
      return {
        templates,
        variants,
        rules,
        visualGroups: (groupsRes.data ?? []) as Array<{
          slug: string; nome: string; gradiente_inicio: string; gradiente_fim: string;
          imagem_overlay_url: string | null; intensidade_padrao: number;
        }>,
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

  const selectedGroup = useMemo(() => {
    if (!data || visualGroupSlug === 'none') return null;
    return data.visualGroups.find(g => g.slug === visualGroupSlug) ?? null;
  }, [data, visualGroupSlug]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Simulador de Aparência
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
                <Sun className="h-4 w-4 text-accent-foreground" />
                <Switch checked={isDark} onCheckedChange={setIsDark} />
                <Moon className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground ml-1">
                  {isDark ? 'Escuro' : 'Claro'}
                </span>
              </div>
            </div>
            {data && (
              <VisualIdentityControls
                groups={data.visualGroups}
                selectedSlug={visualGroupSlug}
                onSelectSlug={(slug) => {
                  setVisualGroupSlug(slug);
                  const g = data.visualGroups.find(gr => gr.slug === slug);
                  if (g) setVisualIntensity(g.intensidade_padrao);
                }}
                intensity={visualIntensity}
                onIntensityChange={setVisualIntensity}
              />
            )}
          </div>

          {/* Result */}
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : result ? (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-start gap-4">
                {/* Real preview with resolved tokens */}
                <TemplateMiniPreview
                  tokens={result.resolved_tokens}
                  className="w-40 h-28 flex-shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-primary flex-shrink-0" />
                    <h4 className="font-semibold">
                      {result.template?.name || 'Template não encontrado'}
                    </h4>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Origem: <strong>{result.source}</strong>
                  </p>

                  <TemplateColorPreview
                    tokens={result.resolved_tokens}
                    size="md"
                    className="mt-3 max-w-xs"
                  />
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

              {/* Detailed tokens preview */}
              {result.resolved_tokens && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Tokens resolvidos:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(result.resolved_tokens)
                      .filter(([, v]) => typeof v === 'string' && v.includes('%'))
                      .slice(0, 12)
                      .map(([key, value]) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <div
                            className="w-4 h-4 rounded-sm border flex-shrink-0"
                            style={{ background: `hsl(${value})` }}
                          />
                          <span className="text-[10px] text-muted-foreground truncate">
                            {key.replace(/_/g, ' ')}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Combined visual preview */}
              {result.resolved_tokens && (
                <CombinedPreview
                  resolvedTokens={result.resolved_tokens}
                  group={selectedGroup}
                  intensity={visualIntensity}
                />
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
