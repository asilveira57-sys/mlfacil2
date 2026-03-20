import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Truck, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SimulationInput, SimulationResult } from "@/lib/pricing-engine";

interface Props {
  input: SimulationInput;
  result: SimulationResult;
  onChange: (field: keyof SimulationInput, value: number) => void;
}

export function PricingLogisticsBlock({ input, result, onChange }: Props) {
  const { t } = useTranslation('tools');
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtKg = (v: number) => `${v.toFixed(3)} kg`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="w-4 h-4 text-primary" />
          {t('pricing.block_logistics', 'Logística')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="weightKg">{t('pricing.weight', 'Peso (kg)')}</Label>
            <Input
              id="weightKg"
              type="number"
              value={input.weightKg || ''}
              onChange={e => onChange('weightKg', parseFloat(e.target.value) || 0)}
              placeholder="0,000"
              min={0}
              step={0.001}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="heightCm">{t('pricing.height', 'Altura (cm)')}</Label>
            <Input
              id="heightCm"
              type="number"
              value={input.heightCm || ''}
              onChange={e => onChange('heightCm', parseFloat(e.target.value) || 0)}
              placeholder="0"
              min={0}
              step={0.1}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="widthCm">{t('pricing.width', 'Largura (cm)')}</Label>
            <Input
              id="widthCm"
              type="number"
              value={input.widthCm || ''}
              onChange={e => onChange('widthCm', parseFloat(e.target.value) || 0)}
              placeholder="0"
              min={0}
              step={0.1}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lengthCm">{t('pricing.length', 'Comprimento (cm)')}</Label>
            <Input
              id="lengthCm"
              type="number"
              value={input.lengthCm || ''}
              onChange={e => onChange('lengthCm', parseFloat(e.target.value) || 0)}
              placeholder="0"
              min={0}
              step={0.1}
            />
          </div>
        </div>

        {/* Calculated logistics info */}
        {(input.weightKg > 0 || input.salePrice > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t">
            <TooltipProvider>
              <div className="text-center p-2 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  {t('pricing.volumetric_weight', 'Peso volumétrico')}
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3 h-3" /></TooltipTrigger>
                    <TooltipContent><p>(A × L × C) / 6000</p></TooltipContent>
                  </Tooltip>
                </p>
                <p className="text-sm font-medium">{fmtKg(result.volumetricWeightKg)}</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  {t('pricing.effective_weight', 'Peso considerado')}
                </p>
                <p className="text-sm font-medium">{fmtKg(result.effectiveWeightKg)}</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  {t('pricing.weight_band', 'Faixa de peso')}
                </p>
                <Badge variant="outline" className="text-xs mt-0.5">{result.weightBand || '—'}</Badge>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  {t('pricing.freight_estimated', 'Frete estimado')}
                </p>
                <p className="text-sm font-bold text-primary">{fmt(result.freightValue)}</p>
              </div>
            </TooltipProvider>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
