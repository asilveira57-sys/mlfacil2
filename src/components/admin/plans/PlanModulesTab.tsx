import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, Save, Search, CheckSquare, Square, Package, Blocks, ArrowLeft, Globe, Puzzle } from 'lucide-react';
import {
  useAllSystemModules,
  usePlanModulesByPlan,
  usePlanModuleCounts,
  useSavePlanModules,
  groupModulesByCategory,
  getCategoryLabel,
} from '@/hooks/usePlanModules';
import { useBillingAdminTiers } from '@/hooks/useBillingAdminTiers';

export function PlanModulesTab() {
  const { tiers, addons } = useBillingAdminTiers();
  const { data: allModules = [], isLoading: loadingModules } = useAllSystemModules();
  const { data: moduleCounts = {} } = usePlanModuleCounts();

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [checkedModules, setCheckedModules] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const { data: planModules = [], isLoading: loadingPlanModules } = usePlanModulesByPlan(selectedPlanId);
  const saveMutation = useSavePlanModules();

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

  const selectAll = () => { setCheckedModules(new Set(allModules.map(m => m.id))); setDirty(true); };
  const clearAll = () => { setCheckedModules(new Set()); setDirty(true); };

  const handleSave = () => {
    if (!selectedPlanId) return;
    saveMutation.mutate({ planId: selectedPlanId, moduleIds: Array.from(checkedModules) });
    setDirty(false);
  };

  const selectedTier = tiers.find(t => t.id === selectedPlanId);
  const selectedAddon = addons.find(a => a.id === selectedPlanId);
  const selectedName = selectedTier
    ? (selectedTier.display_name || selectedTier.name)
    : selectedAddon?.name;
  const selectedSubtitle = selectedTier
    ? `${selectedTier.min_orders_30d}${selectedTier.max_orders_30d ? `–${selectedTier.max_orders_30d}` : '+'} pedidos/mês`
    : selectedAddon?.description || 'Add-on';

  // ─── Plan selection list ───
  if (!selectedPlanId) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Selecione um plano ou add-on para gerenciar seus módulos.</p>

        {/* Tiers */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" /> Planos
          </h4>
          <div className="grid gap-3">
            {tiers.map(tier => (
              <Card key={tier.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedPlanId(tier.id)}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">{tier.display_name || tier.name}</p>
                      <p className="text-xs text-muted-foreground">{tier.min_orders_30d}{tier.max_orders_30d ? `–${tier.max_orders_30d}` : '+'} pedidos/mês</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={tier.is_active ? 'default' : 'secondary'} className="text-[10px]">{tier.is_active ? 'Ativo' : 'Inativo'}</Badge>
                    <Badge variant="outline" className="text-[10px]"><Blocks className="w-3 h-3 mr-1" />{moduleCounts[tier.id] || 0} módulos</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Add-ons */}
        {addons.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Puzzle className="w-3.5 h-3.5" /> Add-ons
            </h4>
            <div className="grid gap-3">
              {addons.map(addon => (
                <Card key={addon.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedPlanId(addon.id)}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <Puzzle className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-semibold text-foreground">{addon.name}</p>
                        <p className="text-xs text-muted-foreground">{addon.description || 'Add-on'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={addon.is_active ? 'default' : 'secondary'} className="text-[10px]">{addon.is_active ? 'Ativo' : 'Inativo'}</Badge>
                      <Badge variant="outline" className="text-[10px]"><Blocks className="w-3 h-3 mr-1" />{moduleCounts[addon.id] || 0} módulos</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Module editor ───
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedPlanId(null); setDirty(false); }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h3 className="font-semibold text-foreground">{selectedName}</h3>
            <p className="text-xs text-muted-foreground">{selectedSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{checkedModules.size} / {allModules.length} módulos</Badge>
          <Button size="sm" variant="outline" onClick={selectAll}><CheckSquare className="w-3.5 h-3.5 mr-1.5" />Todos</Button>
          <Button size="sm" variant="outline" onClick={clearAll}><Square className="w-3.5 h-3.5 mr-1.5" />Limpar</Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar módulo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {(loadingModules || loadingPlanModules) ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ScrollArea className="h-[500px]">
          <Accordion type="multiple" defaultValue={Object.keys(filteredGroups)} className="space-y-2">
            {Object.entries(filteredGroups).map(([cat, mods]) => (
              <AccordionItem key={cat} value={cat} className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{getCategoryLabel(cat)}</span>
                    <Badge variant="outline" className="text-[10px]">{mods.filter(m => checkedModules.has(m.id)).length}/{mods.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-1 py-1">
                    {mods.map(mod => (
                      <label key={mod.id} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/50 cursor-pointer">
                        <Checkbox checked={checkedModules.has(mod.id)} onCheckedChange={() => toggleModule(mod.id)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{mod.name}</span>
                            {mod.requires_connection && <span title="Requer integração"><Globe className="w-3 h-3 text-muted-foreground" /></span>}
                            {mod.route && <code className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{mod.route}</code>}
                          </div>
                          {mod.description && <p className="text-xs text-muted-foreground truncate">{mod.description}</p>}
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

      {dirty && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-foreground">
                <strong>{checkedModules.size}</strong> módulos habilitados{' • '}
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
