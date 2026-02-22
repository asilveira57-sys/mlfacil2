import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ListChecks, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useTemplateRules, useRuleMutations, useTemplatesList } from '@/hooks/useTemplates';
import { SEASONAL_PRESETS, type RuleType } from '@/types/templates';

const RULE_LABELS: Record<RuleType, string> = {
  global_default: 'Default Global',
  company_override: 'Override Empresa',
  category: 'Categoria',
  subcategory: 'Subcategoria',
  seasonal: 'Sazonal',
};

export function TemplateRulesPanel() {
  const { data: rules, isLoading: rulesLoading } = useTemplateRules();
  const { data: templates, isLoading: tplLoading } = useTemplatesList();
  const { upsertRule, deleteRule } = useRuleMutations();

  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formType, setFormType] = useState<RuleType>('global_default');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [formPriority, setFormPriority] = useState('100');
  const [formCategoryKey, setFormCategoryKey] = useState('');
  const [formSubcategoryKey, setFormSubcategoryKey] = useState('');
  const [formSeasonalKey, setFormSeasonalKey] = useState('');
  const [formCompanyId, setFormCompanyId] = useState('');

  // Conflict detection
  const conflicts = useMemo(() => {
    if (!rules) return [];
    const seen = new Map<string, string[]>();
    for (const rule of rules) {
      const key = `${rule.rule_type}:${rule.category_key || ''}:${rule.subcategory_key || ''}:${rule.seasonal_key || ''}:${rule.company_id || ''}`;
      const list = seen.get(key) || [];
      list.push(rule.id);
      seen.set(key, list);
    }
    return Array.from(seen.entries())
      .filter(([, ids]) => ids.length > 1)
      .map(([key]) => key);
  }, [rules]);

  const resetForm = () => {
    setFormType('global_default');
    setFormTemplateId('');
    setFormPriority('100');
    setFormCategoryKey('');
    setFormSubcategoryKey('');
    setFormSeasonalKey('');
    setFormCompanyId('');
    setShowForm(false);
  };

  const handleSubmit = () => {
    if (!formTemplateId) return;

    const seasonal = formSeasonalKey ? SEASONAL_PRESETS[formSeasonalKey] : null;

    upsertRule.mutate({
      template_id: formTemplateId,
      rule_type: formType,
      priority: parseInt(formPriority) || 100,
      category_key: formType === 'category' ? formCategoryKey || null : null,
      subcategory_key: formType === 'subcategory' ? formSubcategoryKey || null : null,
      seasonal_key: formType === 'seasonal' ? formSeasonalKey || null : null,
      company_id: formType === 'company_override' ? formCompanyId || null : null,
      start_month: seasonal?.start_month ?? null,
      start_day: seasonal?.start_day ?? null,
      end_month: seasonal?.end_month ?? null,
      end_day: seasonal?.end_day ?? null,
      match_categories: [],
      source_group_id: null,
      is_enabled: true,
    }, {
      onSuccess: () => resetForm(),
    });
  };

  const isLoading = rulesLoading || tplLoading;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-primary" />
                Regras de Aplicação
              </CardTitle>
              <CardDescription className="mt-1">
                Defina quando e onde cada template deve ser aplicado. Menor prioridade = mais forte.
              </CardDescription>
            </div>
            <Button onClick={() => setShowForm(true)} className="gap-2" disabled={showForm}>
              <Plus className="h-4 w-4" />
              Nova Regra
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Conflicts warning */}
          {conflicts.length > 0 && (
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-warning">
                  {conflicts.length} conflito(s) detectado(s)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Duas ou mais regras competem pelo mesmo escopo. Ajuste as prioridades.
                </p>
              </div>
            </div>
          )}

          {/* Add rule form */}
          {showForm && (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
              <h4 className="font-medium text-sm">Nova Regra</h4>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Regra</Label>
                  <Select value={formType} onValueChange={(v) => setFormType(v as RuleType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RULE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Template</Label>
                  <Select value={formTemplateId} onValueChange={setFormTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(templates || []).filter(t => t.is_active).map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Prioridade (menor = mais forte)</Label>
                  <Input
                    type="number"
                    value={formPriority}
                    onChange={e => setFormPriority(e.target.value)}
                    min={1}
                    max={9999}
                  />
                </div>

                {formType === 'category' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Chave da Categoria</Label>
                    <Input
                      value={formCategoryKey}
                      onChange={e => setFormCategoryKey(e.target.value)}
                      placeholder="embalagem"
                    />
                  </div>
                )}

                {formType === 'subcategory' && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Chave da Categoria</Label>
                      <Input
                        value={formCategoryKey}
                        onChange={e => setFormCategoryKey(e.target.value)}
                        placeholder="embalagem"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Chave da Subcategoria</Label>
                      <Input
                        value={formSubcategoryKey}
                        onChange={e => setFormSubcategoryKey(e.target.value)}
                        placeholder="fita_gomada"
                      />
                    </div>
                  </>
                )}

                {formType === 'seasonal' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Evento Sazonal</Label>
                    <Select value={formSeasonalKey} onValueChange={setFormSeasonalKey}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {Object.values(SEASONAL_PRESETS).map(s => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.emoji} {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formType === 'company_override' && (
                  <div className="space-y-2">
                    <Label className="text-xs">ID da Empresa (ML Account)</Label>
                    <Input
                      value={formCompanyId}
                      onChange={e => setFormCompanyId(e.target.value)}
                      placeholder="UUID da conta"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!formTemplateId || upsertRule.isPending}
                >
                  Salvar Regra
                </Button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : !rules?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma regra criada.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => {
                const isAdminManaged = !!(rule as any).source_group_id;
                return (
                  <div
                    key={rule.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg bg-card ${isAdminManaged ? 'border-primary/20 bg-primary/5' : ''}`}
                  >
                    <div className="bg-primary/10 rounded-md px-2 py-1 text-xs font-mono font-bold text-primary min-w-[40px] text-center">
                      {rule.priority}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">
                          {RULE_LABELS[rule.rule_type as RuleType] || rule.rule_type}
                        </Badge>
                        {isAdminManaged && (
                          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                            🔗 Admin
                          </Badge>
                        )}
                        {rule.category_key && (
                          <Badge variant="outline" className="text-[10px]">cat: {rule.category_key}</Badge>
                        )}
                        {(rule as any).match_categories?.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            MLB: {(rule as any).match_categories.slice(0, 3).join(', ')}{(rule as any).match_categories.length > 3 ? '...' : ''}
                          </Badge>
                        )}
                        {rule.subcategory_key && (
                          <Badge variant="outline" className="text-[10px]">sub: {rule.subcategory_key}</Badge>
                        )}
                        {rule.seasonal_key && (
                          <Badge variant="outline" className="text-[10px]">
                            {SEASONAL_PRESETS[rule.seasonal_key]?.emoji} {rule.seasonal_key}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        Template: {(rule as any).template?.name || rule.template_id}
                      </p>
                    </div>
                    {isAdminManaged ? (
                      <Badge variant="secondary" className="text-[10px] shrink-0">Somente leitura</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive/70 hover:text-destructive"
                        onClick={() => setDeleteId(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover regra?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteRule.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
