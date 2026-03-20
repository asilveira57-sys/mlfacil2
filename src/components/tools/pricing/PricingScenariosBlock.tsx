import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Save, Copy, Trash2, Eye, ListChecks, LogIn, 
  ArrowUpDown, ChevronDown, ChevronUp 
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import type { SavedSimulation } from "@/hooks/usePricingSimulations";
import type { SimulationInput, SimulationResult } from "@/lib/pricing-engine";
import { compareSimulations, calculateSimulation } from "@/lib/pricing-engine";

interface Props {
  simulations: SavedSimulation[];
  isLoading: boolean;
  isAuthenticated: boolean;
  isSaving: boolean;
  currentInput: SimulationInput;
  currentResult: SimulationResult;
  onSave: () => void;
  onLoad: (sim: SavedSimulation) => void;
  onDuplicate: (sim: SavedSimulation) => void;
  onDelete: (id: string) => void;
  onCompare: (sim: SavedSimulation) => void;
}

export function PricingScenariosBlock({
  simulations, isLoading, isAuthenticated, isSaving,
  currentInput, currentResult,
  onSave, onLoad, onDuplicate, onDelete, onCompare,
}: Props) {
  const { t } = useTranslation('tools');
  const [isOpen, setIsOpen] = useState(true);
  const [compareTarget, setCompareTarget] = useState<SavedSimulation | null>(null);

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtDiff = (v: number) => {
    const sign = v > 0 ? '+' : '';
    return `${sign}${fmt(v)}`;
  };

  const handleCompare = (sim: SavedSimulation) => {
    setCompareTarget(prev => prev?.id === sim.id ? null : sim);
    onCompare(sim);
  };

  // Calculate comparison if target selected
  const comparison = compareTarget?.inputs ? (() => {
    const targetResult = calculateSimulation(compareTarget.inputs);
    return compareSimulations(currentResult, targetResult);
  })() : null;

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="w-4 h-4 text-primary" />
                {t('pricing.block_scenarios', 'Cenários salvos')}
                {simulations.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{simulations.length}</Badge>
                )}
              </CardTitle>
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {!isAuthenticated ? (
              <div className="text-center py-6 space-y-3">
                <LogIn className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('pricing.login_to_save', 'Faça login para salvar e comparar simulações')}
                </p>
                <Button variant="outline" size="sm" onClick={() => window.location.href = '/auth'}>
                  {t('pricing.login', 'Entrar')}
                </Button>
              </div>
            ) : (
              <>
                {/* Save current */}
                <Button 
                  onClick={onSave} 
                  disabled={isSaving || currentInput.salePrice <= 0}
                  className="w-full gap-2"
                  size="sm"
                >
                  <Save className="w-4 h-4" />
                  {isSaving 
                    ? t('pricing.saving', 'Salvando...') 
                    : t('pricing.save_simulation', 'Salvar simulação atual')
                  }
                </Button>

                {/* Comparison view */}
                {comparison && compareTarget && (
                  <div className="p-3 bg-accent/50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">
                        {t('pricing.comparing_with', 'Comparando com')}: {compareTarget.title}
                      </p>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setCompareTarget(null)}>
                        ✕
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { label: t('pricing.result_freight', 'Frete'), diff: comparison.freightDiff, pct: comparison.freightDiffPercent },
                        { label: t('pricing.result_commission', 'Comissão'), diff: comparison.commissionDiff, pct: comparison.commissionDiffPercent },
                        { label: t('pricing.result_profit'), diff: comparison.profitDiff, pct: comparison.profitDiffPercent },
                        { label: t('pricing.result_margin'), diff: comparison.marginDiff, pct: null, isMgn: true },
                        { label: t('pricing.result_net_received', 'Valor líquido'), diff: comparison.netReceivedDiff, pct: comparison.netReceivedDiffPercent },
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between p-1.5 rounded bg-background">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className={item.diff > 0 ? 'text-emerald-600 font-medium' : item.diff < 0 ? 'text-red-600 font-medium' : ''}>
                            {item.isMgn ? `${item.diff > 0 ? '+' : ''}${item.diff.toFixed(1)}pp` : fmtDiff(item.diff)}
                            {item.pct != null && ` (${item.pct > 0 ? '+' : ''}${item.pct.toFixed(1)}%)`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Saved list */}
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : simulations.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    {t('pricing.no_simulations', 'Nenhuma simulação salva ainda')}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {simulations.map(sim => (
                      <div key={sim.id} className="p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{sim.title || 'Sem nome'}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {sim.sale_price ? fmt(sim.sale_price) : '—'}
                              </span>
                              {sim.results && (
                                <Badge variant={sim.results.marginPercent >= 0 ? 'default' : 'destructive'} className="text-xs h-5">
                                  {sim.results.marginPercent.toFixed(1)}%
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(sim.updated_at).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onLoad(sim)} title={t('pricing.load', 'Abrir')}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCompare(sim)} title={t('pricing.compare', 'Comparar')}>
                              <ArrowUpDown className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(sim)} title={t('pricing.duplicate', 'Duplicar')}>
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(sim.id)} title={t('pricing.delete', 'Excluir')}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
