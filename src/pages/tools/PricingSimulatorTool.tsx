import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ToolsLayout } from "./ToolsLayout";
import { ToolsNavTabs, ToolsPromoCard } from "@/components/tools";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Info, RotateCcw } from "lucide-react";
import {
  PricingProductBlock,
  PricingLogisticsBlock,
  PricingCostsBlock,
  PricingResultsBlock,
  PricingVariationsBlock,
} from "@/components/tools/pricing";
import { calculateSimulation, DEFAULT_INPUT, type SimulationInput } from "@/lib/pricing-engine";

export default function PricingSimulatorTool() {
  const { t } = useTranslation('tools');
  const [input, setInput] = useState<SimulationInput>({ ...DEFAULT_INPUT });

  // Auto-calculate on every input change
  const result = useMemo(() => calculateSimulation(input), [input]);

  const handleChange = useCallback((field: keyof SimulationInput, value: string | number) => {
    setInput(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setInput({ ...DEFAULT_INPUT });
  }, []);

  return (
    <ToolsLayout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              {t('pricing.title')}
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              {t('pricing.subtitle')}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2 shrink-0">
            <RotateCcw className="w-4 h-4" />
            {t('pricing.btn_reset')}
          </Button>
        </div>

        {/* Navigation Tabs */}
        <ToolsNavTabs />

        {/* Main Content - 2 columns */}
        <div className="grid lg:grid-cols-5 gap-4">
          {/* Left: Inputs (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <PricingProductBlock input={input} onChange={handleChange} />
            <PricingLogisticsBlock input={input} result={result} onChange={handleChange} />
            <PricingCostsBlock input={input} onChange={handleChange} />
          </div>

          {/* Right: Results + CTA (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <PricingResultsBlock result={result} salePrice={input.salePrice} />

            {/* CTA suave para planos */}
            <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-accent/10 p-5 text-center space-y-3">
              <p className="text-sm font-medium text-foreground">
                💾 Quer salvar e comparar simulações?
              </p>
              <p className="text-xs text-muted-foreground">
                Com um plano ativo você pode salvar cenários, comparar lado a lado e acessar de qualquer dispositivo.
              </p>
              <a href="/planos">
                <Button variant="outline" size="sm" className="mt-1">
                  Conheça nossos planos
                </Button>
              </a>
            </div>
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

        {/* Promo Card */}
        <ToolsPromoCard />
      </div>
    </ToolsLayout>
  );
}
