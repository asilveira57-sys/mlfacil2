import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Search, CheckSquare, Square, Package, Blocks, ArrowLeft, Globe } from 'lucide-react';
import {
  useAllSystemModules,
  usePlanModulesByPlan,
  usePlanModuleCounts,
  useSavePlanModules,
  groupModulesByCategory,
  getCategoryLabel,
} from '@/hooks/usePlanModules';
import { useBillingAdminTiers } from '@/hooks/useBillingAdminTiers';

interface PlanModulesTabProps {}

export function PlanModulesTab({}: PlanModulesTabProps) {
  const { tiers } = useBillingAdminTiers();
  const { data: allModules = [], isLoading: loadingModules } = useAllSystemModules();
  const { data: moduleCounts = {} } = usePlanModuleCounts();

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [checkedModules, setCheckedModules] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const { data: planModules = [], isLoading: loadingPlanModules } = usePlanModulesByPlan(selectedPlanId);
  const saveMutation = useSavePlanModules();

  // Sync checked state when plan modules load
  useEffect(() => {
    if (planModules.length > 0 || selectedPlanId) {
      const ids = new Set(planModules.filter(pm => pm.is_enabled).map(pm => pm.module_id));
      setCheckedModules(ids);
      setDirty(false);
    }
  }, [planModules, selectedPlanId]);

  const grouped = useMemo(() => groupModulesByCategory(allModules), [allModules]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    const result: Record<string, typeof allModules> = {};
    for (const [cat, mods] of Object.entries(grouped)) {
      const filtered = mods.filter(m =>
        m.name.toLowerCase().includes(q) || m.key.toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q)
      );
      if (filtered.length > 0) result[cat] = filtered;
    }
    return result;
  }, [grouped, search]);

  const toggleModule = (moduleId: string) => {
    setCheckedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
    setDirty(true);
  };

  const selectAll = () => {
    setCheckedModules(new Set(allModules.map(m => m.id)));
    setDirty(true);
  };

  const clearAll = () => {
    setCheckedModules(new Set());
    setDirty(true);
  };

  const handleSave = () => {
    if (!selectedPlanId) return;
    saveMutation.mutate({ planId: selectedPlanId, moduleIds: Array.from(checkedModules) });
    setDirty(false);
  };

  const selectedTier = tiers.find(t => t.id === selectedPlanId);

  // ─── Plan selection list ───
  if (!selectedPlanId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Selecione um plano para gerenciar seus módulos.</p>
        <div className="grid gap-3">
          {tiers.map(tier => (
            <Card
              key={tier.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedPlanId(tier.id)}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">{tier.display_name || tier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tier.min_orders_30d}{tier.max_orders_30d ? `–${tier.max_orders_30d}` : '+'} pedidos/mês
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={tier.is_active ? 'default' : 'secondary'} className="text-[10px]">
                    {tier.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    <Blocks className="w-3 h-3 mr-1" />
                    {moduleCounts[tier.id] || 0} módulos
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ─── Module editor ───
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedPlanId(null); setDirty(false); }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h3 className="font-semibold text-foreground">{selectedTier?.display_name || selectedTier?.name}</h3>
            <p className="text-xs text-muted-foreground">
              {selectedTier?.min_orders_30d}{selectedTier?.max_orders_30d ? `–${selectedTier.max_orders_30d}` : '+'} pedidos/mês
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {checkedModules.size} / {allModules.length} módulos
          </Badge>
          <Button size="sm" variant="outline" onClick={selectAll}><CheckSquare className="w-3.5 h-3.5 mr-1.5" />Todos</Button>
          <Button size="sm" variant="outline" onClick={clearAll}><Square className="w-3.5 h-3.5 mr-1.5" />Limpar</Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar módulo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Modules grouped by category */}
      {(loadingModules || loadingPlanModules) ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea className="h-[500px]">
          <Accordion type="multiple" defaultValue={Object.keys(filteredGroups)} className="space-y-2">
            {Object.entries(filteredGroups).map(([cat, mods]) => (
              <AccordionItem key={cat} value={cat} className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{getCategoryLabel(cat)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {mods.filter(m => checkedModules.has(m.id)).length}/{mods.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-1 py-1">
                    {mods.map(mod => (
                      <label
                        key={mod.id}
                        className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={checkedModules.has(mod.id)}
                          onCheckedChange={() => toggleModule(mod.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{mod.name}</span>
                            {mod.requires_connection && (
                              <span title="Requer integração"><Globe className="w-3 h-3 text-muted-foreground" /></span>
                            )}
                            {mod.route && (
                              <code className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{mod.route}</code>
                            )}
                          </div>
                          {mod.description && (
                            <p className="text-xs text-muted-foreground truncate">{mod.description}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>
      )}

      {/* Summary */}
      {dirty && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-foreground">
                <strong>{checkedModules.size}</strong> módulos habilitados
                {' • '}
                <span className="text-muted-foreground">{allModules.length - checkedModules.size} bloqueados</span>
              </p>
              <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                <Save className="w-4 h-4 mr-1.5" /> Salvar alterações
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
