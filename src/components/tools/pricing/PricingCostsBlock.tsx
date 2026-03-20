import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins } from "lucide-react";
import type { SimulationInput } from "@/lib/pricing-engine";

interface Props {
  input: SimulationInput;
  onChange: (field: keyof SimulationInput, value: number) => void;
}

export function PricingCostsBlock({ input, onChange }: Props) {
  const { t } = useTranslation('tools');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="w-4 h-4 text-primary" />
          {t('pricing.block_costs', 'Custos adicionais')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="packagingCost">{t('pricing.packaging_cost')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                id="packagingCost"
                type="number"
                value={input.packagingCost || ''}
                onChange={e => onChange('packagingCost', parseFloat(e.target.value) || 0)}
                className="pl-10"
                placeholder="0,00"
                min={0}
                step={0.01}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="otherCosts">{t('pricing.other_costs')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                id="otherCosts"
                type="number"
                value={input.otherCosts || ''}
                onChange={e => onChange('otherCosts', parseFloat(e.target.value) || 0)}
                className="pl-10"
                placeholder="0,00"
                min={0}
                step={0.01}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
