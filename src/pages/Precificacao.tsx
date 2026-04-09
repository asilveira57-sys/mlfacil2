import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Info, RotateCcw } from "lucide-react";
import {
  PricingProductBlock,
  PricingLogisticsBlock,
  PricingCostsBlock,
  PricingResultsBlock,
  PricingScenariosBlock,
  PricingVariationsBlock,
} from "@/components/tools/pricing";
import { calculateSimulation, DEFAULT_INPUT, type SimulationInput } from "@/lib/pricing-engine";
import { usePricingSimulations, type SavedSimulation } from "@/hooks/usePricingSimulations";

export default function Precificacao() {
  const { t } = useTranslation("tools");
  const [input, setInput] = useState<SimulationInput>({ ...DEFAULT_INPUT });
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    simulations, isLoading, isAuthenticated, isSaving,
    save, update, duplicate, delete: deleteSim,
  } = usePricingSimulations();

  const result = useMemo(() => calculateSimulation(input), [input]);

  const handleChange = useCallback((field: keyof SimulationInput, value: string | number) => {
    setInput(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setInput({ ...DEFAULT_INPUT });
    setEditingId(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (editingId) {
      await update({ id: editingId, input });
    } else {
      await save(input);
    }
  }, [input, editingId, save, update]);

  const handleLoad = useCallback((sim: SavedSimulation) => {
    if (sim.inputs) {
      setInput(sim.inputs);
      setEditingId(sim.id);
    }
  }, []);

  const handleDuplicate = useCallback(async (sim: SavedSimulation) => {
    await duplicate(sim);
  }, [duplicate]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSim(id);
    if (editingId === id) {
      setEditingId(null);
      setInput({ ...DEFAULT_INPUT });
    }
  }, [deleteSim, editingId]);

  const handleCompare = useCallback((_sim: SavedSimulation) => {}, []);

  return (
    <PageContainer title={t("pricing.title")} subtitle={t("pricing.subtitle")}>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        {/* Reset */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            {t("pricing.btn_reset")}
          </Button>
        </div>

        {/* Editing indicator */}
        {editingId && (
          <Alert className="bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              {t('pricing.editing_simulation', 'Editando simulação')}: <strong>{input.productName || 'Sem nome'}</strong>
              <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={handleReset}>
                {t('pricing.new_simulation', 'Nova simulação')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Main Content - 2 columns */}
        <div className="grid lg:grid-cols-5 gap-4">
          {/* Left: Inputs (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <PricingProductBlock input={input} onChange={handleChange} />
            <PricingLogisticsBlock input={input} result={result} onChange={handleChange} />
            <PricingCostsBlock input={input} onChange={handleChange} />
          </div>

          {/* Right: Results + Scenarios (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <PricingResultsBlock result={result} salePrice={input.salePrice} />
            <PricingScenariosBlock
              simulations={simulations}
              isLoading={isLoading}
              isAuthenticated={isAuthenticated}
              isSaving={isSaving}
              currentInput={input}
              currentResult={result}
              onSave={handleSave}
              onLoad={handleLoad}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onCompare={handleCompare}
            />
          </div>
        </div>

        {/* Variations */}
        {input.salePrice > 0 && (
          <PricingVariationsBlock baseInput={input} baseResult={result} />
        )}

        {/* Disclaimer */}
        <Alert variant="default" className="bg-muted/50 border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            {t('pricing.disclaimer_full', 'Os valores apresentados são estimativas baseadas nas regras vigentes do Mercado Livre. O frete pode variar conforme medição final do pacote e as regras podem ser alteradas pela plataforma a qualquer momento. Simulação para MercadoLíder / reputação verde.')}
          </AlertDescription>
        </Alert>
      </div>
    </PageContainer>
  );
}
