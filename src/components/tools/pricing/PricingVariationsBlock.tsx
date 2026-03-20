import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Plus, X } from "lucide-react";
import { calculateSimulation, compareSimulations, type SimulationInput, type SimulationResult, type ComparisonDiff } from "@/lib/pricing-engine";

interface Variation {
  id: string;
  label: string;
  type: 'price_increase' | 'price_percent' | 'weight_increase' | 'listing_change';
  value: number | string;
  result: SimulationResult;
  diff: ComparisonDiff;
}

interface Props {
  baseInput: SimulationInput;
  baseResult: SimulationResult;
}

export function PricingVariationsBlock({ baseInput, baseResult }: Props) {
  const { t } = useTranslation('tools');
  const [variations, setVariations] = useState<Variation[]>([]);
  const [varType, setVarType] = useState<string>('price_increase');
  const [varValue, setVarValue] = useState<string>('');

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtDiff = (v: number) => `${v > 0 ? '+' : ''}${fmt(v)}`;

  const addVariation = () => {
    if (!varValue || baseInput.salePrice <= 0) return;
    const numVal = parseFloat(varValue) || 0;
    if (numVal === 0) return;

    let modifiedInput = { ...baseInput };
    let label = '';

    switch (varType) {
      case 'price_increase':
        modifiedInput.salePrice = baseInput.salePrice + numVal;
        label = `Preço ${fmtDiff(numVal)}`;
        break;
      case 'price_percent':
        modifiedInput.salePrice = baseInput.salePrice * (1 + numVal / 100);
        label = `Preço ${numVal > 0 ? '+' : ''}${numVal}%`;
        break;
      case 'weight_increase':
        modifiedInput.weightKg = baseInput.weightKg + numVal;
        label = `Peso +${numVal} kg`;
        break;
      case 'listing_change':
        modifiedInput.listingType = baseInput.listingType === 'gold_pro' ? 'gold_special' : 'gold_pro';
        label = `Tipo → ${modifiedInput.listingType === 'gold_pro' ? 'Premium' : 'Clássico'}`;
        break;
    }

    const result = calculateSimulation(modifiedInput);
    const diff = compareSimulations(baseResult, result);

    setVariations(prev => [...prev, {
      id: crypto.randomUUID(),
      label,
      type: varType as Variation['type'],
      value: numVal,
      result,
      diff,
    }]);
    setVarValue('');
  };

  const removeVariation = (id: string) => {
    setVariations(prev => prev.filter(v => v.id !== id));
  };

  const isListingChange = varType === 'listing_change';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="w-4 h-4 text-primary" />
          {t('pricing.block_variations', 'Simulação de variações')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add variation */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">{t('pricing.variation_type', 'Tipo de variação')}</Label>
            <Select value={varType} onValueChange={setVarType}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price_increase">{t('pricing.var_price_increase', 'Aumento de preço (R$)')}</SelectItem>
                <SelectItem value="price_percent">{t('pricing.var_price_percent', 'Aumento de preço (%)')}</SelectItem>
                <SelectItem value="weight_increase">{t('pricing.var_weight_increase', 'Aumento de peso (kg)')}</SelectItem>
                <SelectItem value="listing_change">{t('pricing.var_listing_change', 'Alterar tipo de anúncio')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!isListingChange && (
            <div className="w-28 space-y-1.5">
              <Label className="text-xs">{t('pricing.value', 'Valor')}</Label>
              <Input
                type="number"
                value={varValue}
                onChange={e => setVarValue(e.target.value)}
                className="h-9"
                placeholder="0"
                step={varType === 'weight_increase' ? '0.1' : '1'}
              />
            </div>
          )}
          <Button 
            size="sm" 
            onClick={addVariation} 
            disabled={!isListingChange && !varValue}
            className="h-9 gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('pricing.add', 'Adicionar')}
          </Button>
        </div>

        {/* Variations list */}
        {variations.length > 0 && (
          <div className="space-y-2">
            {variations.map(v => (
              <div key={v.id} className="p-3 border rounded-lg bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-xs">{v.label}</Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeVariation(v.id)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">{t('pricing.result_freight', 'Frete')}</p>
                    <p className={v.diff.freightDiff > 0 ? 'text-red-600 font-medium' : v.diff.freightDiff < 0 ? 'text-emerald-600 font-medium' : ''}>
                      {fmtDiff(v.diff.freightDiff)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('pricing.result_commission', 'Comissão')}</p>
                    <p className={v.diff.commissionDiff > 0 ? 'text-red-600 font-medium' : v.diff.commissionDiff < 0 ? 'text-emerald-600 font-medium' : ''}>
                      {fmtDiff(v.diff.commissionDiff)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('pricing.result_profit')}</p>
                    <p className={v.diff.profitDiff >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                      {fmtDiff(v.diff.profitDiff)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('pricing.result_margin')}</p>
                    <p className={v.diff.marginDiff >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                      {v.diff.marginDiff > 0 ? '+' : ''}{v.diff.marginDiff.toFixed(1)}pp
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('pricing.result_net_received', 'Líquido')}</p>
                    <p className={v.diff.netReceivedDiff >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                      {fmtDiff(v.diff.netReceivedDiff)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
